"use client";

import { useState } from "react";

export default function MetadataForm({ metadata, onChange }) {
  const [gpsState, setGpsState] = useState("idle"); // idle | busy | ok | error

  function set(field, value) {
    onChange({ ...metadata, [field]: value });
  }

  function captureGps() {
    if (!navigator.geolocation) {
      setGpsState("error");
      return;
    }
    setGpsState("busy");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        onChange({
          ...metadata,
          latitude: pos.coords.latitude.toFixed(5),
          longitude: pos.coords.longitude.toFixed(5),
          gpsAccuracy: Math.round(pos.coords.accuracy),
        });
        setGpsState("ok");
      },
      () => setGpsState("error"),
      { enableHighAccuracy: true, timeout: 12000 }
    );
  }

  return (
    <section className="bg-panel border border-line rounded-lg p-4 space-y-4">
      <p className="field-label">02 · Inspection details</p>

      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <label className="field-label block mb-1.5" htmlFor="inspector">Inspector name</label>
          <input id="inspector" className="field-input" value={metadata.inspector} onChange={(e) => set("inspector", e.target.value)} placeholder="D. Heatley" />
        </div>
        <div>
          <label className="field-label block mb-1.5" htmlFor="cert">Cert / comp. no.</label>
          <input id="cert" className="field-input" value={metadata.cert} onChange={(e) => set("cert", e.target.value)} placeholder="LEEA-0000" />
        </div>
        <div>
          <label className="field-label block mb-1.5" htmlFor="tag">Equipment ID / tag</label>
          <input id="tag" className="field-input" value={metadata.equipmentTag} onChange={(e) => set("equipmentTag", e.target.value)} placeholder="FK-4092" />
        </div>
        <div className="col-span-2">
          <label className="field-label block mb-1.5" htmlFor="site">Site / installation</label>
          <input id="site" className="field-input" value={metadata.site} onChange={(e) => set("site", e.target.value)} placeholder="Site name or installation" />
        </div>
        <div>
          <label className="field-label block mb-1.5" htmlFor="category">Category</label>
          <select id="category" className="field-input" value={metadata.category} onChange={(e) => set("category", e.target.value)}>
            <option>Forklift / telehandler</option>
            <option>Crane / lifting appliance</option>
            <option>Lifting accessories (slings, shackles)</option>
            <option>MEWP / access platform</option>
            <option>Scaffolding</option>
            <option>Hydraulic equipment</option>
            <option>Other work equipment</option>
          </select>
        </div>
        <div>
          <label className="field-label block mb-1.5" htmlFor="itype">Inspection type</label>
          <select id="itype" className="field-input" value={metadata.inspectionType} onChange={(e) => set("inspectionType", e.target.value)}>
            <option>Pre-use check (daily)</option>
            <option>Weekly inspection</option>
            <option>Post-incident check</option>
            <option>Spot check</option>
          </select>
        </div>
      </div>

      <div className="border-t border-line pt-3">
        <div className="flex items-center justify-between mb-2">
          <p className="field-label">Location</p>
          <button
            type="button"
            onClick={captureGps}
            className="font-display uppercase tracking-[0.1em] text-[12px] text-amber border border-amber/40 rounded px-2.5 py-1 active:translate-y-px"
          >
            {gpsState === "busy" ? "Locating…" : "Capture GPS"}
          </button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <input
            aria-label="Latitude"
            className="field-input font-mono text-sm"
            value={metadata.latitude}
            onChange={(e) => set("latitude", e.target.value)}
            placeholder="Latitude"
          />
          <input
            aria-label="Longitude"
            className="field-input font-mono text-sm"
            value={metadata.longitude}
            onChange={(e) => set("longitude", e.target.value)}
            placeholder="Longitude"
          />
        </div>
        {gpsState === "ok" && metadata.gpsAccuracy && (
          <p className="text-[12px] text-pass mt-1.5 font-mono">Locked · accuracy ±{metadata.gpsAccuracy}m</p>
        )}
        {gpsState === "error" && (
          <p className="text-[12px] text-dim mt-1.5">GPS unavailable — enter coordinates manually or leave blank.</p>
        )}
      </div>
    </section>
  );
}
