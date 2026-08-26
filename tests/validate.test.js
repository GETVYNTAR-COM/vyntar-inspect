import { describe, expect, it } from "vitest";
import { normaliseInspectionResult, resolveRisk, resolveStatus } from "@/lib/inspection/validate";
import {
  DUPLICATE_DESCRIPTION,
  bentHookLatch,
  cleanChainSlingUnreadableTag,
  cleanEquipmentVisibleIdentification,
  cosmeticPaintWear,
  deformedChainLink,
  duplicateDescriptionBlockingPoint,
  duplicateDescriptionHazard,
  duplicateDescriptionOnImminentLift,
  frayedWireRope,
  poorQualityPhotograph,
  riggedLiftPrerequisitesUnresolved,
  spareShackleNearby,
  unknownLoadMassStandaloneAccessory,
  unreadableTagReportedAsHazard,
} from "./fixtures.js";

const run = (fixture) => normaliseInspectionResult(fixture);

describe("status resolver", () => {
  const base = { hazards: [], verificationPoints: [], confidence: 90 };

  it("returns CRITICAL_FAIL for any HIGH or CRITICAL visible defect", () => {
    expect(resolveStatus({ ...base, hazards: [{ severity: "HIGH" }] })).toBe("CRITICAL_FAIL");
    expect(resolveStatus({ ...base, hazards: [{ severity: "CRITICAL" }] })).toBe("CRITICAL_FAIL");
  });

  it("puts a blocking verification point above a minor visible defect", () => {
    expect(
      resolveStatus({
        ...base,
        hazards: [{ severity: "MEDIUM" }],
        verificationPoints: [{ blocking_before_use: true, verification_kind: "OPERATION_PREREQUISITE" }],
      })
    ).toBe("HOLD_FOR_VERIFICATION");
  });

  it("returns CONDITIONAL_PASS for LOW or MEDIUM visible defects", () => {
    expect(resolveStatus({ ...base, hazards: [{ severity: "LOW" }] })).toBe("CONDITIONAL_PASS");
  });

  it("returns CONDITIONAL_PASS for a non-blocking operation prerequisite", () => {
    expect(
      resolveStatus({
        ...base,
        verificationPoints: [{ blocking_before_use: false, verification_kind: "OPERATION_PREREQUISITE" }],
      })
    ).toBe("CONDITIONAL_PASS");
  });

  it("returns PASS when only routine verification reminders are listed", () => {
    expect(
      resolveStatus({
        ...base,
        verificationPoints: [
          { blocking_before_use: false, verification_kind: "ROUTINE_PRE_USE" },
          { blocking_before_use: false, verification_kind: "ROUTINE_PRE_USE" },
        ],
      })
    ).toBe("PASS");
  });

  it("withholds a clean PASS when the analysis confidence is below 50", () => {
    expect(resolveStatus({ ...base, confidence: 30 })).toBe("CONDITIONAL_PASS");
  });
});

describe("risk resolver", () => {
  it("never puts a number against a hold", () => {
    expect(resolveRisk({ status: "HOLD_FOR_VERIFICATION", hazards: [{ severity: "MEDIUM" }] })).toEqual({
      risk_score: null,
      risk_basis: "INSUFFICIENT_EVIDENCE",
    });
  });

  it("scores zero on visible evidence when nothing is wrong and nothing blocks use", () => {
    expect(resolveRisk({ status: "PASS", hazards: [] })).toEqual({
      risk_score: 0,
      risk_basis: "VISIBLE_EVIDENCE_ONLY",
    });
  });
});

describe("evidence discipline", () => {
  it("keeps a clean chain sling with an unreadable tag out of HOLD", () => {
    const { result } = run(cleanChainSlingUnreadableTag);
    expect(result.overall_status).toBe("PASS");
    expect(result.risk_score).toBe(0);
    expect(result.risk_basis).toBe("VISIBLE_EVIDENCE_ONLY");
    expect(result.hazards).toHaveLength(0);
    expect(result.verification_points).toHaveLength(2);
    expect(result.verification_points.every((p) => p.blocking_before_use === false)).toBe(true);
  });

  it("passes clean equipment with visible identification", () => {
    const { result } = run(cleanEquipmentVisibleIdentification);
    expect(result.overall_status).toBe("PASS");
    expect(result.risk_score).toBe(0);
    expect(result.hazards).toHaveLength(0);
  });

  it("invents no hazard from a poor-quality photograph and keeps verification non-blocking", () => {
    const { result, changes } = run(poorQualityPhotograph);
    expect(result.hazards).toHaveLength(0);
    expect(result.verification_points.every((p) => p.blocking_before_use === false)).toBe(true);
    expect(result.overall_status).toBe("CONDITIONAL_PASS");
    expect(result.risk_score).toBe(0);
    expect(changes.some((c) => c.includes("moved to verification"))).toBe(true);
  });

  it("moves an unreadable tag out of the hazard stream", () => {
    const { result } = run(unreadableTagReportedAsHazard);
    expect(result.hazards).toHaveLength(0);
    expect(result.verification_points).toHaveLength(1);
    expect(result.verification_points[0].description).toMatch(/label is unreadable/i);
    expect(result.overall_status).toBe("PASS");
  });

  it("does not treat a shackle lying nearby as omitted from the assembly", () => {
    const { result } = run(spareShackleNearby);
    expect(result.hazards).toHaveLength(0);
    expect(result.overall_status).not.toBe("CRITICAL_FAIL");
    expect(result.risk_score).toBe(0);
  });

  it("does not turn cosmetic paint wear into a mechanical hazard", () => {
    const { result } = run(cosmeticPaintWear);
    expect(result.hazards).toHaveLength(0);
    expect(result.risk_score).toBe(0);
  });

  it("keeps a visibly bent hook latch as a counted HIGH defect", () => {
    const { result } = run(bentHookLatch);
    expect(result.hazards).toHaveLength(1);
    expect(result.hazards[0].severity).toBe("HIGH");
    expect(result.hazards[0].action).toMatch(/remove it from service/i);
    expect(result.overall_status).toBe("CRITICAL_FAIL");
    expect(result.risk_score).toBe(65);
  });

  it("keeps a deformed chain link as a CRITICAL defect", () => {
    const { result } = run(deformedChainLink);
    expect(result.hazards).toHaveLength(1);
    expect(result.hazards[0].severity).toBe("CRITICAL");
    expect(result.overall_status).toBe("CRITICAL_FAIL");
  });

  it("keeps a frayed wire rope critical, counted and scored", () => {
    const { result } = run(frayedWireRope);
    expect(result.overall_status).toBe("CRITICAL_FAIL");
    expect(result.risk_score).toBe(98);
    expect(result.risk_basis).toBe("VISIBLE_EVIDENCE_ONLY");
    expect(result.hazards).toHaveLength(1);
    expect(result.verification_points).toHaveLength(0);
  });

  it("downgrades a HIGH finding below the confidence floor", () => {
    const { result, changes } = run({
      ...frayedWireRope,
      hazards: [{ ...frayedWireRope.hazards[0], severity: "HIGH", confidence: 55 }],
    });
    expect(result.hazards[0].severity).toBe("MEDIUM");
    expect(result.overall_status).toBe("CONDITIONAL_PASS");
    expect(changes.some((c) => c.includes("downgraded to MEDIUM"))).toBe(true);
  });

  it("moves a hazard with no visible evidence or location to verification", () => {
    const { result } = run({
      ...frayedWireRope,
      hazards: [{ ...frayedWireRope.hazards[0], visible_evidence: "", location: "" }],
    });
    expect(result.hazards).toHaveLength(0);
    expect(result.verification_points).toHaveLength(1);
    expect(result.verification_points[0].blocking_before_use).toBe(false);
  });

  it("counts the same visible defect once", () => {
    const { result, changes } = run({
      ...frayedWireRope,
      hazards: [frayedWireRope.hazards[0], { ...frayedWireRope.hazards[0] }],
    });
    expect(result.hazards).toHaveLength(1);
    expect(changes.some((c) => c.includes("duplicate"))).toBe(true);
  });
});

describe("blocking verification", () => {
  it("holds a rigged lift with unresolved mandatory prerequisites and invents no hazards", () => {
    const { result } = run(riggedLiftPrerequisitesUnresolved);
    expect(result.overall_status).toBe("HOLD_FOR_VERIFICATION");
    expect(result.risk_score).toBeNull();
    expect(result.risk_basis).toBe("INSUFFICIENT_EVIDENCE");
    expect(result.hazards).toEqual([]);
    expect(result.verification_points.filter((p) => p.blocking_before_use)).toHaveLength(4);
    expect(result.compliant_controls).toHaveLength(5);
  });

  it("treats unknown load mass on an imminent lift as blocking, not as a hazard", () => {
    const { result } = run(riggedLiftPrerequisitesUnresolved);
    const mass = result.verification_points.find((p) => /valve mass/i.test(p.description));
    expect(mass.blocking_before_use).toBe(true);
    expect(mass.verification_kind).toBe("OPERATION_PREREQUISITE");
  });

  it("treats unknown load mass on a standalone accessory as non-blocking", () => {
    const { result, changes } = run(unknownLoadMassStandaloneAccessory);
    expect(result.verification_points[0].blocking_before_use).toBe(false);
    expect(result.overall_status).toBe("CONDITIONAL_PASS");
    expect(result.risk_score).toBe(0);
    expect(changes.some((c) => c.includes("operation state is STANDALONE_EQUIPMENT"))).toBe(true);
  });

  it("refuses blocking status when the operation context is UNKNOWN", () => {
    const { result } = run({
      ...riggedLiftPrerequisitesUnresolved,
      operation_context: { state: "UNKNOWN", visible_basis: "", confidence: 90 },
    });
    expect(result.verification_points.every((p) => p.blocking_before_use === false)).toBe(true);
    expect(result.overall_status).not.toBe("HOLD_FOR_VERIFICATION");
  });

  it("refuses blocking status below the operation-context confidence floor", () => {
    const { result } = run({
      ...riggedLiftPrerequisitesUnresolved,
      operation_context: { ...riggedLiftPrerequisitesUnresolved.operation_context, confidence: 55 },
    });
    expect(result.verification_points.every((p) => p.blocking_before_use === false)).toBe(true);
  });

  it("refuses blocking status for a routine pre-use check on an imminent operation", () => {
    const { result } = run({
      ...riggedLiftPrerequisitesUnresolved,
      hazards: [],
      verification_points: [
        {
          ...riggedLiftPrerequisitesUnresolved.verification_points[0],
          verification_kind: "ROUTINE_PRE_USE",
        },
      ],
    });
    expect(result.verification_points[0].blocking_before_use).toBe(false);
  });

  it("refuses blocking status when the reason is only an unreadable tag", () => {
    const { result, changes } = run({
      ...riggedLiftPrerequisitesUnresolved,
      hazards: [],
      verification_points: [
        {
          ...riggedLiftPrerequisitesUnresolved.verification_points[0],
          blocking_reason: "The identification tag on the sling is not legible in this photograph.",
        },
      ],
    });
    expect(result.verification_points[0].blocking_before_use).toBe(false);
    expect(changes.some((c) => c.includes("no specific mandatory prerequisite"))).toBe(true);
  });
});

describe("duplicate verification points", () => {
  it("keeps the validated blocking prerequisite when a demoted hazard shares its description", () => {
    const { result } = run(duplicateDescriptionOnImminentLift);

    expect(result.hazards).toEqual([]);
    expect(result.verification_points).toHaveLength(1);

    const point = result.verification_points[0];
    expect(point.verification_kind).toBe("OPERATION_PREREQUISITE");
    expect(point.blocking_before_use).toBe(true);
    expect(point.blocking_reason).toMatch(/load mass must be matched to the lift plan/i);

    expect(result.overall_status).toBe("HOLD_FOR_VERIFICATION");
    expect(result.risk_score).toBeNull();
    expect(result.risk_basis).toBe("INSUFFICIENT_EVIDENCE");
  });

  it("merges the most complete fields from both halves", () => {
    const { result } = run(duplicateDescriptionOnImminentLift);
    const point = result.verification_points[0];
    expect(point.description).toBe(DUPLICATE_DESCRIPTION);
    expect(point.location).toBe("Valve body, cast data plate");
    expect(point.regulation).toBe("LOLER 1998");
    expect(point.required_check).toMatch(/rated capacity of every accessory/i);
    expect(point.reason_unverified).toBeTruthy();
  });

  it("reaches the same result whichever order the duplicates arrive in", () => {
    const routineDuplicate = {
      evidence_type: "VERIFICATION_REQUIRED",
      description: DUPLICATE_DESCRIPTION,
      reason_unverified: "The valve mass is not visible.",
      verification_kind: "ROUTINE_PRE_USE",
      required_check: "Competent person to confirm the valve mass.",
      blocking_before_use: false,
    };

    const blockingFirst = run({
      ...duplicateDescriptionOnImminentLift,
      hazards: [],
      verification_points: [duplicateDescriptionBlockingPoint, routineDuplicate],
    }).result;
    const routineFirst = run({
      ...duplicateDescriptionOnImminentLift,
      hazards: [],
      verification_points: [routineDuplicate, duplicateDescriptionBlockingPoint],
    }).result;

    for (const result of [blockingFirst, routineFirst]) {
      expect(result.verification_points).toHaveLength(1);
      expect(result.verification_points[0].blocking_before_use).toBe(true);
      expect(result.verification_points[0].verification_kind).toBe("OPERATION_PREREQUISITE");
      expect(result.overall_status).toBe("HOLD_FOR_VERIFICATION");
      expect(result.risk_score).toBeNull();
    }
  });

  it("does not let a duplicate smuggle blocking status past the guards", () => {
    const { result } = run({
      ...duplicateDescriptionOnImminentLift,
      hazards: [duplicateDescriptionHazard],
      verification_points: [
        {
          ...duplicateDescriptionBlockingPoint,
          blocking_reason: "The data plate is not legible in this photograph.",
        },
      ],
    });

    expect(result.verification_points).toHaveLength(1);
    expect(result.verification_points[0].blocking_before_use).toBe(false);
    expect(result.verification_points[0].blocking_reason).toBeUndefined();
    expect(result.overall_status).toBe("CONDITIONAL_PASS");
    expect(result.risk_score).toBe(0);
  });

  it("does not let a duplicate bypass the operation-context guard", () => {
    const { result } = run({
      ...duplicateDescriptionOnImminentLift,
      operation_context: { state: "STANDALONE_EQUIPMENT", visible_basis: "Valve at rest.", confidence: 90 },
    });

    expect(result.verification_points).toHaveLength(1);
    expect(result.verification_points[0].blocking_before_use).toBe(false);
    expect(result.overall_status).not.toBe("HOLD_FOR_VERIFICATION");
  });
});

describe("authoritative output", () => {
  it("recomputes a status the model proposed differently", () => {
    const { result, changes } = run({ ...frayedWireRope, overall_status: "CONDITIONAL_PASS", risk_score: 40 });
    expect(result.overall_status).toBe("CRITICAL_FAIL");
    expect(result.risk_score).toBe(98);
    expect(changes.some((c) => c.includes("model proposed CONDITIONAL_PASS"))).toBe(true);
    expect(changes.some((c) => c.includes("recalculated as 98"))).toBe(true);
  });

  it("survives an empty or malformed response without throwing", () => {
    for (const input of [null, undefined, {}, { hazards: "nope", verification_points: 4 }]) {
      const { result } = normaliseInspectionResult(input);
      expect(result.hazards).toEqual([]);
      expect(result.verification_points).toEqual([]);
      expect(result.overall_status).toBe("CONDITIONAL_PASS");
      expect(result.operation_context.state).toBe("UNKNOWN");
    }
  });

  it("accepts legacy string compliant controls", () => {
    const { result } = run({ ...cleanEquipmentVisibleIdentification, compliant_controls: ["Hard hats visible"] });
    expect(result.compliant_controls).toEqual([
      { evidence_type: "VISIBLE_COMPLIANT_CONTROL", description: "Hard hats visible" },
    ]);
  });
});
