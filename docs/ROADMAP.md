# Roadmap

This is a direction for contributors, not a promise of dates or capabilities. Discuss substantial work before implementing it.

## Current: v0.1

- [x] Local CLI and TypeScript SDK.
- [x] Pi sessions with a narrow scientific tool surface.
- [x] Immutable plan drafts, validation, and hash-bound operator approvals.
- [x] Transactional campaign state and hash-linked audit history.
- [x] Synthetic execution and descriptive QC/analysis.
- [x] Manual Ginkgo handoff bundles and operator-attested result imports.
- [x] Offline tests for lifecycle, integrity, concurrent execution, and CLI behavior.

No qualified cell model, live provider order, real pricing, or instrument control is implemented.

## Priority 1: make the local workflow easier to trust and extend

### Better result ingestion

Support explicitly missing measurements without asking users to invent numeric placeholders. Preserve the difference between failed QC, unmeasured wells, invalid experiments, and valid negative results.

**Done when:** typed representations, analysis behavior, reports, fixtures, and migration handling are consistent and tested.

### Stronger evaluation coverage

Add offline adversarial cases for schema ambiguity, result mismatches, unsupported provider claims, approval enforcement, and model/tool behavior. Add edge-case tests for control separation and endpoint direction.

**Done when:** tests fail for the targeted regression without relying on live models or asserting a mock's own behavior.

### Reproducible onboarding

Improve error messages, remote-development guidance, and end-to-end examples. Make the first contribution possible with no lab hardware or provider key.

**Done when:** a fresh clone can run the offline example and a contributor can explain what is simulated, approved, exported, and still unresolved.

### Persistence evolution

Introduce explicit storage/schema versions, backed-up migrations, and consistent-read behavior for inspection under concurrent writers.

**Done when:** old workspaces migrate predictably, interrupted migrations fail safely, and inspection sees a coherent snapshot.

## Priority 2: define a real provider integration

### Partner capability and result contracts

Work with a qualified provider and a domain scientist on one supported workflow. Define capability discovery, feasibility responses, sample identity, quotations, acceptance, QC, deviations, and result semantics.

**Done when:** the interface is documented with provider-reviewed examples and synthetic replay fixtures. A public schema is not by itself permission to operate a laboratory.

### Durable external dispatch

Only after an actual integration agreement: implement an outbox, request identity, provider idempotency, reconciliation, cancellation outcomes, and independent purchasing/authorization controls.

**Done when:** ambiguous outcomes never trigger blind physical retries, and a reviewed test environment verifies the lifecycle. Do not call live providers from automated tests.

### One supervised scientific pilot

Use an established, provider-qualified workflow with explicit scientific endpoints, budget, approvals, and a confirmation step.

**Done when:** evidence demonstrates operational and scientific usefulness beyond a chat demo. Record human interventions and failed runs, not only successes.

## Later, conditional on evidence

- Additional workflow packages and execution adapters.
- Customer-side notebook / ELN integration.
- Provenance-linked raw artifact storage and parsers.
- Established statistical design / Bayesian optimization tools with appropriate evaluation.
- Multi-user authentication and least-privilege deployment.
- Broader agent evaluation environments and trace formats.

## Not current promises

A universal hardware driver, fully autonomous wet lab, complete virtual cell, clinical decision tool, regulatory certification, or an official Ginkgo partnership.

## How to propose work

Open a [workflow/feature proposal](https://github.com/gvkhosla/bio-harness/issues/new/choose) describing the user, current pain, proposed interface, scientific assumptions, failure cases, and a way to test it offline. Biologists and automation engineers can contribute this design work without writing code.
