# MP08B QUEUE-01 — Durable MP-06 Queue and Bounded Worker Composition

## Scope and status

`MP08B_QUEUE_01 != MP08B_DEPLOYMENT`

`MP08B_QUEUE_01 != MP08B_ACCEPTANCE`

`MP08B_QUEUE_01 != MP09_ACCEPTANCE`

This offline slice crosses exactly one boundary:

```text
durable MP-05 APPROVED
  → deterministic post-approval eligibility
  → durable local MP-06 work item
  → bounded worker claim and lease
  → READY_FOR_MP04
  → STOP before MP-04/Horae/effect
```

`APPROVAL != QUEUE AUTHORITY`

`QUEUE_ITEM != EFFECT`

`WORKER_CLAIM != EFFECT_AUTHORITY`

`WORKER_STATE != MP04_CONFIRMED`

`QUEUED_OR_CLAIMED != HANDLED_AUTOMATICALLY`

No AWS, model, MP-04, Horae, provider, deployment, or external effect was
used. MP-08B remains undeployed and unaccepted.

## Existing MP-06 contract audit

The accepted MP-06 implementation is in
`packages/background-work/src/index.ts` and
`packages/background-work/src/durable.ts`.

| Capability                | Existing implementation                                                                        | Classification                          |
| ------------------------- | ---------------------------------------------------------------------------------------------- | --------------------------------------- |
| Logical work identity     | `deterministicQueueIdentity.logicalWorkId` over source request and ActionIntent digest         | `IMPLEMENTED_RUNTIME`                   |
| Delivery identity         | Existing `QueueWorkV1.deliveryId` with duplicate-delivery and duplicate-logical-work semantics | `IMPLEMENTED_RUNTIME`                   |
| ActionIntent binding      | `createQueueWork` and worker-side canonical identity verification                              | `IMPLEMENTED_RUNTIME`                   |
| Approval reference        | `QueueProtocolReferencesV1.approval` and `QueueApprovalReferenceV1`                            | `IMPLEMENTED_RUNTIME`                   |
| In-memory queue           | `InMemoryLocalQueue`                                                                           | `IN_MEMORY_ONLY`                        |
| Filesystem persistence    | `DurableFilesystemLocalQueue` with atomic JSON and lock file                                   | `DURABLE_LOCAL`                         |
| Cross-process arbitration | `FileMutex` with stale-owner recovery and bounded lock attempts                                | `DURABLE_LOCAL`                         |
| Claim/lease               | Compare-and-set claim, worker ID, claim ID, generation, state version, expiry                  | `IMPLEMENTED_RUNTIME`                   |
| Restart recovery          | Queue and activity state reconstructed from filesystem state                                   | `DURABLE_LOCAL`                         |
| Retry/release             | Existing bounded retry budget and explicit release semantics                                   | `IMPLEMENTED_RUNTIME` / `DURABLE_LOCAL` |
| Worker lifecycle          | `DeterministicLocalWorker`, including the later MP-04 boundary                                 | `IMPLEMENTED_LIBRARY`                   |
| Hosted multi-writer queue | No cloud or shared hosted queue                                                                | `MISSING`                               |

The existing local filesystem queue is durable across process instances and
supports local cross-process locking. It is not represented as hosted durable
queue state. `hostedDurableQueue` remains `false`.

## Post-approval eligibility contract

Queue admission requires a fresh server-side reread through the Approval-01
runtime. The host must have:

- an existing durable host binding;
- exact ActionIntent source request, canonical digest, and idempotency key;
- native MP-05 state `APPROVED`;
- a stable native `decisionId`;
- exact native ActionIntent/context/presentation binding;
- non-invalid current native state;
- no client-supplied approval, action, or queue authority material.

The native observation is obtained through the new read-only
`Mp05HumanApprovalCoordinator.readApprovalOnly` method. It does not decide,
continue, or enter MP-04.

Pending, rejected, expired, revoked, consumed, missing, malformed, or
conflicting approval state fails closed and cannot create a work item.

## Durable enqueue composition

`apps/host/src/queue-runtime.ts` provides the bounded host composition.

`enqueueApproved(approvalId)`:

1. loads the host-owned Approval-01 binding;
2. rereads native MP-05 truth;
3. requires `APPROVED` plus a native decision identity;
4. creates the existing `QueueWorkV1` through `createQueueWork`;
5. preserves ActionIntent digest/idempotency and approval/decision references;
6. derives a deterministic Queue-01 delivery identity;
7. enqueues through `DurableFilesystemLocalQueue`;
8. makes the delivery available at trusted host time.

Repeated enqueue of the same approved continuation returns the existing
queue duplicate result and does not create a second delivery identity.
An existing logical work item bound to a different approval or decision is
rejected rather than silently substituted.

## Worker composition

The accepted `DeterministicLocalWorker` proceeds through the MP-04 interface
after admission. Queue-01 therefore adds a narrower bounded pre-execution
worker in `apps/host/src/queue-runtime.ts` that reuses the accepted queue
claim/lease boundary without invoking that later worker path.

The worker:

- discovers the durable delivery;
- derives the accepted deterministic scheduling claim ID;
- acquires the compare-and-set claim;
- records worker ID, claim ID, generation, state version, and lease expiry;
- rereads the exact native MP-05 approval binding;
- records bounded activity;
- returns `READY_FOR_MP04` while leaving the durable delivery claimed.

No execution callback is supplied. No queue completion is recorded for a
normal claim because MP-04 has not run. If the approval reread fails after a
claim, the work is durably marked `BOUNDARY_BLOCKED` and no effect path is
entered.

## Claim, lease, and replay semantics

The existing MP-06 queue remains authoritative for scheduling ownership only.

- A second worker cannot steal an active lease.
- A lease-expired delivery can be reclaimed with the next generation.
- Worker identity and deterministic claim identity are persisted.
- Queue state survives reconstruction from the same filesystem path.
- Duplicate enqueue after restart returns `DUPLICATE_DELIVERY`.
- Activity is bounded explanatory evidence, not approval or effect authority.
- Retry state remains the existing MP-06 state; Queue-01 does not invent new
  retry outcomes or automatically retry the pre-execution boundary.

## Capability state

```text
liveFates          = true
liveStrands        = false in offline tests
durableApproval    = true
hostedDurableQueue = false
durableLocalQueue  = true
boundedWorker      = true
externalEffects    = false
```

The new local queue capabilities are facts of the supplied filesystem queue
and bounded worker. They do not relabel the queue as hosted or production
durable.

## MP-07 semantics

Queue-01 does not change the MP-07 mapper.

```text
APPROVED_NOT_HANDLED_AUTOMATICALLY
QUEUED_NOT_HANDLED_AUTOMATICALLY
CLAIMED_NOT_HANDLED_AUTOMATICALLY
WORKER_COMPLETION_NOT_EFFECT_CONFIRMATION
```

`HANDLED_AUTOMATICALLY` remains reserved for the existing product predicate:
durable MP-06 completion plus MP-04 `CONFIRMED` truth. Queue-01 never produces
that predicate.

## Security boundaries

Preserved:

- `MODEL_OUTPUT_NOT_AUTHORITY`
- `FATES_DECISION_NOT_MODEL_DECISION`
- `BROWSER_STATE_NOT_AUTHORITY`
- `TRUSTED_HOST_CONTEXT_PRESERVED`
- `APPROVAL_NOT_EXECUTION`
- `QUEUE_ITEM_NOT_EFFECT`
- `WORKER_CLAIM_NOT_EFFECT_AUTHORITY`
- `FAIL_CLOSED_UNKNOWN_STATE`
- `NO_TEST_FALLBACK`
- `SYNTHETIC_NOT_LIVE`

The browser is not involved in queue admission. Queue references are
re-read and rebound to native MP-05 truth before the worker reports readiness
for the later execution boundary.

## Local evidence

The focused Queue-01 suite uses deterministic AgentProposalV1 fixtures and
the read-only FATES-008A runtime. It proves:

- all three supported actions enqueue from real durable APPROVED state;
- REJECTED approval creates no queue item;
- queue state and leases survive runtime reconstruction;
- lease expiry permits deterministic reclaim;
- concurrent workers produce one winner;
- forged queue approval references fail closed;
- duplicate approved enqueue is idempotent after restart.

The local smoke is:

```text
fixture AgentProposalV1
  → strict validation
  → MP-02
  → MP-03
  → real FATES REQUIRE_APPROVAL
  → durable MP-05 APPROVE
  → durable MP-06 filesystem enqueue
  → bounded worker claim/lease
  → READY_FOR_MP04
  → STOP
```

There is no MP-04 call, Horae operation, provider effect, or
`HANDLED_AUTOMATICALLY` claim.

## Next unavailable boundary

`FIRST_UNAVAILABLE_BOUNDARY = POST_APPROVAL_MP04_HORAE_EXECUTION_AND_RECONCILIATION`.

The next slice must independently compose the accepted MP-04/Horae execution
and reconciliation boundary. It must preserve the distinction between a
worker claim and effect authority, and must not be inferred from Queue-01
state.

## Classification

```text
MOIRAE_MP08B_QUEUE_01_COMPLETE
DURABLE_MP06_QUEUE_READY
BOUNDED_WORKER_READY
POST_APPROVAL_QUEUE_PATH_READY
QUEUE_RESTART_DURABILITY_PASS
WORKER_CLAIM_NOT_EFFECT_PRESERVED
MP08A_ACCEPTED
MP08B_NOT_DEPLOYED
MP08B_NOT_ACCEPTED
MP09_NOT_ACCEPTED
NO_AWS_CALLS
NO_DEPLOYMENT
NO_PUBLICATION
```

### Execution-01 follow-on state

The separately bounded Execution-01 slice now consumes `READY_FOR_MP04` only
after rereading durable MP-05 approval truth and obtaining a fresh exact MP-03
`ADMITTED` handoff. The existing MP-04 coordinator and a local deterministic
Horae-shaped fixture can persist `COMPLETED`, `EFFECT_ABSENT`, or
`RECONCILIATION_REQUIRED` outcomes. The fixture is not an external effect and
`HANDLED_AUTOMATICALLY` is not inferred from queue or worker state.

The current next unavailable boundary is `REAL_EXTERNAL_EFFECT_PROVIDER`.
