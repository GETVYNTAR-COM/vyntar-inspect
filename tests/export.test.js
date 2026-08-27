import { describe, expect, it } from "vitest";
import { auditsToCsv } from "@/lib/storage";
import { normaliseInspectionResult } from "@/lib/inspection/validate";
import { frayedWireRope, legacyStoredResult, riggedLiftPrerequisitesUnresolved } from "./fixtures.js";

const audit = (result, ref) => ({
  auditRef: ref,
  signedAt: "26/08/2026, 09:00:00",
  metadata: { inspector: "A Inspector", cert: "CPCS", equipmentTag: "TAG-1", category: "Lifting accessory", site: "Yard" },
  result,
});

const rowsOf = (csv) => csv.split("\n");
const cells = (row) => row.split('","').map((cell) => cell.replace(/^"|"$/g, ""));

describe("CSV export", () => {
  it("keeps hazard and verification counts in separate columns", () => {
    const csv = auditsToCsv([audit(normaliseInspectionResult(riggedLiftPrerequisitesUnresolved).result, "VYN-HOLD")]);
    const header = cells(rowsOf(csv)[0]);
    const row = cells(rowsOf(csv)[1]);
    expect(header).toContain("Visible hazards");
    expect(header).toContain("Verification points");
    expect(header).toContain("Blocking verifications");
    expect(row[header.indexOf("Visible hazards")]).toBe("0");
    expect(row[header.indexOf("Verification points")]).toBe("7");
    expect(row[header.indexOf("Blocking verifications")]).toBe("4");
  });

  it("exports a blank, never zero, for a hold's risk score", () => {
    const csv = auditsToCsv([audit(normaliseInspectionResult(riggedLiftPrerequisitesUnresolved).result, "VYN-HOLD")]);
    const header = cells(rowsOf(csv)[0]);
    const row = cells(rowsOf(csv)[1]);
    expect(row[header.indexOf("Risk score")]).toBe("");
    expect(row[header.indexOf("Risk basis")]).toBe("INSUFFICIENT_EVIDENCE");
    expect(row[header.indexOf("Status")]).toBe("HOLD_FOR_VERIFICATION");
    expect(row[header.indexOf("Operation context")]).toBe("OPERATION_IMMINENT");
  });

  it("exports the critical score and count", () => {
    const csv = auditsToCsv([audit(normaliseInspectionResult(frayedWireRope).result, "VYN-CRIT")]);
    const header = cells(rowsOf(csv)[0]);
    const row = cells(rowsOf(csv)[1]);
    expect(row[header.indexOf("Risk score")]).toBe("98");
    expect(row[header.indexOf("Visible hazards")]).toBe("1");
    expect(row[header.indexOf("Critical hazards")]).toBe("1");
  });

  it("exports a legacy record without failing or inventing values", () => {
    const csv = auditsToCsv([audit(legacyStoredResult, "VYN-LEGACY")]);
    const header = cells(rowsOf(csv)[0]);
    const row = cells(rowsOf(csv)[1]);
    expect(row[header.indexOf("Risk score")]).toBe("42");
    expect(row[header.indexOf("Risk basis")]).toBe("");
    expect(row[header.indexOf("Visible hazards")]).toBe("1");
    expect(row[header.indexOf("Verification points")]).toBe("0");
  });
});
