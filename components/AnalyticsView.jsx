"use client";

import { useMemo } from "react";
import { getCounts, getHazards, getRiskScore } from "@/lib/inspection/view";

export default function AnalyticsView({ audits }) {
  const stats = useMemo(() => {
    const total = audits.length;
    if (total === 0) return null;

    const critical = audits.filter((a) => a.result?.overall_status === "CRITICAL_FAIL").length;
    const holds = audits.filter((a) => a.result?.overall_status === "HOLD_FOR_VERIFICATION").length;
    const passRate = Math.round(((total - critical - holds) / total) * 1000) / 10;

    // Records pending physical verification carry no risk number and must not be
    // averaged in as zero — they are excluded from the mean entirely.
    const scored = audits.map((a) => getRiskScore(a.result)).filter((value) => value !== null);
    const avgRisk = scored.length ? Math.round(scored.reduce((sum, value) => sum + value, 0) / scored.length) : null;

    let verifications = 0;
    let blocking = 0;
    const categories = {};
    for (const audit of audits) {
      const counts = getCounts(audit.result);
      verifications += counts.verifications;
      blocking += counts.blocking;
      for (const hazard of getHazards(audit.result)) {
        const key = hazard.category || "OTHER";
        if (!categories[key]) categories[key] = { count: 0, critical: 0 };
        categories[key].count += 1;
        if (hazard.severity === "CRITICAL") categories[key].critical += 1;
      }
    }
    const ranked = Object.entries(categories).sort((a, b) => b[1].count - a[1].count);
    const maxCount = ranked.length ? ranked[0][1].count : 0;

    return { total, critical, holds, passRate, avgRisk, scoredCount: scored.length, verifications, blocking, ranked, maxCount };
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
        <Stat label="Holds for verification" value={stats.holds} tone={stats.holds > 0 ? "amber" : "pass"} />
        <Stat
          label="Avg risk index"
          value={stats.avgRisk === null ? "—" : `${stats.avgRisk}/100`}
          caption={stats.avgRisk === null ? "No scored audits" : `From ${stats.scoredCount} of ${stats.total} audits`}
          tone={stats.avgRisk !== null && stats.avgRisk >= 50 ? "signal" : undefined}
        />
        <Stat
          label="Verification points"
          value={stats.verifications}
          caption={stats.blocking > 0 ? `${stats.blocking} blocking` : "None blocking"}
        />
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
        Metrics are calculated from audits saved on this device only. Verification points are counted separately from
        hazards and never contribute to the risk index; audits pending physical verification are excluded from the
        average rather than counted as zero.
      </p>
    </section>
  );
}

function Stat({ label, value, tone, caption }) {
  const color = tone === "pass" ? "text-pass" : tone === "signal" ? "text-signal" : tone === "amber" ? "text-amber" : "text-bone";
  return (
    <div className="bg-panel border border-line rounded-lg p-4 text-center">
      <p className={`font-mono text-3xl ${color}`}>{value}</p>
      <p className="field-label mt-1">{label}</p>
      {caption && <p className="text-[11px] text-dim mt-0.5">{caption}</p>}
    </div>
  );
}
