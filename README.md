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

The repository contains the accepted MP-01 real Strands capability spike, MP-02 deterministic
compiler, MP-03 fixture-bound Fates admission adapter, and the MP-04 Protocol-side durable governed
execution coordinator independently accepted and sealed as
`moirae-protocol-mp04-durable-governed-execution-v0.1.0`. MP-01 produces bounded untrusted structured
proposals; MP-02 resolves them against explicit trusted context into canonical `ActionIntentV1`
material; MP-03 asks accepted Ananke for admission; MP-04 coordinates the accepted Ananke/Horae
claim-aware path using synthetic offline effects only. No production effect or provider is
implemented, and MP-05 has not started. MP-01 live inference remains explicitly
`BLOCKED_CREDENTIALS`. See
[docs/BUILD_PLAN.md](docs/BUILD_PLAN.md) and [docs/MP-04_DURABLE_EXECUTION.md](docs/MP-04_DURABLE_EXECUTION.md).

The project is publicly maintained at `https://github.com/hourwise/Moirae-Protocol`. The local
repository remains independent and is not a fork.

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
  action-contracts/    versioned Moirae Protocol ActionIntent contracts
  action-compiler/     deterministic validation, resolution, and canonicalisation
  strands-agent/       narrow real Strands semantic-proposal adapter
  fates-adapter/      verified MP-03 Fates admission boundary
  execution-coordinator/  MP-04 durable governed execution coordination
  effect-adapters/    future bounded effect implementations
  test-fixtures/      synthetic MP-01/MP-02 integration fixtures
docs/                  eligibility, architecture, threat model, decisions, and plan
```

The Fates admission adapter and execution coordinator are implemented as bounded Protocol
boundaries. The effect-adapter directory remains a future placeholder; no production provider or
effect is implemented, and no implementation code has been copied from The Fates.

## Local validation

Requirements: Node.js 22 or newer and npm.

```sh
npm ci
npm run check
```

`npm run check` runs typechecking, linting, formatting verification, deterministic/adversarial and
synthetic integration tests, and the TypeScript build. Live MP-01 inference is a separate bounded
command and reports missing credentials rather than substituting a mock result. CI additionally runs
`npm run test:mp04:required`, which fails rather than skips when the sealed Ananke/Horae roots are
missing.

## Provenance and licence

Moirae Protocol has independent Git history and is licensed under Apache-2.0. The Fates projects
inspected during MP-00 are pre-existing work and are recorded in
[docs/ELIGIBILITY_AND_PROVENANCE.md](docs/ELIGIBILITY_AND_PROVENANCE.md). Their interfaces are
not claimed as compatible until a later, read-only-informed adapter review verifies the exact
contract and licensing position.

Read [docs/HACKATHON_REQUIREMENTS.md](docs/HACKATHON_REQUIREMENTS.md) for the current event
requirements and [docs/INVARIANTS.md](docs/INVARIANTS.md) for the security and governance
invariants.
