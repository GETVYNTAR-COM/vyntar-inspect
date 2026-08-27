import { describe, expect, it } from "vitest";
import {
  getBlockingVerificationPoints,
  getCompliantControls,
  getCounts,
  getHazards,
  getRiskDisplay,
  getRiskExportValue,
  getStatusMessage,
  getStatusPresentation,
  getVerificationLabel,
  getVerificationPoints,
  isLegacyResult,
} from "@/lib/inspection/view";
import { normaliseInspectionResult } from "@/lib/inspection/validate";
import { frayedWireRope, legacyStoredResult, riggedLiftPrerequisitesUnresolved } from "./fixtures.js";

const hold = normaliseInspectionResult(riggedLiftPrerequisitesUnresolved).result;
const critical = normaliseInspectionResult(frayedWireRope).result;

describe("count selectors", () => {
  it("never combines hazards with verification points", () => {
    const counts = getCounts(hold);
    expect(counts.hazards).toBe(0);
    expect(counts.verifications).toBe(7);
    expect(counts.blocking).toBe(4);
    expect(counts.controls).toBe(5);
  });

  it("reports the hazard count as hazards.length", () => {
    expect(getCounts(critical).hazards).toBe(critical.hazards.length);
    expect(getCounts(critical).criticalHazards).toBe(1);
  });

  it("returns blocking points only", () => {
    expect(getBlockingVerificationPoints(hold)).toHaveLength(4);
    expect(getBlockingVerificationPoints(critical)).toHaveLength(0);
  });
});

describe("risk display", () => {
  it("shows a pending dash rather than zero for a hold", () => {
    const risk = getRiskDisplay(hold);
    expect(risk.value).toBeNull();
    expect(risk.display).toBe("—");
    expect(risk.pending).toBe(true);
    expect(risk.caption).toBe("Pending physical verification");
  });

  it("shows the number when one exists", () => {
    expect(getRiskDisplay(critical)).toMatchObject({ value: 98, display: "98", pending: false });
  });

  it("exports a blank rather than a zero when verification is pending", () => {
    expect(getRiskExportValue(hold)).toBe("");
    expect(getRiskExportValue(critical)).toBe("98");
    expect(getRiskExportValue({ risk_score: 0 })).toBe("0");
  });
});

describe("status presentation", () => {
  it("labels every status, including hold", () => {
    expect(getStatusPresentation("HOLD_FOR_VERIFICATION")).toMatchObject({ short: "Hold", tone: "amber" });
    expect(getStatusPresentation("PASS").tone).toBe("pass");
    expect(getStatusPresentation("CRITICAL_FAIL").tone).toBe("signal");
  });

  it("does not offer 'may remain in service' wording under a hold", () => {
    expect(getStatusMessage("HOLD_FOR_VERIFICATION")).not.toMatch(/remain in service/i);
    expect(getStatusMessage("HOLD_FOR_VERIFICATION")).toMatch(/Do not commence the operation/i);
    expect(getStatusMessage("CONDITIONAL_PASS")).toMatch(/competent person confirms it is safe/i);
  });

  it("labels verification points as blocking or routine", () => {
    expect(getVerificationLabel({ blocking_before_use: true })).toBe("HOLD POINT — COMPLETE BEFORE OPERATION");
    expect(getVerificationLabel({ blocking_before_use: false })).toBe("ROUTINE CHECK — NON-BLOCKING");
  });
});

describe("historical record compatibility", () => {
  it("renders a record saved before the evidence split without reinterpreting it", () => {
    expect(isLegacyResult(legacyStoredResult)).toBe(true);
    expect(getHazards(legacyStoredResult)).toHaveLength(1);
    expect(getHazards(legacyStoredResult)[0].severity).toBe("MEDIUM");
    expect(getVerificationPoints(legacyStoredResult)).toEqual([]);
    expect(getRiskDisplay(legacyStoredResult)).toMatchObject({ value: 42, pending: false });
    expect(legacyStoredResult.overall_status).toBe("CONDITIONAL_PASS");
  });

  it("accepts both the legacy string and the current object compliant-control forms", () => {
    expect(getCompliantControls(legacyStoredResult)).toEqual([
      { evidence_type: "VISIBLE_COMPLIANT_CONTROL", description: "Hard hats visible on both workers" },
      { evidence_type: "VISIBLE_COMPLIANT_CONTROL", description: "Load backrest fitted" },
    ]);
    expect(getCompliantControls(hold)[0]).toMatchObject({ description: "Workers wearing hard hats" });
  });

  it("counts a legacy record without inventing verification points", () => {
    expect(getCounts(legacyStoredResult)).toMatchObject({ hazards: 1, verifications: 0, blocking: 0, controls: 2 });
  });

  it("tolerates a missing or empty result", () => {
    expect(getCounts(null)).toMatchObject({ hazards: 0, verifications: 0, blocking: 0, controls: 0 });
    expect(getRiskDisplay(undefined).pending).toBe(true);
    expect(isLegacyResult(null)).toBe(true);
  });
});
