# VYNTAR Inspect

AI pre-use hazard screen for lifting and work equipment (UK: LOLER 98 / PUWER 98 framing).
Photograph the kit → Claude vision analysis → hazard verdict → inspector sign-off → printable signed report.

**This is a screening aid for a competent person. It is not a statutory thorough examination.**

## Deploy (browser only — no terminal)

1. **GitHub:** create a new private repo (e.g. `vyntar-inspect`), then *Add file → Upload files* and drag the entire contents of this folder in (not the folder itself — its contents). Commit.
2. **Vercel:** *Add New → Project* → import the repo. Framework auto-detects as Next.js. Before deploying, add an environment variable:
   - `ANTHROPIC_API_KEY` = your key from console.anthropic.com (needs a few pounds of credit; each scan costs pennies).
3. Deploy. Open the URL on the iPad — "Open camera" uses the rear camera natively.

## Development

```
npm install
npm test        # Vitest — validator, scoring, view selectors, exports
npm run build   # production build
```

## Evidence discipline

Analysis output is split into three streams and only the first is counted or scored:

- `hazards[]` — positive visible evidence of an unsafe condition. The only stream feeding the hazard count and risk index.
- `verification_points[]` — matters the photograph cannot establish. Labelled `ROUTINE CHECK — NON-BLOCKING` or `HOLD POINT — COMPLETE BEFORE OPERATION`. Never counted as hazards, never scored.
- `compliant_controls[]` — safety controls visibly present.

`lib/inspection/validate.js` is the enforcement authority: it normalises the model response, moves mis-filed findings between streams, and computes `overall_status`, `risk_score`, `risk_basis` and every count deterministically. The model supplies evidence, not the verdict. Scoring constants live in `lib/inspection/scoring.js`.

A hold applies only where the photograph shows an operation imminent or active and a mandatory prerequisite for it cannot be established; it always reports risk as `—` (pending physical verification), never zero. An unreadable tag on a routine equipment photograph is a non-blocking verification point.

Two further rules are enforced in the validator, not the prompt. Where a load is
visibly suspended (`OPERATION_ACTIVE` with the operation context saying the load is
off the ground), verification of load sharing and the rigging configuration, of the
attachment points carrying the load, and of the exclusion zone beneath it are
escalated from routine checks to blocking hold points — so most live-lift
photographs hold, which is the intended behaviour. And a compliant control is
removed where any hazard or verification point says the same item or aspect cannot
be verified: verification wins, because a green line on the report outranks a hold
point three sections below it. A hold on an operation already under way reads
"STOP / HOLD THE OPERATION — do not continue"; a hold before work starts keeps
"do not commence".

Expert field corrections raised against a signed record are logged, append-only, in
`docs/audit-corrections/`.

Records saved before this split still render: they have no verification points, string `compliant_controls` and a model-supplied risk score, and are never rewritten or reanalysed.

## Notes
- Images are downscaled client-side before upload; nothing is stored server-side in this version.
- Report export uses the browser print dialog → "Save as PDF" (works on iPad Safari via the share sheet).
