// @ts-check
/**
 * One time budget for the analysis request, shared by the route and the browser.
 *
 * These were previously two unrelated literals — `maxDuration` in the route and a
 * hard-coded abort in the page — which can drift apart silently. Deriving both
 * from one number keeps the client giving up just *before* the platform kills the
 * function, so the inspector gets an explanation instead of a gateway error page.
 */

/**
 * Seconds the platform allows the analysis function to run.
 * 60 is the ceiling on Vercel's Hobby plan; Pro allows up to 300.
 */
export const FUNCTION_BUDGET_SECONDS = 60;

/** Milliseconds the browser waits before giving up, just inside the platform limit. */
export const CLIENT_ABORT_MS = (FUNCTION_BUDGET_SECONDS - 5) * 1000;

/**
 * Milliseconds the route waits for the model before abandoning the stream.
 * Leaves room to validate the result and serialise a reply within the budget.
 */
export const UPSTREAM_DEADLINE_MS = (FUNCTION_BUDGET_SECONDS - 12) * 1000;
