# Security policy

## Scope and supported versions

Bio Harness is experimental, single-user research software. Security fixes currently target the latest `main` branch; no long-term support or response SLA is offered.

The harness has no live instrument control, provider ordering, or public HTTP service. v0.2 adds a loopback-only, read-only HTTP demo: it accepts only same-origin requests to allowlisted assets and fixed public-data scenarios. It does not expose private workspaces, uploads, arbitrary filesystem paths, model tools, or persistent approval endpoints. Do not expose it through a public reverse proxy. The simulator is synthetic, and the Ginkgo adapter only exports a local request. Do not deploy this as a safety-critical, clinical, multi-tenant, or regulated laboratory system.

## Report a vulnerability privately

Use GitHub's [private vulnerability reporting form](https://github.com/gvkhosla/bio-harness/security/advisories/new). Include:

- Affected commit, Node version, and operating system.
- A minimal reproduction using synthetic data.
- Expected and observed behavior, and the potential impact.
- Any suggested mitigation.

Do not include credentials, patient/donor information, private datasets, proprietary protocols, or unredacted agent transcripts. Do not open a public issue containing exploit details. If the reporting form is unavailable, open an issue titled **Request private security contact** without technical details so a private channel can be arranged.

Please allow time for investigation and a coordinated fix before public disclosure.

## Important trust limitations

- `--by` is a local attribution string, not authenticated authorization.
- Agent tools do not include approval, result import, shell, or arbitrary file access. This is a tool-interface restriction, not OS-level sandboxing; another process with your identity can call the SDK or alter state.
- Hash-linked events detect ordinary inconsistency, not a privileged attacker rewriting the entire database/history.
- Imported observations are operator-attested, not cryptographically authenticated by a laboratory.
- Agent prompts and tool-returned campaign data may be sent to an external model provider.
- The agent runtime reads Pi's credential configuration. Never attach credential files to bug reports.
- `.bio/` contains potentially sensitive state, reports, and model transcripts. It is excluded from Git but is not encrypted by this application.
- Alternate `BIO_HOME` / `--dir` locations are your responsibility; keep them outside tracked directories or add an explicit ignore rule.
- Local validation and `biosafetyReview` text are not institutional review, provider qualification, or biosafety clearance.

Approval bypasses through the exposed agent tools, cross-workspace leakage, unsafe state transitions, and misleading source/provenance claims are particularly relevant reports.
