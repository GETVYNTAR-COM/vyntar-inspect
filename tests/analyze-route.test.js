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

const upstream = (text, extra = {}) => ({
  ok: true,
  body: sseStream(text, { stopReason: extra.stop_reason ?? "end_turn" }),
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

  it("caches the system prompt and streams the response", async () => {
    let sent = null;
    global.fetch = async (_url, init) => {
      sent = JSON.parse(init.body);
      return upstream(JSON.stringify(VALVE_LIFT));
    };
    await callRoute();

    // The system prompt is the same ~5,500 tokens on every request; caching it
    // takes that work off the critical path and off the bill.
    expect(Array.isArray(sent.system)).toBe(true);
    expect(sent.system[0].cache_control).toEqual({ type: "ephemeral" });
    expect(sent.system[0].text.length).toBeGreaterThan(10000);

    // A long response must not be waited for as a single body.
    expect(sent.stream).toBe(true);
  });

  it("caps every stream so the response cannot grow without limit", async () => {
    let sent = null;
    global.fetch = async (_url, init) => {
      sent = JSON.parse(init.body);
      return upstream(JSON.stringify(VALVE_LIFT));
    };
    await callRoute();

    const prompt = sent.system[0].text;
    // Uncapped verification points and compliant controls are what made the
    // response long enough to exhaust the time budget.
    expect(prompt).toMatch(/no more than 8 distinct, evidence-supported hazards/);
    expect(prompt).toMatch(/no more than 6 verification_points/);
    expect(prompt).toMatch(/no more than 6 compliant_controls/);
    expect(prompt).toMatch(/single sentence/i);
  });

  it("answers with an explanation when the model does not finish in time", async () => {
    const encoder = new TextEncoder();
    global.fetch = async () => ({
      ok: true,
      body: new ReadableStream({
        async pull(controller) {
          await new Promise((resolve) => setTimeout(resolve, 5));
          controller.enqueue(encoder.encode(`event: content_block_delta\ndata: ${JSON.stringify({
            type: "content_block_delta",
            index: 0,
            delta: { type: "text_delta", text: "{" },
          })}\n\n`));
        },
      }),
    });

    const { analyse } = await import("@/app/api/analyze/route.js");
    const response = await analyse(request(), { deadlineMs: 20 });
    const { status, body } = { status: response.status, body: await response.json() };

    expect(status).toBe(504);
    expect(body.error).toMatch(/did not finish in time/i);
    expect(body.error).not.toMatch(/connection/i);
    expect(body.result).toBeUndefined();
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
