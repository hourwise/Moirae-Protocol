# MP08B PRELIVE INTEGRATION 01 — Integrated Candidate Verification and Freeze

Status: MOIRAE_MP08B_PRELIVE_INTEGRATION_01_COMPLETE

This document freezes the verified offline MP-08B candidate at:

- Commit: c5923ec3c4fc9d87b3f00f124a2740e0b765fbba
- Tree: 4908c987ca0db03e4f3fa3b34684fae756af0a0c
- Parent: 4075eb8154efc39566d1a2d92f97119cc3bc4a58
- Branch: codex/mp08b-prelive-integration-01

This is an integration-verification and evidence slice. It does not add production
source behavior, invoke a provider, or make the candidate deployable.

## Scope and classification

The verified candidate contains the accepted-for-scope MP-08A evidence and the
linear MP-08B runtime slices through the native MP-04/Horae reconciliation read
port:

MP08A_ACCEPTED

RUNTIME-02 accepted for bounded composition scope

FATES-01 accepted for bounded real-authority scope

APPROVAL-01 accepted for bounded durable-approval scope

QUEUE-01 accepted for bounded durable-local queue/worker scope

EXECUTION-01 accepted for bounded MP-04/Horae reconciliation scope

PROVIDER-01 accepted for provider-selection scope

PROVIDER-01B accepted for offline SES-adapter scope

PROJECTION-01 accepted for bounded trusted native projection scope

RECONCILIATION-READ-01 accepted for bounded native-read scope

These statements do not mean MP08B_ACCEPTED. The candidate remains:

- MP08B_NOT_DEPLOYED
- MP08B_NOT_ACCEPTED
- MP09_NOT_ACCEPTED

The exact next live boundary is:

MP08B_REQUIRES_PROVIDER_02_AWS_SES_SANDBOX_SETUP_AND_LIVE_EFFECT_SMOKE

## Linear ancestry certification

The expected chain is linear. Every entry below is an ancestor of the frozen
candidate, and each entry has the listed immediate parent.

| Slice                  | Commit                                   | Tree                                     | Parent                                   | Subject                                                         | Ancestor |
| ---------------------- | ---------------------------------------- | ---------------------------------------- | ---------------------------------------- | --------------------------------------------------------------- | -------- |
| MP-08A evidence        | 0c7f8055e807e0dd62735b0c7bf86933ea912dfc | e3a9b815cf841bb0428eb7fc0960ddc340e54249 | e24bf373c0a354f9bd1c0058699a949c59d6f5d5 | docs(protocol): record MP-08A new-account live characterization | yes      |
| RUNTIME-02             | d8034da93b5cc507a81ecf2c3efe2b54af3d85a7 | 3424af71b4ff38746d99f7e2ae0bbf928a9795af | 0c7f8055e807e0dd62735b0c7bf86933ea912dfc | feat(protocol): compose hosted demo runtime boundaries          | yes      |
| FATES-01               | 4c4e187334b2600522b7014ad151a8a9531274b2 | 485ade24796bc85e57dfe78b7b74d797bf107643 | d8034da93b5cc507a81ecf2c3efe2b54af3d85a7 | feat(protocol): materialize verified Fates authority            | yes      |
| APPROVAL-01            | 3ad5f585be9feae6dd8c2e22a79590a8c801be3a | 5769058a878fd1869eefcbe6ea46cab780a2dc09 | 4c4e187334b2600522b7014ad151a8a9531274b2 | feat(protocol): add durable trusted approval boundary           | yes      |
| QUEUE-01               | 8ef83fbc49c197b3afe3823d4b732f0f37349771 | b9af7f0ed2a7dc6aac1ca040f6612ecc19875a68 | 3ad5f585be9feae6dd8c2e22a79590a8c801be3a | feat(protocol): compose durable queue worker boundary           | yes      |
| EXECUTION-01           | 10589a815db8a171f40f56dbc579ee8a21da5d39 | 285bff95f95c54043dec6203a2932c91e7984293 | 8ef83fbc49c197b3afe3823d4b732f0f37349771 | feat(protocol): compose execution reconciliation boundary       | yes      |
| PROVIDER-01            | 95556bfadcea904bc1c324bc92c46f9deaf27ada | a132e8feab0e423d04ddb615106fab58fa73be2f | 10589a815db8a171f40f56dbc579ee8a21da5d39 | docs(protocol): select governed external provider path          | yes      |
| PROVIDER-01B           | 3d8cde3c73781a38946da7d8ba68e7450484364e | 42e8533b7bb63eb81a71168fc10b2ca28bcd9181 | 95556bfadcea904bc1c324bc92c46f9deaf27ada | feat(protocol): add governed SES provider adapter               | yes      |
| PROJECTION-01          | 4075eb8154efc39566d1a2d92f97119cc3bc4a58 | c8868cf9a16a3869655573709955038cbaa0ad9c | 3d8cde3c73781a38946da7d8ba68e7450484364e | feat(protocol): project trusted native protocol state           | yes      |
| RECONCILIATION-READ-01 | c5923ec3c4fc9d87b3f00f124a2740e0b765fbba | 4908c987ca0db03e4f3fa3b34684fae756af0a0c | 4075eb8154efc39566d1a2d92f97119cc3bc4a58 | feat(protocol): expose native reconciliation read port          | yes      |

MP08B_LINEAR_ANCESTRY_VERIFIED

NO_CHERRY_PICK_REQUIRED

NO_MERGE_REQUIRED

The accepted MP-07 baseline remains origin/main at
983b785bd68e06d280a5af2898d3b43533688518, with tree
a9a31a37188d13d144d733a36666c78d8ac1e69f. The
mp-07-accepted-v1 tag still peels to that same commit.

## Integrated artifact inventory

The frozen tree contains the expected host composition and read-side artifacts:

- runtime descriptor and synthetic launcher in apps/host/src/runtime.ts and
  apps/host/src/main.ts;
- host transport in apps/host/src/server.ts;
- explicit composition in apps/host/src/composition.ts;
- verified Fates admission in apps/host/src/fates-runtime.ts;
- durable FATES-008A approval runtime in apps/host/src/approval-runtime.ts;
- durable local queue and worker composition in apps/host/src/queue-runtime.ts;
- MP-04/Horae integration through the execution coordinator;
- governed SES v2 adapter in apps/host/src/ses-provider.ts;
- trusted native MP-07 projection in apps/host/src/native-projection.ts;
- native MP-04 reconciliation read through the coordinator read port;
- existing package-level ActionIntent, Fates, approval, background-work,
  execution-coordinator, effect-adapter, and product contracts;
- MP-08B slice documentation and the accepted MP-08A evidence JSON.

PRELIVE_ARTIFACT_INVENTORY_COMPLETE

## Cross-slice seam audit

| Seam                                           | Result                                               | Evidence                                                                |
| ---------------------------------------------- | ---------------------------------------------------- | ----------------------------------------------------------------------- |
| Strands proposal to AgentProposalV1            | VERIFIED; not active in this task                    | MP-08A evidence and RUNTIME-02 tests; no inference was run here         |
| AgentProposalV1 to MP-02 ActionIntent          | VERIFIED                                             | deterministic compiler and focused tests                                |
| ActionIntent to MP-03/Fates admission          | VERIFIED; guarded by explicit external-runtime tests | FATES-01 accepted materialization and fail-closed guards                |
| REQUIRE_APPROVAL to durable MP-05              | VERIFIED; guarded by explicit FATES-008A path        | APPROVAL-01 accepted local durable path                                 |
| Durable APPROVED to MP-06 eligibility          | VERIFIED                                             | approval/queue integration tests                                        |
| MP-06 work to bounded worker claim             | VERIFIED                                             | Queue-01 accepted local queue/worker path                               |
| READY_FOR_MP04 to MP-04 coordinator            | VERIFIED                                             | Execution-01 contracts and tests                                        |
| MP-04/Horae result to MP-06 outcome/completion | VERIFIED                                             | deterministic local reconciliation tests                                |
| Durable reconciliation to native read port     | VERIFIED                                             | Reconciliation-Read-01 tests and read-only coordinator method           |
| Native protocol state to MP-07                 | VERIFIED                                             | Projection-01 and Reconciliation-Read-01 tests                          |
| MP-04 state to governed SES adapter boundary   | VERIFIED offline; BLOCKED_LIVE_CONFIGURATION         | Provider-01B request mapper and observation seam; transport not invoked |

No cross-slice type or identity mismatch was exposed by the focused or full
regression runs.

## End-to-end identity continuity

The representative SEND_APPOINTMENT_DETAILS path preserves the accepted
identities instead of reconstructing them from browser or model input:

1. source request identity enters the untrusted proposal and is revalidated;
2. the canonical ActionIntent supplies the digest and idempotency key;
3. MP-03 supplies the authenticated context, native action hash, and authority
   evidence;
4. MP-05 binds the durable approval and decision to the same ActionIntent;
5. MP-06 derives the logical work and delivery identity from the approved
   continuation and preserves the approval/decision references;
6. the worker records worker identity, claim identity, and claim generation;
7. MP-04/Horae preserves durable execution identity, attempt/evidence state,
   native action hash, approval reference, and correlation material;
8. the native read port validates durable execution identity, source request,
   approval, and native action binding before projection;
9. MP-07 exposes only a deterministic view of those validated records;
10. the SES mapper accepts only the already-governed execution state and binds
    provider correlation to the execution identity.

No client-supplied category, provider endpoint, credential, approval state, or
effect result is authoritative.

END_TO_END_IDENTITY_CONTINUITY_AUDIT

## Fates, Horae, and Runtime Contracts provenance

The two Fates roles remain distinct:

| Role            | Repository and immutable identity                                                                                                                                                                                                                                       | Capability                                  |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| MP-03 admission | https://github.com/hourwise/Project-Ananke.git; tag ananke-fates-006b-mp03-admission-v0.1.0-protocol-1.4.0; commit 6bf8902c55c4f3f7593a987582b50783c8a7b5a0; tree b8c0be1170df56471930c689b8e8b6f58fdd29bd                                                              | real accepted admission authority           |
| MP-05 approval  | https://github.com/hourwise/Project-Ananke.git; tag ananke-fates-008a-durable-human-approval-v0.1.0-protocol-1.4.0; tag object 0fa08f78f27e2f79c895402f3f53a8aada5837b4; commit b888d61adf180d33e2ae2e61d276cb9b0f13bd12; tree ed5e268e6b3b0630a798b9131341a2c13ef9830f | durable native approval state and decisions |

The FATES-006B checkout and FATES-008A checkout were read-only and clean.

The accepted Horae checkout is:

- repository: https://github.com/hourwise/Project-Horae.git
- tag: horae-fates-007a-claim-aware-execution-v0.1.0-protocol-1.4.0
- commit: aa296b420fbcf578089ca66dc03f6d09d9b06f00
- tree: 2d472b9c90a0699f8902f39874760754310da473

The accepted Runtime Contracts identity used by the chain is commit
a1c01bf9e6f9d6a126cfdcc1acfacd488b214210, on the
release/webmcp-runtime-v0.6.2 line. All inspected external repositories
remained read-only:

FATES_REPOSITORIES_READ_ONLY

HORAE_REPOSITORIES_READ_ONLY

RUNTIME_CONTRACTS_READ_ONLY

NO_EXTERNAL_REPO_SOURCE_CHANGE

NO_EXTERNAL_REPO_COMMIT

NO_EXTERNAL_REPO_TAG_CHANGE

## External runtime materialization

The current real composition uses trusted, explicit materialization inputs:

- FATES_ANANKE_ROOT for the accepted FATES-006B admission runtime;
- MP05_FATES_ANANKE_ROOT for the accepted FATES-008A durable approval runtime;
- the accepted Horae/Runtime Contracts materialization used by the local
  execution tests and coordinator contracts.

The Fates runtimes verify origin, clean checkout, immutable commit/tag/tree
identity, and required built runtime material. The current implementation does
not embed a D:\ or C:\ user-machine path in production source, and Git metadata
is not inferred from browser input.

Current classification:

- FATES-006B: HOSTED_MATERIALIZATION_REQUIRED
- FATES-008A: HOSTED_MATERIALIZATION_REQUIRED
- Horae runtime: DEPLOYMENT_PACKAGING_REQUIRED
- immutable built artifacts and provenance metadata: DEPLOYMENT_PACKAGING_REQUIRED
- hard-coded machine path: NOT_FOUND

The later hosted deployment slice must package or otherwise materialize these
verified runtimes immutably. This freeze does not solve deployment packaging.

## Durability classification

| State                         | Current implementation                                                      | Classification                                 |
| ----------------------------- | --------------------------------------------------------------------------- | ---------------------------------------------- |
| MP-05 approval and decision   | FATES-008A native SQLite plus host binding                                  | DURABLE_LOCAL                                  |
| host trusted operator binding | local durable host-side state                                               | DURABLE_LOCAL                                  |
| MP-06 queue                   | DurableFilesystemLocalQueue                                                 | DURABLE_LOCAL                                  |
| MP-06 activity                | DurableFilesystemActivitySink                                               | DURABLE_LOCAL                                  |
| MP-04/Horae reconciliation    | accepted durable Horae record, exposed through read-only coordinator lookup | DURABLE_LOCAL in the current local composition |
| hosted queue                  | no hosted/multi-writer durability proof                                     | NOT_HOSTED_DURABLE                             |

Therefore:

durableApproval = true

durableLocalQueue = true

hostedDurableQueue = false

The current local durability must not be relabelled as hosted durability.

## Synthetic/live separation

The default npm run start launcher remains the explicitly labelled
SYNTHETIC_LOCAL_DEMO. Its runtime descriptor reports false for live Fates,
live Strands, durable approval, hosted durable queue, and external effects.
The native components are explicit dependencies and are not instantiated by the
default synthetic routes.

SYNTHETIC_DEFAULT_PRESERVED

NO_ACCIDENTAL_LIVE_PROVIDER_INITIALIZATION

NO_ACCIDENTAL_AWS_CALL

## SES pre-live inertness

PROVIDER-01B pins @aws-sdk/client-sesv2 at 3.1129.0 and implements the
server-side SES v2 transport, bounded SEND_APPOINTMENT_DETAILS mapping, trusted
sender/recipient/region controls, fixed appointment-details-v1 semantics, and
independent observation input.

The transport is disabled by default. The implementation does not call the SDK
during module import or initialization. A later Provider-02 authorization is
required before an explicit real transport can be used.

The following remain true:

SES_ADAPTER_READY

SES_TRANSPORT_NOT_INVOKED

REAL_SES_TRANSPORT_INVOKED = NO

EMAILS_SENT = 0

SES success, an SES MessageId, or a provider operation result is not Horae
confirmation. Matching independently gathered observation remains required.

## Native MP-07 offline regression

The accepted local paths preserve the following deterministic product results:

| Native state                                                           | Product category                                                |
| ---------------------------------------------------------------------- | --------------------------------------------------------------- |
| durable pending approval                                               | NEEDS_YOU                                                       |
| authoritative rejection, denial, boundary failure, or terminal failure | BLOCKED                                                         |
| available, queued, claimed, or active pre-execution work               | ACTIVITY                                                        |
| MP-04 UNKNOWN or RECOVERY_REQUIRED                                     | BLOCKED with the existing conservative reason/refetch semantics |
| genuine MP-04 ABSENT                                                   | BLOCKED; never handled automatically                            |
| durable MP-06 COMPLETED plus native MP-04/Horae CONFIRMED              | HANDLED_AUTOMATICALLY                                           |

The final row is exercised only with the LOCAL_DETERMINISTIC_EFFECT_FIXTURE.
It is LOCAL_FIXTURE_ONLY and NO_REAL_EXTERNAL_EFFECT.

The accepted false-positive protections remain:

APPROVED_NOT_HANDLED_AUTOMATICALLY

QUEUED_NOT_HANDLED_AUTOMATICALLY

CLAIMED_NOT_HANDLED_AUTOMATICALLY

EXECUTION_ATTEMPTED_NOT_HANDLED_AUTOMATICALLY

PROVIDER_ACCEPTED_NOT_HANDLED_AUTOMATICALLY

SES_MESSAGE_ID_NOT_HANDLED_AUTOMATICALLY

UNKNOWN_NOT_HANDLED_AUTOMATICALLY

ABSENT_NOT_HANDLED_AUTOMATICALLY

PRODUCT_VIEW_NOT_AUTHORITY

ACTIVITY_NOT_AUTHORITY

## Validation and guarded skips

Focused MP-08B run in this freeze worktree:

- 8 focused files selected;
- 6 files passed and 2 files were fully guarded;
- 50 passed;
- 27 guarded skips;
- 0 failed.

The focused run included RUNTIME-02, FATES-01, APPROVAL-01, QUEUE-01,
EXECUTION-01, PROVIDER-01B, PROJECTION-01, and RECONCILIATION-READ-01. The
real external Fates/Horae portions remained guarded because the corresponding
environment roots were not supplied to this offline verification.

Full canonical run:

- 20 test files passed and 2 files were fully guarded;
- 343 passed;
- 43 guarded skips;
- 0 failed.

The 43 skips are explicit external-runtime guards, not hidden ordinary
failures:

- 7 MP-03 Ananke admission tests;
- 6 MP-04 durable execution tests;
- 3 MP-05 real approval tests;
- 5 FATES-01 materialization tests;
- 7 APPROVAL-01 real approval tests;
- 8 QUEUE-01 real queue/worker tests;
- 7 EXECUTION-01 real MP-04/Horae tests.

The default test path contains no active SES live test and no active AWS,
Bedrock, or Strands inference call.

Canonical checks:

- typecheck: passed;
- lint: passed;
- format:check: passed;
- full Vitest: passed, 343 passed / 43 guarded skips / 0 failed;
- build: passed;
- npm run check: passed;
- git diff --check: passed on the final staged freeze diff;
- npm ci --ignore-scripts: passed with the existing lockfile;
- bounded secret/path/static effect audit: passed.

The permitted npm audit reported the known two moderate Vitest-related
findings, GHSA-82fw-gwwq-j7x9, in @vitest/mocker. Remediation requires a
breaking Vitest upgrade. No audit fix or dependency change was performed.

## Capability matrix

The following is the truthful capability matrix for the explicit pre-live
local composition when its verified local dependencies are supplied:

| Capability                  | State                                     | Meaning                                                                  |
| --------------------------- | ----------------------------------------- | ------------------------------------------------------------------------ |
| liveStrands                 | false in this offline candidate run       | MP-08A live Strands was proven separately; no inference was invoked here |
| liveFates                   | true when verified FATES-006B is supplied | real accepted admission materialization, not a test adapter              |
| durableApproval             | true                                      | FATES-008A local durable approval state                                  |
| durableLocalQueue           | true                                      | local durable queue and activity state                                   |
| boundedWorker               | true                                      | bounded claim/lease worker path                                          |
| nativeReconciliationRead    | true                                      | read-only MP-04/Horae durable lookup                                     |
| trustedNativeProjection     | true                                      | deterministic read-side MP-07 composition                                |
| SESProviderAdapterReady     | true                                      | offline governed adapter and observation seam                            |
| hostedDurableQueue          | false                                     | no hosted/multi-writer durability proof                                  |
| publicTrustedAuthentication | false                                     | only explicit trusted local operator context exists                      |
| externalEffects             | false                                     | no provider invocation or external effect occurred                       |
| deployed                    | false                                     | no deployment was performed                                              |

The default synthetic launcher independently reports its synthetic capability
descriptor; it must not be confused with this explicit local composition.

## Remaining blockers and ordered plan

### LIVE_EFFECT

Provider-02 still requires SES sandbox sender and recipient setup, explicit
server-side runtime configuration, one authorized SendEmail write, and
independent delivery/effect observation. The live procedure must use synthetic
appointment data, exactly one write, no blind retry, and conservative UNKNOWN
handling for an ambiguous send.

### HOSTED_RUNTIME

A hosted launcher and composition are not yet established. The verified
FATES-006B, FATES-008A, Horae, and Runtime Contracts materializations must be
packaged or mounted through an immutable, deployable mechanism.

### AUTHENTICATION

The trusted local operator context is not public authentication. A hosted
runtime still needs a trusted authenticated operator boundary before public
approval transport.

### DURABILITY

Local SQLite/filesystem durability is not a hosted multi-writer state contract.
Hosted approval, queue, activity, and reconciliation storage must be selected
and proven in a later deployment design.

### PACKAGING

The external runtimes currently rely on verified checkout/build material and
provenance metadata. Deployment packaging must preserve those identities
without mutable Git assumptions.

### AWS_INFRASTRUCTURE

Future work may require least-privilege workload permission, HTTPS ingress,
logging/cost controls, and rollback/teardown. No AWS infrastructure is part of
this freeze.

### ACCEPTANCE_EVIDENCE

MP-08B acceptance evidence still requires the separately authorized live
effect, hosted/deployment evidence, and the applicable acceptance review.
MP-09 remains not accepted.

Dependency order:

1. REMOTE_SAFE: independent review of this frozen candidate and Provider-02
   runbook; no source repair is needed by this audit.
2. INTERACTIVE_OPERATOR: configure the dedicated SES sandbox sender/recipient
   and approve the exact one-write smoke.
3. AWS_LIVE: execute Provider-02, capture provider identity, obtain the
   independent observation, and reconcile through Horae without blind retry.
4. DEPLOYMENT: materialize trusted authentication, hosted durability, external
   runtimes, immutable packaging, HTTPS, and operational controls.
5. ACCEPTANCE_EVIDENCE: collect the bounded MP-08B/MP-09 evidence only after
   the preceding boundaries are actually proven.

## Security and publication state

The following properties remain preserved:

MODEL_OUTPUT_NOT_AUTHORITY

FATES_DECISION_NOT_MODEL_DECISION

BROWSER_STATE_NOT_AUTHORITY

PRODUCT_VIEW_NOT_AUTHORITY

ACTIVITY_NOT_AUTHORITY

IAM_NOT_FATES_AUTHORITY

APPROVAL_NOT_EXECUTION

QUEUE_ITEM_NOT_EFFECT

WORKER_CLAIM_NOT_EFFECT_AUTHORITY

EXECUTION_ATTEMPT_NOT_EFFECT

EXECUTOR_RETURN_NOT_EFFECT_TRUTH

PROVIDER_REQUEST_NOT_EFFECT

PROVIDER_SUCCESS_NOT_EFFECT_CONFIRMED

SES_MESSAGE_ID_NOT_EFFECT_CONFIRMED

UNKNOWN_NOT_CONFIRMED

NO_RECORD_NOT_ABSENT

READ_NOT_RECOVER

NO_TEST_FALLBACK

SYNTHETIC_NOT_LIVE

FAIL_CLOSED_UNKNOWN_STATE

LOCAL_DETERMINISTIC_EFFECT_FIXTURE_NOT_REAL_EXTERNAL_EFFECT

No AWS, SES, STS, Bedrock, Strands inference, IAM, deployment, authentication,
provider, or publication action was performed. No credentials, personal
recipient, account identifier, or live SES identity was added to the evidence.

## Freeze result

MOIRAE_MP08B_PRELIVE_INTEGRATION_01_COMPLETE

MP08B_LINEAR_ANCESTRY_VERIFIED

MP08B_PRELIVE_CANDIDATE_FROZEN

ALL_OFFLINE_PROTOCOL_BOUNDARIES_INTEGRATED

TRUSTED_NATIVE_MP07_PROJECTION_READY

GOVERNED_SES_ADAPTER_READY

LIVE_EXTERNAL_EFFECT_NOT_EXECUTED

MP08A_ACCEPTED

MP08B_NOT_DEPLOYED

MP08B_NOT_ACCEPTED

MP09_NOT_ACCEPTED

NO_AWS_CALLS

NO_REAL_EXTERNAL_EFFECT

NO_DEPLOYMENT

NO_PUBLICATION

This document is evidence of the pre-live candidate only. It is not
MP08B_DEPLOYMENT, MP08B_ACCEPTANCE, or MP09_ACCEPTANCE.
