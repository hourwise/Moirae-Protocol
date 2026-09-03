# Initial Threat Model

This is a design-time threat model for MP-00. It identifies what later implementation slices must
test; it is not a production security assessment. The system is assumed to face hostile requests,
malformed model output, untrusted context, compromised or unavailable dependencies, duplicate
delivery, and users making legitimate mistakes under time pressure.

| Threat                         | Affected boundary             | Initial control                                                                                        | Planned evidence                                                  |
| ------------------------------ | ----------------------------- | ------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------- |
| Prompt injection               | Request/content -> Strands    | Treat instructions found in content as data; model output never creates authority                      | MP-01 prompt-injection attempts; MP-03 authority-boundary tests   |
| Forged structured output       | Strands -> compiler           | Parse against a closed proposal shape; reject malformed and authority-like fields                      | MP-02 malformed model-output tests                                |
| Destination substitution       | Proposal -> target resolution | Resolve destinations from a known principal/resource registry; never trust free-form model targets     | MP-02 unknown-target and canonicalisation tests                   |
| Approval confusion             | Human -> authority            | Display and bind the exact canonical action; approval handles are opaque and single-purpose            | MP-05 exact-binding mutation tests                                |
| Replay                         | Queue/dispatch -> effect      | Deterministic idempotency material and effect-call accounting                                          | MP-04 replay/idempotency tests                                    |
| Concurrency                    | Multiple workers -> effect    | Claim/lease or equivalent single-consumer coordination around one intent                               | MP-04 concurrency tests; MP-06 queue integration                  |
| Stale authority                | Authority -> effect           | Re-check expiry, digest, principal, action, and target at execution time                               | MP-05 stale-authority tests                                       |
| Modified action after approval | Compiler/UI -> execution      | Any parameter mutation creates a new digest and invalidates the prior authority                        | MP-05 authority-binding mutation tests                            |
| Credential confusion           | Model/context -> host         | Ignore model-supplied credentials; secrets are host-side and never part of the proposal contract       | MP-01–MP-04 credential-material tests                             |
| Malformed authority evidence   | Fates -> host                 | Validate evidence and fail closed when it is missing, malformed, or unverifiable                       | MP-03 unavailable/malformed Fates tests                           |
| Authority unavailability       | Fates -> dispatch             | No fallback to model confidence, UI state, memory, or cached approval                                  | MP-03 integration failure tests; MP-08 live outage smoke          |
| Model hallucination            | Strands -> compiler           | Deterministic identity, date, parameter, and target checks; unresolved claims become non-executable    | MP-02 schema/property tests                                       |
| Context poisoning              | Mnemosyne/context -> Strands  | Context is optional and provenance-bearing; it can influence understanding but cannot grant permission | MP-01 context-injection tests; future Mnemosyne integration tests |

## Security properties to preserve

- The only route to an effect is a host-side adapter receiving a fresh, bounded authority for one
  canonical ActionIntent.
- A DENY result ends the effect path and must be observable as zero effect calls.
- A human approval is a judgment on an exact binding, not a general permission to continue a task.
- The UI renders decisions and collects a human choice; it does not mint or alter authority.
- Failure, ambiguity, or unavailable governance reduces capability and never broadens access.

## Out of scope for MP-00

No threat is being claimed solved by the placeholder workspace. There are no credentials, external
connectors, approval endpoints, model calls, queue workers, or persisted authority records in this
slice.
