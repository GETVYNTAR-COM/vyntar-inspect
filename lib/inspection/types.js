// @ts-check
/**
 * Shared JSDoc typedefs for the inspection evidence contract.
 *
 * Three separate evidence streams:
 *   - hazards[]             positive visible evidence of an unsafe condition
 *   - verification_points[] matters the photograph cannot establish
 *   - compliant_controls[]  safety controls visibly present
 *
 * Only hazards[] contributes to counts, severity and numerical risk.
 * These typedefs document the contract; `validate.js` is the enforcement authority.
 */

/** @typedef {"LOW" | "MEDIUM" | "HIGH" | "CRITICAL"} Severity */

/**
 * @typedef {"VISIBLE_UNSAFE_CONDITION" | "VERIFICATION_REQUIRED" | "VISIBLE_COMPLIANT_CONTROL"} EvidenceType
 */

/**
 * Verdicts, least severe first. CRITICAL_FAIL is reserved for a visible CRITICAL
 * hazard; FAIL carries a visible HIGH hazard without one, so the equipment is held
 * back for assessment rather than condemned and tagged out.
 *
 * @typedef {"PASS" | "CONDITIONAL_PASS" | "HOLD_FOR_VERIFICATION" | "FAIL" | "CRITICAL_FAIL"} OverallStatus
 */

/** @typedef {"VISIBLE_EVIDENCE_ONLY" | "INSUFFICIENT_EVIDENCE"} RiskBasis */

/**
 * How far the photographed work has progressed. Blocking verification — and so
 * HOLD_FOR_VERIFICATION — is only available for an imminent or active operation.
 *
 * @typedef {"STANDALONE_EQUIPMENT" | "ASSEMBLED_NOT_IMMINENT" | "OPERATION_IMMINENT" | "OPERATION_ACTIVE" | "UNKNOWN"} OperationState
 */

/** @typedef {"ROUTINE_PRE_USE" | "OPERATION_PREREQUISITE"} VerificationKind */

/**
 * @typedef {object} OperationContext
 * @property {OperationState} state
 * @property {string} visible_basis   What in the image establishes that state.
 * @property {number} confidence      0-100. Below 70 cannot support a blocking hold.
 */

/**
 * @typedef {object} EquipmentIdentification
 * @property {string} [type]
 * @property {string} [category]
 * @property {string} [model_estimate]
 */

/**
 * @typedef {object} Hazard
 * @property {"VISIBLE_UNSAFE_CONDITION"} evidence_type
 * @property {Severity} severity
 * @property {string} category
 * @property {string} description
 * @property {string} visible_evidence  Exactly what is visibly wrong.
 * @property {string} location          Precise position in the image.
 * @property {string} [regulation]
 * @property {string} action
 * @property {number} confidence        0-100. HIGH/CRITICAL require >= 70.
 */

/**
 * @typedef {object} VerificationPoint
 * @property {"VERIFICATION_REQUIRED"} evidence_type
 * @property {string} description
 * @property {string} reason_unverified
 * @property {VerificationKind} verification_kind
 * @property {string} [location]
 * @property {string} [regulation]
 * @property {string} required_check
 * @property {boolean} blocking_before_use
 * @property {string} [blocking_reason]  The specific mandatory prerequisite.
 */

/**
 * @typedef {object} CompliantControl
 * @property {"VISIBLE_COMPLIANT_CONTROL"} evidence_type
 * @property {string} description
 * @property {string} [location]
 */

/**
 * @typedef {object} InspectionResult
 * @property {EquipmentIdentification} equipment
 * @property {OperationContext} operation_context
 * @property {OverallStatus} overall_status
 * @property {number | null} risk_score
 * @property {RiskBasis} risk_basis
 * @property {number} confidence
 * @property {Hazard[]} hazards
 * @property {VerificationPoint[]} verification_points
 * @property {CompliantControl[]} compliant_controls
 * @property {string} notes
 */

/**
 * Records saved before this contract existed: hazards only, model-supplied risk,
 * `compliant_controls` as a plain string array, no verification points.
 *
 * @typedef {object} LegacyInspectionResult
 * @property {EquipmentIdentification} [equipment]
 * @property {string} [overall_status]
 * @property {number} [risk_score]
 * @property {number} [confidence]
 * @property {object[]} [hazards]
 * @property {(string | CompliantControl)[]} [compliant_controls]
 * @property {string} [notes]
 */

export {};
