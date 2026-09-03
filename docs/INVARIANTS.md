# Security and Governance Invariants

These invariants were frozen as design requirements for MP-00. MP-02 provides implementation
evidence for the deterministic compiler rows below, and MP-03 now provides authority-admission
evidence. Effect execution remains out of scope.

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

## Fail-closed default

If a proposal or ActionIntent is malformed, a target is unknown, a canonical digest cannot be
reproduced, the accepted fixture mapping/context/hash is unavailable or mismatched, or a later effect
adapter cannot prove the exact binding, the host must produce no effect. The user-facing result may
explain the block, but explanation is not authority.
