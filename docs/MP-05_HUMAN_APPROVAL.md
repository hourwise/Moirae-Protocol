# MP-05G — Approved Recovery Semantic Rebinding Remediation

**Status:** `MP-05G REMEDIATION COMPLETE — READY FOR MP-05 RE-ACCEPTANCE`; `MP-05 NOT ACCEPTED`.

This slice composes the accepted MP-03 admission adapter, the accepted MP-04 durable execution
coordinator, and the sealed FATES-008 Ananke approval boundary. It does not add a product UI,
provider, external effect, queue, or MP-06 behavior.

## Ownership and flow

```text
ActionIntentV1
    -> MP-03 admission
    -> WAITING_FOR_APPROVAL
    -> native FATES-008 request re-read and exact validation
    -> deterministic ApprovalPresentationV1
    -> strict HumanDecisionEnvelopeV1
    -> trusted-host operator/session -> native FATES-008 decision
       |-> REJECTED / EXPIRED / CONFLICT: terminal, no execution
       `-> APPROVED: fresh MP-03 admission with native approval ID
           -> ADMITTED + native ALLOW
           -> existing MP-04 executeAdmittedAction()
           -> accepted Ananke/Horae lifecycle
           -> CONFIRMED | ABSENT | UNKNOWN
```

Protocol owns the structured display projection and workflow composition only. Ananke owns the
opaque approval request ID, native action hash, presentation binding, expiry, operator/session
binding, stable human `decisionId`, decision state, grant, revocation, dispatch reservation, and
consumption. Horae begins only after the approved MP-04 handoff. The browser, Sol, Luna, model
prose, and Protocol memory cannot create or select any of those authorities.

## Public contracts

`ApprovalPresentationV1` is a strict, deterministic structured projection. It carries the exact
action, server/tool/version, authenticated workload, acting and represented principals, resource,
target, parameters, purpose, policy version, scope, expiry, source request, MP-03 admission hash,
native FATES-008 approval action-hash reference, native presentation-binding hash, and bounded
evidence references. The Protocol `presentationDigest` is a display-integrity digest only; it is
distinct from the native Ananke action hash, presentation binding hash, and approval binding hash.

`HumanDecisionEnvelopeV1` accepts only its schema version, native approval ID, `APPROVE` or
`REJECT`, the regenerated Protocol presentation digest, and the native presentation-binding hash.
It rejects operator IDs, sessions, roles, expiry overrides, hashes, grants, claims, execution IDs,
and authority objects. Operator identity/session and trusted decision time arrive through the
trusted host adapter.

The coordinator re-reads and validates native state before every decision. An APPROVE result is
not an effect result: it performs a fresh MP-03 admission and passes only exact `ADMITTED`/`ALLOW`
to the existing MP-04 coordinator. REJECT never calls MP-04 or Horae. Native `applied`, `idempotent`,
and `conflict` outcomes remain visible to the Protocol result, and native `decisionId` is never
replaced by a Protocol-generated ID.

The native decision response is an observation/result transport, not durable approval authority.
After every decision that could affect continuation, the coordinator takes a fresh trusted-time
sample and re-reads the durable native approval through the same verified read path used by
preparation and recovery. Only that re-read may establish decision identity, status, native
integrity, presentation binding, semantic binding, and permission to perform fresh MP-03 admission.
An embedded response `grant`, if present, is retained only as non-authoritative transport material;
missing, malformed, unavailable, revoked, or inconsistent durable truth never falls back to it.

### Approved recovery semantic binding

A native-valid approved durable record is necessary but not sufficient for recovery. Before
executable continuation, the durable approval must also be semantically rebound to the exact
Moirae `ActionIntent`, authenticated context, and original MP-03 admission material. Native
integrity and presentation binding remain separate predicates: a record that is self-consistent in
the native FATES-008 domain is not authority for a semantically different Moirae action.

Every approved continuation route enforces the same binding invariant. Both normal
`submitDecision()` approval continuation and `recoverOrRefresh()` approved recovery validate the
native record's operation, executable arguments, execution context, request/approval identity,
presentation requirements, and MP-03 action-domain material before a fresh executable MP-03
admission and the existing MP-04 handoff. Recovery does not treat caller-supplied mutations,
copied IDs, presentation data, or derived hashes as authority.

### Dual native hash domains

The two native hash references in `ApprovalPresentationV1` intentionally belong to separate
domains:

- `admissionNativeActionHash` is the historical MP-03 admission-domain identifier and remains
  checked against the accepted MP-03 fixture/profile;
- `nativeActionHash` is the expiry-sensitive FATES-008 approval-action identifier, derived by
  the trusted Ananke adapter from the approval record's semantic material.

The domains are not compared for equality. Instead, the trusted Ananke adapter re-derives the
FATES-008 action hash and, when present, its presentation-binding hash from the record's operation,
arguments, execution context, expiry, request-binding flag, and presentation version. Protocol
compares those derived values with the stored claims, then applies the existing semantic bridge
between the MP-03 WAITING result, ActionIntent, and authenticated context. The Protocol digest is
display/staleness evidence only and is not a native authority hash.

## Replay, restart, and expiry

The native FATES-008 decision is durable and remains the source of truth after response loss,
coordinator restart, or a second process. A repeated decision is an idempotent observation of the
same native decision; an opposite decision is a conflict. MP-04 durable execution identity and
receipt/reconciliation truth remain separate from approval truth. Repeated APPROVE continuation
therefore relies on MP-04's durable identity and claim/reconciliation rules rather than a Protocol
memory index.

Presentation regeneration rejects stale, changed, expired, rejected, revoked, consumed, or
cross-request material before calling the native decision. The exact FATES-008 dispatch-time
expiry fence remains native Ananke: an approval must be valid when its dispatch reservation is
acquired. After that reservation, later expiry cannot retroactively cancel the reserved attempt.
`UNKNOWN` is not retry permission and never causes Protocol to re-ask for approval automatically
or redispatch an effect.

## Accepted dependency provenance

The MP-05 lock at `docs/evidence/mp-05-fates-dependency-lock.json` is authoritative. This
implementation candidate exports the same exact provenance in
`MP05_FATES_DEPENDENCY_PROVENANCE`:

- Ananke FATES-008 tag `ananke-fates-008a-durable-human-approval-v0.1.0-protocol-1.4.0`, tag
  object `0fa08f78f27e2f79c895402f3f53a8aada5837b4`, terminal
  `b888d61adf180d33e2ae2e61d276cb9b0f13bd12`, runtime
  `c89b83de40ed0275969fe3931220f440bf082aa3`;
- Horae FATES-007A tag `horae-fates-007a-claim-aware-execution-v0.1.0-protocol-1.4.0`, terminal
  `aa296b420fbcf578089ca66dc03f6d09d9b06f00`, runtime
  `7b24cb0af083e505bd2dc9fa55c6c3387f849131`;
- Adrasteia `a1c01bf9e6f9d6a126cfdcc1acfacd488b214210`;
- Mnemosyne: `not-required`.

The implementation evidence in `docs/evidence/mp-05i-human-approval.json` is candidate evidence,
not an acceptance record. `MP-05_NOT_ACCEPTED` remains in force until an independent acceptance
slice seals this exact Protocol candidate.

## Scope and exclusions

The required real-Fates integration mode uses the public/sealed FATES-008 and Horae roots and
synthetic adapters only. The offline pipeline uses the existing synthetic Strands model and
MP-01/MP-02 machinery; live Bedrock inference is not required. The supported authority scope is
the accepted local, single-host durable Fates scope. This slice makes no distributed-consensus,
multi-host, real-provider, Firecracker, or product-UX claim.

Required classifications remain:

```text
MP-05_RUNTIME_IMPLEMENTED_AS_CANDIDATE
MP-05_NOT_ACCEPTED
HORAE_NOT_REQUIRED_UNTIL_POST_APPROVAL_EXECUTION
MNEMOSYNE_NOT_REQUIRED_FOR_MP05
SOL_FRONTEND_LUNA_BACKEND_PRESERVED
```
