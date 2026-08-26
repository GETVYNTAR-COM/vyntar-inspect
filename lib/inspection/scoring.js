// @ts-check
/**
 * Risk scoring constants and calculation.
 *
 * Risk is derived ONLY from validated visible hazards. Verification points never
 * contribute numerical risk. Keep every calibration number in this module so the
 * scoring model can be tuned in one place.
 */

/** @typedef {import("./types.js").Severity} Severity */

/** Severity ranking, lowest first. */
export const SEVERITY_ORDER = /** @type {const} */ (["LOW", "MEDIUM", "HIGH", "CRITICAL"]);

/** Starting score contributed by the highest-severity visible hazard. */
export const BASE = {
  LOW: 15,
  MEDIUM: 35,
  HIGH: 65,
  CRITICAL: 98,
};

/** Score added by each additional visible hazard, by that hazard's severity. */
export const ADDITIONAL = {
  LOW: 2,
  MEDIUM: 4,
  HIGH: 6,
  CRITICAL: 10,
};

/** Maximum score reachable within the band set by the highest-severity hazard. */
export const CAP = {
  LOW: 24,
  MEDIUM: 49,
  HIGH: 79,
  CRITICAL: 100,
};

/** Risk score used when nothing unsafe is visible and nothing blocks use. */
export const NO_HAZARD_SCORE = 0;

/**
 * @param {string | undefined | null} severity
 * @returns {number} index into SEVERITY_ORDER, or -1 when unrecognised
 */
export function severityRank(severity) {
  return SEVERITY_ORDER.indexOf(/** @type {Severity} */ (severity));
}

/**
 * Sort a copy of the hazards by severity, highest first.
 *
 * @template {{ severity?: string }} T
 * @param {readonly T[]} hazards
 * @returns {T[]}
 */
export function sortBySeverity(hazards) {
  return [...hazards].sort((a, b) => severityRank(b.severity) - severityRank(a.severity));
}

/**
 * Calculate the risk score for a set of validated visible hazards.
 *
 * Highest-severity base + the additional value for every remaining hazard,
 * capped at the highest-severity band maximum.
 *
 * @param {readonly { severity?: string }[]} hazards
 * @returns {number} 0-100
 */
export function computeRiskScore(hazards) {
  const ranked = sortBySeverity(hazards || []).filter((h) => severityRank(h.severity) >= 0);
  if (ranked.length === 0) return NO_HAZARD_SCORE;

  const top = /** @type {Severity} */ (ranked[0].severity);
  let score = BASE[top];
  for (const hazard of ranked.slice(1)) {
    score += ADDITIONAL[/** @type {Severity} */ (hazard.severity)];
  }
  return Math.min(score, CAP[top]);
}
