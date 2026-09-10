# MP08B FRONTEND 01 — Judge-facing MP-07 experience

Status: MOIRAE_MP08B_FRONTEND_01_COMPLETE

## Purpose and visual direction

This slice turns the existing framework-free local MP-07 dashboard into the
polished judge-facing Moirae screen. The approved reference image was not
available, so the implementation follows the explicit handoff: a calm 72rem
application shell, restrained Moirae identity, strong human-first hierarchy,
compact cards, and a single-column layout below 44rem.

No external design research, new design framework, dependency, or frontend
build system was used.

## Architecture and contract boundary

`apps/web/src/index.ts` remains one dependency-free HTML/CSS/JavaScript
document served by the existing local host. `Mp07StateTransport` reads the
existing `/mp07/state` product-view response and `/health` runtime descriptor.
`renderProductState` renders only the returned `Mp07ProductViewV1` objects.

The four existing categories remain:

- Handled automatically
- Needs you
- Blocked
- Activity

The browser groups cards by the server-provided `view.category`. It does not
derive a category from queue, approval, provider, or reconciliation fields.
The transport object is separate from rendering so a later trusted native
transport can provide the same product-view contract without redesigning the
screen. This slice does not expose that native transport publicly.

FRONTEND_DOES_NOT_CREATE_AUTHORITY

FRONTEND_DOES_NOT_CLASSIFY_PROTOCOL_STATE

PRODUCT_VIEW_NOT_PROTOCOL_TRUTH

## Decisions and evidence

Current `NEEDS_YOU` items show the consequential action fields and semantic
Approve/Reject buttons. A click sends only the existing strict
`human-decision-v1` envelope to the synthetic local decision route. Buttons are
disabled while submitting. The browser does not transition a category
optimistically: it rereads server state after success, rejection, or an
ambiguous response.

BROWSER_DECISION_TRANSPORT_NOT_APPROVAL_AUTHORITY

Cards first show plain product copy and consequential fields. “Evidence and
history” reveals only represented governance/processing stages. A nested
“Technical evidence” disclosure shows bounded, truncated identifiers while
retaining the full value as a title. Activity history is independently
disclosed. No raw JSON, credential, provider token, or secret is displayed.

## Demo and live separation

The global runtime pill comes from `/health`. The current launcher renders
“Synthetic demo”; it is never hard-coded as live. A handled fixture explicitly
states that it is deterministic and that no real email or external effect
occurred. UNKNOWN stays in the server-provided conservative category and is
described as uncertain, with no retry control.

SYNTHETIC_DEMO_NOT_LIVE_EFFECT

NO_REAL_SES_EFFECT

SYNTHETIC_DEMO_PRESERVED

NATIVE_TRANSPORT_NOT_PUBLICLY_EXPOSED

FRONTEND_READY_FOR_FUTURE_NATIVE_TRANSPORT

## Responsive and accessible behavior

The two-column desktop surface becomes a two-column compact tablet surface and
a single column below 44rem. Decision buttons become full-width touch targets;
fields and identifiers wrap without horizontal overflow.

The document uses a logical heading structure, landmark elements, real buttons,
native keyboard-operable disclosures, a skip link, visible focus, text plus
colour status signals, polite live regions, loading/error/empty states, and a
reduced-motion override.

## Local smoke and tests

The local `SYNTHETIC_LOCAL_DEMO` launcher was used only. `/`, `/index.html`,
`/mp07/state`, `/health`, and `/ready` returned 200. The rendered header, four
scenario cards, synthetic indicator, consequential fields, evidence layers,
technical ID wrapping, and synthetic approval/server-reread transition were
verified in the local browser.

`tests/mp08b-frontend-01-judge-experience.test.ts` covers the product hierarchy,
human labels, decision controls, no optimistic state, failure behavior, demo
disclosure, UNKNOWN handling, progressive evidence, accessibility/responsivity,
transport separation, and local routes. Existing MP-07 mapper semantics and
backend authority code are unchanged.

No AWS, SES, Bedrock, model inference, live Strands, provider transport, or
real external effect was invoked.

MP08B_FRONTEND_01 != MP08B_ACCEPTANCE

MP08B_FRONTEND_01 != DEPLOYMENT

The later wiring boundary remains a trusted authenticated/native transport
that returns the same accepted MP-07 product view. It is deliberately outside
this slice.
