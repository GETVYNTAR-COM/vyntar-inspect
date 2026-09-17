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
// Lives in view.js so the browser bundle can read stored records without pulling in
// this module: validation is server-side work.
import { normaliseCompliantControls } from "./view.js";

export { normaliseCompliantControls };

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

/**
 * hazards[] is restricted to the declared equipment, its load path and its own
 * condition. The three guards below identify scene furniture: something lying
 * about the work area that is not part of the equipment under inspection.
 * A coiled rope on the deck is a housekeeping matter for the site, not a
 * mechanical defect in the crane — but scored as a hazard it took the risk index
 * to 67 and the verdict with it.
 */
const HOUSEKEEPING_RE =
  /\b(housekeeping|trip(?:ping)? hazard|slip(?:ping)? hazard|slips?,? trips?|clutter|cluttered|untidy|obstruct(?:ion|ing|ed)|debris|rubbish|waste materials?|offcuts?|packaging|swarf|spillage|walkway is blocked|blocked walkway|access route)\b/i;

/** Loose objects that sit in a scene rather than form part of an equipment assembly. */
const SCENE_OBJECT_RE =
  /\b((?:coiled|loose|slack|spare) rope|rope (?:coil|coiled|lying|laid)|loose (?:hose|cable|line|cord|lead)|(?:hose|cable)s? (?:run|running|laid|trailing)|trailing (?:hose|cable|lead)s?|pallets?|timbers?|planks?|tools? (?:left|lying)|toolbox|drums?|barrels?|sandbags?|buckets?|crates?|boxes)\b/i;

/** Placement language: in the scene, on a surface, rather than in the assembly. */
const SCENE_PLACEMENT_RE =
  /\b(on the (?:floor|deck|ground|quay|walkway|platform surface|pavement|roadway)|across the (?:floor|deck|walkway|access|route|path)|(?:lying|laid|left|coiled|strewn|stacked|piled) (?:on|across|about|around|near|beside|at)|in the walkway|underfoot|around the base)\b/i;

/** Ties a finding to the equipment itself or its load path — never scene furniture. */
const LOAD_PATH_RE =
  /\b(sling|shackle|hook|eyebolt|padeye|wire rope|chain|hoist|winch|drum|sheave|boom|jib|mast|outrigger|spreader|beam|rigging|reeved|load path|suspended load|beneath the load|lifting point|anchor point|termination|ferrule|master link|swivel|clamp|jack|ram|cylinder|guard|brake)\b/i;

/**
 * Administrative and record-keeping findings. These are not visible unsafe
 * conditions whatever their severity: a mismatched category selection is a form
 * field to correct before signing, not something wrong with the equipment.
 */
const ADMINISTRATIVE_RE =
  /\b(declared category|selected category|category (?:does not|doesn't|may not) (?:appear to )?match|category mismatch|incorrect category|wrong category|category selection|record[- ]keeping|paperwork|form field|before signing|administrative)\b/i;

/** Language that identifies a genuine operation-specific mandatory prerequisite. */
const PREREQUISITE_RE =
  /\b(load mass|mass of the load|weight of the load|wll|swl|working load|rated capacity|capacity|rated (?:lifting )?point|lifting point|anchor point|padeye|lift plan|sling angle|leg angle|configuration|examination status|thorough examination|isolation|isolated|lock ?-?out|protective device|latch|exclusion zone|hook block|shackle rating)s?\b/i;

/**
 * Visible evidence that the load is off the ground and the rigging is taking it.
 *
 * Read against the operation context's own `visible_basis` and the notes — the two
 * places the model is asked to say what establishes the state.
 */
const SUSPENDED_LOAD_RE =
  /\b(suspended|suspension of the load|airborne|off the (?:ground|deck|floor|quay|trailer|stillage)|clear of the (?:ground|deck|floor|quay)|lifted clear|taking the (?:load|weight)|under (?:load|tension)|hoisted|being (?:lifted|hoisted|raised|lowered)|in the air|mid[- ]lift|load is up|chains? (?:are )?taut|slings? (?:are )?taut)\b/i;

/**
 * The three verifications an appointed person would never bless a suspended load
 * without. While a load is in the air these are hold points, not routine checks:
 * each carries the wording that makes it a specific mandatory prerequisite, so an
 * escalated point still satisfies `isSpecificBlockingReason`.
 */
const SUSPENDED_LOAD_BLOCKING_TOPICS = /** @type {const} */ ([
  {
    key: "load sharing and rigging configuration",
    match:
      /\b(load[- ]shar\w+|shares? the load|sharing the load|load distribution|equalis\w+|equaliz\w+|rigging configuration|configuration of the rigging|(?:sling|leg|chain)[- ]leg configuration|leg configuration|reeving|reeved|included angle|sling angle|leg angle|working angle|line of force|side[- ]load\w*|two[- ](?:point|hoist|block)|multiple (?:hoists?|blocks?|legs?))\b/i,
    reason:
      "Load sharing between the attachment points and the rated capacity of this rigging configuration are mandatory prerequisites while the load is suspended and cannot be established from the image.",
  },
  {
    key: "attachment points",
    match:
      /\b(attachment point|lifting point|anchor point|padeye|pad eye|clamp|trolley|runway|suspension point|connection point|fixing point|point of attachment)s?\b/i,
    reason:
      "The type, fit and rated WLL of the attachment points carrying this suspended load are mandatory prerequisites for the operation and cannot be established from the image.",
  },
  {
    key: "exclusion zone",
    match:
      /\b(exclusion zone|barrier|cordon|segregat\w+|keep[- ]out|access control|standing clear|stand clear|personnel (?:are )?clear|beneath the (?:suspended )?load|under(?:neath)? the (?:suspended )?load|drop zone)s?\b/i,
    reason:
      "Confirmation that the exclusion zone beneath the suspended load is established and clear is a mandatory prerequisite for the operation and cannot be established from the image.",
  },
]);

/**
 * Subjects a compliant control and a finding can share.
 *
 * Deliberately aspect-level rather than object-level: "load mass", not "load".
 * A control naming a subject that some finding says cannot be verified is a
 * contradiction the inspector has to resolve on site, and it resolves the wrong
 * way — a green line on the report outranks a hold point three sections below it.
 */
const CONTROL_SUBJECTS = /** @type {const} */ ([
  {
    key: "identification and marking",
    match:
      /\b(identification|ident|id tag|tag|label|marking|stamp(?:ed|ing)?|data plate|name ?plate|disc|colour cod\w+|color cod\w+|colour band|colour tag)s?\b/i,
  },
  {
    key: "rated capacity",
    match: /\b(wll|swl|working load limit|safe working load|rated capacity|rated load|rated for|derated?|capacity)\b/i,
  },
  {
    key: "examination status",
    match:
      /\b(thorough examination|examination status|examination date|inspection date|inspection status|certificat\w+|test date|in[- ]date|currency)\b/i,
  },
  {
    key: "attachment points",
    match:
      /\b(attachment point|lifting point|anchor point|padeye|pad eye|clamp|trolley|runway|suspension point|connection point|fixing point)s?\b/i,
  },
  { key: "hook latch", match: /\b(hook latch|safety latch|latch(?:es)?)\b/i },
  {
    key: "rigging configuration",
    match:
      /\b(sling angle|leg angle|included angle|working angle|line of force|side[- ]load\w*|load[- ]shar\w+|rigging configuration|reeving|reeved)\b/i,
  },
  { key: "load mass", match: /\b(load mass|mass of the load|load weight|weight of the load)\b/i },
  {
    key: "exclusion zone",
    match: /\b(exclusion zone|barrier|cordon|segregat\w+|keep[- ]out|access control|drop zone)s?\b/i,
  },
  {
    key: "fall protection",
    match: /\b(guard ?rail|hand ?rail|toe ?board|harness|lanyard|fall arrest|edge protection)s?\b/i,
  },
  { key: "head protection", match: /\b(hard hat|helmet)s?\b/i },
  { key: "high-visibility clothing", match: /\b(high[- ]?vis\w*|hi[- ]?vis\w*)\b/i },
]);

/**
 * A quantity stated against something this module counts. The model writes `notes`
 * before validation runs, so any number it puts there is a snapshot of its own
 * pre-validation view: it said "four blocking verification points" in prose while
 * the header, computed after validation rejected one, said three.
 */
const COUNT_CLAIM_RE =
  /\b(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\b[^.!?]{0,48}?\b(?:hazards?|findings?|defects?|verification points?|blocking|hold points?|compliant controls?|controls?|risk (?:score|index|rating))\b/i;

/**
 * @param {unknown} value
 * @returns {string}
 */
function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Remove sentences from free prose that state their own counts.
 *
 * Counts belong to the validated result and are rendered from it. Prose that
 * carries its own numbers can only agree with the header by luck, so the sentence
 * goes rather than being silently contradicted next to it. Qualitative statements
 * ("no clearly visible defect identified") carry no number and are left alone.
 *
 * @param {string} notes
 * @param {(message: string) => void} log
 * @returns {string}
 */
export function stripCountClaims(notes, log = () => {}) {
  if (!notes) return "";
  const sentences = notes.match(/[^.!?]+[.!?]*/g) || [notes];
  const kept = sentences.filter((sentence) => {
    if (!COUNT_CLAIM_RE.test(sentence)) return true;
    log(`notes: removed a sentence stating its own counts — "${sentence.trim().slice(0, 60)}".`);
    return false;
  });
  return kept.join("").trim();
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
  if (ADMINISTRATIVE_RE.test(evidenceProse)) {
    return { demoted: "Administrative or record-keeping matter, not a visible unsafe condition in the equipment." };
  }

  // A visible mechanical defect is never scene furniture, however it is worded —
  // a frayed wire rope lying on the deck is still a frayed wire rope. This is the
  // only thing that rescues a finding from the scope rules below.
  const visibleDefect = MECHANICAL_DAMAGE_RE.test(visibleEvidence);

  // Explicit housekeeping language is decisive. Naming a load-path component does
  // NOT rescue it: "a loose rope which, if not part of the planned rigging, could
  // become a trip hazard" mentions rigging and is still a trip hazard, and reading
  // that mention as a load-path finding is how it stayed in hazards[].
  if (!visibleDefect && HOUSEKEEPING_RE.test(evidenceProse)) {
    return {
      demoted: "Housekeeping or scene condition rather than the declared equipment, its load path or its own condition.",
    };
  }
  // Object-plus-placement is the weaker signal, so a load-path subject rescues it.
  if (!visibleDefect && !LOAD_PATH_RE.test(evidenceProse)) {
    if (SCENE_OBJECT_RE.test(evidenceProse) && SCENE_PLACEMENT_RE.test(evidenceProse)) {
      return {
        demoted: "Loose object in the scene rather than part of the declared equipment or its load path.",
      };
    }
  }

  // A finding that hangs on "if", "could", "may" or "possibly" with nothing visibly
  // wrong is a question, not a hazard. Downgrading its severity used to leave it in
  // hazards[] at MEDIUM, still counted and still scored; it is moved out instead.
  if (!visibleDefect && (HYPOTHETICAL_RE.test(description) || HYPOTHETICAL_RE.test(visibleEvidence))) {
    return { demoted: "Stated as a conditional possibility with no visible defect behind it." };
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
 * Is a load visibly hanging on the rigging in this photograph?
 *
 * Deliberately narrow: the operation must be classified ACTIVE, at the same
 * confidence any other hold needs, AND the prose must say what puts the load in
 * the air. An ACTIVE state on its own covers work in progress with nothing lifted.
 *
 * @param {OperationContext} operationContext
 * @param {string} [prose] further model prose describing the scene (notes)
 * @returns {boolean}
 */
export function isLoadVisiblySuspended(operationContext, prose = "") {
  if (operationContext.state !== "OPERATION_ACTIVE") return false;
  if (operationContext.confidence < MIN_BLOCKING_OPERATION_CONFIDENCE) return false;
  return SUSPENDED_LOAD_RE.test(`${operationContext.visible_basis} ${prose}`);
}

/**
 * Escalate the three suspended-load prerequisites from routine to blocking.
 *
 * An appointed person would not release a load hanging in the air without knowing
 * how the load is shared, what it is hanging from, and who is underneath it. While
 * these are open the answer is HOLD, so the report says so instead of listing them
 * as checks to get round to. The consequence is accepted: most live-lift
 * photographs now hold.
 *
 * @param {VerificationPoint[]} points
 * @param {(message: string) => void} log
 * @returns {VerificationPoint[]}
 */
function escalateSuspendedLoadVerifications(points, log) {
  return points.map((point) => {
    if (point.blocking_before_use === true) return point;
    const prose = `${point.description} ${point.reason_unverified} ${point.required_check}`;
    const topic = SUSPENDED_LOAD_BLOCKING_TOPICS.find((candidate) => candidate.match.test(prose));
    if (!topic) return point;

    const reason =
      point.blocking_reason && isSpecificBlockingReason(point.blocking_reason) ? point.blocking_reason : topic.reason;
    log(
      `verification "${point.description.slice(0, 60)}": escalated to a hold point — ${
        topic.key
      } cannot be left open while the load is suspended.`
    );
    return {
      ...point,
      verification_kind: /** @type {import("./types.js").VerificationKind} */ ("OPERATION_PREREQUISITE"),
      blocking_before_use: true,
      blocking_reason: reason,
    };
  });
}

/**
 * Remove a compliant control that some finding says cannot be verified.
 *
 * Verification wins. A control is a claim about what the photograph shows; a
 * verification point is a statement that the same matter cannot be established
 * from it. Both cannot be true, and the one resting on evidence the report itself
 * disowns is the control.
 *
 * @param {CompliantControl[]} controls
 * @param {readonly Hazard[]} hazards
 * @param {readonly VerificationPoint[]} verificationPoints
 * @param {(message: string) => void} log
 * @returns {CompliantControl[]}
 */
function enforceControlConsistency(controls, hazards, verificationPoints, log) {
  /** @type {Map<string, string>} */
  const contested = new Map();

  const contest = (/** @type {string} */ prose, /** @type {string} */ source) => {
    for (const subject of CONTROL_SUBJECTS) {
      if (subject.match.test(prose) && !contested.has(subject.key)) contested.set(subject.key, source);
    }
  };

  // A verification point is unverifiability by definition.
  for (const point of verificationPoints) {
    contest(
      `${point.description} ${point.reason_unverified} ${point.required_check} ${point.blocking_reason || ""}`,
      point.description.slice(0, 60)
    );
  }
  // A hazard only contests a control where it says the matter cannot be established.
  for (const hazard of hazards) {
    const prose = `${hazard.description} ${hazard.visible_evidence}`;
    if (UNVERIFIABLE_RE.test(prose)) contest(prose, hazard.description.slice(0, 60));
  }

  if (contested.size === 0) return controls;

  return controls.filter((control) => {
    const prose = `${control.description} ${control.location || ""}`;
    for (const subject of CONTROL_SUBJECTS) {
      if (!contested.has(subject.key)) continue;
      if (!subject.match.test(prose)) continue;
      log(
        `compliant control "${control.description.slice(0, 60)}": removed — ${
          subject.key
        } cannot be verified per "${contested.get(subject.key)}".`
      );
      return false;
    }
    return true;
  });
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
 * @param {string | undefined} left
 * @param {string | undefined} right
 * @returns {string} the more complete of the two values
 */
function mostComplete(left, right) {
  const a = left || "";
  const b = right || "";
  return b.length > a.length ? b : a;
}

/**
 * Combine two verification points that describe the same matter.
 *
 * A hazard demoted to a routine check is appended before the model's own
 * verification points, so first-item-wins would have discarded a validated
 * blocking prerequisite behind an identical description and released an
 * imminent operation. Blocking status and the stronger verification kind
 * always survive the merge.
 *
 * Both inputs have already been through the blocking guards independently -
 * a demoted hazard is created non-blocking, and a model-supplied point keeps
 * blocking_before_use only after passing the operation-context, confidence,
 * kind and specific-reason tests - so carrying blocking across cannot admit
 * an unvalidated hold.
 *
 * @param {VerificationPoint} existing
 * @param {VerificationPoint} incoming
 * @returns {VerificationPoint}
 */
export function mergeVerificationPoints(existing, incoming) {
  const blocking = existing.blocking_before_use === true || incoming.blocking_before_use === true;
  const kind =
    existing.verification_kind === "OPERATION_PREREQUISITE" || incoming.verification_kind === "OPERATION_PREREQUISITE"
      ? "OPERATION_PREREQUISITE"
      : "ROUTINE_PRE_USE";
  const location = mostComplete(existing.location, incoming.location);
  const regulation = mostComplete(existing.regulation, incoming.regulation);
  // Only a point that kept blocking status carries a blocking_reason.
  const blockingReason = mostComplete(existing.blocking_reason, incoming.blocking_reason);

  return {
    evidence_type: "VERIFICATION_REQUIRED",
    description: mostComplete(existing.description, incoming.description),
    reason_unverified: mostComplete(existing.reason_unverified, incoming.reason_unverified),
    verification_kind: kind,
    ...(location ? { location } : {}),
    ...(regulation ? { regulation } : {}),
    required_check: mostComplete(existing.required_check, incoming.required_check),
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
  // Condemnation language is reserved for a visible CRITICAL hazard. A HIGH one is
  // serious and withdraws the equipment, but "stop, tag out, out of service" over a
  // single HIGH finding is a condemnation the evidence does not carry.
  if (hazards.some((h) => h.severity === "CRITICAL")) return "CRITICAL_FAIL";
  if (hazards.some((h) => h.severity === "HIGH")) return "FAIL";
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

  // A load hanging in the air changes what "routine" means. Escalation runs across
  // both sources — a demoted hazard about the attachment points is the same matter
  // as a verification point about them — and before deduplication, so a merge
  // cannot drop the blocking half.
  const escalated = isLoadVisiblySuspended(operationContext, text(raw.notes))
    ? escalateSuspendedLoadVerifications(verificationPoints, log)
    : verificationPoints;

  /** @type {Map<string, VerificationPoint>} */
  const byDescription = new Map();
  for (const point of escalated) {
    const key = dedupeKey(point.description);
    const existing = byDescription.get(key);
    if (!existing) {
      byDescription.set(key, point);
      continue;
    }
    const merged = mergeVerificationPoints(existing, point);
    log(
      `verification "${point.description.slice(0, 60)}": duplicate merged into the existing entry (${
        merged.blocking_before_use ? "blocking preserved" : "non-blocking"
      }, ${merged.verification_kind}).`
    );
    byDescription.set(key, merged);
  }
  const dedupedVerifications = [...byDescription.values()];

  const sortedHazards = sortBySeverity(hazards);
  const compliantControls = enforceControlConsistency(
    normaliseCompliantControls(raw.compliant_controls),
    sortedHazards,
    dedupedVerifications,
    log
  );
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
      compliant_controls: compliantControls,
      notes: stripCountClaims(text(raw.notes), log),
    },
    changes,
  };
}
