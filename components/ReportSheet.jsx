"use client";

export default function ReportSheet({ photoDataUrl, metadata, result, signatureDataUrl, auditRef, signedAt }) {
  if (!result) return null;
  const critical = result.overall_status === "CRITICAL_FAIL";

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
          Result: {result.overall_status.replace("_", " ")}
          {critical ? " — REMOVE FROM SERVICE" : ""}
        </p>
        <p className="text-sm">
          Risk index {result.risk_score}/100 · AI confidence {result.confidence}% · {result.hazards?.length ?? 0} hazard(s)
          identified
        </p>
      </div>

      <table className="w-full text-sm mb-4 border-collapse">
        <tbody>
          <Row label="Inspector" value={`${metadata.inspector || "—"}${metadata.cert ? ` (${metadata.cert})` : ""}`} />
          <Row label="Equipment" value={`${result.equipment?.type || "—"} · Tag ${metadata.equipmentTag || "—"}`} />
          <Row label="Category" value={metadata.category} />
          <Row label="Inspection type" value={metadata.inspectionType} />
          <Row label="Site" value={metadata.site || "—"} />
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

      <h2 className="font-display uppercase font-semibold text-base border-b border-[#D1D5DB] pb-1 mb-2">
        Identified hazards
      </h2>
      {result.hazards?.length ? (
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
            {result.hazards.map((hazard, i) => (
              <tr key={i} className="border-b border-[#E5E7EB] align-top">
                <td className="py-1.5 pr-2 font-semibold">{hazard.severity}</td>
                <td className="py-1.5 pr-2">
                  {hazard.description}
                  {hazard.location ? ` (${hazard.location})` : ""}
                </td>
                <td className="py-1.5 pr-2 font-mono text-[11px]">{hazard.regulation}</td>
                <td className="py-1.5">{hazard.action}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="text-sm mb-4">No defects identified from the supplied photograph.</p>
      )}

      {result.compliant_controls?.length > 0 && (
        <>
          <h2 className="font-display uppercase font-semibold text-base border-b border-[#D1D5DB] pb-1 mb-2">
            Verified compliant controls
          </h2>
          <ul className="text-sm mb-4 list-disc pl-5">
            {result.compliant_controls.map((item, i) => (
              <li key={i}>{item}</li>
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

function Row({ label, value }) {
  return (
    <tr className="border-b border-[#E5E7EB]">
      <td className="py-1 pr-3 font-semibold w-[140px]">{label}</td>
      <td className="py-1">{value}</td>
    </tr>
  );
}
