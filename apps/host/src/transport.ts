import {
  HumanDecisionEnvelopeV1Schema,
  type Mp05ApprovalRequestV1,
  type Mp05HumanApprovalCoordinator,
  type Mp05TrustedDecisionContext,
  type Mp05WorkflowResultV1,
} from "../../../packages/human-approval/src/index.js";
import type { Mp07ProductViewV1 } from "./index.js";

export const MP07_PRODUCT_STATE_VERSION = "mp07-product-state-v1" as const;
export const MP07_DECISION_RESPONSE_VERSION = "mp07-decision-response-v1" as const;
export const MP07_TRANSPORT_ERROR_VERSION = "mp07-transport-error-v1" as const;
export const MP07_MAX_PRODUCT_VIEWS = 100;
export const MP07_MAX_DECISION_BODY_BYTES = 16 * 1024;

export type Mp07ApprovalBindingV1 = Readonly<{
  readonly request: Mp05ApprovalRequestV1;
  readonly coordinator: Pick<Mp05HumanApprovalCoordinator, "submitDecision">;
  readonly trustedDecision: Mp05TrustedDecisionContext;
}>;

export interface Mp07TrustedHostStateProvider {
  /** Reads current host-observed state; it must invoke the accepted MP-07B adapter. */
  readProductViews(): Promise<readonly Mp07ProductViewV1[]>;
  /** Resolves only trusted server-side MP-05 request material. */
  resolveApprovalBinding(approvalId: string): Promise<Mp07ApprovalBindingV1 | undefined>;
}

export type Mp07ProductStateResponseV1 = Readonly<{
  readonly schemaVersion: typeof MP07_PRODUCT_STATE_VERSION;
  readonly views: readonly Mp07ProductViewV1[];
}>;

export type Mp07DecisionObservationV1 = Readonly<{
  readonly approvalId: string;
  readonly status: Mp05WorkflowResultV1["approval"]["status"];
  readonly decision?: Mp05WorkflowResultV1["approval"]["decision"];
  readonly nativeOutcome?: Mp05WorkflowResultV1["approval"]["nativeOutcome"];
  readonly decisionId?: string;
  readonly approvalState?: string;
  readonly executionStatus?: NonNullable<Mp05WorkflowResultV1["execution"]>["status"];
  readonly message?: string;
}>;

export type Mp07DecisionResponseV1 = Readonly<{
  readonly schemaVersion: typeof MP07_DECISION_RESPONSE_VERSION;
  readonly decision: Mp07DecisionObservationV1;
  readonly state?: Mp07ProductStateResponseV1;
  readonly refreshRequired?: boolean;
}>;

export type Mp07TransportErrorCodeV1 =
  | "INVALID_DECISION_ENVELOPE"
  | "STALE_APPROVAL_REFERENCE"
  | "DECISION_BOUNDARY_FAILURE"
  | "STATE_READ_FAILURE"
  | "REQUEST_TOO_LARGE"
  | "UNSUPPORTED_CONTENT_TYPE";

export type Mp07TransportErrorV1 = Readonly<{
  readonly schemaVersion: typeof MP07_TRANSPORT_ERROR_VERSION;
  readonly code: Mp07TransportErrorCodeV1;
  readonly message: string;
  readonly state?: Mp07ProductStateResponseV1;
}>;

export type Mp07LocalTransportResult = Readonly<{
  readonly statusCode: number;
  readonly body: Mp07DecisionResponseV1 | Mp07TransportErrorV1;
}>;

function boundedMessage(value: string | undefined): string | undefined {
  if (!value) return undefined;
  return value.slice(0, 300);
}

function cloneView(view: Mp07ProductViewV1): Mp07ProductViewV1 {
  return JSON.parse(JSON.stringify(view)) as Mp07ProductViewV1;
}

function decisionObservation(result: Mp05WorkflowResultV1): Mp07DecisionObservationV1 {
  const message = boundedMessage(result.approval.message);
  return {
    approvalId: result.approval.approvalId,
    status: result.approval.status,
    ...(result.approval.decision ? { decision: result.approval.decision } : {}),
    ...(result.approval.nativeOutcome ? { nativeOutcome: result.approval.nativeOutcome } : {}),
    ...(result.approval.decisionId ? { decisionId: result.approval.decisionId } : {}),
    ...(result.approval.approvalState ? { approvalState: result.approval.approvalState } : {}),
    ...(result.execution?.status ? { executionStatus: result.execution.status } : {}),
    ...(message ? { message } : {}),
  };
}

/**
 * Trusted local host boundary for MP-07C. Browser data is limited to the
 * strict MP-05 envelope; request, intent, context, operator, and coordinator
 * are resolved on the host and are never accepted from the browser.
 */
export class Mp07LocalHostTransport {
  constructor(private readonly provider: Mp07TrustedHostStateProvider) {}

  async readState(): Promise<Mp07ProductStateResponseV1> {
    const views = await this.provider.readProductViews();
    if (views.length > MP07_MAX_PRODUCT_VIEWS)
      throw new Error("The local product view set exceeds its bounded size.");
    return {
      schemaVersion: MP07_PRODUCT_STATE_VERSION,
      views: views.map(cloneView),
    };
  }

  private async failure(
    statusCode: number,
    code: Mp07TransportErrorCodeV1,
    message: string,
    includeState = true,
  ): Promise<Mp07LocalTransportResult> {
    let state: Mp07ProductStateResponseV1 | undefined;
    if (includeState) {
      try {
        state = await this.readState();
      } catch {
        state = undefined;
      }
    }
    return {
      statusCode,
      body: {
        schemaVersion: MP07_TRANSPORT_ERROR_VERSION,
        code,
        message,
        ...(state ? { state } : {}),
      },
    };
  }

  async submitDecision(input: unknown): Promise<Mp07LocalTransportResult> {
    const parsed = HumanDecisionEnvelopeV1Schema.safeParse(input);
    if (!parsed.success)
      return this.failure(
        400,
        "INVALID_DECISION_ENVELOPE",
        "The decision envelope is not the accepted strict MP-05 shape.",
        false,
      );

    const binding = await this.provider.resolveApprovalBinding(parsed.data.approvalId);
    if (!binding)
      return this.failure(
        409,
        "STALE_APPROVAL_REFERENCE",
        "The approval reference is not a current trusted host request.",
      );

    let result: Mp05WorkflowResultV1;
    try {
      // MP-05 performs the mandatory native durable reread immediately before
      // accepting the decision. The browser envelope is intentionally the only
      // untrusted value crossing this call.
      result = await binding.coordinator.submitDecision({
        request: binding.request,
        envelope: parsed.data,
        trustedDecision: binding.trustedDecision,
      });
    } catch {
      return this.failure(
        502,
        "DECISION_BOUNDARY_FAILURE",
        "The trusted approval boundary failed closed.",
      );
    }

    const decision = decisionObservation(result);
    try {
      return {
        statusCode: 200,
        body: {
          schemaVersion: MP07_DECISION_RESPONSE_VERSION,
          decision,
          state: await this.readState(),
        },
      };
    } catch {
      // A committed native decision is never retried or replaced because the
      // response-state reread failed. The browser must refresh explicitly.
      return {
        statusCode: 200,
        body: {
          schemaVersion: MP07_DECISION_RESPONSE_VERSION,
          decision,
          refreshRequired: true,
        },
      };
    }
  }
}
