# MP-04D — Durable Execution Boundary Design and Horae Readiness

**Status:** Historical MP-04D design/readiness record. The bounded Protocol implementation that
follows this design is documented separately in `docs/MP-04_DURABLE_EXECUTION.md`; this record is
preserved as the design input and is not an acceptance seal.

**Decision:** `MP-04 DESIGN READY — HORAE NEEDS_BOUNDED_EXTENSION`

**Mnemosyne:** `NOT_REQUIRED_FOR_MP04`

**Model-facing invariant:** `SOL_FRONTEND_LUNA_BACKEND_RECORDED`

This document records the independent design review following accepted MP-03. It defines the
minimum trusted execution architecture that was subsequently implemented as a synthetic/offline
Protocol coordinator and must still be independently accepted before any real effect adapter is
introduced. The design review itself added no Horae, Ananke, Mnemosyne, provider, frontend, or
execution code to Moirae Protocol.

## 1. Inspection baseline

The Moirae Protocol checkout inspected for this design was:

| Repository                    | Path                                          | Branch                                            | HEAD                                       | Worktree                                                                             | Remote                                                      |
| ----------------------------- | --------------------------------------------- | ------------------------------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------ | ----------------------------------------------------------- |
| Moirae Protocol               | `D:\\Users\\fleur\\Moirae Protocol`           | `codex/mp03-fates-admission-adapter`              | `310a56c02dadd1ee88050da6edb98f7ab4b57661` | clean; no staged or untracked files                                                  | none                                                        |
| Accepted Ananke checkout      | `D:\\Users\\fleur\\ananke-fates-006b`         | `codex/fates-006b-moirae-admin-operation-profile` | `6bf8902c55c4f3f7593a987582b50783c8a7b5a0` | clean                                                                                | `https://github.com/hourwise/Project-Ananke.git`            |
| Runtime Contracts / Adrasteia | `D:\\Users\\fleur\\Project Runtime Contracts` | `release/webmcp-runtime-v0.6.2`                   | `a1c01bf9e6f9d6a126cfdcc1acfacd488b214210` | clean                                                                                | `https://github.com/hourwise/Project-Adrasteia.git`         |
| Fates Integration             | `D:\\Users\\fleur\\Project-Fates-Integration` | `codex/fates-005a-integration-implementation`     | `c117a5c1d8744d7847447f86492d1f30a26d319c` | clean                                                                                | `https://github.com/hourwise/Project-Fates-Integration.git` |
| Horae                         | `D:\\Users\\fleur\\Project Horae`             | `codex/fates-005d-r1-durable-dispatch`            | `68508f5c37e1cb3b244116d45fa267e689a6e75c` | clean                                                                                | `https://github.com/hourwise/Project-Horae.git`             |
| Mnemosyne                     | `D:\\Users\\fleur\\Project Mnemosyne`         | `codex/fates-005d-durable-governance`             | `f02df61be147d6fe716a98912d37eaaf1fe89f23` | clean                                                                                | `https://github.com/hourwise/Project-Mnemosyne.git`         |
| Moirae Code                   | `D:\\Users\\fleur\\Project Moirae Code`       | `codex/fates-005a-moirae-implementation`          | `8e8502aef13e5940fd14865449be422e057fb0f7` | clean                                                                                | `https://github.com/hourwise/Project-Moirae-Code.git`       |
| Moirae Console                | `D:\\Users\\fleur\\Moirae-Console`            | `main`                                            | `893ef94fa0dfad3606bd83e8b46351210cfc0d51` | tracked files clean; pre-existing untracked `.devpost-hackathon-state.json` retained | `https://github.com/hourwise/Moirae-Console.git`            |

Moirae Protocol's accepted annotated tag remains `moirae-protocol-mp03-fates-admission-v0.1.0`,
tag object `d2ae9289df3341af3c7e0ae8c182bd38763f2a52`, pointing to runtime candidate
`ad841c81237d445f71f427af88d93482fe629779`. There is no Moirae remote, so no publication was
attempted. The accepted MP-03 dependency profile remains:

- Ananke tag `ananke-fates-006b-mp03-admission-v0.1.0-protocol-1.4.0`;
- Ananke tag object `6425d4b34fba62ab60381a4a2237786d0d6173ad`;
- Ananke peeled commit `6bf8902c55c4f3f7593a987582b50783c8a7b5a0`;
- FATES-006A provenance boundary `fc318663cbed3072128355fb3697e7f2b47f5f11`;
- Runtime Contracts / Adrasteia `a1c01bf9e6f9d6a126cfdcc1acfacd488b214210`.

The FATES-005A frozen ref remains `fates-005a-firecracker-r7-integration-frozen`, with tag object
`f817d98b222b4ddf417ace68384fa16b3f0c6aff` and peeled target
`c117a5c1d8744d7847447f86492d1f30a26d319c`. Its candidate manifest and recorded hashes were not
changed. Firecracker Attempt 007 remains unused.

## 2. Readiness conclusion

The current Horae candidate is useful and materially ahead of a blank execution coordinator. It
provides durable schema v2 records, explicit lifecycle transitions, a cross-process filesystem claim,
single-dispatch arbitration, recovery-required behavior, and a `CONFIRMED`/`ABSENT`/`UNKNOWN`
reconciliation model. It is not ready to pin as an MP-04 runtime dependency as-is.

The reason is an interface and authority-binding gap, not a failure of the durable-dispatch idea.
Horae's current public request and binding surfaces do not carry the complete accepted Ananke
authority envelope. In particular, they do not type and bind the native Ananke action hash, approval
grant ID, approval action hash, approval expiry, represented principal, exact server/tool/version,
policy version, and the complete native scope/purpose/correlation material needed to prove that the
claim is for the exact admitted operation. Its `GovernedAnankeBinding` is a preflight port, not a
claim-aware Fates execution handoff.

Therefore the appropriate result is:

> **MP-04 DESIGN READY — HORAE NEEDS_BOUNDED_EXTENSION**

The next slice should extend and independently accept the compatibility boundary. It should not
generalize the current fixture profile or add external providers.

## 3. What crosses MP-03 into MP-04

Only a successful MP-03 admission may produce an executable candidate. A
`WAITING_FOR_APPROVAL` result is a pending governance result, not an execution envelope. A
`BOUNDARY_FAILURE` is not a policy denial and cannot be retried as if it were authority.

The minimum proposed cross-boundary material is separated into four domains:

### Authority

- native Ananke decision `ALLOW` from `Gateway.admit(...)`;
- native Ananke action hash;
- approval/grant ID, when the accepted policy path required approval;
- approval action hash and approval expiry;
- admission audit/reference ID and explicit trusted admission time;
- native policy version and exact operation binding.

`ADMITTED` means only that Ananke returned a valid admission result with `ALLOW`. It does not mean
that an external effect occurred, that approval has been consumed, or that a future executor may be
called without revalidation.

### Authenticated identity and governed material

- authenticated workload/server principal;
- acting-agent principal;
- represented/requester principal;
- tenant, runtime, runtime instance, session, request, correlation, and causation identity;
- exact resource scope and purpose;
- exact registered server, tool, version, and action arguments;
- a digest of the exact governed arguments where a protected material reference is used.

These values are supplied by an independently authenticated host/Fates context or the accepted
registry. They cannot be supplied by `AgentProposalV1`, model prose, a summary, or an approval
string. Credentials remain outside the envelope.

### Moirae and dispatch identity

- MP-02 `sourceRequestId`, `canonicalDigest`, and `idempotencyKey` as provenance and retry evidence;
- the MP action discriminator and factual effect class;
- a proposed Horae `durableExecutionId` and claim binding digest/version.

The MP-02 digest and idempotency key do not grant authority and are not Ananke hashes. Explanatory
proposal summary, confidence prose, and the original natural-language request are not execution
material.

### Evidence

- references to MP-03 admission evidence and the accepted dependency profile;
- Fates audit/evaluation references;
- claim and effect-reconciliation evidence references;
- explicit `executorInvoked` and `effectExecuted` facts.

Evidence explains the transition; it does not upgrade a pending, expired, malformed, or rejected
result into authority.

## 4. Proposed `Mp04ExecutionEnvelopeV1`

This is a design contract, not an implemented or accepted wire schema:

```text
Mp04ExecutionEnvelopeV1 {
  schemaVersion: "mp04-execution-envelope-v1",

  moirae: {
    sourceRequestId,
    canonicalDigest,
    idempotencyKey,
    action: "SEND_APPOINTMENT_DETAILS"
          | "RESCHEDULE_APPOINTMENT"
          | "TRANSMIT_CUSTOMER_CONTACT_DIRECTORY"
  },

  authority: {
    nativeActionHash,
    approvalGrantId,
    approvalActionHash,
    approvalExpiresAt,
    decision: "ALLOW",
    admissionAuditId,
    admittedAt,
    policyVersion
  },

  governedOperation: {
    server,
    toolName,
    version,
    exactArguments,
    argumentsDigest
  },

  authenticatedContext: {
    authenticatedPrincipal,
    actingPrincipal,
    representedPrincipal,
    tenantId,
    runtimeId,
    runtimeInstanceId,
    sessionId,
    requestId,
    correlationId,
    causationId,
    resourceScope,
    purpose
  },

  dispatch: {
    durableExecutionId,
    claimBindingDigest,
    claimGeneration
  },

  effect: {
    effectClass: "DISCLOSE" | "MODIFY" | "EXPORT",
    effectId,
    adapterId,
    adapterVersion,
    providerIdempotencyMode
  },

  evidenceRefs: {
    moiraeAdmissionEvidence,
    fatesAdmissionAudit,
    dependencyProfile
  }
}
```

`exactArguments` means the exact validated governed argument material, not model prose and not
credentials. A production implementation may store the arguments in a protected local record and
carry a stable reference plus `argumentsDigest`, provided the Fates execution choke point can
revalidate the exact bytes. The envelope deliberately does not contain a generic task ID, a
caller-supplied native hash, an approval claim without its binding, or an effect result asserted by
an untrusted executor.

## 5. Ananke semantics and authority handoff

The accepted Ananke checkpoint exposes two distinct operations:

1. `Gateway.admit(operation, args, { executionContext, now, approvalId? })` validates the exact
   registered operation, arguments, context, time, policy, and optional approval. It computes the
   native action hash and returns an admission-only result. The result carries
   `authority: "admission-only"`, and the accepted profile reports `executorInvoked=false` and
   `effectExecuted=false`.
2. `Gateway.execute(toolName, args, options)` validates the operation and approval, invokes the
   registered executor through Ananke's execution path, records outcome/audit material, and then
   consumes the approval at the end of the current implementation.

For the accepted approval engine, ordinary approval grants are held in an in-memory process-local
store. The Ananke durable effect coordinator is a bounded local receipt-sink path, not a complete
Horae/MP-03 cross-runtime execution protocol. This makes the current `Gateway.execute(...)` useful as
the eventual final choke point, but not safely composable with Horae without a bounded extension.

An `ADMITTED` result leaves a valid approval unused. The current admission call does not consume it.
The current execute path consumes after executor invocation and outcome audit. That ordering has a
provider-effect/process-crash window and cannot be treated as an atomic Horae claim. Any future
execution slice must preserve native exact operation/argument/context revalidation and must make the
claim/authority/effect crash semantics explicit.

## 6. Ownership matrix

| Responsibility                               | Sole owner in the proposed design                                                                                                                  | Boundary rule                                                                                                                   |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Policy admission                             | Ananke `Gateway.admit(...)`                                                                                                                        | MP cannot create or infer a policy decision.                                                                                    |
| Approval validity, expiry, and exact binding | Ananke approval engine/store                                                                                                                       | Grant, action hash, operation, arguments, context, and expiry must match.                                                       |
| Approval consumption                         | Ananke execution/authority path                                                                                                                    | Horae must not mark a grant consumed locally.                                                                                   |
| Durable execution record and claim           | Horae                                                                                                                                              | Horae arbitrates cross-process ownership and persists lifecycle state.                                                          |
| Executor dispatch                            | Horae-owned dispatch invoking the Fates choke point                                                                                                | Only the durable claim owner may attempt dispatch.                                                                              |
| Final execution choke point                  | Ananke `Gateway.execute(...)`, evolved to accept a validated claim/execution envelope                                                              | No direct Horae-to-provider bypass.                                                                                             |
| Effect truth                                 | A bounded effect receipt/reconciliation component, preferably the Ananke durable effect consumer where its contract is extended to the MP envelope | Only authenticated provider receipt or deterministic reconciliation can produce `CONFIRMED`/`ABSENT`; uncertainty is `UNKNOWN`. |
| Recovery decision                            | Horae, using authoritative effect reconciliation and Ananke revalidation                                                                           | Horae may schedule/retry a proven-absent operation only with fresh valid authority; it cannot guess.                            |
| Moirae provenance                            | MP-03 adapter                                                                                                                                      | Moirae hashes and evidence remain visible but do not replace native Fates authority.                                            |

This avoids dual ownership: Ananke owns authority; Horae owns durable dispatch coordination; the
effect boundary owns effect truth.

## 7. Safe ordering analysis

### Option A — admit → Horae claim → consume → executor → ledger

This is safe only if Ananke provides an atomic or claim-aware consume/execution operation bound to the
Horae claim. With the current public API, there is no safe consume-only step that reserves authority
against a durable Horae claim. A crash after consumption but before invocation can leave authority
spent with no effect and no durable cross-component fact about whether invocation began. Option A is
therefore not safe as a sequence of independent current APIs.

### Option B — admit → consume → Horae claim → executor → ledger

This is unsafe. A process can consume valid authority and crash before acquiring the durable claim.
The next process sees no usable grant, while the effect may not have been attempted. It also makes
Ananke consumption responsible for a dispatch fact it cannot observe. Option B is rejected.

### Option C — admit → Horae claim bound to Ananke material → claim-aware Fates execution → ledger

This is the preferred architecture. Horae first persists and atomically claims a durable execution
identity bound to the complete Ananke operation, action hash, approval binding, principal/context,
scope, purpose, request/correlation identity, and exact arguments. The claim owner then enters an
Ananke claim-aware execution/receipt path that revalidates approval, expiry, hash, context, and claim
binding before reaching the registered executor. Ananke remains responsible for consumption and
native audit; the effect boundary remains responsible for receipt/reconciliation.

Option C requires a bounded Ananke/Fates execution slice and a bounded Horae typed compatibility
extension. It is the only option that gives both systems a clear owner without pretending a
distributed transaction exists.

## 8. Crash and recovery matrix

| Crash point                                                  | Safe result                                                            | Retry/dispatch rule                                                                                                                                                                 | Authority/evidence owner                            |
| ------------------------------------------------------------ | ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| After MP-03 `ADMITTED`, before Horae claim                   | No effect and no dispatch                                              | Recreate the same envelope only while native authority is valid. If expired or lost on restart, obtain fresh admission/approval.                                                    | Ananke admission result; no Horae claim yet         |
| After Horae claim, before authority revalidation/consumption | Claim is durable; no effect is assumed                                 | Only the live claim owner may continue. Recovery must revalidate exact grant/context/expiry; an expired or invalid grant requires recovery/fresh admission, not a substitute grant. | Horae claim plus Ananke validity                    |
| After authority consumption, before executor                 | Current Ananke API does not expose this as a safe independent boundary | Treat the authority instance as spent. Do not silently retry; prove no invocation if the future Fates slice can do so, otherwise `UNKNOWN`/`RECOVERY_REQUIRED` and fresh authority. | Ananke consumption audit plus effect reconciliation |
| After executor starts, before confirmed effect               | Outcome is unknown                                                     | No blind redispatch. Reconcile using the provider/effect identity; only proven `ABSENT` can lead to a new authorized attempt.                                                       | Effect receipt/reconciler; Horae recovery state     |
| After effect succeeds, before ledger write                   | Outcome is unknown until reconciled                                    | Query/reconcile by stable provider token or authoritative status. Never send a second effect based only on timeout.                                                                 | Provider receipt/reconciler                         |
| After ledger write, before response                          | Durable terminal/effect state exists                                   | Return the stored result; no second effect.                                                                                                                                         | Effect ledger and Horae record                      |
| During recovery by a second process                          | One claim owner/recovery worker proceeds                               | Horae cross-process claim arbitration permits one dispatch/recovery owner. Losing callers receive recovery-required or the stored terminal result.                                  | Horae durable store, then effect reconciler         |

`UNKNOWN` is a safety state, not a transient permission to retry. Missing, replaced, corrupt, or
unverifiable effect evidence must remain `UNKNOWN` and block redispatch.

## 9. Durable execution identity and idempotency

The proposed Horae identity is not a generic task ID and is not any one existing hash:

```text
durableExecutionId = SHA-256(
  "moirae-protocol/durable-execution/v1\\0" +
  canonical({
    sourceRequestId,
    moiraeIdempotencyKey,
    anankeNativeActionHash,
    operation: { server, toolName, version },
    exactAuthenticatedContextBinding,
    resourceScope,
    purpose,
    argumentsDigest,
    effectAdapterId,
    effectAdapterVersion
  })
)
```

The actual accepted implementation must define its byte-level canonicalization and domain marker.
The dispatch identity excludes `approvalGrantId` and expiry so that a reissued approval for the same
unexecuted trusted request does not accidentally create a second effect identity. A separate
`authorityInstanceId`/authority binding must include the grant ID, approval action hash, expiry, and
operator/session binding when required by Ananke. Thus:

- MP-02 `idempotencyKey` is a source-request-scoped retry/reference identity for compiled Moirae
  material. It is not permission and does not prove an effect was attempted.
- Ananke native action hash identifies the exact authenticated governed operation. The approval
  action hash additionally binds the approval validity material, including expiry as required by
  Ananke.
- Horae `durableExecutionId` identifies one durable effect-attempt coordination instance across
  races and recoveries.
- A future external provider idempotency token is provider-scoped and should be derived from the
  durable execution identity plus an adapter version. It must not be used as a substitute for
  Ananke authority or Horae claim ownership.

Changing principal, acting agent, represented requester, tenant, runtime/session, scope, purpose,
operation, version, target, arguments, or required request/correlation bindings must change native
governed material or fail closed. Changing only explanatory summary must not.

## 10. Effect ledger and provider requirements

The FATES-005D `CONFIRMED` / `ABSENT` / `UNKNOWN` model should be reused conceptually, not imported
as an MP-04 dependency. The authoritative effect state belongs at the effect receipt/reconciliation
boundary. Horae should persist and project that state into its durable lifecycle, but should not
invent it from an executor return value or local optimism.

The minimum rules are:

- `CONFIRMED`: authenticated provider receipt/status proves the exact effect identity and governed
  target; no retry.
- `ABSENT`: authoritative reconciliation proves the effect did not occur; a future attempt requires
  a fresh valid Ananke authority and a new claim transition as appropriate.
- `UNKNOWN`: the system cannot prove either outcome; no blind redispatch and explicit recovery or
  human intervention is required.

A later email, calendar, or directory adapter must use provider-level idempotency where the provider
supports it. When no idempotency token exists, it must offer deterministic status lookup or accept
that an uncertain timeout becomes `UNKNOWN` and blocks automatic redispatch. No provider is
implemented in MP-04D.

## 11. Horae readiness and required bounded work

**Current Horae classification: `NEEDS_BOUNDED_EXTENSION`.**

Useful as-is:

- durable schema v2 and checksummed local persistence;
- atomic local lock-directory claim and cross-process arbitration;
- explicit `recovery_required` state;
- single executor-attempt behavior for a claimed record;
- reconciler-driven `CONFIRMED`/`ABSENT`/`UNKNOWN` behavior;
- tests for races, crashes, corruption, changed binding, and no-reconciler safety.

Required before pinning it in MP-04:

1. Add a typed MP-04 compatibility envelope that binds the full native Ananke authority material,
   exact operation/version/arguments, authenticated principals/context, scope, purpose, and
   request/correlation identity.
2. Make the claim digest and durable execution identity include the authority/context material;
   passing only `idempotencyKey` or a task ID is insufficient.
3. Expose a claim-owner/claim-generation handoff to the Fates execution choke point, with stale-owner
   rejection and explicit recovery state.
4. Define how Horae records Ananke revalidation, consumption, and effect-reconciliation evidence
   without locally claiming to consume approval.
5. Independently test persistence/locking guarantees at the supported deployment boundary. The
   current local filesystem store does not claim distributed-database, multi-host, or power-loss
   durability.

The existing `GovernedAnankeBinding`/`GovernedExecutor` ports are not enough for this handoff, and the
current Horae candidate must not be silently relabelled `READY_AS_IS`.

If Horae becomes part of the trusted MP runtime, it needs its own acceptance seal. The next sequence
is:

```text
Horae 68508f5...
  -> bounded typed MP-04 compatibility/claim extension
  -> independent Horae acceptance
  -> immutable accepted Horae ref/tag
  -> MP-04 dependency lock
```

This design task creates no Horae ref or MP-04 dependency lock.

## 12. Required Ananke/Fates-side slice

Accepted Ananke is sufficient for the MP-03 admission boundary but not for the safe composed
execution boundary. The narrowest next Fates-side slice should:

- make approval state durable or explicitly restart-safe for the supported runtime boundary;
- expose a claim-aware execution API, such as an `executeClaimed` boundary, without bypassing the
  native `Gateway.execute(...)` choke point;
- require a validated Horae claim token/digest and owner/generation;
- revalidate operation, exact arguments, native action hash, approval action hash, expiry, all
  principal/context bindings, resource scope, purpose, policy version, and request/correlation
  identity at execution time;
- define whether authority consumption is part of the claim-aware Fates operation, and record the
  crash semantics around consumption and executor invocation;
- bind effect receipt/reconciliation identity to the native action hash, authority instance, exact
  target/arguments, and Horae durable execution ID;
- preserve `Gateway.execute(...)` as the only registered executor choke point and keep
  `executorInvoked`/effect evidence explicit.

The existing Ananke durable receipt-sink coordinator is relevant prior art for provider idempotency,
receipt validation, and unknown outcomes, but its current bounded local contract is not by itself a
complete MP-04 composition. It should be evaluated as an implementation substrate in that separate
slice rather than copied into Moirae.

## 13. Proposed state machine

The implementation should reuse existing Horae lifecycle terms where possible and expose MP-04
aliases only at the protocol boundary:

| State                                                  | Owner                                         | May execute?                                           | Retry/recovery rule                                                      | Human intervention                          |
| ------------------------------------------------------ | --------------------------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------ | ------------------------------------------- |
| `WAITING_FOR_APPROVAL`                                 | Ananke authority result                       | No                                                     | Await the exact grant; expired/mismatched grant requires fresh admission | Only if policy requires it                  |
| `ADMISSION_CONFIRMED` / Horae `admitted`               | Ananke, relayed by MP/Horae                   | No                                                     | Create one envelope while authority is valid                             | No, unless revalidation fails               |
| `CLAIM_PENDING` / `execution_intent_recorded`          | Horae                                         | No                                                     | One durable claim attempt                                                | No                                          |
| `CLAIMED`                                              | Horae                                         | Only the current claim owner may enter Fates execution | Stale/lost owner must not dispatch; recovery arbitrates a new owner      | Only on unresolved recovery                 |
| `EXECUTION_STARTED` / `executing` + `effect_attempted` | Ananke choke point and Horae record           | The one registered attempt may be in flight            | No automatic duplicate; reconcile after interruption                     | If reconciliation cannot decide             |
| `EFFECT_CONFIRMED`                                     | Effect receipt/reconciler                     | No                                                     | Terminal effect fact; complete bookkeeping                               | No                                          |
| `EFFECT_ABSENT`                                        | Effect receipt/reconciler                     | No until fresh authority and an explicitly new attempt | A new authorized attempt may be considered                               | No, unless policy requires it               |
| `EFFECT_UNKNOWN`                                       | Effect receipt/reconciler, projected by Horae | No                                                     | Block blind redispatch; deterministic reconciliation or human recovery   | Yes when reconciliation remains unknown     |
| `COMPLETED`                                            | Horae durable record after confirmed effect   | No                                                     | Return stored result; no retry                                           | No                                          |
| `RECOVERY_REQUIRED`                                    | Horae                                         | No                                                     | Reconcile or obtain fresh authority; never guess safe                    | Usually yes if not mechanically recoverable |
| `REJECTED` / `BOUNDARY_FAILURE`                        | Ananke or MP/Fates boundary respectively      | No                                                     | Do not reinterpret as the other state                                    | Depends on cause                            |

`ADMITTED` is therefore an authority result, not an execution result. No state before
`EXECUTION_STARTED` permits an external effect; no `UNKNOWN` state permits blind redispatch.

## 14. Threat review

| Threat                                                | Required stop/control                                                                                  |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Two processes race on one admitted action             | Horae atomic claim, owner/generation, and stale-owner rejection; only one enters Fates execution.      |
| Old or expired approval is replayed                   | Ananke exact grant/action/context/expiry validation at admission and again at execution.               |
| Old Horae claim is replayed                           | Durable claim binding, generation, owner validity, and native envelope revalidation.                   |
| Native action hash is reused with a different request | Durable identity also binds source/correlation and authenticated context; the claim envelope is exact. |
| Grant is reused for another recipient/resource        | Ananke approval action hash and exact args/resource/context binding fail closed.                       |
| Crash after claim or during recovery                  | Horae owns arbitration; no second dispatch until claim/reconciliation rules permit it.                 |
| Ledger loss or corruption                             | Checksummed/authenticated evidence becomes `UNKNOWN`; redispatch is blocked.                           |
| Malicious executor return value                       | Return value is not effect truth; only validated provider receipt/reconciliation can confirm.          |
| Provider timeout after success                        | Stable provider token/status lookup; otherwise `UNKNOWN`, never blind retry.                           |
| Approval expires during dispatch                      | Claim-aware Fates path revalidates expiry; expired authority cannot execute.                           |
| Fake effect-confirmed state                           | Effect evidence must be bound to effect ID/provider receipt and protected by the ledger boundary.      |
| Model text selects execution mode or claims approval  | Model output stops at MP-02/MP-03; no prose enters the execution envelope or authority fields.         |
| Luna or Sol bypasses governance                       | Neither model receives an effect adapter; all paths enter deterministic MP and Fates boundaries.       |
| Sol calls an effect adapter directly                  | Future frontend exposes only protocol requests/status, never connector credentials or effect APIs.     |

## 15. Mnemosyne decision

`MNEMOSYNE_NOT_REQUIRED_FOR_MP04`.

Mnemosyne's inspected responsibility is memory provenance, source-bound context, freshness, conflict
handling, and memory admission. Its documentation explicitly treats remembered approvals/grants as
evidence rather than current authority. MP-04 can establish durable execution claim, provider
receipt, and unknown-outcome safety with Horae plus a bounded effect receipt/reconciliation boundary.
Adding Mnemosyne would enlarge the trusted computing base without supplying the missing claim-aware
Ananke/Horae atomicity. It should remain excluded unless a later slice establishes that independent,
authoritative, revocable provenance is an execution invariant rather than optional evidence.

## 16. Proposed dependency profile

This is a non-authoritative draft for a future MP-04 acceptance. It deliberately marks unaccepted
Horae work and excludes Mnemosyne:

```json
{
  "profile": "moirae-protocol-mp04-fates-v1",
  "status": "PROPOSED_NOT_ACCEPTED",
  "adrasteia": {
    "sha": "a1c01bf9e6f9d6a126cfdcc1acfacd488b214210",
    "license": "MIT",
    "status": "accepted-reuse"
  },
  "ananke": {
    "ref": "ananke-fates-006b-mp03-admission-v0.1.0-protocol-1.4.0",
    "sha": "6bf8902c55c4f3f7593a987582b50783c8a7b5a0",
    "fates006aBoundarySha": "fc318663cbed3072128355fb3697e7f2b47f5f11",
    "status": "accepted-reuse",
    "requiresBoundedExecutionSlice": true
  },
  "horae": {
    "ref": "TO_BE_ACCEPTED",
    "sha": "TO_BE_ACCEPTED",
    "status": "proposed-needs-bounded-extension"
  },
  "mnemosyne": {
    "status": "excluded-not-required"
  },
  "integration": {
    "status": "TO_BE_ACCEPTED_AFTER_PEER_SEALS"
  }
}
```

The accepted FATES-005D compatibility-set material was not treated as an MP-04 dependency: it is
explicitly provisional/partial, uses a different `governed.memory-admission` profile, includes
Mnemosyne, and does not close the accepted MP-03 Ananke authority binding.

## 17. Sol/Luna frontend/backend invariant

The future user-facing architecture is:

```text
User / Judge
      |
      v
Sol — visible frontend, interaction, demo, and WebMCP judge surface
      |
      v
Moirae Protocol compiler and accepted Fates governance
      |
      v
Horae durable coordination and bounded effect boundary
      |
      v
future explicitly authorised effects

Luna — optional hidden backend/internal reasoning and orchestration only
```

Sol is the user-facing/frontend/judge/demo model. Luna may assist with backend/internal reasoning,
planning, or orchestration, but must not become the visible frontend merely because it is available.
Neither model may bypass deterministic compilation, independent authentication, Fates governance,
Horae claim coordination, or the single execution choke point. No frontend or Luna integration is
implemented in MP-04D.

## 18. Next bounded sequence

Exactly one next implementation/acceptance slice is recommended:

> **Implement and independently accept the bounded Fates–Horae claim-aware execution compatibility
> slice, including the typed envelope, exact authority/context binding, native consumption ordering,
> and crash-safe receipt/reconciliation contract; do not add external providers.**

That slice must produce immutable accepted Horae/Fates dependency refs before MP-04 runtime work
begins. MP-04 execution, effect adapters, provider calls, Firecracker, Console, and Mnemosyne remain
out of scope here.
