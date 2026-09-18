# Contributing to Bio Harness

Thanks for helping build a more useful, trustworthy experiment harness. Contributions from scientists, automation engineers, agent developers, and first-time open-source contributors are welcome.

This is an early-stage, independent project maintained by [Geet Khosla](https://github.com/gvkhosla). The current scope is local planning, simulation, and manual provider handoff—not live laboratory control.

## Pick a useful first contribution

1. Run the offline demo from a fresh clone and report anything confusing.
2. Review a scientific assumption: controls, replicate independence, endpoint interpretation, or QC.
3. Add an adversarial input or lifecycle regression test using synthetic data.
4. Improve an error message, example, or documentation section.
5. Propose a concrete provider/workflow contract with its failure cases.

Check [issues](https://github.com/gvkhosla/bio-harness/issues) and the [roadmap](docs/ROADMAP.md). Small documentation and bug-fix PRs can be opened directly. Discuss new workflows, dependencies, live integrations, or architectural changes first so we can agree on scope.

## Development setup

Fork the repository on GitHub, clone your fork, and open a terminal in it. Use Node 22.19+.

```bash
npm ci --ignore-scripts
npm run demo
npm run check
```

Create a focused branch, make your change, and run:

```bash
npm run fmt
npm run check
```

`check` runs formatting validation, strict TypeScript checks, offline tests, and compilation. No model keys or lab credentials are needed. CI is configured for Ubuntu on Node 22/24 and macOS on Node 22.

Use temporary workspaces for experiments:

```bash
npm run bio -- demo --dir /tmp/my-bio-harness-test
```

Choose your own unused directory; don't overwrite someone else's work. Keep all state outside tracked source files.

## Engineering expectations

- Keep changes small and describe the user-visible behavior they improve.
- Test through the CLI or public module interfaces where practical.
- Add a regression test for a bug, including the failure mode—not just the happy path.
- Keep automated tests offline and self-contained. Never require real model credentials, provider accounts, instruments, or paid calls.
- Use synthetic fixtures. Close database/process resources and clean up temporary files.
- Keep approval, result-import, and arbitrary execution authority out of the agent's tool surface.
- Never silently transfer an approval to a revised plan or change stored results in place.
- Preserve clear distinctions between simulated results, operator-attested data, provider acceptance, and actual physical execution.
- Propose persistence/schema changes with a migration and backward-compatibility plan.
- Keep the lockfile in sync with dependency changes. Do not bundle dependencies, local sessions, or generated `dist/` output.

A future live adapter needs durable dispatch, provider idempotency, unknown-outcome reconciliation, safe cancellation semantics, and real authorization. A network call inside the current SQLite transaction is not sufficient.

## Scientific contributions

Explain the intended scientific question, required context, supported measurements, assumptions, and limits. Label hypothetical examples as hypothetical. Distinguish technical from biological replication, and do not present descriptive ranking as significance, causality, or clinical evidence.

We welcome corrections and negative findings. Where possible, link public sources and explain what they establish. Do not copy restricted protocols or datasets, share sensitive biological information, or submit operational workflows involving hazardous biological agents. Keep examples benign and suitable for public distribution.

## Before opening a pull request

- Explain the problem, your approach, and how you tested it.
- Include relevant issue links and any schema or interface changes.
- Run `npm run check` and report the result honestly.
- Update docs/examples for behavior changes.
- Inspect the diff for secrets, identifying data, transcripts, generated results, and accidental files.
- Mention AI-assisted work when it materially affects review, and personally verify the contribution. You remain responsible for correctness, provenance, and permission to submit it.

A maintainer reviews and merges contributions. There is no guaranteed response time; clear, narrow PRs are easier to evaluate.

## License and attribution

By intentionally submitting a contribution for inclusion, you agree to license it under the project's Apache License 2.0, consistent with section 5 of [LICENSE](LICENSE), unless explicitly agreed otherwise.

You retain copyright in your own work. No copyright assignment or separate contributor license agreement is currently required. Only submit material you have permission to contribute; preserve third-party attribution and disclose any additional license obligations.

## Respectful collaboration

Challenge ideas, not people. Be constructive, avoid harassment and discriminatory language, and respect scientific uncertainty and contributors' time. The maintainer may remove abusive content or restrict participation to protect the community.

For a security vulnerability, use the private process in [SECURITY.md](SECURITY.md). Do not post an exploit or confidential data in a public issue.
