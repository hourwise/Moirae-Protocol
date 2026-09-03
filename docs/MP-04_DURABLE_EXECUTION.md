# MP-04 — Durable Governed Execution Coordinator

**Status:** Implementation complete; ready for independent acceptance. This document describes the
Protocol-side coordinator only. It is not an MP-04 acceptance seal.

**Profile:** `moirae-protocol-mp04-fates-v1`

**Scope:** synthetic/offline execution, local durable filesystem, one host, and cross-process
arbitration. No production provider, credentials, network effect, Firecracker operation, Mnemosyne
dependency, or frontend/model execution path is included.

## Boundary and ownership

MP-04 consumes a validated `ActionIntentV1`, an MP-03 `ADMITTED` result, an independently
authenticated `Mp03AuthenticatedContext`, explicit trusted time, and the exact dependency
provenance in `docs/evidence/mp-04-fates-dependency-lock.json`.

It then coordinates the accepted native ports:

```text
AgentProposalV1
  -> MP-02 ActionIntentV1
  -> MP-03 exact fixture mapping and Ananke admission
  -> MP-04 validates the admitted handoff
  -> Ananke.createExecutionAuthority(...)
  -> Horae Fates007aExecutionCoordinator.execute(...)
  -> Horae durable intent and owner/generation claim
  -> Ananke.executeClaimed(...)
  -> registered synthetic effect adapter
  -> receipt/reconciliation
  -> CONFIRMED | ABSENT | UNKNOWN
```

MP-04 owns only coordination, strict input/provenance revalidation, normalized result status, and
sanitized evidence. Ananke remains authoritative for operation registration, native hashing,
policy, approval validity/expiry/integrity, durable authority reservation, consumption, receipt
validation, and the single registered executor choke point. Horae remains authoritative for the
durable execution record, claim arbitration, owner/generation, and recovery lifecycle. Neither
authority nor claim material is caller-created by MP-04.

The public Protocol surface is `createMp04ExecutionCoordinator`, returning a coordinator with:

- `executeAdmittedAction(input)`, which accepts only structured MP-03/ActionIntent/context material;
- `recoverActionExecution(input)`, which accepts a native durable execution ID plus the exact
  structured ActionIntent/context needed to recompute and verify the native argument/target binding.

The coordinator receives no effect-adapter handle. The host supplies narrow structural ports over
the accepted Ananke and Horae implementations. The real integration test uses the accepted local
builds; synthetic adapters exist only inside that test harness.

## Dependency lock and provenance

The lock is an implementation-candidate evidence file, not a runtime import manifest. It pins:

- Adrasteia `a1c01bf9e6f9d6a126cfdcc1acfacd488b214210`;
- Ananke tag `ananke-fates-007a-claim-aware-execution-v0.1.0-protocol-1.4.0`, tag object
  `9fb9fc4d8183db64aa37f0a4e167fdf41ca856e5`, peeled SHA
  `114063e03332af3389fe805193e88a62111d9323`;
- Horae tag `horae-fates-007a-claim-aware-execution-v0.1.0-protocol-1.4.0`, tag object
  `59763d34644567c59d1041b3acef24efc5a1d072`, peeled SHA
  `aa296b420fbcf578089ca66dc03f6d09d9b06f00`, runtime SHA
  `7b24cb0af083e505bd2dc9fa55c6c3387f849131`;
- Fates Integration acceptance evidence commit `3c7b1f9916833728882e71f79a7276e9a806f808` as
  provenance only;
- `MNEMOSYNE_NOT_INTEGRATED` / `not-required`.

The coordinator compares the injected provenance structurally with the checked-in lock constants.
It fails closed on a mismatch; it never silently substitutes a repository `main` branch.

## MP-03 binding and trust boundary

Before Ananke authority creation, MP-04:

1. validates `ActionIntentV1` and reproduces its Moirae canonical digest and source-scoped
   idempotency key;
2. validates the exact MP-03 fixture action, operation, accepted parameters, scope, purpose, policy
   version, authenticated principals, and request/correlation identity;
3. requires `authority: admission-only`, `status: ADMITTED`, `nativeDecision: ALLOW`, the accepted
   native action hash, matching MP-03 evidence, and an approved fixture grant;
4. passes the exact operation, arguments, admitted action hash, and authenticated context to
   Ananke's native authority constructor.

`canonicalDigest` and `idempotencyKey` are evidence and routing material only. They cannot substitute
for Ananke's native action hash, authority instance, or Horae durable execution ID. MP-03
`WAITING_FOR_APPROVAL`, `REJECTED`, `BOUNDARY_FAILURE`, fabricated status strings, model prose,
caller hashes, caller claims, and caller receipts are not executable inputs.

## Native identity and authority instance

Ananke constructs the authority envelope. MP-04 does not copy the Fates hashing algorithm. The
accepted native durable identity is domain-separated as:

```text
fates-007a/durable-execution/v1\0 + canonical JSON of
{
  requestIdentity, nativeActionHash, operation, authenticatedContext,
  resourceScope, purpose, policyVersion, argumentsDigest, targetDigest,
  effectAdapter
}
```

The native result is `fates-execution:sha256:<digest>`. A renewed approval may change the separate
authority-instance digest while the same unexecuted trusted effect retains this durable identity.
Changing request/correlation, native action, operation/version, authenticated context, scope,
purpose, arguments/target, or adapter identity changes the native effect identity.

The authority-instance domain is `fates-007a/authority-instance/v1` and binds the durable execution
ID plus the current grant material: grant ID, approval action hash, approval binding hash, expiry,
request-binding mode, and approving operator/session fields. Ananke validates this material and
remains the authority owner; Horae stores and binds it without reinterpreting approval validity.

## Durable claim and execution

Horae receives the complete Ananke authority envelope through its accepted structural mirror. Its
durable record binds the native action hash, exact operation, argument/target digests, authenticated
context, request identity, scope, purpose, policy version, authority-instance digest, and adapter
identity/version. Its checksum-protected local ledger records:

```text
authority_validated
  -> execution_reserved
  -> executor_invocation_started
  -> terminal
                     or
  -> effect_reconciliation_required
```

Horae creates the claim. The claim digest domain is `fates-007a/claim/v1` and binds durable
execution ID, owner, generation, claimed-at time, native action hash, authority-instance digest,
argument digest, exact operation, and adapter identity/version. Stale owner/generation, copied
claims, wrong execution IDs, wrong authority, and mismatched operation/arguments are rejected by
Horae's persisted-state verifier before Ananke can reach its executor.

MP-04 calls Horae's accepted `execute`/`recover` coordinator port. Horae calls Ananke's
`executeClaimed` or `reconcileClaimed` binding. Reconciliation is non-executing. The only normal
effect invocation is the registered Ananke claim-aware executor path.

## Effect truth and recovery

The accepted receipt contract is version 1 and binds the durable execution ID, native action hash,
operation, authority-instance digest, adapter identity/version, argument/target digests, optional
provider operation/idempotency identities, result, provenance, observation time, and checksum.

- `CONFIRMED` requires an exact validated receipt or authoritative reconciliation.
- `ABSENT` requires authoritative negative evidence for the exact effect.
- `UNKNOWN` means effect truth cannot be proven. Missing, malformed, or corrupt receipts and a
  timeout after simulated effect all map here.

`UNKNOWN` is never retry permission. MP-04 returns `UNKNOWN` with recovery-required evidence and
does not call `execute` again or acquire a blind fresh claim. A recreated Protocol coordinator uses
the native durable execution ID and the exact structured ActionIntent/context to call Horae
recovery. Horae then calls `reconcileClaimed`, allowing `UNKNOWN -> CONFIRMED` or `UNKNOWN -> ABSENT`
without redispatch. An `ABSENT` execution is closed; a future attempt requires a new admission,
authority instance, durable intent, and claim lifecycle.

Repeated terminal requests return the stored native result through the MP-local routing index and
do not invoke the executor. The index is not authority and cannot override Horae's persisted record.

## Evidence and model boundary

MP-local evidence contains only sanitized source request/canonical/idempotency references, action,
dependency provenance, native operation/hash, authority-instance reference, policy/scope/purpose,
durable ID, claim owner/generation/digest, adapter identity, native result, receipt checksum,
reconciliation state, event names, and trusted timestamps. Credentials, provider secrets, raw model
prose, and unnecessary personal data are excluded.

The event sequence distinguishes admission completion, native authority creation, durable intent,
claim acquisition, claim validation, reservation, invocation start, receipt, reconciliation, and
terminal result. Executor invocation is never recorded as effect confirmation by itself.

Sol remains the user-facing/frontend/judge/demo model and Luna remains backend/internal
orchestration only: `SOL_FRONTEND_LUNA_BACKEND_PRESERVED`. Neither model has a direct Fates,
Horae, claim, executor, or effect-adapter path.

## Validation boundary

The committed MP-04 tests exercise the real Strands SDK machinery with a deterministic synthetic
model, the MP-02 compiler, the MP-03 adapter, the accepted Ananke build, the accepted Horae build,
and a deterministic offline receipt adapter. They cover all three existing fixture-bound actions,
replay, tampering, persistent UNKNOWN, UNKNOWN recovery, and ABSENT. No production adapter or
external effect is implemented.

The implementation inherits the accepted Fates limitation: local durable filesystem persistence,
single host, cross-process arbitration, checksums, atomic replacement, and restart recovery. It
does not claim distributed consensus, multi-host exactly-once execution, network-partition safety,
or arbitrary power-loss proof.
