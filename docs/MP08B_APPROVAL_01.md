# MP08B APPROVAL-01 — Durable MP-05 Approval and Trusted Host Context

## Scope and status

`MP08B_APPROVAL_01 != MP08B_DEPLOYMENT`

`MP08B_APPROVAL_01 != MP08B_ACCEPTANCE`

`MP08B_APPROVAL_01 != MP09_ACCEPTANCE`

`TRUSTED_LOCAL_OPERATOR_CONTEXT != PUBLIC_AUTHENTICATION`

`APPROVAL != EXECUTION`

`APPROVED != HANDLED_AUTOMATICALLY`

This offline slice crosses exactly one boundary:

```text
real Fates REQUIRE_APPROVAL
  → durable native MP-05 approval record
  → durable host ActionIntent/context binding
  → trusted local operator decision
  → MP-05 validation and durable reread
  → APPROVED or REJECTED
  → STOP before MP-06, MP-04, Horae, and effects
```

MP-08A remains accepted only for its bounded live Strands/Bedrock
characterization. No AWS call, STS call, model call, deployment, or public
authentication was performed here. `MP08B_NOT_DEPLOYED` and
`MP08B_NOT_ACCEPTED` remain the current milestone state.

## Existing MP-05 contract audit

The audit found that MP-05 is a coordinator over native FATES approval truth,
not an independent Moirae approval database. The accepted coordinator is
`Mp05HumanApprovalCoordinator` in
`packages/human-approval/src/index.ts`.

| Capability                                         | Existing truth                                                                             | Classification                      |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------ | ----------------------------------- |
| Approval request/reference                         | Native `approvalId` from FATES, carried by `WAITING_FOR_APPROVAL`                          | `IMPLEMENTED_RUNTIME`               |
| Action/intent binding                              | Native action hash plus canonical ActionIntent digest/idempotency and exact context checks | `IMPLEMENTED_RUNTIME`               |
| Presentation binding                               | FATES-008A presentation version and native presentation-binding hash                       | `IMPLEMENTED_RUNTIME`               |
| Pending/approved/rejected/expired/revoked/consumed | Native FATES approval state, reread before and after decisions                             | `IMPLEMENTED_RUNTIME`               |
| Decision identity                                  | Native stable `decisionId`                                                                 | `IMPLEMENTED_RUNTIME`               |
| Replay/conflict protection                         | Native idempotent/conflict outcomes plus MP-05 result checks                               | `IMPLEMENTED_RUNTIME`               |
| Trusted time                                       | Injected `Mp05TrustedTimeSource`                                                           | `IMPLEMENTED_LIBRARY`               |
| Native storage                                     | FATES-008A `SqliteActionApprovalStore` with `durable: true`                                | `DURABLE`                           |
| Moirae request recovery binding                    | New host-owned atomic JSON binding store in this slice                                     | `DURABLE`                           |
| MP-06 queue/worker                                 | Not connected                                                                              | `MISSING` for this slice            |
| MP-04/Horae continuation                           | Existing library boundary, deliberately not called                                         | `IMPLEMENTED_LIBRARY`, not composed |

The MP-05 coordinator requires the accepted FATES-008A provenance and native
port. It validates strict `HumanDecisionEnvelopeV1`, rereads native state,
re-derives native hashes, checks the exact ActionIntent/context binding, calls
the native decision operation, and rereads native truth again. The existing
`submitDecision` behavior remains unchanged for the later execution path.

This slice adds `submitDecisionOnly`, which reuses that same validation path
but returns after the durable MP-05 decision reread. It exists so Approval-01
cannot enter the MP-04 execution callback by accident.

## Trusted host context

The accepted MP-03 context is already a strict host-owned fixture context. For
the human decision itself, Approval-01 uses a server-instantiated
`TRUSTED_LOCAL_OPERATOR_CONTEXT`:

```text
operatorId = moirae-local-operator
sessionId = moirae-local-operator-session
```

The value is supplied as a host dependency to the application runtime. No
browser field, hidden input, request header, or model output can replace it.
This is deliberately local/test operator context, not a production
authentication claim and not AWS IAM authority. A later hosted slice must
replace it with an independently authenticated host context before public
decision access.

## Verified durable materialization

The existing FATES-01 FATES-006B materialization remains the admission-only
runtime history. Approval-01 materializes the accepted FATES-008A runtime
because the accepted MP-05 contract and durable approval store belong to that
provenance-pinned runtime.

| Field                 | Verified value                                                     |
| --------------------- | ------------------------------------------------------------------ |
| Repository            | `https://github.com/hourwise/Project-Ananke.git`                   |
| Accepted tag          | `ananke-fates-008a-durable-human-approval-v0.1.0-protocol-1.4.0`   |
| Tag object            | `0fa08f78f27e2f79c895402f3f53a8aada5837b4`                         |
| Commit                | `b888d61adf180d33e2ae2e61d276cb9b0f13bd12`                         |
| Tree                  | `ed5e268e6b3b0630a798b9131341a2c13ef9830f`                         |
| Runtime ancestor      | `c89b83de40ed0275969fe3931220f440bf082aa3`                         |
| License               | MIT                                                                |
| Local materialization | Verified external checkout with built runtime and `better-sqlite3` |

The runtime verifies origin, clean state, tag object, peeled commit, tree,
runtime ancestry, required built files, and the native SQLite runtime before
importing the gateway. If verification fails, no test adapter is selected.

`REAL_FATES_UNAVAILABLE DOES NOT FALL BACK TO TEST_ADAPTER`.

No Fates source, package, generated artifact, or lockfile was copied into
Moirae. The Ananke checkout is read-only.

## Durability mechanism

Two complementary records are required:

1. Native FATES-008A owns approval truth in its explicitly required
   `SqliteActionApprovalStore`. It persists pending and terminal states,
   revisions, native decision identity, operator identity/session, expiry,
   presentation binding, replay outcomes, and audit rows.
2. Moirae stores a bounded immutable correlation record in
   `Mp08bDurableApprovalBindingStore`. This preserves the exact
   `ActionIntentV1`, host MP-03 context, and waiting admission needed to
   regenerate the MP-05 presentation after restart. It is checksum-bound and
   is not consulted as approval truth; native FATES remains authoritative for
   status and decisions.

Both paths use temporary-directory test state in validation. No mutable
approval state is committed to the repository. Atomic host binding writes and
strict schema/checksum rereads fail closed on malformed state.

## Decision transport

The new application-level runtime is in
`apps/host/src/approval-runtime.ts`. It exposes:

- `prepareApproval`: runs the existing proposal → compiler → MP-03 adapter,
  requires native `REQUIRE_APPROVAL`, prepares the exact MP-05 presentation,
  then persists the host correlation binding;
- `refreshApproval`: reconstructs a presentation from the durable host
  binding and rereads native FATES state;
- `submitDecision`: accepts only the strict existing
  `HumanDecisionEnvelopeV1` and uses the server-owned trusted operator context;
  it delegates to `submitDecisionOnly` and stops after the native durable
  reread.

No HTTP route was repurposed and no browser-facing authority route was added.
The existing synthetic `/mp07/decision` route remains synthetic and separate.
The decision envelope contains only the accepted approval reference, decision,
presentation digest, and native presentation-binding hash. It cannot supply an
operator, ActionIntent, action parameters, expiry, native hash, Fates result,
execution identity, or effect result.

## Binding and state transitions

The runtime requires all of the following before a decision is accepted:

- durable host binding exists for the approval ID;
- the stored ActionIntent and MP-03 context pass their schemas and checksum;
- native FATES approval exists and is exactly bound to the stored action/context;
- native presentation binding derives correctly;
- the submitted envelope is strict and matches the current presentation;
- trusted host time is valid and current;
- the native state is still decisionable;
- FATES applies or idempotently recognizes the decision;
- a fresh native reread confirms the exact state and stable decision identity.

Expired, revoked, consumed, rejected, missing, malformed, cross-action, stale,
or conflicting state fails closed. A second identical decision is native
idempotency; a conflicting decision is native conflict. No replacement approval
is fabricated.

## Capability state

The composed Approval-01 runtime reports:

| Capability           | Value                                      | Meaning                                                               |
| -------------------- | ------------------------------------------ | --------------------------------------------------------------------- |
| `liveFates`          | `true`                                     | Exact FATES-008A runtime verified and initialized                     |
| `liveStrands`        | supplied dependency fact; `false` in tests | No model call was made                                                |
| `durableApproval`    | `true`                                     | Native SQLite approval plus durable host binding passed restart tests |
| `hostedDurableQueue` | `false`                                    | No MP-06 queue or worker composition                                  |
| `externalEffects`    | `false`                                    | No MP-04/Horae/provider path                                          |

The existing `npm run start` server remains `SYNTHETIC_LOCAL_DEMO` with its
previous capability descriptor. Approval-01 does not relabel that launcher.

## MP-07 projection boundary

Before a decision, the native state is equivalent to
`WAITING_FOR_APPROVAL` and can support `NEEDS_YOU` only when a future trusted
MP-07 state provider supplies the corresponding durable queue/product
observation. This slice does not compose that provider or change the browser.

After an APPROVE decision, the truthful state is:

```text
APPROVED_NOT_HANDLED_AUTOMATICALLY
```

Approval has not started a queue, worker, execution coordinator, Horae record,
or effect. The result must not be projected as `HANDLED_AUTOMATICALLY`.
REJECT remains a durable rejected MP-05 state and does not create retry or
execution permission.

## Local evidence

The focused Approval-01 tests use deterministic AgentProposalV1 fixtures and
the read-only FATES-008A checkout. They exercise all three supported actions,
pending recovery after a reconstructed runtime, APPROVE and REJECT, strict
browser-envelope rejection, stale binding rejection, missing host binding,
native idempotent replay after restart, and the no-fallback missing-runtime
path.

The local chain is:

```text
fixture AgentProposalV1
  → strict validation
  → deterministic MP-02 compiler
  → MP-03 mapping/integrity validation
  → real FATES-008A REQUIRE_APPROVAL
  → durable native MP-05 approval
  → durable host binding
  → trusted local operator APPROVE/REJECT
  → native durable reread
  → STOP
```

No AWS, model inference, queue, worker, MP-04, Horae, or effect call occurs.

## Preserved security boundaries

- `MODEL_OUTPUT_NOT_AUTHORITY`
- `FATES_DECISION_NOT_MODEL_DECISION`
- `BROWSER_STATE_NOT_AUTHORITY`
- `IAM_NOT_FATES_AUTHORITY`
- `TRUSTED_HOST_CONTEXT_PRESERVED`
- `APPROVAL_NOT_EXECUTION`
- `ADMITTED_NOT_HANDLED_AUTOMATICALLY`
- `NO_TEST_FALLBACK`
- `UNKNOWN_INVALID_INCONSISTENT_FAIL_CLOSED`
- `SYNTHETIC_NOT_LIVE`

## Next unavailable boundary

`FIRST_UNAVAILABLE_BOUNDARY = DURABLE_MP06_QUEUE_AND_WORKER`.

The immediate next slice must connect an approved/rejected MP-05 state to the
accepted MP-06 durable queue/worker contract without turning approval into
execution permission. MP-04/Horae and external effects remain later
boundaries. They are not implemented here.

### Queue-01 follow-on state

The queue boundary identified above was crossed in the separately bounded
Queue-01 slice. A fresh native MP-05 APPROVED reread now admits an exact
ActionIntent into the accepted local filesystem MP-06 queue, and a bounded
worker can persist a claim and lease before returning `READY_FOR_MP04`. Queue
state remains local durable, not hosted durable. The worker does not invoke
MP-04, Horae, or an effect, and queued or claimed work is not
`HANDLED_AUTOMATICALLY`.

The current next unavailable boundary is
`POST_APPROVAL_MP04_HORAE_EXECUTION_AND_RECONCILIATION`.

## Classification

```text
MOIRAE_MP08B_APPROVAL_01_COMPLETE
DURABLE_MP05_APPROVAL_READY
TRUSTED_HOST_CONTEXT_READY
REAL_FATES_TO_APPROVAL_PATH_READY
APPROVAL_RESTART_DURABILITY_PASS
APPROVAL_NOT_EXECUTION_PRESERVED
MP08A_ACCEPTED
MP08B_NOT_DEPLOYED
MP08B_NOT_ACCEPTED
MP09_NOT_ACCEPTED
NO_AWS_CALLS
NO_DEPLOYMENT
NO_PUBLICATION
```

### Execution-01 follow-on state

Execution-01 adds no approval semantics. It rereads the durable APPROVED
record, preserves its decision identity, and requests the existing MP-03
ADMITTED handoff before entering MP-04. Approval remains distinct from queue,
execution, and effect truth. The current next unavailable boundary is
`REAL_EXTERNAL_EFFECT_PROVIDER`.
