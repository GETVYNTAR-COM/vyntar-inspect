"use client";

const SEVERITY_STYLES = {
  CRITICAL: "text-signal border-signal/50",
  HIGH: "text-amber border-amber/50",
  MEDIUM: "text-bone border-line",
  LOW: "text-dim border-line",
};

export default function ResultsPanel({ result }) {
  if (!result) return null;
  const critical = result.overall_status === "CRITICAL_FAIL";
  const conditional = result.overall_status === "CONDITIONAL_PASS";

  return (
    <section className="space-y-4">
      {/* Verdict — styled as a physical out-of-service tag when critical */}
      {critical ? (
        <div className="hazard-stripe rounded-lg p-1.5">
          <div className="bg-void rounded-md p-4">
            <p className="font-display uppercase tracking-[0.14em] text-signal text-sm mb-1">Stop — out of service</p>
            <h2 className="font-display uppercase font-bold text-3xl text-bone leading-none">Critical hazard detected</h2>
            <p className="text-sm text-dim mt-2">
              Tag out, isolate, and remove from operation before any further use. Report to the responsible person.
            </p>
          </div>
        </div>
      ) : (
        <div className={`bg-panel border rounded-lg p-4 ${conditional ? "border-amber/50" : "border-pass/50"}`}>
          <h2 className={`font-display uppercase font-bold text-3xl leading-none ${conditional ? "text-amber" : "text-pass"}`}>
            {conditional ? "Conditional pass" : "Pass"}
          </h2>
          <p className="text-sm text-dim mt-2">
            {conditional
              ? "Defects noted below need action — equipment may remain in service subject to the inspector's judgement."
              : "No defects identified from this photograph."}
          </p>
        </div>
      )}

      {/* Score row */}
      <div className="grid grid-cols-3 gap-3">
        <Stat label="Risk index" value={`${result.risk_score ?? "—"}`} accent={critical} />
        <Stat label="AI confidence" value={`${result.confidence ?? "—"}%`} />
        <Stat label="Hazards" value={`${result.hazards?.length ?? 0}`} />
      </div>

      {/* Equipment ID */}
      {result.equipment && (
        <div className="bg-panel border border-line rounded-lg p-4">
          <p className="field-label mb-1.5">Identified equipment</p>
          <p className="text-[15px]">
            {result.equipment.type}
            {result.equipment.model_estimate ? ` · ${result.equipment.model_estimate}` : ""}
          </p>
          <p className="text-sm text-dim">{result.equipment.category}</p>
        </div>
      )}

      {/* Hazards */}
      {(result.hazards || []).map((hazard, i) => (
        <article key={i} className={`bg-panel border rounded-lg p-4 ${SEVERITY_STYLES[hazard.severity] || "border-line"}`}>
          <div className="flex items-baseline justify-between gap-3 mb-1.5">
            <span className="font-display uppercase tracking-[0.12em] text-[12px] font-semibold">
              {hazard.severity} · {hazard.category}
            </span>
            {hazard.regulation && <span className="font-mono text-[11px] text-dim shrink-0">{hazard.regulation}</span>}
          </div>
          <p className="text-[15px] text-bone leading-relaxed">{hazard.description}</p>
          {hazard.location && <p className="text-sm text-dim mt-1">Location: {hazard.location}</p>}
          {hazard.action && (
            <p className="text-sm mt-2 pt-2 border-t border-line/60">
              <span className="field-label">Action — </span>
              <span className="text-bone">{hazard.action}</span>
            </p>
          )}
        </article>
      ))}

      {/* Compliant controls */}
      {result.compliant_controls?.length > 0 && (
        <div className="bg-panel border border-line rounded-lg p-4">
          <p className="field-label mb-2">Verified compliant controls</p>
          <ul className="space-y-1.5">
            {result.compliant_controls.map((item, i) => (
              <li key={i} className="text-sm text-bone flex gap-2">
                <span className="text-pass">✓</span>
                {item}
              </li>
            ))}
          </ul>
        </div>
      )}

      {result.notes && <p className="text-sm text-dim px-1">{result.notes}</p>}
    </section>
  );
}

function Stat({ label, value, accent }) {
  return (
    <div className="bg-panel border border-line rounded-lg p-3 text-center">
      <p className={`font-mono text-2xl ${accent ? "text-signal" : "text-bone"}`}>{value}</p>
      <p className="field-label mt-0.5">{label}</p>
    </div>
  );
}
