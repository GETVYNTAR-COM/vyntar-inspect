// @ts-check
/**
 * Reader for the model's server-sent event stream.
 *
 * The analysis is a long single response — a large system prompt, an image, and
 * several thousand tokens of JSON. Streaming keeps the connection producing bytes
 * so it cannot idle out mid-generation, and lets the route abandon a run that will
 * not finish inside the function budget while it still has time to answer.
 */

/**
 * @typedef {object} StreamedMessage
 * @property {string} text        Concatenated text deltas.
 * @property {string | null} stop_reason
 * @property {Record<string, unknown> | null} usage
 * @property {boolean} timedOut   True when the deadline passed before the stream ended.
 */

/**
 * @param {ReadableStream<Uint8Array> | null} body
 * @param {{ deadlineMs?: number, now?: () => number }} [options]
 * @returns {Promise<StreamedMessage>}
 */
export async function readMessageStream(body, options = {}) {
  const { deadlineMs = Infinity, now = () => Date.now() } = options;
  const started = now();

  /** @type {StreamedMessage} */
  const message = { text: "", stop_reason: null, usage: null, timedOut: false };
  if (!body) return message;

  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      if (now() - started > deadlineMs) {
        message.timedOut = true;
        break;
      }

      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // Events are separated by a blank line; anything after the last one is a
      // partial event and stays in the buffer until the rest of it arrives.
      const events = buffer.split("\n\n");
      buffer = events.pop() ?? "";

      for (const event of events) {
        for (const line of event.split("\n")) {
          if (!line.startsWith("data:")) continue;
          const payload = line.slice(5).trim();
          if (!payload || payload === "[DONE]") continue;

          let parsed;
          try {
            parsed = JSON.parse(payload);
          } catch {
            continue; // a malformed event must not abort a good stream
          }

          if (parsed.type === "content_block_delta" && parsed.delta?.type === "text_delta") {
            message.text += parsed.delta.text ?? "";
          } else if (parsed.type === "message_delta") {
            if (parsed.delta?.stop_reason) message.stop_reason = parsed.delta.stop_reason;
            if (parsed.usage) message.usage = parsed.usage;
          } else if (parsed.type === "message_start" && parsed.message?.usage) {
            message.usage = { ...parsed.message.usage, ...(message.usage || {}) };
          } else if (parsed.type === "error") {
            message.stop_reason = "error";
          }
        }
      }
    }
  } finally {
    try {
      await reader.cancel();
    } catch {
      // the stream is already gone; nothing to release
    }
  }

  return message;
}
