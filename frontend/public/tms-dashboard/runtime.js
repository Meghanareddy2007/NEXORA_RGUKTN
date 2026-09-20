/* ============================================================
   TMS RUNTIME CONFIG
   ------------------------------------------------------------
   Everything the dashboard talks to is declared here.
   1. API_BASE -> your RailOps/NEXORA backend (network + trains)
   2. If it is unreachable the dashboard keeps running on its own
      deterministic simulation, and writes are queued locally
      (in this browser) until the connection comes back.
   ============================================================ */
window.TMS_CONFIG = {
  API_BASE: "http://localhost:8000",
  POLL_MS: 4000,
  OFFLINE_SIMULATION: true,
  DIVISION: "SBC-SA",
  REPORTER: (typeof window !== "undefined" && window.__TMS_REPORTER__) || "R. Kannan",
};

/* Allow an API override via ?api=... for demos */
(function readOverrides(){
  try{
    const q = new URLSearchParams(location.search);
    if(q.get("api")) window.TMS_CONFIG.API_BASE = q.get("api");
  }catch(e){}
})();
/* ============================================================
   NX — API CLIENT
   Thin wrapper over the NEXORA REST endpoints. Every call
   resolves to {ok, data, source} so callers never have to
   branch on network failures.
   ============================================================ */
const NX = (function(){
  const C = window.TMS_CONFIG;
  let online = null;               // null = not yet probed
  const listeners = [];

  function setOnline(v){
    if(online === v) return;
    online = v;
    listeners.forEach(fn => { try{ fn(v); }catch(e){} });
  }

  async function call(path, opts={}){
    const url = C.API_BASE.replace(/\/$/,"") + path;
    const ctrl = new AbortController();
    const timer = setTimeout(()=>ctrl.abort(), opts.timeout || 6000);
    try{
      const res = await fetch(url, {
        method: opts.method || "GET",
        headers: { "Content-Type":"application/json", ...(opts.headers||{}) },
        body: opts.body ? JSON.stringify(opts.body) : undefined,
        signal: ctrl.signal,
      });
      clearTimeout(timer);
      if(!res.ok) throw new Error("HTTP " + res.status);
      const data = await res.json();
      setOnline(true);
      return { ok:true, data, source:"api" };
    }catch(err){
      clearTimeout(timer);
      setOnline(false);
      return { ok:false, error:String(err && err.message || err), source:"offline" };
    }
  }

  return {
    onStatus(fn){ listeners.push(fn); if(online!==null) fn(online); },
    isOnline(){ return online === true; },

    /* --- network topology: stations, corridors, track counts --- */
    network(){ return call("/api/network"); },
    stations(){ return call("/api/stations"); },
    routes(){ return call("/api/routes"); },

    /* --- live movement --- */
    trains(){ return call("/api/trains"); },
    liveState(){ return call("/api/live/state", { timeout:4000 }); },
    simulationState(){ return call("/api/simulation/state", { timeout:4000 }); },

    /* --- assets & maintenance --- */
    assets(){ return call("/api/plan/assets"); },
    maintenanceBlocks(){ return call("/api/maintenance-blocks"); },
    routeStatus(){ return call("/api/route-status"); },
    alerts(){ return call("/api/alerts"); },

    /* --- writes --- */
    createRequest(payload){
      return call("/api/plan/requests", { method:"POST", body:payload, timeout:9000 });
    },
    persistTmsRecord(table, row){
      return call("/api/tms/records", { method:"POST", body:{table, row}, timeout:9000 });
    },
    readTmsRecords(table){
      return call("/api/tms/records?table=" + encodeURIComponent(table), { timeout:9000 });
    },
    emergencyBlock(payload){
      return call("/api/simulation/emergency-block", { method:"POST", body:payload });
    },
    predictPriority(payload){
      return call("/api/ai/predict-priority", { method:"POST", body:payload });
    },
  };
})();
/* ============================================================
   DB — LOCAL PERSISTENCE
   Supabase has been removed. Maintenance reports and breakdown
   escalations are written to localStorage on this device instead.
   The interface (insert/select/flush/subscribe/pending/configured)
   is kept identical so the rest of the app needs no changes.
   Swap this module out for your own backend call when ready.
   ============================================================ */
const DB = (function(){
  const QUEUE_KEY = "tms-write-queue";
  function readQueue(){ try{ return JSON.parse(localStorage.getItem(QUEUE_KEY) || "[]"); }catch(e){ return []; } }
  function writeQueue(rows){ try{ localStorage.setItem(QUEUE_KEY, JSON.stringify(rows.slice(-200))); }catch(e){} }
  function enqueue(table,row){ const q=readQueue(); q.push({table,row,queued_at:new Date().toISOString()}); writeQueue(q); return q.length; }
  async function insert(table,row){
    const r = await NX.persistTmsRecord(table,row);
    if(r.ok) return {ok:true,data:r.data};
    const n=enqueue(table,row); return {ok:false,queued:true,pending:n,reason:r.error||"backend-unreachable"};
  }
  async function flush(){
    const q=readQueue(), remain=[], sent=[];
    for(const item of q){ const r=await NX.persistTmsRecord(item.table,item.row); if(r.ok) sent.push(item); else remain.push(item); }
    writeQueue(remain); return {flushed:sent.length,pending:remain.length};
  }
  async function select(table){ const r=await NX.readTmsRecords(table); return r.ok?{ok:true,data:r.data}:{ok:false,data:[],reason:r.error}; }
  function subscribe(){ return null; }
  return {get configured(){return true;},get connected(){return NX.isOnline();},insert,select,flush,subscribe,pending(){return readQueue().length;}};
})();
/* ============================================================
   RailGL — 3D network map
   ------------------------------------------------------------
   Renders the Jolarpettai–Salem–Bengaluru network as a navigable
   3D map: terrain, track ribbons weighted by track count, lit
   stations, moving trains, and maintenance blocks sitting on the
   section they occupy.

   Data comes from the NEXORA API when it is reachable
   (/api/network, /api/trains, /api/live/state). When it is not,
   the module runs its own deterministic simulation from the same
   corridor table, so the map is never blank.
   ============================================================ */
const RailGL = (function(){

  /* ---------- geography: real coordinates, so the map reads like a map ---------- */
  const STATION_GEO = {
    Chennai_Central:   { lat:13.0827, lon:80.2750, tier:1 },
    Arakkonam:         { lat:13.0847, lon:79.6700, tier:2 },
    Katpadi:           { lat:12.9700, lon:79.1400, tier:1 },
    Vellore:           { lat:12.9165, lon:79.1325, tier:3 },
    Vaniyambadi:       { lat:12.6819, lon:78.6200, tier:3 },
    Jolarpettai:       { lat:12.5700, lon:78.5700, tier:1 },
    Bangarapet:        { lat:12.9900, lon:78.1800, tier:2 },
    Krishnarajapuram:  { lat:12.9950, lon:77.6780, tier:2 },
    Bengaluru_City:    { lat:12.9770, lon:77.5700, tier:1 },
    Hosur:             { lat:12.7400, lon:77.8300, tier:3 },
    Dharmapuri:        { lat:12.1270, lon:78.1600, tier:3 },
    Salem:             { lat:11.6640, lon:78.1460, tier:1 },
    Erode:             { lat:11.3410, lon:77.7170, tier:2 },
    Tiruppur:          { lat:11.1085, lon:77.3410, tier:3 },
    Coimbatore:        { lat:11.0168, lon:76.9558, tier:1 },
    Karur:             { lat:10.9570, lon:78.0800, tier:3 },
    Tiruchirappalli:   { lat:10.7905, lon:78.7047, tier:1 },
    Dindigul:          { lat:10.3670, lon:77.9800, tier:3 },
  };

  /* corridor table — mirrors backend/data/RAILWAY_NETWORK.csv */
  const CORRIDOR_TABLE = [
    ["COR_01","Chennai_Central","Arakkonam",69,4,"Triple","High"],
    ["COR_02","Arakkonam","Katpadi",61,2,"Double","High"],
    ["COR_03","Katpadi","Vellore",12,2,"Double","Med"],
    ["COR_04","Katpadi","Vaniyambadi",57,2,"Double","High"],
    ["COR_05","Vaniyambadi","Jolarpettai",26,2,"Double","High"],
    ["COR_06","Jolarpettai","Bangarapet",71,2,"Double","Med"],
    ["COR_07","Bangarapet","Krishnarajapuram",56,2,"Double","High"],
    ["COR_08","Krishnarajapuram","Bengaluru_City",14,3,"Triple","High"],
    ["COR_09","Bengaluru_City","Hosur",52,1,"Single","Med"],
    ["COR_10","Hosur","Dharmapuri",92,1,"Single","Med"],
    ["COR_11","Dharmapuri","Salem",63,1,"Single","Med"],
    ["COR_12","Jolarpettai","Salem",120,2,"Double","High"],
    ["COR_13","Salem","Erode",63,2,"Double","High"],
    ["COR_14","Salem","Karur",85,1,"Single","Med"],
    ["COR_15","Karur","Erode",65,1,"Single","Med"],
    ["COR_16","Erode","Tiruppur",50,2,"Double","High"],
    ["COR_17","Tiruppur","Coimbatore",50,2,"Double","High"],
    ["COR_18","Karur","Tiruchirappalli",78,2,"Double","Med"],
    ["COR_19","Karur","Dindigul",74,1,"Single","Low"],
    ["COR_20","Erode","Dindigul",108,1,"Single","Low"],
  ];

  /* ---------- projection ---------- */
  const LAT0 = 12.0, LON0 = 78.2, SCALE = 26;
  function project(lat, lon){
    return {
      x: (lon - LON0) * SCALE * Math.cos(LAT0 * Math.PI/180),
      z: -(lat - LAT0) * SCALE,
    };
  }

  /* ---------- palette pulled from the live stylesheet ---------- */
  function cssVar(name, fallback){
    try{
      const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
      return v || fallback;
    }catch(e){ return fallback; }
  }
  function palette(){
    return {
      sky:    new THREE.Color(cssVar("--map-sky","#080C16")),
      ground: new THREE.Color(cssVar("--map-ground","#0B111E")),
      grid:   new THREE.Color(cssVar("--map-grid","#1B2739")),
      cyan:   new THREE.Color(cssVar("--copper","#06B6D4")),
      green:  new THREE.Color(cssVar("--green","#22C55E")),
      amber:  new THREE.Color(cssVar("--amber","#F59E0B")),
      red:    new THREE.Color(cssVar("--red","#F43F5E")),
      text:   cssVar("--text","#F8FAFC"),
      faint:  cssVar("--text-faint","#64748B"),
      surface:cssVar("--surface","#0F1524"),
    };
  }

  /* ---------- module state ---------- */
  let renderer, scene, camera, raf = null, host = null, canvas = null;
  let PAL, clock;
  let trackGroup, stationGroup, trainGroup, blockGroup, labelGroup;
  let corridors = [];          // {id, from, to, curve, km, tracks, status, mesh[]}
  let stations = {};           // name -> {pos, mesh, tier}
  let trains = [];             // {id, corridorId, t, dir, speed, group, kind, delay}
  let blocks = [];             // {id, corridorId, atKm, mesh, label}
  let pickTargets = [];
  let ro = null, pollTimer = null;

  const sim = {
    playing: true,
    speed: 1,
    labels: true,
    showBlocks: true,
    selected: null,          // {type:'train'|'station'|'block', id}
    liveSource: "sim",       // 'api' | 'sim'
    onSelect: null,
    onStats: null,
  };

  /* camera orbit state */
  const cam = { theta: -0.62, phi: 0.92, dist: 46, target: null };

  /* ============================================================
     SCENE CONSTRUCTION
     ============================================================ */

  function buildScene(){
    PAL = palette();
    scene = new THREE.Scene();
    scene.background = PAL.sky;
    scene.fog = new THREE.Fog(PAL.sky, 70, 190);

    camera = new THREE.PerspectiveCamera(46, 1, 0.5, 600);
    if(!cam.target) cam.target = new THREE.Vector3(45, 0, 25);
    updateCamera();

    /* lighting: cool ambient + a warm key so rolling stock reads as solid */
    scene.add(new THREE.AmbientLight(0x93a7c4, 0.72));
    const key = new THREE.DirectionalLight(0xffffff, 0.85);
    key.position.set(24, 40, 18);
    scene.add(key);
    const rim = new THREE.DirectionalLight(PAL.cyan.getHex(), 0.4);
    rim.position.set(-26, 14, -22);
    scene.add(rim);

    /* ground */
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(320, 320),
      new THREE.MeshLambertMaterial({ color: PAL.ground })
    );
    ground.rotation.x = -Math.PI/2;
    ground.position.y = -0.35;
    scene.add(ground);

    const grid = new THREE.GridHelper(320, 64, PAL.grid.getHex(), PAL.grid.getHex());
    grid.position.y = -0.3;
    grid.material.opacity = 0.34;
    grid.material.transparent = true;
    scene.add(grid);

    trackGroup   = new THREE.Group(); scene.add(trackGroup);
    stationGroup = new THREE.Group(); scene.add(stationGroup);
    blockGroup   = new THREE.Group(); scene.add(blockGroup);
    trainGroup   = new THREE.Group(); scene.add(trainGroup);
    labelGroup   = new THREE.Group(); scene.add(labelGroup);

    buildStations();
    buildCorridors();
  }

  function stationPos(name){
    const g = STATION_GEO[name];
    if(!g) return new THREE.Vector3(0,0,0);
    const p = project(g.lat, g.lon);
    return new THREE.Vector3(p.x, 0, p.z);
  }

  function buildStations(){
    Object.keys(STATION_GEO).forEach(name => {
      const g = STATION_GEO[name];
      const pos = stationPos(name);
      const major = g.tier === 1;
      const r = major ? 0.72 : g.tier === 2 ? 0.55 : 0.42;

      const grp = new THREE.Group();
      grp.position.copy(pos);

      /* platform disc */
      const disc = new THREE.Mesh(
        new THREE.CylinderGeometry(r, r * 1.14, 0.18, 22),
        new THREE.MeshLambertMaterial({ color: major ? 0x1d3550 : 0x16263c })
      );
      disc.position.y = 0.09;
      grp.add(disc);

      /* signal pillar — brighter for junctions */
      const pillar = new THREE.Mesh(
        new THREE.CylinderGeometry(0.075, 0.075, major ? 2.3 : 1.5, 8),
        new THREE.MeshBasicMaterial({ color: PAL.cyan, transparent:true, opacity: major ? 0.85 : 0.5 })
      );
      pillar.position.y = (major ? 2.3 : 1.5)/2 + 0.18;
      grp.add(pillar);

      /* pick target (invisible, generous) */
      const hit = new THREE.Mesh(
        new THREE.SphereGeometry(1.35, 8, 8),
        new THREE.MeshBasicMaterial({ visible:false })
      );
      hit.position.y = 0.8;
      hit.userData = { pick:"station", id:name };
      grp.add(hit);
      pickTargets.push(hit);

      stationGroup.add(grp);

      const label = makeLabel(prettyStation(name), major ? 15 : 13, major ? PAL.text : PAL.faint);
      label.position.copy(pos);
      label.position.y = major ? 3.1 : 2.2;
      labelGroup.add(label);

      stations[name] = { pos, group: grp, tier: g.tier, pillar, disc, label };
    });
  }

  /* gentle arc so parallel corridors don't overlap into one line */
  function corridorCurve(a, b, bow){
    const mid = a.clone().add(b).multiplyScalar(0.5);
    const dir = b.clone().sub(a);
    const len = dir.length();
    const perp = new THREE.Vector3(-dir.z, 0, dir.x).normalize();
    mid.add(perp.multiplyScalar(bow * len * 0.12));
    mid.y = 0.05 + Math.min(1.6, len * 0.035);   // slight lift = terrain relief
    return new THREE.QuadraticBezierCurve3(a.clone(), mid, b.clone());
  }

  function buildCorridors(){
    const seen = {};
    CORRIDOR_TABLE.forEach(row => {
      const [id, from, to, km, tracks, type, traffic] = row;
      const a = stationPos(from), b = stationPos(to);

      /* alternate the bow so double connections separate visually */
      const key = [from,to].sort().join("|");
      seen[key] = (seen[key] || 0) + 1;
      const bow = (seen[key] % 2 ? 1 : -1) * (0.35 + 0.22 * ((id.charCodeAt(5)) % 3));

      const curve = corridorCurve(a, b, bow);
      const status = "Healthy";
      const meshes = [];

      /* one ribbon per running line, offset sideways */
      const lanes = Math.min(tracks, 3);
      for(let i=0;i<lanes;i++){
        const offset = (i - (lanes-1)/2) * 0.17;
        const shifted = shiftCurve(curve, offset, 48);
        const geo = new THREE.TubeGeometry(shifted, 40, 0.062, 6, false);
        const mat = new THREE.MeshBasicMaterial({ color: PAL.green, transparent:true, opacity:0.92 });
        const mesh = new THREE.Mesh(geo, mat);
        trackGroup.add(mesh);
        meshes.push(mesh);
      }

      /* a wider, dim halo so high-traffic corridors read heavier */
      const halo = new THREE.Mesh(
        new THREE.TubeGeometry(curve, 40, traffic === "High" ? 0.20 : 0.14, 6, false),
        new THREE.MeshBasicMaterial({ color: PAL.green, transparent:true, opacity: traffic === "High" ? 0.14 : 0.07 })
      );
      trackGroup.add(halo);

      /* pick target along the section */
      const hit = new THREE.Mesh(
        new THREE.TubeGeometry(curve, 16, 0.5, 4, false),
        new THREE.MeshBasicMaterial({ visible:false })
      );
      hit.userData = { pick:"corridor", id };
      trackGroup.add(hit);
      pickTargets.push(hit);

      corridors.push({ id, from, to, km, tracks, type, traffic, curve, meshes, halo, status });
    });
  }

  function shiftCurve(curve, offset, seg){
    if(Math.abs(offset) < 0.001) return curve;
    const pts = [];
    for(let i=0;i<=seg;i++){
      const t = i/seg;
      const p = curve.getPoint(t);
      const tan = curve.getTangent(t);
      const perp = new THREE.Vector3(-tan.z, 0, tan.x).normalize();
      pts.push(p.clone().add(perp.multiplyScalar(offset)));
    }
    return new THREE.CatmullRomCurve3(pts);
  }

  function prettyStation(n){ return n.replace(/_/g," "); }

  /* ---------- canvas-texture labels (no external CSS2D dependency) ---------- */
  function makeLabel(text, size, color){
    const pad = 8, font = `600 ${size*2}px 'IBM Plex Sans', sans-serif`;
    const c = document.createElement("canvas");
    const ctx = c.getContext("2d");
    ctx.font = font;
    const w = Math.ceil(ctx.measureText(text).width) + pad*2;
    const h = size*2 + pad*2;
    c.width = w; c.height = h;
    const g = c.getContext("2d");
    g.font = font;
    g.fillStyle = "rgba(8,12,22,.72)";
    roundRect(g, 0, 0, w, h, 7); g.fill();
    g.fillStyle = typeof color === "string" ? color : "#F8FAFC";
    g.textBaseline = "middle";
    g.fillText(text, pad, h/2 + 1);

    const tex = new THREE.CanvasTexture(c);
    tex.minFilter = THREE.LinearFilter;
    const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map:tex, transparent:true, depthTest:false }));
    spr.scale.set(w/height2Scale(size), h/height2Scale(size), 1);
    spr.renderOrder = 10;
    return spr;
  }
  function height2Scale(size){ return 60; }
  function roundRect(ctx,x,y,w,h,r){
    ctx.beginPath();
    ctx.moveTo(x+r,y);
    ctx.arcTo(x+w,y,x+w,y+h,r);
    ctx.arcTo(x+w,y+h,x,y+h,r);
    ctx.arcTo(x,y+h,x,y,r);
    ctx.arcTo(x,y,x+w,y,r);
    ctx.closePath();
  }

  /* ============================================================
     ROLLING STOCK
     ============================================================ */
  const TRAIN_KINDS = {
    Express:   { color:0xE2E8F0, accent:0x06B6D4, coaches:4, speed:1.00 },
    Passenger: { color:0xB6C2D2, accent:0x38BDF8, coaches:3, speed:0.72 },
    Freight:   { color:0x8A6F4E, accent:0xF59E0B, coaches:5, speed:0.52 },
    Tower:     { color:0xF59E0B, accent:0xFDE68A, coaches:1, speed:0.60 },
  };

  function buildTrainMesh(kind){
    const spec = TRAIN_KINDS[kind] || TRAIN_KINDS.Express;
    const g = new THREE.Group();

    /* locomotive */
    const loco = new THREE.Mesh(
      new THREE.BoxGeometry(0.62, 0.30, 0.28),
      new THREE.MeshLambertMaterial({ color: spec.accent })
    );
    loco.position.y = 0.22;
    g.add(loco);

    /* cab roof */
    const roof = new THREE.Mesh(
      new THREE.BoxGeometry(0.34, 0.10, 0.24),
      new THREE.MeshLambertMaterial({ color: 0x0F1524 })
    );
    roof.position.set(-0.04, 0.41, 0);
    g.add(roof);

    /* pantograph — this is a track dashboard, it should be visible */
    const pan = new THREE.Mesh(
      new THREE.BoxGeometry(0.02, 0.16, 0.20),
      new THREE.MeshBasicMaterial({ color: 0x64748B })
    );
    pan.position.set(0.06, 0.53, 0);
    g.add(pan);

    /* headlight */
    const lamp = new THREE.Mesh(
      new THREE.SphereGeometry(0.055, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0xFFF6D8 })
    );
    lamp.position.set(0.33, 0.22, 0);
    g.add(lamp);

    /* coaches */
    for(let i=1;i<=spec.coaches;i++){
      const car = new THREE.Mesh(
        new THREE.BoxGeometry(0.50, 0.24, 0.26),
        new THREE.MeshLambertMaterial({ color: spec.color })
      );
      car.position.set(-0.60 * i, 0.20, 0);
      g.add(car);
    }

    const hit = new THREE.Mesh(
      new THREE.BoxGeometry(0.62 + 0.60*spec.coaches, 0.9, 0.9),
      new THREE.MeshBasicMaterial({ visible:false })
    );
    hit.position.set(-0.30 * spec.coaches, 0.3, 0);
    g.add(hit);

    return { group:g, hit, spec };
  }

  const TRAIN_SEED = [
    ["12658","Express","COR_12",0.10,1],  ["12007","Express","COR_02",0.42,1],
    ["16022","Passenger","COR_06",0.70,-1],["12675","Express","COR_13",0.25,1],
    ["56512","Passenger","COR_07",0.55,-1],["FRT41","Freight","COR_16",0.15,1],
    ["12680","Express","COR_01",0.80,-1], ["FRT77","Freight","COR_18",0.35,1],
    ["16536","Passenger","COR_09",0.60,1],["TWR09","Tower","COR_05",0.45,-1],
    ["12673","Express","COR_14",0.30,1],  ["56724","Passenger","COR_11",0.65,-1],
  ];

  function buildTrains(){
    TRAIN_SEED.forEach(([id, kind, corridorId, t, dir]) => {
      const cor = corridors.find(c => c.id === corridorId) || corridors[0];
      const { group, hit, spec } = buildTrainMesh(kind);
      hit.userData = { pick:"train", id };
      pickTargets.push(hit);
      trainGroup.add(group);

      const label = makeLabel(id, 11, "#E2E8F0");
      label.visible = false;
      labelGroup.add(label);

      trains.push({
        id, kind, corridorId, t, dir,
        speedFactor: spec.speed,
        group, label,
        delay: Math.round(Math.random()*14),
        holding: 0,
      });
    });
  }

  function advanceTrains(dt){
    trains.forEach(tr => {
      const cor = corridors.find(c => c.id === tr.corridorId);
      if(!cor) return;

      if(tr.holding > 0){
        tr.holding -= dt;
      } else {
        /* a blocked section makes the train wait at its edge */
        const blocked = sim.showBlocks && blocks.some(b => b.corridorId === cor.id && b.active);
        const speed = (blocked ? 0.12 : 1) * tr.speedFactor * 0.055 * (120 / Math.max(28, cor.km));
        tr.t += tr.dir * speed * dt * sim.speed;
      }

      if(tr.t > 1 || tr.t < 0){
        /* reached a station: dwell, then take an onward corridor */
        const arrived = tr.t > 1 ? cor.to : cor.from;
        tr.t = Math.max(0, Math.min(1, tr.t));
        tr.holding = 0.9 + Math.random()*1.4;

        const onward = corridors.filter(c =>
          (c.from === arrived || c.to === arrived) && c.id !== cor.id);
        if(onward.length){
          const next = onward[Math.floor(Math.random()*onward.length)];
          tr.corridorId = next.id;
          if(next.from === arrived){ tr.t = 0.001; tr.dir = 1; }
          else { tr.t = 0.999; tr.dir = -1; }
        } else {
          tr.dir *= -1;   /* terminus: reverse */
        }
      }

      const c2 = corridors.find(c => c.id === tr.corridorId);
      if(!c2) return;
      const t = Math.max(0.0005, Math.min(0.9995, tr.t));
      const p = c2.curve.getPoint(t);
      const ahead = c2.curve.getPoint(Math.min(0.999, Math.max(0.001, t + 0.01*tr.dir)));

      tr.group.position.set(p.x, p.y + 0.02, p.z);
      tr.group.lookAt(ahead.x, ahead.y + 0.02, ahead.z);
      tr.group.rotateY(-Math.PI/2);

      tr.label.position.set(p.x, p.y + 1.15, p.z);
      tr.label.visible = sim.labels && (sim.selected && sim.selected.type === "train" && sim.selected.id === tr.id
        ? true
        : cam.dist < 34);
    });
  }

  /* apply live positions coming from the backend instead of the local sim */
  function applyLiveTrains(list){
    if(!Array.isArray(list) || !list.length) return false;
    let matched = 0;
    list.forEach(row => {
      const id = String(row.train_id || row.id || row.number || "");
      const tr = trains.find(t => t.id === id);
      if(!tr) return;
      matched++;
      if(row.corridor_id && corridors.some(c => c.id === row.corridor_id)){
        tr.corridorId = row.corridor_id;
      }
      if(typeof row.progress === "number") tr.t = Math.max(0, Math.min(1, row.progress));
      if(typeof row.delay_min === "number") tr.delay = row.delay_min;
      if(typeof row.direction === "number") tr.dir = row.direction >= 0 ? 1 : -1;
    });
    return matched > 0;
  }

  /* ============================================================
     MAINTENANCE BLOCKS & SECTION HEALTH
     ============================================================ */
  function setCorridorStatus(corridorId, status){
    const cor = corridors.find(c => c.id === corridorId);
    if(!cor) return;
    cor.status = status;
    const col = status === "Blocked" ? PAL.red
              : status === "Attention" ? PAL.amber
              : status === "Selected" ? PAL.cyan
              : PAL.green;
    cor.meshes.forEach(m => m.material.color.copy(col));
    cor.halo.material.color.copy(col);
    cor.halo.material.opacity = status === "Healthy"
      ? (cor.traffic === "High" ? 0.14 : 0.07) : 0.26;
  }

  function setBlocks(list){
    /* clear */
    blocks.forEach(b => {
      blockGroup.remove(b.mesh);
      if(b.labelSprite) labelGroup.remove(b.labelSprite);
      const i = pickTargets.indexOf(b.hit); if(i>=0) pickTargets.splice(i,1);
    });
    blocks = [];
    corridors.forEach(c => setCorridorStatus(c.id, "Healthy"));

    (list || []).forEach(b => {
      const cor = corridors.find(c => c.id === b.corridorId);
      if(!cor) return;
      const t = Math.max(0.08, Math.min(0.92, (b.atKm != null ? b.atKm / cor.km : 0.5)));
      const p = cor.curve.getPoint(t);

      const sev = b.severity || "Blocked";
      const col = sev === "Attention" ? PAL.amber : PAL.red;

      const grp = new THREE.Group();
      grp.position.set(p.x, p.y, p.z);

      /* a translucent possession marker straddling the track */
      const slab = new THREE.Mesh(
        new THREE.BoxGeometry(1.0, 0.06, 1.0),
        new THREE.MeshBasicMaterial({ color: col, transparent:true, opacity:0.30 })
      );
      slab.position.y = 0.03;
      grp.add(slab);

      const beacon = new THREE.Mesh(
        new THREE.CylinderGeometry(0.05, 0.05, 1.5, 6),
        new THREE.MeshBasicMaterial({ color: col })
      );
      beacon.position.y = 0.78;
      grp.add(beacon);

      const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.5, 0.62, 26),
        new THREE.MeshBasicMaterial({ color: col, transparent:true, opacity:0.7, side:THREE.DoubleSide })
      );
      ring.rotation.x = -Math.PI/2;
      ring.position.y = 0.06;
      grp.add(ring);

      const hit = new THREE.Mesh(
        new THREE.SphereGeometry(0.9, 8, 8),
        new THREE.MeshBasicMaterial({ visible:false })
      );
      hit.position.y = 0.5;
      hit.userData = { pick:"block", id:b.id };
      grp.add(hit);
      pickTargets.push(hit);

      blockGroup.add(grp);

      const labelSprite = makeLabel(b.label || b.id, 11, sev === "Attention" ? "#F59E0B" : "#F43F5E");
      labelSprite.position.set(p.x, p.y + 1.9, p.z);
      labelGroup.add(labelSprite);

      blocks.push({ ...b, mesh:grp, ring, hit, labelSprite, active:true, severity:sev });
      setCorridorStatus(cor.id, sev === "Attention" ? "Attention" : "Blocked");
    });

    blockGroup.visible = sim.showBlocks;
  }

  /* ============================================================
     CAMERA + INPUT
     ============================================================ */
  function updateCamera(){
    if(!camera || !cam.target) return;
    cam.phi = Math.max(0.16, Math.min(1.45, cam.phi));
    cam.dist = Math.max(9, Math.min(120, cam.dist));
    const x = cam.target.x + cam.dist * Math.cos(cam.phi) * Math.sin(cam.theta);
    const y = cam.target.y + cam.dist * Math.sin(cam.phi);
    const z = cam.target.z + cam.dist * Math.cos(cam.phi) * Math.cos(cam.theta);
    camera.position.set(x,y,z);
    camera.lookAt(cam.target);
  }

  function bindInput(){
    let dragging = false, panning = false, lx = 0, ly = 0;
    let pinchDist = 0;

    canvas.addEventListener("pointerdown", e => {
      canvas.setPointerCapture(e.pointerId);
      dragging = true;
      panning = (e.button === 2 || e.shiftKey || e.button === 1);
      lx = e.clientX; ly = e.clientY;
    });
    canvas.addEventListener("pointermove", e => {
      if(!dragging) return;
      const dx = e.clientX - lx, dy = e.clientY - ly;
      lx = e.clientX; ly = e.clientY;
      if(panning){
        const right = new THREE.Vector3(Math.cos(cam.theta), 0, -Math.sin(cam.theta));
        const fwd   = new THREE.Vector3(Math.sin(cam.theta), 0, Math.cos(cam.theta));
        const k = cam.dist * 0.0016;
        cam.target.addScaledVector(right, -dx * k);
        cam.target.addScaledVector(fwd,   -dy * k);
      } else {
        cam.theta -= dx * 0.005;
        cam.phi   += dy * 0.004;
      }
      updateCamera();
    });
    const endDrag = e => { dragging = false; panning = false; };
    canvas.addEventListener("pointerup", endDrag);
    canvas.addEventListener("pointercancel", endDrag);
    canvas.addEventListener("contextmenu", e => e.preventDefault());

    canvas.addEventListener("wheel", e => {
      e.preventDefault();
      cam.dist *= (1 + Math.sign(e.deltaY) * 0.10);
      updateCamera();
    }, { passive:false });

    /* pinch zoom */
    canvas.addEventListener("touchmove", e => {
      if(e.touches.length !== 2) return;
      const d = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      if(pinchDist) { cam.dist *= pinchDist / d; updateCamera(); }
      pinchDist = d;
    }, { passive:true });
    canvas.addEventListener("touchend", () => { pinchDist = 0; });

    /* keyboard: the map must be usable without a mouse */
    canvas.tabIndex = 0;
    canvas.addEventListener("keydown", e => {
      const step = 0.12;
      if(e.key === "ArrowLeft")  cam.theta -= step;
      else if(e.key === "ArrowRight") cam.theta += step;
      else if(e.key === "ArrowUp")    cam.phi += 0.06;
      else if(e.key === "ArrowDown")  cam.phi -= 0.06;
      else if(e.key === "+" || e.key === "=") cam.dist *= 0.9;
      else if(e.key === "-") cam.dist *= 1.1;
      else if(e.key === " "){ sim.playing = !sim.playing; if(sim.onStats) sim.onStats(stats()); }
      else return;
      e.preventDefault();
      updateCamera();
    });

    /* click to select */
    const rc = new THREE.Raycaster();
    canvas.addEventListener("click", e => {
      const r = canvas.getBoundingClientRect();
      const m = new THREE.Vector2(
        ((e.clientX - r.left) / r.width) * 2 - 1,
        -((e.clientY - r.top) / r.height) * 2 + 1
      );
      rc.setFromCamera(m, camera);
      const hits = rc.intersectObjects(pickTargets, false);
      if(hits.length){
        const d = hits[0].object.userData;
        select(d.pick, d.id);
      } else {
        select(null, null);
      }
    });
  }

  function select(type, id){
    /* reset previous corridor highlight */
    corridors.forEach(c => {
      if(c.status === "Selected") setCorridorStatus(c.id, "Healthy");
    });
    blocks.forEach(b => { if(b.corridorId) setCorridorStatus(b.corridorId, b.severity === "Attention" ? "Attention" : "Blocked"); });

    sim.selected = type ? { type, id } : null;

    if(type === "train"){
      const tr = trains.find(t => t.id === id);
      if(tr) setCorridorStatus(tr.corridorId, "Selected");
    } else if(type === "corridor"){
      setCorridorStatus(id, "Selected");
    }

    if(sim.onSelect) sim.onSelect(describe(sim.selected));
  }

  function describe(sel){
    if(!sel) return null;
    if(sel.type === "train"){
      const tr = trains.find(t => t.id === sel.id);
      if(!tr) return null;
      const cor = corridors.find(c => c.id === tr.corridorId);
      return {
        type:"train", id:tr.id, kind:tr.kind,
        section: cor ? `${prettyStation(cor.from)} → ${prettyStation(cor.to)}` : "—",
        progress: Math.round(tr.t*100),
        km: cor ? Math.round(tr.t * cor.km) : 0,
        totalKm: cor ? cor.km : 0,
        delay: tr.delay,
        heading: tr.dir > 0 ? (cor ? prettyStation(cor.to) : "—") : (cor ? prettyStation(cor.from) : "—"),
      };
    }
    if(sel.type === "station"){
      const around = corridors.filter(c => c.from === sel.id || c.to === sel.id);
      const here = trains.filter(t => {
        const c = corridors.find(x => x.id === t.corridorId);
        return c && (c.from === sel.id || c.to === sel.id);
      });
      return {
        type:"station", id:sel.id, name:prettyStation(sel.id),
        lines: around.length,
        tracks: Math.max(...around.map(c=>c.tracks), 0),
        approaching: here.length,
        blocks: blocks.filter(b => { const c = corridors.find(x=>x.id===b.corridorId); return c && (c.from===sel.id||c.to===sel.id); }).length,
      };
    }
    if(sel.type === "corridor"){
      const c = corridors.find(x => x.id === sel.id);
      if(!c) return null;
      return {
        type:"corridor", id:c.id,
        name:`${prettyStation(c.from)} → ${prettyStation(c.to)}`,
        km:c.km, tracks:c.tracks, sectionType:c.type, traffic:c.traffic,
        status:c.status === "Selected" ? "Healthy" : c.status,
        occupancy: trains.filter(t=>t.corridorId===c.id).length,
      };
    }
    if(sel.type === "block"){
      const b = blocks.find(x => x.id === sel.id);
      if(!b) return null;
      const c = corridors.find(x => x.id === b.corridorId);
      return {
        type:"block", id:b.id, label:b.label,
        section: c ? `${prettyStation(c.from)} → ${prettyStation(c.to)}` : "—",
        atKm: b.atKm, severity:b.severity, window:b.window || "—", asset:b.asset || "—",
      };
    }
    return null;
  }

  function stats(){
    if(!corridors.length) return { trains:0, moving:0, dwelling:0, sections:0, blocked:0,
      availability:"100.0", routeKm:0, source:"sim", playing:false, speed:1 };
    const moving = trains.filter(t => t.holding <= 0).length;
    const blocked = corridors.filter(c => c.status === "Blocked").length;
    const avail = corridors.length ? (1 - blocked/corridors.length) * 100 : 100;
    return {
      trains: trains.length,
      moving,
      dwelling: trains.length - moving,
      sections: corridors.length,
      blocked,
      availability: avail.toFixed(1),
      routeKm: corridors.reduce((s,c)=>s+c.km,0),
      source: sim.liveSource,
      playing: sim.playing,
      speed: sim.speed,
    };
  }

  /* ============================================================
     LOOP
     ============================================================ */
  function loop(){
    raf = requestAnimationFrame(loop);
    const dt = Math.min(0.05, clock.getDelta());
    if(sim.playing) advanceTrains(dt);

    /* possession beacons breathe so an active block is obvious */
    const pulse = 0.55 + 0.45 * Math.sin(performance.now() * 0.004);
    blocks.forEach(b => { if(b.ring) b.ring.material.opacity = 0.25 + 0.45 * pulse; });

    labelGroup.visible = sim.labels;
    renderer.render(scene, camera);
  }

  /* ============================================================
     LIVE DATA POLLING
     ============================================================ */
  async function pullLive(){
    if(typeof NX === "undefined") return;
    const res = await NX.liveState();
    if(res.ok && res.data){
      const list = res.data.trains || res.data.positions || res.data;
      if(applyLiveTrains(list)) sim.liveSource = "api";
    } else {
      sim.liveSource = "sim";
    }
    if(sim.onStats) sim.onStats(stats());
  }

  async function hydrateTopology(){
    if(typeof NX === "undefined") return;
    const res = await NX.network();
    if(!res.ok || !res.data) return;
    const rows = res.data.corridors || res.data.network || res.data;
    if(!Array.isArray(rows)) return;
    /* the backend is the source of truth for traffic + track counts */
    rows.forEach(r => {
      const c = corridors.find(x => x.id === (r.corridor_id || r.id));
      if(!c) return;
      if(r.traffic_density) c.traffic = r.traffic_density;
      if(r.track_count) c.tracks = Number(r.track_count);
      if(r.distance_km) c.km = Number(r.distance_km);
    });
  }

  /* ============================================================
     PUBLIC API
     ============================================================ */
  function mount(container, opts={}){
    unmount();
    if(typeof THREE === "undefined"){
      container.innerHTML = `<div class="map-fallback">
        <strong>3D map unavailable</strong>
        <span>three.js did not load. Check the network connection, then reopen this view.</span>
      </div>`;
      return false;
    }

    host = container;
    canvas = document.createElement("canvas");
    canvas.id = "mapCanvas";
    canvas.setAttribute("aria-label","3D railway network map. Drag to orbit, scroll to zoom, click a train or station for detail.");
    container.appendChild(canvas);

    renderer = new THREE.WebGLRenderer({ canvas, antialias:true, alpha:false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

    /* reset module state for a clean remount */
    corridors = []; stations = {}; trains = []; blocks = []; pickTargets = [];
    clock = new THREE.Clock();

    buildScene();
    buildTrains();
    bindInput();
    resize();

    sim.onSelect = opts.onSelect || null;
    sim.onStats  = opts.onStats  || null;

    ro = new ResizeObserver(resize);
    ro.observe(container);

    if(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches){
      sim.playing = false;
    }

    loop();
    hydrateTopology();
    pullLive();
    const pollMs = (window.TMS_CONFIG && window.TMS_CONFIG.POLL_MS) || 4000;
    pollTimer = setInterval(pullLive, pollMs);

    if(sim.onStats) sim.onStats(stats());
    return true;
  }

  function resize(){
    if(!renderer || !host) return;
    const w = host.clientWidth || 800, h = host.clientHeight || 500;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  function unmount(){
    if(raf) cancelAnimationFrame(raf), raf = null;
    if(pollTimer) clearInterval(pollTimer), pollTimer = null;
    if(ro && host) { try{ ro.unobserve(host); }catch(e){} ro = null; }
    if(renderer){
      try{
        scene && scene.traverse(o => {
          if(o.geometry) o.geometry.dispose();
          if(o.material){
            const mats = Array.isArray(o.material) ? o.material : [o.material];
            mats.forEach(m => { if(m.map) m.map.dispose(); m.dispose(); });
          }
        });
        renderer.dispose();
      }catch(e){}
    }
    if(canvas && canvas.parentNode) canvas.parentNode.removeChild(canvas);
    renderer = scene = camera = canvas = null; host = null;
  }

  function focusStation(name){
    const s = stations[name];
    if(!s) return;
    cam.target.copy(s.pos);
    cam.dist = 18;
    updateCamera();
    select("station", name);
  }
  function focusTrain(id){
    const tr = trains.find(t => t.id === id);
    if(!tr) return;
    cam.target.copy(tr.group.position);
    cam.dist = 14;
    updateCamera();
    select("train", id);
  }
  function resetView(){
    if(!cam.target) return;
    cam.theta = -0.62; cam.phi = 0.92; cam.dist = 46;
    cam.target.set(45,0,25);
    updateCamera();
    select(null,null);
  }
  function refreshPalette(){
    if(!scene) return;
    PAL = palette();
    scene.background = PAL.sky;
    if(scene.fog) scene.fog.color = PAL.sky;
    corridors.forEach(c => setCorridorStatus(c.id, c.status));
  }

  return {
    mount, unmount, resize, refreshPalette,
    setBlocks, setCorridorStatus,
    focusStation, focusTrain, resetView, select,
    stats, describe,
    listTrains(){ return trains.map(t => {
      const c = corridors.find(x=>x.id===t.corridorId);
      return { id:t.id, kind:t.kind, delay:t.delay,
               section: c ? `${prettyStation(c.from)} → ${prettyStation(c.to)}` : "—",
               progress: Math.round(t.t*100) };
    }); },
    listStations(){ return Object.keys(STATION_GEO).map(prettyStation); },
    stationKeys(){ return Object.keys(STATION_GEO); },
    corridorList(){ return corridors.map(c=>({ id:c.id, from:c.from, to:c.to, km:c.km, tracks:c.tracks, status:c.status })); },
    set playing(v){ sim.playing = v; },
    get playing(){ return sim.playing; },
    set speed(v){ sim.speed = v; },
    get speed(){ return sim.speed; },
    set labels(v){ sim.labels = v; },
    get labels(){ return sim.labels; },
    set showBlocks(v){ sim.showBlocks = v; if(blockGroup) blockGroup.visible = v; },
    get showBlocks(){ return sim.showBlocks; },
  };
})();

/* ============================================================
   ICONS (inline, minimal line-style)
   ============================================================ */
const ICN = {
  dashboard:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="3" width="7" height="9" rx="1.3"/><rect x="14" y="3" width="7" height="5" rx="1.3"/><rect x="14" y="12" width="7" height="9" rx="1.3"/><rect x="3" y="16" width="7" height="5" rx="1.3"/></svg>',
  report:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 5v14M5 12h14"/></svg>',
  tasks:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M9 6h11M9 12h11M9 18h11"/><path d="M4 6h.01M4 12h.01M4 18h.01"/></svg>',
  assets:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 21V9l8-6 8 6v12"/><path d="M9 21v-7h6v7"/></svg>',
  block:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18M8 4v6"/></svg>',
  emergency:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 2 2 21h20L12 2z"/><path d="M12 9v5M12 17h.01"/></svg>',
  history:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/></svg>',
  ai:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1"/><circle cx="12" cy="12" r="3.2"/></svg>',
  map:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M9 5 3 7v13l6-2 6 2 6-2V5l-6 2-6-2Z"/><path d="M9 5v13M15 7v13"/></svg>',
  reports:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 20V10M12 20V4M20 20v-7"/></svg>',
  search:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>',
  bell:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M6 8a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6"/><path d="M10 20a2 2 0 0 0 4 0"/></svg>',
  sun:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="4.2"/><path d="M12 2v2M12 20v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M2 12h2M20 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4"/></svg>',
  moon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8Z"/></svg>',
  check: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M20 6 9 17l-5-5"/></svg>',
  warn:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M12 3 21 13H3L12 3Z"/><path d="M12 8v3.5M12 15h.01"/></svg>',
  chevR:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m9 6 6 6-6 6"/></svg>',
  x:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18M6 6l12 12"/></svg>',
  bolt:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M13 2 4 14h6l-1 8 9-12h-6l1-8Z"/></svg>',
  crew:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="9" cy="8" r="3.2"/><path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6"/><circle cx="17.5" cy="8.5" r="2.6"/><path d="M15.5 14.3c2.7.4 4.5 2.4 4.5 5.7"/></svg>',
  clock:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l4 2"/></svg>',
  pin:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 22s7-6.3 7-12a7 7 0 1 0-14 0c0 5.7 7 12 7 12Z"/><circle cx="12" cy="10" r="2.4"/></svg>',
  repeat:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M17 2 21 6l-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><path d="M7 22 3 18l4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>',
  trend:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 17 9 11l4 4 8-8"/><path d="M15 7h6v6"/></svg>',
  layers:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="m12 2 9 5-9 5-9-5 9-5Z"/><path d="m3 12 9 5 9-5M3 17l9 5 9-5"/></svg>',
  tool:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.8 2.8-2-2 2.8-2.8Z"/></svg>',
  truck:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="1" y="7" width="13" height="10" rx="1.2"/><path d="M14 10h4l3 3v4h-7z"/><circle cx="6" cy="19" r="1.6"/><circle cx="17.5" cy="19" r="1.6"/></svg>',
  info:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><path d="M12 11v5.5M12 7.6h.01"/></svg>',
  send:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="m3 11 18-8-8 18-2-8-8-2Z"/></svg>',
  plus:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>',
};

/* ============================================================
   MOCK DATA
   ============================================================ */
const CORRIDORS = ["Vijayawada–Khammam","Khammam–Warangal","Warangal–Kazipet","Kazipet–Secunderabad","BZA–Guntur"];
const ASSET_TYPES = ["Rail","Sleeper","Ballast","Track Fastening","Turnout / Points","Crossing","Track Circuit","Level Crossing","Bridge Track","Formation","Drainage","OHE Mast/Foundation related to track work","Other Track Asset"];
const DEFECTS_TRACK = [
  "Rail Crack","Rail Fracture","Rail Wear","Rail Corrugation","Rail Surface Defect","Rail Joint Defect","Weld Defect","Broken Rail","Rail Alignment Issue","Rail Gauge Issue","Rail Buckling","Rail Corrosion",
  "Gauge Variation","Alignment Defect","Cross Level Defect","Twist Defect","Unevenness","Excessive Cant","Settlement","Track Geometry Irregularity",
  "Broken Sleeper","Cracked Sleeper","Sleeper Displacement","Sleeper Spacing Issue","Damaged Sleeper",
  "Loose Fastening","Broken Fastening","Missing Fastening","Damaged Clip","Loose Bolt","Missing Bolt",
  "Ballast Deficiency","Ballast Fouling","Ballast Shoulder Defect","Ballast Profile Issue","Ballast Settlement",
  "Point Machine Area Defect","Switch Rail Defect","Stock Rail Defect","Crossing Defect","Tongue Rail Defect","Turnout Alignment Issue","Point Gap Issue",
  "Formation Settlement","Formation Failure","Waterlogging","Drainage Blockage","Embankment Issue","Soil Erosion","Slippage",
  "Crossing Surface Damage","Crossing Alignment Issue","Crossing Panel Damage","Road Surface Defect",
  "Bridge Track Defect","Track Settlement on Bridge","Expansion Joint Issue","Bearing-related Track Issue",
  "Vegetation","Flooding","Landslide","Trespassing-related Track Damage","Foreign Object","Animal Intrusion Damage","Extreme Weather Damage","Other"
];
const MAINT_TYPES = ["Inspection","Preventive Maintenance","Corrective Maintenance","Emergency Maintenance","Rail Replacement","Rail Grinding","Rail Welding","Track Alignment","Tamping","Ballast Cleaning","Ballast Renewal","Sleeper Replacement","Fastening Replacement","Turnout Maintenance","Turnout Replacement","Track Renewal","Drainage Maintenance","Formation Repair","Level Crossing Maintenance","Bridge Track Maintenance","Geometry Correction","Lubrication","Tightening","Component Replacement","Other"];
const CREW_TYPES = ["Track Maintenance Gang","Engineering Team","Inspection Team","Emergency Response Team","Specialized Team"];
const EQUIP_TYPES = ["Tamping Machine","Track Recording Equipment","Rail Cutting Equipment","Rail Welding Equipment","Track Tools","Inspection Vehicle","Maintenance Vehicle","Crane","Excavator","Ballast Equipment","Safety Equipment","Specialized Equipment","Other"];
const BLOCK_TYPES = ["Engineering Block","Track Maintenance Block","Line Block","Traffic Block","Emergency Block","Inspection Block","Other"];

function uid(prefix,n){return prefix+"-"+String(n).padStart(4,"0");}

// Track-only master data. No traction, OHE power, feeder, cable, isolator,
// transformer, switchgear or electrical-maintenance requests are seeded here.
const ASSETS = [
  {id:"TRK-2381",type:"Rail",corridor:CORRIDORS[0],km:"142/6",status:"Attention Required",health:38,lastMaint:"2026-09-12",nextMaint:"2026-09-22",failures:4,recurring:true},
  {id:"SLP-1187",type:"Sleeper",corridor:CORRIDORS[1],km:"88/2",status:"Healthy",health:86,lastMaint:"2026-08-30",nextMaint:"2026-11-20",failures:0,recurring:false},
  {id:"TUR-04",type:"Turnout / Points",corridor:CORRIDORS[2],km:"201/0",status:"Critical",health:22,lastMaint:"2026-07-11",nextMaint:"2026-09-22",failures:2,recurring:false},
  {id:"BAL-118",type:"Ballast",corridor:CORRIDORS[0],km:"150/1",status:"Attention Required",health:54,lastMaint:"2026-09-02",nextMaint:"2026-10-01",failures:1,recurring:false},
  {id:"DRN-09",type:"Drainage",corridor:CORRIDORS[3],km:"12/4",status:"Healthy",health:78,lastMaint:"2026-08-14",nextMaint:"2026-12-01",failures:0,recurring:false},
  {id:"FST-27",type:"Track Fastening",corridor:CORRIDORS[2],km:"198/7",status:"Attention Required",health:47,lastMaint:"2026-09-10",nextMaint:"2026-09-28",failures:1,recurring:false},
  {id:"TRK-3350",type:"Rail",corridor:CORRIDORS[4],km:"5/0",status:"Healthy",health:91,lastMaint:"2026-09-05",nextMaint:"2026-12-15",failures:0,recurring:false},
  {id:"SLP-014",type:"Sleeper",corridor:CORRIDORS[1],km:"95/3",status:"Critical",health:19,lastMaint:"2026-06-28",nextMaint:"2026-09-20",failures:3,recurring:true},
  {id:"CRS-06",type:"Crossing",corridor:CORRIDORS[3],km:"18/9",status:"Healthy",health:82,lastMaint:"2026-08-22",nextMaint:"2026-11-30",failures:0,recurring:false},
  {id:"FRM-11",type:"Formation",corridor:CORRIDORS[0],km:"144/0",status:"Attention Required",health:58,lastMaint:"2026-08-19",nextMaint:"2026-09-26",failures:1,recurring:false},
];

const TASKS = [
  {id:uid("TMS",1042),assetId:"TRK-2381",assetType:"Rail",corridor:CORRIDORS[0],km:"142/6",defect:"Rail Crack",maintType:"Rail Replacement",criticality:"Critical",urgency:"Immediate",safety:"Critical",detected:"2026-09-16",due:"2026-09-19",duration:120,crewReq:4,crewType:"Track Maintenance Gang",equipment:["Rail Cutting Equipment","Rail Welding Equipment","Safety Equipment"],blockRequired:true,blockType:"Track Maintenance Block",status:"Pending",aiPriority:97,trains:23,desc:"Rail crack identified during track patrol at KM 142/6."},
  {id:uid("TMS",1043),assetId:"SLP-014",assetType:"Sleeper",corridor:CORRIDORS[1],km:"95/3",defect:"Broken Sleeper",maintType:"Sleeper Replacement",criticality:"Critical",urgency:"Immediate",safety:"Critical",detected:"2026-09-17",due:"2026-09-18",duration:90,crewReq:4,crewType:"Track Maintenance Gang",equipment:["Track Tools","Maintenance Vehicle","Safety Equipment"],blockRequired:true,blockType:"Engineering Block",status:"Ready",aiPriority:95,trains:31,desc:"Multiple broken sleepers found during inspection."},
  {id:uid("TMS",1044),assetId:"SLP-1187",assetType:"Sleeper",corridor:CORRIDORS[1],km:"88/2",defect:"Sleeper Displacement",maintType:"Corrective Maintenance",criticality:"Medium",urgency:"Within 7 Days",safety:"Medium",detected:"2026-09-14",due:"2026-09-25",duration:60,crewReq:3,crewType:"Track Maintenance Gang",equipment:["Track Tools","Safety Equipment"],blockRequired:false,blockType:"",status:"Pending",aiPriority:48,trains:4,desc:"Sleeper displacement observed during routine patrol."},
  {id:uid("TMS",1045),assetId:"TUR-04",assetType:"Turnout / Points",corridor:CORRIDORS[2],km:"201/0",defect:"Turnout Alignment Issue",maintType:"Turnout Maintenance",criticality:"Critical",urgency:"Immediate",safety:"Critical",detected:"2026-09-17",due:"2026-09-18",duration:150,crewReq:5,crewType:"Engineering Team",equipment:["Track Recording Equipment","Track Tools","Maintenance Vehicle"],blockRequired:true,blockType:"Engineering Block",status:"Under COA Review",aiPriority:96,trains:44,desc:"Turnout alignment deviation requires engineering attention."},
  {id:uid("TMS",1046),assetId:"BAL-118",assetType:"Ballast",corridor:CORRIDORS[0],km:"150/1",defect:"Ballast Deficiency",maintType:"Ballast Renewal",criticality:"Medium",urgency:"Within 3 Days",safety:"Medium",detected:"2026-09-15",due:"2026-09-21",duration:100,crewReq:3,crewType:"Track Maintenance Gang",equipment:["Ballast Equipment","Maintenance Vehicle","Safety Equipment"],blockRequired:true,blockType:"Track Maintenance Block",status:"Submitted",aiPriority:64,trains:12,desc:"Ballast shoulder deficiency noticed near the track section."},
  {id:uid("TMS",1047),assetId:"FST-27",assetType:"Track Fastening",corridor:CORRIDORS[2],km:"198/7",defect:"Loose Fastening",maintType:"Fastening Replacement",criticality:"High",urgency:"Within 24 Hours",safety:"High",detected:"2026-09-16",due:"2026-09-19",duration:80,crewReq:3,crewType:"Track Maintenance Gang",equipment:["Track Tools","Safety Equipment"],blockRequired:true,blockType:"Track Maintenance Block",status:"Alternative Suggested",aiPriority:81,trains:19,desc:"Loose rail fastenings found during detailed track inspection."},
  {id:uid("TMS",1048),assetId:"TRK-2381",assetType:"Rail",corridor:CORRIDORS[0],km:"142/6",defect:"Gauge Variation",maintType:"Geometry Correction",criticality:"High",urgency:"Within 3 Days",safety:"High",detected:"2026-09-10",due:"2026-09-24",duration:70,crewReq:4,crewType:"Engineering Team",equipment:["Track Recording Equipment","Tamping Machine"],blockRequired:true,blockType:"Engineering Block",status:"Draft",aiPriority:78,trains:23,desc:"Gauge variation observed at the same section during measurement."},
  {id:uid("TMS",1049),assetId:"FRM-11",assetType:"Formation",corridor:CORRIDORS[0],km:"144/0",defect:"Formation Settlement",maintType:"Formation Repair",criticality:"Medium",urgency:"Within 7 Days",safety:"Medium",detected:"2026-09-12",due:"2026-09-27",duration:180,crewReq:5,crewType:"Engineering Team",equipment:["Excavator","Ballast Equipment","Safety Equipment"],blockRequired:true,blockType:"Engineering Block",status:"Pending",aiPriority:61,trains:0,desc:"Formation settlement requires detailed assessment and repair."},
  {id:uid("TMS",1050),assetId:"CRS-06",assetType:"Crossing",corridor:CORRIDORS[3],km:"18/9",defect:"Crossing Surface Damage",maintType:"Level Crossing Maintenance",criticality:"Low",urgency:"Planned",safety:"Medium",detected:"2026-09-08",due:"2026-10-08",duration:60,crewReq:2,crewType:"Track Maintenance Gang",equipment:["Track Tools","Safety Equipment"],blockRequired:false,blockType:"",status:"Completed",aiPriority:35,trains:0,desc:"Routine crossing surface maintenance completed."},
  {id:uid("TMS",1051),assetId:"TRK-3350",assetType:"Rail",corridor:CORRIDORS[4],km:"5/0",defect:"Rail Wear",maintType:"Rail Grinding",criticality:"Low",urgency:"Within 7 Days",safety:"Low",detected:"2026-09-13",due:"2026-09-29",duration:110,crewReq:3,crewType:"Specialized Team",equipment:["Maintenance Vehicle","Safety Equipment"],blockRequired:true,blockType:"Track Maintenance Block",status:"Scheduled",aiPriority:42,trains:6,desc:"Rail wear identified during inspection and scheduled for grinding."},
  {id:uid("TMS",1052),assetId:"DRN-09",assetType:"Drainage",corridor:CORRIDORS[3],km:"12/4",defect:"Drainage Blockage",maintType:"Drainage Maintenance",criticality:"Medium",urgency:"Within 24 Hours",safety:"Medium",detected:"2026-09-17",due:"2026-09-19",duration:110,crewReq:3,crewType:"Engineering Team",equipment:["Track Tools","Excavator","Safety Equipment"],blockRequired:true,blockType:"Engineering Block",status:"Approved",aiPriority:69,trains:9,desc:"Blocked drainage channel observed beside the track."},
  {id:uid("TMS",1053),assetId:"SLP-014",assetType:"Sleeper",corridor:CORRIDORS[1],km:"95/3",defect:"Cracked Sleeper",maintType:"Sleeper Replacement",criticality:"High",urgency:"Within 24 Hours",safety:"High",detected:"2026-09-11",due:"2026-09-18",duration:90,crewReq:3,crewType:"Track Maintenance Gang",equipment:["Track Tools","Maintenance Vehicle"],blockRequired:true,blockType:"Track Maintenance Block",status:"Reschedule Required",aiPriority:78,trains:19,desc:"Cracked sleepers require replacement in the affected section."},
];

const TODAY = new Date("2026-09-19");
function daysBetween(d1,d2){return Math.round((d1-d2)/86400000);}
TASKS.forEach(t=>{ const due=new Date(t.due); t.overdueDays=Math.max(0,daysBetween(TODAY,due)); t.dueSoon=!t.overdueDays && daysBetween(due,TODAY)>=-3; });

const RECURRING_HISTORY = {
  "TRK-2381":[{date:"2026-01-14",issue:"Rail alignment issue"},{date:"2026-03-22",issue:"Gauge variation"},{date:"2026-06-09",issue:"Rail alignment issue"},{date:"2026-09-16",issue:"Rail crack"}],
  "SLP-014":[{date:"2026-04-02",issue:"Cracked sleeper"},{date:"2026-07-19",issue:"Broken sleeper"},{date:"2026-09-11",issue:"Cracked sleeper"}],
};
const SIMILAR_CASES = {
  "Rail Crack":[{km:"139/2",resolution:"Rail replacement",duration:120},{km:"145/8",resolution:"Detailed rail inspection",duration:90},{km:"141/3",resolution:"Rail welding or replacement assessment",duration:100}],
  "Gauge Variation":[{km:"92/0",resolution:"Geometry correction",duration:110},{km:"98/6",resolution:"Tamping and measurement",duration:140}],
  "Broken Sleeper":[{km:"205/3",resolution:"Sleeper replacement",duration:90}],
  "Turnout Alignment Issue":[{km:"198/4",resolution:"Turnout inspection and alignment",duration:150}],
};
const HISTORY = {
  "TRK-2381":[{date:"2026-09-18",title:"Rail crack reported",meta:"Corrective · pending"},{date:"2026-09-12",title:"Track inspection",meta:"Inspection team · 60 min"},{date:"2026-08-21",title:"Gauge variation corrected",meta:"Engineering team · 75 min · Resolved"},{date:"2026-07-30",title:"Routine track inspection",meta:"Inspection crew · 40 min"}],
  "SLP-014":[{date:"2026-09-17",title:"Broken sleeper detected",meta:"Corrective · pending"},{date:"2026-08-05",title:"Sleeper condition inspection",meta:"Track crew · 45 min"},{date:"2026-07-19",title:"Sleeper replacement",meta:"Corrective · 90 min · Resolved"}],
  "TUR-04":[{date:"2026-09-17",title:"Turnout alignment issue detected",meta:"Under review"},{date:"2026-07-11",title:"Turnout maintenance",meta:"Engineering team · 6h · Block used"}],
};
const BLOCK_REQUESTS = [
  {id:"TMS-1044",taskId:uid("TMS",1046),asset:"BAL-118",title:"Ballast Renewal",km:"150/1",requested:"09:00–10:40",status:"Submitted",coaNote:"Under review by COA."},
  {id:"TMS-1045",taskId:uid("TMS",1047),asset:"FST-27",title:"Fastening Replacement",km:"198/7",requested:"10:00–11:20",status:"Alternative Suggested",coaNote:"Alternative window available — 0 train conflicts."},
  {id:"TMS-1046",taskId:uid("TMS",1052),asset:"DRN-09",title:"Drainage Maintenance",km:"12/4",requested:"02:00–03:50",status:"Approved",coaNote:"Approved as requested."},
  {id:"TMS-1047",taskId:uid("TMS",1051),asset:"TRK-3350",title:"Rail Grinding",km:"5/0",requested:"23:30–00:20",status:"Scheduled",coaNote:"Scheduled for 21 Sep, 23:30."},
  {id:"TMS-1048",taskId:uid("TMS",1053),asset:"SLP-014",title:"Sleeper Replacement",km:"95/3",requested:"01:00–02:30",status:"Reschedule Required",coaNote:"Crew conflict at requested time — please resubmit."},
];
const ALT_OPTIONS = {"TMS-1045":{requested:{time:"10:00–11:20",conflicts:3},alts:[{time:"11:40–13:00",conflicts:0,crew:true,equip:true},{time:"14:20–15:40",conflicts:1,crew:true,equip:true},{time:"22:10–23:30",conflicts:0,crew:false,equip:true}]}};
const BREAKDOWNS = [{asset:"TRK-2381",km:"142/6",detected:"10:42",section:"KM 142–148",trains:7,nearestCrewKm:3.2,nearestWagonKm:5.7,action:"Track protection and emergency rail inspection / repair",blockRequired:true,status:"Active"}];
const CREW_AVAILABLE = [{type:"Track Maintenance Gang",count:6,base:"Vijayawada Depot"},{type:"Engineering Team",count:3,base:"Khammam Yard"},{type:"Emergency Response Team",count:2,base:"Kazipet Depot"},{type:"Inspection Team",count:4,base:"Secunderabad Yard"}];
const AI_KB = {
  "Rail Crack":{action:"Immediate rail inspection and corrective repair or replacement",duration:120,crew:"4 Track Maintenance Gang members",equipment:"Rail Cutting Equipment + Safety Equipment"},
  "Rail Wear":{action:"Measure rail profile and assess grinding or replacement",duration:110,crew:"3 Specialized Team members",equipment:"Maintenance Vehicle + Safety Equipment"},
  "Gauge Variation":{action:"Verify gauge and perform geometry correction",duration:90,crew:"4 Engineering Team members",equipment:"Track Recording Equipment + Tamping Machine"},
  "Broken Sleeper":{action:"Replace damaged sleepers and verify track geometry",duration:90,crew:"4 Track Maintenance Gang members",equipment:"Track Tools + Maintenance Vehicle"},
  "Loose Fastening":{action:"Inspect and tighten or replace loose fastenings",duration:80,crew:"3 Track Maintenance Gang members",equipment:"Track Tools + Safety Equipment"},
  "Ballast Deficiency":{action:"Restore ballast profile and compact the affected section",duration:100,crew:"3 Track Maintenance Gang members",equipment:"Ballast Equipment + Maintenance Vehicle"},
  "Turnout Alignment Issue":{action:"Inspect turnout and perform engineering alignment correction",duration:150,crew:"5 Engineering Team members",equipment:"Track Recording Equipment + Track Tools"},
  "Formation Settlement":{action:"Perform detailed formation assessment and repair",duration:180,crew:"5 Engineering Team members",equipment:"Excavator + Ballast Equipment"},
  "Drainage Blockage":{action:"Clear the drainage channel and verify water flow",duration:110,crew:"3 Engineering Team members",equipment:"Track Tools + Safety Equipment"},
  "default":{action:"Inspect the affected track asset and assess corrective maintenance",duration:60,crew:"2 track maintenance personnel",equipment:"Track Tools + Safety Equipment"},
};

/* ============================================================
   STATE
   ============================================================ */
const state = {
  view:"dashboard",
  sidebarOpen:false,
  taskFilters:{search:"",criticality:"",status:"",defect:"",corridor:""},
  taskSort:{key:"aiPriority",dir:"desc"},
  drawerTask:null,
  selectedAsset:null,
  historyAsset:"TRK-2381",
  blockDetail:null,
  altSelected:null,
  reportModal:false,
  wizard:{
    step:1,
    data:{
      taskId: uid("TMS", 1054),
      assetId:"", assetType:"Rail", corridor:"", km:"",
      detected: "2026-09-19 09:14",
      defect:"", criticality:"", urgency:"", safety:"",
      notes:"",
      maintType:"", duration:"", due:"", description:"", requiredAction:"",
      crewReq:2, crewType:"Track Maintenance Gang", equipment:[],
      blockRequired:null, blockType:"", prefDate:"", prefStart:"", prefDuration:"", minDuration:"", maxDuration:"", flexibility:"Flexible",
    }
  }
};

function setView(v){
  if(state.view === "map" && v !== "map" && typeof RailGL !== "undefined"){
    RailGL.unmount();
    if(typeof mapState !== "undefined") mapState.mounted = false;
  }
  state.view=v; state.sidebarOpen=false; renderAll(); window.scrollTo(0,0);
}

/* ============================================================
   HELPERS
   ============================================================ */
function critColor(c){ return {Critical:"red",High:"amber",Medium:"blue",Low:"green",None:"neutral"}[c] || "neutral"; }
function statusColor(s){
  const map={
    Pending:"neutral",Ready:"blue",Draft:"neutral",Submitted:"blue","Under COA Review":"blue",
    "Alternative Suggested":"amber",Approved:"green",Scheduled:"green",Completed:"green",
    Rejected:"red","Reschedule Required":"amber",Active:"red",
  };
  return map[s] || "neutral";
}
function badge(text,color){ return `<span class="badge badge-${color}">${text}</span>`; }
function fmtDate(d){ if(!d) return "—"; const dt=new Date(d); if(isNaN(dt)) return d; return dt.toLocaleDateString('en-GB',{day:'2-digit',month:'short'}); }
function esc(s){ return (s||"").toString().replace(/[&<>"]/g, m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[m])); }

function showToast(msg,type="info"){
  const stack=document.getElementById("toastStack");
  const el=document.createElement("div");
  el.className="toast "+type;
  el.textContent=msg;
  stack.appendChild(el);
  setTimeout(()=>{ el.style.transition="opacity .25s"; el.style.opacity="0"; setTimeout(()=>el.remove(),260); }, 3200);
}

function computeAIRisk(t){
  let score=0;
  score += {Critical:40,High:28,Medium:16,Low:8}[t.criticality]||10;
  score += {Immediate:25,"Within 24 Hours":18,"Within 3 Days":10,"Within 7 Days":5,Planned:2}[t.urgency]||5;
  score += {Critical:20,High:14,Medium:8,Low:4,None:0}[t.safety]||0;
  score += Math.min(t.overdueDays*3,15);
  return Math.min(100,Math.round(score));
}

function reasonsFor(t){
  const reasons=[];
  if(t.safety==="Critical"||t.safety==="High") reasons.push({ok:true,text:`Safety risk: ${t.safety}`});
  if(t.overdueDays>0) reasons.push({ok:true,text:`Overdue: ${t.overdueDays} day${t.overdueDays>1?'s':''}`});
  if(t.trains>0) reasons.push({ok:true,text:`Train exposure: ${t.trains} trains/day on this section`});
  const rec=RECURRING_HISTORY[t.assetId];
  if(rec) reasons.push({ok:true,text:`Previous similar problem: ${rec.length-1} prior occurrence${rec.length-1>1?'s':''}`});
  const asset=ASSETS.find(a=>a.id===t.assetId);
  if(asset && asset.health<50) reasons.push({ok:true,text:`Asset condition: deteriorating (health ${asset.health}%)`});
  if(t.blockRequired) reasons.push({ok:true,text:"Track block required for safe rectification"});
  if(reasons.length===0) reasons.push({ok:true,text:"No elevated risk factors detected"});
  return reasons;
}

function priorityLabel(score){
  if(score>=85) return {label:"CRITICAL",color:"red"};
  if(score>=65) return {label:"HIGH",color:"amber"};
  if(score>=35) return {label:"MEDIUM",color:"blue"};
  return {label:"LOW",color:"green"};
}

function postponementCurve(t){
  const base=computeAIRisk(t);
  const f = t.criticality==="Critical"?1.28: t.criticality==="High"?1.18: t.criticality==="Medium"?1.1:1.05;
  return [
    {label:"Now",val:base},
    {label:"+24h",val:Math.min(100,Math.round(base*f))},
    {label:"+48h",val:Math.min(100,Math.round(base*f*f))},
    {label:"+72h",val:Math.min(100,Math.round(base*f*f*f))},
  ];
}

function blockReadinessFor(t){
  const checks=[
    {label:"Problem identified", ok: !!t.defect},
    {label:"Asset identified", ok: !!t.assetId},
    {label:"Location verified", ok: !!t.km},
    {label:"Crew specified", ok: !!(t.crewReq && t.crewType)},
    {label:"Equipment specified", ok: !!(t.equipment && t.equipment.length)},
    {label:"Duration specified", ok: !!t.duration},
    {label:"Safety information provided", ok: !!t.safety},
    {label:"Block requirement specified", ok: t.blockRequired!==null && t.blockRequired!==undefined},
  ];
  const pct = Math.round(checks.filter(c=>c.ok).length/checks.length*100);
  return {checks,pct};
}

/* ============================================================
   SIDEBAR + TOPBAR
   ============================================================ */
function navItem(key,icon,label,badgeVal,badgeColor){
  const active = state.view===key ? "active":"";
  const b = badgeVal ? `<span class="nav-badge ${badgeColor||''}">${badgeVal}</span>`:"";
  return `<div class="nav-item ${active}" onclick="setView('${key}')">${icon}<span>${label}</span>${b}</div>`;
}
function tmsSignOut() {
  localStorage.removeItem("nexora_auth");
  window.location.href = "/login";
}

function renderSidebar(){
  const critCount = TASKS.filter(t=>t.criticality==="Critical" && t.status!=="Completed").length;
  const overdueCount = TASKS.filter(t=>t.overdueDays>0 && t.status!=="Completed").length;
  const blockReqCount = BLOCK_REQUESTS.filter(b=>!["Completed","Rejected"].includes(b.status)).length;

  document.getElementById("sidebar").className = state.sidebarOpen?"open":"";
  document.getElementById("sidebar").innerHTML = `
    <div class="brand">
      <div class="brand-mark">
        <div class="brand-icon">${ICN.bolt.replace('currentColor','#fff')}</div>
        <div>
          <div class="brand-name">TMS</div>
          <div class="brand-sub">Track Management</div>
        </div>
      </div>
      <div class="parent-tag">
        <span>Module of</span><b>AI Powered Block Planning</b>
      </div>
    </div>
    <nav class="navgroup">
      ${navItem('dashboard',ICN.dashboard,'Dashboard')}
      ${navItem('report',ICN.report,'Report Problem')}
      ${navItem('tasks',ICN.tasks,'Maintenance Tasks', TASKS.filter(t=>t.status!=='Completed').length,'neutral')}
      ${navItem('assets',ICN.assets,'Track Assets')}
      ${navItem('blocks',ICN.block,'Block Requests', blockReqCount,'blue')}
      ${navItem('breakdown',ICN.emergency,'Breakdown Center', BREAKDOWNS.filter(b=>b.status==='Active').length || null,'red')}
      ${navItem('history',ICN.history,'Maintenance History')}
      ${navItem('ai',ICN.ai,'AI Recommendations', critCount,'red')}
      <div class="nav-label">More</div>
      ${navItem('map',ICN.map,'Network Map 3D')}
      ${navItem('reports',ICN.reports,'Reports')}
    </nav>
   <div class="sidebar-foot">

  <div class="role-chip">
    <div class="role-avatar">TG</div>

    <div class="role-info">
      <div class="role-name">Teena Gadwala</div>
      <div class="role-desc">Track Maintenance · BZA Div</div>
    </div>
  </div>

  <button
    class="sidebar-logout"
    onclick="tmsSignOut()"
  >
    ${ICN.logout}
    <span>Log out</span>
  </button>

  <div class="system-status-card">
    <div class="status-title">System Status</div>
    <div class="status-value">
      <span class="status-dot"></span>
      Operational
    </div>
  </div>

</div>
  `;
}

const VIEW_TITLES = {
  dashboard:"Dashboard", report:"Report Problem", tasks:"Maintenance Tasks", assets:"Track Assets",
  blocks:"Block Requests", breakdown:"Breakdown Center", history:"Maintenance History", ai:"AI Recommendations",
  map:"Network Map", reports:"Reports"
};

function renderTopbar(){
  document.getElementById("topbar").innerHTML = `
    <div class="icon-btn" style="display:none" id="hamburger" onclick="state.sidebarOpen=!state.sidebarOpen;renderSidebar();">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M3 12h18M3 18h18"/></svg>
    </div>
    <div class="crumb">AI Powered Block Planning / TMS <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="opacity:.5"><path d="m9 6 6 6-6 6"/></svg> <b>${VIEW_TITLES[state.view]}</b></div>
    <div class="topbar-spacer"></div>
    <div class="search-box">
      ${ICN.search}
      <input placeholder="Search task, asset, KM…" oninput="globalSearch(this.value)">
    </div>
    <span class="conn-pill" id="connPill" data-state="sim"><span class="conn-dot"></span>Local mode</span>
    <div class="icon-btn notification-btn" title="Notifications">
  ${ICN.bell}
  <span class="notification-badge">3</span>
</div>

<div class="topbar-user">
  <div class="user-avatar">TG</div>

  <div class="user-details">
    <div class="user-name">Teena Gadwala</div>
    <div class="user-role">Track Maintenance · BZA Div</div>
  </div>
</div>

<div class="icon-btn" id="themeBtn"
     title="Toggle theme"
     onclick="toggleTheme()">
  ${ICN.moon}
</div>
   
  `;
  updateThemeIcon();

}

function globalSearch(v){
  state.taskFilters.search=v;
  if(v && state.view!=='tasks'){ setView('tasks'); } else { renderViewport(); }
}

function toggleTheme(){
  const root=document.documentElement;
  const cur = root.getAttribute('data-theme');
  let next;
  if(cur==='dark') next='light'; else if(cur==='light') next='dark';
  else {
    const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    next = prefersDark ? 'light' : 'dark';
  }
  root.setAttribute('data-theme', next);
  if(typeof RailGL !== "undefined") setTimeout(()=>RailGL.refreshPalette(), 30);
  try{ localStorage.setItem('tms-theme', next); }catch(e){}
  updateThemeIcon();
}
function updateThemeIcon(){
  const root=document.documentElement;
  const isDark = root.getAttribute('data-theme')==='dark' || (!root.getAttribute('data-theme') && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
  const btn=document.getElementById('themeBtn');
  if(btn) btn.innerHTML = isDark ? ICN.sun : ICN.moon;
}
(function initTheme(){
  /* The console is a dark room product — dark is the default, and the
     light set is only used when someone deliberately switches. */
  let saved=null;
  try{ saved=localStorage.getItem('tms-theme'); }catch(e){}
  document.documentElement.setAttribute('data-theme', saved || 'dark');
})();

/* ============================================================
   VIEW: DASHBOARD
   ============================================================ */
function renderDashboard(){
  const active = TASKS.filter(t=>t.status!=='Completed');
  const critical = active.filter(t=>t.criticality==='Critical').length;
  const overdue = active.filter(t=>t.overdueDays>0).length;
  const pending = active.filter(t=>t.status==='Pending').length;
  const dueSoon = active.filter(t=>t.dueSoon).length;
  const blockReqs = BLOCK_REQUESTS.filter(b=>!['Completed','Rejected'].includes(b.status)).length;
  const emergencies = BREAKDOWNS.filter(b=>b.status==='Active').length;
  const crewAvail = CREW_AVAILABLE.reduce((s,c)=>s+c.count,0);
  const readyCount = active.filter(t=>blockReadinessFor(t).pct===100).length;
  const readiness = active.length ? Math.round(readyCount/active.length*100) : 0;

  const kpis = [
    {label:"Critical Problems",val:critical,color:"red",note:"require immediate attention"},
    {label:"Overdue",val:overdue,color:"amber",note:"maintenance past due date"},
    {label:"Pending Maintenance",val:pending,color:"neutral",note:"awaiting action"},
    {label:"Due Soon",val:dueSoon,color:"blue",note:"within 3 days"},
    {label:"Block Requests",val:blockReqs,color:"blue",note:"active TMS requests"},
    {label:"Emergency Breakdowns",val:emergencies,color:"red",note:"current / recent"},
    {label:"Available Crew",val:crewAvail,color:"green",note:"across 4 teams"},
    {label:"Block Readiness",val:readiness+"%",color:"green",note:"of active tasks ready"},
  ];

  const topProblems = [...active].sort((a,b)=>b.aiPriority-a.aiPriority).slice(0,6);
  const recentBlocks = BLOCK_REQUESTS.slice(0,4);

  document.getElementById("viewport").innerHTML = `
    <div class="view-title-row">
      <div>
        <div class="view-title">Track Overview</div>
        <div class="view-sub">From track problem to block-ready maintenance decision.</div>
      </div>
      <button class="btn btn-primary" onclick="setView('report')">${ICN.plus} Report Problem</button>
    </div>

    <div class="kpi-grid">
      ${kpis.map(k=>`
        <div class="kpi">
          <div class="kpi-bar" style="background:var(--${k.color})"></div>
          <div class="kpi-label">${k.label}</div>
          <div class="kpi-value">${k.val}</div>
          <div class="kpi-note">${k.note}</div>
        </div>`).join("")}
    </div>

    <div class="two-col">
      <div class="card card-pad">
        <div class="section-heading">${ICN.trend} Highest Priority Problems</div>
        <div class="table-wrap" style="border:none;">
          <table>
            <thead><tr><th>Task</th><th>Asset</th><th>Defect</th><th>Criticality</th><th>Due</th><th>AI Priority</th></tr></thead>
            <tbody>
              ${topProblems.map(t=>`
                <tr onclick="openTaskDrawer('${t.id}')">
                  <td class="cell-id">${t.id}</td>
                  <td>${t.assetId}</td>
                  <td>${t.defect}</td>
                  <td>${badge(t.criticality, critColor(t.criticality))}</td>
                  <td class="cell-faint">${fmtDate(t.due)}${t.overdueDays>0?` <span style="color:var(--red);font-weight:600;">(+${t.overdueDays}d)</span>`:''}</td>
                  <td class="cell-strong">${t.aiPriority}</td>
                </tr>`).join("")}
            </tbody>
          </table>
        </div>
      </div>

      <div style="display:flex;flex-direction:column;gap:14px;">
        <div class="card card-pad">
          <div class="section-heading">${ICN.emergency} Active Breakdowns</div>
          ${BREAKDOWNS.filter(b=>b.status==='Active').map(b=>`
            <div style="border:1px solid var(--border);border-radius:8px;padding:11px;margin-bottom:8px;cursor:pointer;" onclick="setView('breakdown')">
              <div style="display:flex;justify-content:space-between;">
                <span class="cell-id">${b.asset}</span>${badge('ACTIVE','red')}
              </div>
              <div class="subtle" style="margin-top:4px;">KM ${b.km} · ${b.trains} trains affected</div>
            </div>`).join("") || `<div class="subtle">No active breakdowns.</div>`}
        </div>

        <div class="card card-pad">
          <div class="section-heading">${ICN.block} Recent Block Requests</div>
          ${recentBlocks.map(b=>`
            <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--border-soft);cursor:pointer;" onclick="openBlockDetail('${b.id}')">
              <div>
                <div style="font-weight:600;font-size:12.5px;">${b.title}</div>
                <div class="subtle">${b.asset} · KM ${b.km}</div>
              </div>
              ${badge(b.status, statusColor(b.status))}
            </div>`).join("")}
          <div style="margin-top:10px;text-align:right;"><a onclick="setView('blocks')" style="font-size:11.5px;color:var(--copper);cursor:pointer;font-weight:600;">View all block requests →</a></div>
        </div>
      </div>
    </div>
  `;
}

/* ============================================================
   VIEW: MAINTENANCE TASKS (Problem overview table)
   ============================================================ */
function renderTasks(){
  const f = state.taskFilters;
  let rows = TASKS.filter(t=>{
    if(f.search){
      const s=f.search.toLowerCase();
      if(!(t.id.toLowerCase().includes(s)||t.assetId.toLowerCase().includes(s)||t.defect.toLowerCase().includes(s)||t.km.toLowerCase().includes(s))) return false;
    }
    if(f.criticality && t.criticality!==f.criticality) return false;
    if(f.status && t.status!==f.status) return false;
    if(f.defect && t.defect!==f.defect) return false;
    if(f.corridor && t.corridor!==f.corridor) return false;
    return true;
  });
  const {key,dir} = state.taskSort;
  rows.sort((a,b)=>{
    let av=a[key], bv=b[key];
    if(typeof av==='string') av=av.toLowerCase();
    if(typeof bv==='string') bv=bv.toLowerCase();
    if(av<bv) return dir==='asc'?-1:1;
    if(av>bv) return dir==='asc'?1:-1;
    return 0;
  });

  const allDefects = [...new Set(TASKS.map(t=>t.defect))];
  const allStatuses = [...new Set(TASKS.map(t=>t.status))];

  document.getElementById("viewport").innerHTML = `
    <div class="view-title-row">
      <div>
        <div class="view-title">Maintenance Tasks</div>
        <div class="view-sub">${rows.length} of ${TASKS.length} track problems shown</div>
      </div>
      <button class="btn btn-primary" onclick="setView('report')">${ICN.plus} Report Problem</button>
    </div>

    <div class="filters-row">
      <input class="input" style="width:200px;" placeholder="Search…" value="${esc(f.search)}" oninput="state.taskFilters.search=this.value;renderTasks();">
      <select onchange="state.taskFilters.criticality=this.value;renderTasks();">
        <option value="">All Criticality</option>
        ${["Critical","High","Medium","Low"].map(c=>`<option ${f.criticality===c?'selected':''}>${c}</option>`).join("")}
      </select>
      <select onchange="state.taskFilters.status=this.value;renderTasks();">
        <option value="">All Status</option>
        ${allStatuses.map(s=>`<option ${f.status===s?'selected':''}>${s}</option>`).join("")}
      </select>
      <select onchange="state.taskFilters.defect=this.value;renderTasks();">
        <option value="">All Defect Types</option>
        ${allDefects.map(s=>`<option ${f.defect===s?'selected':''}>${s}</option>`).join("")}
      </select>
      <select onchange="state.taskFilters.corridor=this.value;renderTasks();">
        <option value="">All Corridors</option>
        ${CORRIDORS.map(s=>`<option ${f.corridor===s?'selected':''}>${s}</option>`).join("")}
      </select>
      ${(f.search||f.criticality||f.status||f.defect||f.corridor) ? `<button class="btn btn-ghost btn-sm" onclick="state.taskFilters={search:'',criticality:'',status:'',defect:'',corridor:''};renderTasks();">Clear filters</button>`:''}
    </div>

    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            ${sortTh('id','Task ID')}${sortTh('assetId','Asset ID')}${sortTh('assetType','Type')}
            <th>Location</th>${sortTh('defect','Defect')}${sortTh('criticality','Criticality')}
            ${sortTh('urgency','Urgency')}${sortTh('safety','Safety Risk')}${sortTh('due','Due Date')}
            <th>Block</th>${sortTh('status','Status')}${sortTh('aiPriority','AI Priority')}
          </tr>
        </thead>
        <tbody>
          ${rows.length ? rows.map(t=>`
            <tr onclick="openTaskDrawer('${t.id}')">
              <td class="cell-id">${t.id}</td>
              <td class="mono">${t.assetId}</td>
              <td class="cell-faint">${t.assetType}</td>
              <td class="cell-faint">KM ${t.km}</td>
              <td>${t.defect}</td>
              <td>${badge(t.criticality,critColor(t.criticality))}</td>
              <td class="cell-faint">${t.urgency}</td>
              <td>${badge(t.safety,critColor(t.safety))}</td>
              <td class="cell-faint">${fmtDate(t.due)}${t.overdueDays>0?` <b style="color:var(--red)">+${t.overdueDays}d</b>`:''}</td>
              <td>${t.blockRequired?badge('Yes','blue'):badge('No','neutral')}</td>
              <td>${badge(t.status,statusColor(t.status))}</td>
              <td class="cell-strong">${t.aiPriority}</td>
            </tr>`).join("") : `<tr><td colspan="12"><div class="empty-state">${ICN.search}<div class="es-title">No matching problems</div>Try adjusting your filters.</div></td></tr>`}
        </tbody>
      </table>
    </div>
  `;
}
function sortTh(key,label){
  const active = state.taskSort.key===key;
  const arrow = active ? (state.taskSort.dir==='asc'?'▲':'▼') : '';
  return `<th onclick="sortTasks('${key}')">${label} <span style="color:var(--copper)">${arrow}</span></th>`;
}
function sortTasks(key){
  if(state.taskSort.key===key){ state.taskSort.dir = state.taskSort.dir==='asc'?'desc':'asc'; }
  else{ state.taskSort={key,dir:'desc'}; }
  renderTasks();
}

/* ---- Task Drawer (Why priority / postponement / similar / recurring) ---- */
function openTaskDrawer(id){
  state.drawerTask = TASKS.find(t=>t.id===id);
  renderOverlays();
}
function closeDrawer(){ state.drawerTask=null; renderOverlays(); }

function taskDrawerHTML(t){
  const pr = priorityLabel(t.aiPriority);
  const reasons = reasonsFor(t);
  const curve = postponementCurve(t);
  const maxVal = 100;
  const kb = AI_KB[t.defect] || AI_KB.default;
  const similar = SIMILAR_CASES[t.defect];
  const recurring = RECURRING_HISTORY[t.assetId];
  const readiness = blockReadinessFor(t);

  return `
  <div class="drawer-overlay" onclick="closeDrawer()"></div>
  <div class="drawer">
    <div class="drawer-head">
      <div>
        <div class="subtle mono">${t.id}</div>
        <div style="font-size:16px;font-weight:700;margin-top:2px;">${t.defect}</div>
        <div class="subtle" style="margin-top:2px;">${t.assetId} · ${t.assetType} · KM ${t.km} · ${t.corridor}</div>
      </div>
      <div class="icon-btn" onclick="closeDrawer()">${ICN.x}</div>
    </div>
    <div class="drawer-body">
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px;">
        ${badge(t.criticality,critColor(t.criticality))}
        ${badge('Urgency: '+t.urgency,'neutral')}
        ${badge('Safety: '+t.safety,critColor(t.safety))}
        ${badge(t.status,statusColor(t.status))}
      </div>

      <p style="color:var(--text-soft);font-size:12.5px;">${t.desc}</p>

      <div class="divider"></div>

      <div class="section-heading">${ICN.ai} TMS Intelligence Analysis</div>
      <div class="card" style="background:var(--surface-alt);border-color:var(--border-soft);padding:14px;margin-bottom:16px;">
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <div>
            <div class="subtle">AI Suggested Priority</div>
            <div style="font-size:20px;font-weight:700;color:var(--${pr.color});margin-top:2px;">${pr.label}</div>
          </div>
          <div style="text-align:right;">
            <div class="subtle">Risk Score</div>
            <div style="font-size:20px;font-weight:700;font-family:'IBM Plex Mono';">${t.aiPriority}<span style="font-size:11px;color:var(--text-faint);">/100</span></div>
          </div>
        </div>
        <div class="subtle" style="margin-top:8px;">Based on available maintenance data. Review and adjust as needed — AI Suggested, not final.</div>
      </div>

      <div class="section-heading">${ICN.warn} Why This Priority?</div>
      <ul class="reason-list" style="margin-bottom:18px;">
        ${reasons.map(r=>`<li>${ICN.check}<span>${r.text}</span></li>`).join("")}
      </ul>

      <div class="section-heading">${ICN.tool} Recommended Maintenance</div>
      <div class="card" style="padding:13px 14px;margin-bottom:18px;">
        <div class="form-grid" style="gap:9px;font-size:12.5px;">
          <div><span class="subtle">Action</span><div class="cell-strong">${kb.action}</div></div>
          <div><span class="subtle">Est. Duration</span><div class="cell-strong">${kb.duration} min</div></div>
          <div><span class="subtle">Crew</span><div class="cell-strong">${kb.crew}</div></div>
          <div><span class="subtle">Equipment</span><div class="cell-strong">${kb.equipment}</div></div>
        </div>
        <div style="margin-top:8px;">${t.blockRequired ? badge('Block Required','amber') : badge('No Block Needed','green')}</div>
      </div>

      <div class="section-heading">${ICN.clock} Postponement Analysis</div>
      <div class="card" style="padding:14px;margin-bottom:18px;">
        <div class="risk-bars">
          ${curve.map(c=>`
            <div class="risk-bar-col">
              <div class="risk-bar-val">${c.val}</div>
              <div class="risk-bar" style="height:${(c.val/maxVal*100)}%;background:${c.val>=85?'var(--red)':c.val>=65?'var(--amber)':'var(--blue)'}"></div>
              <div class="risk-bar-label">${c.label}</div>
            </div>`).join("")}
        </div>
        <div class="subtle">Estimated risk projection based on available factors — not a guaranteed failure prediction.</div>
        <div style="margin-top:8px;font-size:12px;font-weight:600;color:var(--amber);">→ Maintenance recommended within ${t.criticality==='Critical'?'12':t.criticality==='High'?'24':'72'} hours.</div>
      </div>

      ${recurring ? `
      <div class="section-heading">${ICN.repeat} Recurring Problem Detected</div>
      <div class="card" style="padding:14px;margin-bottom:18px;border-color:var(--red);">
        <div class="subtle">Asset ${t.assetId}</div>
        <ul class="reason-list" style="margin:8px 0;">
          ${recurring.map(r=>`<li>${ICN.check}<span>${new Date(r.date).toLocaleDateString('en-GB',{month:'long',year:'numeric'})} — ${r.issue}</span></li>`).join("")}
        </ul>
        <div style="font-size:12px;font-weight:600;color:var(--red);">Repeated issue detected. Consider detailed inspection / component replacement.</div>
      </div>` : ''}

      ${similar ? `
      <div class="section-heading">${ICN.layers} Similar Previous Cases</div>
      <div style="margin-bottom:18px;">
        <div class="subtle" style="margin-bottom:8px;">${similar.length} similar case${similar.length>1?'s':''} found in maintenance history.</div>
        ${similar.map(s=>`
          <div style="display:flex;justify-content:space-between;border:1px solid var(--border-soft);border-radius:8px;padding:9px 12px;margin-bottom:6px;font-size:12px;">
            <span class="mono">KM ${s.km}</span><span>${s.resolution}</span><span class="subtle">${s.duration} min</span>
          </div>`).join("")}
        <div style="margin-top:6px;font-size:12px;font-weight:600;color:var(--green);">Suggested action: ${similar[0].resolution}</div>
      </div>` : ''}

      <div class="section-heading">${ICN.check} Block Readiness</div>
      <div class="card" style="padding:14px;margin-bottom:10px;">
        <div style="display:flex;align-items:center;gap:16px;">
          ${readinessRing(readiness.pct)}
          <ul class="checklist" style="flex:1;">
            ${readiness.checks.map(c=>`<li class="${c.ok?'ok':'missing'}"><span class="ck-icon">${c.ok?ICN.check:ICN.warn}</span>${c.label}</li>`).join("")}
          </ul>
        </div>
      </div>

      <div style="display:flex;gap:8px;margin-top:16px;">
        ${readiness.pct===100
          ? `<button class="btn btn-primary" style="flex:1;" onclick="closeDrawer();setView('blocks');showToast('Opening block options for ${t.id}','info');">${ICN.send} Request Block</button>`
          : `<button class="btn btn-primary" style="flex:1;" onclick="closeDrawer();setView('report');showToast('Resolve missing fields to continue','warn');">Resolve Missing Information</button>`}
        <button class="btn" onclick="closeDrawer()">Close</button>
      </div>
    </div>
  </div>`;
}

function readinessRing(pct){
  const r=32, c=2*Math.PI*r;
  const color = pct===100?'var(--green)':pct>=60?'var(--amber)':'var(--red)';
  return `
  <div class="readiness-ring">
    <svg width="76" height="76" viewBox="0 0 76 76">
      <circle cx="38" cy="38" r="${r}" fill="none" stroke="var(--border)" stroke-width="7"/>
      <circle cx="38" cy="38" r="${r}" fill="none" stroke="${color}" stroke-width="7" stroke-linecap="round"
        stroke-dasharray="${c}" stroke-dashoffset="${c - (pct/100)*c}"/>
    </svg>
    <div class="readiness-pct">${pct}%</div>
  </div>`;
}

/* ============================================================
   VIEW: REPORT PROBLEM (multi-step wizard)
   ============================================================ */
function wizardStepMeta(){
  return [
    {n:1,label:"Problem"},
    {n:2,label:"Maintenance"},
    {n:3,label:"Resources & Block"},
    {n:4,label:"AI Review"},
  ];
}
function renderStepper(){
  const meta = wizardStepMeta();
  const cur = state.wizard.step;
  return `<div class="steps">
    ${meta.map((s,i)=>`
      <div class="step ${cur===s.n?'active':cur>s.n?'done':''}">
        <div class="step-num">${cur>s.n?'✓':s.n}</div>
        <div class="step-label">${s.label}</div>
      </div>
      ${i<meta.length-1?`<div class="step-line ${cur>s.n?'done':''}"></div>`:''}
    `).join("")}
  </div>`;
}

function defectOptionsForType(type){ return DEFECTS_TRACK; }

function renderReport(){
  const w = state.wizard.data;
  const vp = document.getElementById("viewport");
  vp.innerHTML = `
    <div class="view-title-row">
      <div>
        <div class="view-title">Report Track Problem</div>
        <div class="view-sub">Problem → Understand → Recommend → Prepare → Block-ready request</div>
      </div>
      <div class="pill-mini mono">${w.taskId}</div>
    </div>
    <div class="hero-flow">
      <b>Problem</b>${ICN.chevR}<b>AI Analysis</b>${ICN.chevR}<b>Recommended Maintenance</b>${ICN.chevR}<b>Resources</b>${ICN.chevR}<b>Block Readiness</b>${ICN.chevR}Request to COA
    </div>
    <div class="card card-pad" style="max-width:920px;">
      ${renderStepper()}
      <div id="wizardStepBody"></div>
    </div>
  `;
  renderWizardStepBody();
}

function renderWizardStepBody(){
  const step = state.wizard.step;
  const container = document.getElementById("wizardStepBody");
  if(step===1) container.innerHTML = stepProblemHTML();
  else if(step===2) container.innerHTML = stepMaintenanceHTML();
  else if(step===3) container.innerHTML = stepResourcesHTML();
  else container.innerHTML = stepAIReviewHTML();
}

function wField(id, val){ document.getElementById(id) && (document.getElementById(id).value = val ?? ""); }

function stepProblemHTML(){
  const w = state.wizard.data;
  const defects = defectOptionsForType(w.assetType);
  return `
    <div class="form-grid">
      <div>
        <label class="field-label">Task ID</label>
        <input class="input mono" style="width:100%;" value="${w.taskId}" disabled>
      </div>
      <div>
        <label class="field-label">Detected Date &amp; Time</label>
        <input class="input" style="width:100%;" value="${w.detected}" disabled>
      </div>
      <div>
        <label class="field-label">Asset ID</label>
        <input class="input" style="width:100%;" list="assetList" placeholder="Search asset…" value="${esc(w.assetId)}"
          onchange="onAssetPick(this.value)">
        <datalist id="assetList">${ASSETS.map(a=>`<option value="${a.id}">`).join("")}</datalist>
      </div>
      <div>
        <label class="field-label">Asset Type</label>
        <select style="width:100%;" onchange="updateWizard('assetType',this.value)">
          ${ASSET_TYPES.map(t=>`<option ${w.assetType===t?'selected':''}>${t}</option>`).join("")}
        </select>
      </div>
      <div>
        <label class="field-label">Corridor / Section</label>
        <select style="width:100%;" onchange="updateWizard('corridor',this.value)">
          <option value="">Select corridor…</option>
          ${CORRIDORS.map(c=>`<option ${w.corridor===c?'selected':''}>${c}</option>`).join("")}
        </select>
      </div>
      <div>
        <label class="field-label">Location / KM</label>
        <input class="input" style="width:100%;" placeholder="e.g. 142/6" value="${esc(w.km)}" oninput="updateWizard('km',this.value)">
      </div>
      <div class="field-full">
        <label class="field-label">Defect Type</label>
        <select style="width:100%;" onchange="updateWizard('defect',this.value)">
          <option value="">Select defect type…</option>
          ${defects.map(d=>`<option ${w.defect===d?'selected':''}>${d}</option>`).join("")}
        </select>
      </div>
      <div>
        <label class="field-label">Criticality</label>
        <select style="width:100%;" onchange="updateWizard('criticality',this.value)">
          <option value="">Select…</option>
          ${["Critical","High","Medium","Low"].map(c=>`<option ${w.criticality===c?'selected':''}>${c}</option>`).join("")}
        </select>
      </div>
      <div>
        <label class="field-label">Urgency</label>
        <select style="width:100%;" onchange="updateWizard('urgency',this.value)">
          <option value="">Select…</option>
          ${["Immediate","Within 24 Hours","Within 3 Days","Within 7 Days","Planned"].map(c=>`<option ${w.urgency===c?'selected':''}>${c}</option>`).join("")}
        </select>
      </div>
      <div>
        <label class="field-label">Safety Risk</label>
        <select style="width:100%;" onchange="updateWizard('safety',this.value)">
          <option value="">Select…</option>
          ${["Critical","High","Medium","Low","None"].map(c=>`<option ${w.safety===c?'selected':''}>${c}</option>`).join("")}
        </select>
      </div>
      <div class="field-full">
        <label class="field-label">Evidence</label>
        <div style="display:flex;gap:8px;">
          <button class="btn btn-sm" type="button" onclick="showToast('Photo attached (demo)','success')">📷 Upload Photo</button>
          <button class="btn btn-sm" type="button" onclick="showToast('Document attached (demo)','success')">📎 Attach Document</button>
          <button class="btn btn-sm" type="button" onclick="showToast('Location captured (demo)','success')">${ICN.pin} Capture Location</button>
        </div>
      </div>
      <div class="field-full">
        <label class="field-label">Additional Observation (optional)</label>
        <textarea class="input" oninput="updateWizard('notes',this.value)">${esc(w.notes)}</textarea>
      </div>
    </div>
    <div class="divider"></div>
    <div style="display:flex;justify-content:flex-end;">
      <button class="btn btn-primary" onclick="wizardNext()">Continue to Maintenance ${ICN.chevR}</button>
    </div>
  `;
}
function onAssetPick(val){
  updateWizard('assetId', val);
  const a = ASSETS.find(x=>x.id===val);
  if(a){ state.wizard.data.assetType=a.type; state.wizard.data.corridor=a.corridor; state.wizard.data.km=a.km; renderWizardStepBody(); }
}
function updateWizard(key,val){ state.wizard.data[key]=val; if(['assetType'].includes(key)) renderWizardStepBody(); }

function stepMaintenanceHTML(){
  const w = state.wizard.data;
  const kb = AI_KB[w.defect] || AI_KB.default;
  return `
    <div class="form-grid">
      <div class="field-full">
        <label class="field-label">Maintenance Type</label>
        <select style="width:100%;" onchange="updateWizard('maintType',this.value)">
          <option value="">Select maintenance type…</option>
          ${MAINT_TYPES.map(m=>`<option ${w.maintType===m?'selected':''}>${m}</option>`).join("")}
        </select>
        ${w.defect ? `<div class="subtle" style="margin-top:6px;">AI suggests: <b style="color:var(--copper);cursor:pointer;" onclick="updateWizard('maintType','${kb.action.split(' ')[0]==='Replace'?'Component Replacement':kb.action.split(' ')[0]==='Test'?'Testing':'Corrective Maintenance'}');renderWizardStepBody();">${kb.action}</b></div>`:''}
      </div>
      <div>
        <label class="field-label">Estimated Duration (minutes)</label>
        <input class="input" type="number" style="width:100%;" value="${w.duration}" oninput="updateWizard('duration',this.value)">
      </div>
      <div>
        <label class="field-label">Due Date</label>
        <input class="input" type="date" style="width:100%;" value="${w.due}" oninput="updateWizard('due',this.value)">
      </div>
      <div>
        <label class="field-label">Overdue Days <span class="subtle">(auto-calculated)</span></label>
        <input class="input" style="width:100%;" value="${w.due ? Math.max(0,daysBetween(TODAY,new Date(w.due))) : 0}" disabled>
      </div>
      <div></div>
      <div class="field-full">
        <label class="field-label">Maintenance Description</label>
        <textarea class="input" oninput="updateWizard('description',this.value)">${esc(w.description)}</textarea>
      </div>
      <div class="field-full">
        <label class="field-label">Required Action</label>
        <textarea class="input" oninput="updateWizard('requiredAction',this.value)" placeholder="${kb.action}">${esc(w.requiredAction)}</textarea>
      </div>
    </div>
    <div class="divider"></div>
    <div style="display:flex;justify-content:space-between;">
      <button class="btn" onclick="wizardBack()">${ICN.chevR.replace('m9 6 6 6-6 6','m15 6-6 6 6 6')} Back</button>
      <button class="btn btn-primary" onclick="wizardNext()">Continue to Resources ${ICN.chevR}</button>
    </div>
  `;
}

function stepResourcesHTML(){
  const w = state.wizard.data;
  return `
    <div class="form-grid cols-3">
      <div>
        <label class="field-label">Crew Required</label>
        <input class="input" type="number" min="1" style="width:100%;" value="${w.crewReq}" oninput="updateWizard('crewReq',this.value)">
      </div>
      <div>
        <label class="field-label">Crew Type</label>
        <select style="width:100%;" onchange="updateWizard('crewType',this.value)">
          ${CREW_TYPES.map(c=>`<option ${w.crewType===c?'selected':''}>${c}</option>`).join("")}
        </select>
      </div>
      <div></div>
      <div class="field-full">
        <label class="field-label">Equipment Required</label>
        <div class="chip-select">
          ${EQUIP_TYPES.map(e=>`<div class="chip ${w.equipment.includes(e)?'on':''}" onclick="toggleEquip('${e}')">${e}</div>`).join("")}
        </div>
      </div>
    </div>
    <div class="divider"></div>
    <div class="section-heading">${ICN.block} Block Required?</div>
    <div class="chip-select" style="margin-bottom:16px;">
      <div class="chip ${w.blockRequired===true?'on':''}" onclick="updateWizard('blockRequired',true);renderWizardStepBody();">Yes</div>
      <div class="chip ${w.blockRequired===false?'on':''}" onclick="updateWizard('blockRequired',false);renderWizardStepBody();">No</div>
    </div>
    ${w.blockRequired ? `
    <div class="form-grid cols-3">
      <div class="field-full">
        <label class="field-label">Block Type</label>
        <select style="width:100%;" onchange="updateWizard('blockType',this.value)">
          <option value="">Select block type…</option>
          ${BLOCK_TYPES.map(b=>`<option ${w.blockType===b?'selected':''}>${b}</option>`).join("")}
        </select>
      </div>
      <div>
        <label class="field-label">Preferred Date</label>
        <input class="input" type="date" style="width:100%;" value="${w.prefDate}" oninput="updateWizard('prefDate',this.value)">
      </div>
      <div>
        <label class="field-label">Preferred Start Time</label>
        <input class="input" type="time" style="width:100%;" value="${w.prefStart}" oninput="updateWizard('prefStart',this.value)">
      </div>
      <div>
        <label class="field-label">Preferred Duration (min)</label>
        <input class="input" type="number" style="width:100%;" value="${w.prefDuration}" oninput="updateWizard('prefDuration',this.value)">
      </div>
      <div>
        <label class="field-label">Minimum Duration</label>
        <input class="input" type="number" style="width:100%;" value="${w.minDuration}" oninput="updateWizard('minDuration',this.value)">
      </div>
      <div>
        <label class="field-label">Maximum Duration</label>
        <input class="input" type="number" style="width:100%;" value="${w.maxDuration}" oninput="updateWizard('maxDuration',this.value)">
      </div>
      <div class="field-full">
        <label class="field-label">Flexibility</label>
        <div class="chip-select">
          ${["Fixed","Flexible","Emergency"].map(f=>`<div class="chip ${w.flexibility===f?'on':''}" onclick="updateWizard('flexibility','${f}');renderWizardStepBody();">${f}</div>`).join("")}
        </div>
      </div>
    </div>` : `<div class="subtle">No block will be requested for this task.</div>`}
    <div class="divider"></div>
    <div style="display:flex;justify-content:space-between;">
      <button class="btn" onclick="wizardBack()">Back</button>
      <button class="btn btn-primary" onclick="wizardNext()">Run AI Review ${ICN.ai}</button>
    </div>
  `;
}
function toggleEquip(e){
  const w=state.wizard.data;
  const i=w.equipment.indexOf(e);
  if(i>-1) w.equipment.splice(i,1); else w.equipment.push(e);
  renderWizardStepBody();
}

function stepAIReviewHTML(){
  const w = state.wizard.data;
  const kb = AI_KB[w.defect] || AI_KB.default;
  const pseudoTask = {
    ...w, assetType:w.assetType, id:w.taskId, overdueDays: w.due?Math.max(0,daysBetween(TODAY,new Date(w.due))):0,
    trains: (ASSETS.find(a=>a.id===w.assetId)||{}).recurring ? 23 : 8,
  };
  const risk = computeAIRisk(pseudoTask);
  const pr = priorityLabel(risk);
  const reasons = reasonsFor(pseudoTask);
  const curve = postponementCurve(pseudoTask);
  const recurring = RECURRING_HISTORY[w.assetId];
  const similar = SIMILAR_CASES[w.defect];
  const readiness = blockReadinessFor({...w});

  return `
    <div class="section-heading">${ICN.ai} TMS Intelligence Analysis</div>
    <div class="card" style="background:var(--surface-alt);border-color:var(--border-soft);padding:14px;margin-bottom:16px;">
      <div class="form-grid">
        <div><span class="subtle">Problem</span><div class="cell-strong">${w.defect||"—"}</div></div>
        <div><span class="subtle">Risk</span><div class="cell-strong" style="color:var(--${pr.color})">${risk>=65?'HIGH':risk>=35?'MEDIUM':'LOW'}</div></div>
        <div><span class="subtle">AI Suggested Priority</span><div class="cell-strong" style="color:var(--${pr.color})">${pr.label}</div></div>
        <div><span class="subtle">Score</span><div class="cell-strong mono">${risk}/100</div></div>
      </div>
      <div class="subtle" style="margin-top:8px;">Based on available maintenance data — review before submitting.</div>
    </div>

    <ul class="reason-list" style="margin-bottom:18px;">${reasons.map(r=>`<li>${ICN.check}${r.text}</li>`).join("")}</ul>

    <div class="section-heading">${ICN.tool} Recommended Maintenance</div>
    <div class="card" style="padding:13px 14px;margin-bottom:18px;">
      <div class="form-grid" style="gap:9px;">
        <div><span class="subtle">Action</span><div class="cell-strong">${kb.action}</div></div>
        <div><span class="subtle">Estimated Duration</span><div class="cell-strong">${kb.duration} minutes</div></div>
        <div><span class="subtle">Crew</span><div class="cell-strong">${kb.crew}</div></div>
        <div><span class="subtle">Equipment</span><div class="cell-strong">${kb.equipment}</div></div>
        <div><span class="subtle">Block</span><div class="cell-strong">${w.blockRequired?'Required':'Not required'}</div></div>
      </div>
      <div class="subtle" style="margin-top:8px;">"AI Suggested" — you may edit resource fields in the previous step before submitting.</div>
    </div>

    <div class="section-heading">${ICN.clock} What If I Delay?</div>
    <div class="card" style="padding:14px;margin-bottom:18px;">
      <div class="risk-bars">
        ${curve.map(c=>`
          <div class="risk-bar-col">
            <div class="risk-bar-val">${c.val}</div>
            <div class="risk-bar" style="height:${c.val}%;background:${c.val>=85?'var(--red)':c.val>=65?'var(--amber)':'var(--blue)'}"></div>
            <div class="risk-bar-label">${c.label}</div>
          </div>`).join("")}
      </div>
      <div class="subtle">Estimated risk projection, not a guaranteed prediction.</div>
    </div>

    ${recurring ? `
    <div class="section-heading">${ICN.repeat} Recurring Problem Detected</div>
    <div class="card" style="padding:14px;margin-bottom:18px;border-color:var(--red);">
      <div class="subtle">Asset ${w.assetId} — ${recurring.length} occurrences of similar issue</div>
      <div style="font-size:12px;font-weight:600;color:var(--red);margin-top:6px;">Consider detailed inspection / component replacement instead of a one-off repair.</div>
    </div>` : ''}

    ${similar ? `
    <div class="section-heading">${ICN.layers} Similar Previous Cases</div>
    <div style="margin-bottom:18px;">
      <div class="subtle" style="margin-bottom:8px;">${similar.length} similar case(s) found.</div>
      ${similar.map(s=>`<div style="display:flex;justify-content:space-between;border:1px solid var(--border-soft);border-radius:8px;padding:9px 12px;margin-bottom:6px;font-size:12px;"><span class="mono">KM ${s.km}</span><span>${s.resolution}</span><span class="subtle">${s.duration} min</span></div>`).join("")}
    </div>` : ''}

    <div class="section-heading">${ICN.check} Block Readiness</div>
    <div class="card" style="padding:14px;margin-bottom:18px;">
      <div style="display:flex;align-items:center;gap:16px;">
        ${readinessRing(readiness.pct)}
        <ul class="checklist" style="flex:1;">
          ${readiness.checks.map(c=>`<li class="${c.ok?'ok':'missing'}"><span class="ck-icon">${c.ok?ICN.check:ICN.warn}</span>${c.label}</li>`).join("")}
        </ul>
      </div>
    </div>

    <div class="divider"></div>
    <div style="display:flex;justify-content:space-between;">
      <button class="btn" onclick="wizardBack()">Back</button>
      <div style="display:flex;gap:8px;">
        <button class="btn" onclick="showToast('Draft saved','success')">Save Draft</button>
        <button class="btn btn-primary" ${readiness.pct<100?'disabled':''} onclick="submitToCOA()">${ICN.send} ${w.blockRequired?'Request Block':'Submit Task'}</button>
      </div>
    </div>
    ${readiness.pct<100?`<div class="subtle" style="margin-top:8px;color:var(--amber);">⚠ Complete all readiness checks in previous steps before submitting.</div>`:''}
  `;
}

function wizardNext(){
  const w = state.wizard.data;
  if(state.wizard.step===1 && (!w.assetId || !w.defect || !w.criticality || !w.urgency || !w.safety)){
    showToast("Please complete required problem fields","warn"); return;
  }
  if(state.wizard.step===2 && (!w.maintType || !w.duration || !w.due)){
    showToast("Please complete required maintenance fields","warn"); return;
  }
  state.wizard.step = Math.min(4, state.wizard.step+1);
  renderReport();
}
function wizardBack(){ state.wizard.step = Math.max(1, state.wizard.step-1); renderReport(); }
/* submitToCOA is defined in the persistence section below. */

/* ============================================================
   VIEW: TRACK ASSETS
   ============================================================ */
function renderAssets(){
  document.getElementById("viewport").innerHTML = `
    <div class="view-title-row">
      <div><div class="view-title">Track Assets</div><div class="view-sub">Assets relevant to your maintenance scope</div></div>
    </div>
    <div class="asset-grid">
      ${ASSETS.map(a=>{
        const openProbs = TASKS.filter(t=>t.assetId===a.id && t.status!=='Completed');
        const critProbs = openProbs.filter(t=>t.criticality==='Critical').length;
        const sc = a.status==='Critical'?'red':a.status==='Attention Required'?'amber':'green';
        return `
        <div class="asset-card" onclick="openAssetDetail('${a.id}')">
          <div class="asset-card-top">
            <div>
              <div class="asset-id">${a.id}</div>
              <div class="asset-type">${a.type} · KM ${a.km}</div>
            </div>
            ${badge(a.status, sc)}
          </div>
          <div class="asset-stat-row">
            <div class="asset-stat">Health<b>${a.health}%</b></div>
            <div class="asset-stat">Open<b>${openProbs.length}</b></div>
            <div class="asset-stat">Critical<b>${critProbs}</b></div>
          </div>Recurring
          ${a.recurring?`<div class="recurring-flag"><span class="small-repeat">↻</span>  issue detected</div>`:''}
        </div>`;
      }).join("")}
    </div>
  `;
}
function openAssetDetail(id){ state.selectedAsset = ASSETS.find(a=>a.id===id); renderOverlays(); }
function closeAssetDetail(){ state.selectedAsset=null; renderOverlays(); }
function assetDetailHTML(a){
  const openProbs = TASKS.filter(t=>t.assetId===a.id);
  const hist = HISTORY[a.id];
  return `
  <div class="drawer-overlay" onclick="closeAssetDetail()"></div>
  <div class="drawer">
    <div class="drawer-head">
      <div>
        <div class="asset-id" style="font-size:18px;">${a.id}</div>
        <div class="subtle">${a.type} · KM ${a.km} · ${a.corridor}</div>
      </div>
      <div class="icon-btn" onclick="closeAssetDetail()">${ICN.x}</div>
    </div>
    <div class="drawer-body">
      <div style="display:flex;gap:8px;margin-bottom:16px;">${badge(a.status, a.status==='Critical'?'red':a.status==='Attention Required'?'amber':'green')}${a.recurring?badge('Recurring issue','red'):''}</div>
      <div class="form-grid" style="margin-bottom:18px;">
        <div><span class="subtle">Health / Risk</span><div class="cell-strong">${a.health}%</div></div>
        <div><span class="subtle">Last Maintenance</span><div class="cell-strong">${fmtDate(a.lastMaint)}</div></div>
        <div><span class="subtle">Next Maintenance</span><div class="cell-strong">${fmtDate(a.nextMaint)}</div></div>
        <div><span class="subtle">Previous Failures</span><div class="cell-strong">${a.failures}</div></div>
      </div>

      <div class="section-heading">${ICN.tasks} Open Problems (${openProbs.length})</div>
      ${openProbs.length? openProbs.map(t=>`
        <div style="border:1px solid var(--border);border-radius:8px;padding:10px 12px;margin-bottom:7px;cursor:pointer;" onclick="closeAssetDetail();openTaskDrawer('${t.id}')">
          <div style="display:flex;justify-content:space-between;"><span class="cell-id">${t.id}</span>${badge(t.criticality,critColor(t.criticality))}</div>
          <div style="font-size:12.5px;margin-top:3px;">${t.defect}</div>
          <div class="subtle">${badge(t.status,statusColor(t.status))}</div>
        </div>`).join("") : `<div class="subtle">No open problems for this asset.</div>`}

      <div class="divider"></div>
      <div class="section-heading">${ICN.history} Maintenance History</div>
      ${hist ? `<div class="timeline">${hist.map(h=>`
        <div class="tl-item">
          <div class="tl-dot" style="background:var(--copper)"></div>
          <div class="tl-date">${fmtDate(h.date)}</div>
          <div class="tl-title">${h.title}</div>
          <div class="tl-meta">${h.meta}</div>
        </div>`).join("")}</div>` : `<div class="subtle">No recorded history.</div>`}
      <div style="margin-top:14px;"><button class="btn btn-sm" onclick="closeAssetDetail();state.historyAsset='${a.id}';setView('history');">View Full History →</button></div>
    </div>
  </div>`;
}

/* ============================================================
   VIEW: BLOCK REQUESTS
   ============================================================ */
function renderBlocks(){
  document.getElementById("viewport").innerHTML = `
    <div class="view-title-row">
      <div><div class="view-title">My Block Requests</div><div class="view-sub">TMS block requests only — not the full railway schedule</div></div>
    </div>
    <div style="display:flex;flex-direction:column;gap:10px;">
      ${BLOCK_REQUESTS.map(b=>`
        <div class="card card-pad" style="cursor:pointer;display:flex;justify-content:space-between;align-items:center;gap:14px;flex-wrap:wrap;" onclick="openBlockDetail('${b.id}')">
          <div style="flex:1;min-width:200px;">
            <div style="display:flex;align-items:center;gap:8px;">
              <span class="cell-id">${b.taskId}</span><span class="subtle">·</span><span style="font-weight:600;">${b.title}</span>
            </div>
            <div class="subtle" style="margin-top:3px;">${b.asset} · KM ${b.km}</div>
          </div>
          <div style="text-align:center;">
            <div class="subtle">Requested</div>
            <div class="mono cell-strong">${b.requested}</div>
          </div>
          <div style="min-width:150px;text-align:right;">
            ${badge(b.status, statusColor(b.status))}
            <div class="subtle" style="margin-top:5px;max-width:220px;">${b.coaNote}</div>
          </div>
        </div>`).join("")}
    </div>
  `;
}
function openBlockDetail(id){ state.blockDetail = BLOCK_REQUESTS.find(b=>b.id===id); state.altSelected=null; renderOverlays(); }
function closeBlockDetail(){ state.blockDetail=null; renderOverlays(); }
function blockDetailHTML(b){
  const alts = ALT_OPTIONS[b.id];
  return `
  <div class="modal-overlay" onclick="if(event.target===this) closeBlockDetail()">
    <div class="modal">
      <div class="modal-head">
        <div>
          <div class="modal-title">${b.title}</div>
          <div class="subtle">${b.taskId} · ${b.asset} · KM ${b.km}</div>
        </div>
        <div class="icon-btn" onclick="closeBlockDetail()">${ICN.x}</div>
      </div>
      <div class="modal-body">
        <div style="margin-bottom:14px;">${badge(b.status, statusColor(b.status))}</div>
        <p class="subtle">${b.coaNote}</p>
        ${alts ? `
          <div class="section-heading" style="margin-top:14px;">${ICN.block} Available Block Options</div>
          <div class="alt-option" style="opacity:.75;">
            <div>
              <div class="subtle">Requested</div>
              <div class="alt-option-time">${alts.requested.time}</div>
              <div class="alt-meta"><span class="alt-tag">⚠ ${alts.requested.conflicts} conflicts</span></div>
            </div>
          </div>
          ${alts.alts.map((a,i)=>`
            <div class="alt-option ${state.altSelected===i?'selected':''}" onclick="state.altSelected=${i};renderOverlays();">
              <div>
                <div class="subtle">Alternative ${i+1}</div>
                <div class="alt-option-time">${a.time}</div>
                <div class="alt-meta">
                  <span class="alt-tag" style="color:${a.conflicts===0?'var(--green)':'var(--amber)'}">${a.conflicts===0?ICN.check:ICN.warn} ${a.conflicts} conflict${a.conflicts!==1?'s':''}</span>
                  <span class="alt-tag" style="color:${a.crew?'var(--green)':'var(--red)'}">${ICN.crew} Crew ${a.crew?'available':'unavailable'}</span>
                  <span class="alt-tag" style="color:${a.equip?'var(--green)':'var(--red)'}">${ICN.truck} Equip ${a.equip?'available':'unavailable'}</span>
                </div>
              </div>
              ${state.altSelected===i? `<span style="color:var(--copper)">${ICN.check}</span>`:''}
            </div>`).join("")}
        ` : `<div class="subtle" style="margin-top:10px;">No alternatives to show for this request's current status.</div>`}
      </div>
      <div class="modal-foot">
        <button class="btn" onclick="closeBlockDetail()">Close</button>
        ${alts ? `<button class="btn" onclick="showToast('Sent back for adjustment','info')">Request Adjustment</button>
        <button class="btn btn-primary" ${state.altSelected===null?'disabled':''} onclick="showToast('Alternative confirmed and sent to COA','success');closeBlockDetail();">Confirm Selected Option</button>` : ''}
      </div>
    </div>
  </div>`;
}

/* ============================================================
   VIEW: BREAKDOWN CENTER
   ============================================================ */
function renderBreakdown(){
  document.getElementById("viewport").innerHTML = `
    <div class="view-title-row">
      <div><div class="view-title">Breakdown Center</div><div class="view-sub">Track emergencies requiring immediate response</div></div>
    </div>
    ${BREAKDOWNS.length ? BREAKDOWNS.map(b=>`
      <div class="bd-strip">
        <div class="bd-severity"></div>
        <div class="bd-body">
          <div class="bd-head">
            <div>
              <div class="asset-id" style="font-size:17px;">${b.asset}</div>
              <div class="subtle">KM ${b.km} · affected section ${b.section}</div>
            </div>
            <div style="text-align:right;">
              ${badge('Active','red')}
              <div class="bd-elapsed" style="margin-top:4px;">Detected ${b.detected} · ${elapsedSince(b.detected)} elapsed</div>
            </div>
          </div>
          <div class="form-grid" style="margin-top:16px;">
            <div><span class="subtle">Current Impact</span><div class="cell-strong">${b.trains} trains affected</div></div>
            <div><span class="subtle">Required Action</span><div class="cell-strong">${b.action}</div></div>
            <div><span class="subtle">Nearest Available Crew</span><div class="cell-strong">${b.nearestCrewKm} km away</div></div>
            <div><span class="subtle">Nearest Maintenance Vehicle</span><div class="cell-strong">${b.nearestWagonKm} km away</div></div>
          </div>
          <div style="margin-top:10px;">${b.blockRequired?badge('Block Required','amber'):badge('No Block Needed','green')}</div>
          <div class="divider"></div>
          <div style="display:flex;gap:9px;flex-wrap:wrap;">
            <button class="btn btn-danger" onclick="escalateBreakdown('${b.asset}','request')">${ICN.emergency} Log emergency repair</button>
            <button class="btn btn-primary" onclick="escalateBreakdown('${b.asset}','block')">${ICN.block} Request emergency block</button>
            <button class="btn" onclick="escalateBreakdown('${b.asset}','crew')">${ICN.crew} Assign nearest crew</button>
            <button class="btn btn-ghost" onclick="setView('map')">${ICN.map} Show on map</button>
          </div>
        </div>
      </div>`).join("") : `<div class="empty-state">${ICN.check}<div class="es-title">No active track emergencies</div>All clear.</div>`}

    <div class="section-heading" style="margin-top:22px;">${ICN.crew} Nearby Crew &amp; Equipment Availability</div>
    <div class="table-wrap">
      <table>
        <thead><tr><th>Crew Type</th><th>Base</th><th>Available</th></tr></thead>
        <tbody>${CREW_AVAILABLE.map(c=>`<tr><td>${c.type}</td><td class="cell-faint">${c.base}</td><td class="cell-strong">${c.count}</td></tr>`).join("")}</tbody>
      </table>
    </div>
  `;
}

/* ============================================================
   VIEW: MAINTENANCE HISTORY
   ============================================================ */
function renderHistory(){
  const assets = Object.keys(HISTORY);
  const sel = state.historyAsset;
  const hist = HISTORY[sel] || [];
  document.getElementById("viewport").innerHTML = `
    <div class="view-title-row">
      <div><div class="view-title">Maintenance History</div><div class="view-sub">Chronological record feeding TMS recommendations</div></div>
      <select onchange="state.historyAsset=this.value;renderHistory();">
        ${assets.map(a=>`<option ${sel===a?'selected':''}>${a}</option>`).join("")}
      </select>
    </div>
    <div class="card card-pad" style="max-width:720px;">
      <div class="timeline">
        ${hist.map(h=>`
          <div class="tl-item">
            <div class="tl-dot" style="background:${h.meta.includes('pending')?'var(--amber)':h.meta.includes('Resolved')||h.meta.includes('Block used')?'var(--green)':'var(--copper)'}"></div>
            <div class="tl-date">${fmtDate(h.date)}</div>
            <div class="tl-title">${h.title}</div>
            <div class="tl-meta">${h.meta}</div>
          </div>`).join("")}
      </div>
    </div>
  `;
}

/* ============================================================
   VIEW: AI RECOMMENDATIONS
   ============================================================ */
function renderAI(){
  const flagged = [...TASKS].filter(t=>t.status!=='Completed').sort((a,b)=>b.aiPriority-a.aiPriority);
  document.getElementById("viewport").innerHTML = `
    <div class="view-title-row">
      <div><div class="view-title">AI Recommendations</div><div class="view-sub">Explainable priorities and suggested actions for your open tasks</div></div>
    </div>
    <div style="display:flex;flex-direction:column;gap:10px;">
      ${flagged.map(t=>{
        const pr = priorityLabel(t.aiPriority);
        const kb = AI_KB[t.defect] || AI_KB.default;
        const reasons = reasonsFor(t).slice(0,3);
        return `
        <div class="card card-pad" style="cursor:pointer;" onclick="openTaskDrawer('${t.id}')">
          <div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:10px;">
            <div>
              <div style="display:flex;align-items:center;gap:8px;">
                <span class="cell-id">${t.id}</span>
                <span style="font-weight:600;">${t.defect}</span>
                ${badge(pr.label, pr.color)}
              </div>
              <div class="subtle" style="margin-top:3px;">${t.assetId} · KM ${t.km} → Recommended: <b style="color:var(--text)">${kb.action}</b></div>
            </div>
            <div style="text-align:right;">
              <div class="subtle">Score</div>
              <div class="mono cell-strong" style="font-size:16px;">${t.aiPriority}</div>
            </div>
          </div>
          <div style="display:flex;gap:14px;margin-top:9px;flex-wrap:wrap;">
            ${reasons.map(r=>`<span class="subtle" style="display:flex;align-items:center;gap:4px;">${ICN.check}${r.text}</span>`).join("")}
          </div>
        </div>`;
      }).join("")}
    </div>
  `;
}

/* ============================================================
   VIEW: TRACK MAP (simplified schematic)
   ============================================================ */
/* ============================================================
   VIEW: NETWORK MAP (3D)
   The flat kilometrage strip is replaced by a navigable 3D map.
   TMS assets are pinned onto the corridor they belong to, so an
   open maintenance task shows up as a possession marker sitting
   on the section it will occupy.
   ============================================================ */

/* Which network section each track asset sits on, and where along it. */
const ASSET_PLACEMENT = {
  "TRK-2381": { corridorId:"COR_12", atKm: 74 },
  "SLP-1187": { corridorId:"COR_06", atKm: 38 },
  "TSS-04":   { corridorId:"COR_02", atKm: 27 },
  "FDR-118":  { corridorId:"COR_13", atKm: 31 },
  "TRF-09":   { corridorId:"COR_08", atKm: 6  },
  "SWG-27":   { corridorId:"COR_16", atKm: 22 },
  "CB-14":    { corridorId:"COR_07", atKm: 30 },
  "TRK-3350": { corridorId:"COR_01", atKm: 40 },
  "ATS-02":   { corridorId:"COR_18", atKm: 35 },
  "BAT-11":   { corridorId:"COR_11", atKm: 28 },
};

const mapState = {
  mounted: false,
  hudTimer: null,
  stats: null,
  selection: null,
  showAssets: true,
};

/* Build the possession markers the 3D map should draw. */
function mapBlockData(){
  const out = [];

  /* open maintenance tasks that need a block */
  TASKS.filter(t => t.blockRequired && t.status !== "Completed").forEach(t => {
    const p = ASSET_PLACEMENT[t.assetId];
    if(!p) return;
    out.push({
      id: t.id,
      corridorId: p.corridorId,
      atKm: p.atKm,
      label: t.assetId,
      asset: t.assetId,
      severity: (t.criticality === "Critical" || t.criticality === "High") ? "Blocked" : "Attention",
      window: t.duration ? `${t.duration} min` : "—",
      kind: "task",
    });
  });

  /* active breakdowns always show as a hard block */
  BREAKDOWNS.filter(b => b.status === "Active").forEach(b => {
    const p = ASSET_PLACEMENT[b.asset];
    if(!p) return;
    out.push({
      id: "BD-" + b.asset,
      corridorId: p.corridorId,
      atKm: p.atKm,
      label: b.asset + " · breakdown",
      asset: b.asset,
      severity: "Blocked",
      window: "Until cleared",
      kind: "breakdown",
    });
  });

  return out;
}

function renderMap(){
  document.getElementById("viewport").innerHTML = `
    <div class="view-title-row">
      <div>
        <div class="view-title">Network Map</div>
        <div class="view-sub">Live track network in 3D — trains, sections and open possessions</div>
      </div>
      <div style="display:flex;gap:8px;align-items:center;">
        <span class="conn-pill" id="mapSource" data-state="sim"><span class="conn-dot"></span>Simulation</span>
        <button class="btn" onclick="RailGL.resetView()">${ICN.pin} Reset view</button>
      </div>
    </div>

    <div class="map-layout">
      <div id="mapStage">
        <!-- canvas is injected by RailGL -->

        <div class="map-panel map-tl">
          <div class="map-hud-title">Section condition</div>
          <div class="map-legend-row"><span class="lg-swatch" style="background:var(--green)"></span>Clear</div>
          <div class="map-legend-row"><span class="lg-swatch" style="background:var(--amber)"></span>Maintenance due</div>
          <div class="map-legend-row"><span class="lg-swatch" style="background:var(--red)"></span>Possession / breakdown</div>
          <div class="map-legend-row"><span class="lg-swatch" style="background:var(--copper)"></span>Selected route</div>
          <div class="map-legend-row" style="margin-top:9px;"><span class="lg-dot" style="background:var(--copper)"></span>Junction</div>
        </div>

        <div class="map-panel map-tr" role="group" aria-label="Map controls">
          <button class="map-btn" id="btnPlay" aria-pressed="true" title="Pause movement" onclick="toggleMapPlay()">
            <svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>
          </button>
          <div class="map-speed" role="group" aria-label="Simulation speed">
            <button onclick="setMapSpeed(1)"  aria-pressed="true">1x</button>
            <button onclick="setMapSpeed(4)"  aria-pressed="false">4x</button>
            <button onclick="setMapSpeed(12)" aria-pressed="false">12x</button>
          </div>
          <button class="map-btn" id="btnLabels" aria-pressed="true" title="Toggle station names" onclick="toggleMapLabels()">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><path d="M4 7h16M4 12h10M4 17h7"/></svg>
          </button>
          <button class="map-btn" id="btnBlocks" aria-pressed="true" title="Toggle possessions" onclick="toggleMapBlocks()">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><path d="M12 3 2 21h20L12 3Z"/><path d="M12 10v4M12 17h.01"/></svg>
          </button>
          <button class="map-btn" id="btnFull" aria-pressed="false" title="Fullscreen" onclick="toggleMapFullscreen()">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><path d="M4 9V4h5M20 15v5h-5M15 4h5v5M9 20H4v-5"/></svg>
          </button>
        </div>

        <div class="map-panel map-br" id="mapHud">
          <div class="map-hud-title">Network state</div>
          <div class="map-stat"><span>Trains running</span><b id="hudTrains">—</b></div>
          <div class="map-stat"><span>At stations</span><b id="hudDwell">—</b></div>
          <div class="map-stat"><span>Sections blocked</span><b id="hudBlocked">—</b></div>
          <div class="map-stat"><span>Section availability</span><b id="hudAvail">—</b></div>
          <div class="map-stat"><span>Route km</span><b id="hudKm">—</b></div>
        </div>

        <div class="map-panel" id="mapSelect">
          <div class="sel-close" onclick="RailGL.select(null,null)" title="Close">${ICN.x}</div>
          <div id="mapSelectBody"></div>
        </div>
      </div>

      <div>
        <div class="section-heading">${ICN.truck} Trains on the network</div>
        <div class="ticker" id="trainTicker"></div>
      </div>

      <div class="map-side">
        <div class="card card-pad">
          <div class="map-hud-title">Jump to junction</div>
          <select id="jumpStation" onchange="RailGL.focusStation(this.value)" style="width:100%;margin-top:4px;">
            <option value="">Select a station…</option>
            ${RailGL.stationKeys().map(k=>`<option value="${k}">${k.replace(/_/g,' ')}</option>`).join("")}
          </select>
          <div class="subtle" style="margin-top:9px;font-size:11px;">
            Drag to orbit · scroll to zoom · shift-drag to pan · click a train, station or section for detail. Arrow keys work too.
          </div>
        </div>
        <div class="card card-pad">
          <div class="map-hud-title">Open possessions on the map</div>
          <div id="mapBlockList" style="margin-top:4px;"></div>
        </div>
      </div>
    </div>
  `;

  const stage = document.getElementById("mapStage");
  const ok = RailGL.mount(stage, {
    onSelect: onMapSelect,
    onStats: onMapStats,
  });

  if(ok){
    RailGL.setBlocks(mapBlockData());
    mapState.mounted = true;
    renderTrainTicker();
    renderMapBlockList();
    if(mapState.hudTimer) clearInterval(mapState.hudTimer);
    mapState.hudTimer = setInterval(() => {
      if(state.view === "map" && mapState.mounted){ onMapStats(RailGL.stats()); }
      else { clearInterval(mapState.hudTimer); mapState.hudTimer = null; }
    }, 1500);
  }
}

function onMapStats(s){
  mapState.stats = s;
  const set = (id,v) => { const el=document.getElementById(id); if(el) el.textContent=v; };
  set("hudTrains", `${s.moving}/${s.trains}`);
  set("hudDwell",  s.dwelling);
  set("hudBlocked", s.blocked);
  set("hudAvail", s.availability + "%");
  set("hudKm", s.routeKm.toLocaleString());

  const src = document.getElementById("mapSource");
  if(src){
    const live = s.source === "api";
    src.dataset.state = live ? "live" : "sim";
    src.innerHTML = `<span class="conn-dot"></span>${live ? "Live from RailOps API" : "Local simulation"}`;
  }
  const play = document.getElementById("btnPlay");
  if(play) play.setAttribute("aria-pressed", String(!!s.playing));
}

function onMapSelect(info){
  mapState.selection = info;
  const panel = document.getElementById("mapSelect");
  const body  = document.getElementById("mapSelectBody");
  if(!panel || !body) return;

  if(!info){ panel.classList.remove("show"); renderTrainTicker(); return; }
  panel.classList.add("show");

  if(info.type === "train"){
    body.innerHTML = `
      <div class="sel-kicker">${info.kind}</div>
      <div class="sel-name mono">${info.id}</div>
      <div style="margin-top:9px;">
        <div class="sel-row"><span>Section</span><b>${esc(info.section)}</b></div>
        <div class="sel-row"><span>Heading to</span><b>${esc(info.heading)}</b></div>
        <div class="sel-row"><span>Position</span><b>KM ${info.km} / ${info.totalKm}</b></div>
        <div class="sel-row"><span>Running late</span><b style="color:${info.delay>10?'var(--amber)':'var(--green)'}">${info.delay} min</b></div>
      </div>`;
  } else if(info.type === "station"){
    body.innerHTML = `
      <div class="sel-kicker">Junction</div>
      <div class="sel-name">${esc(info.name)}</div>
      <div style="margin-top:9px;">
        <div class="sel-row"><span>Connecting lines</span><b>${info.lines}</b></div>
        <div class="sel-row"><span>Max running lines</span><b>${info.tracks}</b></div>
        <div class="sel-row"><span>Trains approaching</span><b>${info.approaching}</b></div>
        <div class="sel-row"><span>Possessions nearby</span><b style="color:${info.blocks?'var(--amber)':'var(--green)'}">${info.blocks}</b></div>
      </div>`;
  } else if(info.type === "corridor"){
    const col = info.status === "Blocked" ? "var(--red)" : info.status === "Attention" ? "var(--amber)" : "var(--green)";
    body.innerHTML = `
      <div class="sel-kicker">Section ${esc(info.id)}</div>
      <div class="sel-name" style="font-size:13.5px;">${esc(info.name)}</div>
      <div style="margin-top:9px;">
        <div class="sel-row"><span>Length</span><b>${info.km} km</b></div>
        <div class="sel-row"><span>Running lines</span><b>${info.tracks} · ${esc(info.sectionType)}</b></div>
        <div class="sel-row"><span>Traffic</span><b>${esc(info.traffic)}</b></div>
        <div class="sel-row"><span>Trains on section</span><b>${info.occupancy}</b></div>
        <div class="sel-row"><span>Condition</span><b style="color:${col}">${esc(info.status)}</b></div>
      </div>`;
  } else if(info.type === "block"){
    body.innerHTML = `
      <div class="sel-kicker">Possession</div>
      <div class="sel-name mono" style="font-size:14px;">${esc(info.id)}</div>
      <div style="margin-top:9px;">
        <div class="sel-row"><span>Asset</span><b>${esc(info.asset)}</b></div>
        <div class="sel-row"><span>Section</span><b>${esc(info.section)}</b></div>
        <div class="sel-row"><span>At</span><b>KM ${info.atKm}</b></div>
        <div class="sel-row"><span>Duration</span><b>${esc(info.window)}</b></div>
      </div>
      <button class="btn btn-sm btn-primary" style="margin-top:10px;width:100%;justify-content:center;"
        onclick="openTaskFromMap('${esc(info.id)}')">Open task</button>`;
  }
  renderTrainTicker();
}

function openTaskFromMap(id){
  const t = TASKS.find(x => x.id === id);
  if(t){ setView('tasks'); setTimeout(()=>openTaskDrawer(id), 60); }
  else { setView('breakdown'); }
}

function renderTrainTicker(){
  const el = document.getElementById("trainTicker");
  if(!el) return;
  const sel = mapState.selection && mapState.selection.type === "train" ? mapState.selection.id : null;
  el.innerHTML = RailGL.listTrains().map(t => `
    <div class="ticker-card ${sel===t.id?'sel':''}" onclick="RailGL.focusTrain('${t.id}')">
      <div class="tk-id">${t.id}</div>
      <div class="tk-route">${esc(t.section)}</div>
      <div class="tk-meta">
        <span>${t.kind}</span>
        <span style="color:${t.delay>10?'var(--amber)':'var(--green)'}">+${t.delay}m</span>
      </div>
    </div>`).join("");
}

function renderMapBlockList(){
  const el = document.getElementById("mapBlockList");
  if(!el) return;
  const list = mapBlockData();
  if(!list.length){
    el.innerHTML = `<div class="subtle" style="font-size:11.5px;">No possessions on the network right now.</div>`;
    return;
  }
  el.innerHTML = list.map(b => `
    <div style="display:flex;align-items:center;gap:9px;padding:7px 0;border-bottom:1px solid var(--border-soft);cursor:pointer;"
         onclick="RailGL.select('block','${b.id}')">
      <span class="lg-dot" style="background:${b.severity==='Blocked'?'var(--red)':'var(--amber)'}"></span>
      <div style="min-width:0;flex:1;">
        <div class="mono" style="font-size:11.5px;font-weight:600;">${esc(b.label)}</div>
        <div class="subtle" style="font-size:10.5px;">${esc(b.corridorId)} · KM ${b.atKm} · ${esc(b.window)}</div>
      </div>
    </div>`).join("");
}

/* ---------- map control handlers ---------- */
function toggleMapPlay(){
  RailGL.playing = !RailGL.playing;
  const b = document.getElementById("btnPlay");
  b.setAttribute("aria-pressed", String(RailGL.playing));
  b.title = RailGL.playing ? "Pause movement" : "Resume movement";
  b.innerHTML = RailGL.playing
    ? `<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>`
    : `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 4.5v15l13-7.5-13-7.5Z"/></svg>`;
}
function setMapSpeed(v){
  RailGL.speed = v;
  document.querySelectorAll(".map-speed button").forEach(b => {
    b.setAttribute("aria-pressed", String(b.textContent === v + "x"));
  });
}
function toggleMapLabels(){
  RailGL.labels = !RailGL.labels;
  document.getElementById("btnLabels").setAttribute("aria-pressed", String(RailGL.labels));
}
function toggleMapBlocks(){
  RailGL.showBlocks = !RailGL.showBlocks;
  document.getElementById("btnBlocks").setAttribute("aria-pressed", String(RailGL.showBlocks));
}
function toggleMapFullscreen(){
  const stage = document.getElementById("mapStage");
  const on = stage.classList.toggle("fullscreen");
  document.getElementById("btnFull").setAttribute("aria-pressed", String(on));
  setTimeout(()=>RailGL.resize(), 60);
}
document.addEventListener("keydown", e => {
  if(e.key === "Escape"){
    const stage = document.getElementById("mapStage");
    if(stage && stage.classList.contains("fullscreen")) toggleMapFullscreen();
  }
});

/* ============================================================
   VIEW: REPORTS
   ============================================================ */
function renderReports(){
  const byDefect = {};
  TASKS.forEach(t=>{ byDefect[t.defect]=(byDefect[t.defect]||0)+1; });
  const defectRows = Object.entries(byDefect).sort((a,b)=>b[1]-a[1]).slice(0,7);
  const maxDefect = Math.max(...defectRows.map(d=>d[1]));

  const byCorridor = {};
  TASKS.forEach(t=>{ byCorridor[t.corridor]=(byCorridor[t.corridor]||0)+1; });
  const corridorRows = Object.entries(byCorridor).sort((a,b)=>b[1]-a[1]);
  const maxCorridor = Math.max(...corridorRows.map(d=>d[1]));

  const preventive = TASKS.filter(t=>t.maintType.includes('Preventive')||t.maintType==='Inspection'||t.maintType==='Testing').length;
  const corrective = TASKS.length - preventive;
  const avgResTime = Math.round(TASKS.reduce((s,t)=>s+t.duration,0)/TASKS.length);
  const completed = TASKS.filter(t=>t.status==='Completed').length;

  document.getElementById("viewport").innerHTML = `
    <div class="view-title-row">
      <div><div class="view-title">Reports</div><div class="view-sub">Track maintenance analytics for your scope</div></div>
    </div>
    <div class="filters-row">
      <select><option>All Corridors</option>${CORRIDORS.map(c=>`<option>${c}</option>`).join("")}</select>
      <select><option>All Asset Types</option>${ASSET_TYPES.map(c=>`<option>${c}</option>`).join("")}</select>
      <select><option>Last 30 days</option><option>Last 90 days</option><option>This year</option></select>
    </div>
    <div class="kpi-grid" style="grid-template-columns:repeat(4,1fr);">
      <div class="kpi"><div class="kpi-bar" style="background:var(--blue)"></div><div class="kpi-label">Avg. Resolution Time</div><div class="kpi-value">${avgResTime}<span style="font-size:13px;">min</span></div></div>
      <div class="kpi"><div class="kpi-bar" style="background:var(--green)"></div><div class="kpi-label">Preventive</div><div class="kpi-value">${preventive}</div></div>
      <div class="kpi"><div class="kpi-bar" style="background:var(--amber)"></div><div class="kpi-label">Corrective / Emergency</div><div class="kpi-value">${corrective}</div></div>
      <div class="kpi"><div class="kpi-bar" style="background:var(--copper)"></div><div class="kpi-label">Completed Tasks</div><div class="kpi-value">${completed}</div></div>
    </div>
    <div class="two-col">
      <div class="card card-pad">
        <div class="section-heading">${ICN.reports} Problems by Defect Type</div>
        <div class="bar-report">
          ${defectRows.map(([d,c])=>`
            <div class="bar-report-row">
              <span class="subtle" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${d}</span>
              <div class="bar-track"><div class="bar-fill" style="width:${(c/maxDefect*100)}%;background:var(--copper);"></div></div>
              <span class="cell-strong">${c}</span>
            </div>`).join("")}
        </div>
      </div>
      <div class="card card-pad">
        <div class="section-heading">${ICN.map} Problems by Corridor</div>
        <div class="bar-report">
          ${corridorRows.map(([d,c])=>`
            <div class="bar-report-row">
              <span class="subtle" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${d}</span>
              <div class="bar-track"><div class="bar-fill" style="width:${(c/maxCorridor*100)}%;background:var(--blue);"></div></div>
              <span class="cell-strong">${c}</span>
            </div>`).join("")}
        </div>
      </div>
    </div>
    <div class="card card-pad" style="margin-top:14px;">
      <div class="section-heading">${ICN.repeat} Recurring Problems</div>
      <div class="table-wrap" style="border:none;">
        <table>
          <thead><tr><th>Asset</th><th>Occurrences</th><th>Latest</th><th>Status</th></tr></thead>
          <tbody>
            ${Object.entries(RECURRING_HISTORY).map(([a,rows])=>`
              <tr onclick="openAssetDetail('${a}')">
                <td class="cell-id">${a}</td>
                <td class="cell-strong">${rows.length}</td>
                <td class="cell-faint">${fmtDate(rows[rows.length-1].date)}</td>
                <td>${badge('Recurring','red')}</td>
              </tr>`).join("")}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

/* ============================================================
   OVERLAYS (drawer / modal)
   ============================================================ */
function renderOverlays(){
  const el = document.getElementById("overlays");
  let html = "";
  if(state.drawerTask) html += taskDrawerHTML(state.drawerTask);
  if(state.selectedAsset) html += assetDetailHTML(state.selectedAsset);
  if(state.blockDetail) html += blockDetailHTML(state.blockDetail);
  el.innerHTML = html;
}

/* ============================================================
   MASTER RENDER
   ============================================================ */
function renderViewport(){
  const fn = {
    dashboard:renderDashboard, report:renderReport, tasks:renderTasks, assets:renderAssets,
    blocks:renderBlocks, breakdown:renderBreakdown, history:renderHistory, ai:renderAI,
    map:renderMap, reports:renderReports,
  }[state.view];
  fn && fn();
}
function renderAll(){
  renderSidebar();
  renderTopbar();
  renderViewport();
  renderOverlays();
  if(typeof updateConnPill === "function") updateConnPill();
}
document.addEventListener('keydown', e=>{ if(e.key==='Escape'){ closeDrawer(); closeAssetDetail(); closeBlockDetail(); }});

/* ============================================================
   PERSISTENCE — every report leaves the browser
   ------------------------------------------------------------
   A submitted maintenance problem is saved locally and
   pushed to the RailOps planner. If either leg fails the row is
   queued locally and retried, and the controller is told exactly
   what state their report is in.
   ============================================================ */

/* "10:42" -> a full ISO timestamp for today, so the column can be timestamptz */
function toTimestamp(hhmm){
  try{
    const [h,m] = String(hhmm).split(":").map(Number);
    const d = new Date();
    d.setHours(h, m, 0, 0);
    if(d > new Date()) d.setDate(d.getDate() - 1);
    return d.toISOString();
  }catch(e){ return new Date().toISOString(); }
}

function elapsedSince(hhmm){
  try{
    const [h,m] = String(hhmm).split(":").map(Number);
    const now = new Date();
    const then = new Date(now); then.setHours(h, m, 0, 0);
    let mins = Math.round((now - then)/60000);
    if(mins < 0) mins += 1440;
    const H = Math.floor(mins/60), M = mins%60;
    return H ? `${H}h ${M}m` : `${M}m`;
  }catch(e){ return "—"; }
}

/* Shape a wizard payload into a maintenance-request row. */
function buildMaintenanceRow(w){
  const C = window.TMS_CONFIG;
  return {
    request_id:      w.taskId,
    asset_id:        w.assetId,
    asset_type:      w.assetType,
    corridor:        w.corridor || null,
    location_km:     w.km || null,
    defect:          w.defect,
    criticality:     w.criticality,
    urgency:         w.urgency,
    safety_impact:   w.safety,
    detected_at:     w.detected || new Date().toISOString(),
    maintenance_type:w.maintType,
    duration_min:    Number(w.duration) || null,
    due_date:        w.due || null,
    description:     w.description || w.notes || null,
    required_action: w.requiredAction || null,
    crew_required:   Number(w.crewReq) || null,
    crew_type:       w.crewType || null,
    equipment:       w.equipment && w.equipment.length ? w.equipment : null,
    block_required:  !!w.blockRequired,
    block_type:      w.blockType || null,
    preferred_date:  w.prefDate || null,
    preferred_start: w.prefStart || null,
    preferred_duration_min: Number(w.prefDuration) || null,
    min_duration_min: Number(w.minDuration) || null,
    max_duration_min: Number(w.maxDuration) || null,
    flexibility:     w.flexibility || null,
    ai_priority:     computeAIRisk({ criticality:w.criticality, urgency:w.urgency, safety:w.safety,
                                     overdueDays:0, trains:0, recurring:false }) || null,
    status:          w.blockRequired ? "Submitted" : "Pending",
    division:        C.DIVISION,
    reported_by:     C.REPORTER,
    source:          "TMS",
  };
}

async function submitToCOA(){
  const btn = document.getElementById("submitBtn");
  if(btn){ btn.disabled = true; btn.textContent = "Submitting…"; }

  const w   = state.wizard.data;
  const row = buildMaintenanceRow(w);

  /* 1 — persist locally */
  const saved = await DB.insert("maintenance_requests", row);

  /* 2 — hand to the RailOps planner so it can schedule a block */
  const planned = await NX.createRequest({
    request_id: row.request_id,
    asset_id:   row.asset_id,
    maintenance_type: row.maintenance_type,
    duration_min: row.duration_min,
    block_required: row.block_required,
    priority: row.ai_priority,
    preferred_date: row.preferred_date,
    preferred_start: row.preferred_start,
  });

  /* 3 — reflect it in the local tables straight away */
  TASKS.unshift({
    id: w.taskId, assetId: w.assetId, assetType: w.assetType,
    corridor: w.corridor || CORRIDORS[0], km: w.km, defect: w.defect,
    maintType: w.maintType, criticality: w.criticality, urgency: w.urgency,
    safety: w.safety, detected: (w.detected||"").slice(0,10), due: w.due,
    duration: Number(w.duration)||60, crewReq: Number(w.crewReq)||2,
    crewType: w.crewType, equipment: w.equipment||[],
    blockRequired: !!w.blockRequired, blockType: w.blockType,
    status: w.blockRequired ? "Submitted" : "Pending",
    aiPriority: row.ai_priority || 50, trains: 0, overdueDays: 0,
    desc: w.description || "",
  });
  if(w.blockRequired){
    BLOCK_REQUESTS.unshift({
      id: w.taskId, taskId: w.taskId, asset: w.assetId,
      title: w.maintType, km: w.km,
      requested: (w.prefStart||"--:--") + "–" + (w.prefStart||"--:--"),
      status: planned.ok ? "Under COA Review" : "Submitted",
      coaNote: planned.ok ? "Received by COA planner." : "Queued — planner unreachable.",
    });
  }

  /* 4 — tell the controller what actually happened */
  if(saved.ok && planned.ok){
    showToast(`${w.taskId} saved and sent to COA`, "success");
  } else if(saved.ok){
    showToast(`${w.taskId} saved. Planner offline — it will pick this up on reconnect.`, "warn");
  } else if(saved.queued){
    showToast(`${w.taskId} held locally (${saved.pending} waiting). It will sync when the database is reachable.`, "warn");
  } else {
    showToast(`Could not save ${w.taskId}: ${saved.reason}`, "error");
  }

  updateConnPill();

  /* 5 — reset the wizard for the next report */
  state.wizard.step = 1;
  const nextNum = 1055 + Math.floor(Math.random()*400);
  state.wizard.data = { ...state.wizard.data, taskId: uid("TMS", nextNum),
    assetId:"", defect:"", criticality:"", urgency:"", safety:"", notes:"",
    maintType:"", duration:"", due:"", description:"", requiredAction:"",
    equipment:[], blockRequired:null, blockType:"", prefDate:"", prefStart:"" };

  setTimeout(()=>setView(w.blockRequired ? "blocks" : "tasks"), 450);
}

/* Breakdown escalation is also persisted locally. */
async function escalateBreakdown(assetId, kind){
  const b = BREAKDOWNS.find(x => x.asset === assetId);
  if(!b) return;
  const C = window.TMS_CONFIG;

  const row = {
    asset_id: b.asset,
    location_km: b.km,
    section: b.section,
    detected_at: toTimestamp(b.detected),
    detected_local: b.detected,
    trains_affected: b.trains,
    required_action: b.action,
    block_required: b.blockRequired,
    nearest_crew_km: b.nearestCrewKm,
    nearest_wagon_km: b.nearestWagonKm,
    escalation: kind,
    status: "Active",
    division: C.DIVISION,
    reported_by: C.REPORTER,
  };

  const saved = await DB.insert("breakdowns", row);

  if(kind === "block"){
    await NX.emergencyBlock({ asset_id:b.asset, section:b.section, reason:b.action });
  }

  const what = kind === "block" ? "Emergency block requested"
             : kind === "crew"  ? `Crew dispatched (${b.nearestCrewKm} km out)`
             : "Emergency repair logged";

  if(saved.ok)      showToast(`${what} · recorded`, "success");
  else if(saved.queued) showToast(`${what} · held locally, will sync (${saved.pending} waiting)`, "warn");
  else              showToast(`${what}, but not saved: ${saved.reason}`, "error");

  updateConnPill();
}

/* ============================================================
   CONNECTION STATUS
   ============================================================ */
function updateConnPill(){
  const el = document.getElementById("connPill");
  if(!el) return;
  const pending = DB.pending();
  if(pending){
    el.dataset.state = "queued";
    el.innerHTML = `<span class="conn-dot"></span>${pending} waiting to sync`;
    el.title = "Reports are saved on this device and will upload automatically.";
  } else if(NX.isOnline()){
    el.dataset.state = "live";
    el.innerHTML = `<span class="conn-dot"></span>Connected`;
    el.title = "The RailOps planner is reachable.";
  } else {
    el.dataset.state = "sim";
    el.innerHTML = `<span class="conn-dot"></span>Local mode`;
    el.title = "The RailOps planner is not responding. Reports are saved on this device.";
  }
}

/* Retry queued writes whenever the browser regains a connection. */
async function syncQueue(){
  if(!DB.configured) return;
  const r = await DB.flush();
  if(r.flushed){
    showToast(`${r.flushed} queued report${r.flushed>1?'s':''} uploaded`, "success");
  }
  updateConnPill();
}
window.addEventListener("online", syncQueue);
setInterval(syncQueue, 60000);

/* Reports filed by other controllers appear without a refresh. */
(function watchIncoming(){
  if(!DB.configured) return;
  DB.subscribe("maintenance_requests", row => {
    if(TASKS.some(t => t.id === row.request_id)) return;   // our own write
    TASKS.unshift({
      id: row.request_id, assetId: row.asset_id, assetType: row.asset_type,
      corridor: row.corridor || CORRIDORS[0], km: row.location_km, defect: row.defect,
      maintType: row.maintenance_type, criticality: row.criticality, urgency: row.urgency,
      safety: row.safety_impact, detected: (row.detected_at||"").slice(0,10), due: row.due_date,
      duration: row.duration_min, crewReq: row.crew_required, crewType: row.crew_type,
      equipment: row.equipment || [], blockRequired: row.block_required,
      blockType: row.block_type, status: row.status, aiPriority: row.ai_priority || 50,
      trains: 0, overdueDays: 0, desc: row.description || "",
    });
    showToast(`New report ${row.request_id} from ${row.reported_by || 'another controller'}`, "info");
    renderSidebar();
    if(state.view === "tasks" || state.view === "dashboard") renderViewport();
  });
})();

/* ============================================================
   LIVE DASHBOARD
   Asset health drifts and the KPI strip follows it, so the
   dashboard is never a frozen snapshot.
   ============================================================ */
(function liveDrift(){
  if(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  setInterval(() => {
    ASSETS.forEach(a => {
      const drift = (Math.random() - 0.52) * 1.6;
      a.health = Math.max(8, Math.min(99, Math.round((a.health + drift) * 10) / 10));
      a.status = a.health < 35 ? "Critical" : a.health < 62 ? "Attention Required" : "Healthy";
    });
    if(state.drawerTask || state.selectedAsset || state.blockDetail) return;
    if(state.view === "dashboard") renderDashboard();
    if(state.view === "assets")    renderAssets();
  }, 9000);
})();

async function hydratePersistedReports(){
  const r = await NX.readTmsRecords("maintenance_requests");
  if(!r.ok || !Array.isArray(r.data)) return;
  r.data.slice().reverse().forEach(row=>{
    if(TASKS.some(t=>t.id===row.request_id)) return;
    TASKS.unshift({id:row.request_id,assetId:row.asset_id,assetType:row.asset_type||"Rail",corridor:row.corridor||CORRIDORS[0],km:row.location_km||"",defect:row.defect||"Other",maintType:row.maintenance_type||"Corrective Maintenance",criticality:row.criticality||"Medium",urgency:row.urgency||"Planned",safety:row.safety_impact||"Medium",detected:(row.detected_at||"").slice(0,10),due:row.due_date||"",duration:Number(row.duration_min)||60,crewReq:Number(row.crew_required)||1,crewType:row.crew_type||"Track Maintenance Gang",equipment:Array.isArray(row.equipment)?row.equipment:[],blockRequired:!!row.block_required,blockType:row.block_type||"",status:row.status||"Pending",aiPriority:Number(row.ai_priority)||50,trains:0,overdueDays:0,desc:row.description||""});
  });
  renderAll();
}

/* ============================================================
   BOOT
   ============================================================ */
(async function boot(){
  NX.onStatus(() => updateConnPill());
  await NX.liveState();          // probe once so the pill is accurate
  await syncQueue();
  await hydratePersistedReports();
  updateConnPill();
})();

renderAll();
updateConnPill();
