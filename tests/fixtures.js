/**
 * Representative model responses used by the regression suite.
 *
 * Several fixtures deliberately contain the mistakes the validator exists to
 * catch — uncertainty filed as a hazard, a spare component read as missing,
 * cosmetic wear read as damage, blocking status claimed without an operation.
 */

export const cleanChainSlingUnreadableTag = {
  equipment: { type: "Chain sling, 2-leg", category: "Lifting accessory", model_estimate: "Grade 80" },
  operation_context: {
    state: "STANDALONE_EQUIPMENT",
    visible_basis: "Sling laid out on a workbench, not connected to any load.",
    confidence: 88,
  },
  confidence: 84,
  hazards: [],
  verification_points: [
    {
      evidence_type: "VERIFICATION_REQUIRED",
      description: "Sling identification tag details",
      reason_unverified: "The tag is present but not legible at this resolution.",
      verification_kind: "ROUTINE_PRE_USE",
      location: "Master link",
      required_check: "Competent person to read the tag and confirm identification, WLL and colour code.",
      blocking_before_use: true,
      blocking_reason: "The sling identification tag is not legible in the photograph.",
    },
    {
      evidence_type: "VERIFICATION_REQUIRED",
      description: "Link-by-link condition of both legs",
      reason_unverified: "Individual link condition cannot be assessed from a general photograph.",
      verification_kind: "ROUTINE_PRE_USE",
      required_check: "Competent person to run each leg through the hand and check for wear, nicks and deformation.",
      blocking_before_use: false,
    },
  ],
  compliant_controls: [
    { evidence_type: "VISIBLE_COMPLIANT_CONTROL", description: "Both hook latches visible and closed" },
  ],
  notes: "Sling laid out for a routine pre-use check.",
};

export const cleanEquipmentVisibleIdentification = {
  equipment: { type: "Bow shackle", category: "Lifting accessory", model_estimate: "6.5t WLL" },
  operation_context: {
    state: "STANDALONE_EQUIPMENT",
    visible_basis: "Single accessory photographed on a bench.",
    confidence: 90,
  },
  confidence: 91,
  hazards: [],
  verification_points: [],
  compliant_controls: [
    {
      evidence_type: "VISIBLE_COMPLIANT_CONTROL",
      description: "WLL stamp and identification legible on the shackle body",
      location: "Bow",
    },
  ],
  notes: "No visible defect identified.",
};

export const poorQualityPhotograph = {
  equipment: { type: "Hydraulic power pack", category: "Work equipment", model_estimate: "" },
  operation_context: { state: "UNKNOWN", visible_basis: "Photograph too unclear to establish.", confidence: 20 },
  confidence: 24,
  hazards: [
    {
      evidence_type: "VISIBLE_UNSAFE_CONDITION",
      severity: "HIGH",
      category: "HYDRAULIC",
      description: "Hydraulic hose condition could not be assessed and may be degraded",
      visible_evidence: "The image is blurred and the hose routing is not visible.",
      location: "Behind the frame",
      action: "Competent person to inspect the hoses.",
      confidence: 30,
    },
  ],
  verification_points: [
    {
      evidence_type: "VERIFICATION_REQUIRED",
      description: "Overall condition of the power pack",
      reason_unverified: "Image quality is too poor to support a visual conclusion.",
      verification_kind: "ROUTINE_PRE_USE",
      required_check: "Retake the photograph in better light, or inspect the unit physically.",
      blocking_before_use: false,
    },
  ],
  compliant_controls: [],
  notes: "Evidence quality materially limits this assessment.",
};

export const unreadableTagReportedAsHazard = {
  equipment: { type: "Round sling", category: "Lifting accessory", model_estimate: "" },
  operation_context: { state: "STANDALONE_EQUIPMENT", visible_basis: "Sling on a rack.", confidence: 82 },
  confidence: 79,
  hazards: [
    {
      evidence_type: "VISIBLE_UNSAFE_CONDITION",
      severity: "MEDIUM",
      category: "OPERATIONAL",
      description: "Sling label is unreadable so the WLL cannot be confirmed",
      visible_evidence: "The label is worn and cannot be read in the photograph.",
      location: "Label sleeve",
      action: "Competent person to confirm the WLL.",
      confidence: 74,
    },
  ],
  verification_points: [],
  compliant_controls: [],
  notes: "",
};

export const spareShackleNearby = {
  equipment: { type: "Chain sling assembly", category: "Lifting accessory", model_estimate: "" },
  operation_context: { state: "ASSEMBLED_NOT_IMMINENT", visible_basis: "Sling made up on the ground.", confidence: 76 },
  confidence: 80,
  hazards: [
    {
      evidence_type: "VISIBLE_UNSAFE_CONDITION",
      severity: "HIGH",
      category: "MECHANICAL",
      description: "A shackle is missing from the sling assembly",
      visible_evidence: "A green shackle is lying nearby on the ground rather than fitted to the assembly.",
      location: "Ground, right of the sling",
      action: "Refit the shackle before use.",
      confidence: 72,
    },
  ],
  verification_points: [],
  compliant_controls: [],
  notes: "",
};

export const cosmeticPaintWear = {
  equipment: { type: "Hook block", category: "Lifting equipment", model_estimate: "" },
  operation_context: { state: "STANDALONE_EQUIPMENT", visible_basis: "Hook block at rest.", confidence: 84 },
  confidence: 86,
  hazards: [
    {
      evidence_type: "VISIBLE_UNSAFE_CONDITION",
      severity: "MEDIUM",
      category: "MECHANICAL",
      description: "Mechanical damage to the hook block body",
      visible_evidence: "Cosmetic paint wear and light surface rust across the hook block cheek plates.",
      location: "Hook block cheek plates",
      action: "Monitor condition.",
      confidence: 78,
    },
  ],
  verification_points: [],
  compliant_controls: [],
  notes: "",
};

export const bentHookLatch = {
  equipment: { type: "Chain sling, 1-leg", category: "Lifting accessory", model_estimate: "" },
  operation_context: { state: "STANDALONE_EQUIPMENT", visible_basis: "Sling hook photographed close up.", confidence: 90 },
  confidence: 88,
  hazards: [
    {
      evidence_type: "VISIBLE_UNSAFE_CONDITION",
      severity: "HIGH",
      category: "MECHANICAL",
      description: "Hook safety latch is bent and no longer closes across the throat",
      visible_evidence: "The latch is bent outward and stands clear of the hook tip, leaving the throat open.",
      location: "Lower hook",
      regulation: "LOLER 1998",
      action: "Stop use of this sling and remove it from service until the latch is replaced.",
      confidence: 91,
    },
  ],
  verification_points: [],
  compliant_controls: [],
  notes: "",
};

export const deformedChainLink = {
  equipment: { type: "Chain sling, 2-leg", category: "Lifting accessory", model_estimate: "" },
  operation_context: { state: "STANDALONE_EQUIPMENT", visible_basis: "Sling leg photographed close up.", confidence: 92 },
  confidence: 90,
  hazards: [
    {
      evidence_type: "VISIBLE_UNSAFE_CONDITION",
      severity: "CRITICAL",
      category: "MECHANICAL",
      description: "Chain link is twisted and visibly deformed",
      visible_evidence: "One link is twisted out of plane and elongated relative to the links either side.",
      location: "Third link from the master link, left leg",
      regulation: "LOLER 1998",
      action: "Remove from service immediately and quarantine the sling.",
      confidence: 93,
    },
  ],
  verification_points: [],
  compliant_controls: [],
  notes: "",
};

export const frayedWireRope = {
  equipment: { type: "Wire rope sling", category: "Lifting accessory", model_estimate: "" },
  operation_context: { state: "STANDALONE_EQUIPMENT", visible_basis: "Rope laid out on the ground.", confidence: 89 },
  confidence: 90,
  hazards: [
    {
      evidence_type: "VISIBLE_UNSAFE_CONDITION",
      severity: "CRITICAL",
      category: "MECHANICAL",
      description: "Wire rope is visibly frayed with multiple broken wires",
      visible_evidence: "Broken outer wires and birdcaging visible over approximately 150 mm of the rope.",
      location: "Mid-span, left of frame",
      regulation: "LOLER 1998",
      action: "Stop use immediately and remove the sling from service.",
      confidence: 94,
    },
  ],
  verification_points: [],
  compliant_controls: [],
  notes: "",
};

export const riggedLiftPrerequisitesUnresolved = {
  equipment: { type: "Gate valve on lifting slings", category: "Lifting operation", model_estimate: "" },
  operation_context: {
    state: "OPERATION_IMMINENT",
    visible_basis: "Valve rigged to a hook block with slings taut and workers standing clear.",
    confidence: 85,
  },
  confidence: 82,
  hazards: [
    {
      evidence_type: "VISIBLE_UNSAFE_CONDITION",
      severity: "MEDIUM",
      category: "OPERATIONAL",
      description: "Coiled rope on the deck could create a trip hazard",
      visible_evidence: "A coiled rope is lying on the deck; whether it crosses a walkway cannot be confirmed.",
      location: "Deck, foreground",
      action: "Clear the rope.",
      confidence: 60,
    },
    {
      evidence_type: "VISIBLE_UNSAFE_CONDITION",
      severity: "HIGH",
      category: "MECHANICAL",
      description: "Sling may be attached to the handwheel rather than a rated lifting point",
      visible_evidence: "The attachment point is obscured by the valve body and cannot be established.",
      location: "Top of valve",
      action: "Confirm the attachment point.",
      confidence: 55,
    },
    {
      evidence_type: "VISIBLE_UNSAFE_CONDITION",
      severity: "MEDIUM",
      category: "MECHANICAL",
      description: "Hook block shows mechanical damage",
      visible_evidence: "Paint wear and discolouration across the hook block body.",
      location: "Hook block",
      action: "Inspect the hook block.",
      confidence: 70,
    },
  ],
  verification_points: [
    {
      evidence_type: "VERIFICATION_REQUIRED",
      description: "Sling and hook-block identification, WLL/SWL and current examination status for this lift",
      reason_unverified: "Identification and examination status cannot be established from the photograph.",
      verification_kind: "OPERATION_PREREQUISITE",
      required_check: "Confirm identification, WLL/SWL and in-date thorough examination for every accessory in this lift.",
      blocking_before_use: true,
      blocking_reason:
        "The rated capacity and current examination status of the assembled rigging are mandatory prerequisites for this lift and cannot be established from the image.",
    },
    {
      evidence_type: "VERIFICATION_REQUIRED",
      description: "Connectors seated on manufacturer-approved rated lifting points with functional hook latches",
      reason_unverified: "The attachment points are obscured by the valve body.",
      verification_kind: "OPERATION_PREREQUISITE",
      required_check: "Confirm every connector is on an approved rated lifting point and every latch is functional.",
      blocking_before_use: true,
      blocking_reason:
        "Attachment to manufacturer-approved rated lifting points is a mandatory prerequisite for this lift and cannot be confirmed from the image.",
    },
    {
      evidence_type: "VERIFICATION_REQUIRED",
      description: "Valve mass against the lift plan and lifting-accessory capacity",
      reason_unverified: "The valve mass is not marked or visible.",
      verification_kind: "OPERATION_PREREQUISITE",
      required_check: "Confirm the valve mass against the lift plan and the rated capacity of every accessory.",
      blocking_before_use: true,
      blocking_reason:
        "The load mass must be matched to the lift plan and accessory capacity before hoisting and cannot be established from the image.",
    },
    {
      evidence_type: "VERIFICATION_REQUIRED",
      description: "Sling-leg configuration and working-angle capacity before hoisting",
      reason_unverified: "The included angle cannot be measured from a single photograph.",
      verification_kind: "OPERATION_PREREQUISITE",
      required_check: "Confirm the sling angle and the derated capacity of the configuration before hoisting.",
      blocking_before_use: true,
      blocking_reason:
        "The sling angle determines the derated capacity of this rigging configuration and cannot be measured from the image.",
    },
  ],
  compliant_controls: [
    { evidence_type: "VISIBLE_COMPLIANT_CONTROL", description: "Workers wearing hard hats" },
    { evidence_type: "VISIBLE_COMPLIANT_CONTROL", description: "Workers wearing high-visibility clothing" },
    { evidence_type: "VISIBLE_COMPLIANT_CONTROL", description: "Segregated lift area/barrier visible" },
    { evidence_type: "VISIBLE_COMPLIANT_CONTROL", description: "Load supported on timber packing before lifting" },
    {
      evidence_type: "VISIBLE_COMPLIANT_CONTROL",
      description: "Workers positioned outside the intended suspended-load area",
    },
  ],
  notes: "Lift appears rigged and about to commence.",
};

export const unknownLoadMassStandaloneAccessory = {
  equipment: { type: "Webbing sling", category: "Lifting accessory", model_estimate: "" },
  operation_context: {
    state: "STANDALONE_EQUIPMENT",
    visible_basis: "Sling photographed on its own, no load present.",
    confidence: 86,
  },
  confidence: 83,
  hazards: [],
  verification_points: [
    {
      evidence_type: "VERIFICATION_REQUIRED",
      description: "Load mass for the intended lift",
      reason_unverified: "No load is present in the photograph.",
      verification_kind: "OPERATION_PREREQUISITE",
      required_check: "Confirm the load mass against the sling rated capacity before the sling is used.",
      blocking_before_use: true,
      blocking_reason: "The load mass cannot be matched to the sling rated capacity from this photograph.",
    },
  ],
  compliant_controls: [],
  notes: "",
};

/** A record saved before the evidence split: hazards only, string controls, model risk. */
export const legacyStoredResult = {
  equipment: { type: "Forklift truck", category: "Materials handling", model_estimate: "3t counterbalance" },
  overall_status: "CONDITIONAL_PASS",
  risk_score: 42,
  confidence: 71,
  hazards: [
    {
      severity: "MEDIUM",
      category: "HYDRAULIC",
      description: "Weeping hydraulic fitting visible at the mast",
      location: "Mast, left-hand ram",
      regulation: "PUWER 1998",
      action: "Competent person to inspect and rectify the leak before further use.",
    },
  ],
  compliant_controls: ["Hard hats visible on both workers", "Load backrest fitted"],
  notes: "Legacy record produced before the evidence split.",
};
