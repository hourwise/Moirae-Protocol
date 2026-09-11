# MP-08B SES Retry Remediation-01

## Scope

This bounded slice resolves the Provider-02B pre-send blocker
`BLOCKED_SES_AUTOMATIC_RETRY_NOT_DISABLED`. It changes only the governed SES
client retry configuration and adds offline proof. It does not resume
Provider-02B, invoke SES, or create live-effect evidence.

Starting terminal:

```text
commit: d7b2927cdeaa220c751c4f6045d54f4f27c46c96
tree:   58f8924cbbb9442a740b22fafb90a13829cae7f5
SDK:    @aws-sdk/client-sesv2@3.1129.0
```

## Remediation

The sole governed `SESv2Client` construction now supplies:

```text
maxAttempts = 1
```

The existing region, explicit Provider-02 authorization marker, trusted
request mapping, provider-result semantics, and independent Horae observation
boundary are unchanged. An injectable request-handler seam is available only
to offline tests so the pinned SDK retry middleware can be exercised without a
network request. Normal runtime construction does not supply that handler.

## Proof

Focused offline tests verify that:

- the constructed client resolves `maxAttempts` to `1`;
- `AWS_MAX_ATTEMPTS=3` cannot raise the effective value;
- `AWS_MAX_ATTEMPTS=10` cannot raise the effective value;
- standard and adaptive ambient retry modes cannot raise the effective value;
- a retryable fake request-handler failure invokes the underlying handler once;
- the failure remains the existing governed `UNKNOWN` invocation result;
- construction and module import do not invoke the transport;
- provider success and `MessageId` remain non-confirming without independent
  observation.

The fake request handler is offline-only. It does not contact AWS and cannot
produce real effect evidence.

## Preserved semantics

```text
SES_CLIENT_MAX_ATTEMPTS_1
AUTOMATIC_SEND_RETRIES_DISABLED
MAX_REAL_SEND_ATTEMPTS_PER_PROVIDER_INVOCATION = 1
PROVIDER_SUCCESS_NOT_EFFECT_CONFIRMED
SES_MESSAGE_ID_NOT_EFFECT_CONFIRMED
AMBIGUOUS_SEND_RESULT = UNKNOWN
NO_BLIND_RETRY
```

## Safety and status

```text
NO_SEND_ON_IMPORT
NO_SEND_ON_CONSTRUCTION
NO_PROVIDER_02B_SEND_EXECUTED
PROVIDER_02B_ATTEMPT_001_UNCONSUMED
APPLICATION_SES_SEND_CALLS = 0
REAL_SES_TRANSPORT_INVOCATIONS = 0
MOIRAE_EMAILS_SENT = 0
SES_SEND_NETWORK_ATTEMPTS = 0
REAL_MOIRAE_EXTERNAL_EFFECTS = 0
```

No AWS resource, IAM, SES identity, configuration-set, SNS, or SQS state was
changed. No dependency or lockfile change was made.

Provider-02B must be rerun from this remediated terminal. This document does
not authorize the live send and does not contain live SES evidence.
