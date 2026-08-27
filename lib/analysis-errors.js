// @ts-check
/**
 * Plain-language messages for a failed analysis request.
 *
 * Infrastructure failures (gateway timeout, request too large) come back as an
 * HTML error page rather than JSON. Reading that as JSON throws a browser-specific
 * exception whose message means nothing to an inspector on site, so the status is
 * translated here instead.
 */

/**
 * @param {number} status HTTP status returned by the analysis request
 * @returns {string} message to show the inspector
 */
export function describeHttpFailure(status) {
  if (status === 504 || status === 408) {
    return "The analysis timed out before it finished. Try again, or retake the photo closer to the equipment.";
  }
  if (status === 413) {
    return "The photograph was too large to send. Retake it and try again.";
  }
  if (status === 429) {
    return "The analysis service is busy right now. Wait a moment and try again.";
  }
  if (status >= 500) {
    return `Analysis failed (server returned ${status}). Try again.`;
  }
  return `Analysis failed (${status}). Retake the photo and try again.`;
}

/** Shown when the request is stopped client-side before the platform times it out. */
export const ANALYSIS_ABORTED_MESSAGE =
  "The analysis took too long and was stopped. Retake the photo closer to the equipment, or try again in a moment.";

/** Shown when the response parsed but carried no result. */
export const ANALYSIS_UNREADABLE_MESSAGE =
  "The analysis result could not be read. Retake the photo and try again.";
