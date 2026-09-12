# MP-03 / FATES-006C Integration Acceptance

Status: independently accepted locally on 2026-09-12. Provider-02B was not
resumed.

## Accepted identities

The reviewed Moirae candidate is commit
`af2f22c1b29b22640b09a4280e0b06e27e140720`, tree
`462115ab4ed183ae4c40bddfd0e7d1ade93b5055`, with the sole parent
`cf9c6873cfe5812e965aa85c73aada3b4b60013f`. Its subject is
`feat(protocol): integrate accepted FATES-006C authority`.

The external authority is the annotated local tag
`ananke-fates-006c-trusted-recipient-admission-v0.1.0-protocol-1.4.0`, tag
object `4ecb4baddc92d01cabd43f9692966cbb70d703b0`, peeled acceptance commit
`7ce078863edde033d96a896d7e23e11a0a24292b`, and peeled tree
`d237005b96fc1c69818448d5a443a8bf7703f37f`. The accepted implementation is
its direct parent `e96f27008891b9a5d00cb77e4f2f0c1c87f77efb`, tree
`06639f5a27f7810cb10881631f2b0e9e5b10bf93`.

The acceptance commit adds only `docs/FATES-006C-ACCEPTANCE.md` and
`docs/evidence/fates-006c-acceptance.json` relative to the implementation.
There is no production-package delta. The immutable runtime SHA remains
`c89b83de40ed0275969fe3931220f440bf082aa3`.

`FATES006C_ACCEPTANCE_IDENTITY_VERIFIED`

`FATES006C_RUNTIME_SOURCE_EQUIVALENT_TO_ACCEPTED_IMPLEMENTATION`

## Diff and provenance certification

The exact candidate diff is bounded to trusted runtime composition, the MP-03
and MP-05 authority adapters, integration tests, and integration evidence. It
does not change SES transport, retry or provider execution behavior, MP-06 or
MP-04 execution semantics, Horae, frontend, deployment, package manifests,
lockfile, or dependencies.

The lineage remains explicit rather than rewritten:

- FATES-006B introduced accepted MP-03 administrative admission.
- FATES-008A introduced accepted durable human approval.
- FATES-006C descends directly from FATES-008A and adds the trusted exact
  recipient authority profile.

The verified FATES-006C runtime can safely supply current admission and its
inherited durable approval capability through one real Gateway while the
historical capability records remain auditable.

`MOIRAE_FATES006C_INTEGRATION_DIFF_CERTIFIED`

`UNIFIED_FATES006C_RUNTIME_SAFE`

## Trusted configuration and mismatch behavior

The host constructs `Mp08bTrustedRecipientAuthorityConfig` with independently
named `moirae` and `fates` values. The Moirae value is
`Mp03TrustedAdministrativeProfileConfig.appointmentDetailsRecipient`; the
Fates value is
`MoiraeAdministrativeProfileConfig.appointmentDetailsRecipient`.

The host passes the Fates value only to the accepted profile registration and
the Moirae value only to the MP-03 mapping policy. Neither value is derived
from ActionIntent, model output, browser/request state, provider metadata, or
IAM/AWS identity. An exact disagreement fails before materialization or
admission with `TRUSTED_RECIPIENT_POLICY_MISMATCH`. No side is selected, no
fallback is used, and no recipient is translated or substituted.

## Real joint proof

The independently rerun central test used the real Moirae MP-03 adapter, the
immutable accepted FATES-006C runtime, and its real Gateway. With the synthetic
recipient `trusted-demo@example.test`, the exact identity chain was:

`TRUSTED_HOST_POLICY_RECIPIENT = ACTIONINTENT_RECIPIENT = MP03_NATIVE_RECIPIENT = FATES_APPROVAL_RECIPIENT`

Mapping succeeded without translation. Fates returned decision
`REQUIRE_APPROVAL` and status `WAITING_FOR_APPROVAL`; Moirae returned
`WAITING_FOR_APPROVAL`. The executor was not invoked and no effect executed.
The configured path did not substitute the historical `alex@example.test`
fixture.

The mismatch matrix independently passed for matching A/A/A, mismatched
A/A/B, trusted-policy mismatch A/B/A and A/B/B, legacy default/default/alex,
and configured/configured/alex. All mismatches fail closed and configured mode
has no legacy fallback.

`REAL_JOINT_REQUIRE_APPROVAL_ACCEPTANCE_CONFIRMED`

`RECIPIENT_IDENTITY_CHAIN_ACCEPTED`

## Hash, presentation, and durable approval

Different exact recipients produce different native action identities and
hashes. The durable approval record, full approval hash, and MP-05 presentation
digest reproduce the configured recipient binding. An approval identifier and
presentation created for recipient A fail closed in the recipient B runtime.

The inherited FATES-008A flow remains intact: `REQUIRE_APPROVAL` creates a
durable pending record; an exact re-read reproduces the action and presentation
bindings; a synthetic authorized decision applies only to that exact record;
and replay or mismatch fails closed. Approval creates no execution result.

`JOINT_ACTION_RECIPIENT_HASH_BOUND`

`JOINT_APPROVAL_PRESENTATION_BOUND`

`APPROVAL_FOR_RECIPIENT_A_NOT_VALID_FOR_B`

`FATES008A_DURABLE_APPROVAL_BEHAVIOR_PRESERVED`

`APPROVAL_NOT_EXECUTION`

## Authority, compatibility, and boundaries

The adapter preserves native outcomes: Fates `DENY` remains rejection,
boundary/unknown failure remains failure, and Fates `REQUIRE_APPROVAL` maps to
Moirae `WAITING_FOR_APPROVAL`. The adapter cannot manufacture `ALLOW`,
`REQUIRE_APPROVAL`, or an approval outcome. The default unconfigured
`alex@example.test` fixture and unrelated administrative actions remain
unchanged.

Adversarial coverage rejects arbitrary same-domain, one-character, plus-suffix,
malformed, empty, and wildcard-like recipient values as required by the
contracts. It also proves that action, model, browser, provider, and IAM data
cannot configure either policy; configuration A cannot silently become B; and
approval A cannot authorize B.

No acceptance test reached MP-04 execution, an SES adapter, or an AWS SDK send.
The Provider-02B R2 worktree and its three known pre-existing untracked runner
files remained untouched.

`ADAPTER_DOES_NOT_CREATE_FATES_AUTHORITY`

`LEGACY_FIXTURE_PRESERVED`

`OTHER_ADMINISTRATIVE_ACTIONS_UNCHANGED`

`NO_PROVIDER_INVOCATION`

`NO_AWS_CALL`

`NO_SES_CALL`

`NO_EXTERNAL_EFFECT`

## Independent validation

- Focused joint and boundary suites: 4 files, 80 passed, 0 failed.
- Accepted real Fates profile/admission/durable-store suites: 3 files, 49
  passed, 0 failed.
- Canonical `npm.cmd run check`: typecheck, lint, repository formatting, tests,
  and build passed; 24 test files, 425 passed, 9 intentional skips, 0 failed.
- `git diff --check`: passed.

The known 12 Ananke stale-clock replay failures remain unrelated accepted
baseline debt and were not changed or remediated.

The candidate contains only synthetic `.test` recipients. It contains no real
SES recipient or sender, AWS account ID, credential, temporary session
material, or verification URL. Package manifests and the lockfile are
unchanged, and no dependency was added.

## Acceptance decision

`MOIRAE_MP03_FATES006C_INTEGRATION_ACCEPTED`

`ACCEPTED_FATES006C_AUTHORITY_BOUND_TO_MOIRAE`

`REAL_JOINT_REQUIRE_APPROVAL_ACCEPTED`

`RECIPIENT_IDENTITY_CHAIN_ACCEPTED`

`ACTION_RECIPIENT_HASH_BOUND`

`APPROVAL_PRESENTATION_BOUND`

`DURABLE_APPROVAL_COMPATIBILITY_ACCEPTED`

`APPROVAL_FOR_RECIPIENT_A_NOT_VALID_FOR_B`

`NO_RECIPIENT_TRANSLATION`

`NO_POLICY_SELF_AUTHORIZATION`

`NO_EXTERNAL_EFFECT`

`PROVIDER_02B_AUTHORITY_BLOCKER_RESOLVED`

`PROVIDER_02B_NOT_RESUMED`

This resolves only the prior MP-03/Fates recipient compatibility blocker. It
does not assert that Provider-02B ran, SES sent, a live effect was confirmed, or
MP-08B was accepted.
