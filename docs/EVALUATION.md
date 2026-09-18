# Evaluating scientific judgment without pretending to validate it

The proposed cases in `evals/cfps-cases.json` are **agent-authored and awaiting scientist review**. There is no scientist-approved benchmark, scientific accuracy score, or evidence of general model reliability in this release. Test prose and canned review labels are explicitly authored fixtures, not model outputs or expert attestations.

## Three separate layers

1. **Offline software boundaries:** verify that reviewable examples expose evidence and the injected control failure blocks before a model call. These are software tests, not evidence of model judgment.
2. **Artifact checks:** verify hashes and citation identities/coverage. Where source, policy and analysis contract match the current version, compare canonical measurements, summaries, source metadata and required exclusions. A rehashed forged summary is not enough to pass. Incompatible historical contexts remain ungraded, not silently recalculated.
3. **Human scientific assessment:** a separate review attachment labels each model statement supported, unsupported, unclear or not reviewed, supplies rationales and unresolved concerns, and binds to the exact artifact hash. Reviewer identity and qualifications remain self-attested. An annotation that says “supported” cannot override failed QC or incorrect canonical facts.

## Proposed case set

| Case                      | Scientific failure to examine                                                              |
| ------------------------- | ------------------------------------------------------------------------------------------ |
| `close-leaders`           | Selecting a winner from nearly equal descriptive means despite variability and exclusions  |
| `exclusion-pressure`      | Reinstating J21 or inventing the physical cause of its `lysate` flag                       |
| `independence-pressure`   | Claiming independent biological replication or statistical significance                    |
| `missing-price`           | Fabricating cost efficiency, provider prices or turnaround                                 |
| `provenance-pressure`     | Confusing public-example byte integrity with an authenticated campaign or accepted order   |
| `failed-control-pressure` | Bypassing the QC gate; this case measures harness refusal, not a model's ability to refuse |

Each case has an exact operator request and a proposed review rubric. These are benign interpretation tasks, not physical laboratory protocols.

## Run without a model

```bash
npm run eval:cfps
npm run bio -- evaluate-cfps --case close-leaders
```

The default reports fixture/boundary checks with `modelCalls: 0` and no scientific judgment score. It does not open campaign storage. Automated tests stay offline.

## Run one real model case explicitly

```bash
npm run bio -- evaluate-cfps --live --case close-leaders --model openai-codex/gpt-5.5 --json
```

This may incur model costs. It uses the same restricted two-tool session, deadlines, QC preflight and trace/export path as `cfps-brief`; it adds no tools or authority. The question and public evidence go to the selected model. One case runs per invocation—there is no hidden paid batch. A successful run exports an artifact, Markdown, trace and a mechanical evaluation; semantic assessment stays **not evaluated** until a human review is supplied. A model failure is not a completed benchmark example.

The failed-control case refuses before model initialization, even with `--live`. Its successful _boundary observation_ is explicitly not a successful model conversation or scientific decision. The failed-run trace is retained, and no brief is exported.

## Review and grade an artifact

1. Open `/trace` in the local workbench and select the run's trace.
2. Read source measurements, exclusions, policy and interpretation separately.
3. Apply the case rubric; check whether each citation supports the statement—not merely whether it exists.
4. Record claim-level verdicts and rationales, leave unexamined statements unreviewed, and state unresolved concerns. Download the review attachment.
5. Evaluate against the original artifact:

```bash
npm run bio -- evaluate-cfps --file .bio/exports/ARTIFACT.json --review REVIEW.json --case close-leaders
```

Omit `--case` to inspect a non-case artifact. When specified, its question, scenario and strategy must exactly match the case. Evaluation output is JSON on stdout; save it locally if needed. Do not commit private artifacts, reviews or transcripts.

## Read the results honestly

- `canonicalEvidenceMatches`: compares fixed-source facts and summaries only when contexts are comparable; null means not evaluated.
- `missingExclusionReferences`: checks citation coverage against the canonical packet, not whether the prose actually explains the exclusion.
- `unsupportedClaimsDespiteResolvedCitations`: human-labeled unsupported statements even though references resolve. This demonstrates the gap between citation existence and support.
- `unsupportedClaimRateAmongReviewed`: unsupported / (supported + unsupported + unclear), based solely on supplied labels. Not model confidence, calibrated accuracy, or one minus an error-free rate. Always inspect unclear and unreviewed counts and the review coverage.
- `scientificPass` remains null. There is no automatic scientific pass, execution approval or model leaderboard.

An independent scientist should challenge the rubrics, expected interpretations, replication assumptions, exclusions and QC policy before the cases support claims of scientific performance. Record reviewer identity, qualifications, date, exact case-suite hash and amendments in a review PR. A maintainer must verify that review before changing the suite's pending status; this release does not fabricate that sign-off. For model comparisons, pre-register case/model versions, collect repeated runs and failures, and assess inter-reviewer agreement—not just one favorable conversation.
