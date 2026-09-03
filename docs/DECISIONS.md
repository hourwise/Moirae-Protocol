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
