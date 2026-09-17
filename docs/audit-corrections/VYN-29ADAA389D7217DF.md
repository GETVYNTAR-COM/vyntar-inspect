# VYN-29ADAA389D7217DF

| | |
|---|---|
| Scanned | 16/09/2026 17:53 |
| Subject | Chain blocks suspended from beam clamps on a structural beam |
| Status as issued | Hold for verification |

## Original AI output — unaltered

The record as issued identified the equipment as an **overhead travelling crane**.
It is reproduced here for reference and is not modified by this file or by any
later build. The stored record on the inspecting device is likewise untouched.

## Correction 1 — expert field observation

**Raised by:** TotalEnergies Lifting Authority, on sight
**Source:** Expert field feedback
**Date:** 16 September 2026
**Type:** Correction (appended)

> Lifting Authority review: visible side loading of beam clamps (angled chain
> runs); side loading generally forbidden, some manufacturers permit up to 15° at
> 100% WLL. Equipment misidentified as overhead travelling crane; actual
> arrangement chain blocks on beam clamps on structural beam.

### Why it mattered

The misidentification was not a labelling error. Naming a crane removed every
clamp-specific question from the screen: clamp type, rated WLL, fit to the beam
flange, and the line of force through the clamp. The last of those was the real,
visible concern in the photograph, and it went unreported.

### What changed in the product

- **Analysis prompt** (`app/api/analyze/route.js`) — the suspension and support
  method is now identified conservatively from visible evidence, with "crane" never
  inferred from a beam and hoists alone; any attachment in the load path carries
  device, WLL, fit and line-of-force verification; visible angled loading of a
  clamp-type attachment is reported as a visible concern requiring the
  manufacturer's permitted angle and WLL to be verified. Tags and markings are
  identification only, connection claims must be visible, and inspection
  colour-coding is treated as a site scheme.
- **Validator** (`lib/inspection/validate.js`) — with a load visibly suspended,
  load-sharing/rigging-configuration, attachment-point and exclusion-zone
  verification are escalated to blocking hold points; a compliant control is
  removed where any finding says the same aspect cannot be verified.
- **Report wording** (`lib/inspection/view.js`) — a hold on an operation already
  under way reads "STOP / HOLD THE OPERATION — do not continue", never "do not
  commence".

Regression coverage: `tests/validate.test.js`, `tests/view.test.js`,
`tests/consumers.test.jsx`; fixtures `beamClampsMisreadAsOverheadCrane` and
`chainBlocksOnBeamClamps` in `tests/fixtures.js`.
