# Provisional Security and Governance Invariants

These invariants are frozen as design requirements for MP-00. They are **provisional** until later
slices define implementation-specific acceptance tests and live evidence.

| ID     | Invariant                                                                         |
| ------ | --------------------------------------------------------------------------------- |
| MP-I01 | LLM/Strands output is always untrusted input.                                     |
| MP-I02 | Strands cannot directly invoke an effectful connector.                            |
| MP-I03 | Agent-generated destinations cannot bypass deterministic target validation.       |
| MP-I04 | Agent-generated credentials, authority objects, or approval claims are ignored.   |
| MP-I05 | Every effectful operation must bind to one canonical ActionIntent.                |
| MP-I06 | Human approval must bind to the exact action, principal, and parameters approved. |
| MP-I07 | Changing action parameters invalidates prior authority.                           |
| MP-I08 | Duplicate or replayed requests must not multiply effects.                         |
| MP-I09 | DENY must produce zero effect calls.                                              |
| MP-I10 | Malformed, unavailable, or unverifiable authority must fail closed.               |
| MP-I11 | Content or prompt injection must not be able to create authority.                 |
| MP-I12 | Memory/context may influence understanding but cannot create permission.          |
| MP-I13 | The browser/UI must not be an authority source.                                   |
| MP-I14 | Secrets remain host-side.                                                         |

## Evidence expectation

Every implementation slice must map relevant invariants to test evidence and label the evidence as
synthetic, integration, or live. An invariant is not considered demonstrated merely because the
agent prompt says it should hold.

## Fail-closed default

If a proposal is malformed, a target is unknown, a canonical digest cannot be reproduced, authority
evidence is stale or unavailable, or the effect adapter cannot prove the exact binding, the host must
produce no effect. The user-facing result may explain the block, but explanation is not authority.
