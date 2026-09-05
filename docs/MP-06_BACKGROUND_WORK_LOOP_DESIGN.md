# MP-06 — Background Work Loop Readiness and Candidate Design

**MP-06A historical status:** `MP-06A_BACKGROUND_LOOP_READINESS_COMPLETE`; the readiness
contract was completed and published at `6ae5d7e2fb83aabbd8c60a8d88217b33c4e975b9`.

**MP-06B candidate status:** `MP-06B_DETERMINISTIC_LOCAL_WORKER_CORE_COMPLETE`; a deterministic
local queue/worker core exists on the candidate branch. It is synthetic/local evidence only and
does not accept MP-06.

**MP-06C candidate status:** `MP-06C_CONCURRENCY_CRASH_RETRY_HARDENING_COMPLETE`; bounded local
durability, scheduling leases, crash checkpoints, typed retries, and MP-04 reconciliation routing
are implemented and independently validated on the published terminal
`650404c0c69bd4ca3f70e818b36d0fb546a94cca`. This remains a milestone candidate and does not
accept MP-06.

**MP-06D candidate status:** `MP-06D_BACKGROUND_HUMAN_APPROVAL_INTEGRATION_COMPLETE`; the local
candidate composes the accepted MP-05 `prepareApproval` and `recoverOrRefresh` surfaces for
bounded approval parking and restart-safe recovery. It is not published or independently
accepted in this slice.

**Runtime classification:** `MP-06_RUNTIME_IMPLEMENTED_AS_CANDIDATE`; no timer, external queue,
provider, cloud credential, or autonomous production runtime is added.

**Overall classification:** `MP-06_OPENED`, `MP-06_NOT_ACCEPTED`.

This document turns the MP-06 build-plan entry into an implementation contract and records the
bounded MP-06B candidate facts below. It does not accept MP-06, reopen MP-05, or alter the
accepted MP-02–MP-05 runtime boundaries.

## 1. Scope and entry assumptions

MP-06 begins from the promoted MP-05 terminal:

| Item                               | Value                                      |
| ---------------------------------- | ------------------------------------------ |
| Remote main                        | `e264538c6c88a12afc3c1cddd0761e37d41d0974` |
| Tree                               | `5ece9b4a9311000f3263253f934d214991acd1c7` |
| MP-05 acceptance tag               | `mp-05-accepted-v1`                        |
| MP-05 acceptance tag object        | `b71da9db867d363cf61ba6b491dd6f968f1821d6` |
| MP-05 runtime remediation ancestor | `b61ce64a672c749a97f459ab4fe5fa50b7e252bc` |
| MP-06A branch                      | `codex/mp06a-background-loop-readiness`    |
| MP-06A parent                      | `e264538c6c88a12afc3c1cddd0761e37d41d0974` |

The baseline was fetched and verified before the MP-06A worktree was created. Existing linked
worktrees and the primary checkout were preserved. The new worktree was resolved from Git's
worktree metadata and was created directly from the accepted remote-main SHA.

The accepted Protocol scope remains synthetic/offline, one host, local durable state, and
cross-process arbitration. MP-06A makes no distributed queue, multi-host exactly-once, network
partition, cloud deployment, provider, or production-effect claim.

The accepted dependency layers are deliberately separate:

| Boundary                      | Owner/profile                                         | MP-06A treatment                                                                         |
| ----------------------------- | ----------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Semantic proposal             | MP-01 Strands                                         | Queue never receives or interprets model prose.                                          |
| Deterministic action material | MP-02 `ActionIntentV1`                                | Queue references one validated immutable intent.                                         |
| Admission                     | MP-03 / accepted Ananke FATES-006B profile            | Worker requests current/fresh admission as required; cached status is not authority.     |
| Durable effect execution      | MP-04 / accepted Ananke FATES-007A + Horae FATES-007A | Worker calls the public MP-04 continuation; it does not create a second execution claim. |
| Human approval                | MP-05 / accepted Ananke FATES-008A composition        | Worker surfaces and recovers approval work; it never creates or upgrades approval.       |
| Scheduling                    | Future MP-06 queue/worker                             | Operational ownership only; never permission.                                            |
| Effect truth                  | MP-04 native receipt/reconciliation boundary          | `UNKNOWN` remains non-retry and blocks blind redispatch.                                 |

The accepted dependency identities inherited by this design are:

| Use                      | Immutable dependency identity                                                                                                                                                                                                                                                                                                                                                                                              |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| MP-03 admission          | Ananke `ananke-fates-006b-mp03-admission-v0.1.0-protocol-1.4.0`, tag object `6425d4b34fba62ab60381a4a2237786d0d6173ad`, peeled SHA `6bf8902c55c4f3f7593a987582b50783c8a7b5a0`; Adrasteia `a1c01bf9e6f9d6a126cfdcc1acfacd488b214210`                                                                                                                                                                                        |
| MP-04 governed execution | Ananke `ananke-fates-007a-claim-aware-execution-v0.1.0-protocol-1.4.0`, tag object `9fb9fc4d8183db64aa37f0a4e167fdf41ca856e5`, peeled SHA `114063e03332af3389fe805193e88a62111d9323`; Horae `horae-fates-007a-claim-aware-execution-v0.1.0-protocol-1.4.0`, tag object `59763d34644567c59d1041b3acef24efc5a1d072`, terminal `aa296b420fbcf578089ca66dc03f6d09d9b06f00`, runtime `7b24cb0af083e505bd2dc9fa55c6c3387f849131` |
| MP-05 approval/recovery  | Ananke `ananke-fates-008a-durable-human-approval-v0.1.0-protocol-1.4.0`, tag object `0fa08f78f27e2f79c895402f3f53a8aada5837b4`, terminal `b888d61adf180d33e2ae2e61d276cb9b0f13bd12`, runtime `c89b83de40ed0275969fe3931220f440bf082aa3`; Horae remains the accepted 007A dependency above; Adrasteia remains `a1c01bf9e6f9d6a126cfdcc1acfacd488b214210`                                                                    |
| MP-06 queue              | No dependency selected in MP-06A; the logical contract precedes backend selection                                                                                                                                                                                                                                                                                                                                          |

These profiles are inherited provenance, not a new MP-06 dependency lock. MP-06B must pin its
actual composition only after its runtime interfaces and acceptance scope are known.

## 2. Authority model

The following are protocol invariants for every future queue backend and worker implementation:

```text
QUEUE DELIVERY       != AUTHORITY
QUEUE VISIBILITY     != AUTHORITY
WORKER CLAIM         != AUTHORITY
RETRY ELIGIBILITY    != AUTHORITY
PRIOR MP-03 ALLOW    != FRESH EXECUTION AUTHORITY
PRIOR HUMAN APPROVAL != PERMISSION FOR A MUTATED INTENT
ACTIVITY RECORD      != AUTHORITY
```

The only effect-capable path remains:

```text
immutable ActionIntent reference
  -> current deterministic MP-03 admission
  -> MP-05 exact approval workflow when required
  -> fresh executable MP-03 ADMITTED result
  -> accepted MP-04 Ananke/Horae continuation
  -> one claim-aware executor path
  -> native receipt or reconciliation
```

The worker may decide that an item is ready to be checked. It may not decide that the item is
allowed to execute. Queue ownership is analogous to a scheduling lease, not an authority grant.

### Automatically executable work

For a policy profile that returns `ALLOW` without approval, the intended flow is:

```text
queued canonical intent
  -> bounded worker claim
  -> load immutable intent and trusted context
  -> current/fresh MP-03 admission
  -> MP-04 governed continuation
  -> native effect-once result
  -> durable activity outcome
```

“Route ALLOW silently” means that the worker does not create a human-approval presentation. It
does not mean that the worker skips MP-04, bypasses Ananke, or treats a queue flag as permission.
The current accepted MP-03 fixture profile requires approval for all three supported actions, so
the current baseline demonstrations take the approval-required branch until MP-05 produces a
fresh executable admission.

### Approval-required work

```text
queued canonical intent
  -> worker claim
  -> current MP-03 result is REQUIRE_APPROVAL
  -> MP-05 durable presentation/request observation
  -> release worker claim and park/surface the item
  -> no effect while pending
  -> later MP-05 recovery after a real human decision
  -> fresh MP-03 admission bound to the same intent and approval
  -> MP-04 continuation
```

The worker must not remain alive waiting for a human. A repeated delivery while approval is
pending is an observation of the same durable approval request, not permission to create another
approval request automatically.

### Denial

```text
queued canonical intent
  -> current MP-03 / native governance decision
  -> DENY or other valid non-executable native result
  -> durable denied/blocked activity
  -> queue acknowledgement or terminal retention
  -> zero MP-04 calls and zero effect calls
```

`REJECTED` in the MP-03 result is a governance result only when its native decision is one of
`DENY`, `REQUIRE_REFRESH`, `REQUIRE_NARROWER_SCOPE`, or `REQUIRE_HUMAN_CLARIFICATION`. A queue
worker must preserve that native meaning and must not turn it into an automatic retry or an
approval.

### Boundary failure or unavailable authority

Malformed intent, missing trusted context, stale/malformed approval, unknown operation, invalid
native result, dependency mismatch, and unavailable authority are fail-closed. A clearly
classified transient infrastructure error may be scheduled for a bounded operational retry, but
that retry is never permission and must not use a stale cached `ALLOW`. An unclassified or
integrity-related failure becomes `BOUNDARY_BLOCKED`/`RECONCILIATION_REQUIRED` and requires an
explicit recovery path.

## 3. Existing contract audit

### MP-02 — canonical action material

`ActionIntentV1Schema` is a strict discriminated union for the three accepted actions. Its common
identity fields include `sourceRequestId`, trusted principal/requester material, evidence
references, an explicit UTC `contextTimestamp`, `canonicalDigest`, and source-scoped
`idempotencyKey`. Its action-specific material contains the exact booking/resource/recipient or
timestamp parameters.

MP-06 must preserve these properties:

1. Load a validated `ActionIntentV1`; do not accept a queue message as a replacement schema.
2. Recompute and verify the MP-02 canonical digest and idempotency key before admission or
   continuation.
3. Resolve the immutable intent by content identity or a trusted server-side reference. A mutable
   queue copy is not sufficient for authority.
4. Treat `sourceRequestId`, `canonicalDigest`, and `idempotencyKey` as Moirae identity/provenance;
   none is an Ananke authority or effect permission.
5. Never ask Strands or any model to repair malformed queued material.

The queue may carry the action discriminator and digest as routing metadata, but the worker must
compare those fields to the reloaded ActionIntent and fail closed on mismatch. The queue should
not carry arbitrary model summary, confidence prose, or the original natural-language request.

### MP-03 — current admission boundary

MP-03 accepts an exact `ActionIntentV1`, independently authenticated
`Mp03AuthenticatedContext`, explicit trusted time, and optional exact approval identity. It maps
only the three accepted fixture actions to their exact registered operation and delegates native
evaluation. It returns:

| MP-03 status           | Native meaning                                                       | MP-06 treatment                                                                                                                              |
| ---------------------- | -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `ADMITTED`             | `ALLOW`                                                              | Eligible for MP-04 only after the exact current/fresh admission is validated.                                                                |
| `WAITING_FOR_APPROVAL` | `REQUIRE_APPROVAL`                                                   | Surface/park through MP-05; no MP-04 call.                                                                                                   |
| `REJECTED`             | `DENY`, refresh, narrower scope, or human clarification              | Record the native blocked outcome; no effect. A refresh/clarification is an explicit future workflow, not an automatic permission upgrade.   |
| `BOUNDARY_FAILURE`     | MP-03 could not safely form/validate/evaluate the governance request | Fail closed. Retry only when an external operational classifier explicitly says the failure is transient; never treat it as denial or allow. |

An old MP-03 result in a queue item is evidence of a previous observation, not current execution
authority. Before MP-04, the worker must obtain the fresh admission required by the current
authority profile and verify exact ActionIntent, context, operation, approval identity, native
hash, and trusted time binding. A changed ActionIntent cannot reuse a previous approval or
`ALLOW` result.

### MP-04 — durable governed execution boundary

The accepted `Mp04ExecutionCoordinator` validates the ActionIntent and MP-03 `ADMITTED` result,
recomputes the Moirae digest/idempotency values, checks the accepted fixture/context binding,
asks Ananke to construct native execution authority, and calls Horae's durable `execute` or
`recover` port. Horae owns the durable record and owner/generation claim. Ananke remains the
claim-aware executor choke point. MP-04 returns `CONFIRMED`, `ABSENT`, `UNKNOWN`,
`RECOVERY_REQUIRED`, or `BOUNDARY_FAILURE`.

MP-06 must not duplicate any of the following:

- native Ananke action/authority hashing;
- Ananke approval validity or consumption;
- Horae durable execution identity;
- Horae owner/generation claim arbitration;
- MP-04 receipt validation or reconciliation;
- an effect-once lock or a second effect ledger.

`UNKNOWN` and `RECOVERY_REQUIRED` are recovery states. They are not queue retry permission. A
worker redelivery must call the MP-04 recovery route for the existing native durable execution
identity, or place the item in reconciliation-required state, rather than making a fresh effect
attempt.

### MP-05 — durable approval and recovery boundary

The accepted MP-05 composition re-reads native durable approval state, preserves the native
approval/request/decision identity, validates exact presentation and semantic binding, and on an
approved path performs fresh MP-03 admission before entering MP-04. It recognizes pending,
approved, rejected, expired, stale/revoked, conflict, and boundary-failure conditions. Approval
does not apply to a changed intent, target, principal, resource, operation, request, or context.

MP-06 therefore stores only references to MP-05 approval state and durable presentation/activity
evidence. It must not copy a grant into a queue message as permission, mint a new decision, or
automatically re-request approval after expiry. A recovery worker calls the MP-05 re-read/recovery
interface and accepts continuation only after the same exact semantic binding and fresh MP-03
checks pass.

## 4. Queue-work identity model

This is a proposed logical contract for MP-06B, not a runtime type or accepted wire schema.

```text
Mp06QueueWorkItemV1 {
  schemaVersion: "mp06-queue-work-v1",

  work: {
    workId,
    sourceRequestId,
    actionIntentDigest,
    actionIntentIdempotencyKey,
    action,
    immutableIntentRef,
    tenantId,
    correlation: { requestId, correlationId, causationId? }
  },

  scheduling: {
    enqueuedAt,
    queueDeadline?,
    attemptNumber,
    deliveryId
  },

  authorityObservation?: {
    mp03EvidenceRef,
    nativeActionHash,
    status,
    approvalId?,
    approvalDecisionId?
  }
}
```

The `authorityObservation` section is explicitly observational. It is a cache/index for routing
and display, not permission. A worker must revalidate current authority before MP-04. The queue
item must not carry credentials, approval tokens, provider idempotency secrets, mutable effect
parameters, or an unverified claim that an effect already happened.

### Separate identities

| Identity                     | Meaning                                                     | Owner                   | May authorize an effect?                                    |
| ---------------------------- | ----------------------------------------------------------- | ----------------------- | ----------------------------------------------------------- |
| `workId`                     | Logical queue work for one immutable Moirae intent/request  | MP-06 queue contract    | No                                                          |
| `sourceRequestId`            | Trusted inbound request identity used by MP-02 idempotency  | Host/MP-02              | No                                                          |
| `actionIntentDigest`         | MP-02 integrity identity of canonical ActionIntent material | MP-02                   | No                                                          |
| `actionIntentIdempotencyKey` | Source-scoped Moirae retry/reference identity               | MP-02                   | No                                                          |
| `deliveryId`                 | One queue delivery/attempt observation                      | Queue backend           | No                                                          |
| `workerClaimId`              | Scheduling ownership and lease generation, if needed        | MP-06 worker store      | No                                                          |
| `nativeActionHash`           | Exact authenticated governed operation identity             | Ananke                  | No by itself; it must be a valid current authority result   |
| `approvalId` / `decisionId`  | Native human approval/request and decision identity         | Ananke/FATES-008        | No by itself; exact status/binding/expiry are required      |
| `durableExecutionId`         | Native MP-04/Horae effect identity                          | Horae/Ananke            | No by itself; it represents a claimed governed continuation |
| provider idempotency token   | Future external provider retry identity                     | Effect provider/adapter | No; it must remain bound to MP-04 effect identity           |

`workId` should be derived from a versioned canonical tuple containing at least the trusted
`sourceRequestId`, ActionIntent digest, and action discriminator. The exact derivation belongs to
MP-06B and must be domain-separated from both MP-02 idempotency and native Fates hashes. It must
distinguish separate trusted requests that have identical semantic parameters. It must not use a
queue delivery ID as the logical work identity.

An MP-04 `durableExecutionId` is not assigned by the worker. The worker receives it from the
accepted MP-04/Horae path after native authority construction. For the same unchanged effect,
MP-05 re-approval may preserve the MP-04 durable effect identity according to the accepted native
semantics; a new approval decision is still a distinct approval observation.

## 5. Worker claim decision and semantics

MP-06 does need a narrow worker-processing claim if the selected queue backend can deliver the
same work to multiple workers. It does **not** need, and must not introduce, a second competing
effect-execution claim. MP-04/Horae already owns execution arbitration.

The proposed worker claim is scheduling state only:

```text
claim(workId, workerId, leaseGeneration, leaseUntil, deliveryId)
```

Rules:

- Acquisition is compare-and-set on the logical `workId` and current lease generation.
- A losing worker records an observation and exits or waits for redelivery; it does not call
  MP-04 merely because it observed the queue item.
- Lease expiry permits processing recovery, not authority recovery. A reclaimed item repeats
  current validation and uses the existing MP-04 recovery state where one exists.
- A stale worker cannot acknowledge, overwrite activity, or dispatch after its lease generation is
  superseded.
- The worker claim is never included as a substitute for Ananke authority or the Horae claim.
- Queue acknowledgement occurs only after the durable queue/activity state is written. An
  uncertain effect outcome remains unacknowledged or is routed to durable reconciliation according
  to the queue backend, never blind redispatch.

The claim store must be durable enough for the selected MP-06 local backend to simulate process
crash and cross-process races. It may be implemented by the same local persistence foundation as
other Protocol test state, but it must not be confused with Horae's native durable execution
record. A future implementation must define one owner for the worker claim and one owner for the
effect claim.

## 6. Retry and outcome taxonomy

The following table is the required policy for the MP-06 worker contract. “Retry” means only
reprocessing the same immutable work identity through the same authority chain; it never means
reusing a stale permission or silently widening scope.

| Condition                                        | Queue/activity state                              | Retry or recovery                                                                               | Effect permitted?                        |
| ------------------------------------------------ | ------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ---------------------------------------- |
| Malformed ActionIntent or failed MP-02 integrity | `TERMINAL_FAILURE` / blocked                      | No automatic retry; operator or new request required                                            | No                                       |
| Unsupported action or exact mapping failure      | `TERMINAL_FAILURE` / blocked                      | No generic fallback                                                                             | No                                       |
| MP-03 `DENY`                                     | `DENIED`                                          | Terminal observation; redelivery is idempotent                                                  | No                                       |
| MP-03 refresh/narrower-scope/clarification       | `BLOCKED` or explicit `WAITING_FOR_CLARIFICATION` | New explicit workflow only; never automatic ALLOW                                               | No                                       |
| MP-03 `REQUIRE_APPROVAL`                         | `WAITING_FOR_APPROVAL`                            | Release worker; wait for MP-05 durable state                                                    | No                                       |
| MP-03 boundary failure                           | `BOUNDARY_BLOCKED`                                | Bounded retry only if separately classified transient; otherwise reconciliation/operator action | No                                       |
| MP-05 pending                                    | `WAITING_FOR_APPROVAL`                            | Observe existing approval; no worker held and no auto re-request                                | No                                       |
| MP-05 approved                                   | `AUTHORITY_CHECKED` then MP-04 continuation       | Fresh MP-03 is mandatory; then MP-04                                                            | Only through MP-04                       |
| MP-05 rejected                                   | `DENIED`                                          | Terminal                                                                                        | No                                       |
| MP-05 expired/revoked/stale/consumed             | `BLOCKED` / approval expired                      | No automatic retry; a new explicit approval workflow may be created for a new/fresh admission   | No                                       |
| MP-04 `CONFIRMED`                                | `COMPLETED`                                       | Redelivery reads terminal record; no dispatch                                                   | Already occurred once                    |
| MP-04 `ABSENT`                                   | `EFFECT_ABSENT` / terminal                        | No automatic redispatch of the old identity; new request requires fresh admission               | No proven effect                         |
| MP-04 `UNKNOWN`                                  | `RECONCILIATION_REQUIRED`                         | Call MP-04 recovery/reconciliation only; never blind retry                                      | Must not redispatch                      |
| MP-04 `RECOVERY_REQUIRED`                        | `RECONCILIATION_REQUIRED`                         | Use native recovery route                                                                       | Not until native state permits           |
| MP-04 boundary failure before durable identity   | `BOUNDARY_BLOCKED`                                | Bounded construction retry only if safe and explicitly transient                                | No                                       |
| Worker crash before processing                   | queue-visible / `QUEUED`                          | Redelivery with a new delivery ID and same work ID                                              | No effect yet                            |
| Worker crash during processing                   | `PROCESSING` or recovery state                    | Re-read activity, MP-03/MP-05, and MP-04 native state; recover exact identity                   | Only through current authority and MP-04 |
| Redelivery after successful effect/lost response | `COMPLETED` after durable reread                  | Acknowledge/observe terminal state                                                              | No second effect                         |

Retry counters, visibility timeouts, and dead-letter routing are operational controls. They cannot
change an outcome from `DENIED`, `WAITING_FOR_APPROVAL`, `UNKNOWN`, expired, or malformed into an
executable state.

## 7. Approval waiting and timeout

The authoritative approval timeout is the native MP-05/Ananke approval expiry. A queue retention
deadline or visibility timeout is a separate operational fact and must not be treated as approval
expiry or permission.

When native approval expires before continuation:

1. Record `WAITING_FOR_APPROVAL` → `BLOCKED` with an expired/stale approval observation.
2. Do not call MP-04.
3. Do not auto-approve, silently renew, or reuse the expired grant.
4. Do not automatically create a new approval request. A new request requires an explicit
   workflow and a fresh MP-03/MP-05 identity/binding decision.
5. Preserve the original work identity and approval identity as historical evidence, not as new
   authority.

If an approval arrives while multiple workers observe the item, all workers use the native MP-05
durable decision identity and exact semantic rebinding. One continuation may enter MP-04; duplicate
observers receive the existing MP-04 terminal/recovery state. A worker does not stay alive for the
human and does not infer approval from a queue flag, browser response, model text, or an activity
record.

## 8. Activity record

Activity is an explanatory, append-only or checksum-protected observation stream. It is not a
policy store and cannot authorize a later action. The minimum proposed event vocabulary is:

```text
QUEUED
CLAIMED
PROCESSING
AUTHORITY_CHECKED
WAITING_FOR_APPROVAL
DENIED
BOUNDARY_BLOCKED
RETRY_SCHEDULED
RECONCILIATION_REQUIRED
COMPLETED
EFFECT_ABSENT
TERMINAL_FAILURE
```

Each event should contain only bounded, non-secret material:

- event schema/version and monotonic per-work sequence;
- `workId`, `sourceRequestId`, action, and ActionIntent digest reference;
- delivery ID and worker claim generation where relevant;
- native action hash/approval/decision/durable execution references where already available;
- MP-03/MP-04/MP-05 outcome projection;
- trusted observed timestamp supplied by the host;
- dependency/profile reference and evidence references;
- no credentials, provider tokens, raw model prose, or unnecessary personal data.

Activity records explain what the worker observed. They must not be accepted as a replacement for
ActionIntent, native admission, approval state, Horae claim state, or effect truth. MP-07 can later
project these events as “Handled automatically”, “Needs you”, “Blocked”, and “Activity” without
making the UI authoritative.

## 9. Ordering analysis

### Option A — admission → worker claim → approval consumption → executor → ledger

This is unsafe as a generic composition. If approval consumption is a separate step and the
process fails after consumption but before a durable execution reservation or executor start, the
system can lose the ability to continue the one approved action. If the worker claim is treated as
the execution lock, it also duplicates Horae ownership. Option A is acceptable only when “claim”
and consumption are actually one accepted native Fates/Horae transaction; the current MP-06
worker must not assume that.

### Option B — admission → approval consumption → worker claim → executor → ledger

This is rejected. It consumes authority before durable dispatch ownership exists. A crash between
consumption and claim can strand a valid approval, and a worker claim still cannot prove effect
identity or effect truth.

### Option C — admission → scheduling claim → MP-04 native claim-aware continuation → executor → reconciliation

This is the selected composition:

```text
current MP-03 admission
  -> optional MP-05 approval observation/recovery
  -> narrow MP-06 scheduling claim
  -> MP-04 Ananke authority + Horae durable execution claim
  -> native claim-aware Ananke execution choke point
  -> receipt / reconciliation
  -> durable activity outcome
```

The worker claim may be acquired before MP-04 to prevent needless duplicate processing, but it is
not an authority fence. The accepted MP-04 path remains the only place that creates the native
execution identity and claim-aware execution reservation. MP-06 never calls a provider directly.

## 10. Crash and recovery matrix

| Crash point                                                       | Safe state after restart                                   | May retry?                                                                              | Owner of decision                           |
| ----------------------------------------------------------------- | ---------------------------------------------------------- | --------------------------------------------------------------------------------------- | ------------------------------------------- |
| After MP-03 `ADMITTED`, before worker/MP-04 claim                 | No effect; prior admission is stale until revalidated      | Re-read the intent/context and obtain current/fresh MP-03; do not trust cached ALLOW    | MP-03/Ananke; worker only schedules         |
| After worker claim, before MP-04                                  | Claim lease may be reclaimed                               | Yes, same work identity, after exact current validation                                 | MP-06 claim store plus MP-03/MP-04          |
| After MP-04 durable claim, before native reservation/consumption  | Existing Horae record controls recovery                    | Use MP-04 recovery/continuation; do not make a new claim                                | Horae/Ananke                                |
| After native reservation/approval consumption, before executor    | Native claim-aware state is authoritative                  | Only native recovery permits continuation; otherwise `RECOVERY_REQUIRED`/reconciliation | Ananke + Horae                              |
| After executor starts, before confirmed receipt                   | Effect truth is uncertain                                  | No blind redispatch; reconcile exact durable identity                                   | MP-04/Horae/native effect boundary          |
| After effect succeeds, before ledger/receipt write                | `UNKNOWN` unless authoritative receipt exists              | Reconcile; never assume absent and never redispatch blindly                             | MP-04 effect truth boundary                 |
| After durable terminal ledger/activity write, before response/ack | Terminal `CONFIRMED` or `ABSENT` is recoverable            | Read/ack terminal record; no effect call                                                | MP-04/Horae durable record                  |
| Second process recovers while first is active                     | Loser observes claim generation or recovery-required state | No duplicate executor; stale owner cannot continue                                      | Horae claim arbitration and native recovery |

The target invariant is `EFFECT_COUNT <= 1` for one canonical intended effect, subject to the
accepted MP-04 local durability/reconciliation scope. If effect outcome is unknowable, the result
is not converted to a new queue attempt.

## 11. Concurrency and replay acceptance cases

MP-06B/C must implement or explicitly simulate these cases:

| Case                                       | Expected worker behavior                                         | MP-04/effect expectation                                       |
| ------------------------------------------ | ---------------------------------------------------------------- | -------------------------------------------------------------- |
| Two workers receive one item               | One scheduling claim wins; loser exits or observes               | Horae remains the final execution arbiter; effect at most once |
| Same item delivered twice                  | Same `workId`; no new semantic identity                          | Terminal/recovery reread, no duplicate effect                  |
| Redelivery after `CONFIRMED`               | Read durable terminal state                                      | Zero MP-04 dispatch and zero effect calls                      |
| Crash before authority check               | Redeliver same immutable intent                                  | Fresh MP-03 required                                           |
| Crash after authority check before MP-04   | Do not trust old result indefinitely                             | Revalidate/fresh MP-03, then MP-04 if executable               |
| Crash during MP-04                         | Use native Horae recovery                                        | No blind fresh dispatch                                        |
| Response loss after successful effect      | Read durable receipt/terminal state                              | Zero second effect                                             |
| Approval-required redelivery while pending | Observe same MP-05 request; release claim                        | Zero MP-04/effect calls                                        |
| Approval arrives with multiple observers   | Native decision identity and exact rebinding select continuation | Horae/native state prevents duplicate effect                   |
| DENY redelivery                            | Record/read terminal denial                                      | Zero MP-04/effect calls                                        |
| Expired approval redelivery                | Record blocked/expired                                           | Zero MP-04/effect calls                                        |
| MP-04 `UNKNOWN` redelivery                 | Route to recovery/reconciliation                                 | No redispatch                                                  |

## 12. Queue technology decision boundary

MP-06A specifies logical capabilities, not a product choice. A concrete backend must provide:

- at-least-once delivery semantics;
- stable logical work identity and per-delivery identity;
- bounded visibility/lease behavior;
- durable compare-and-set worker ownership or an equivalent claim primitive;
- bounded retry/dead-letter state without changing authority;
- deterministic local concurrency and crash simulation;
- enough observability to correlate queue activity to MP-03, MP-04, and MP-05 evidence.

The initial implementation recommendation is a small deterministic local queue/test backend with
an explicit backend port. It should use no new dependency in MP-06A and no cloud service. MP-06B
can implement an in-process/local durable test double or minimal local persistence appropriate to
the existing one-host Protocol scope, while proving behavior with deterministic fake time and
controlled crash points. AWS SQS, Cloudflare Queues, Redis, or another service may later be an
adapter, but none may become the authority source. MP-08 can evaluate deployment separately.

Unbounded polling, background timers, autonomous model loops, and a cloud queue are explicitly
outside MP-06A.

## 13. Security and adversarial review

| Threat                                 | Required fail-closed control                                                                   |
| -------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Forged queue item                      | Validate work envelope; reload intent by trusted reference; recompute MP-02 identity           |
| Modified ActionIntent after enqueue    | Digest mismatch or immutable-store version mismatch blocks before MP-03/MP-04                  |
| Stale ActionIntent                     | Current trusted record and fresh MP-03 check; no old admission reuse                           |
| Forged worker claim                    | Durable claim CAS, owner/generation check, and no authority semantics in claim                 |
| Queue replay                           | Same `workId` routes to terminal/recovery identity; delivery ID cannot create a new effect     |
| Cross-tenant substitution              | Exact tenant/principal/context/resource binding in MP-03/MP-04; queue metadata mismatch blocks |
| Principal substitution                 | Trusted context and native Fates binding, never queue/model fields                             |
| Target/parameter substitution          | MP-02 digest plus MP-03/MP-04 exact action/argument/resource checks                            |
| Copied approval identity               | MP-05 durable reread, exact semantic binding, expiry/revocation checks                         |
| Stale approval                         | Native MP-05 state and fresh MP-03; expired/revoked state cannot continue                      |
| Queue poisoning                        | Strict schema, bounded payload, trusted enqueue boundary, activity integrity checks            |
| Worker crash loop                      | Bounded delivery/claim retry and terminal/reconciliation state; no authority upgrade           |
| Retry storm                            | Backoff/dead-letter policy is operational only; immutable authority and bounded attempts       |
| Retry-count manipulation               | Retry state is durable backend-owned metadata, not a permission field                          |
| Queue item claims prior ALLOW          | Cached authority is observation only; worker must perform current/fresh checks                 |
| Queue item claims prior effect failure | MP-04 native record/receipt is authoritative; activity cannot force redispatch                 |
| Activity-log poisoning                 | Activity is validated evidence only and cannot authorize work                                  |
| Malicious executor return              | MP-04 requires validated native receipt/reconciliation; return alone is not `CONFIRMED`        |
| Frontend bypass                        | Sol/UI has no direct effect path; MP-06 worker remains behind MP/Fates/MP-04                   |
| Luna bypass                            | Luna is backend reasoning only; it cannot choose queue eligibility, retry, approval, or effect |

The worker must not read credentials, call a model, parse natural language, invoke a provider, or
call an effect adapter as part of queue processing. Models remain proposal/reasoning components
only where an earlier accepted boundary permits them.

## 14. Fates/Horae and Mnemosyne boundaries

No missing Fates capability is required to define the local MP-06 queue contract. MP-06 can be
implemented as a Protocol orchestration layer over the accepted MP-03/MP-04/MP-05 interfaces,
provided the implementation does not reimplement their authority or durable-effect algorithms.

The existing MP-04 implementation is the execution boundary. MP-06 must not move Horae earlier
into admission or use a queue claim as a replacement for Horae's native durable claim. If future
distributed deployment exposes a native limitation, it requires a separate Fates/Horae compatibility
slice; MP-06A does not modify either repository.

The FATES-005D `CONFIRMED`/`ABSENT`/`UNKNOWN` effect-ledger model is reusable as a semantic
requirement, but MP-06 must not copy it or create a second authority ledger. The effect truth
owner remains the accepted MP-04/native effect boundary. Queue activity may project those states
as `COMPLETED`, `EFFECT_ABSENT`, or `RECONCILIATION_REQUIRED`.

Mnemosyne is not required for MP-06. A queue, activity record, or retry counter is ordinary durable
coordination state, not memory authority or provenance admission. Mnemosyne should be considered
only if a later concrete invariant requires independently authoritative provenance, revocation, or
trusted retrieval that MP-04/Fates cannot provide. It must not be added for logging convenience.

## 15. Proposed MP-06 execution envelope

This is a design contract, not a runtime type or accepted dependency manifest. It separates
authority, identity, dispatch, and evidence:

```text
Mp06ExecutionEnvelopeV1 {
  schemaVersion: "mp06-execution-envelope-v1",

  identity: {
    workId,
    sourceRequestId,
    actionIntentDigest,
    actionIntentIdempotencyKey,
    action,
    tenantId,
    correlation: { requestId, correlationId, causationId? }
  },

  intent: {
    immutableRef,
    schemaVersion: "action-intent-v1"
  },

  authorityObservation: {
    mp03Status,
    nativeActionHash?,
    approvalId?,
    approvalDecisionId?,
    observedAt,
    evidenceRef
  },

  dispatch: {
    deliveryId,
    workerClaimId?,
    durableExecutionId?,
    mp04State?
  },

  activity: {
    lastEvent,
    sequence,
    evidenceRefs
  }
}
```

The `authorityObservation` is not executable authority. The actual executable handoff is the
fresh, validated MP-03 `ADMITTED` result passed to MP-04 with the exact ActionIntent and trusted
context. The native action hash and approval/decision references are evidence/binding material
until the accepted native authority path validates them. Credentials are never fields in this
envelope.

## 16. Proposed worker state machine

These are MP-06 scheduling/activity states. Native Fates and MP-04 states remain authoritative for
their own domains.

| State                     | Owner                                             | Execution allowed?                                  | Retry/recovery                                                |
| ------------------------- | ------------------------------------------------- | --------------------------------------------------- | ------------------------------------------------------------- |
| `QUEUED`                  | Queue backend                                     | No                                                  | Claim and process                                             |
| `CLAIMED` / `PROCESSING`  | Worker claim store                                | No by claim alone                                   | Lease recovery if worker dies                                 |
| `AUTHORITY_CHECKED`       | Activity projection                               | Only if fresh MP-03 is executable and MP-04 accepts | Continue through MP-04                                        |
| `WAITING_FOR_APPROVAL`    | MP-05 native state, projected by MP-06            | No                                                  | Observe/recover native approval                               |
| `DENIED`                  | MP-03/Ananke result, projected by queue           | No                                                  | Terminal observation                                          |
| `BOUNDARY_BLOCKED`        | Boundary validator / activity                     | No                                                  | Explicit bounded operational retry or operator reconciliation |
| `RETRY_SCHEDULED`         | Queue backend                                     | No                                                  | Same immutable work identity only                             |
| `RECONCILIATION_REQUIRED` | MP-04/native effect truth                         | No blind redispatch                                 | MP-04 recovery/reconciliation                                 |
| `COMPLETED`               | MP-04 durable terminal result, projected by queue | No second execution                                 | Terminal reread                                               |
| `EFFECT_ABSENT`           | MP-04 authoritative negative result               | No old-identity redispatch                          | New request requires fresh authority                          |
| `TERMINAL_FAILURE`        | Boundary/worker contract                          | No                                                  | Explicit new workflow only                                    |

There is no `AUTO_APPROVED`, `WORKER_AUTHORISED`, or `QUEUE_EXECUTABLE` state. `ALLOW` is a
native governance result and `ADMITTED` is an MP-03 result; neither is a queue-owned state.

## 17. Idempotency and replay model

The four relevant identities have separate guarantees:

1. **MP-02 `idempotencyKey`:** stable Moirae retry/reference identity scoped to the trusted
   inbound `sourceRequestId` and canonical intent digest. It prevents accidental conflation of a
   request retry with a new request; it is not permission.
2. **Ananke native action hash:** identifies the exact authenticated governed operation under the
   relevant Fates profile. It is not the MP-02 digest and is not sufficient without a valid native
   authority/approval state.
3. **Horae/MP-04 durable execution identity:** identifies the exact native effect continuation
   and owns durable claim/recovery/effect-once semantics. The worker must obtain and reuse this
   identity through MP-04, not derive a parallel one.
4. **Future provider idempotency token:** identifies a provider-level attempt where the provider
   supports it. It must be derived/bound by the effect adapter from the MP-04 effect identity and
   never be supplied by a model or queue payload.

For a queue redelivery, the same `workId` and ActionIntent identity are retained while the delivery
identity changes. If MP-04 has created a durable execution identity, recovery uses that identity.
An `UNKNOWN` result remains non-retry until authoritative reconciliation determines `CONFIRMED` or
`ABSENT`.

## 18. Sol/Luna invariant

The future user-facing and judge-facing path is fixed as:

```text
User / Judge
    -> Sol (visible frontend, interaction, demo, WebMCP surface)
    -> Moirae Protocol
    -> deterministic compiler and Fates governance
    -> Horae execution coordination
    -> bounded effects

Luna <-> backend/internal reasoning only, where separately permitted
```

`SOL_FRONTEND_LUNA_BACKEND_PRESERVED` remains binding. Sol and Luna cannot choose queue
eligibility, worker ownership, retry eligibility, approval status, expiry, authority, execution
eligibility, reconciliation, or effect-once state. Neither model may bypass the deterministic
compiler, independent authentication, Fates, or MP-04.

## 19. Proposed implementation slices

The next implementation order is intentionally bounded:

### MP-06B — Deterministic local queue/worker core

Define the versioned logical work envelope, immutable intent loading, scheduling claim port,
activity event port, deterministic local backend, and worker routing for current MP-03 outcomes.
No external provider and no cloud queue.

### MP-06C — Concurrency, crash, and retry hardening

Exercise two-worker races, redelivery, lease recovery, crash injection, terminal replay, explicit
backoff/dead-letter behavior, and MP-04 `UNKNOWN`/recovery routing. Prove `EFFECT_COUNT <= 1` in
the accepted local scope.

### MP-06D — MP-05 approval waiting/recovery integration

Connect queue parking and durable activity to the accepted MP-05 presentation/recovery interfaces.
Cover approval expiry, rejection, revocation/stale state, repeated delivery, fresh MP-03 admission,
and no auto-approval.

### MP-06E — Independent MP-06 acceptance

Independently revalidate the exact candidate, queue/worker identity, authority separation, crash
matrix, replay behavior, approval waiting, denial zero calls, MP-04 recovery, and clean-checkout
evidence. Seal only after the implementation candidate itself passes.

No slice above is started by MP-06A.

## 20. MP-06 acceptance criteria

MP-06 may be accepted only when an exact candidate demonstrates, in the accepted local scope:

1. queue delivery, visibility, worker claims, activity, and retry state cannot create authority;
2. every work item is bound to one validated immutable ActionIntent identity;
3. current/fresh MP-03 admission is required before MP-04 continuation;
4. approval-required work is durably surfaced and does not hold a worker or execute an effect;
5. expired, rejected, revoked, malformed, and unavailable authority fail closed;
6. `DENY` produces zero MP-04/effect calls;
7. MP-04 remains the sole effect-once/durable execution boundary;
8. native `UNKNOWN` never becomes blind redispatch permission;
9. two workers and queue redelivery cannot multiply an effect;
10. crash/restart and response-loss recovery use native durable identity;
11. activity is consistent, bounded, non-secret, and non-authoritative;
12. no model, frontend, queue backend, or worker can bypass MP-02/MP-03/MP-04/MP-05;
13. the local backend is deterministic enough to reproduce concurrency and crash cases;
14. no cloud queue/provider/effect is required for the local acceptance;
15. the implementation makes no distributed or production-general claim without a new acceptance.

## 21. Forbidden behavior and open blockers

Forbidden in MP-06 implementation:

- background authority invention or a worker-owned `ALLOW` flag;
- bypassing ActionIntent validation or fresh MP-03 admission;
- direct calls from a worker to email, calendar, export, HTTP mutation, or any effect adapter;
- a second competing Horae/effect claim;
- automatic approval or automatic renewal after timeout;
- unbounded polling or model-driven autonomous loops;
- treating activity, queue visibility, retry count, or a stale admission as authority;
- blind redispatch after `UNKNOWN`;
- adding Mnemosyne for queue memory/logging convenience;
- adding cloud infrastructure before the local semantic contract is accepted;
- changing Ananke, Horae, Adrasteia, Fates Integration, Firecracker, Moirae Console, or other
  repositories as part of MP-06B.

There is no blocking Fates/Horae architecture defect for the local design. The implementation
must, however, use the existing MP-04/MP-05 public boundaries rather than treating their internal
records as a new queue API. Distributed/cloud deployment and provider idempotency remain future
acceptance questions, not hidden assumptions.

## 22. MP-06A historical readiness decision

```text
MP-06_OPENED
MP-06A_BACKGROUND_LOOP_READINESS_COMPLETE
MP-06_RUNTIME_NOT_IMPLEMENTED
MP-06_NOT_ACCEPTED

HORAE_NOT_REQUIRED_UNTIL_POST_APPROVAL_EXECUTION
MNEMOSYNE_NOT_REQUIRED_FOR_MP05
MNEMOSYNE_NOT_REQUIRED_FOR_MP06A
SOL_FRONTEND_LUNA_BACKEND_PRESERVED
```

At the MP-06A terminal, this readiness decision did not claim that a queue or worker existed,
that background autonomy was active, or that MP-06 was accepted.

## 23. MP-06B implementation candidate facts

The candidate implements only `packages/background-work/src/index.ts` and its focused test
coverage. The local backend is an in-memory, filesystem-independent implementation with a
versioned `QueueWorkV1` envelope, deterministic logical work/claim IDs, compare-and-set
scheduling claims, bounded explicit release, terminal/logical outcome inspection, and a separate
non-authoritative activity sink. It has no external queue dependency and no direct effect API.

The worker loads canonical ActionIntent material and trusted authenticated context through a
`TrustedProtocolBoundary`, recomputes MP-02 digest/idempotency material, verifies source-request
and logical-work bindings, requests current MP-03 admission, and calls the accepted MP-04
`executeAdmittedAction` boundary only for `ADMITTED`. `WAITING_FOR_APPROVAL` is observable without
auto-approval; `REJECTED` becomes `DENIED`; MP-03 boundary failures become `BOUNDARY_BLOCKED`.
Activity and queue outcomes retain references to approval/native/durable identities but never
serve as authority.

Focused synthetic tests cover valid execution, approval waiting, denial zero calls, forged work and
ActionIntent bindings, tenant/context substitution, forged claims, duplicate delivery and logical
work, completed-work replay through MP-04 durable truth, approval redelivery, competing workers,
and activity/prior-admission tampering. No external connector or real effect is used.

At the MP-06B terminal, process-crash handling, lease expiry races, retry budgets and storms,
durable cross-process backends, dead letters, full stress, and MP-04 `UNKNOWN` recovery or
reconciliation were explicitly deferred. MP-06D remains responsible for MP-05 presentation
parking, durable human decision observation, expiry/rejection/revocation recovery, repeated
waiting deliveries, and post-decision fresh MP-03 → MP-04 continuation. MP-06E and MP-06 acceptance
remain unstarted.

## 24. MP-06C implementation candidate facts

MP-06C extends the MP-06B port without widening authority ownership. The candidate now provides a
filesystem-backed local coordination backend, `DurableFilesystemLocalQueue`, with a versioned JSON
state document, a per-store atomic lock file, temporary-file recovery rules, `fsync` plus rename
replacement, and strict schema/identity validation. A malformed, partial, unsupported, or
ambiguous coordination record fails closed; it is never treated as a new empty queue. The backend
stores logical work, delivery state, scheduling claims, lease generations, bounded retry state,
terminal queue outcomes, and MP-04 identity references only. It stores no credentials, provider
secrets, or queue-owned authority.

Scheduling claims are bounded leases. A lease binds the logical work ID, delivery ID, worker ID,
claim ID, generation, state version, injected trusted acquisition time, and injected trusted expiry
time. Compare-and-set arbitration permits one owner per generation. Reclaim is possible only after
trusted expiry, increments the generation, and invalidates the old claim. A stale claim cannot
release, complete, retry, or mutate the reclaimed generation. Lease acquisition, reclaim, retry
count, retry budget, and activity records remain operational state and never become Ananke or
MP-04 authority.

Worker execution remains bounded to one work item per invocation. Deterministic checkpoints cover
claim persistence, current MP-03 admission, the MP-04 boundary, terminal queue persistence, and
retry persistence. A crash after MP-03 `ADMITTED` does not preserve execution authority; recovery
performs current MP-03 again. A response-loss or `UNKNOWN` result becomes
`RECONCILIATION_REQUIRED` and uses the optional accepted MP-04 native recovery port when present.
`CONFIRMED` repairs the queue terminal state without a second effect; `ABSENT` becomes
`EFFECT_ABSENT`; no queue retry blindly redispatches an uncertain execution identity.

Retry classification is explicit and narrow. Only typed pre-authority operational failures can
enter deterministic exponential backoff. Retry budgets and attempts are durable, monotonic, and
shared by duplicate deliveries; duplicate delivery, restart, stale worker state, and activity
mutation cannot reset them. Exhaustion is terminal and redelivery cannot restart the budget.
`DENIED`, `WAITING_FOR_APPROVAL`, malformed state, integrity failure, approval failure, and
MP-04 uncertainty are not generic retry cases. Approval work remains parked/observable without
decision observation or auto-approval; the complete MP-05 approval lifecycle remains MP-06D.

The machine-readable MP-06C evidence distinguishes deterministic unit coverage, durable local
integration coverage, real-Fates regressions, offline guarded skips, and process-level limitations.
The accepted scope is local and deterministic; distributed/cloud queue durability, provider
semantics, dead-letter operations, and full concurrent stress remain outside this slice.

## 25. MP-06D implementation candidate facts

MP-06D composes the accepted MP-05 public boundary rather than copying its native approval
schemas, hashes, presentation binding, semantic/context rebinding, durable reread, decision
identity, expiry, revocation, or post-decision MP-03/MP-04 logic. Initial
`WAITING_FOR_APPROVAL` processing calls MP-05 `prepareApproval`, parks the scheduling claim, and
returns. The worker never waits for a human and never manufactures a decision.

The queue persists only a versioned `QueueApprovalReferenceV1` correlation record containing the
approval identity, optional observed decision identity, descriptive observation state, and trusted
observation time. This record is not approval authority. Every later processing generation rereads
MP-05 through `recoverOrRefresh`; pending work remains parked without consuming retry budget,
while approved recovery receives MP-05's fresh MP-03/MP-04 result. Rejected, expired, revoked,
consumed, missing, malformed, and storage-failure states fail closed without MP-04 or effect
calls. `CONFIRMED`, `UNKNOWN`, and `ABSENT` retain the accepted MP-04 recovery meanings.

The focused MP-06D suite covers all three supported fixture actions, pending redelivery and
restart, approval while no worker is active, stable approval/decision identities, response loss,
semantic and context mutation, cross-action/tool substitution, rejection, expiry, revocation,
consumption, missing/malformed/unreadable native state, crash/reclaim, confirmed repair,
unknown reconciliation, retry-budget separation, forged queue observations, two-worker claim
arbitration, and bounded no-polling behavior. Effects are synthetic only.

Deferred from MP-06D are independent MP-06E end-to-end acceptance, main promotion, and the
MP-06 acceptance tag. The local candidate does not claim product UI integration, cloud/event
wakeups, a second approval ledger, distributed durability, or any replacement for MP-05/FATES-008
native truth. `MNEMOSYNE_NOT_REQUIRED_FOR_MP06D` and `SOL_FRONTEND_LUNA_BACKEND_PRESERVED`.
