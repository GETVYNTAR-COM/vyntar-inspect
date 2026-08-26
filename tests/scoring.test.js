import { describe, expect, it } from "vitest";
import { ADDITIONAL, BASE, CAP, computeRiskScore, sortBySeverity } from "@/lib/inspection/scoring";

describe("risk scoring", () => {
  it("scores an empty hazard list as zero", () => {
    expect(computeRiskScore([])).toBe(0);
  });

  it("scores a single hazard at its severity base", () => {
    expect(computeRiskScore([{ severity: "LOW" }])).toBe(BASE.LOW);
    expect(computeRiskScore([{ severity: "MEDIUM" }])).toBe(BASE.MEDIUM);
    expect(computeRiskScore([{ severity: "HIGH" }])).toBe(BASE.HIGH);
    expect(computeRiskScore([{ severity: "CRITICAL" }])).toBe(98);
  });

  it("adds the additional value for each hazard beyond the highest", () => {
    expect(computeRiskScore([{ severity: "MEDIUM" }, { severity: "LOW" }])).toBe(BASE.MEDIUM + ADDITIONAL.LOW);
    expect(computeRiskScore([{ severity: "HIGH" }, { severity: "MEDIUM" }, { severity: "LOW" }])).toBe(
      BASE.HIGH + ADDITIONAL.MEDIUM + ADDITIONAL.LOW
    );
  });

  it("takes the base from the highest severity regardless of input order", () => {
    const unordered = [{ severity: "LOW" }, { severity: "HIGH" }, { severity: "LOW" }];
    expect(computeRiskScore(unordered)).toBe(BASE.HIGH + ADDITIONAL.LOW * 2);
  });

  it("caps within the band set by the highest severity", () => {
    const manyLow = Array.from({ length: 12 }, () => ({ severity: "LOW" }));
    expect(computeRiskScore(manyLow)).toBe(CAP.LOW);

    const manyMedium = Array.from({ length: 12 }, () => ({ severity: "MEDIUM" }));
    expect(computeRiskScore(manyMedium)).toBe(CAP.MEDIUM);

    const criticalPlus = [{ severity: "CRITICAL" }, { severity: "HIGH" }, { severity: "HIGH" }];
    expect(computeRiskScore(criticalPlus)).toBe(CAP.CRITICAL);
  });

  it("ignores unrecognised severities", () => {
    expect(computeRiskScore([{ severity: "SEVERE" }])).toBe(0);
    expect(computeRiskScore([{ severity: "HIGH" }, { severity: undefined }])).toBe(BASE.HIGH);
  });

  it("sorts hazards highest severity first without mutating the input", () => {
    const input = [{ severity: "LOW" }, { severity: "CRITICAL" }, { severity: "MEDIUM" }];
    const sorted = sortBySeverity(input);
    expect(sorted.map((h) => h.severity)).toEqual(["CRITICAL", "MEDIUM", "LOW"]);
    expect(input[0].severity).toBe("LOW");
  });
});
