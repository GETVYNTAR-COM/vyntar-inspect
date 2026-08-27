"use client";

import { useMemo, useState } from "react";
import { downloadCsv } from "@/lib/storage";
import { getCounts, getRiskDisplay, getStatusPresentation } from "@/lib/inspection/view";

const TONE_CLASSES = {
  pass: "text-pass border-pass/50",
  amber: "text-amber border-amber/50",
  signal: "text-signal border-signal/50",
};

export default function HistoryView({ audits, onPrint, onDelete, onClearAll }) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("ALL");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return audits.filter((a) => {
      if (status !== "ALL" && a.result?.overall_status !== status) return false;
      if (!q) return true;
      const haystack = [a.auditRef, a.metadata?.equipmentTag, a.metadata?.site, a.metadata?.inspector]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [audits, query, status]);

  if (audits.length === 0) {
    return (
      <section className="bg-panel border border-line rounded-lg p-8 text-center">
        <p className="font-display uppercase tracking-[0.12em] text-bone text-lg">No audits saved yet</p>
        <p className="text-sm text-dim mt-2 leading-relaxed">
          Completed and signed inspections are stored on this device and will appear here.
        </p>
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <input
          aria-label="Search audits"
          className="field-input col-span-2"
          placeholder="Search tag, site, inspector…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <select aria-label="Filter by status" className="field-input" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="ALL">All</option>
          <option value="PASS">Pass</option>
          <option value="CONDITIONAL_PASS">Conditional</option>
          <option value="HOLD_FOR_VERIFICATION">Hold</option>
          <option value="FAIL">Do not use</option>
          <option value="CRITICAL_FAIL">Critical fail</option>
        </select>
      </div>

      {filtered.map((audit) => {
        const badge = getStatusPresentation(audit.result?.overall_status);
        const risk = getRiskDisplay(audit.result);
        const counts = getCounts(audit.result);
        return (
          <article key={audit.id} className="bg-panel border border-line rounded-lg p-4">
            <div className="flex gap-3">
              {audit.photoThumb ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={audit.photoThumb} alt="" className="w-16 h-16 object-cover rounded border border-line shrink-0" />
              ) : (
                <div className="w-16 h-16 rounded border border-line shrink-0 bg-void" />
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[15px] text-bone truncate">
                    {audit.metadata?.equipmentTag || "Untagged"} · {audit.result?.equipment?.type || audit.metadata?.category}
                  </p>
                  <span
                    className={`font-display uppercase tracking-[0.1em] text-[11px] border rounded px-2 py-0.5 shrink-0 ${
                      TONE_CLASSES[badge.tone]
                    }`}
                  >
                    {badge.short}
                  </span>
                </div>
                <p className="text-sm text-dim truncate">{audit.metadata?.site || "No site recorded"}</p>
                <p className="font-mono text-[11px] text-dim mt-1">
                  {audit.signedAt} · risk {risk.pending ? risk.display : `${risk.display}/100`} · {counts.hazards} hazard
                  {counts.hazards === 1 ? "" : "s"}
                  {counts.verifications > 0 ? ` · ${counts.verifications} to verify` : ""} · {audit.auditRef}
                </p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 mt-3">
              <button type="button" className="btn-ghost" onClick={() => onPrint(audit)}>
                Print report
              </button>
              <button
                type="button"
                className="btn-ghost !text-signal !border-signal/40"
                onClick={() => onDelete(audit.id)}
              >
                Delete
              </button>
            </div>
          </article>
        );
      })}

      <div className="grid grid-cols-2 gap-3 pt-1">
        <button type="button" className="btn-ghost" onClick={() => downloadCsv(filtered)}>
          Export CSV
        </button>
        <button
          type="button"
          className="btn-ghost !text-signal !border-signal/40"
          onClick={() => {
            if (window.confirm("Delete every saved audit on this device? This cannot be undone.")) onClearAll();
          }}
        >
          Clear all
        </button>
      </div>
    </section>
  );
}
