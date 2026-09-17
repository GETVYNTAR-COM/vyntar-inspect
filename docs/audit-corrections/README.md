# Audit record corrections

Signed audit records live in `localStorage` on the inspector's own device
(`lib/storage.js`), so a record cannot be edited from this repository and is never
rewritten by a later build. This directory is the append-only log of expert field
corrections raised against a specific record.

Three rules govern every file here:

1. **Append, never overwrite.** The AI output as issued is quoted verbatim and left
   exactly as it was. A correction is a new entry beneath it, never an edit to it.
2. **Attribute the source.** Every entry names who raised it, their standing, and
   the date. A correction with no named source is not a correction.
3. **Say what changed in the product.** An entry that does not point at the code or
   prompt change it produced is a note, not a correction.

One file per audit reference, named for that reference.
