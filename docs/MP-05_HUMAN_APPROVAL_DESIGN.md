# MP-05D — Human Approval Architecture and Fates Readiness

**Status:** Design/readiness only. No MP-05 runtime, browser, queue, provider, or effect adapter is
implemented by this slice.

**Decision:** `MP-05 DESIGN READY — ANANKE_NEEDS_BOUNDED_EXTENSION_FOR_MP05`.

**Related classifications:**

- `HORAE_NOT_REQUIRED_UNTIL_POST_APPROVAL_EXECUTION`
- `MNEMOSYNE_NOT_REQUIRED_FOR_MP05`
- `SOL_FRONTEND_LUNA_BACKEND_PRESERVED`
- `NO_MP05_RUNTIME_IMPLEMENTED`

## Purpose and boundary

MP-05 is the human decision boundary between an accepted MP-03 admission and the MP-04 durable
execution coordinator. A human decision is permission for one exact, already-compiled action. It is
not permission for a task, conversation, model plan, or future mutation of the action.

The intended flow is:

```text
AgentProposalV1 / model prose
        |
        v
MP-02 ActionIntentV1
        |
        v
MP-03 Ananke admission
        |
        +--> ADMITTED ------------------------------+
        |                                            |
        +--> WAITING_FOR_APPROVAL                   |
                 |                                   |
                 v                                   |
        Ananke-owned durable approval request        |
                 |                                   |
                 v                                   |
        deterministic presentation + authenticated   |
        human APPROVE or REJECT decision             |
                 |                                   |
                 +--> approved native authority ----+
                                                     v
                                          MP-04 Ananke/Horae execution
                                                     |
                                                     v
                                          CONFIRMED | ABSENT | UNKNOWN
```

MP-05 owns the Protocol coordination and presentation boundary only. Ananke remains the authority
owner. Horae begins at the post-approval durable execution boundary. The browser is a presentation
and decision transport, never an authority source.

## Exact dependency set

MP-05D was assessed against the already sealed MP-04 dependency set. These are provenance pins, not
new runtime dependencies:

| Component                     | Exact accepted reference                                                                                                                                                                                                       |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Adrasteia / Runtime Contracts | `a1c01bf9e6f9d6a126cfdcc1acfacd488b214210`                                                                                                                                                                                     |
| Ananke                        | `ananke-fates-007a-claim-aware-execution-v0.1.0-protocol-1.4.0`; tag object `9fb9fc4d8183db64aa37f0a4e167fdf41ca856e5`; peeled `114063e03332af3389fe805193e88a62111d9323`                                                      |
| Horae                         | `horae-fates-007a-claim-aware-execution-v0.1.0-protocol-1.4.0`; tag object `59763d34644567c59d1041b3acef24efc5a1d072`; terminal `aa296b420fbcf578089ca66dc03f6d09d9b06f00`; runtime `7b24cb0af083e505bd2dc9fa55c6c3387f849131` |
| MP-04B Integration evidence   | `3c7b1f9916833728882e71f79a7276e9a806f808` (evidence only)                                                                                                                                                                     |
| Mnemosyne                     | `not-required`; no runtime dependency                                                                                                                                                                                          |

The MP-04 Protocol dependency lock remains the source of the accepted Fates pins. MP-05D does not
alter it and does not add a second lock or modify the MP-04 acceptance evidence.

## Current accepted Ananke behavior

The inspected sealed Ananke source establishes the following facts:

1. `Gateway` constructs an `ApprovalEngine` backed by the module-level `Map` in
   `packages/authority-engine/src/approval-store.ts`. The ordinary approval store is explicitly
   documented as in-memory.
2. `requestApproval` generates an opaque UUID and records the exact server, tool, optional tool
   version, arguments, execution context, action hash, request time, expiry, and pending status.
3. `approve` and `reject` perform a pending/unused/expiry check, record the supplied operator
   identity and decision timestamp, and transition only within that process. The native in-process
   methods receive a structured `OperatorIdentity`; that structure is not itself proof that a human
   authenticated to the host.
4. `validateApproval` verifies status, expiry, single-use state, exact approval action hash, and the
   approval binding hash over the approving operator and session. Request/correlation binding is
   opt-in for selected tools and must be mandatory for the MP-05 profile.
5. The HTTP routes authenticate an operator and check `approvals:read` or `approvals:decide` before
   calling the engine. This is a useful route boundary, but it is not a durable approval protocol.
6. `Gateway` has a durable SQLite operator-session option, but the ordinary approval engine has no
   corresponding durable approval store. The separate `SqliteContentApprovalStore` is limited to
   content-preflight receipts and cannot be substituted for general action approval.
7. FATES-007A's checksum-protected authority ledger is durable post-admission execution state. It
   does not make a pending ordinary approval durable. `createExecutionAuthority` still reads the
   ordinary approval from the process-local approval engine.
8. The accepted claim-aware path consumes an approved grant only after a non-`UNKNOWN` terminal
   receipt. `UNKNOWN` records recovery state and does not consume authority or authorize retry.

These properties are sufficient for the accepted synthetic MP-04 profile after a test harness has
created an approval in the same process. They are not sufficient for a human approval workflow that
must survive gateway restart, race two decision requests, prove the authenticating host session, and
resume safely.

## Readiness conclusion

`ANANKE_NEEDS_BOUNDED_EXTENSION_FOR_MP05` is a real prerequisite, not a request to weaken MP-04.
The missing capability is a narrow Ananke-owned human decision boundary with:

- durable ordinary approval-request and decision records;
- checksummed/atomic local persistence and cross-process compare-and-set;
- a trusted host authentication port for the human decision;
- exact action, principal, resource, target, argument, request, correlation, purpose, policy, and
  expiry binding;
- explicit pending, approved, rejected, expired, revoked, and consumed state;
- durable decision/audit evidence and a stable opaque request reference;
- safe restart behavior for every decision/authority handoff window.

The required future Fates slice is classified conceptually as **FATES-008 — Human Approval Decision
Boundary**. It must be designed and accepted independently before MP-05 runtime implementation. It
must not add a provider or effect path.

## Proposed ownership model

| Concern                                                                                         | Owner                                     | MP-05 rule                                                                    |
| ----------------------------------------------------------------------------------------------- | ----------------------------------------- | ----------------------------------------------------------------------------- |
| Proposal prose and model interpretation                                                         | Strands / MP-01                           | Untrusted input only; never copied into approval authority                    |
| Canonical action and Moirae idempotency                                                         | MP-02                                     | Evidence and deterministic routing only; neither grants permission            |
| Fixture mapping and admission                                                                   | MP-03 / Ananke                            | Only `ADMITTED` with native `ALLOW` can continue                              |
| Approval request, action hash, approval binding, status, expiry, grant, revocation, consumption | Ananke / future FATES-008                 | Native authority; Protocol never reimplements or overrides it                 |
| Human authentication and active operator session                                                | Trusted host authenticator                | Supplies authenticated operator/session context; browser fields are untrusted |
| Exact approval presentation projection                                                          | Protocol, from structured native material | Deterministic display only; no new authority and no model prose               |
| Durable execution identity, claim, owner/generation, receipt truth                              | Accepted Ananke/Horae MP-04 boundary      | MP-05 passes native material through; it does not copy algorithms             |
| Browser/UI                                                                                      | Future Sol-facing surface                 | Presents, collects, and transports a decision; cannot mint authority          |
| Memory/context                                                                                  | Mnemosyne                                 | Not required and never an approval source                                     |

The operator authenticator may be implemented by a trusted host service or an approved identity
provider in a future Fates slice. A browser-submitted `operatorId`, role, session ID, or approval
string is never sufficient.

## Required future contracts

The names below are design-level contracts for FATES-008 and MP-05. They are not TypeScript types
added by this slice.

### Ananke-owned approval request

`HumanApprovalRequestV1` should contain, or resolve through Ananke to, the following authoritative
material:

- schema version and opaque approval request ID;
- exact registered server, tool, and version;
- native Ananke action hash;
- exact governed arguments and target binding, or a native redacted/display projection plus hashes;
- authenticated workload, acting agent, and represented/requester principals;
- tenant, runtime, runtime instance, and session context;
- exact resource scope, purpose, and policy version;
- request, correlation, and causation identity according to the MP-05 profile;
- request binding hash and approval action hash;
- requested-at and expires-at timestamps;
- status and native audit reference;
- no credentials, provider secrets, or raw model prose.

The Protocol may receive a sanitized copy for presentation, but Ananke must remain the source of
truth. A caller cannot supply a trusted native hash, target, arguments, expiry, or request ID to
create an approval request.

### Deterministic presentation

`ApprovalPresentationV1` should be produced from the validated ActionIntent, MP-03 evidence, and
Ananke-owned request material. It should include:

- schema version, opaque request reference, presentation version, and Ananke-provided native action
  hash/reference;
- action discriminator and exact server/tool/version;
- exact acting and represented principal labels/identifiers needed for judgment;
- exact tenant/resource/scope and purpose;
- exact target and parameters, rendered from structured data with deterministic escaping;
- policy version, approval expiry, and the fact that the decision is single-purpose;
- native evidence references and a server-generated presentation digest;
- explicit warning that approval authorizes only this exact effect and is not a task-wide grant.

The presentation digest is not a replacement for the native action or approval binding hash. The
browser returns the server-generated opaque request reference and presentation digest; it never
returns a caller-created action hash or authority object.

### Authenticated decision

`HumanApprovalDecisionV1` should be accepted only through a trusted host boundary and should carry
only:

- opaque request ID;
- `APPROVE` or `REJECT`;
- server-generated presentation version/digest;
- an optional client interaction reference that is audit metadata, not authority.

The host supplies the authenticated operator principal, active session, authentication method,
roles, trusted decision timestamp, and request correlation. The decision endpoint must ignore
operator identity, role, expiry, action hash, approval binding hash, native grant, durable execution
ID, claim, and receipt fields from the browser body.

Ananke must perform a compare-and-set transition from `pending` to exactly one of `approved` or
`rejected`. A second submit returns the already persisted decision without creating a second grant,
changing the approver, or starting execution. Expiry is checked at presentation, decision, authority
creation, and claim-aware execution; an expired request cannot be approved by a late response.

## Exact binding and identity separation

The future approval binding must cover the complete action that the human saw:

```text
mp05-approval-request/v1
  + exact native server/tool/version
  + native action hash
  + exact governed arguments and target
  + authenticated workload/acting/represented principals
  + tenant/runtime/runtime-instance/session
  + request/correlation/causation identity
  + exact resource scope
  + purpose and policy version
  + presentation version/digest
  + expiry and request status
```

Ananke owns the canonicalization and hash. MP-05 may compare returned native fields to the already
validated ActionIntent and MP-03 evidence, but it must not reproduce or replace the native hash.

Three identities remain distinct:

1. MP-02 `canonicalDigest` and `idempotencyKey` identify Moirae action material and source-scoped
   delivery. They are not approval or execution authority.
2. The native approval-instance identity binds the currently usable grant, approval action hash,
   binding hash, expiry, and approving operator/session. A renewed approval may replace this
   authority instance.
3. The MP-04 durable execution identity represents the exact trusted effect intent. A renewed
   approval for the same unchanged, still-unexecuted request must not silently create a second
   effect identity. MP-05 must preserve the original trusted request/effect material and ask native
   Ananke/Horae to resolve the durable identity; it must not compute one from an approval ID.

If any native field disagrees with the MP-02/MP-03 structured material, the result is a boundary
failure and execution stops. No “closest match” or approval renewal may repair a changed target,
recipient, principal, scope, purpose, arguments, or request.

## State and lifecycle design

The native approval record should have explicit durable states equivalent to:

```text
pending -> approved -> execution-authorized -> consumed
      \-> rejected
      \-> expired
      \-> revoked
```

`execution-authorized` is a handoff/audit state, not a second authority owner; exact native naming
must be chosen by Ananke. Approval decision and MP-04 execution are separate transitions:

1. MP-03 returns `WAITING_FOR_APPROVAL`; MP-04 is not called.
2. Ananke durably records the exact pending request.
3. A trusted host authenticates the human and Ananke atomically records `APPROVE` or `REJECT`.
4. Only an approved native grant can be passed to MP-04.
5. MP-04 asks Ananke to create/revalidate native execution authority and Horae to create/claim the
   durable execution intent.
6. Ananke's accepted claim-aware path reserves, records invocation, invokes the single executor
   choke point, and validates/reconciles the effect receipt.
7. Ananke consumes the approval only after the exact native execution reaches a safe terminal result
   (`CONFIRMED` or authoritative `ABSENT`), using the accepted FATES-007A semantics. `UNKNOWN` is
   retained as recovery-required and never authorizes redispatch.

Rejection is terminal for that approval request. It does not call Horae, does not create an
execution claim, and does not grant a retry. A future attempt requires a fresh MP-02 intent,
MP-03 admission, human decision, native authority instance, and MP-04 durable lifecycle.

## Restart, race, and stale-state rules

- A restart before a decision leaves the durable request `pending`, `expired`, or `revoked`; it does
  not approve, reject, or execute it.
- A restart after approval but before MP-04 handoff returns the same native approval instance after
  revalidation. It does not create a second approval or silently auto-execute.
- A restart during MP-04 follows the accepted Horae/Ananke durable recovery path. MP-05 does not
  inspect memory or invent a new claim.
- A decision after expiry is rejected, even if the browser presentation was generated before the
  expiry.
- A decision using an old presentation digest, old request reference, changed ActionIntent, changed
  principal, changed target, changed parameters, changed scope, or changed policy is rejected.
- Concurrent approval requests for the same pending ID are serialized by the Ananke durable store;
  exactly one decision wins and all later responses expose the stored decision.
- Concurrent MP-04 continuations use the accepted Horae owner/generation claim. Approval success
  cannot bypass claim arbitration.
- Repeated `CONFIRMED`, `ABSENT`, or `UNKNOWN` reads are reads/reconciliation, not new execution.

The required future test matrix includes process death before decision persistence, after decision
persistence, after authority creation, after Horae claim, before Ananke reservation, after invocation
start, after effect with no receipt, after receipt persistence, and during a second decision or
recovery race. A process crash must never turn an unrecorded human decision into implicit approval,
or an uncertain effect into blind replay.

## Browser and web security boundary

The future Sol-facing approval surface must satisfy all of the following:

- The browser receives a sanitized presentation, not credentials, provider secrets, native claim
  material, or an executor handle.
- The decision route requires a host-authenticated operator session and the correct approval scope;
  a browser session alone does not create an operator identity.
- Use CSRF protection for cookie-authenticated mutations, strict origin checks, SameSite cookies,
  no state-changing GET requests, short-lived decision sessions, and step-up authentication where
  the native policy requires it.
- Do not place opaque approval IDs, action details, tokens, or decision material in URLs, referrers,
  analytics, browser storage, or logs unnecessarily.
- Escape all structured target/argument values on display; apply CSP and frame restrictions; do not
  render model prose or external content as trusted HTML.
- The approval response is an acknowledgement of a native state transition, not proof supplied by
  the browser. The host re-reads Ananke state before returning it.
- A UI timeout, refresh, duplicate click, offline retry, or tab replay is handled as an idempotent
  read/decision race, never as permission to issue a second effect.

Sol remains the intended visible/user/judge/demo model. Luna may support backend reasoning in a
future slice, but neither model may call Ananke execution, Horae claims, or an effect adapter
directly.

## Fates and Horae readiness

The sealed FATES-007A pair already supplies the post-approval capabilities MP-04 needs:

- Ananke native operation registration, hashing, approval validation, authority construction,
  durable authority reservation, claim-aware executor choke point, receipt validation, and
  reconciliation;
- Horae checksum-protected durable execution intent, owner/generation arbitration, recovery claim,
  and durable `CONFIRMED`/`ABSENT`/`UNKNOWN` projection.

Horae does not need to own a pending human approval queue. Its accepted ownership law says that
policy and approval belong to Ananke, and its current public code has no direct approval or execution
path. Therefore:

`HORAE_NOT_REQUIRED_UNTIL_POST_APPROVAL_EXECUTION`

After FATES-008 supplies an Ananke-owned approved native grant, MP-05 can enter the existing MP-04
handoff. No Horae source change is required by this design unless a later accepted Fates inspection
finds a concrete post-approval compatibility gap.

Mnemosyne is not required for presenting, deciding, expiring, revoking, consuming, or reconciling
approval. It must not be used as an approval ledger, identity provider, effect-truth source, or
restart workaround:

`MNEMOSYNE_NOT_REQUIRED_FOR_MP05`

## Required FATES-008 acceptance evidence

Before MP-05 runtime work begins, FATES-008 must prove against an accepted Ananke candidate:

- ordinary action approval survives gateway/process restart;
- approval records are checksummed, atomically replaced, and protected against cross-process races
  within the declared single-host scope;
- operator authentication is a trusted host boundary, not a caller-supplied identity field;
- exact native action, operation, version, arguments, target, context, scope, purpose, policy,
  request/correlation, presentation, and expiry mutations fail closed;
- approve/reject double-submit is compare-and-set and returns one stored decision;
- expired, revoked, rejected, consumed, missing, corrupt, and stale records cannot become approval;
- approval is not consumed before the accepted MP-04 durable claim and authority ordering is safe;
- crash before executor, during executor start, after effect without receipt, and after receipt do not
  permit blind redispatch;
- fresh approval for the same unchanged effect preserves the native durable effect identity where
  the accepted Fates contract specifies that behavior;
- an approved action can enter MP-04 without exposing a direct executor path;
- all three existing fixture-bound actions remain synthetic/offline only.

MP-05 itself must then add end-to-end tests for presentation mutation, hostile proposal text,
non-ADMITTED states, rejection, stale/expired approval, double-submit, restart, and continuation
through MP-04. Those tests are planned evidence, not claims made by this design-only slice.

## Threat and crash matrix

| Window/threat                              | Required safe result                                                            |
| ------------------------------------------ | ------------------------------------------------------------------------------- |
| Model says “APPROVED”                      | No state transition; only native Ananke decision counts                         |
| Browser changes target/arguments/principal | Presentation/native binding mismatch; no grant and no effect                    |
| Browser supplies operator ID or role       | Ignored; host authenticator must supply the operator                            |
| Browser replays approve                    | Stored first decision returned; no second grant                                 |
| Approve races reject                       | One durable compare-and-set winner; loser sees terminal state                   |
| Gateway dies before request write          | No approval exists; no execution                                                |
| Gateway dies after pending write           | Pending request is recovered or expires; no auto-approval                       |
| Gateway dies after approved write          | Same native approval is revalidated; no duplicate decision                      |
| Gateway dies before MP-04 claim            | No effect; later continuation must revalidate native authority                  |
| Gateway dies after Horae claim             | Horae owner/generation recovery controls continuation                           |
| Gateway dies after Ananke reservation      | Durable state determines whether invocation started; no blind second invocation |
| Effect starts and receipt is missing       | `UNKNOWN`; reconcile before any possible terminal result                        |
| Reconciliation cannot decide               | `UNKNOWN` remains; no retry or fabricated `ABSENT`                              |
| Reconciliation proves no effect            | `ABSENT`; old identity is closed and not replayed                               |
| Reconciliation proves exact effect         | `CONFIRMED`; no second invocation                                               |
| Approval expires or is revoked             | Fail closed; no new authority from stale state                                  |

## Public reproducibility and implementation limit

This branch contains only documentation/readiness changes. A clean public checkout must be able to
verify the MP-04B baseline and read this design without local Fates source, credentials, network
providers, or Firecracker. Any future MP-05 implementation must bind its acceptance-sensitive tests
to the exact accepted Fates refs above and fail closed when those refs are unavailable or mismatched.

This design makes no production, live-provider, multi-host, or distributed-consensus claim. The
accepted post-approval execution guarantee remains local durable filesystem persistence, one host,
cross-process arbitration, checksums, atomic replacement, and restart recovery. The approval
extension must state the same scope and must not describe browser storage or a model context as
durable authority.

## Exit decision

MP-05 is design-ready but implementation-blocked on the native human decision boundary:

```text
MP-05 DESIGN READY — ANANKE_NEEDS_BOUNDED_EXTENSION_FOR_MP05
HORAE_NOT_REQUIRED_UNTIL_POST_APPROVAL_EXECUTION
MNEMOSYNE_NOT_REQUIRED_FOR_MP05
SOL_FRONTEND_LUNA_BACKEND_PRESERVED
NO_MP05_RUNTIME_IMPLEMENTED
```

No MP-05 runtime branch, acceptance tag, Fates modification, Protocol runtime change, browser
surface, production provider, or external effect is part of this slice.
