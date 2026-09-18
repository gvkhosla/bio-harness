# Public CFPS replay fixture

`example_plate_return.json` is copied **byte for byte** from Ginkgo Bioworks' public repository at commit `c92353b47a214930f07442aabdb6c3242cc301d0`:

https://github.com/ginkgobioworks/ginkgo-automation-cfps/blob/c92353b47a214930f07442aabdb6c3242cc301d0/examples/example_plate_return.json

The source's MIT-style license is preserved in `LICENSE.md`. This fixture is third-party material, not covered by the project's original-work copyright claim. `manifest.json` records the original byte count and SHA-256; the demo refuses to open if they do not match. These are local integrity checks, not cryptographic proof of provider authenticity.

## Mapping and limits

- Full 16 × 24 geometry, column-major sample ordering, no reserved columns in this file. Mapping follows the upstream `Plate.coordinates` / `get_plate_layout` behavior. Other geometries/orderings are rejected, not guessed.
- 384 well records: 312 experimental wells (78 sample IDs × 4 wells), 45 standards, 24 mixed positive controls, and 3 empty wells.
- Raw fluorescence and upstream-reported concentrations in **g/L** are preserved. Calibration metrics are source-reported, not recomputed.
- Reagent flags remain distinct from locally injected demo failures. All flagged/missing readings are excluded by a transparent local demonstration policy; this is not an assertion about Ginkgo's official QC policy.
- The named `target_control` is summarized separately. It is not a negative control. There is no declared negative-control group in this fixture.
- The file's provider `run_id` is null. We call it a **published example replay**, not a newly executed or independently authenticated historical campaign.
- Embedded metadata contains source code and narrative claims. It is retained only to preserve the original bytes: the demo does not execute, evaluate, or send it to a model. The normalized API projects only the fields it needs.
- The separate upstream PHERAstar CSV fixture is not joined to this plate: it is a different example, and no cross-file identity match was established.

The `control-failure` scenario injects failure labels into a derived, in-memory copy. It never changes the source artifact. Review briefs are unapproved, non-executable scientific discussion artifacts—not Ginkgo requests, quotes, protocols, or orders.
