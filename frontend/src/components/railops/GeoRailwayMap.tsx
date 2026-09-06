"use client";

import React, { useMemo } from "react";
import { MapContainer, TileLayer, CircleMarker, Polyline, Popup, Marker } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Station, Route, Train, MaintenanceBlock } from "@/lib/api";

interface GeoRailwayMapProps {
  stations: Station[];
  routes: Route[];
  trains: Train[];
  maintenanceBlocks: MaintenanceBlock[];
  selectedStation: Station | null;
  selectedTrain: Train | null;
  selectedRoute: Route | null;
  selectedBlock: MaintenanceBlock | null;
  onSelectStation: (s: Station | null) => void;
  onSelectTrain: (t: Train | null) => void;
  onSelectRoute: (r: Route | null) => void;
  onSelectBlock: (b: MaintenanceBlock | null) => void;
}

export default function GeoRailwayMap({
  stations,
  routes,
  trains,
  maintenanceBlocks,
  selectedStation,
  selectedTrain,
  selectedRoute,
  selectedBlock,
  onSelectStation,
  onSelectTrain,
  onSelectRoute,
  onSelectBlock,
}: GeoRailwayMapProps) {
  const stationMap = useMemo(() => {
    const map = new Map<string, Station>();
    stations.forEach((s) => map.set(s.id, s));
    return map;
  }, [stations]);

  const routeMap = useMemo(() => {
    const map = new Map<string, Route>();
    routes.forEach((r) => map.set(r.id, r));
    return map;
  }, [routes]);

  // Center on South Indian railway corridor (around Salem / Jolarpettai)
  const centerLat = 12.2;
  const centerLng = 78.4;

  const getRouteColor = (status: string) => {
    switch (status) {
      case "UNDER_MAINTENANCE":
      case "BLOCKED":
      case "EMERGENCY_BLOCK":
        return "#ef4444";
      case "MAINTENANCE_SCHEDULED":
        return "#eab308";
      case "ACTIVE_TRAIN":
        return "#0284c7";
      case "ALTERNATIVE_AVAILABLE":
        return "#f59e0b";
      case "AVAILABLE":
      default:
        return "#22c55e";
    }
  };

  return (
    <div className="relative w-full h-[580px] rounded-2xl overflow-hidden border border-border shadow-2xl">
      <MapContainer
        center={[centerLat, centerLng]}
        zoom={8}
        scrollWheelZoom={true}
        className="w-full h-full"
      >
        <TileLayer
          attribution='&copy; <a href="https://carto.com/">CARTO</a>'
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        />

        {/* 1. Track Polylines */}
        {routes.map((route) => {
          const sFrom = stationMap.get(route.source_station);
          const sTo = stationMap.get(route.destination_station);
          if (!sFrom || !sTo) return null;

          const isBlocked =
            route.status === "UNDER_MAINTENANCE" ||
            route.status === "BLOCKED" ||
            route.status === "EMERGENCY_BLOCK";
          const strokeColor = getRouteColor(route.status);

          return (
            <Polyline
              key={route.id}
              positions={[
                [sFrom.latitude, sFrom.longitude],
                [sTo.latitude, sTo.longitude],
              ]}
              pathOptions={{
                color: strokeColor,
                weight: isBlocked ? 6 : 4,
                dashArray: isBlocked ? "8, 6" : undefined,
                opacity: 0.9,
              }}
              eventHandlers={{
                click: () => onSelectRoute(route),
              }}
            >
              <Popup>
                <div className="text-xs p-1">
                  <div className="font-bold text-slate-800">
                    {sFrom.name} &rarr; {sTo.name}
                  </div>
                  <div className="text-slate-600">Status: {route.status}</div>
                  <div className="text-slate-600">Distance: {route.distance} km</div>
                  <div className="text-slate-600">Capacity: {route.capacity} trains/day</div>
                </div>
              </Popup>
            </Polyline>
          );
        })}

        {/* 2. Station Circle Markers */}
        {stations.map((st) => {
          const isJunction = st.is_junction;
          const isSelected = selectedStation?.id === st.id;

          return (
            <CircleMarker
              key={st.id}
              center={[st.latitude, st.longitude]}
              radius={isJunction ? 9 : 6}
              pathOptions={{
                color: isSelected ? "#38bdf8" : isJunction ? "#06b6d4" : "#94a3b8",
                fillColor: isSelected ? "#0284c7" : "#0f172a",
                fillOpacity: 1,
                weight: isJunction ? 3 : 2,
              }}
              eventHandlers={{
                click: () => onSelectStation(st),
              }}
            >
              <Popup>
                <div className="text-xs p-1">
                  <div className="font-bold text-slate-900">{st.name} ({st.code})</div>
                  <div className="text-slate-700">{st.division} | {st.zone}</div>
                  <div className="text-slate-700">Platforms: {st.platforms}</div>
                  <div className="text-cyan-700 font-semibold mt-1">Click to view station operations</div>
                </div>
              </Popup>
            </CircleMarker>
          );
        })}

        {/* 3. Trains Moving along GIS Coordinates */}
        {trains.map((train) => {
          const route = routeMap.get(train.current_route);
          if (!route) return null;
          const sFrom = stationMap.get(route.source_station);
          const sTo = stationMap.get(route.destination_station);
          if (!sFrom || !sTo) return null;

          const progress = (train.progress_percentage || 50) / 100;
          const lat = sFrom.latitude + (sTo.latitude - sFrom.latitude) * progress;
          const lng = sFrom.longitude + (sTo.longitude - sFrom.longitude) * progress;

          const trainIcon = L.divIcon({
            className: "custom-train-marker",
            html: `<div style="background-color: ${train.color}; width: 14px; height: 14px; border-radius: 50%; border: 2px solid white; box-shadow: 0 0 10px ${train.color};"></div>`,
            iconSize: [14, 14],
          });

          return (
            <Marker
              key={train.id}
              position={[lat, lng]}
              icon={trainIcon}
              eventHandlers={{
                click: () => onSelectTrain(train),
              }}
            >
              <Popup>
                <div className="text-xs p-1">
                  <div className="font-bold text-slate-900">{train.name} (#{train.id})</div>
                  <div className="text-slate-700">Type: {train.type}</div>
                  <div className="text-slate-700">Speed: {train.speed} km/h</div>
                  <div className="text-slate-700">Status: {train.status}</div>
                </div>
              </Popup>
            </Marker>
          );
        })}
      </MapContainer>
    </div>
  );
}
