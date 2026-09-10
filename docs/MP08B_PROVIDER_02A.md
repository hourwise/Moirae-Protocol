# MP-08B Provider-02A — SES Sandbox and Independent Delivery Observation Setup

Status: complete for the authorized AWS setup boundary. This document records
the bounded SES sandbox, observation, and least-privilege preparation only. It
does not authorize or perform Provider-02B.

## Scope and starting state

This worktree starts from the clean Provider-01B/Frontend-01 terminal:

\`\`\`text
commit: 8497edf2536a6339e6e3ba525d42d961402d2ddc
tree: 37554618bae65a84650bf418be4ea19c38e7e7ed
branch: codex/mp08b-provider-02a-ses-observation-setup
region: eu-west-2
\`\`\`

The accepted MP-07 baseline remains \`mp-07-accepted-v1\`, peeled to
\`983b785bd68e06d280a5af2898d3b43533688518\`. Package state was not changed:

\`\`\`text
package.json: 83e0929ec5d7464ca5486d6b50a6d5ac444c99bd
package-lock.json: 3abda7ef393cd7dc14ebcab88d8d231c3caa51e8
\`\`\`

The authenticated operator was independently reconciled as the non-root IAM
user \`philip-admin\`. The earlier spelling \`philip.admin\` was not used for the
role trust policy. No account identifier is recorded here.

## SES account and identity state

The selected region is \`eu-west-2\`. SES remains in sandbox mode, with sending
enabled and account enforcement healthy. The dedicated sender and dedicated
sandbox recipient supplied by the operator both report \`SUCCESS\`/verified.
The addresses are intentionally omitted from this document and from the
machine-readable evidence.

\`\`\`text
SES_ACCOUNT_MODE = SANDBOX
AWS_SESSION_VALID = true
NON_ROOT_OPERATOR_CONFIRMED = true
REGION_EU_WEST_2 = true
SENDER = VERIFIED_DEDICATED_IDENTITY
RECIPIENT = VERIFIED_DEDICATED_IDENTITY
\`\`\`

AWS sent two identity-verification messages while the two identities were
created. Those messages are setup activity, not Moirae application email and
not a Provider-02B effect.

## Observation architecture

The bounded independent observation path is:

\`\`\`text
SES SendEmail with trusted configuration set
↓
SES event destination
↓
SNS topic
↓
SQS observation queue
↓
bounded future observation reader
↓
Horae evidence/reconciliation
\`\`\`

The logical resources created for this isolated setup are:

| Resource              | Logical name                 | State               |
| --------------------- | ---------------------------- | ------------------- |
| SES configuration set | \`moirae-mp08b-demo\`        | ready               |
| SES event destination | \`moirae-mp08b-observation\` | enabled, SNS target |
| SNS topic             | \`moirae-mp08b-ses-events\`  | ready and tagged    |
| SQS queue             | \`moirae-mp08b-ses-events\`  | ready and tagged    |
| SES template          | \`appointment-details-v1\`   | ready               |
| future send role      | \`MoiraeMp08bSesSmokeRole\`  | ready               |

The event destination is configured for the supported event types:

\`\`\`text
SEND
DELIVERY
BOUNCE
REJECT
COMPLAINT
DELIVERY_DELAY
\`\`\`

The SNS-to-SQS subscription retains the normal SNS envelope rather than using
raw message delivery. A future reader must parse the envelope and then parse
the SES event message; it must not treat an arbitrary SNS notification as an
SES delivery event.

The queue policy allows only the selected SNS topic, through an explicit
\`aws:SourceArn\` restriction. No public principal or broad SNS permission was
configured. The subscription is active.

The queue contained one visible AWS-generated event-destination validation
notification during final setup inspection. Its message was classified as
setup validation, not an SES \`SEND\`/\`DELIVERY\` event; it was not deleted. No
Moirae SendEmail operation has occurred and there is no effect attempt to
classify as absent:

\`\`\`text
PRE_SEND_OBSERVATION_BASELINE_ESTABLISHED = true
MOIRAE_SES_EVENTS_BEFORE_PROVIDER_02B = 0
NO_EFFECT_ATTEMPT_YET = true
\`\`\`

Provider-02B must explicitly exclude or acknowledge this known setup residue
before opening its one-write observation window.

## Provider-01B compatibility

Provider-01B already supplied the bounded SES action and deterministic event
tags:

\`\`\`text
moirae-execution-id
moirae-correlation-id
moirae-idempotency-key
\`\`\`

The event destination also supplies SES-native message identity and destination
data. A small trusted configuration gap was found: the offline adapter did not
yet place the trusted configuration-set name into \`SendEmailCommandInput\`.
The only source change in this task adds the server-side
\`configurationSetName\` field and maps it to \`ConfigurationSetName\`. It is
strictly validated, cannot be supplied by ActionIntent, browser state, or
model output, and is covered by the focused offline adapter test.

No provider policy, approval, queue, execution, reconciliation, or product
semantics were changed.

## Least-privilege send role

The dedicated role is:

\`\`\`text
MoiraeMp08bSesSmokeRole
\`\`\`

Its trust relationship names only the authenticated \`philip-admin\` IAM user.
The inline policy \`MoiraeMp08bSesSendOnly\` permits only \`ses:SendEmail\` and is
restricted to the verified sender identity, the selected SES configuration set,
and the fixed \`appointment-details-v1\` template. Conditions restrict the From
address and all recipients to the dedicated operator-supplied demo identities.
The role has no identity-management, configuration-management, observation,
IAM, or account-management permissions.

Role assumption was validated with temporary credentials held only in process.
No access key, secret, session token, or account ARN was printed, persisted, or
committed. The role is a future Provider-02B runtime boundary, not Fates
authority and not proof that an effect occurred.

## Provider-02B binding and evidence rules

Provider-02B is not run by this slice. Its exact bounded plan is:

1. Re-verify the clean approved source candidate and the intended non-root
   operator context.
2. Use the trusted region \`eu-west-2\`, the dedicated verified sender, the
   dedicated verified sandbox recipient, configuration set
   \`moirae-mp08b-demo\`, and template \`appointment-details-v1\`.
3. Use synthetic appointment data only; do not use customer or contact data.
4. Confirm the observation queue contains no unacknowledged Moirae SES event
   before the write window. The known setup validation notification is not an
   SES effect event and must not be confused with one.
5. Authorize exactly one \`SendEmail\` write. \`MAX_SEND_ATTEMPTS = 1\` and
   \`NO_AUTOMATIC_RETRY\`.
6. Capture the non-secret SES \`MessageId\` and preserve the existing execution,
   correlation, and idempotency identities.
7. Read the independently delivered SES event from the SNS/SQS path. Do not
   infer delivery from the SDK return or MessageId.
8. Require a matching event bound to the same message identity, expected
   destination, and Moirae correlation tags before producing a Horae-confirmed
   candidate.
9. Treat a missing, delayed, malformed, contradictory, or ambiguous event as
   \`UNKNOWN\`/reconciliation-required. Do not resend.
10. Stop after this one-write evidence bundle. No second diagnostic send is
    authorized by Provider-02A.

SES sandbox identity verification is not delivery confirmation. A successful
SES API response and a MessageId are provider invocation evidence only:

\`\`\`text
SES_SETUP != EFFECT
SES_IDENTITY_VERIFIED != EFFECT
SES_ROLE_READY != EFFECT
SES_MESSAGE_ID != DELIVERY_CONFIRMED
PROVIDER_SUCCESS != HORAE_CONFIRMED
\`\`\`

## Safety and publication state

The following remain true:

\`\`\`text
MODEL_OUTPUT_NOT_AUTHORITY
FATES_DECISION_NOT_MODEL_DECISION
IAM_NOT_FATES_AUTHORITY
APPROVAL_NOT_EXECUTION
QUEUE_ITEM_NOT_EFFECT
WORKER_CLAIM_NOT_EFFECT_AUTHORITY
EXECUTION_ATTEMPT_NOT_EFFECT
PROVIDER_REQUEST_NOT_EFFECT
PROVIDER_SUCCESS_NOT_EFFECT_CONFIRMED
SES_MESSAGE_ID_NOT_EFFECT_CONFIRMED
PROVIDER_CREDENTIAL_NOT_AUTHORITY
UNKNOWN_NOT_CONFIRMED
NO_TEST_FALLBACK
BROWSER_STATE_NOT_AUTHORITY
SYNTHETIC_NOT_LIVE
\`\`\`

The default launcher remains the explicitly labelled synthetic local demo. No
SES transport is wired into it, and the offline test transport cannot claim a
real external effect.

Counts for this task are:

\`\`\`text
APPLICATION_SES_SEND_CALLS = 0
REAL_SES_TRANSPORT_INVOCATIONS = 0
MOIRAE_EMAILS_SENT = 0
REAL_MOIRAE_EXTERNAL_EFFECTS = 0
BEDROCK_CALLS = 0
STRANDS_LIVE_INFERENCE_CALLS = 0
\`\`\`

Two SES identity-verification requests were made as part of setup. Their AWS
verification messages are explicitly excluded from the Moirae application
effect count:

\`\`\`text
SES_IDENTITY_VERIFICATION_REQUESTS = 2
AWS_VERIFICATION_EMAILS_ARE_SETUP_NOT_MOIRAE_EFFECTS
\`\`\`

## Capability state and classification

The offline/pre-live capability facts remain:

\`\`\`text
liveFates = true
durableApproval = true
durableLocalQueue = true
boundedWorker = true
hostedDurableQueue = false
externalEffects = false
\`\`\`

The newly prepared provider/setup readiness facts are:

\`\`\`text
sesSandboxReady = true
sesSenderVerified = true
sesRecipientVerified = true
sesObservationReady = true
sesSendRoleReady = true
providerAdapterConfigurationCompatible = true
\`\`\`

These are setup/readiness facts only. They do not change
\`externalEffects\`, do not produce \`HANDLED_AUTOMATICALLY\`, and do not mean
MP-08B or MP-09 acceptance has occurred.

\`\`\`text
MOIRAE_MP08B_PROVIDER_02A_COMPLETE
SES_SANDBOX_READY
DEDICATED_SENDER_VERIFIED
DEDICATED_RECIPIENT_VERIFIED
SES_DELIVERY_OBSERVATION_PATH_READY
LEAST_PRIVILEGE_SEND_ROLE_READY
GOVERNED_SES_ADAPTER_LIVE_CONFIG_READY
READY_FOR_EXACTLY_ONE_PROVIDER_02B_SEND
APPLICATION_SES_SEND_CALLS_ZERO
REAL_MOIRAE_EXTERNAL_EFFECT_NOT_EXECUTED

MP08B_PROVIDER_02A != PROVIDER_02B_LIVE_EFFECT
MP08B_PROVIDER_02A != MP08B_DEPLOYMENT
MP08B_PROVIDER_02A != MP08B_ACCEPTANCE
MP08B_PROVIDER_02A != MP09_ACCEPTANCE
\`\`\`

## Teardown inventory

Do not remove these resources in Provider-02A. After the demo/hackathon work,
review and remove only the resources intentionally created for this setup:

- \`moirae-mp08b-demo\` SES configuration set and event destination;
- \`moirae-mp08b-ses-events\` SNS topic;
- \`moirae-mp08b-ses-events\` SQS queue and its subscription/policy;
- \`appointment-details-v1\` SES template;
- \`MoiraeMp08bSesSmokeRole\` and its \`MoiraeMp08bSesSendOnly\` inline policy;
- the two dedicated SES identities, if they are no longer needed.

No unrelated identity, configuration set, queue, topic, IAM principal, or
account-wide SES setting is in this teardown inventory.

## Final boundary

This slice crosses only:

\`\`\`text
AWS SES / observation / least-privilege setup
→ READY_FOR_ONE_WRITE
\`\`\`

The next boundary is:

\`\`\`
MP08B_REQUIRES_PROVIDER_02B_EXACTLY_ONE_LIVE_EFFECT
\`\`\`

It must be separately authorized and must preserve the one-write, independent
observation, and conservative reconciliation rules above.
