# MP-08B Provider-02B-R3 — Exactly-one SES effect preparation

Status: preparation complete only. The one permitted SES effect was not
executed.

This slice starts from the existing clean R3 worktree at
`0c7cf24778e3091ebdcad24c45cc34be1614e4c9` / tree
`68b91817880b0df54c33a9fee0ef7ae726c7902e`. Git registers the worktree at
the repository's canonical internal path
`D:\Users\fleur\Moirae Protocol\.worktrees\mp08b-provider-02b-r3-reprepare-live-effect`.
The sibling spelling supplied in the operator prompt was not a filesystem
path; no worktree was recreated or substituted.

## Authority and AWS preflight

The accepted authority state remains the local MP-03/FATES-006C integration
tag `mp-03-fates-006c-integration-accepted-v1`. The accepted Ananke runtime is
the existing clean FATES-006C worktree and its annotated tag
`ananke-fates-006c-trusted-recipient-admission-v0.1.0-protocol-1.4.0`; no
Ananke source was changed.

The refreshed `moirae-dev` profile passed a read-only STS identity check as
the intended non-root operator `philip-admin`. Account identifiers, access
keys, secrets, and session tokens were not printed or persisted.

Read-only AWS readiness was independently revalidated in `eu-west-2`:

```text
SES_ACCOUNT_SANDBOX_HEALTHY = true
SES_CONFIGURATION_SET_READY = true
SES_EVENT_DESTINATION_READY = true
SES_TEMPLATE_READY = true
SES_IDENTITIES_TWO_VERIFIED = true
IAM_TRUST_PHILIP_ADMIN = true
IAM_INLINE_SEND_ONLY = true
IAM_NO_ATTACHED_POLICIES = true
SQS_OBSERVATION_QUEUE_READABLE = true
SNS_SQS_SUBSCRIPTION_ACTIVE = true
SQS_POLICY_SOURCE_TOPIC_RESTRICTED = true
```

The observation queue contained one visible setup-validation residue. It was
not deleted or treated as a Moirae `SEND`/`DELIVERY` event. The pre-send
baseline therefore remains: no Moirae provider event and no application
effect attempt.

## Trusted provider boundary

The real sender and recipient are runtime/operator-only values. They are
supplied to the live preparation command through ephemeral environment
configuration and are never placed in Git, logs, or this document. The
committed provider policy remains one exact configured recipient, one fixed
`appointment-details-v1` template, the trusted `moirae-mp08b-demo`
configuration set, and region `eu-west-2`.

`apps/host/src/provider-02b-runner.ts` adds the bounded Provider-02B runner
and durable attempt ledger. It preserves the following sequence:

```text
real Fates REQUIRE_APPROVAL
↓
durable MP-05 host binding
↓
explicit human approval
↓
durable MP-06 queue claim
↓
fresh MP-03 / MP-04 authority checks
↓
one guarded SES request
↓
independent SES event observation
↓
Horae-compatible reconciliation
```

The runner records exactly one provider invocation budget and zero automatic
retries. The durable guard refuses any second call after `SEND_STARTED`,
including after a process restart. The live entry point accepts only the exact
phrase `AUTHORIZE PROVIDER-02B SEND NOW`; the preparation task never supplied
that authorization to the live entry point.

The preparation command uses a disabled transport. It can create a temporary
durable pending approval and a `PREPARED` Attempt-001 ledger without invoking
SES. A dry-run request is bound to the exact ActionIntent, configured
destination, template, configuration set, execution identity, and approval
binding. It is request-mapping evidence only, not provider or effect evidence.

## Boundaries preserved

```text
MODEL_OUTPUT_NOT_AUTHORITY
FATES_DECISION_NOT_MODEL_DECISION
TRUSTED_HOST_CONTEXT_PRESERVED
IAM_NOT_FATES_AUTHORITY
APPROVAL_NOT_EXECUTION
QUEUE_ITEM_NOT_EFFECT
WORKER_CLAIM_NOT_EFFECT_AUTHORITY
PROVIDER_REQUEST_NOT_EFFECT
PROVIDER_SUCCESS_NOT_EFFECT_CONFIRMED
SES_MESSAGE_ID_NOT_EFFECT_CONFIRMED
UNKNOWN_NOT_CONFIRMED
NO_BLIND_RETRY
NO_POST_APPROVAL_RESEND
HORAE_NOT_REQUIRED_UNTIL_POST_APPROVAL_EXECUTION
MNEMOSYNE_NOT_REQUIRED_FOR_MP05
SOL_FRONTEND_LUNA_BACKEND_PRESERVED
```

Horae is only the post-approval execution/reconciliation boundary and was not
invoked by preparation. Mnemosyne remains outside MP-05/Provider-02B. Sol and
Luna remain proposal/model surfaces only; neither supplies approval,
recipient policy, hashes, trusted time, admission, execution eligibility, or
effect truth.

## Current state

```text
MOIRAE_MP08B_PROVIDER_02B_R3_PREP_COMPLETE
PROVIDER_02B_AUTHORITY_BLOCKER_RESOLVED
ACCEPTED_AUTHORITY_STATE_BOUND
REAL_LIVE_INTENT_REQUIRE_APPROVAL_CONFIRMED
TRUSTED_REAL_RECIPIENT_POLICY_BOUND
DURABLE_APPROVAL_PREPARED
LIVE_REQUEST_DRY_RUN_EXACTLY_BOUND
SES_AUTOMATIC_RETRY_DISABLED_CONFIRMED
SECOND_SEND_REFUSAL_CONFIRMED
OBSERVATION_BASELINE_READY
ATTEMPT_001_UNCONSUMED
NO_LIVE_SEND
NO_EXTERNAL_EFFECT
READY_FOR_EXPLICIT_PROVIDER_02B_AUTHORIZATION
```

`MP08B_NOT_DEPLOYED`, `MP08B_NOT_ACCEPTED`, and `MP09_NOT_ACCEPTED` remain
unchanged. The stale R2 worktree was not resumed and its three pre-existing
untracked files remained untouched.

## Next boundary

The next action is a separate explicit operator authorization of the one
permitted live effect. Preparation does not authorize it, and no automatic
continuation is provided here.
