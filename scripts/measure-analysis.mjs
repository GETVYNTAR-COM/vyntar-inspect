/**
 * Measure the real end-to-end time of the analysis call.
 *
 * Sends exactly what the route sends — same model, same system prompt (read from
 * the route source so it cannot drift), same image handling — and reports where
 * the time goes: waiting for the first token, then generating.
 *
 *   ANTHROPIC_API_KEY=sk-... node scripts/measure-analysis.mjs path/to/photo.jpg [runs]
 *
 * Run it more than once: the first call writes the prompt cache, later calls read
 * it, and the difference between them is what caching is worth here.
 */

import fs from "node:fs";
import path from "node:path";

const [, , imagePath, runsArg] = process.argv;
const runs = Number(runsArg) || 3;

if (!imagePath) {
  console.error("usage: ANTHROPIC_API_KEY=... node scripts/measure-analysis.mjs <photo.jpg> [runs]");
  process.exit(1);
}
if (!process.env.ANTHROPIC_API_KEY) {
  console.error("ANTHROPIC_API_KEY is not set.");
  process.exit(1);
}

const routeSource = fs.readFileSync(path.join(process.cwd(), "app/api/analyze/route.js"), "utf8");
const promptMatch = routeSource.match(/const SYSTEM_PROMPT = `([\s\S]*?)`;/);
if (!promptMatch) {
  console.error("Could not read SYSTEM_PROMPT from the route — has it been renamed?");
  process.exit(1);
}
const SYSTEM_PROMPT = promptMatch[1];
const MODEL = routeSource.match(/model:\s*"([^"]+)"/)?.[1] ?? "claude-sonnet-4-6";
const MAX_TOKENS = Number(routeSource.match(/max_tokens:\s*(\d+)/)?.[1] ?? 16000);

const imageBase64 = fs.readFileSync(imagePath).toString("base64");
const mediaType = imagePath.toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg";

console.log(
  `model=${MODEL} max_tokens=${MAX_TOKENS} system=${SYSTEM_PROMPT.length} chars ` +
    `image=${(imageBase64.length / 1024).toFixed(0)} KiB base64\n`
);

/** @returns {Promise<{ok: boolean, totalMs: number, firstTokenMs: number|null, chars: number, usage: any, stopReason: string|null}>} */
async function measureOnce() {
  const started = performance.now();
  let firstTokenMs = null;
  let chars = 0;
  let usage = {};
  let stopReason = null;

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODEL,
      stream: true,
      max_tokens: MAX_TOKENS,
      system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: mediaType, data: imageBase64 } },
            {
              type: "text",
              text: "Carry out the pre-use hazard screen on this equipment photograph. Separate what is visibly wrong from what must be physically verified, and classify the operation context.",
            },
          ],
        },
      ],
    }),
  });

  if (!response.ok) {
    console.error(`  upstream ${response.status}: ${(await response.text()).slice(0, 200)}`);
    return { ok: false, totalMs: performance.now() - started, firstTokenMs, chars, usage, stopReason };
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split("\n\n");
    buffer = events.pop() ?? "";

    for (const event of events) {
      for (const line of event.split("\n")) {
        if (!line.startsWith("data:")) continue;
        const payload = line.slice(5).trim();
        if (!payload) continue;
        let parsed;
        try {
          parsed = JSON.parse(payload);
        } catch {
          continue;
        }
        if (parsed.type === "content_block_delta" && parsed.delta?.type === "text_delta") {
          if (firstTokenMs === null) firstTokenMs = performance.now() - started;
          chars += parsed.delta.text.length;
        } else if (parsed.type === "message_start") {
          usage = { ...usage, ...(parsed.message?.usage ?? {}) };
        } else if (parsed.type === "message_delta") {
          usage = { ...usage, ...(parsed.usage ?? {}) };
          stopReason = parsed.delta?.stop_reason ?? stopReason;
        }
      }
    }
  }

  return { ok: true, totalMs: performance.now() - started, firstTokenMs, chars, usage, stopReason };
}

const results = [];
for (let run = 1; run <= runs; run++) {
  const r = await measureOnce();
  results.push(r);
  const secs = (ms) => (ms / 1000).toFixed(1) + "s";
  console.log(
    `run ${run}: total ${secs(r.totalMs)} | first token ${r.firstTokenMs === null ? "—" : secs(r.firstTokenMs)} | ` +
      `generated ${r.chars} chars | out ${r.usage.output_tokens ?? "?"} tok | ` +
      `cache read ${r.usage.cache_read_input_tokens ?? 0} / written ${r.usage.cache_creation_input_tokens ?? 0} | ` +
      `stop ${r.stopReason}`
  );
}

const ok = results.filter((r) => r.ok);
if (ok.length) {
  const worst = Math.max(...ok.map((r) => r.totalMs));
  console.log(`\nslowest run ${(worst / 1000).toFixed(1)}s against a 60s function budget (55s client abort).`);
  if (worst > 45_000) console.log("Too close to the budget — reduce output further or raise maxDuration on a Pro plan.");
}
