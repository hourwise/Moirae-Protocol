# MP-08B Provider-01B — SES v2 Dependency + Offline Governed Adapter

Status: complete as an offline dependency and adapter slice. No AWS or SES
operation was called and no message was sent.

## Boundary and starting point

This candidate descends directly from Provider-01 commit
`95556bfadcea904bc1c324bc92c46f9deaf27ada`. Provider-01 selected:

```text
SEND_APPOINTMENT_DETAILS → AWS SES v2 sandbox
```

This slice crosses only the authorized dependency and offline adapter boundary:

```text
governed MP-04 execution state
→ bounded SES request mapper
→ injected SES v2 transport
→ typed provider invocation result
→ independent observation/evidence seam
→ Horae-compatible reconciliation input
→ stop before AWS/SES invocation
```

`MP08B_PROVIDER_01B != LIVE_EFFECT`

`MP08B_PROVIDER_01B != MP08B_DEPLOYMENT`

`MP08B_PROVIDER_01B != MP08B_ACCEPTANCE`

`PROVIDER_ADAPTER_READY != EFFECT_EXECUTED`

`SES_SEND_ACCEPTED != DELIVERY_CONFIRMED`

`SES_MESSAGE_ID != DELIVERY_CONFIRMED`

`PROVIDER_SUCCESS != HORAE_CONFIRMED`

`NO_REAL_EMAIL_SENT`

## Dependency selection and supply chain

The authorized direct dependency is pinned exactly as:

```text
@aws-sdk/client-sesv2@3.1129.0
```

Public package metadata identifies it as Apache-2.0 licensed and requiring
Node `>=20.0.0`. The repository requires Node `>=22.0.0`, so the package is
compatible with the accepted runtime requirement. It was installed with the
normal npm workflow and `--ignore-scripts`; no AWS client operation was
invoked.

The manifest adds one direct dependency. The lockfile changes are the
legitimate AWS SDK/Smithy dependency graph and integrity records for that
package. No unrelated direct dependency was added or upgraded, and no
transitive package was manually selected.

`npm audit --audit-level=low` reported two existing moderate Vitest-related
findings (`GHSA-82fw-gwwq-j7x9`) in the repository's test dependency range.
The available remediation is a major Vitest upgrade; `npm audit fix` and
unrelated upgrades were not run. No SES-specific finding was reported.

## Governed adapter

`apps/host/src/ses-provider.ts` accepts an already governed ActionIntent plus
execution/approval binding and produces a prepared SES `SendEmail` request only
when all of these checks pass:

- the action is exactly `SEND_APPOINTMENT_DETAILS`;
- the effect class is the accepted `DISCLOSE` class;
- the template is exactly `appointment-details-v1`;
- the ActionIntent target and recipient match the trusted configured demo
  recipient;
- the canonical ActionIntent digest and idempotency key recompute exactly;
- the execution identity carries the same digest and idempotency key;
- approval ID, decision ID, and ActionIntent digest match the approved binding.

The request contains only the fixed SES command, trusted sender, allowlisted
recipient, fixed template name, bounded synthetic template data, and
deterministic Moirae execution/correlation tags. Browser/model fields cannot
supply credentials, account, region, endpoint, sender, headers, configuration
sets, provider commands, or arbitrary message content.

The adapter is not wired into `npm run start`; the accepted default launcher
remains the explicitly labelled synthetic local demo. Installing the SDK does
not change the default runtime mode.

## Trusted configuration and credentials

Server-side provider configuration contains only the region, verified sender
address, and one allowlisted demo recipient. Region and sender are not
ActionIntent fields. The recipient must match both the ActionIntent and the
trusted allowlist. The provider request cannot carry credentials.

`createRealSesV2Transport` requires the explicit
`PROVIDER_02_EXPLICIT` authorization marker, constructs an `SESv2Client` for
the configured region, and uses `SendEmailCommand` only when its transport
method is explicitly invoked. It accepts no endpoint override and uses the
normal future AWS SDK credential-provider boundary. No credentials were read,
printed, persisted, or committed here.

The default `createDisabledSesV2Transport` is deliberately unusable and there
is no fake-provider fallback. Missing/disabled transport remains a typed
unknown invocation result. Constructing a client is not an effect and does not
change `externalEffects`.

`PROVIDER_CREDENTIAL_NOT_AUTHORITY`

`NO_STATIC_CREDENTIAL_COMMITTED`

`NO_CREDENTIAL_LOGGING`

## Invocation and independent observation

`invokePreparedSesRequest` exposes only a typed provider invocation result. An
SES response with a `MessageId` is recorded as transport `ACCEPTED`; it is not
a delivery or effect confirmation. A transport error or response without a
MessageId remains `UNKNOWN`.

The observation seam accepts evidence bound to the provider operation/message
identity, expected recipient, execution identity, Moirae correlation identity,
observation source, and trusted timestamp. Matching `DELIVERED` evidence can
produce a Horae-compatible `CONFIRMED` candidate. Matching `ABSENT` produces
`ABSENT`. Missing, malformed, mismatched, or `AMBIGUOUS` evidence remains
`UNKNOWN` and requires reconciliation.

SES does not provide a general direct API that can be assumed to query a
`MessageId` and prove final delivery. The serious later options are:

| Strategy                                                      | Assessment                                                                                                    |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| SES event destination, such as a configuration-set event path | Machine-verifiable and bindable, but requires separately authorized SES/event infrastructure and correlation. |
| EventBridge/SNS/CloudWatch event path                         | Possible, but adds resources, IAM, setup, and cost outside this slice.                                        |
| Dedicated receiving inbox/operator inspection                 | Useful human evidence, but not by itself strong machine-verifiable Horae evidence.                            |

The preferred future strategy is a narrowly configured SES event destination
that emits delivery evidence bound to the provider message/correlation marker.
No event infrastructure was created. If it is unavailable for Provider-02,
the effect remains `UNKNOWN` rather than being upgraded from the SDK response.

## Correlation and idempotency

The request carries deterministic tags derived from the existing governed
execution identity: execution ID, correlation ID, and the ActionIntent
idempotency key. The prepared request retains the logical work, approval,
decision, claim-generation, attempt, and digest bindings for validation.

SES does not provide application-level exactly-once delivery. Therefore:

```text
ambiguous SES write → UNKNOWN → independent reconciliation → no blind resend
```

This adapter does not claim exactly-once delivery.

## Offline evidence

`tests/mp08b-provider-01b-ses-offline-adapter.test.ts` uses only injected fake
transports. It proves exact request mapping, rejection of unsupported actions,
destination/template/identity binding, disabled-transport fail-closed behavior,
separation of provider success from effect truth, matching and mismatching
observation evidence, `ABSENT`, and `UNKNOWN`/ambiguous outcomes. The real SES
transport is not invoked by tests and no provider credentials or live
destinations are present.

`TEST_TRANSPORT != REAL_PROVIDER`

`LOCAL_DETERMINISTIC_EFFECT_FIXTURE != REAL_EXTERNAL_EFFECT`

## Provider-02 one-write plan — not executed

The next live slice must be separately authorized:

1. Verify the exact clean source SHA/tree and the accepted Provider-01B commit.
2. Configure one non-root workload identity with only required SES send
   permission; keep credentials out of ActionIntent, browser state, logs, and
   evidence.
3. Verify one dedicated SES sandbox sender and one dedicated sandbox recipient.
   Use synthetic appointment data and `appointment-details-v1` only.
4. Select the reviewed region through trusted server configuration.
5. Authorize and perform exactly one `SendEmail` write. Do not retry a lost or
   ambiguous response.
6. Capture the non-secret MessageId and exact Moirae execution/correlation
   identity.
7. Gather only the separately configured, non-mutating delivery observation.
8. Let Horae classify bound evidence as `CONFIRMED`, `ABSENT`, or `UNKNOWN`.
   Only accepted `CONFIRMED` evidence may satisfy MP-06 completion.
9. Stop after the one-write evidence bundle. An email cannot be recalled.

If the event destination or other delivery observation is unavailable, the
live result remains `UNKNOWN`/not accepted. No second send is permitted for
diagnosis. Expected usage is one bounded SES write plus any separately approved
observation infrastructure; no broader cost claim is made here.

## Operator requirements

### `REMOTE_SAFE_NOW`

- Review the pinned SDK, lockfile graph, adapter, and offline evidence.
- Review the fixed action/template/destination policy and no-fallback behavior.
- Separately authorize Provider-02 if live effect evidence is desired.

### `INTERACTIVE_OR_DESKTOP_LATER`

- Verify the dedicated SES sandbox sender and recipient.
- Establish the least-privilege non-root workload identity.
- Configure the SES delivery observation/event path if machine-verifiable
  evidence is required.
- Authorize the single synthetic write and inspect the bounded message if a
  human observation path is used.

None of these operator steps was performed here.

## Capability and classification

The truthful capability state remains:

```text
liveFates          = true
durableApproval    = true
durableLocalQueue  = true
boundedWorker      = true
hostedDurableQueue = false
externalEffects    = false
```

The adapter is ready as a governed provider boundary, but the synthetic
launcher and global capability semantics are not relabelled.

```text
MOIRAE_MP08B_PROVIDER_01B_COMPLETE
SES_V2_DEPENDENCY_PINNED
GOVERNED_SES_ADAPTER_READY
SES_TRANSPORT_DISABLED_BY_DEFAULT
PROVIDER_OBSERVATION_SEAM_READY
PROVIDER_SUCCESS_NOT_EFFECT_CONFIRMED
LIVE_EFFECT_NOT_EXECUTED

MP08A_ACCEPTED
MP08B_NOT_DEPLOYED
MP08B_NOT_ACCEPTED
MP09_NOT_ACCEPTED

NO_AWS_API_CALL
NO_REAL_EXTERNAL_EFFECT
NO_DEPLOYMENT
NO_PUBLICATION
```

The next unavailable boundary is:

`PROVIDER_02_AWS_SES_SANDBOX_SETUP_AND_LIVE_EFFECT_SMOKE`

That boundary includes sender/recipient/workload setup and the one-write
observation decision. It is not started by this commit.
