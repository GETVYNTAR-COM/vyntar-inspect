// @ts-check
/**
 * Read helpers shared by every consumer of a stored or live result.
 *
 * Records saved before the evidence split are read here without being rewritten:
 * they have no verification points, string compliant controls and a model-supplied
 * risk score. Nothing in this module reinterprets a historical finding.
 */

import { normaliseCompliantControls } from "./validate.js";

/** @typedef {import("./types.js").InspectionResult} InspectionResult */
/** @typedef {import("./types.js").LegacyInspectionResult} LegacyInspectionResult */
/** @typedef {import("./types.js").VerificationPoint} VerificationPoint */
/** @typedef {import("./types.js").CompliantControl} CompliantControl */

export const STATUS_PRESENTATION = {
  PASS: { label: "Pass", short: "Pass", tone: "pass" },
  CONDITIONAL_PASS: { label: "Conditional pass", short: "Conditional", tone: "amber" },
  HOLD_FOR_VERIFICATION: { label: "Hold for verification", short: "Hold", tone: "amber" },
  CRITICAL_FAIL: { label: "Critical fail", short: "Critical fail", tone: "signal" },
};

export const STATUS_MESSAGE = {
  PASS: "No visible defects identified from this photograph.",
  CONDITIONAL_PASS:
    "Minor visible defects or routine verification items require attention. Equipment may only remain in service where the competent person confirms it is safe.",
  HOLD_FOR_VERIFICATION:
    "Essential safety information for this operation cannot be verified from the available evidence. Do not commence the operation until the blocking checks below have been completed by a competent person.",
  CRITICAL_FAIL:
    "Tag out, isolate, and remove from operation before any further use. Report to the responsible person.",
};

/** Shown wherever a risk index has no number behind it. */
export const RISK_PENDING_DISPLAY = "—";
export const RISK_PENDING_CAPTION = "Pending physical verification";

/**
 * @param {InspectionResult | LegacyInspectionResult | null | undefined} result
 * @returns {boolean} true for records saved before the evidence split
 */
export function isLegacyResult(result) {
  return !result || !Array.isArray(/** @type {any} */ (result).verification_points);
}

/**
 * @param {InspectionResult | LegacyInspectionResult | null | undefined} result
 * @returns {any[]}
 */
export function getHazards(result) {
  const hazards = /** @type {any} */ (result)?.hazards;
  return Array.isArray(hazards) ? hazards : [];
}

/**
 * @param {InspectionResult | LegacyInspectionResult | null | undefined} result
 * @returns {VerificationPoint[]}
 */
export function getVerificationPoints(result) {
  const points = /** @type {any} */ (result)?.verification_points;
  return Array.isArray(points) ? points : [];
}

/**
 * Accepts both the legacy `string[]` form and the current object form.
 *
 * @param {InspectionResult | LegacyInspectionResult | null | undefined} result
 * @returns {CompliantControl[]}
 */
export function getCompliantControls(result) {
  return normaliseCompliantControls(/** @type {any} */ (result)?.compliant_controls);
}

/**
 * @param {InspectionResult | LegacyInspectionResult | null | undefined} result
 * @returns {VerificationPoint[]}
 */
export function getBlockingVerificationPoints(result) {
  return getVerificationPoints(result).filter((point) => point.blocking_before_use === true);
}

/**
 * Hazards and verification points are counted separately and never combined.
 *
 * @param {InspectionResult | LegacyInspectionResult | null | undefined} result
 * @returns {{ hazards: number, verifications: number, blocking: number, controls: number, criticalHazards: number }}
 */
export function getCounts(result) {
  const hazards = getHazards(result);
  const verifications = getVerificationPoints(result);
  return {
    hazards: hazards.length,
    verifications: verifications.length,
    blocking: verifications.filter((point) => point.blocking_before_use === true).length,
    controls: getCompliantControls(result).length,
    criticalHazards: hazards.filter((hazard) => hazard?.severity === "CRITICAL").length,
  };
}

/**
 * @param {InspectionResult | LegacyInspectionResult | null | undefined} result
 * @returns {number | null} a usable risk number, or null when verification is pending
 */
export function getRiskScore(result) {
  const raw = /** @type {any} */ (result)?.risk_score;
  if (raw === null || raw === undefined || raw === "") return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

/**
 * @param {InspectionResult | LegacyInspectionResult | null | undefined} result
 * @returns {{ value: number | null, display: string, pending: boolean, caption: string | null }}
 */
export function getRiskDisplay(result) {
  const value = getRiskScore(result);
  if (value === null) {
    return { value: null, display: RISK_PENDING_DISPLAY, pending: true, caption: RISK_PENDING_CAPTION };
  }
  return { value, display: String(value), pending: false, caption: null };
}

/**
 * Blank rather than zero in exports — zero would read as confirmed safety.
 *
 * @param {InspectionResult | LegacyInspectionResult | null | undefined} result
 * @returns {string}
 */
export function getRiskExportValue(result) {
  const value = getRiskScore(result);
  return value === null ? "" : String(value);
}

/**
 * @param {string | undefined | null} status
 */
export function getStatusPresentation(status) {
  return (
    STATUS_PRESENTATION[/** @type {keyof typeof STATUS_PRESENTATION} */ (status)] ||
    STATUS_PRESENTATION.CONDITIONAL_PASS
  );
}

/**
 * @param {string | undefined | null} status
 */
export function getStatusMessage(status) {
  return STATUS_MESSAGE[/** @type {keyof typeof STATUS_MESSAGE} */ (status)] || STATUS_MESSAGE.CONDITIONAL_PASS;
}

/**
 * @param {VerificationPoint} point
 * @returns {string} the label shown against each verification item
 */
export function getVerificationLabel(point) {
  return point?.blocking_before_use ? "HOLD POINT — COMPLETE BEFORE OPERATION" : "ROUTINE CHECK — NON-BLOCKING";
}
