import { describe, expect, it } from "vitest";
import { readMessageStream } from "@/lib/inspection/stream";
import { CLIENT_ABORT_MS, FUNCTION_BUDGET_SECONDS, UPSTREAM_DEADLINE_MS } from "@/lib/analysis-budget";

const encoder = new TextEncoder();

/** A stream that emits exactly the chunks given, so event boundaries can be split anywhere. */
function streamOf(chunks) {
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
}

const delta = (text) =>
  `event: content_block_delta\ndata: ${JSON.stringify({
    type: "content_block_delta",
    index: 0,
    delta: { type: "text_delta", text },
  })}\n\n`;

const stop = (stop_reason, usage = { output_tokens: 12 }) =>
  `event: message_delta\ndata: ${JSON.stringify({ type: "message_delta", delta: { stop_reason }, usage })}\n\n`;

describe("model stream reader", () => {
  it("concatenates text deltas in order", async () => {
    const result = await readMessageStream(streamOf([delta("{\"a\":"), delta("1}"), stop("end_turn")]));
    expect(result.text).toBe('{"a":1}');
    expect(result.stop_reason).toBe("end_turn");
    expect(result.timedOut).toBe(false);
  });

  it("reassembles an event split across network chunks", async () => {
    const whole = delta("hello world");
    const cut = Math.floor(whole.length / 2);
    const result = await readMessageStream(streamOf([whole.slice(0, cut), whole.slice(cut), stop("end_turn")]));
    expect(result.text).toBe("hello world");
  });

  it("keeps a partial trailing event out of the text", async () => {
    const result = await readMessageStream(streamOf([delta("complete"), "event: content_block_delta\ndata: {\"type\""]));
    expect(result.text).toBe("complete");
  });

  it("carries the truncation stop reason through", async () => {
    const result = await readMessageStream(streamOf([delta("{\"partial\":"), stop("max_tokens")]));
    expect(result.stop_reason).toBe("max_tokens");
  });

  it("reports usage so cache hits can be measured", async () => {
    const result = await readMessageStream(
      streamOf([delta("x"), stop("end_turn", { output_tokens: 1500, cache_read_input_tokens: 5478 })])
    );
    expect(result.usage?.cache_read_input_tokens).toBe(5478);
    expect(result.usage?.output_tokens).toBe(1500);
  });

  it("survives a malformed event without losing good text", async () => {
    const result = await readMessageStream(
      streamOf([delta("before"), "event: content_block_delta\ndata: {not json}\n\n", delta("after"), stop("end_turn")])
    );
    expect(result.text).toBe("beforeafter");
  });

  it("gives up at the deadline and says so", async () => {
    let clock = 0;
    const slow = new ReadableStream({
      async pull(controller) {
        clock += 10_000; // every read advances the clock past the deadline
        controller.enqueue(encoder.encode(delta("chunk")));
      },
    });

    const result = await readMessageStream(slow, { deadlineMs: 25_000, now: () => clock });

    expect(result.timedOut).toBe(true);
    expect(result.text.length).toBeGreaterThan(0); // whatever arrived is kept
  });

  it("returns an empty message for a missing body", async () => {
    const result = await readMessageStream(null);
    expect(result).toMatchObject({ text: "", stop_reason: null, timedOut: false });
  });
});

describe("analysis time budget", () => {
  it("has the browser give up before the platform kills the function", () => {
    expect(CLIENT_ABORT_MS).toBeLessThan(FUNCTION_BUDGET_SECONDS * 1000);
  });

  it("has the route abandon the model before the browser gives up", () => {
    // Leaves the route time to validate the result and serialise a reply.
    expect(UPSTREAM_DEADLINE_MS).toBeLessThan(CLIENT_ABORT_MS);
  });
});
