"use client";

import {
  getCompliantControls,
  getHazards,
  getResultNarrative,
  getStatusMessage,
  getStatusPresentation,
  getVerificationLabel,
  getVerificationPoints,
} from "@/lib/inspection/view";

export default function ReportSheet({ photoDataUrl, metadata, result, signatureDataUrl, auditRef, signedAt }) {
  if (!result) return null;
  const critical = result.overall_status === "CRITICAL_FAIL";
  const fail = result.overall_status === "FAIL";
  const hold = result.overall_status === "HOLD_FOR_VERIFICATION";
  const hazards = getHazards(result);
  const verificationPoints = getVerificationPoints(result);
  const controls = getCompliantControls(result);

  return (
    <div className="report-sheet hidden bg-white text-[#111827] font-body">
      <div className="border-b-4 border-[#111827] pb-3 mb-4 flex items-end justify-between">
        <div>
          <p className="font-display uppercase tracking-[0.2em] text-[11px] text-[#6B7280]">VYNTAR Growth Solutions</p>
          <h1 className="font-display uppercase font-bold text-2xl leading-tight">Equipment Inspection Record</h1>
          <p className="text-[11px] text-[#6B7280]">AI-assisted pre-use screening · not a LOLER Reg 9 thorough examination</p>
        </div>
        <div className="text-right text-[11px] font-mono">
          <p>{auditRef}</p>
          <p>{signedAt}</p>
        </div>
      </div>

      <div
        className={`border-2 rounded p-3 mb-4 ${critical ? "border-[#B91C1C]" : "border-[#111827]"}`}
      >
        <p className="font-display uppercase font-bold text-xl">
          Result: {getStatusPresentation(result.overall_status).label}
          {critical ? " — REMOVE FROM SERVICE" : ""}
          {fail ? " — WITHDRAW FROM USE UNTIL ASSESSED" : ""}
          {hold ? " — DO NOT COMMENCE THE OPERATION" : ""}
        </p>
        <p className="text-sm">
          {getResultNarrative(result)} AI confidence {result.confidence}%.
        </p>
        <p className="text-[11px] mt-1">{getStatusMessage(result.overall_status)}</p>
      </div>

      <table className="w-full text-sm mb-4 border-collapse">
        <tbody>
          <Row label="Inspector" value={`${metadata.inspector || "—"}${metadata.cert ? ` (${metadata.cert})` : ""}`} />
          <Row label="Equipment" value={`${result.equipment?.type || "—"} · Tag ${metadata.equipmentTag || "—"}`} />
          <Row label="Category" value={metadata.category} />
          <Row label="Inspection type" value={metadata.inspectionType} />
          <Row label="Site" value={metadata.site || "—"} />
          {result.operation_context?.state && (
            <Row
              label="Operation context"
              value={`${result.operation_context.state.replace(/_/g, " ")}${
                result.operation_context.visible_basis ? ` — ${result.operation_context.visible_basis}` : ""
              }`}
            />
          )}
          <Row
            label="GPS"
            value={metadata.latitude && metadata.longitude ? `${metadata.latitude} N, ${metadata.longitude} W` : "Not recorded"}
          />
        </tbody>
      </table>

      {photoDataUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={photoDataUrl} alt="Inspected equipment" className="w-[55%] border border-[#D1D5DB] rounded mb-4" />
      )}

      <SectionTitle>Visible hazards</SectionTitle>
      {hazards.length ? (
        <table className="w-full text-[12px] border-collapse mb-4">
          <thead>
            <tr className="text-left border-b-2 border-[#111827]">
              <th className="py-1 pr-2">Severity</th>
              <th className="py-1 pr-2">Finding</th>
              <th className="py-1 pr-2">Regulation</th>
              <th className="py-1">Corrective action</th>
            </tr>
          </thead>
          <tbody>
            {hazards.map((hazard, i) => (
              <tr key={i} className="border-b border-[#E5E7EB] align-top">
                <td className="py-1.5 pr-2 font-semibold">{hazard.severity}</td>
                <td className="py-1.5 pr-2">
                  {hazard.description}
                  {hazard.location ? ` (${hazard.location})` : ""}
                  {hazard.visible_evidence ? (
                    <span className="block text-[11px] text-[#6B7280]">Visible evidence: {hazard.visible_evidence}</span>
                  ) : null}
                </td>
                <td className="py-1.5 pr-2 font-mono text-[11px]">{hazard.regulation}</td>
                <td className="py-1.5">{hazard.action}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="text-sm mb-4">No visible unsafe condition identified from the supplied photograph.</p>
      )}

      {verificationPoints.length > 0 && (
        <>
          <SectionTitle>Requires physical verification</SectionTitle>
          <table className="w-full text-[12px] border-collapse mb-4">
            <thead>
              <tr className="text-left border-b-2 border-[#111827]">
                <th className="py-1 pr-2 w-[168px]">Status</th>
                <th className="py-1 pr-2">Item</th>
                <th className="py-1">Check required</th>
              </tr>
            </thead>
            <tbody>
              {verificationPoints.map((point, i) => (
                <tr key={i} className="border-b border-[#E5E7EB] align-top">
                  <td className={`py-1.5 pr-2 ${point.blocking_before_use ? "font-semibold" : ""}`}>
                    {getVerificationLabel(point)}
                  </td>
                  <td className="py-1.5 pr-2">
                    {point.description}
                    {point.location ? ` (${point.location})` : ""}
                    {point.reason_unverified ? (
                      <span className="block text-[11px] text-[#6B7280]">Why: {point.reason_unverified}</span>
                    ) : null}
                  </td>
                  <td className="py-1.5">
                    {point.required_check}
                    {point.blocking_before_use && point.blocking_reason ? (
                      <span className="block text-[11px]">Blocking: {point.blocking_reason}</span>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-[11px] text-[#6B7280] mb-4">
            Verification points are matters the photograph cannot establish. They are not counted as hazards and do not
            contribute to the risk index.
          </p>
        </>
      )}

      {controls.length > 0 && (
        <>
          <SectionTitle>Verified compliant controls</SectionTitle>
          <ul className="text-sm mb-4 list-disc pl-5">
            {controls.map((item, i) => (
              <li key={i}>
                {item.description}
                {item.location ? ` (${item.location})` : ""}
              </li>
            ))}
          </ul>
        </>
      )}

      <div className="flex items-end justify-between border-t-2 border-[#111827] pt-3 mt-6">
        <div>
          <p className="text-[11px] text-[#6B7280] mb-1">Inspector signature</p>
          {signatureDataUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={signatureDataUrl} alt="Inspector signature" className="h-[60px]" />
          )}
          <p className="text-sm font-semibold">{metadata.inspector}</p>
        </div>
        <div className="text-right">
          <p className="text-[11px] text-[#6B7280]">Digital audit seal (SHA-256)</p>
          <p className="font-mono text-[10px] break-all max-w-[280px]">{auditRef}</p>
        </div>
      </div>

      <p className="text-[10px] text-[#6B7280] mt-4">
        This record was produced with AI-assisted visual screening (VYNTAR Inspect) and confirmed by the named
        inspector. It supports, and does not replace, statutory inspection and thorough examination duties under
        PUWER 1998 and LOLER 1998.
      </p>
    </div>
  );
}

function SectionTitle({ children }) {
  return (
    <h2 className="font-display uppercase font-semibold text-base border-b border-[#D1D5DB] pb-1 mb-2">{children}</h2>
  );
}

function Row({ label, value }) {
  return (
    <tr className="border-b border-[#E5E7EB]">
      <td className="py-1 pr-3 font-semibold w-[140px]">{label}</td>
      <td className="py-1">{value}</td>
    </tr>
  );
}
