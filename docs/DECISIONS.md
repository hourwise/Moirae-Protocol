# Architecture Decisions

These ADR-style decisions apply to the MP-00 planning boundary. They may be superseded by evidence
from later implementation slices, but a change must be recorded rather than silently drifting.

## ADR-0001 — Use TypeScript for the initial workspace

- **Status:** Accepted for MP-00; validate in MP-01.
- **Date:** 2026-09-03.
- **Decision:** Use TypeScript, Node.js >=22, npm, Vitest, ESLint, and Prettier.
- **Reason:** The requested workspace benefits from one typed language across the host, adapters,
  deterministic compiler, and future web surface. No concrete Strands compatibility issue was found
  in MP-00 research that materially requires Python.
- **Consequence:** MP-01 must verify the real Strands Agents SDK capability spike. If TypeScript
  compatibility is materially inadequate, stop and revisit this decision before implementing the
  compiler or Fates adapter.

## ADR-0002 — Target the Professional Agents track

- **Status:** Accepted.
- **Date:** 2026-09-03.
- **Decision:** Build Moirae Protocol as a Professional Operations Steward for small professional
  businesses and independent professionals.
- **Reason:** Routine administrative work has a clear background/autonomy value and a natural
  boundary between routine, consequential, and forbidden effects.
- **Consequence:** The demo story should show attention saved without implying that the agent can
  make unbounded business decisions.

## ADR-0003 — Strands is orchestration, not authority

- **Status:** Accepted.
- **Date:** 2026-09-03.
- **Decision:** Strands may understand, gather context, draft, and propose. It cannot decide whether
  a real-world effect is authorised, provide credentials, or call effectful connectors directly.
- **Reason:** Model interpretation and governance have different trust properties. Keeping authority
  outside the model makes the boundary testable and preserves independent policy decisions.
- **Consequence:** Every model output crosses a deterministic compiler before it can reach The Fates.

## ADR-0004 — ActionIntent is deterministic and versioned

- **Status:** Proposed design, accepted as a planning direction.
- **Date:** 2026-09-03.
- **Decision:** Represent executable intent as a canonical, versioned ActionIntent with deterministic
  identity, validated principals/resources/targets, expiry, evidence references, idempotency material,
  and a canonical digest.
- **Reason:** Authority and replay controls need stable bytes and exact binding. Free-form model output
  is not suitable as an execution identity.
- **Consequence:** The final schema is deferred until MP-02 and must not invent Fates field names or
  claim compatibility before the relevant public surfaces are verified.

## ADR-0005 — Mnemosyne is optional, not MVP-critical

- **Status:** Accepted.
- **Date:** 2026-09-03.
- **Decision:** Mnemosyne may provide future admitted/provenanced context, but the MVP does not
  depend on it and it can never grant permission or authority.
- **Reason:** A working governed administrative path should not be blocked on the memory/provenance
  runtime. Context and authority are separate concerns.
- **Consequence:** The initial demo can use bounded synthetic context. Any later adapter must preserve
  the memory boundary and document provenance.

## ADR-0006 — AgentCore is a stretch/scoring enhancement

- **Status:** Accepted.
- **Date:** 2026-09-03.
- **Decision:** Evaluate Amazon Bedrock AgentCore only after the basic end-to-end demo works.
- **Reason:** The official event rules describe AgentCore as optional but beneficial to Technical
  Implementation. A deployment choice must not destabilise the core proof of governed effects.
- **Consequence:** MP-08 has a working-demo gate before any AgentCore work begins.

## ADR-0007 — Preserve a strict pre-existing-work boundary

- **Status:** Accepted.
- **Date:** 2026-09-03.
- **Decision:** Treat The Fates and all related repositories as pre-existing work. MP-00 may inspect
  their metadata and documentation read-only, but does not copy implementation or claim adapter
  compatibility.
- **Reason:** The event requires a new project and disclosure of incorporated pre-existing work.
- **Consequence:** Later integration must cite exact repository, branch/tag, commit, license, and
  public surface evidence. Any unresolved item is recorded as TBD.

## ADR-0008 — Use the real Strands TypeScript SDK only for semantic proposals

- **Status:** Accepted for MP-01.
- **Date:** 2026-09-03.
- **Decision:** Use the exact `@strands-agents/sdk@1.16.0` dependency from the current
  `strands-agents/harness-sdk` monorepo. Configure Strands behind a narrow adapter and require
  Zod structured output as `AgentProposalV1`.
- **Reason:** The current official TypeScript SDK supports `Agent` construction/invocation and
  Zod-backed structured output on Node.js 20+. The repository uses Node.js >=22. The model is useful
  for semantic interpretation, but its output remains untrusted and must not be an authority or
  execution source.
- **Provider boundary:** The adapter accepts a small Bedrock/OpenAI provider configuration and
  never accepts or exposes credential material. Bedrock is the live default; OpenAI-compatible
  endpoints are an optional officially supported configuration. A synthetic model exists only in
  tests and is labelled `mock/synthetic`.
- **Consequence:** MP-01 creates one fresh Strands `Agent` per logical invocation, disables
  adapter-owned retries, bounds provider output and SDK turns, and returns only validated
  `AgentProposalV1` plus bounded metadata. ActionIntent, Fates admission, and all effects remain
  later-slice responsibilities.

## ADR-0009 — Bind the MVP compiler to explicit locale and timezone

- **Status:** Accepted for MP-02.
- **Date:** 2026-09-03.
- **Decision:** `CompilerContextV1` requires `locale: "en-GB"` and `timeZone: "Europe/London"`.
- **Reason:** Date resolution must not vary by CI host, developer machine, or ambient process
  settings. The demo's calendar semantics are deliberately fixed.
- **Consequence:** The compiler uses explicit `Intl` formatters and timezone-aware timestamp
  normalization. A context with another locale or timezone is rejected.

## ADR-0010 — Never guess normal semantic ambiguity

- **Status:** Accepted for MP-02.
- **Date:** 2026-09-03.
- **Decision:** Zero or multiple registry/availability matches return `NEEDS_CLARIFICATION`; the
  compiler never selects the first array element or invents a date, identity, destination, or slot.
- **Reason:** A valid-looking action is not safe when its trusted subject or target is unresolved.
- **Consequence:** `subject_not_unique`, `subject_not_found`, `multiple_available_slots`,
  `no_available_slot`, and related bounded reasons are explicit non-compiled outcomes.

## ADR-0011 — Do not use an ambient clock in deterministic compilation

- **Status:** Accepted for MP-02.
- **Date:** 2026-09-03.
- **Decision:** Compilation reads no clock, environment variable, or random source. `receivedAt` is
  supplied through trusted context and is normalized to canonical UTC only after validation.
- **Reason:** Compilation of identical inputs must be byte-stable and reproducible across hosts.
- **Consequence:** Relative date resolution uses the trusted appointment/context data, never
  `Date.now()` or machine-local timezone settings.

## ADR-0012 — Scope idempotency to trusted inbound work identity

- **Status:** Accepted for MP-02.
- **Date:** 2026-09-03.
- **Decision:** `sourceRequestId` comes only from `CompilerContextV1`, participates in canonical
  action material, and is included in a separately domain-separated idempotency derivation.
- **Reason:** Two separate customer requests with identical semantics must remain distinct, while
  a retry of one inbound request must reproduce the same key.
- **Consequence:** Same source ID and resolved action produce the same digest/key; a different
  source ID produces a different digest and idempotency key.

## ADR-0013 — Define Moirae Protocol canonicalization v1 locally

- **Status:** Accepted for MP-02.
- **Date:** 2026-09-03.
- **Decision:** Canonical action bytes are UTF-8, compact JSON with recursively lexicographically
  sorted object keys, preserved array order, JSON string escaping, finite JSON numbers, and no
  whitespace. Unsupported JavaScript-only values are rejected.
- **Reason:** MP-02 needs reproducible local action identity without asserting that Fates uses the
  same serialization profile.
- **Consequence:** The algorithm is named `moirae-protocol-canonicalization-v1`; a later MP-03
  adapter must translate or recompute according to the verified Fates-native contract.

## ADR-0014 — Domain-separate action digests and idempotency keys

- **Status:** Accepted for MP-02.
- **Date:** 2026-09-03.
- **Decision:** The action digest is SHA-256 over
  `moirae-protocol/action-intent/v1\0` followed by canonical ActionIntentCoreV1 bytes. The
  idempotency key is SHA-256 over `moirae-protocol/idempotency/v1\0` followed by canonical JSON of
  `{ canonicalDigest, sourceRequestId }`.
- **Reason:** Domain markers prevent accidental reuse of one hash namespace for another and the
  structured idempotency payload avoids ambiguous string concatenation.
- **Consequence:** Derived `canonicalDigest` and `idempotencyKey` are excluded from their own
  digest input. Human-readable model summary and ambiguity prose are also excluded from execution
  material because they are explanatory, untrusted content.

## ADR-0015 — Keep MP-03 as an injected native admission port

- **Status:** Accepted for MP-03.
- **Date:** 2026-09-03.
- **Decision:** Moirae Protocol owns the exact fixture-bound mapping and result boundary, while the
  accepted Ananke `Gateway.admit(...)` is supplied through a narrow `FatesAdmissionGateway` port.
  The adapter requires independently authenticated native context and exact pinned dependency
  provenance.
- **Reason:** The accepted Ananke runtime is a private monorepo whose authority and canonical hash
  engines must remain in Ananke. Copying them into Moirae would create a second security boundary;
  a structural port preserves native policy, approval, audit, and execution separation.
- **Consequence:** MP-03 can be tested offline against the exact accepted Ananke build without
  modifying or vendoring Fates source. A future generalized administrative profile requires a new
  versioned Fates acceptance; this fixture-bound adapter cannot infer new operations or values.

## ADR-0016 — Horae requires a bounded Fates execution handoff for MP-04

- **Status:** Accepted as MP-04D design direction; runtime implementation not started.
- **Date:** 2026-09-03.
- **Decision:** Use Ananke as the sole owner of admission, approval validity, native action hashing,
  and approval consumption. Use Horae as the sole owner of durable execution records, cross-process
  claim arbitration, and recovery orchestration. The eventual executor must remain behind a
  claim-aware Ananke execution choke point, with effect truth represented by a bounded
  `CONFIRMED`/`ABSENT`/`UNKNOWN` receipt boundary.
- **Reason:** The inspected Horae checkpoint (`68508f5c37e1cb3b244116d45fa267e689a6e75c`) has useful
  durable dispatch and recovery behavior, but its public binding does not carry the complete accepted
  Ananke authority envelope or a claim-aware execution handoff. Current `Gateway.execute(...)`
  consumes approval after executor invocation and cannot by itself provide atomic composition with a
  Horae claim.
- **Consequence:** Horae is classified `NEEDS_BOUNDED_EXTENSION`, and accepted Ananke requires a
  bounded claim-aware execution/consumption slice before MP-04 runtime implementation. The
  FATES-005D ledger model is retained as conceptual prior art only. Mnemosyne is excluded from MP-04.
  Sol remains the user-facing model; Luna remains backend/internal only.

## ADR-0017 — MP-04 coordinates sealed native Fates boundaries

- **Status:** Accepted and sealed as `moirae-protocol-mp04-durable-governed-execution-v0.1.0`.
- **Date:** 2026-09-03.
- **Decision:** Implement MP-04 as a narrow Protocol coordinator over the exact accepted Ananke
  FATES-007A and Horae FATES-007A structural ports. Let Ananke construct and validate native
  execution authority and remain the only executor choke point; let Horae create and arbitrate the
  durable intent/claim and own recovery state. Preserve native `CONFIRMED`, `ABSENT`, and `UNKNOWN`
  semantics, with `UNKNOWN` never authorising redispatch.
- **Reason:** Copying native Fates identity, approval, claim, or receipt algorithms into Moirae would
  create overlapping security owners and would make MP-04's apparent integration unverifiable. The
  accepted pair now exposes the minimum claim-aware boundary needed for real offline composition.
- **Consequence:** MP-04 accepts only structured MP-03 `ADMITTED` material and explicit trusted
  context/time. It has no production effect adapter, credentials, network path, Mnemosyne dependency,
  or model-to-executor path. Its durability claim is limited to one host and local cross-process
  filesystem state. Independent acceptance evidence is recorded in
  `docs/evidence/mp-04a-acceptance.json`.
