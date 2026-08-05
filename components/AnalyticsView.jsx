"use client";

import { useMemo } from "react";

export default function AnalyticsView({ audits }) {
  const stats = useMemo(() => {
    const total = audits.length;
    if (total === 0) return null;

    const critical = audits.filter((a) => a.result?.overall_status === "CRITICAL_FAIL").length;
    const passRate = Math.round(((total - critical) / total) * 1000) / 10;
    const avgRisk = Math.round(
      audits.reduce((sum, a) => sum + (Number(a.result?.risk_score) || 0), 0) / total
    );

    const categories = {};
    for (const audit of audits) {
      for (const hazard of audit.result?.hazards || []) {
        const key = hazard.category || "OTHER";
        if (!categories[key]) categories[key] = { count: 0, critical: 0 };
        categories[key].count += 1;
        if (hazard.severity === "CRITICAL") categories[key].critical += 1;
      }
    }
    const ranked = Object.entries(categories).sort((a, b) => b[1].count - a[1].count);
    const maxCount = ranked.length ? ranked[0][1].count : 0;

    return { total, critical, passRate, avgRisk, ranked, maxCount };
  }, [audits]);

  if (!stats) {
    return (
      <section className="bg-panel border border-line rounded-lg p-8 text-center">
        <p className="font-display uppercase tracking-[0.12em] text-bone text-lg">No data yet</p>
        <p className="text-sm text-dim mt-2 leading-relaxed">
          Fleet metrics build up as signed inspections are saved on this device.
        </p>
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <Stat label="Fleet pass rate" value={`${stats.passRate}%`} tone={stats.passRate >= 90 ? "pass" : "amber"} />
        <Stat label="Total audits" value={stats.total} />
        <Stat label="Critical lockouts" value={stats.critical} tone={stats.critical > 0 ? "signal" : "pass"} />
        <Stat label="Avg risk index" value={`${stats.avgRisk}/100`} tone={stats.avgRisk >= 50 ? "signal" : undefined} />
      </div>

      <div className="bg-panel border border-line rounded-lg p-4">
        <p className="field-label mb-3">Detected hazard frequency by category</p>
        {stats.ranked.length === 0 ? (
          <p className="text-sm text-dim">No hazards recorded — clean fleet so far.</p>
        ) : (
          <ul className="space-y-3">
            {stats.ranked.map(([category, data]) => (
              <li key={category}>
                <div className="flex items-baseline justify-between mb-1">
                  <span className="text-sm text-bone">{category}</span>
                  <span className="font-mono text-[11px] text-dim">
                    {data.count} finding{data.count === 1 ? "" : "s"}
                    {data.critical > 0 ? ` · ${data.critical} critical` : ""}
                  </span>
                </div>
                <div className="h-2 bg-void rounded overflow-hidden border border-line">
                  <div
                    className={data.critical > 0 ? "h-full bg-signal" : "h-full bg-amber"}
                    style={{ width: `${Math.max(6, (data.count / stats.maxCount) * 100)}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <p className="text-[12px] text-dim px-1">
        Metrics are calculated from audits saved on this device only.
      </p>
    </section>
  );
}

function Stat({ label, value, tone }) {
  const color = tone === "pass" ? "text-pass" : tone === "signal" ? "text-signal" : tone === "amber" ? "text-amber" : "text-bone";
  return (
    <div className="bg-panel border border-line rounded-lg p-4 text-center">
      <p className={`font-mono text-3xl ${color}`}>{value}</p>
      <p className="field-label mt-1">{label}</p>
    </div>
  );
}
