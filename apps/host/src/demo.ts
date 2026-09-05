import {
  MP04_ADRASTEIA_SHA,
  MP04_ANANKE_SHA,
  MP04_DEPENDENCY_PROVENANCE,
  MP04_HORAE_SHA,
  type Mp04ExecutionResultV1,
} from "../../../packages/execution-coordinator/src/index.js";
import {
  HumanDecisionEnvelopeV1Schema,
  type Mp05WorkflowResultV1,
} from "../../../packages/human-approval/src/index.js";
import type { Server } from "node:http";
import {
  Mp07LocalHostTransport,
  type Mp07ApprovalBindingV1,
  type Mp07ProductStateResponseV1,
  type Mp07TrustedHostStateProvider,
} from "./transport.js";
import { createMp07LocalServer } from "./server.js";
import type { Mp07ExactActionV1, Mp07ProductViewV1 } from "./index.js";

/**
 * Synthetic local judge/demo material only. It is intentionally separate from
 * the accepted Protocol authority path: it creates read-model fixtures and a
 * bounded fake decision transition, never a real effect or approval record.
 */
export const MP07D_DEMO_TIME = "2026-09-05T12:00:00.000Z" as const;
const DEMO_DIGEST = "a".repeat(64);
const DEMO_IDEMPOTENCY = "b".repeat(64);
const DEMO_EXECUTION_ID = `fates-execution:sha256:${"c".repeat(64)}`;

function actionFor(action: Mp07ExactActionV1["action"], index: number): Mp07ExactActionV1 {
  const principal = { agentPrincipalId: "demo-agent" };
  const requester = { customerId: "demo-customer", verifiedEmail: "customer@example.test" };
  if (action === "SEND_APPOINTMENT_DETAILS")
    return {
      action,
      effectClass: "DISCLOSE",
      principal,
      requester,
      resource: { resourceId: `demo-appointment-${index}`, resourceType: "appointment_details" },
      target: {
        kind: "email",
        address: "customer@example.test",
        classification: "verified_requester",
      },
      parameters: {
        bookingId: `BOOKING-DEMO-${index}`,
        recipientAddress: "customer@example.test",
        templateId: "appointment-details-v1",
      },
    };
  if (action === "RESCHEDULE_APPOINTMENT")
    return {
      action,
      effectClass: "MODIFY",
      principal,
      requester,
      resource: { resourceId: `demo-booking-${index}`, resourceType: "appointment_booking" },
      target: { kind: "customer", customerId: "demo-customer" },
      parameters: {
        bookingId: `BOOKING-DEMO-${index}`,
        currentStart: "2026-09-10T10:00:00.000Z",
        proposedStart: "2026-09-11T10:00:00.000Z",
        timeZone: "Europe/London",
      },
    };
  return {
    action,
    effectClass: "EXPORT",
    principal,
    requester,
    resource: { resourceId: `demo-directory-${index}`, resourceType: "customer_contact_directory" },
    target: {
      kind: "email",
      address: "operations@example.test",
      classification: "external_explicit",
    },
    parameters: {
      directoryResourceId: `DIRECTORY-DEMO-${index}`,
      recipientAddress: "operations@example.test",
      exportFormat: "csv",
    },
  };
}

function execution(status: "CONFIRMED"): Mp04ExecutionResultV1 {
  return {
    schemaVersion: "1",
    status,
    durableExecutionId: DEMO_EXECUTION_ID,
    evidence: {
      schemaVersion: "1",
      dependencyProfile: MP04_DEPENDENCY_PROVENANCE.profile,
      adrasteiaSha: MP04_ADRASTEIA_SHA,
      anankeSha: MP04_ANANKE_SHA,
      horaeSha: MP04_HORAE_SHA,
      durableState: "terminal",
      nativeResult: status,
      reconciliationRequired: false,
      redispatchAttempted: false,
      events: ["SYNTHETIC_DEMO_EFFECT"],
      observedAt: MP07D_DEMO_TIME,
    },
  };
}

function view(
  workId: string,
  category: Mp07ProductViewV1["category"],
  action: Mp07ExactActionV1["action"],
  reasonCode: NonNullable<Mp07ProductViewV1["native"]["reasonCode"]>,
  options: {
    readonly approval?: Mp07ProductViewV1["approval"];
    readonly mp04Status?: Mp07ProductViewV1["native"]["mp04Status"];
    readonly queueState?: Mp07ProductViewV1["native"]["queueState"];
    readonly queueOutcome?: Mp07ProductViewV1["native"]["queueOutcome"];
  } = {},
): Mp07ProductViewV1 {
  const exactAction = actionFor(action, Number(workId.replace(/\D/g, "")) || 1);
  const sourceRequestId = `demo-request-${workId}`;
  return {
    schemaVersion: "mp07-product-view-v1",
    category,
    work: {
      workId,
      sourceRequestId,
      actionIntentDigest: DEMO_DIGEST,
      actionIntentIdempotencyKey: DEMO_IDEMPOTENCY,
    },
    action: exactAction,
    context: {
      authenticatedWorkloadId: "demo-workload",
      actingPrincipalId: "demo-agent",
      requesterId: "demo-customer",
      tenantId: "demo-tenant",
      runtimeId: "demo-runtime",
      runtimeInstanceId: "demo-runtime-instance",
      sessionId: "demo-session",
      purpose: "synthetic local judge scenario",
      policyVersion: "demo-policy-v1",
      resourceScope: { mode: "synthetic", workId },
    },
    native: {
      queueState:
        options.queueState ?? (category === "HANDLED_AUTOMATICALLY" ? "COMPLETED" : "CLAIMED"),
      ...(options.queueOutcome ? { queueOutcome: options.queueOutcome } : {}),
      ...(category === "BLOCKED" ? { mp03Status: "REJECTED", mp03Decision: "DENY" } : {}),
      ...(category === "NEEDS_YOU"
        ? {
            mp03Status: "WAITING_FOR_APPROVAL",
            mp03Decision: "REQUIRE_APPROVAL",
            mp05ApprovalStatus: "PENDING",
          }
        : {}),
      ...(options.mp04Status ? { mp04Status: options.mp04Status } : {}),
      reasonCode,
    },
    ...(options.approval ? { approval: options.approval } : {}),
    evidence: {
      sourceRequestId,
      actionIntentDigest: DEMO_DIGEST,
      actionIntentIdempotencyKey: DEMO_IDEMPOTENCY,
      ...(options.approval?.approvalId ? { approvalId: options.approval.approvalId } : {}),
      ...(options.approval?.decisionId ? { decisionId: options.approval.decisionId } : {}),
      ...(options.mp04Status === "CONFIRMED" ? { durableExecutionId: DEMO_EXECUTION_ID } : {}),
      reconciliationRequired: options.mp04Status === "UNKNOWN",
    },
    activity: [
      {
        activityId: `${workId}-activity-1`,
        workId,
        deliveryId: `${workId}-delivery-1`,
        state:
          category === "ACTIVITY"
            ? "PROCESSING"
            : category === "HANDLED_AUTOMATICALLY"
              ? "COMPLETED"
              : "AUTHORITY_CHECKED",
        observedAt: MP07D_DEMO_TIME,
        workerId: "demo-worker",
        reason: "Synthetic local demo fixture; not authority.",
      },
    ],
    freshness: { observedAt: MP07D_DEMO_TIME, stateVersion: 1 },
  };
}

export function createMp07DemoViews(): Mp07ProductViewV1[] {
  const approvalId = "demo-approval-reschedule";
  return [
    view(
      "demo-handled",
      "HANDLED_AUTOMATICALLY",
      "SEND_APPOINTMENT_DETAILS",
      "CONFIRMED_COMPLETION",
      {
        queueState: "COMPLETED",
        queueOutcome: "COMPLETED",
        mp04Status: "CONFIRMED",
      },
    ),
    view("demo-needs-you", "NEEDS_YOU", "RESCHEDULE_APPOINTMENT", "APPROVAL_PENDING", {
      queueState: "WAITING_FOR_APPROVAL",
      queueOutcome: "WAITING_FOR_APPROVAL",
      approval: {
        approvalId,
        status: "PENDING",
        expiresAt: "2026-09-05T13:00:00.000Z",
        presentationDigest: DEMO_DIGEST,
        nativePresentationBindingHash: DEMO_IDEMPOTENCY,
      },
    }),
    view("demo-blocked", "BLOCKED", "TRANSMIT_CUSTOMER_CONTACT_DIRECTORY", "MP04_UNKNOWN", {
      queueState: "RECONCILIATION_REQUIRED",
      queueOutcome: "RECONCILIATION_REQUIRED",
      mp04Status: "UNKNOWN",
    }),
    view("demo-activity", "ACTIVITY", "TRANSMIT_CUSTOMER_CONTACT_DIRECTORY", "ACTIVE_PROCESSING", {
      queueState: "CLAIMED",
    }),
  ];
}

function completedView(
  current: Mp07ProductViewV1,
  decision: "APPROVE" | "REJECT",
): Mp07ProductViewV1 {
  if (decision === "REJECT")
    return {
      ...current,
      category: "BLOCKED",
      native: {
        ...current.native,
        queueState: "DENIED",
        queueOutcome: "DENIED",
        mp05ApprovalStatus: "REJECTED",
        reasonCode: "APPROVAL_REJECTED",
      },
      approval: current.approval
        ? { ...current.approval, status: "REJECTED", decisionId: "demo-decision-reject" }
        : undefined,
      evidence: { ...current.evidence, decisionId: "demo-decision-reject" },
      freshness: { ...current.freshness, stateVersion: (current.freshness.stateVersion ?? 1) + 1 },
    };
  return {
    ...current,
    category: "HANDLED_AUTOMATICALLY",
    native: {
      ...current.native,
      queueState: "COMPLETED",
      queueOutcome: "COMPLETED",
      mp03Status: "ADMITTED",
      mp03Decision: "ALLOW",
      mp04Status: "CONFIRMED",
      mp05ApprovalStatus: "APPROVED",
      reasonCode: "CONFIRMED_COMPLETION",
    },
    approval: current.approval
      ? { ...current.approval, status: "APPROVED", decisionId: "demo-decision-approve" }
      : undefined,
    evidence: {
      ...current.evidence,
      decisionId: "demo-decision-approve",
      durableExecutionId: DEMO_EXECUTION_ID,
    },
    freshness: { ...current.freshness, stateVersion: (current.freshness.stateVersion ?? 1) + 1 },
  };
}

/** Returns the deterministic synthetic state provider used by local judge smoke/tests. */
export function createMp07DemoTransport(): Mp07LocalHostTransport {
  let views = createMp07DemoViews();
  const coordinator: Mp07ApprovalBindingV1["coordinator"] = {
    async submitDecision(input): Promise<Mp05WorkflowResultV1> {
      const envelope = HumanDecisionEnvelopeV1Schema.parse(input.envelope);
      const current = views.find(
        (candidate) => candidate.approval?.approvalId === envelope.approvalId,
      );
      if (!current || current.approval?.status !== "PENDING")
        throw new Error("SYNTHETIC_DEMO_STALE_APPROVAL");
      views = views.map((candidate) =>
        candidate.work.workId === current.work.workId
          ? completedView(candidate, envelope.decision)
          : candidate,
      );
      const approved = envelope.decision === "APPROVE";
      return {
        schemaVersion: "mp05-workflow-result-v1",
        approval: {
          schemaVersion: "mp05-approval-outcome-v1",
          status: approved ? "APPROVED" : "REJECTED",
          approvalId: envelope.approvalId,
          decision: envelope.decision,
          nativeOutcome: "applied",
          decisionId: approved ? "demo-decision-approve" : "demo-decision-reject",
          approvalState: approved ? "APPROVED" : "REJECTED",
          message: "Synthetic local demo decision; no external effect was performed.",
        },
        ...(approved ? { execution: execution("CONFIRMED") } : {}),
      };
    },
  };
  const provider: Mp07TrustedHostStateProvider = {
    async readProductViews(): Promise<readonly Mp07ProductViewV1[]> {
      return views;
    },
    async resolveApprovalBinding(approvalId: string): Promise<Mp07ApprovalBindingV1 | undefined> {
      const current = views.find((candidate) => candidate.approval?.approvalId === approvalId);
      if (!current || !current.approval || current.approval.status !== "PENDING") return undefined;
      return {
        request: {
          intent: { demo: true },
          authenticatedContext: { demo: true },
          waitingAdmission: { demo: true },
        },
        coordinator,
        trustedDecision: { operator: { demo: true } },
      };
    },
  };
  return new Mp07LocalHostTransport(provider);
}

export function createMp07LocalDemoServer(): Server {
  return createMp07LocalServer(createMp07DemoTransport());
}

export async function readMp07DemoState(
  transport: Mp07LocalHostTransport,
): Promise<Mp07ProductStateResponseV1> {
  return transport.readState();
}
