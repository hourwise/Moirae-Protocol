# MP-03 trusted recipient policy seam

## Ownership and boundary

The FATES-006C ownership audit identified two independent enforcement layers:

1. Moirae Protocol's `packages/fates-adapter/src/index.ts` rejected a SEND_APPOINTMENT_DETAILS target unless it matched the historical fixture recipient.
2. The accepted native Ananke/Fates administrative profile independently validates the native operation and arguments.

This slice addresses only the first layer. It adds an optional trusted-host construction value to the MP-03 adapter. It does not change Ananke, Fates policy, approval, execution, queue, or provider behavior.

## Trusted configuration

`Mp03TrustedAdministrativeProfileConfig` contains at most one exact `appointmentDetailsRecipient` email address. The value is validated at adapter construction, captured for the adapter lifetime, and is available only through trusted server composition. It is not part of `ActionIntentV1`, an HTTP request, browser state, model output, provider response, or IAM metadata.

The policy is `REPLACE` mode:

- no configuration preserves the historical `alex@example.test` mapping;
- configuration replaces that SEND recipient with the one exact configured value;
- no second address, wildcard, domain match, fallback, or recipient translation is allowed.

The native operation arguments copy the ActionIntent parameters after the exact target and parameter checks. Therefore `ACTIONINTENT_RECIPIENT` equals `MAPPED_NATIVE_RECIPIENT`, and `NO_RECIPIENT_TRANSLATION` and `NO_POST_ADMISSION_SUBSTITUTION` remain enforced.

The accepted native hash-domain check is preserved. The immutable Ananke runtime independently demonstrates that changing the recipient changes the native action identity. The adapter does not reimplement or collapse Ananke's native hash domain into Moirae's ActionIntent digest domain.

## Authority and staged result

`MP03_MAPPING_COMPATIBILITY_NOT_FATES_AUTHORITY` and `ADAPTER_SUCCESS_NOT_FATES_ADMISSION`: a successful Moirae mapping only permits faithful submission to the injected Fates gateway. The adapter preserves the gateway's `REQUIRE_APPROVAL`, `DENY`, and boundary-failure results. `FATES_DECISION_NOT_MODEL_DECISION` remains true.

Against the accepted immutable Ananke runtime, the configured synthetic recipient reaches the native gateway and remains subject to Ananke's independent historical profile. The expected staged result is `MP03_MOIRAE_MAPPING_BLOCKER_RESOLVED` with `ANANKE_NATIVE_RECIPIENT_BLOCKER_REMAINS`.

The committed value `trusted-demo@example.test` is synthetic. The real demo recipient is not committed and must be supplied only as ephemeral trusted runtime configuration in a separately authorized compatibility/live run.

Required invariants:

- `MP03_MAPPING_COMPATIBILITY_NOT_FATES_AUTHORITY`
- `FATES_DECISION_NOT_MODEL_DECISION`
- `ACTIONINTENT_CANNOT_SELF_AUTHORIZE_RECIPIENT`
- `TRUSTED_RECIPIENT_SERVER_CONFIGURATION_ONLY`
- `NO_RECIPIENT_TRANSLATION`
- `NO_POST_ADMISSION_SUBSTITUTION`
- `REAL_DEMO_RECIPIENT_NOT_COMMITTED`
- `PROVIDER_02B_NOT_RESUMED`

Next authoritative slice: `ANANKE_REQUIRES_TRUSTED_RECIPIENT_AUTHORITY_PROFILE`. No Ananke modification is included here.
