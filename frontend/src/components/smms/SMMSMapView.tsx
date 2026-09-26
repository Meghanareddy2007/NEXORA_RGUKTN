"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { TopBar } from "@/components/TopBar";
import { fetchProblemReports, fetchSignallingMap, type ProblemReport, type SignallingMapData } from "@/lib/smmsApi";
import SignallingAssetHealthMap, { type FocusRequest, type MapMode } from "@/components/smms/SignallingAssetHealthMap";
import { FilterBar, StatusStrip } from "@/components/smms/signalling-map/FilterBar";
import { SMMSInfoPanel } from "@/components/smms/signalling-map/AssetPanel";
import { DEFAULT_FILTERS, MapFilters, STATUS_META, STATUS_ORDER, applyFilters } from "@/components/smms/signalling-map/model";

export default function SMMSMapView({ onTwin }: { onTwin?: (id:string)=>void }) {

  const [data, setData] = useState<SignallingMapData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [problemReports, setProblemReports] = useState<ProblemReport[] | null>(null);

  const [filters, setFilters] = useState<MapFilters>(DEFAULT_FILTERS);
  const [mode, setMode] = useState<MapMode>("schematic");
  const [expandSectionLevel, setExpandSectionLevel] = useState(false);
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
  const [selectedSectionId, setSelectedSectionId] = useState<string | null>(null);
  const [focus, setFocus] = useState<FocusRequest | null>(null);

  const canViewReports = true;
  const canReport = true;
  const canViewTwin = true;

  const load = useCallback(() => {
    setLoading(true);
    fetchSignallingMap()
      .then((d) => {
        setData(d);
        setError(null);
      })
      .catch(() => setError("Could not load the signalling map. Check your connection and try again."))
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  // Problem reports are optional context for the panel; a failure here must
  // never block the map.
  useEffect(() => {
    if (!canViewReports) {
      setProblemReports(null);
      return;
    }
    fetchProblemReports({ limit: 500 })
      .then(setProblemReports)
      .catch(() => setProblemReports(null));
  }, [canViewReports]);

  const assetsById = useMemo(() => new Map((data?.assets ?? []).map((a) => [a.map_id, a])), [data]);
  const visible = useMemo(() => (data ? applyFilters(data.assets, filters) : []), [data, filters]);
  const selectedAsset = selectedAssetId ? assetsById.get(selectedAssetId) ?? null : null;

  const requestFocus = (f: Omit<FocusRequest, "nonce">) => setFocus({ ...f, nonce: Date.now() });

  // Clicking on the map: select without moving the camera.
  const selectAssetOnMap = (id: string) => {
    const a = assetsById.get(id);
    setSelectedAssetId(id);
    if (a) setSelectedSectionId(a.corridor_id);
  };
  // Choosing from a list in the panel: also bring it into view.
  const selectAssetFromPanel = (id: string) => {
    selectAssetOnMap(id);
    const a = assetsById.get(id);
    if (a) requestFocus({ assetId: id, corridorId: a.corridor_id });
  };
  const selectSection = (corridorId: string) => {
    setSelectedAssetId(null);
    setSelectedSectionId(corridorId);
    requestFocus({ corridorId });
  };

  // Section filter also frames that section.
  const changeFilters = (f: MapFilters) => {
    if (f.section !== filters.section && f.section !== "all") requestFocus({ corridorId: f.section });
    setFilters(f);
  };

  const emptyNote = useMemo(() => {
    if (!data || visible.length > 0 || !filters.category) return null;
    return data.coverage.categories.find((c) => c.category === filters.category && !c.available)?.note ?? null;
  }, [data, visible.length, filters.category]);

  return (
    <div className="flex h-full flex-col">
      <TopBar
        title="SMMS Signalling Map"
        subtitle="Signals, point machines, interlocking and cable plant along the railway sections"
      />

      <div className="flex flex-col gap-3 p-4 md:p-6">
        {error && (
          <div role="alert" className="flex items-center justify-between rounded-md border border-danger/30 bg-danger/10 p-3 text-sm text-danger">
            {error}
            <button type="button" onClick={load} className="rounded border border-danger/40 px-2 py-1 text-xs hover:bg-danger/10">
              Retry
            </button>
          </div>
        )}

        {!data && !error && (
          <p className="flex items-center gap-2 py-16 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" /> Loading map…
          </p>
        )}

        {data && data.assets.length === 0 && (
          <p className="text-xs text-muted-foreground">No signalling assets are available to plot.</p>
        )}

        {data && data.assets.length > 0 && (
          <>
            <FilterBar data={data} filters={filters} onChange={changeFilters} />
            <StatusStrip data={data} filters={filters} onChange={changeFilters} />

            <div className="flex items-center justify-between text-[11px] text-muted-foreground">
              <span aria-live="polite">
                Showing <b className="text-foreground">{visible.length}</b> of {data.assets.length} assets
                {emptyNote ? <span> — {emptyNote}</span> : null}
              </span>
              <button
                type="button"
                onClick={load}
                disabled={loading}
                className="flex items-center gap-1 rounded px-1.5 py-0.5 hover:text-foreground disabled:opacity-50"
                title={`Data generated ${data.generated_at}`}
              >
                <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} /> Refresh
              </button>
            </div>

            <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_370px]">
              <div className="h-[700px] overflow-hidden rounded-xl border border-border">
                <SignallingAssetHealthMap
                  data={data}
                  assets={visible}
                  mode={mode}
                  onModeChange={setMode}
                  selectedAssetId={selectedAssetId}
                  selectedSectionId={selectedSectionId}
                  expandSectionLevel={expandSectionLevel}
                  onToggleExpand={() => setExpandSectionLevel((v) => !v)}
                  focus={focus}
                  onFit={() => requestFocus({ fitAll: true })}
                  onSelectAsset={selectAssetOnMap}
                  onSelectSection={selectSection}
                />
              </div>

              <SMMSInfoPanel
                data={data}
                visible={visible}
                selectedAsset={selectedAsset}
                selectedSectionId={selectedSectionId}
                onSelectAsset={selectAssetFromPanel}
                onSelectSection={selectSection}
                onCloseAsset={() => setSelectedAssetId(null)}
                onCloseSection={() => {
                  setSelectedAssetId(null);
                  setSelectedSectionId(null);
                }}
                problemReports={problemReports}
                canReportProblem={canReport}
                onOpenTwin={canViewTwin ? onTwin : undefined}
              />
            </div>

            <details className="rounded-xl border border-border bg-card/60 px-4 py-3 text-xs">
              <summary className="cursor-pointer font-medium">Data coverage and how the map reads the data</summary>
              <div className="mt-3 grid gap-5 md:grid-cols-2">
                <div>
                  <h3 className="mb-1.5 font-semibold">What the datasets contain</h3>
                  <ul className="space-y-1 text-muted-foreground">
                    {data.coverage.categories.map((c) => (
                      <li key={c.category}>
                        <span className="text-foreground">{c.category}</span>: {c.count}
                        {c.note ? <span> — {c.note}</span> : null}
                      </li>
                    ))}
                  </ul>
                  <p className="mt-2 text-muted-foreground">
                    {data.coverage.assets_on_map} assets = {data.coverage.register_assets} from the signalling register +{" "}
                    {data.coverage.assets_on_map - data.coverage.register_assets} listed only in the {data.coverage.maintenance_records} maintenance
                    records. {data.coverage.assets_without_exact_position} have a recorded km outside their section&apos;s length, so they are
                    shown at section level instead of at a point on the line.
                  </p>
                </div>
                <div>
                  <h3 className="mb-1.5 font-semibold">Status rules</h3>
                  <ul className="space-y-1 text-muted-foreground">
                    {STATUS_ORDER.map((s) => (
                      <li key={s} className="flex gap-2">
                        <span className="mt-1 h-2 w-2 flex-none rounded-full" style={{ background: STATUS_META[s].color }} />
                        <span>
                          <span className="text-foreground">{STATUS_META[s].label}</span> — {STATUS_META[s].rule}
                        </span>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-2 text-muted-foreground">
                    Failures are open Corrective/Emergency maintenance records; severity comes from their criticality and safety-risk scores.
                    Critical assets: {data.coverage.critical_asset_rule.toLowerCase()}.
                  </p>
                </div>
              </div>
            </details>
          </>
        )}
      </div>

    </div>
  );
}
