# MP-03 / FATES-006C Integration 01

Status: local candidate; independent acceptance required. Provider-02B remains blocked.

## Immutable inputs

The Moirae starting point is commit
`cf9c6873cfe5812e965aa85c73aada3b4b60013f`, tree
`9087846e9be90daab657df211859e00f791bbd1c`, parent
`7e161991b4fd0b5b441d6f3fd2916da3b959403d`.

Accepted FATES-006C is the local annotated tag
`ananke-fates-006c-trusted-recipient-admission-v0.1.0-protocol-1.4.0`, tag object
`4ecb4baddc92d01cabd43f9692966cbb70d703b0`, peeled evidence commit
`7ce078863edde033d96a896d7e23e11a0a24292b`, and tree
`d237005b96fc1c69818448d5a443a8bf7703f37f`. The implementation is its direct
parent `e96f27008891b9a5d00cb77e4f2f0c1c87f77efb`, tree
`06639f5a27f7810cb10881631f2b0e9e5b10bf93`. The evidence commit adds only
`docs/FATES-006C-ACCEPTANCE.md` and
`docs/evidence/fates-006c-acceptance.json`; production runtime paths are
unchanged. Therefore:

`FATES006C_RUNTIME_SOURCE_EQUIVALENT_TO_ACCEPTED_IMPLEMENTATION`

The acceptance evidence classifies the tag as local-only and not published.

## MP03_FATES006C_PROVENANCE_AUDIT

Moirae did not collapse admission and approval provenance before this change.
MP-03 admission independently pinned FATES-006B by annotated tag object, peeled
commit, tree, origin, clean checkout, and built runtime. MP-05 independently
pinned FATES-008A and additionally verified the accepted runtime ancestor used
for durable SQLite approval and presentation binding.

The lineage remains explicit:

- FATES-006B introduced the accepted MP-03 administrative admission profile.
- FATES-008A introduced accepted durable human approval.
- FATES-006C is a direct descendant of FATES-008A and adds the trusted exact
  recipient profile. Its accepted runtime ancestor remains
  `c89b83de40ed0275969fe3931220f440bf082aa3`.

The current MP-03 authority pin now identifies FATES-006C. The historical
FATES-006B record remains as `MP03_FATES_006B_HISTORICAL_PROVENANCE`; the MP-05
capability record remains `MP08B_FATES_008A_CAPABILITY_PROVENANCE` and
`MP05_FATES_DEPENDENCY_PROVENANCE`. This preserves capability history while
truthfully recording the runtime supplying it.

Classification: `UNIFIED_FATES006C_RUNTIME_SAFE`.

The durable runtime already constructs one native Gateway for admission,
approval storage, decision handling, and later authority handoff. The accepted
FATES-006C descendant can therefore provide admission and the inherited
FATES-008A approval capability in that same instance. Admission-only
composition remains a smaller mode over the same verified checkpoint; it does
not create a second authority kind.

## Trusted configuration and mismatch behavior

The host supplies `Mp08bTrustedRecipientAuthorityConfig` with two independently
named values:

- `moirae: Mp03TrustedAdministrativeProfileConfig`
- `fates: MoiraeAdministrativeProfileConfig` (the external API has the same
  exact field shape)

The external Fates type is not copied as authority logic. The verified module's
`registerMoiraeAdministrativeOperationProfile(gateway, config)` receives only
the host's `fates` value. `createMp03AdmissionAdapter(..., config)` receives
only the host's `moirae` value. Neither is read from ActionIntent, proposal,
model metadata, browser state, provider metadata, IAM identity, or AWS state.

Before materialization or admission, the host compares the two exact configured
recipient strings. Any difference throws
`TRUSTED_RECIPIENT_POLICY_MISMATCH`; no value is selected, translated, copied
from the request, or rewritten.

## Joint synthetic proof

The real integration test uses only `trusted-demo@example.test` and the real
Gateway loaded from the clean accepted FATES-006C checkout. The trusted
compiler registry, MP-03 policy, Fates policy, ActionIntent target/parameters,
native args, and approval presentation all carry that exact string.

The matching path returns native `REQUIRE_APPROVAL`, Moirae
`WAITING_FOR_APPROVAL`, `executorInvoked: false`, and `effectExecuted: false`.
The durable Fates record is re-read by MP-05, its action and presentation hashes
are independently reproduced, and a synthetic authorized approval decision is
applied only to the exact bound action. The test stops before MP-04 and exposes
no execution result.

The matrix also proves:

- policy A / policy A / action A requires approval;
- policy A / policy A / action B fails at the exact MP-03 mapping;
- policy A / policy B fails during trusted construction for either action;
- default/default `alex@example.test` preserves legacy behavior;
- configured mode rejects `alex@example.test` with no fallback.

Changing A to B changes the native action hash, native approval hash, and MP-05
presentation digest. An approval identifier/presentation for A submitted to the
B runtime fails closed. Fates `DENY` and boundary failure remain unchanged by
the adapter, and an adapter without native authority cannot manufacture
`REQUIRE_APPROVAL` or `ALLOW`.

## Invariants and boundary

`FATES006C_ACCEPTED_AUTHORITY`

`MP03_MAPPING_COMPATIBILITY_NOT_AUTHORITY`

`TRUSTED_HOST_CONFIGURES_POLICY`

`ACTIONINTENT_DOES_NOT_CONFIGURE_POLICY`

`RECIPIENT_IDENTITY_CHAIN_CONFIRMED`

`TRUSTED_HOST_POLICY_RECIPIENT = ACTIONINTENT_RECIPIENT = MP03_NATIVE_RECIPIENT = FATES_APPROVAL_RECIPIENT`

`JOINT_ACTION_RECIPIENT_HASH_BOUND`

`JOINT_APPROVAL_PRESENTATION_BOUND`

`APPROVAL_FOR_RECIPIENT_A_NOT_VALID_FOR_B`

`APPROVAL_NOT_EXECUTION`

`NO_RECIPIENT_TRANSLATION`

`NO_POST_ADMISSION_SUBSTITUTION`

`NO_PROVIDER_INVOCATION`

`NO_EXTERNAL_EFFECT`

`PROVIDER_02B_NOT_RESUMED`

The known 12 stale-clock replay failures in Ananke remain unchanged baseline
debt and are not remediated here. No AWS or SES operation is needed or allowed.
The Provider-02B R2 worktree and its three pre-existing untracked runner files
remain untouched. Provider-02B must not resume until this integration candidate
is independently accepted.
