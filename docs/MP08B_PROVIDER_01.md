# MP-08B Provider-01 — External Effect Provider Selection + Governed Adapter

Status: bounded provider-selection and integration-preparation slice.

This document records a provider decision without invoking a provider, changing
credentials, adding infrastructure, or claiming a live effect.

## Boundary

The starting terminal is the validated Execution-01 commit
`10589a815db8a171f40f56dbc579ee8a21da5d39`. The accepted local chain already
reaches the MP-04/Horae boundary through a deterministic side-effect-free
fixture. Its `CONFIRMED` result is not an external effect.

This slice crosses only:

```text
MP-04/Horae READY
→ select one bounded real provider path
→ define the governed request/observation seam
→ stop before live invocation
```

`MP08B_PROVIDER_01 != LIVE EFFECT`

`MP08B_PROVIDER_01 != MP08B_DEPLOYMENT`

`MP08B_PROVIDER_01 != MP08B_ACCEPTANCE`

`MP08B_PROVIDER_01 != MP09_ACCEPTANCE`

`PROVIDER_SUCCESS != EFFECT_CONFIRMED`

`PROVIDER_CREDENTIAL != AUTHORITY`

`TEST_TRANSPORT != REAL_PROVIDER`

`NO_REAL_EXTERNAL_EFFECT_PERFORMED`

## Supported-action safety audit

The canonical ActionIntent contract currently supports three actions:

| Action                                | Current material                                                                           | Risk and reversibility                                                                                                                                                                           | Demo suitability                                                                                   | Provider conclusion       |
| ------------------------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- | ------------------------- |
| `SEND_APPOINTMENT_DETAILS`            | `DISCLOSE`; booking ID, recipient, fixed template ID; target is a verified requester email | Disclosure is consequential but bounded. Email cannot be recalled, so the destination must be a dedicated verified demo mailbox and the payload must contain synthetic appointment data only.    | Best candidate: one visible message, narrow destination, simple judge story, no calendar mutation. | Preferred action.         |
| `RESCHEDULE_APPOINTMENT`              | `MODIFY`; booking ID, current start, proposed start, fixed `Europe/London` timezone        | Mutates a calendar/appointment and is not safely reversible without a compensating change. Requires a dedicated calendar, OAuth or equivalent, read-after-write, and careful duplicate handling. | Too much operator setup and higher real-world consequence for the first live effect.               | Defer.                    |
| `TRANSMIT_CUSTOMER_CONTACT_DIRECTORY` | `EXPORT`; directory resource, recipient, fixed CSV format                                  | Transmits a directory and creates privacy/data-minimisation risk. It is unsuitable for a first live demonstration even with synthetic fixtures.                                                  | Not appropriate for a live judge effect.                                                           | Exclude from Provider-02. |

The audit is based on the actual `ActionIntentV1` schemas in
`packages/action-contracts/src/index.ts`; the provider layer may not add
arbitrary recipients, resources, headers, or action parameters.

## Selected provider

`PREFERRED_DEMO_EFFECT_ACTION = SEND_APPOINTMENT_DETAILS`

`PREFERRED_REAL_EFFECT_PROVIDER = AWS SES v2 sandbox`

The intended future resource is a single, operator-verified demo destination
and a server-side verified sender. The future message must contain synthetic
appointment data and a bounded template. No production customer record or
contact directory is permitted.

SES is preferred over calendar mutation because it has lower operational blast
radius for a first effect, supports a narrow verified sandbox destination, is
compatible with a later AWS-hosted workload identity, and is visible to a
judge. It is not being called or configured here.

## Provider comparison

### AWS SES v2 — preferred but blocked for implementation

- API class: SES v2 `SendEmail` request.
- Credentials: later workload IAM role or equivalent server-side AWS provider
  credentials; never browser credentials and never ActionIntent data.
- Setup: verified sender and verified sandbox recipient; account sandbox state
  must be checked by the operator later.
- Current repository status: no SES SDK or provider package exists.
- Native Node `fetch` is not sufficient for authenticated SES API use without
  implementing AWS request signing, which is outside this slice and unsafe to
  hand-roll.
- Observation: SES `MessageId` or an HTTP success response is not effect truth.
  Delivery evidence would require a separately configured, bounded event/readback
  path and must be reconciled through Horae.
- Duplicate risk: SES `SendEmail` does not provide the required application-level
  exactly-once guarantee. The Moirae execution identity must be carried into a
  deterministic provider correlation marker and later readback/evidence path;
  an ambiguous write must remain `UNKNOWN` and must not be blindly retried.
- Rollback: email cannot be recalled. Rollback is therefore prevention of
  duplicate dispatch plus durable reconciliation, not message deletion.
- Classification: `SUPPORTED_BUT_NEW_DEPENDENCY_REQUIRED`,
  `SUPPORTED_BUT_OPERATOR_SETUP_REQUIRED`, and
  `SUPPORTED_BUT_LIVE_CREDENTIAL_REQUIRED`.

### SMTP or generic mail transport

No SMTP library, mail account, or trusted transport is present in the
repository. It would add credentials, dependency, destination, and delivery
observation ambiguity.

Classification: `NOT_SUPPORTED` for this bounded slice.

### Google Calendar / Microsoft Graph

These could in principle support a dedicated test calendar, but neither
provider is represented in the repository. They require interactive OAuth or
equivalent credentials, a new provider dependency or transport implementation,
resource setup, and higher-consequence mutation semantics.

Classification: `SUPPORTED_BUT_OPERATOR_SETUP_REQUIRED` and
`TOO_RISKY_FOR_DEMO` as the first live effect.

### Contact-directory provider

No provider is selected. The action's data-export semantics make it unsuitable
for the first live effect.

Classification: `TOO_RISKY_FOR_DEMO`.

## Dependency gate

The repository contains no `@aws-sdk/client-sesv2`, SMTP, Google, Microsoft, or
other provider package. The exact recommended package family for a later
authorized implementation is:

```text
@aws-sdk/client-sesv2
```

No version is pinned in this candidate because adding the dependency is not
authorized and the package registry was not used to mutate or resolve the
repository. The later implementation slice must select and pin one current
reviewed version, record its license/transitive dependency diff, and run the
normal dependency audit before source integration.

Therefore the current classification is:

`PROVIDER_DEPENDENCY_AUTHORIZATION_REQUIRED`

No provider source, fake transport, or incomplete source adapter is added in
this slice. This avoids presenting a request mapper as a deployable SES
transport while authenticated signing and provider observation remain absent.

## MP-04 compatibility

The existing MP-04 port is structurally ready for a provider-backed execution
boundary:

- `Mp04ExecutionPort` accepts the already validated MP-04 execution request;
- `Mp04HoraePort` owns execution and reconciliation state;
- `Mp04EffectAdapterIdentityV1` binds the effect adapter identity into native
  evidence;
- `Mp04ExecutionResultV1` keeps invocation and effect truth separate.

Classification:

`PROVIDER_ADAPTER_PORT_READY`

No MP-04 or Horae semantics are changed. The missing piece is the provider
transport/materialization and its independently observable delivery evidence,
not a new authority path.

## Future governed adapter contract

The future implementation must be server-side and injected behind the existing
MP-04/Horae boundary. It must not be reachable from browser routes or from
model output.

```text
validated MP-04 request
→ fixed SES provider mapper
→ injected SES transport
→ ProviderInvocationResult
→ independent delivery/readback observation
→ Horae reconciliation
→ CONFIRMED / ABSENT / UNKNOWN
```

The transport must be unavailable unless explicitly constructed with the later
reviewed SDK/configuration. Missing configuration must fail closed. There must
be no fake-provider fallback and no `live=true` switch that changes authority.

## Request mapping and data minimisation

The future mapper may use only the exact approved `SEND_APPOINTMENT_DETAILS`
intent:

- `bookingId`;
- `recipientAddress`;
- fixed `templateId = appointment-details-v1`;
- trusted resource/target binding already present in the ActionIntent.

The mapper must obtain the sender identity, SES region/account boundary, and
allowed demo destination from server-side reviewed configuration. It must
reject:

- browser-supplied provider endpoints;
- model-supplied endpoints or headers;
- browser/model credentials;
- arbitrary recipients;
- changed booking/resource values;
- changed ActionIntent or approval binding;
- unsupported provider parameters;
- contact-directory or calendar semantics routed to the email adapter.

`PROVIDER_CREDENTIAL_NOT_AUTHORITY` applies at all times.

## Effect evidence contract

For a later Provider-02 run:

- `CONFIRMED` requires the accepted MP-04/Horae evidence plus an independently
  observed SES delivery/result record bound to the same execution identity,
  destination, message correlation marker, and provider operation identity.
- `ABSENT` requires a bounded observation showing that no matching provider
  message/effect exists and that the provider contract treats it as absent.
- `UNKNOWN` is required for an ambiguous provider response, missing delivery
  evidence, mismatched correlation, provider outage, or readback failure.

Neither HTTP 2xx, an SES `MessageId`, nor a returned provider object alone may
produce `CONFIRMED`.

## Idempotency and correlation

The later adapter must bind its provider correlation material to the existing
Moirae identity rather than minting a second authority identity:

- logical work ID;
- ActionIntent canonical digest/idempotency key;
- approval ID and decision ID;
- MP-06 claim generation;
- MP-04 durable execution ID;
- attempt identity where available.

Because SES does not provide the required application-level exactly-once
guarantee, a write whose outcome is ambiguous must enter Horae reconciliation
and remain `UNKNOWN` until independently resolved. Blind retry is prohibited.

## Provider-02 live-smoke plan — not executed here

The later live slice must be separately authorized and limited to one provider
write:

1. Verify the exact source SHA/tree and clean worktree.
2. Verify a dedicated synthetic appointment fixture and one operator-verified
   SES sandbox recipient.
3. Verify the sender identity, AWS region, workload identity, and reviewed SDK
   configuration without printing credentials.
4. Execute exactly one `SEND_APPOINTMENT_DETAILS` write.
5. Do not retry if the response is lost or ambiguous.
6. Capture provider operation/message identity without secrets.
7. Perform only the pre-authorized non-mutating delivery observation.
8. Let Horae establish `CONFIRMED`, `ABSENT`, or `UNKNOWN`.
9. Verify MP-06 completion only if accepted `CONFIRMED` evidence exists.
10. Stop after the bounded evidence bundle; do not send a second message.

Expected cost is one bounded SES sandbox invocation plus any ordinary account
minimums; no cost estimate is asserted here. Cleanup is reconciliation and
retention of the bounded synthetic evidence. The message itself cannot be
recalled.

## Provider-02 operator requirements

### `REMOTE_SAFE_NOW`

- Review and authorize the dependency addition.
- Review the final provider mapper and observation contract.
- Review the exact synthetic fixture and destination policy.

### `INTERACTIVE_OR_DESKTOP_LATER`

- Verify/configure a dedicated SES sandbox sender.
- Verify one dedicated demo recipient.
- Confirm the AWS region and non-root workload identity.
- Approve the least-privilege SES runtime policy through the separate AWS
  readiness/deployment process.
- Inspect the received synthetic message during the one-call smoke.

No credential creation, provider setup, AWS call, or interactive operator task
was performed in Provider-01.

## Current state and next boundary

```text
liveFates          = true
durableApproval    = true
durableLocalQueue  = true
boundedWorker      = true
hostedDurableQueue = false
externalEffects    = false
```

The accepted Execution-01 local fixture remains distinct from a real provider.

Next unavailable boundary:

`PROVIDER_DEPENDENCY_AUTHORIZATION`

After that gate is separately authorized, the next bounded step is Provider-02
live effect smoke. It must still stop on ambiguity and must not promote provider
success directly to effect truth.

## Classification

```text
MOIRAE_MP08B_PROVIDER_01_PARTIAL
REAL_PROVIDER_SELECTED
BLOCKED_PROVIDER_DEPENDENCY_AUTHORIZATION_REQUIRED
NO_LIVE_EFFECT

MP08A_ACCEPTED
MP08B_NOT_DEPLOYED
MP08B_NOT_ACCEPTED
MP09_NOT_ACCEPTED

NO_AWS_PROVIDER_CALL
NO_MODEL_INFERENCE
NO_REAL_EXTERNAL_EFFECT
NO_DEPLOYMENT
NO_PUBLICATION
```

## Provider-01B follow-on reconciliation

The dependency gate recorded above was the correct Provider-01 state. It has
now been crossed in the separate Provider-01B candidate with the exact pinned
dependency `@aws-sdk/client-sesv2@3.1129.0`, a governed offline request mapper,
an explicit real-transport boundary, and an independent observation seam.
Provider-01 remains historical selection evidence; the current adapter and
dependency state is documented in `docs/MP08B_PROVIDER_01B.md`.

No AWS/SES call was made, no email was sent, and `externalEffects` remains
`false`. The next boundary is the separately authorized Provider-02 sandbox
setup and one-write live effect smoke.
