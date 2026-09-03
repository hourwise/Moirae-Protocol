# Moirae Protocol

Most AI agents face an uncomfortable trade-off: either they interrupt a person constantly, or
they are trusted with too much authority. Moirae Protocol explores a third option.

A Strands-powered agent handles ordinary administrative work, deterministic code turns its
proposals into exact actions, and The Fates independently decides whether each real-world effect
may proceed automatically, needs human approval, or must be denied.

> **EARLY HACKATHON BUILD / NOT PRODUCTION SECURITY SOFTWARE**

Moirae Protocol is being created for the AWS / Devpost **Agents for Humans Hackathon** in the
**Professional Agents** track. MP-00 is the bootstrap and architecture slice: it establishes the
new repository, eligibility and provenance boundary, trust model, and staged build plan. It does
not implement the eventual appointment, contact-list, approval, or effect flows.

## The idea

Moirae Protocol is a professional operations steward for sole traders, consultants, contractors,
and small professional businesses. The intended product lets a Strands agent understand routine
administrative requests and draft proposed actions. A deterministic Action Compiler then validates
and canonicalises those proposals. The Fates — not the model — decide whether an action is allowed,
requires human approval, or must be denied. Only an explicitly authorised, bounded effect may reach
an effect adapter.

The governing thesis is:

> **AI interprets. Deterministic code verifies. The Fates authorise. Humans decide exceptions. Only
> then does the host act.**

## Current status

This repository currently contains documentation and a minimal TypeScript workspace scaffold only.
The first implementation slice is MP-01: a real Strands capability spike that produces bounded
structured proposals with no real effects and no Fates authority. See [docs/BUILD_PLAN.md](docs/BUILD_PLAN.md).

The project is intended to become `https://github.com/hourwise/Moirae-Protocol`; the remote was not
created during MP-00 because GitHub credentials were invalid and API access was unavailable. The
local repository remains independent and is not a fork.

## Architecture at a glance

```text
Incoming work -> Strands Agent -> untrusted proposed action
              -> deterministic Action Compiler -> canonical ActionIntent
              -> The Fates decide: ALLOW / REQUIRES_APPROVAL / DENY
              -> bounded effect adapter -> EffectReceipt, or zero effect
```

Strands is an interpretation and orchestration boundary, never an authority source. Mnemosyne is
an optional future source of admitted, provenanced context; it is not required for the MVP.
Amazon Bedrock AgentCore is a possible deployment and scoring enhancement after a working product
exists, not an MP-00 or MVP dependency.

See the [architecture narrative](docs/ARCHITECTURE.md) and the [Mermaid source](docs/ARCHITECTURE.mmd).

## Repository layout

```text
apps/
  web/                 future human product experience
  host/                future host-side orchestration and secrets boundary
packages/
  action-contracts/    future versioned ActionIntent contracts
  action-compiler/     future deterministic validation/canonicalisation
  strands-agent/      future Strands integration
  fates-adapter/      future verified Fates boundary
  effect-adapters/    future bounded effect implementations
  test-fixtures/      future synthetic integration fixtures
docs/                  eligibility, architecture, threat model, decisions, and plan
```

The package directories intentionally contain placeholders only. No implementation code has been
copied from The Fates or any other pre-existing project.

## Local validation

Requirements: Node.js 22 or newer and npm.

```sh
npm ci
npm run check
```

`npm run check` runs typechecking, linting, formatting verification, placeholder tests, and the
TypeScript build. Later slices will add meaningful deterministic, integration, adversarial, and live
tests without weakening the MP-00 trust boundary.

## Provenance and licence

Moirae Protocol has independent Git history and is licensed under Apache-2.0. The Fates projects
inspected during MP-00 are pre-existing work and are recorded in
[docs/ELIGIBILITY_AND_PROVENANCE.md](docs/ELIGIBILITY_AND_PROVENANCE.md). Their interfaces are
not claimed as compatible until a later, read-only-informed adapter review verifies the exact
contract and licensing position.

Read [docs/HACKATHON_REQUIREMENTS.md](docs/HACKATHON_REQUIREMENTS.md) for the current event
requirements and [docs/INVARIANTS.md](docs/INVARIANTS.md) for the provisional security and
governance invariants.
