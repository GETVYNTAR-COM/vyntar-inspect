import { describe, expect, it } from "vitest";
import {
  isLoadVisiblySuspended,
  normaliseInspectionResult,
  resolveRisk,
  resolveStatus,
  stripCountClaims,
} from "@/lib/inspection/validate";
import { getHoldInstruction, getStatusMessage, getStatusPresentation } from "@/lib/inspection/view";
import {
  DUPLICATE_DESCRIPTION,
  beamClampsMisreadAsOverheadCrane,
  bentHookLatch,
  chainBlocksOnBeamClamps,
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
  valveLiftHousekeepingAndCategory,
  scaffoldPlanksStackedOnDeck,
  frayedSlingLyingOnDeck,
  chafedHydraulicHoseOnPowerPack,
  valveLiftHypotheticalRope,
  crackedWeldDescribedWithHedge,
} from "./fixtures.js";

const run = (fixture) => normaliseInspectionResult(fixture);

describe("status resolver", () => {
  const base = { hazards: [], verificationPoints: [], confidence: 90 };

  // Regression: a single HIGH finding produced "STOP - OUT OF SERVICE / CRITICAL
  // HAZARD DETECTED" on a report with no CRITICAL hazard in it. Condemnation
  // language belongs to CRITICAL alone.
  it("reserves CRITICAL_FAIL for a visible CRITICAL hazard", () => {
    expect(resolveStatus({ ...base, hazards: [{ severity: "CRITICAL" }] })).toBe("CRITICAL_FAIL");
    expect(resolveStatus({ ...base, hazards: [{ severity: "HIGH" }] })).toBe("FAIL");
    expect(resolveStatus({ ...base, hazards: [{ severity: "HIGH" }, { severity: "LOW" }] })).toBe("FAIL");
  });

  it("does not escalate to CRITICAL_FAIL on a pile of non-critical hazards", () => {
    const hazards = [{ severity: "HIGH" }, { severity: "HIGH" }, { severity: "MEDIUM" }, { severity: "LOW" }];
    expect(resolveStatus({ ...base, hazards })).toBe("FAIL");
  });

  it("holds for verification when blocking points stand with no critical hazard", () => {
    expect(
      resolveStatus({
        ...base,
        hazards: [],
        verificationPoints: [{ blocking_before_use: true, verification_kind: "OPERATION_PREREQUISITE" }],
      })
    ).toBe("HOLD_FOR_VERIFICATION");
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
    // Serious, but not a condemnation: no CRITICAL hazard, so no tag-out verdict.
    expect(result.overall_status).toBe("FAIL");
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

describe("hazard scope", () => {
  // Regression: a coiled rope on the deck was reported HIGH/MECHANICAL and took the
  // risk index to 67. hazards[] covers the declared equipment, its load path and its
  // own condition — site housekeeping is neither.
  it("routes a housekeeping finding out of hazards and away from the risk index", () => {
    const { result } = run(valveLiftHousekeepingAndCategory);
    const rope = result.verification_points.find((point) => /rope/i.test(point.description));

    expect(result.hazards.some((hazard) => /rope/i.test(hazard.description))).toBe(false);
    expect(rope).toBeDefined();
    expect(rope.evidence_type).toBe("VERIFICATION_REQUIRED");
    expect(rope.blocking_before_use).toBe(false);
    expect(rope.severity).toBeUndefined();
  });

  it("catches scene furniture stated without housekeeping vocabulary", () => {
    const { result } = run(scaffoldPlanksStackedOnDeck);
    expect(result.hazards).toHaveLength(0);
    expect(result.verification_points).toHaveLength(1);
    expect(result.risk_score).toBe(0);
    expect(result.overall_status).not.toBe("FAIL");
  });

  it("never demotes a visible defect in the load path, however it is placed", () => {
    const { result } = run(frayedSlingLyingOnDeck);
    expect(result.hazards).toHaveLength(1);
    expect(result.hazards[0].severity).toBe("CRITICAL");
    expect(result.overall_status).toBe("CRITICAL_FAIL");
    expect(result.risk_score).toBe(98);
  });

  it("keeps a defect in the equipment itself, whatever surface it rests on", () => {
    const { result } = run(chafedHydraulicHoseOnPowerPack);
    expect(result.hazards).toHaveLength(1);
    expect(result.hazards[0].severity).toBe("HIGH");
    expect(result.overall_status).toBe("FAIL");
    expect(result.risk_score).toBe(65);
  });

  // Regression: the category-mismatch finding arrived as a LOW hazard. A form field
  // that needs correcting before signing is not a visible unsafe condition.
  it("routes an administrative finding to verification with no risk contribution", () => {
    const { result } = run(valveLiftHousekeepingAndCategory);
    const category = result.verification_points.find((point) => /category/i.test(point.description));

    expect(result.hazards.some((hazard) => /category/i.test(hazard.description))).toBe(false);
    expect(category).toBeDefined();
    expect(category.evidence_type).toBe("VERIFICATION_REQUIRED");
    expect(category.blocking_before_use).toBe(false);
    expect(category.required_check).toMatch(/category/i);
  });
});

describe("valve-lift acceptance photograph", () => {
  // The whole live failure, end to end: what the deployed build must now return.
  it("returns a hold with no hazards, no risk number and its blocking points intact", () => {
    const { result } = run(valveLiftHousekeepingAndCategory);

    expect(result.hazards).toHaveLength(0);
    expect(result.overall_status).toBe("HOLD_FOR_VERIFICATION");
    expect(result.risk_score).toBeNull();
    expect(result.risk_basis).toBe("INSUFFICIENT_EVIDENCE");

    const blocking = result.verification_points.filter((point) => point.blocking_before_use === true);
    expect(blocking).toHaveLength(3);
    for (const point of blocking) {
      expect(point.verification_kind).toBe("OPERATION_PREREQUISITE");
      expect(point.blocking_reason).toBeTruthy();
    }

    // The two demoted findings survive as non-blocking checks rather than vanishing.
    expect(result.verification_points).toHaveLength(5);
    expect(result.verification_points.filter((point) => point.blocking_before_use === false)).toHaveLength(2);
  });

  it("carries none of the stop, tag-out or out-of-service language", () => {
    const { result } = run(valveLiftHousekeepingAndCategory);
    expect(getStatusMessage(result.overall_status)).not.toMatch(/tag out|out of service|remove from operation/i);
    expect(getStatusPresentation(result.overall_status).label).toBe("Hold for verification");
  });
});

describe("housekeeping is moved, never downgraded", () => {
  // Regression: the rope came back MEDIUM inside hazards[] rather than being moved.
  // Two things let it through — the severity guards downgrade rather than relocate,
  // and "planned rigging" matched the load-path exemption.
  it("removes a housekeeping finding from hazards[] entirely", () => {
    const { result } = run(valveLiftHypotheticalRope);

    // Absence, not a reduced severity: no rope entry at ANY severity.
    expect(result.hazards).toHaveLength(0);
    expect(result.hazards.some((hazard) => /rope/i.test(hazard.description))).toBe(false);
    expect(result.hazards.some((hazard) => hazard.severity === "MEDIUM")).toBe(false);

    const rope = result.verification_points.find((point) => /rope/i.test(point.description));
    expect(rope).toBeDefined();
    expect(rope.evidence_type).toBe("VERIFICATION_REQUIRED");
    expect(rope.blocking_before_use).toBe(false);
    expect(rope.severity).toBeUndefined();

    // And nothing it contributed survives in the numbers.
    expect(result.risk_score).toBeNull();
    expect(result.overall_status).toBe("HOLD_FOR_VERIFICATION");
  });

  it("does not let a mention of rigging rescue a trip hazard", () => {
    const { changes } = run(valveLiftHypotheticalRope);
    expect(changes.some((entry) => /moved to verification/i.test(entry))).toBe(true);
  });

  it("relocates a conditional finding with no visible defect behind it", () => {
    const { result } = run({
      ...valveLiftHypotheticalRope,
      hazards: [
        {
          evidence_type: "VISIBLE_UNSAFE_CONDITION",
          severity: "MEDIUM",
          category: "MECHANICAL",
          description: "The shackle pin may not be fully seated",
          visible_evidence: "The pin head is visible at the side of the bow.",
          location: "Shackle bow",
          action: "Check the pin.",
          confidence: 80,
        },
      ],
    });

    expect(result.hazards).toHaveLength(0);
    const moved = result.verification_points.find((point) => /shackle pin/i.test(point.description));
    expect(moved).toBeDefined();
    expect(moved.blocking_before_use).toBe(false);
  });

  it("keeps a visible defect that happens to be described with a hedge", () => {
    const { result } = run(crackedWeldDescribedWithHedge);
    expect(result.hazards).toHaveLength(1);
    expect(result.hazards[0].severity).toBe("CRITICAL");
    expect(result.overall_status).toBe("CRITICAL_FAIL");
    expect(result.risk_score).toBe(98);
  });
});

describe("counts are never stated twice", () => {
  // Regression: notes said "four blocking verification points" beside a header
  // reading three, because notes is written before validation runs.
  it("removes the model's own counts from the notes prose", () => {
    const { result, changes } = run(valveLiftHypotheticalRope);

    expect(result.notes).not.toMatch(/four/i);
    expect(result.notes).not.toMatch(/blocking verification points/i);
    expect(result.notes).toMatch(/rigged and about to commence/i);
    expect(changes.some((entry) => /notes: removed a sentence stating its own counts/.test(entry))).toBe(true);
  });

  it("counts the validated result, not what the model proposed", () => {
    const { result } = run(valveLiftHypotheticalRope);
    // The model claimed four blocking points; one named no prerequisite and lost
    // its blocking status, so the answer is three.
    expect(result.verification_points.filter((point) => point.blocking_before_use)).toHaveLength(3);
  });

  it("leaves qualitative prose carrying no numbers alone", () => {
    const notes = "No clearly visible defect identified. Competent person to confirm on site.";
    expect(stripCountClaims(notes)).toBe(notes);
  });

  it("strips only the sentence that carries the count", () => {
    const stripped = stripCountClaims("Lift is rigged. Three hazards were identified. Inspect before hoisting.");
    expect(stripped).toMatch(/Lift is rigged/);
    expect(stripped).toMatch(/Inspect before hoisting/);
    expect(stripped).not.toMatch(/Three hazards/i);
  });
});

/**
 * 16 September 2026 field correction. Chain blocks hung from beam clamps came back
 * as an "overhead travelling crane", so no clamp check was ever asked and visible
 * side loading of the clamps went unreported. A Lifting Authority caught it on sight.
 */
describe("suspended-load escalation", () => {
  it("reads a load off the ground from the operation context, not from the state alone", () => {
    const active = { state: "OPERATION_ACTIVE", visible_basis: "Load suspended clear of the deck.", confidence: 86 };
    expect(isLoadVisiblySuspended(active)).toBe(true);

    // Work under way with nothing in the air is not a suspended load.
    expect(
      isLoadVisiblySuspended({ ...active, visible_basis: "An operative is greasing the hoist body." })
    ).toBe(false);
    // An imminent lift has not picked the load up yet.
    expect(isLoadVisiblySuspended({ ...active, state: "OPERATION_IMMINENT" })).toBe(false);
    // And the same confidence floor applies as to any other hold.
    expect(isLoadVisiblySuspended({ ...active, confidence: 55 })).toBe(false);
  });

  it("makes rigging configuration, attachment points and the exclusion zone blocking", () => {
    const { result, changes } = run(chainBlocksOnBeamClamps);

    const blocking = result.verification_points.filter((point) => point.blocking_before_use === true);
    const descriptions = blocking.map((point) => point.description).join(" | ");
    expect(descriptions).toMatch(/load sharing/i);
    expect(descriptions).toMatch(/fit to the beam flange/i);
    expect(descriptions).toMatch(/exclusion zone/i);

    for (const point of blocking) {
      expect(point.verification_kind).toBe("OPERATION_PREREQUISITE");
      expect(point.blocking_reason).toBeTruthy();
    }
    expect(changes.filter((entry) => /escalated to a hold point/.test(entry))).toHaveLength(3);
  });

  it("leaves a routine check that is not one of the three alone", () => {
    const { result } = run(chainBlocksOnBeamClamps);
    const tags = result.verification_points.find((point) => /identification tags/i.test(point.description));
    expect(tags.blocking_before_use).toBe(false);
    expect(tags.verification_kind).toBe("ROUTINE_PRE_USE");
  });

  it("escalates nothing while the load is still on the ground", () => {
    const { result, changes } = run({
      ...chainBlocksOnBeamClamps,
      operation_context: {
        state: "OPERATION_IMMINENT",
        visible_basis: "Chain blocks rigged to the load, which is still standing on the deck.",
        confidence: 86,
      },
    });
    expect(changes.some((entry) => /escalated to a hold point/.test(entry))).toBe(false);
    const escalatable = result.verification_points.filter((point) =>
      /load sharing|beam flange|exclusion zone/i.test(point.description)
    );
    expect(escalatable).toHaveLength(3);
    expect(escalatable.every((point) => point.blocking_before_use === false)).toBe(true);
  });
});

describe("compliant controls cannot outrank a verification point", () => {
  it("removes a control covering a matter the report says cannot be verified", () => {
    const { result, changes } = run(chainBlocksOnBeamClamps);
    const descriptions = result.compliant_controls.map((control) => control.description);

    // The report asks for the tags to be read and for the exclusion zone to be
    // confirmed. It cannot also present either as a control already satisfied.
    expect(descriptions.some((entry) => /identification tag/i.test(entry))).toBe(false);
    expect(descriptions.some((entry) => /exclusion zone/i.test(entry))).toBe(false);
    expect(descriptions).toContain("Operatives wearing hard hats");
    expect(changes.filter((entry) => /compliant control .*removed/.test(entry))).toHaveLength(2);
  });

  it("strips a colour-coding tag offered as proof the equipment is in date", () => {
    const { result } = run(beamClampsMisreadAsOverheadCrane);
    expect(result.compliant_controls.some((control) => /colour-coding tag/i.test(control.description))).toBe(false);
  });

  it("keeps controls on subjects nothing in the report questions", () => {
    const { result } = run(riggedLiftPrerequisitesUnresolved);
    expect(result.compliant_controls).toHaveLength(5);
  });

  it("keeps every control when the report raises nothing at all", () => {
    const { result } = run(cleanEquipmentVisibleIdentification);
    expect(result.compliant_controls).toHaveLength(1);
  });
});

describe("hold wording follows the operation context", () => {
  it("tells a crew with a load in the air to stop, not to refrain from starting", () => {
    const { result } = run(chainBlocksOnBeamClamps);
    expect(result.overall_status).toBe("HOLD_FOR_VERIFICATION");

    const message = getStatusMessage(result.overall_status, result.operation_context);
    expect(message).toMatch(/STOP \/ HOLD THE OPERATION — do not continue/);
    expect(message).not.toMatch(/do not commence/i);
    expect(getHoldInstruction(result.operation_context)).toBe("STOP / HOLD THE OPERATION — DO NOT CONTINUE");
  });

  it("keeps 'do not commence' for an operation that has not started", () => {
    const { result } = run(riggedLiftPrerequisitesUnresolved);
    expect(result.operation_context.state).toBe("OPERATION_IMMINENT");
    expect(getStatusMessage(result.overall_status, result.operation_context)).toMatch(/Do not commence the operation/);
    expect(getHoldInstruction(result.operation_context)).toBe("DO NOT COMMENCE THE OPERATION");
  });

  it("changes nothing for any other verdict", () => {
    const { result } = run(chainBlocksOnBeamClamps);
    const active = result.operation_context;
    expect(getStatusMessage("CRITICAL_FAIL", active)).toBe(getStatusMessage("CRITICAL_FAIL"));
    expect(getStatusMessage("FAIL", active)).toBe(getStatusMessage("FAIL"));
    expect(getStatusMessage("PASS", active)).toBe(getStatusMessage("PASS"));
  });
});

describe("beam-clamp acceptance photograph", () => {
  it("names the arrangement from what is visible and never claims a crane", () => {
    const { result } = run(chainBlocksOnBeamClamps);
    expect(result.equipment.type).toMatch(/chain block/i);
    expect(result.equipment.type).toMatch(/clamp/i);
    expect(result.equipment.type).not.toMatch(/crane|gantry|runway/i);
  });

  it("raises the side loading as a visible concern carrying an angle verification", () => {
    const { result } = run(chainBlocksOnBeamClamps);

    const sideLoading = result.hazards.find((hazard) => /side loading|away from the vertical/i.test(hazard.description));
    expect(sideLoading).toBeDefined();
    expect(sideLoading.evidence_type).toBe("VISIBLE_UNSAFE_CONDITION");
    expect(sideLoading.visible_evidence).toBeTruthy();
    expect(sideLoading.location).toBeTruthy();

    const angle = result.verification_points.find((point) => /permitted angle/i.test(point.description));
    expect(angle).toBeDefined();
    expect(angle.blocking_before_use).toBe(true);
    expect(angle.required_check).toMatch(/manufacturer/i);
    expect(angle.required_check).toMatch(/wll/i);
  });

  it("holds the operation, invents no defect and puts no number against the hold", () => {
    const { result } = run(chainBlocksOnBeamClamps);

    expect(result.overall_status).toBe("HOLD_FOR_VERIFICATION");
    expect(result.risk_score).toBeNull();
    expect(result.risk_basis).toBe("INSUFFICIENT_EVIDENCE");

    // One finding, and it is the one the Lifting Authority made.
    expect(result.hazards).toHaveLength(1);
    expect(result.hazards[0].severity).toBe("MEDIUM");
    expect(result.verification_points.filter((point) => point.blocking_before_use)).toHaveLength(4);
  });

  it("asks every clamp question the crane misidentification suppressed", () => {
    const { result } = run(chainBlocksOnBeamClamps);
    const prose = result.verification_points
      .map((point) => `${point.description} ${point.required_check}`)
      .join(" | ");

    expect(prose).toMatch(/clamp type|type, rated wll/i); // device type
    expect(prose).toMatch(/wll/i); // rated capacity
    expect(prose).toMatch(/fit(?:ted)? to the (?:beam )?flange/i); // fit to the member
    expect(prose).toMatch(/angle of loading/i); // line of force
  });

  it("does not confirm the arrangement above the clamps", () => {
    const { result } = run(chainBlocksOnBeamClamps);
    expect(result.notes).toMatch(/cannot be confirmed from this photograph/i);
    expect(result.compliant_controls.some((control) => /connected to a single/i.test(control.description))).toBe(false);
  });
});
