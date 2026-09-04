# Security and Governance Invariants

These invariants were frozen as design requirements for MP-00. MP-02 provides implementation
evidence for the deterministic compiler rows below, MP-03 provides authority-admission evidence,
and MP-04 provides bounded synthetic durable-execution evidence. No production effect is included.

| ID     | Invariant                                                                                          |
| ------ | -------------------------------------------------------------------------------------------------- |
| MP-I01 | LLM/Strands output is always untrusted input.                                                      |
| MP-I02 | Strands cannot directly invoke an effectful connector.                                             |
| MP-I03 | Agent-generated destinations cannot bypass deterministic target validation.                        |
| MP-I04 | Agent-generated credentials, authority objects, or approval claims are ignored.                    |
| MP-I05 | Every effectful operation must bind to one canonical ActionIntent.                                 |
| MP-I06 | Human approval must bind to the exact action, principal, and parameters approved.                  |
| MP-I07 | Changing action parameters invalidates prior authority.                                            |
| MP-I08 | Duplicate or replayed requests must not multiply effects.                                          |
| MP-I09 | DENY must produce zero effect calls.                                                               |
| MP-I10 | Malformed, unavailable, or unverifiable authority must fail closed.                                |
| MP-I11 | Content or prompt injection must not be able to create authority.                                  |
| MP-I12 | Memory/context may influence understanding but cannot create permission.                           |
| MP-I13 | The browser/UI must not be an authority source.                                                    |
| MP-I14 | Secrets remain host-side.                                                                          |
| MP-I15 | A canonical ActionIntent is not authority and does not encode a governance decision.               |
| MP-I16 | The Action Compiler has no LLM, network, credential, clock, random, or effect path.                |
| MP-I17 | Principal, requester, booking, recipient, resource, and timestamp facts come from trusted context. |
| MP-I18 | Ambiguous registry or availability resolution produces clarification rather than a guess.          |
| MP-I19 | Canonical digest input excludes derived digest fields and explanatory model prose.                 |
| MP-I27 | A human decision authorises one exact native action, never a task or future mutation.              |
| MP-I28 | Browser/UI state is presentation and decision transport only; it cannot mint authority.            |
| MP-I29 | Human approval requires a trusted host-authenticated operator/session, not caller identity text.   |
| MP-I30 | Approval decision races are durable compare-and-set transitions with one terminal winner.          |
| MP-I31 | Approval expiry, rejection, revocation, corruption, and restart ambiguity fail closed.             |
| MP-I32 | Re-approval does not create a second durable effect identity.                                      |

## Evidence expectation

Every implementation slice must map relevant invariants to test evidence and label the evidence as
synthetic, integration, or live. An invariant is not considered demonstrated merely because the
agent prompt says it should hold.

## MP-02 implementation evidence

- MP-I01, MP-I03, MP-I04, MP-I11, MP-I15, and MP-I17 are covered by hostile proposal substitution
  tests in `tests/mp02-action-compiler.test.ts`.
- MP-I05 and MP-I19 are covered by ActionIntent schema, canonical core, digest, and mutation tests.
- MP-I08 is represented by source-scoped idempotency tests; no effect execution is implemented yet.
- MP-I16 is covered by static compiler-source assertions and the pure synchronous compiler API.
- MP-I18 is covered by duplicate appointment, duplicate Friday, zero/multiple slot, unknown
  requester, invalid recipient, and missing resource tests.
- Evidence is synthetic/offline; no live provider or Fates call is involved.

## MP-03 admission evidence

- MP-I01, MP-I04, MP-I10, MP-I11, MP-I15, and MP-I17 are extended by
  `tests/mp03-fates-admission.test.ts`: hostile authority strings, invalid context, strict mapping,
  and MP-02 digest tampering fail before native admission.
- MP-I05, MP-I06, MP-I07, and MP-I08 are exercised through the accepted Ananke profile's real
  native hash and approval binding. Admission does not consume one-use approvals.
- MP-I09 is demonstrated as admission-only: a deliberately throwing executor remains uncalled and
  native audit contains no `TOOL_EXECUTED` event.
- MP-03 uses explicit trusted time and distinguishes `BOUNDARY_FAILURE` from native policy results.
- The evidence is offline integration evidence against the pinned accepted Ananke checkpoint; no
  external effect, provider call, Firecracker run, Horae, or Mnemosyne path is involved.

## MP-04 durable execution evidence

- MP-I20: The native Fates action hash is distinct from the Moirae `canonicalDigest` and
  `idempotencyKey`; neither Moirae value grants authority. Covered by the MP-04 boundary and real
  integration tests.
- MP-I21: The Horae durable claim binds the complete native operation, authority, principal,
  context, scope, purpose, and request/correlation material; a generic task ID is insufficient.
- MP-I22: An effect outcome that cannot be proven `CONFIRMED` or `ABSENT` is `UNKNOWN` and blocks
  blind redispatch. The restart/reconciliation tests prove `UNKNOWN -> CONFIRMED` without a second
  executor invocation and preserve persistent `UNKNOWN` when reconciliation cannot decide.
- MP-I23: Sol is the user-facing/frontend/judge model and Luna is backend/internal only; neither
  model may bypass deterministic Moirae and Fates governance. MP-04 adds no model or direct-effect
  path.
- MP-I24: Only an MP-03 `ADMITTED` result can construct an MP-04 authority handoff; waiting,
  rejected, boundary-failure, caller-hash, caller-claim, and model-prose inputs fail closed.
- MP-I25: Executor invocation is not effect confirmation. Only a validated native receipt or
  authoritative reconciliation can produce `CONFIRMED`; `ABSENT` requires authoritative negative
  evidence.
- MP-I26: MP-04 durable guarantees are limited to one host and local cross-process filesystem
  arbitration; it does not claim distributed consensus or multi-host exactly-once execution.

The implementation and test evidence are recorded in `docs/MP-04_DURABLE_EXECUTION.md`,
`tests/mp04-durable-execution.test.ts`, and `docs/evidence/mp-04a-acceptance.json`. MP-04 is
independently accepted and sealed as `moirae-protocol-mp04-durable-governed-execution-v0.1.0`.

## MP-05D design/readiness evidence

MP-05D records the architecture for MP-I27 through MP-I32 in
`docs/MP-05_HUMAN_APPROVAL_DESIGN.md`. These are design requirements, not implemented runtime
claims. The readiness conclusion is `ANANKE_NEEDS_BOUNDED_EXTENSION_FOR_MP05`: the accepted
Ananke ordinary approval map is process-local and requires a future durable human-decision boundary
before MP-05 implementation. The accepted MP-04 execution ledger does not substitute for a pending
approval store. `HORAE_NOT_REQUIRED_UNTIL_POST_APPROVAL_EXECUTION` and
`MNEMOSYNE_NOT_REQUIRED_FOR_MP05` remain in force.

The future MP-05 evidence must cover exact presentation binding, trusted host authentication,
expiry/revocation, rejection, double-submit races, restart windows, fresh-authority semantics, and
the browser's inability to create Ananke authority. Until then, no approval UI or MP-05 execution
path is claimed.

## Fail-closed default

If a proposal or ActionIntent is malformed, a target is unknown, a canonical digest cannot be
reproduced, the accepted fixture mapping/context/hash is unavailable or mismatched, or a later effect
adapter cannot prove the exact binding, the host must produce no effect. The user-facing result may
explain the block, but explanation is not authority.
