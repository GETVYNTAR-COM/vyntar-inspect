import { describe, expect, it } from "vitest";
import {
  ANALYSIS_ABORTED_MESSAGE,
  ANALYSIS_UNREADABLE_MESSAGE,
  describeHttpFailure,
} from "@/lib/analysis-errors";

describe("analysis failure messages", () => {
  it("explains a gateway timeout in plain language", () => {
    expect(describeHttpFailure(504)).toMatch(/timed out/i);
    expect(describeHttpFailure(408)).toMatch(/timed out/i);
  });

  it("explains an oversized photograph", () => {
    expect(describeHttpFailure(413)).toMatch(/too large/i);
  });

  it("explains rate limiting", () => {
    expect(describeHttpFailure(429)).toMatch(/busy/i);
  });

  it("names the status for anything else", () => {
    expect(describeHttpFailure(500)).toMatch(/500/);
    expect(describeHttpFailure(400)).toMatch(/400/);
  });

  it("never surfaces a bare browser exception", () => {
    for (const status of [400, 408, 413, 429, 500, 502, 504]) {
      const message = describeHttpFailure(status);
      expect(message).not.toMatch(/pattern|undefined|\[object/i);
      expect(message.endsWith(".")).toBe(true);
    }
    expect(ANALYSIS_ABORTED_MESSAGE.endsWith(".")).toBe(true);
    expect(ANALYSIS_UNREADABLE_MESSAGE.endsWith(".")).toBe(true);
  });
});
