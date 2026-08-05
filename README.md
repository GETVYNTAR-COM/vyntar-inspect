# VYNTAR Inspect

AI pre-use hazard screen for lifting and work equipment (UK: LOLER 98 / PUWER 98 framing).
Photograph the kit → Claude vision analysis → hazard verdict → inspector sign-off → printable signed report.

**This is a screening aid for a competent person. It is not a statutory thorough examination.**

## Deploy (browser only — no terminal)

1. **GitHub:** create a new private repo (e.g. `vyntar-inspect`), then *Add file → Upload files* and drag the entire contents of this folder in (not the folder itself — its contents). Commit.
2. **Vercel:** *Add New → Project* → import the repo. Framework auto-detects as Next.js. Before deploying, add an environment variable:
   - `ANTHROPIC_API_KEY` = your key from console.anthropic.com (needs a few pounds of credit; each scan costs pennies).
3. Deploy. Open the URL on the iPad — "Open camera" uses the rear camera natively.

## Notes
- Images are downscaled client-side before upload; nothing is stored server-side in this version.
- Report export uses the browser print dialog → "Save as PDF" (works on iPad Safari via the share sheet).
