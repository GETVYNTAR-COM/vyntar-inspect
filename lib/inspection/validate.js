// @ts-check
/**
 * Deterministic normalisation and validation of a model response.
 *
 * The model proposes evidence; this module decides. Nothing reaches the UI,
 * the audit record or an export without passing through here, and the final
 * `overall_status`, `risk_score`, `risk_basis` and counts are computed here —
 * never taken from the model.
 */

import { computeRiskScore, severityRank, sortBySeverity, NO_HAZARD_SCORE } from "./scoring.js";

/** @typedef {import("./types.js").Severity} Severity */
/** @typedef {import("./types.js").Hazard} Hazard */
/** @typedef {import("./types.js").VerificationPoint} VerificationPoint */
/** @typedef {import("./types.js").CompliantControl} CompliantControl */
/** @typedef {import("./types.js").OperationContext} OperationContext */
/** @typedef {import("./types.js").OperationState} OperationState */
/** @typedef {import("./types.js").OverallStatus} OverallStatus */
/** @typedef {import("./types.js").InspectionResult} InspectionResult */

export const OPERATION_STATES = /** @type {const} */ ([
  "STANDALONE_EQUIPMENT",
  "ASSEMBLED_NOT_IMMINENT",
  "OPERATION_IMMINENT",
  "OPERATION_ACTIVE",
  "UNKNOWN",
]);

/** Only these operation states can carry a blocking verification point. */
export const BLOCKING_OPERATION_STATES = /** @type {const} */ (["OPERATION_IMMINENT", "OPERATION_ACTIVE"]);

export const VERIFICATION_KINDS = /** @type {const} */ (["ROUTINE_PRE_USE", "OPERATION_PREREQUISITE"]);

/** Operation-context confidence needed before a hold can stand. */
export const MIN_BLOCKING_OPERATION_CONFIDENCE = 70;

/** Per-finding confidence needed to keep a HIGH or CRITICAL severity. */
export const MIN_HIGH_SEVERITY_CONFIDENCE = 70;

/** Overall analysis confidence needed for a clean PASS. */
export const MIN_PASS_CONFIDENCE = 50;

/** A blocking reason shorter than this cannot be identifying a specific prerequisite. */
export const MIN_BLOCKING_REASON_LENGTH = 20;

/**
 * Fallback keyword guards. Typed evidence fields are the primary control; these
 * only catch findings that carry the right fields but the wrong substance.
 */
const HYPOTHETICAL_RE =
  /\b(if\b|could|may\b|might|possibly|potentially|presumably|probably|likely|suspected|assumed|cannot be ruled out|would (?:then )?(?:fail|result|lead))/i;

const UNVERIFIABLE_RE =
  /\b(cannot be (?:confirmed|assessed|established|verified|determined|read|seen|measured)|cannot (?:confirm|assess|establish|verify|determine|read|see|measure)|not (?:visible|legible|readable|confirmed|established|shown|discernible)|no[nt]?[- ]?legible|unreadable|illegible|unclear whether|unknown|obscured|out of view|requires (?:a )?physical|awaiting|no documentation)/i;

const COSMETIC_RE =
  /\b(cosmetic|paint(?:work)?[a-z ]{0,12}(?:wear|worn|chipped|chipping|flaking|deterioration|damage|loss)|worn paint|surface rust|surface corrosion|light corrosion|discolou?r|scuff|staining|faded|weathered)\b/i;

const MECHANICAL_DAMAGE_RE =
  /\b(crack|fracture|deform|bent|twisted|gouge|section loss|perforat|elongat|frayed|fraying|broken|split|severed|seized|detached|distorted|pitting|nicked|cut strand|birdcag)/i;

const MISSING_CLAIM_RE = /\b(missing|omitted|absent|not fitted|not installed|removed from|without a required)\b/i;

const SPARE_COMPONENT_RE = /\b(nearby|spare|unused|lying|laid|on the ground|adjacent|beside|to one side|left out|loose on)\b/i;

const IMAGE_QUALITY_RE = /\b(image quality|photograph quality|blurr?|low resolution|poor lighting|compression|too dark|distance from)/i;

/** Language that identifies a genuine operation-specific mandatory prerequisite. */
const PREREQUISITE_RE =
  /\b(load mass|mass of the load|weight of the load|wll|swl|working load|rated capacity|capacity|rated (?:lifting )?point|lifting point|anchor point|padeye|lift plan|sling angle|leg angle|configuration|examination status|thorough examination|isolation|isolated|lock ?-?out|protective device|latch|exclusion zone|hook block|shackle rating)s?\b/i;

/**
 * @param {unknown} value
 * @returns {string}
 */
function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * @param {unknown} value
 * @param {number | null} fallback
 * @returns {number | null}
 */
function score(value, fallback) {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(100, Math.round(n)));
}

/**
 * @param {unknown} value
 * @returns {Severity | null}
 */
function severity(value) {
  const upper = text(value).toUpperCase();
  return severityRank(upper) >= 0 ? /** @type {Severity} */ (upper) : null;
}

/**
 * @param {string} value
 * @returns {string} comparison key for duplicate detection
 */
function dedupeKey(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * @param {unknown} value
 * @returns {OperationContext}
 */
function normaliseOperationContext(value) {
  const raw = value && typeof value === "object" ? /** @type {Record<string, unknown>} */ (value) : {};
  const state = text(raw.state).toUpperCase();
  return {
    state: /** @type {OperationState} */ (
      OPERATION_STATES.includes(/** @type {OperationState} */ (state)) ? state : "UNKNOWN"
    ),
    visible_basis: text(raw.visible_basis),
    confidence: score(raw.confidence, 0) ?? 0,
  };
}

/**
 * Legacy records stored `compliant_controls` as plain strings. Both forms are accepted.
 *
 * @param {unknown} value
 * @returns {CompliantControl[]}
 */
export function normaliseCompliantControls(value) {
  if (!Array.isArray(value)) return [];
  /** @type {CompliantControl[]} */
  const controls = [];
  for (const entry of value) {
    if (typeof entry === "string") {
      const description = entry.trim();
      if (description) controls.push({ evidence_type: "VISIBLE_COMPLIANT_CONTROL", description });
      continue;
    }
    if (entry && typeof entry === "object") {
      const raw = /** @type {Record<string, unknown>} */ (entry);
      const description = text(raw.description);
      if (!description) continue;
      const location = text(raw.location);
      controls.push({
        evidence_type: "VISIBLE_COMPLIANT_CONTROL",
        description,
        ...(location ? { location } : {}),
      });
    }
  }
  return controls;
}

/**
 * Build a non-blocking verification point out of a finding that failed the hazard tests.
 *
 * @param {Record<string, unknown>} raw
 * @param {string} reason
 * @returns {VerificationPoint}
 */
function toVerificationPoint(raw, reason) {
  const description = text(raw.description);
  const location = text(raw.location);
  const regulation = text(raw.regulation);
  const requiredCheck = text(raw.required_check) || text(raw.action);
  return {
    evidence_type: "VERIFICATION_REQUIRED",
    description,
    reason_unverified: reason,
    verification_kind: "ROUTINE_PRE_USE",
    ...(location ? { location } : {}),
    ...(regulation ? { regulation } : {}),
    required_check: requiredCheck || `Competent person to check: ${description}`,
    blocking_before_use: false,
  };
}

/**
 * Decide whether a proposed finding is a counted visible hazard.
 *
 * @param {Record<string, unknown>} raw
 * @param {(message: string) => void} log
 * @returns {{ hazard: Hazard } | { demoted: string }}
 */
function classifyHazard(raw, log) {
  const description = text(raw.description);
  const evidenceType = text(raw.evidence_type).toUpperCase();
  const visibleEvidence = text(raw.visible_evidence);
  const location = text(raw.location);
  const confidence = score(raw.confidence, null);
  const label = description.slice(0, 60) || "(no description)";

  if (evidenceType && evidenceType !== "VISIBLE_UNSAFE_CONDITION") {
    return { demoted: "Reported as a verification matter rather than a visible unsafe condition." };
  }
  if (!evidenceType) {
    // Contract requires the field. Infer it only where the positive evidence is complete,
    // so a genuinely visible defect is never lost to a missing field.
    if (visibleEvidence && location && confidence !== null) {
      log(`hazard "${label}": evidence_type absent — inferred VISIBLE_UNSAFE_CONDITION from complete visible evidence.`);
    } else {
      return { demoted: "Evidence type was not stated and the visible evidence is incomplete." };
    }
  }
  if (!visibleEvidence) {
    return { demoted: "No visible evidence was recorded for this finding." };
  }
  if (!location) {
    return { demoted: "No precise image location was recorded for this finding." };
  }
  if (confidence === null) {
    return { demoted: "No confidence was recorded for this finding." };
  }

  const evidenceProse = `${description} ${visibleEvidence}`;

  // The positive-evidence field must itself be positive. Uncertainty in the wider
  // description is only fatal when nothing concrete is recorded as visible.
  if (UNVERIFIABLE_RE.test(visibleEvidence) || (UNVERIFIABLE_RE.test(description) && !MECHANICAL_DAMAGE_RE.test(visibleEvidence))) {
    return { demoted: "Finding rests on what could not be seen or confirmed rather than a visible condition." };
  }
  if (IMAGE_QUALITY_RE.test(evidenceProse) && !MECHANICAL_DAMAGE_RE.test(visibleEvidence)) {
    return { demoted: "Image quality is an evidence limitation, not evidence of a defect." };
  }
  if (COSMETIC_RE.test(evidenceProse) && !MECHANICAL_DAMAGE_RE.test(evidenceProse)) {
    return { demoted: "Cosmetic condition only — no visible mechanical damage." };
  }
  if (MISSING_CLAIM_RE.test(evidenceProse) && SPARE_COMPONENT_RE.test(evidenceProse)) {
    return { demoted: "A component seen nearby was treated as omitted from the assembly without visible evidence." };
  }

  let resolved = severity(raw.severity);
  if (!resolved) {
    log(`hazard "${label}": unrecognised severity "${text(raw.severity)}" — set to MEDIUM.`);
    resolved = "MEDIUM";
  }

  if (severityRank(resolved) >= severityRank("HIGH")) {
    if (confidence < MIN_HIGH_SEVERITY_CONFIDENCE) {
      log(`hazard "${label}": ${resolved} at ${confidence}% confidence — downgraded to MEDIUM.`);
      resolved = "MEDIUM";
    } else if (HYPOTHETICAL_RE.test(visibleEvidence)) {
      log(`hazard "${label}": ${resolved} described in hypothetical terms — downgraded to MEDIUM.`);
      resolved = "MEDIUM";
    }
  }

  const regulation = text(raw.regulation);
  return {
    hazard: {
      evidence_type: "VISIBLE_UNSAFE_CONDITION",
      severity: resolved,
      category: text(raw.category) || "OPERATIONAL",
      description,
      visible_evidence: visibleEvidence,
      location,
      ...(regulation ? { regulation } : {}),
      action: text(raw.action),
      confidence,
    },
  };
}

/**
 * A blocking reason must name the mandatory prerequisite. Tag or marking legibility
 * on its own is a routine check, whatever the operation state.
 *
 * @param {string} reason
 * @returns {boolean}
 */
export function isSpecificBlockingReason(reason) {
  if (reason.length < MIN_BLOCKING_REASON_LENGTH) return false;
  // Naming the mandatory prerequisite is what separates a hold point from
  // "the tag is unreadable". Legibility language alone never qualifies.
  return PREREQUISITE_RE.test(reason);
}

/**
 * @param {Record<string, unknown>} raw
 * @param {OperationContext} operationContext
 * @param {(message: string) => void} log
 * @returns {VerificationPoint | null}
 */
function normaliseVerificationPoint(raw, operationContext, log) {
  const description = text(raw.description);
  if (!description) return null;
  const label = description.slice(0, 60);

  const kindValue = text(raw.verification_kind).toUpperCase();
  const kind = VERIFICATION_KINDS.includes(/** @type {any} */ (kindValue))
    ? /** @type {import("./types.js").VerificationKind} */ (kindValue)
    : "ROUTINE_PRE_USE";
  if (kindValue && kind !== kindValue) {
    log(`verification "${label}": unrecognised verification_kind "${kindValue}" — treated as ROUTINE_PRE_USE.`);
  }

  const blockingReason = text(raw.blocking_reason);
  let blocking = raw.blocking_before_use === true;

  if (blocking) {
    /** @type {string | null} */
    let refusal = null;
    if (!BLOCKING_OPERATION_STATES.includes(/** @type {any} */ (operationContext.state))) {
      refusal = `operation state is ${operationContext.state}`;
    } else if (operationContext.confidence < MIN_BLOCKING_OPERATION_CONFIDENCE) {
      refusal = `operation-context confidence is ${operationContext.confidence}%`;
    } else if (kind !== "OPERATION_PREREQUISITE") {
      refusal = "it is a routine pre-use check, not an operation prerequisite";
    } else if (!isSpecificBlockingReason(blockingReason)) {
      refusal = "no specific mandatory prerequisite was identified";
    }
    if (refusal) {
      log(`verification "${label}": blocking status removed — ${refusal}.`);
      blocking = false;
    }
  }

  const location = text(raw.location);
  const regulation = text(raw.regulation);
  return {
    evidence_type: "VERIFICATION_REQUIRED",
    description,
    reason_unverified: text(raw.reason_unverified) || "Cannot be established from the photograph.",
    verification_kind: kind,
    ...(location ? { location } : {}),
    ...(regulation ? { regulation } : {}),
    required_check: text(raw.required_check) || `Competent person to check: ${description}`,
    blocking_before_use: blocking,
    ...(blocking && blockingReason ? { blocking_reason: blockingReason } : {}),
  };
}

/**
 * Status precedence. Applied only to validated findings.
 *
 * @param {{ hazards: readonly Hazard[], verificationPoints: readonly VerificationPoint[], confidence: number }} input
 * @returns {OverallStatus}
 */
export function resolveStatus({ hazards, verificationPoints, confidence }) {
  if (hazards.some((h) => severityRank(h.severity) >= severityRank("HIGH"))) return "CRITICAL_FAIL";
  if (verificationPoints.some((v) => v.blocking_before_use)) return "HOLD_FOR_VERIFICATION";
  if (hazards.length > 0) return "CONDITIONAL_PASS";
  // A non-blocking operation prerequisite is a specific concern needing inspector judgement.
  if (verificationPoints.some((v) => v.verification_kind === "OPERATION_PREREQUISITE")) return "CONDITIONAL_PASS";
  if (confidence < MIN_PASS_CONFIDENCE) return "CONDITIONAL_PASS";
  return "PASS";
}

/**
 * Risk comes from visible hazards alone. A hold never carries a number — zero
 * would read as confirmed safety.
 *
 * @param {{ status: OverallStatus, hazards: readonly Hazard[] }} input
 * @returns {{ risk_score: number | null, risk_basis: import("./types.js").RiskBasis }}
 */
export function resolveRisk({ status, hazards }) {
  if (status === "HOLD_FOR_VERIFICATION") {
    return { risk_score: null, risk_basis: "INSUFFICIENT_EVIDENCE" };
  }
  if (hazards.length === 0) {
    return { risk_score: NO_HAZARD_SCORE, risk_basis: "VISIBLE_EVIDENCE_ONLY" };
  }
  return { risk_score: computeRiskScore(hazards), risk_basis: "VISIBLE_EVIDENCE_ONLY" };
}

/**
 * Normalise and validate a raw model response into an authoritative result.
 *
 * @param {unknown} input
 * @returns {{ result: InspectionResult, changes: string[] }}
 */
export function normaliseInspectionResult(input) {
  /** @type {string[]} */
  const changes = [];
  const log = (/** @type {string} */ message) => changes.push(message);

  const raw = input && typeof input === "object" ? /** @type {Record<string, unknown>} */ (input) : {};
  const operationContext = normaliseOperationContext(raw.operation_context);
  const confidence = score(raw.confidence, 0) ?? 0;

  /** @type {Hazard[]} */
  const hazards = [];
  /** @type {VerificationPoint[]} */
  const verificationPoints = [];
  const seenHazards = new Set();

  for (const entry of Array.isArray(raw.hazards) ? raw.hazards : []) {
    if (!entry || typeof entry !== "object") continue;
    const candidate = /** @type {Record<string, unknown>} */ (entry);
    const description = text(candidate.description);
    if (!description) {
      log("hazard without a description discarded.");
      continue;
    }
    const label = description.slice(0, 60);

    const key = `${dedupeKey(description)}|${dedupeKey(text(candidate.location))}`;
    if (seenHazards.has(key)) {
      log(`hazard "${label}": duplicate of an earlier finding — discarded.`);
      continue;
    }
    seenHazards.add(key);

    const verdict = classifyHazard(candidate, log);
    if ("hazard" in verdict) {
      hazards.push(verdict.hazard);
    } else {
      log(`hazard "${label}": moved to verification — ${verdict.demoted}`);
      verificationPoints.push(toVerificationPoint(candidate, verdict.demoted));
    }
  }

  for (const entry of Array.isArray(raw.verification_points) ? raw.verification_points : []) {
    if (!entry || typeof entry !== "object") continue;
    const point = normaliseVerificationPoint(/** @type {Record<string, unknown>} */ (entry), operationContext, log);
    if (point) verificationPoints.push(point);
  }

  const seenVerifications = new Set();
  const dedupedVerifications = verificationPoints.filter((point) => {
    const key = dedupeKey(point.description);
    if (seenVerifications.has(key)) {
      log(`verification "${point.description.slice(0, 60)}": duplicate — discarded.`);
      return false;
    }
    seenVerifications.add(key);
    return true;
  });

  const sortedHazards = sortBySeverity(hazards);
  const status = resolveStatus({ hazards: sortedHazards, verificationPoints: dedupedVerifications, confidence });
  const { risk_score, risk_basis } = resolveRisk({ status, hazards: sortedHazards });

  const equipmentRaw =
    raw.equipment && typeof raw.equipment === "object" ? /** @type {Record<string, unknown>} */ (raw.equipment) : {};

  if (text(raw.overall_status) && text(raw.overall_status) !== status) {
    log(`overall_status: model proposed ${text(raw.overall_status)} — resolved deterministically to ${status}.`);
  }
  if (raw.risk_score !== undefined && raw.risk_score !== risk_score) {
    log(`risk_score: model proposed ${String(raw.risk_score)} — recalculated as ${String(risk_score)}.`);
  }

  return {
    result: {
      equipment: {
        type: text(equipmentRaw.type),
        category: text(equipmentRaw.category),
        model_estimate: text(equipmentRaw.model_estimate),
      },
      operation_context: operationContext,
      overall_status: status,
      risk_score,
      risk_basis,
      confidence,
      hazards: sortedHazards,
      verification_points: dedupedVerifications,
      compliant_controls: normaliseCompliantControls(raw.compliant_controls),
      notes: text(raw.notes),
    },
    changes,
  };
}
