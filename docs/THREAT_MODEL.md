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

## MP-05D historical design/readiness update

The MP-04 acceptance does not close the human approval threat. MP-05D independently inspected the
sealed Ananke candidate and found that ordinary action approvals are held in a process-local map;
the durable authority ledger begins only after native execution-authority creation. The accepted
HTTP route authenticates an operator before calling approval methods, but that route boundary does
not provide a durable, restart-safe decision record for a future browser workflow. This was the
MP-05D prerequisite finding against FATES-007A.

The required future controls are:

- render exact structured principal, operation, scope, target, arguments, purpose, policy, expiry,
  and native evidence; never render approval as a task-wide grant;
- accept a decision only from a trusted host-authenticated operator/session and ignore browser
  identity, action hashes, grants, claims, and receipts;
- persist pending/approved/rejected/expired/revoked/consumed state with checksums, atomic writes,
  and cross-process compare-and-set;
- reject stale presentations and every exact-binding mutation;
- make approve/reject and recovery idempotent under duplicate clicks, process restart, and concurrent
  requests;
- preserve native Ananke approval ownership and enter Horae only after an approved native handoff.

The future Sol-facing web surface must also use CSRF protection, strict origin and session checks,
SameSite cookies, no mutating GETs, output escaping, CSP/frame restrictions, and careful avoidance
of approval IDs or action details in URLs, referrers, storage, analytics, and logs. This design does
not implement or claim any of those browser controls yet.

## MP-05 current dependency readiness

FATES-008 is independently accepted and sealed as the native Ananke human approval boundary. The
current dependency is pinned in `docs/evidence/mp-05-fates-dependency-lock.json` and provides durable
approval state, stable decision identity, authenticated operator/session binding, exact presentation
binding, expiry, revocation, cross-process decision CAS, durable dispatch reservation, fresh trusted
dispatch-time validation, replay-safe observation, and durable consumption. The accepted boundary
defines the human irrevocability fence at Ananke dispatch reservation; after that fence, later expiry
does not cancel the already reserved dispatch, and a revoke attempt must conflict.

The browser remains a presentation/decision transport and cannot supply operator identity, roles,
decision identity, native hashes, trusted time, authority, claim, reservation, or effect truth. The
trusted host owns authentication and current dispatch time. Horae begins only after an approved native
handoff; `UNKNOWN` remains non-retry; Mnemosyne remains excluded; and Sol remains the frontend while
Luna remains backend/internal. `MP-05_RUNTIME_DEPENDENCY_UNBLOCKED` is a dependency-readiness status,
not an MP-05 implementation or acceptance claim.

## MP-05I implementation candidate

The candidate adds no client authority. Every approval presentation is regenerated from the
trusted ActionIntent, MP-03 waiting evidence, and a current native FATES-008 record. A changed
parameter, target, principal, scope, policy, request, or stale native state fails before the
decision call. The browser envelope is strict and cannot carry operator/session identity, native
hashes, expiry, decision IDs, grants, claims, trusted time, or dispatch material.

APPROVE is followed by a fresh MP-03 admission and the existing MP-04 Ananke/Horae path; REJECT
never enters it. Native FATES-008 owns durable decision identity, idempotent replay, expiry,
revocation, dispatch reservation, and consumption. The implementation test mode uses accepted
public Fates roots and synthetic effects only. `MP-05_RUNTIME_IMPLEMENTED_AS_CANDIDATE` is not an
acceptance claim.
