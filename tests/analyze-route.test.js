import { describe, expect, it, beforeEach, afterEach } from "vitest";

/**
 * The analyze route is the only thing standing between the model's raw output and
 * the inspector's screen. These cases pin the contract that a malformed, truncated
 * or non-JSON model response never reaches the browser unparsed, and never gets
 * reported as a network problem.
 */

const VALVE_LIFT = {
  equipment: { type: "Gate valve on lifting slings", category: "Lifting operation", model_estimate: "" },
  operation_context: {
    state: "OPERATION_IMMINENT",
    visible_basis: "Valve rigged to a hook block with slings taut.",
    confidence: 85,
  },
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
  ],
  compliant_controls: [{ evidence_type: "VISIBLE_COMPLIANT_CONTROL", description: "Workers wearing hard hats" }],
  notes: "Lift appears rigged and about to commence.",
};

const upstream = (text, extra = {}) => ({
  ok: true,
  json: async () => ({ content: [{ type: "text", text }], stop_reason: "end_turn", ...extra }),
});

const request = () => ({
  json: async () => ({ imageBase64: "AAAA", mediaType: "image/jpeg", metadata: {} }),
});

/** @returns {Promise<{ status: number, body: any }>} */
async function callRoute() {
  const { POST } = await import("@/app/api/analyze/route.js");
  const response = await POST(request());
  return { status: response.status, body: await response.json() };
}

const realFetch = global.fetch;

describe("analyze route", () => {
  beforeEach(() => {
    process.env.ANTHROPIC_API_KEY = "test-key";
  });
  afterEach(() => {
    global.fetch = realFetch;
  });

  it("returns the validated three-stream result for a well-formed response", async () => {
    global.fetch = async () => upstream(JSON.stringify(VALVE_LIFT));
    const { status, body } = await callRoute();

    expect(status).toBe(200);
    expect(body.result.overall_status).toBe("HOLD_FOR_VERIFICATION");
    expect(body.result.risk_score).toBeNull();
    expect(body.result.risk_basis).toBe("INSUFFICIENT_EVIDENCE");
    expect(body.result.hazards).toEqual([]);
    expect(body.result.verification_points).toHaveLength(1);
    expect(body.result.compliant_controls).toHaveLength(1);
  });

  it("reads a result the model wrapped in a markdown fence or prose", async () => {
    for (const wrapper of [
      "```json\n" + JSON.stringify(VALVE_LIFT) + "\n```",
      "Here is the analysis:\n" + JSON.stringify(VALVE_LIFT),
    ]) {
      global.fetch = async () => upstream(wrapper);
      const { status, body } = await callRoute();
      expect(status).toBe(200);
      expect(body.result.overall_status).toBe("HOLD_FOR_VERIFICATION");
    }
  });

  // The regression: the three-stream contract returns several times more JSON than
  // the single-stream one, and max_tokens was not raised with it. Truncated JSON
  // threw out of JSON.parse into the generic catch, which returned a 500 telling
  // the inspector to check their connection.
  it("reports truncated model output as incomplete, never as a connection fault", async () => {
    const cut = JSON.stringify(VALVE_LIFT).slice(0, 200);
    global.fetch = async () => upstream(cut);
    const { status, body } = await callRoute();

    expect(status).toBe(502);
    expect(body.result).toBeUndefined();
    expect(body.error).toMatch(/incomplete/i);
    expect(body.error).not.toMatch(/connection/i);
  });

  it("names truncation explicitly when the model stopped at the token ceiling", async () => {
    global.fetch = async () => upstream(JSON.stringify(VALVE_LIFT).slice(0, 200), { stop_reason: "max_tokens" });
    const { status, body } = await callRoute();

    expect(status).toBe(502);
    expect(body.error).toMatch(/cut off/i);
    expect(body.error).not.toMatch(/connection/i);
  });

  it("requests enough output tokens for the three-stream contract", async () => {
    let sentBody = null;
    global.fetch = async (_url, init) => {
      sentBody = JSON.parse(init.body);
      return upstream(JSON.stringify(VALVE_LIFT));
    };
    await callRoute();

    // A full response carries hazards, verification points and compliant controls,
    // each with per-item evidence fields. 5000 was not enough and truncated it.
    expect(sentBody.max_tokens).toBeGreaterThanOrEqual(16000);
  });

  it("rejects a response with no JSON in it", async () => {
    global.fetch = async () => upstream("I cannot analyse this image.");
    const { status, body } = await callRoute();

    expect(status).toBe(502);
    expect(body.result).toBeUndefined();
    expect(body.error).toBeTruthy();
  });

  it("always answers with JSON, whatever the model returns", async () => {
    const replies = ["", "not json", "{", JSON.stringify(VALVE_LIFT).slice(0, 60), "null", "[]"];
    for (const text of replies) {
      global.fetch = async () => upstream(text);
      const { status, body } = await callRoute();
      expect(typeof body).toBe("object");
      expect(body === null).toBe(false);
      expect(status === 200 ? body.result : body.error).toBeTruthy();
    }
  });

  it("surfaces an upstream failure without leaking its body", async () => {
    global.fetch = async () => ({ ok: false, status: 529, text: async () => "<html>overloaded</html>" });
    const { status, body } = await callRoute();

    expect(status).toBe(502);
    expect(body.error).toMatch(/529/);
    expect(body.error).not.toMatch(/<html>/);
  });

  it("still normalises a response in the pre-split shape", async () => {
    global.fetch = async () =>
      upstream(
        JSON.stringify({
          equipment: { type: "Forklift truck" },
          overall_status: "PASS",
          risk_score: 12,
          confidence: 80,
          hazards: [],
          compliant_controls: ["Hard hats visible on both workers"],
          notes: "",
        })
      );
    const { status, body } = await callRoute();

    expect(status).toBe(200);
    expect(body.result.verification_points).toEqual([]);
    expect(body.result.compliant_controls[0]).toMatchObject({ description: "Hard hats visible on both workers" });
  });
});
