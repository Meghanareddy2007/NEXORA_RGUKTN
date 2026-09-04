# AI-Powered Automatic Block Planning to Maximize Asset Availability for Train Operations
### Smart India Hackathon — Problem Statement 27 | Complete Project Blueprint

---

## 1. Problem Understanding

**Ministry/Organization:** Ministry of Railways
**Category:** Software
**Domain:** Transportation & Logistics

**The core problem:**
Indian Railways issues "engineering blocks" — planned periods where a track section is closed for maintenance, inspection, or repair. Today, block planning is largely manual, done via spreadsheets, phone calls, and paper registers across multiple departments (Engineering, Signal & Telecom, Electrical, Operating). This causes:

- Conflicting/overlapping block requests across departments
- Poor coordination → asset (track/loco/crew) idle time
- Reduced line capacity and delayed trains
- No predictive visibility into which blocks maximize maintenance value vs. traffic disruption
- No centralized real-time dashboard for decision-makers

**Goal:** Build an AI-powered system that automatically plans, optimizes, and schedules blocks to **maximize asset (track) availability** while still allowing all necessary maintenance, minimizing conflicts and train delays.

---

## 2. Proposed Solution — One-Line Pitch

> An intelligent, AI-driven block planning platform that ingests maintenance requests, train schedules, and asset data, then uses optimization + ML to auto-generate conflict-free block schedules — visualized on interactive Gantt timelines and rail-network maps, with real-time alerts and what-if simulation for railway planners.

---

## 3. System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         CLIENT LAYER                              │
│  Next.js (React + TypeScript) SPA/SSR                            │
│  Tailwind CSS + shadcn/ui | Recharts | Leaflet | Gantt Chart      │
│  Role-based dashboards: Planner / Section Controller / Admin      │
└───────────────────────────┬────────────────────────────────────┘
                             │ REST / WebSocket (real-time updates)
┌───────────────────────────▼────────────────────────────────────┐
│                        API GATEWAY LAYER                          │
│           FastAPI (Python) — REST APIs, Auth (JWT/OAuth2)        │
│           WebSocket server for live block-status push            │
└──────┬───────────────┬───────────────┬───────────────┬──────────┘
       │               │               │               │
┌──────▼─────┐  ┌──────▼──────┐ ┌──────▼──────┐ ┌──────▼──────┐
│  Block      │  │  AI/ML       │ │  Conflict    │ │  Notification│
│  Request    │  │  Optimization│ │  Detection   │ │  Service     │
│  Service    │  │  Engine      │ │  Engine      │ │  (SMS/Email/ │
│             │  │              │ │              │ │   Push)      │
└──────┬──────┘  └──────┬───────┘ └──────┬───────┘ └──────┬──────┘
       │                │                │                │
┌──────▼────────────────▼────────────────▼────────────────▼──────┐
│                     PostgreSQL (+ PostGIS)                        │
│   Sections, Blocks, Assets, Trains, Maintenance History,          │
│   Crew/Resource data, Historical delay data                       │
└─────────────────────────────────────────────────────────────────┘
       │
┌──────▼──────────────────────────────────────────────────────────┐
│         External Integrations (simulated for demo)                │
│   FOIS/COIS (Freight/Coaching Ops), CRIS data, NTES, Signal data  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 4. Tech Stack (as you selected)

| Layer | Technology | Purpose |
|---|---|---|
| Frontend Framework | React + Next.js (TypeScript) | SSR, routing, performance, SEO for public dashboards |
| Styling | Tailwind CSS + shadcn/ui | Rapid, consistent, accessible UI components |
| Data Viz | Recharts | KPI charts — availability %, delay trends, utilization |
| Timeline Viz | Gantt chart (e.g. `gantt-task-react` / `frappe-gantt` / custom D3) | Visualize block schedules across sections & time |
| Geo Viz | Leaflet + PostGIS/GeoJSON | Rail network map, live block locations, section status |
| Backend Framework | FastAPI (Python) | Async, high-performance REST APIs, auto OpenAPI docs |
| Database | PostgreSQL | Relational data — sections, blocks, trains, assets |
| AI/ML | scikit-learn / OR-Tools / PuLP + optional PyTorch | Optimization + predictive models |
| Realtime | WebSockets (FastAPI native) | Live block status, conflict alerts |
| Auth | OAuth2 + JWT | Role-based access (Planner, Controller, Admin, Viewer) |
| Deployment | Docker + Docker Compose (Nginx reverse proxy) | Portable, jury-demo-ready deployment |

---

## 5. Core Modules / Features

### 5.1 Block Request & Intake Module
- Digital form for departments (Engg/S&T/Electrical) to raise block requests
- Auto-captures: section, duration, type (corridor/maintenance/emergency), priority, required resources
- Bulk upload via CSV/Excel for legacy data migration

### 5.2 AI Optimization Engine (the core differentiator)
This is where your "AI-Powered Automatic" claim is proven to the jury. Two complementary techniques:

**a) Constraint-based Optimization (OR-Tools / PuLP — CP-SAT or MILP)**
Treats block scheduling as a **constraint satisfaction / scheduling optimization problem**:
- Variables: block start time, end time, section, track (up/down/single line)
- Constraints: no two blocks overlap on same section/track; minimum traffic windows must remain open; crew/resource availability; safety buffer times between blocks; priority of emergency vs planned maintenance
- Objective function: **maximize** total asset (track) availability time + maintenance completion, **minimize** total train-delay-minutes caused
- Output: an optimized, conflict-free block calendar

**b) Predictive ML Layer**
- **Delay Impact Predictor** (regression model — Random Forest/XGBoost): predicts expected train delay minutes if a block is scheduled at a given time/section, trained on historical block + delay data
- **Traffic Density Forecaster** (time-series — Prophet/ARIMA or LSTM): predicts low-traffic windows per section to recommend optimal block slots
- **Asset Failure Risk Scorer**: flags sections with rising maintenance urgency (from sensor/inspection data) so blocks get prioritized before failures occur
- These ML outputs feed as *weights/priors* into the optimization engine's objective function — this is the "AI-Powered" fusion jury will care about

### 5.3 Conflict Detection & Resolution
- Real-time engine flags overlapping requests the moment they're submitted
- Suggests 2–3 alternative auto-generated slots ranked by optimization score
- Escalation workflow for manual override with justification log (auditability)

### 5.4 Interactive Gantt Scheduling Dashboard
- Section-wise, division-wise, zone-wise Gantt views
- Drag-and-drop manual adjustment (with live re-validation against constraints)
- Color-coded by block type/priority/status (Approved/Pending/Conflict/Completed)

### 5.5 Rail Network Map (Leaflet)
- Live map of divisions/sections with block status overlay (green=available, red=blocked, amber=upcoming)
- Click-through from map to section's Gantt timeline
- Heatmap layer for delay hotspots / high-utilization corridors

### 5.6 Analytics & KPI Dashboard (Recharts)
- Asset availability % (target vs actual) trend
- Block utilization efficiency
- Delay-minutes saved (before AI vs after AI — key jury metric)
- Department-wise block request/approval turnaround time

### 5.7 What-If Simulation
- Planner can simulate "what if I add this block on Section X, Tuesday 10am–2pm" → engine instantly shows predicted delay impact and conflicts before committing

### 5.8 Notifications & Alerts
- Auto-alerts to Section Controllers, Loco Pilots' control office, Station Masters on block approval/changes
- Escalation alerts for unresolved conflicts nearing deadline

### 5.9 Role-Based Access Control
- **Planner** (raises requests), **Section Controller** (approves/monitors live), **Divisional Admin** (oversight, override), **Viewer/Auditor** (read-only, reports)

---

## 6. Database Schema (Core Tables)

```
users(id, name, role, department, zone, division)
sections(id, name, division, zone, track_type, length_km, geo_path[PostGIS])
assets(id, section_id, type, last_maintenance_date, health_score)
trains(id, number, type, priority, scheduled_route, avg_daily_frequency)
block_requests(id, section_id, requested_by, type, priority, start_time,
                end_time, status, justification, created_at)
optimized_blocks(id, block_request_id, final_start_time, final_end_time,
                  optimization_score, predicted_delay_minutes, status)
conflicts(id, block_request_id_1, block_request_id_2, type, resolution_status)
historical_delays(id, section_id, date, delay_minutes, cause, block_id_ref)
notifications(id, user_id, message, type, read_status, created_at)
audit_log(id, user_id, action, entity, timestamp, remarks)
```

---

## 7. Key REST API Endpoints (sample)

```
POST   /api/auth/login
GET    /api/sections
GET    /api/sections/{id}/map-data          # for Leaflet
POST   /api/blocks/request                  # submit new block request
GET    /api/blocks?section_id=&status=      # for Gantt view
POST   /api/optimize/run                    # trigger AI optimization engine
GET    /api/optimize/whatif                 # simulate a hypothetical block
GET    /api/conflicts                       # active conflicts
POST   /api/conflicts/{id}/resolve
GET    /api/analytics/kpi                   # for Recharts dashboards
WS     /ws/live-status                      # real-time block/conflict push
```

---

## 8. AI/ML Pipeline Flow

```
Historical Data (delays, blocks, traffic) 
        │
        ▼
 Feature Engineering (section, time-of-day, day-type, season, train density)
        │
        ▼
 ┌─────────────────────┬──────────────────────┐
 │ Delay Predictor      │ Traffic Forecaster    │
 │ (XGBoost/RF)         │ (Prophet/LSTM)        │
 └──────────┬───────────┴───────────┬──────────┘
            │                       │
            ▼                       ▼
         Predicted cost/weight inputs
                     │
                     ▼
     OR-Tools CP-SAT / MILP Optimizer
     (maximize availability, minimize delay,
      respect hard constraints)
                     │
                     ▼
        Optimized Conflict-Free Block Schedule
                     │
                     ▼
        Gantt + Map + Analytics Dashboards
```

---

## 9. Unique Value Proposition (what to emphasize to jury)

1. **Not just a scheduler — a fusion system:** ML prediction + operations-research optimization, not a rule-based calendar tool.
2. **Explainable AI angle:** every schedule decision shows *why* (predicted delay saved, conflict avoided) — builds trust with railway officials.
3. **What-if simulation** gives planners agency instead of a black-box auto-decision — critical for real-world adoption in Railways.
4. **Single source of truth** across Engineering/S&T/Electrical/Operating departments — solves the actual coordination pain point.
5. **Quantifiable impact metric**: "X% increase in asset availability, Y delay-minutes saved/month" — directly answers the PS's success criterion.

---

## 10. Feasibility & Implementation Roadmap

| Phase | Duration (hackathon-scale) | Deliverable |
|---|---|---|
| Phase 1 | Day 1 | DB schema, auth, block request module |
| Phase 2 | Day 1–2 | Optimization engine (OR-Tools) with sample/synthetic Railway data |
| Phase 3 | Day 2 | ML predictors trained on synthetic historical delay dataset |
| Phase 4 | Day 2–3 | Gantt + Leaflet + Recharts dashboards wired to APIs |
| Phase 5 | Day 3 | Conflict resolution, notifications, what-if simulation |
| Phase 6 | Final day | Polish UI, prepare demo dataset & script, deploy via Docker |

**Data for demo:** Since live Railways data (COIS/FOIS/CRIS/NTES) isn't publicly accessible, use a realistic **synthetic dataset** (a few divisions, sections, sample historical delays) — clearly disclose this to the jury as "designed for integration with CRIS/FOIS APIs; demo uses representative synthetic data."

---

## 11. Impact / Benefits (for the impact slide)

- ⬆️ Track/asset availability through optimized, non-overlapping block scheduling
- ⬇️ Train delay-minutes caused by poorly-timed maintenance blocks
- ⬇️ Manual coordination effort across departments (phone calls/spreadsheets eliminated)
- ⬆️ Maintenance completion rate (fewer rescheduled/cancelled blocks due to conflicts)
- ⬆️ Transparency & auditability of block approvals (safety + accountability)
- 📈 Scalable to zone/national level once integrated with live Railways data systems

---

## 12. Future Scope

- Integration with live COIS/FOIS/NTES/CRIS APIs
- IoT sensor data ingestion (track health, signal faults) for proactive maintenance triggers
- Reinforcement Learning agent that continuously improves scheduling policy from outcomes
- Mobile app for field engineers to update block status on-site
- Predictive maintenance recommendations (not just scheduling, but *what* to maintain and *when*)

---

## 13. Suggested Presentation Flow (for jury round)

1. Problem — the real coordination pain (30 sec)
2. Solution one-liner + architecture diagram (1 min)
3. Live demo: raise a block request → conflict detected → AI auto-resolves → Gantt + map update (2–3 min)
4. What-if simulation demo (1 min)
5. Impact metrics dashboard (30 sec)
6. Tech stack + feasibility + future scope (1 min)

---

*This document is a working blueprint — refine the constraint list, ML feature set, and demo dataset based on your team's domain research before the final presentation.*
