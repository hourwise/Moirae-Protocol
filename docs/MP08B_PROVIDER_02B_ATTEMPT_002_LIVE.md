# MP-08B Provider-02B Attempt-002 live evidence

## Authority and execution identity

- Accepted R6 tag: `mp-08b-provider-02b-r6-fresh-attempt-accepted-v1`
- Accepted R6 tag object: `35df7a3756b2d38b04527de1f6ae5aaf45c0c5fe`
- Accepted R6 commit: `5af4084ee96c04350966c7ce583f2c22d9323223`
- Accepted R6 tree: `255e2f3b2405a8dd6f46a7dcd1ba86e37583e943`
- Attempt: `MP08B-PROVIDER-02B-ATTEMPT-002`
- Lifecycle: `CREATE_FRESH`
- Fresh request identity: independently generated and recorded only by SHA-256 digest
- Historical Attempt-001: byte-for-byte preserved and never used as authority

The trusted host supplied the same verified recipient ephemerally to MP-03,
FATES-006C, MP-04, and the SES request builder. No address is recorded here.
Real Fates returned `REQUIRE_APPROVAL` / `WAITING_FOR_APPROVAL`. One new durable
five-minute approval was created, its exact presentation-bound human decision
was recorded, and a new post-decision operator authorization was received.

## Governed effect result

The new MP-06 work, delivery, and claim reached MP-04 with the exact approved
action. The runner durably recorded `SEND_STARTED` before entering the governed
SES transport. Exactly one provider invocation was attempted. SDK automatic
retry count remained zero and the configured SES client retained
`maxAttempts: 1`.

The provider invocation returned `UNKNOWN` with no provider operation ID.
Subsequent non-destructive SQS observation found no event matching all three
fresh correlation identities. Accordingly:

- Horae result: `UNKNOWN`
- MP-06 result: `RECONCILIATION_REQUIRED`
- MP-07 product category: `BLOCKED`
- independent effect confirmation: absent
- resend: prohibited

Provider success and a provider message ID were not treated as effect truth.
No claim of confirmed delivery is made.

## Exactly-once and preservation evidence

- Durable provider invocation count: `1`
- Durable automatic retry count: `0`
- `SEND_STARTED`: present
- Attempt-002: permanently consumed
- second `SEND_STARTED`: refused
- duplicate `CREATE_FRESH`: refused
- correlated observation count: `0`
- Attempt-001 protected hashes: unchanged before and after the run

This evidence intentionally omits sender and recipient addresses, AWS account
identity, credentials, session material, provider operation identifiers,
approval/decision identifiers, delivery/claim identifiers, and the operator's
authorization phrase.

## Classification

`MOIRAE_MP08B_PROVIDER_02B_ATTEMPT_002_OBSERVATION_INCOMPLETE`

`EXACTLY_ONE_PROVIDER_INVOCATION`

`ATTEMPT_002_CONSUMED`

`NO_SECOND_SEND`

`HORAE_UNKNOWN`

`MP07_NOT_HANDLED_AUTOMATICALLY`

`OBSERVATION_ONLY_RECOVERY_REQUIRED`

`ATTEMPT_001_PERMANENTLY_PRESERVED`
