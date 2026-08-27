"use client";

import {
  getCompliantControls,
  getCounts,
  getHazards,
  getResultNarrative,
  getRiskDisplay,
  getStatusMessage,
  getVerificationLabel,
  getVerificationPoints,
} from "@/lib/inspection/view";

const SEVERITY_STYLES = {
  CRITICAL: "text-signal border-signal/50",
  HIGH: "text-amber border-amber/50",
  MEDIUM: "text-bone border-line",
  LOW: "text-dim border-line",
};

export default function ResultsPanel({ result }) {
  if (!result) return null;

  const status = result.overall_status;
  const critical = status === "CRITICAL_FAIL";
  const fail = status === "FAIL";
  const hold = status === "HOLD_FOR_VERIFICATION";
  const conditional = status === "CONDITIONAL_PASS";

  const hazards = getHazards(result);
  const verificationPoints = getVerificationPoints(result);
  const controls = getCompliantControls(result);
  const counts = getCounts(result);
  const risk = getRiskDisplay(result);

  return (
    <section className="space-y-4">
      {/* Verdict. The out-of-service tag is reserved for a visible CRITICAL hazard —
          a serious-but-not-critical defect withdraws the equipment without condemning it. */}
      {critical ? (
        <div className="hazard-stripe rounded-lg p-1.5">
          <div className="bg-void rounded-md p-4">
            <p className="font-display uppercase tracking-[0.14em] text-signal text-sm mb-1">Stop — out of service</p>
            <h2 className="font-display uppercase font-bold text-3xl text-bone leading-none">Critical hazard detected</h2>
            <p className="text-sm text-dim mt-2">{getStatusMessage(status)}</p>
          </div>
        </div>
      ) : fail ? (
        <div className="bg-panel border-2 border-amber rounded-lg p-4">
          <p className="font-display uppercase tracking-[0.14em] text-amber text-sm mb-1">
            Withdraw from use — competent person assessment required
          </p>
          <h2 className="font-display uppercase font-bold text-3xl text-bone leading-none">Do not use pending assessment</h2>
          <p className="text-sm text-dim mt-2">{getStatusMessage(status)}</p>
        </div>
      ) : (
        <div className={`bg-panel border rounded-lg p-4 ${hold || conditional ? "border-amber/50" : "border-pass/50"}`}>
          <h2
            className={`font-display uppercase font-bold text-3xl leading-none flex items-baseline gap-2 ${
              hold || conditional ? "text-amber" : "text-pass"
            }`}
          >
            {hold && <span aria-hidden="true">✋</span>}
            {hold ? "Hold for verification" : conditional ? "Conditional pass" : "Pass"}
          </h2>
          <p className="text-sm text-dim mt-2">{getStatusMessage(status)}</p>
        </div>
      )}

      {/* Score row — hazards and verification points are counted separately */}
      <div className="grid grid-cols-2 gap-3">
        <Stat label="Risk index" value={risk.display} caption={risk.caption} accent={critical} />
        <Stat label="AI confidence" value={`${result.confidence ?? "—"}%`} />
        <Stat label="Visible hazards" value={`${counts.hazards}`} accent={counts.hazards > 0} />
        <Stat
          label="Verification points"
          value={`${counts.verifications}`}
          caption={counts.blocking > 0 ? `${counts.blocking} blocking` : null}
        />
      </div>

      {/* Equipment ID */}
      {result.equipment?.type && (
        <div className="bg-panel border border-line rounded-lg p-4">
          <p className="field-label mb-1.5">Identified equipment</p>
          <p className="text-[15px]">
            {result.equipment.type}
            {result.equipment.model_estimate ? ` · ${result.equipment.model_estimate}` : ""}
          </p>
          <p className="text-sm text-dim">{result.equipment.category}</p>
        </div>
      )}

      {/* Visible hazards — the only findings carrying numerical risk */}
      <SectionHeading label="Visible hazards" count={counts.hazards} />
      {hazards.length === 0 ? (
        <p className="text-sm text-dim px-1">No visible unsafe condition identified from this photograph.</p>
      ) : (
        hazards.map((hazard, i) => (
          <article key={i} className={`bg-panel border rounded-lg p-4 ${SEVERITY_STYLES[hazard.severity] || "border-line"}`}>
            <div className="flex items-baseline justify-between gap-3 mb-1.5">
              <span className="font-display uppercase tracking-[0.12em] text-[12px] font-semibold">
                {hazard.severity} · {hazard.category}
              </span>
              {hazard.regulation && <span className="font-mono text-[11px] text-dim shrink-0">{hazard.regulation}</span>}
            </div>
            <p className="text-[15px] text-bone leading-relaxed">{hazard.description}</p>
            {hazard.visible_evidence && (
              <p className="text-sm text-dim mt-1">Visible evidence: {hazard.visible_evidence}</p>
            )}
            {hazard.location && <p className="text-sm text-dim mt-1">Location: {hazard.location}</p>}
            {hazard.action && (
              <p className="text-sm mt-2 pt-2 border-t border-line/60">
                <span className="field-label">Action — </span>
                <span className="text-bone">{hazard.action}</span>
              </p>
            )}
          </article>
        ))
      )}

      {/* Requires physical verification — never counted as hazards, never scored */}
      {verificationPoints.length > 0 && (
        <>
          <SectionHeading label="Requires physical verification" count={counts.verifications} />
          {verificationPoints.map((point, i) => (
            <article
              key={i}
              className={`bg-panel border rounded-lg p-4 ${point.blocking_before_use ? "border-amber/50" : "border-line"}`}
            >
              <span
                className={`font-display uppercase tracking-[0.12em] text-[11px] font-semibold ${
                  point.blocking_before_use ? "text-amber" : "text-dim"
                }`}
              >
                {getVerificationLabel(point)}
              </span>
              <p className="text-[15px] text-bone leading-relaxed mt-1.5">{point.description}</p>
              {point.reason_unverified && <p className="text-sm text-dim mt-1">Why: {point.reason_unverified}</p>}
              {point.required_check && (
                <p className="text-sm mt-2 pt-2 border-t border-line/60">
                  <span className="field-label">Check — </span>
                  <span className="text-bone">{point.required_check}</span>
                </p>
              )}
              {point.blocking_before_use && point.blocking_reason && (
                <p className="text-sm text-amber mt-1">Blocking: {point.blocking_reason}</p>
              )}
            </article>
          ))}
        </>
      )}

      {/* Verified compliant controls */}
      {controls.length > 0 && (
        <div className="bg-panel border border-line rounded-lg p-4">
          <p className="field-label mb-2">Verified compliant controls</p>
          <ul className="space-y-1.5">
            {controls.map((item, i) => (
              <li key={i} className="text-sm text-bone flex gap-2">
                <span className="text-pass">✓</span>
                <span>
                  {item.description}
                  {item.location ? ` (${item.location})` : ""}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Counts in prose come from the validated result, never from the model's own
          narrative — those two disagreed on screen ("four blocking" against a header
          reading three). Any remaining commentary sits beneath, carrying no numbers. */}
      <p className="text-sm text-dim px-1">{getResultNarrative(result)}</p>
      {result.notes && <p className="text-sm text-dim px-1">{result.notes}</p>}
    </section>
  );
}

function SectionHeading({ label, count }) {
  return (
    <div className="flex items-baseline justify-between px-1 pt-1">
      <p className="field-label">{label}</p>
      <span className="font-mono text-[11px] text-dim">{count}</span>
    </div>
  );
}

function Stat({ label, value, caption, accent }) {
  return (
    <div className="bg-panel border border-line rounded-lg p-3 text-center">
      <p className={`font-mono text-2xl ${accent ? "text-signal" : "text-bone"}`}>{value}</p>
      <p className="field-label mt-0.5">{label}</p>
      {caption && <p className="text-[11px] text-amber mt-0.5">{caption}</p>}
    </div>
  );
}
