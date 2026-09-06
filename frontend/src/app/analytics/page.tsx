"use client";

import { useEffect, useMemo, useState } from "react";
import {
  fetchKpis,
  fetchBlocks,
  fetchCorridorRisk,
  fetchAllTasks,
  fetchNetworkDataset,
  fetchAssetsDataset,
  KpiSummary,
  Block,
  MaintenanceTask,
  NetworkCorridor,
  CorridorRisk,
  AssetRecord,
} from "@/lib/api";
import {
  AnalyticsFilters,
  DEFAULT_FILTERS,
  applyBlockFilters,
  applyTaskFilters,
  corridorLabelMap,
  buildPlanningKpis,
  buildInsights,
  buildTrafficImpact,
  buildOptimizationComparison,
  buildPriorityMatrix,
  buildSectionPressure,
  buildOperationalRisk,
  buildResourceUtilization,
} from "@/lib/analytics";
import { StatCard } from "@/components/StatCard";
import { FilterBar } from "@/components/analytics/FilterBar";
import { AIInsightsPanel } from "@/components/analytics/AIInsightsPanel";
import { BlockTimeline } from "@/components/analytics/BlockTimeline";
import { TrafficImpactChart } from "@/components/analytics/TrafficImpactChart";
import { OptimizationPerformance } from "@/components/analytics/OptimizationPerformance";
import { PriorityMatrix } from "@/components/analytics/PriorityMatrix";
import { SectionPressure } from "@/components/analytics/SectionPressure";
import { OperationalRisk } from "@/components/analytics/OperationalRisk";
import { ResourceUtilization } from "@/components/analytics/ResourceUtilization";
import { Layers, ListChecks, Gauge, ShieldCheck, Timer, Activity, Radar } from "lucide-react";

interface RawData {
  kpis: KpiSummary;
  blocks: Block[];
  tasks: MaintenanceTask[];
  network: NetworkCorridor[];
  corridorRisk: CorridorRisk[];
  assets: AssetRecord[];
}

export default function AnalyticsPage() {
  const [data, setData] = useState<RawData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<AnalyticsFilters>(DEFAULT_FILTERS);

  useEffect(() => {
    Promise.all([fetchKpis(), fetchBlocks(), fetchCorridorRisk(), fetchAllTasks(), fetchNetworkDataset(), fetchAssetsDataset()])
      .then(([kpis, blocks, corridorRisk, tasks, network, assets]) => {
        setData({ kpis, blocks, tasks, network, corridorRisk, assets });
        setError(null);
      })
      .catch(() => setError("Could not reach API. Is the backend running on :8000?"));
  }, []);

  const dates = useMemo(() => Array.from(new Set((data?.blocks ?? []).map((b) => b.date))).sort(), [data]);
  const labelFor = useMemo(() => (data ? corridorLabelMap(data.network) : {}), [data]);
  const labelForFn = (id: string) => labelFor[id] ?? id;

  // default the timeline to the earliest scheduled date, once data arrives
  useEffect(() => {
    if (dates.length && !filters.date) {
      setFilters((f) => ({ ...f, date: dates[0] }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dates.length]);

  const filteredBlocks = useMemo(() => (data ? applyBlockFilters(data.blocks, filters) : []), [data, filters]);
  const filteredBlocksNoDate = useMemo(
    () => (data ? applyBlockFilters(data.blocks, { ...filters, date: "" }) : []),
    [data, filters]
  );
  const filteredTasks = useMemo(() => (data ? applyTaskFilters(data.tasks, filters) : []), [data, filters]);

  const { rows: optimizationRows, conflictsAvoided } = useMemo(
    () => (data ? buildOptimizationComparison(filteredBlocksNoDate) : { rows: [], conflictsAvoided: 0 }),
    [data, filteredBlocksNoDate]
  );

  const kpis = useMemo(
    () => (data ? buildPlanningKpis(filteredBlocksNoDate, filteredTasks, conflictsAvoided) : null),
    [data, filteredBlocksNoDate, filteredTasks, conflictsAvoided]
  );

  const insights = useMemo(
    () => (data ? buildInsights(filteredBlocksNoDate, filteredTasks, labelForFn) : []),
    [data, filteredBlocksNoDate, filteredTasks]
  );

  const trafficImpact = useMemo(() => (data ? buildTrafficImpact(filteredBlocksNoDate) : []), [data, filteredBlocksNoDate]);

  const priorityPoints = useMemo(
    () => (data ? buildPriorityMatrix(filteredTasks, data.network, labelForFn) : []),
    [data, filteredTasks]
  );

  const sectionPressure = useMemo(
    () => (data ? buildSectionPressure(data.tasks, data.network, data.corridorRisk, labelForFn) : []),
    [data]
  );

  const operationalRisk = useMemo(
    () => (data ? buildOperationalRisk(filteredBlocksNoDate, filteredTasks) : []),
    [data, filteredBlocksNoDate, filteredTasks]
  );

  const resourceRows = useMemo(() => (data ? buildResourceUtilization(data.assets) : []), [data]);

  const corridorOptions = useMemo(
    () => (data ? data.network.map((c) => ({ value: c.corridor_id, label: `${c.corridor_id} · ${c.station_from} → ${c.station_to}` })) : []),
    [data]
  );

  return (
    <div className="flex flex-col gap-6 p-6">
      <header>
        <div className="flex items-center gap-2">
          <Radar className="h-5 w-5 text-primary" />
          <h1 className="text-xl font-semibold">Analytics &amp; Planning Intelligence</h1>
        </div>
        <p className="text-sm text-muted-foreground mt-1">
          AI-driven insights into railway maintenance block utilization, traffic impact and operational efficiency.
        </p>
      </header>

      {error && <div className="rounded-md border border-danger/30 bg-danger/10 text-danger text-sm p-3">{error}</div>}
      {!data && !error && <p className="text-sm text-muted-foreground">Loading planning intelligence…</p>}

      {data && kpis && (
        <>
          <FilterBar filters={filters} onChange={setFilters} dates={dates} corridors={corridorOptions} />

          {/* 1. KPI strip */}
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
            <StatCard label="Total Blocks Planned" value={kpis.totalBlocksPlanned} icon={Layers} tone="primary" />
            <StatCard
              label="Tasks Scheduled"
              value={`${kpis.tasksScheduled}/${kpis.totalTasks}`}
              sub="TMS + SMMS + TDMS backlog"
              icon={ListChecks}
              tone="info"
            />
            <StatCard label="Maintenance Coverage" value={`${kpis.maintenanceCoveragePct}%`} icon={Gauge} tone="success" />
            <StatCard label="Conflicts Avoided" value={kpis.conflictsAvoided} sub="vs naive baseline" icon={ShieldCheck} tone="violet" />
            <StatCard label="Avg Block Duration" value={`${kpis.avgBlockDurationMin} min`} icon={Timer} tone="warning" />
            <StatCard label="Traffic Impact" value={`${kpis.trafficImpactPct}%`} sub="blocks in Med/High traffic" icon={Activity} tone="danger" />
          </div>

          {/* 2. AI Planning Insights */}
          <AIInsightsPanel insights={insights} />

          {/* 3. Block Utilization Timeline */}
          <BlockTimeline blocks={filteredBlocks} sectionLabel={labelForFn} date={filters.date} />

          {/* 4 & 6. Traffic impact + priority matrix side by side on wide screens */}
          <div className="grid xl:grid-cols-2 gap-6">
            <TrafficImpactChart data={trafficImpact} />
            <PriorityMatrix points={priorityPoints} />
          </div>

          {/* 5. AI Optimization Performance */}
          <OptimizationPerformance rows={optimizationRows} />

          {/* 7 & 9. Section pressure + resource utilization */}
          <div className="grid xl:grid-cols-2 gap-6">
            <SectionPressure rows={sectionPressure} />
            <ResourceUtilization rows={resourceRows} />
          </div>

          {/* 8. Operational Risk */}
          <OperationalRisk items={operationalRisk} />
        </>
      )}
    </div>
  );
}
