import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import ResultsPanel from "@/components/ResultsPanel";
import ReportSheet from "@/components/ReportSheet";
import HistoryView from "@/components/HistoryView";
import AnalyticsView from "@/components/AnalyticsView";
import { auditsToCsv } from "@/lib/storage";

/**
 * Every surface that reads an analysis result, driven by a real response taken
 * from the analyze route rather than a hand-written fixture — so the shape here
 * cannot drift away from the shape the API actually returns.
 *
 * The valve-lift case carries risk_score: null, which is the value that must
 * never render or export as a zero.
 */

const MODEL_REPLY = {
  equipment: { type: "Gate valve on lifting slings", category: "Lifting operation", model_estimate: "" },
  operation_context: { state: "OPERATION_IMMINENT", visible_basis: "Valve rigged, slings taut.", confidence: 85 },
  confidence: 82,
  hazards: [],
  verification_points: [
    {
      evidence_type: "VERIFICATION_REQUIRED",
      description: "Valve mass against the lift plan and lifting-accessory capacity",
      reason_unverified: "The valve mass is not marked or visible.",
      verification_kind: "OPERATION_PREREQUISITE",
      required_check: "Confirm the valve mass against the lift plan.",
      blocking_before_use: true,
      blocking_reason:
        "The load mass must be matched to the lift plan and accessory capacity before hoisting and cannot be established from the image.",
    },
    {
      evidence_type: "VERIFICATION_REQUIRED",
      description: "Link-by-link condition of both sling legs",
      reason_unverified: "Cannot be assessed from a general photograph.",
      verification_kind: "ROUTINE_PRE_USE",
      required_check: "Competent person to run each leg through the hand.",
      blocking_before_use: false,
    },
  ],
  compliant_controls: [{ evidence_type: "VISIBLE_COMPLIANT_CONTROL", description: "Workers wearing hard hats" }],
  notes: "Lift appears rigged and about to commence.",
};


/** Build the SSE body the model API returns, so the route is driven through its real transport. */
function sseStream(text, { stopReason = "end_turn", usage = { output_tokens: 100 }, chunkSize = 40 } = {}) {
  const events = [`event: message_start\ndata: ${JSON.stringify({ type: "message_start", message: { usage: { input_tokens: 8000 } } })}\n\n`];
  for (let i = 0; i < text.length; i += chunkSize) {
    events.push(
      `event: content_block_delta\ndata: ${JSON.stringify({
        type: "content_block_delta",
        index: 0,
        delta: { type: "text_delta", text: text.slice(i, i + chunkSize) },
      })}\n\n`
    );
  }
  events.push(
    `event: message_delta\ndata: ${JSON.stringify({ type: "message_delta", delta: { stop_reason: stopReason }, usage })}\n\n`
  );
  events.push(`event: message_stop\ndata: ${JSON.stringify({ type: "message_stop" })}\n\n`);

  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const event of events) controller.enqueue(encoder.encode(event));
      controller.close();
    },
  });
}

const realFetch = global.fetch;

/** The result exactly as the route hands it to the browser. */
async function resultFromRoute(modelReply) {
  process.env.ANTHROPIC_API_KEY = "test-key";
  global.fetch = async () => ({ ok: true, body: sseStream(JSON.stringify(modelReply)) });
  const { POST } = await import("@/app/api/analyze/route.js");
  const response = await POST({ json: async () => ({ imageBase64: "A", mediaType: "image/jpeg", metadata: {} }) });
  const { result } = await response.json();
  return result;
}

/** The number rendered in the stat tile carrying `label`. */
function statValue(html, label) {
  const match = html.match(new RegExp(`<p[^>]*>([^<]*)</p><p class="field-label[^"]*">${label}<`));
  return match ? match[1] : null;
}

const auditFor = (result) => ({
  id: "1",
  auditRef: "VYN-0123456789ABCDEF",
  signedAt: "27/08/2026, 09:00:00",
  metadata: {
    inspector: "A Inspector",
    cert: "LEEA-0000",
    equipmentTag: "VLV-01",
    category: "Lifting accessories (slings, shackles)",
    site: "Yard",
    inspectionType: "Pre-use check (daily)",
  },
  result,
  photoThumb: null,
  signature: null,
});

/** A record saved before the evidence split: no verification points, string controls. */
const LEGACY_RESULT = {
  equipment: { type: "Forklift truck", category: "Materials handling", model_estimate: "3t" },
  overall_status: "CONDITIONAL_PASS",
  risk_score: 42,
  confidence: 71,
  hazards: [
    {
      severity: "MEDIUM",
      category: "HYDRAULIC",
      description: "Weeping hydraulic fitting visible at the mast",
      location: "Mast, left-hand ram",
      regulation: "PUWER 1998",
      action: "Competent person to inspect.",
    },
  ],
  compliant_controls: ["Hard hats visible on both workers"],
  notes: "Legacy record.",
};

describe("consumers of a real new-shape response", () => {
  /** @type {any} */
  let hold;

  beforeEach(async () => {
    hold = await resultFromRoute(MODEL_REPLY);
  });
  afterEach(() => {
    global.fetch = realFetch;
  });

  it("the route really did return a null risk score", () => {
    expect(hold.risk_score).toBeNull();
    expect(hold.overall_status).toBe("HOLD_FOR_VERIFICATION");
  });

  it("results panel shows the hold and a pending risk, never a zero", () => {
    const html = renderToStaticMarkup(<ResultsPanel result={hold} />);

    expect(html).toMatch(/Hold for verification/i);
    expect(html).toMatch(/Pending physical verification/i);
    // The risk tile itself must read as pending — a zero there would say "confirmed safe".
    expect(statValue(html, "Risk index")).toBe("—");
    expect(statValue(html, "Visible hazards")).toBe("0");
    expect(html).toMatch(/HOLD POINT/);
    expect(html).toMatch(/ROUTINE CHECK/);
    expect(html).not.toMatch(/may remain in service/i);
  });

  it("results panel counts hazards and verification points separately", () => {
    const html = renderToStaticMarkup(<ResultsPanel result={hold} />);
    expect(html).toMatch(/Visible hazards/);
    expect(html).toMatch(/Verification points/);
    expect(html).toMatch(/1 blocking/);
  });

  it("printed report renders the hold without a numeric risk", () => {
    const html = renderToStaticMarkup(
      <ReportSheet
        photoDataUrl={null}
        metadata={auditFor(hold).metadata}
        result={hold}
        signatureDataUrl={null}
        auditRef="VYN-0123456789ABCDEF"
        signedAt="27/08/2026"
      />
    );

    expect(html).toMatch(/Hold for verification/i);
    expect(html).toMatch(/DO NOT COMMENCE THE OPERATION/);
    expect(html).toMatch(/Pending physical verification/i);
    expect(html).not.toMatch(/Risk index 0/);
  });

  it("audit history renders a held record", () => {
    const html = renderToStaticMarkup(
      <HistoryView audits={[auditFor(hold)]} onPrint={() => {}} onDelete={() => {}} onClearAll={() => {}} />
    );

    expect(html).toMatch(/Hold/);
    expect(html).toMatch(/—/);
    expect(html).not.toMatch(/risk 0\/100/);
  });

  it("fleet analytics excludes a pending record from the average", () => {
    const html = renderToStaticMarkup(<AnalyticsView audits={[auditFor(hold)]} />);

    expect(html).toMatch(/Holds for verification/);
    expect(html).toMatch(/No scored audits/);
    expect(html).not.toMatch(/0\/100/);
  });

  it("csv export leaves a pending risk blank rather than zero", () => {
    const csv = auditsToCsv([auditFor(hold)]);
    const header = csv.split("\n")[0].split('","').map((c) => c.replace(/^"|"$/g, ""));
    const row = csv.split("\n")[1].split('","').map((c) => c.replace(/^"|"$/g, ""));

    expect(row[header.indexOf("Risk score")]).toBe("");
    expect(row[header.indexOf("Risk basis")]).toBe("INSUFFICIENT_EVIDENCE");
    expect(row[header.indexOf("Visible hazards")]).toBe("0");
    expect(row[header.indexOf("Verification points")]).toBe("2");
    expect(row[header.indexOf("Blocking verifications")]).toBe("1");
  });

  it("renders a record saved under the previous schema unchanged", () => {
    const audit = auditFor(LEGACY_RESULT);

    expect(() => renderToStaticMarkup(<ResultsPanel result={LEGACY_RESULT} />)).not.toThrow();
    const history = renderToStaticMarkup(
      <HistoryView audits={[audit]} onPrint={() => {}} onDelete={() => {}} onClearAll={() => {}} />
    );
    expect(history).toMatch(/42\/100/);

    const report = renderToStaticMarkup(
      <ReportSheet
        photoDataUrl={null}
        metadata={audit.metadata}
        result={LEGACY_RESULT}
        signatureDataUrl={null}
        auditRef="VYN-LEGACY"
        signedAt="27/08/2026"
      />
    );
    expect(report).toMatch(/Hard hats visible on both workers/);

    const csv = auditsToCsv([audit]);
    expect(csv.split("\n")[1]).toMatch(/"42"/);
  });

  it("no consumer throws on a result stripped of the new fields", () => {
    const bare = { ...hold, verification_points: undefined, compliant_controls: undefined, operation_context: undefined };
    const audit = auditFor(bare);

    expect(() => renderToStaticMarkup(<ResultsPanel result={bare} />)).not.toThrow();
    expect(() =>
      renderToStaticMarkup(
        <ReportSheet
          photoDataUrl={null}
          metadata={audit.metadata}
          result={bare}
          signatureDataUrl={null}
          auditRef="X"
          signedAt="Y"
        />
      )
    ).not.toThrow();
    expect(() => renderToStaticMarkup(<AnalyticsView audits={[audit]} />)).not.toThrow();
    expect(() => auditsToCsv([audit])).not.toThrow();
  });
});
