import { describe, expect, it } from "vitest";

import { MP07_DASHBOARD_DOCUMENT } from "../apps/web/src/index.js";
import { createMp07LocalServer, listenMp07LocalServer } from "../apps/host/src/server.js";
import {
  Mp07LocalHostTransport,
  type Mp07ApprovalBindingV1,
  type Mp07TrustedHostStateProvider,
} from "../apps/host/src/transport.js";
import type { Mp07ProductViewV1 } from "../apps/host/src/index.js";
import type { Mp05WorkflowResultV1 } from "../packages/human-approval/src/index.js";

const approvalId = "approval-mp07c-001";
const digest = "a".repeat(64);
const bindingHash = "b".repeat(64);

function view(
  category: Mp07ProductViewV1["category"],
  action: Mp07ProductViewV1["action"]["action"] = "SEND_APPOINTMENT_DETAILS",
): Mp07ProductViewV1 {
  const parameters =
    action === "SEND_APPOINTMENT_DETAILS"
      ? {
          bookingId: "BOOK-001",
          recipientAddress: "recipient@example.test",
          templateId: "TEMPLATE-1",
        }
      : action === "RESCHEDULE_APPOINTMENT"
        ? {
            bookingId: "BOOK-001",
            currentStart: "2026-09-05T12:00:00.000Z",
            proposedStart: "2026-09-06T12:00:00.000Z",
            timeZone: "Europe/London",
          }
        : {
            directoryResourceId: "DIRECTORY-001",
            recipientAddress: "recipient@example.test",
            exportFormat: "csv",
          };
  return {
    schemaVersion: "mp07-product-view-v1",
    category,
    work: {
      workId: "work-mp07c-001",
      sourceRequestId: "request-mp07c-001",
      actionIntentDigest: digest,
      actionIntentIdempotencyKey: "idem-mp07c-001",
    },
    action: {
      action,
      effectClass:
        action === "SEND_APPOINTMENT_DETAILS"
          ? "DISCLOSE"
          : action === "RESCHEDULE_APPOINTMENT"
            ? "MODIFY"
            : "EXPORT",
      principal: { agentPrincipalId: "agent-001" },
      requester: { customerId: "customer-001", verifiedEmail: "customer@example.test" },
      resource:
        action === "SEND_APPOINTMENT_DETAILS"
          ? { resourceId: "resource-001", resourceType: "appointment_details" }
          : action === "RESCHEDULE_APPOINTMENT"
            ? { resourceId: "resource-001", resourceType: "appointment_booking" }
            : { resourceId: "resource-001", resourceType: "customer_contact_directory" },
      target:
        action === "RESCHEDULE_APPOINTMENT"
          ? { kind: "customer", customerId: "customer-001" }
          : {
              kind: "email",
              address: "recipient@example.test",
              classification:
                action === "SEND_APPOINTMENT_DETAILS" ? "verified_requester" : "external_explicit",
            },
      parameters,
    },
    context: {
      authenticatedWorkloadId: "workload-001",
      actingPrincipalId: "agent-001",
      requesterId: "customer-001",
      tenantId: "tenant-001",
      runtimeId: "runtime-001",
      runtimeInstanceId: "runtime-instance-001",
      sessionId: "session-001",
      purpose: "test",
      policyVersion: "policy-1",
      resourceScope: { tenantId: "tenant-001" },
    },
    native: {
      queueState: category === "NEEDS_YOU" ? "WAITING_FOR_APPROVAL" : "COMPLETED",
      mp03Status: category === "BLOCKED" ? "REJECTED" : "ADMITTED",
      mp04Status: category === "HANDLED_AUTOMATICALLY" ? "CONFIRMED" : undefined,
      mp05ApprovalStatus: category === "NEEDS_YOU" ? "PENDING" : undefined,
      reasonCode: category === "NEEDS_YOU" ? "APPROVAL_PENDING" : "CONFIRMED_COMPLETION",
    },
    ...(category === "NEEDS_YOU"
      ? {
          approval: {
            approvalId,
            status: "PENDING" as const,
            presentationDigest: digest,
            nativePresentationBindingHash: bindingHash,
          },
        }
      : {}),
    evidence: {
      sourceRequestId: "request-mp07c-001",
      actionIntentDigest: digest,
      actionIntentIdempotencyKey: "idem-mp07c-001",
      approvalId: category === "NEEDS_YOU" ? approvalId : undefined,
      reconciliationRequired: false,
    },
    activity: [
      {
        activityId: "activity-mp07c-001",
        workId: "work-mp07c-001",
        deliveryId: "delivery-mp07c-001",
        state: category === "NEEDS_YOU" ? "WAITING_FOR_APPROVAL" : "COMPLETED",
        observedAt: "2026-09-05T12:00:00.000Z",
      },
    ],
    freshness: { observedAt: "2026-09-05T12:00:00.000Z" },
  } as Mp07ProductViewV1;
}

function workflow(status: "APPROVED" | "REJECTED"): Mp05WorkflowResultV1 {
  return {
    schemaVersion: "mp05-workflow-result-v1",
    approval: {
      schemaVersion: "mp05-approval-outcome-v1",
      status,
      approvalId,
      decision: status === "APPROVED" ? "APPROVE" : "REJECT",
      nativeOutcome: "applied",
      decisionId: "decision-mp07c-001",
      approvalState: status.toLowerCase(),
    },
  };
}

function provider(
  current: Mp07ProductViewV1[],
  submit: (envelope: unknown) => Promise<Mp05WorkflowResultV1> = async () => workflow("APPROVED"),
): Mp07TrustedHostStateProvider & { calls: unknown[] } {
  const calls: unknown[] = [];
  const coordinator = {
    submitDecision: async (input: unknown) => {
      calls.push(input);
      return submit((input as { envelope: unknown }).envelope);
    },
  };
  const binding: Mp07ApprovalBindingV1 = {
    request: {
      intent: { canonical: true },
      authenticatedContext: { trusted: true },
      waitingAdmission: { status: "WAITING_FOR_APPROVAL" },
    },
    coordinator,
    trustedDecision: { operator: { id: "trusted-operator" } },
  };
  return {
    calls,
    async readProductViews() {
      return current;
    },
    async resolveApprovalBinding(id) {
      return id === approvalId ? binding : undefined;
    },
  };
}

describe("MP-07C local dashboard document", () => {
  it("contains the four product concepts, exact action fields, and accessible controls", () => {
    expect(MP07_DASHBOARD_DOCUMENT).toContain("Handled automatically");
    expect(MP07_DASHBOARD_DOCUMENT).toContain("Needs you");
    expect(MP07_DASHBOARD_DOCUMENT).toContain("Blocked");
    expect(MP07_DASHBOARD_DOCUMENT).toContain("Activity");
    expect(MP07_DASHBOARD_DOCUMENT).toContain("Booking ID");
    expect(MP07_DASHBOARD_DOCUMENT).toContain("Recipient address");
    expect(MP07_DASHBOARD_DOCUMENT).toContain("Template ID");
    expect(MP07_DASHBOARD_DOCUMENT).toContain("Current start");
    expect(MP07_DASHBOARD_DOCUMENT).toContain("Proposed start");
    expect(MP07_DASHBOARD_DOCUMENT).toContain("Directory resource ID");
    expect(MP07_DASHBOARD_DOCUMENT).toContain("Export format");
    expect(MP07_DASHBOARD_DOCUMENT).toContain("human-decision-v1");
    expect(MP07_DASHBOARD_DOCUMENT).toContain('aria-live="polite"');
    expect(MP07_DASHBOARD_DOCUMENT).toContain("node('details')");
    expect(MP07_DASHBOARD_DOCUMENT).toContain("Technical evidence");
    expect(MP07_DASHBOARD_DOCUMENT).not.toContain("localStorage");
    expect(MP07_DASHBOARD_DOCUMENT).not.toMatch(/\b(?:MP04|Horae|Ananke)\b/);
  });
});

describe("MP-07C trusted local transport", () => {
  it("passes only the strict browser envelope to the trusted MP-05 coordinator", async () => {
    const state = [view("NEEDS_YOU")];
    const trusted = provider(state);
    const transport = new Mp07LocalHostTransport(trusted);
    const result = await transport.submitDecision({
      schemaVersion: "human-decision-v1",
      approvalId,
      decision: "APPROVE",
      presentationDigest: digest,
      nativePresentationBindingHash: bindingHash,
    });
    expect(result.statusCode).toBe(200);
    expect(trusted.calls).toHaveLength(1);
    expect(trusted.calls[0]).toMatchObject({
      request: { intent: { canonical: true } },
      trustedDecision: { operator: { id: "trusted-operator" } },
      envelope: { approvalId, decision: "APPROVE" },
    });
    expect((result.body as { decision: { decisionId?: string } }).decision.decisionId).toBe(
      "decision-mp07c-001",
    );
  });

  it.each([
    "SEND_APPOINTMENT_DETAILS",
    "RESCHEDULE_APPOINTMENT",
    "TRANSMIT_CUSTOMER_CONTACT_DIRECTORY",
  ] as const)("supports the bounded APPROVE transport for %s", async (action) => {
    const trusted = provider([view("NEEDS_YOU", action)]);
    const transport = new Mp07LocalHostTransport(trusted);
    const result = await transport.submitDecision({
      schemaVersion: "human-decision-v1",
      approvalId,
      decision: "APPROVE",
      presentationDigest: digest,
      nativePresentationBindingHash: bindingHash,
    });
    expect(result.statusCode).toBe(200);
    expect(trusted.calls).toHaveLength(1);
  });

  it.each([
    "SEND_APPOINTMENT_DETAILS",
    "RESCHEDULE_APPOINTMENT",
    "TRANSMIT_CUSTOMER_CONTACT_DIRECTORY",
  ] as const)("supports the bounded REJECT transport for %s", async (action) => {
    const trusted = provider([view("NEEDS_YOU", action)], async () => workflow("REJECTED"));
    const transport = new Mp07LocalHostTransport(trusted);
    const result = await transport.submitDecision({
      schemaVersion: "human-decision-v1",
      approvalId,
      decision: "REJECT",
      presentationDigest: digest,
      nativePresentationBindingHash: bindingHash,
    });
    expect(result.statusCode).toBe(200);
    expect((result.body as { decision: { decision?: string } }).decision.decision).toBe("REJECT");
    expect(trusted.calls).toHaveLength(1);
  });

  it("rejects forged categories, intent fields, and unknown security fields before MP-05", async () => {
    const trusted = provider([view("NEEDS_YOU")]);
    const transport = new Mp07LocalHostTransport(trusted);
    const result = await transport.submitDecision({
      schemaVersion: "human-decision-v1",
      approvalId,
      decision: "APPROVE",
      presentationDigest: digest,
      nativePresentationBindingHash: bindingHash,
      category: "HANDLED_AUTOMATICALLY",
      workId: "other-work",
      recipientAddress: "tampered@example.test",
      durableExecutionId: "forged-execution",
    });
    expect(result.statusCode).toBe(400);
    expect(trusted.calls).toHaveLength(0);
  });

  it("rejects stale approval references and does not manufacture a decision", async () => {
    const trusted = provider([view("NEEDS_YOU")]);
    const transport = new Mp07LocalHostTransport(trusted);
    const result = await transport.submitDecision({
      schemaVersion: "human-decision-v1",
      approvalId: "missing-approval",
      decision: "REJECT",
      presentationDigest: digest,
      nativePresentationBindingHash: bindingHash,
    });
    expect(result.statusCode).toBe(409);
    expect(trusted.calls).toHaveLength(0);
  });

  it("surfaces response-loss as refresh-required without a replacement submission", async () => {
    let reads = 0;
    const trusted = provider([view("NEEDS_YOU")]);
    const transport = new Mp07LocalHostTransport({
      ...trusted,
      async readProductViews() {
        reads += 1;
        if (reads >= 1) throw new Error("state unavailable after durable decision");
        return [view("NEEDS_YOU")];
      },
    });
    const result = await transport.submitDecision({
      schemaVersion: "human-decision-v1",
      approvalId,
      decision: "APPROVE",
      presentationDigest: digest,
      nativePresentationBindingHash: bindingHash,
    });
    expect(result.statusCode).toBe(200);
    expect((result.body as { refreshRequired?: boolean }).refreshRequired).toBe(true);
    expect(trusted.calls).toHaveLength(1);
  });
});

describe("MP-07C local loopback server", () => {
  it("serves the dashboard and bounded state/decision routes", async () => {
    const trusted = provider([view("NEEDS_YOU")]);
    const server = createMp07LocalServer(new Mp07LocalHostTransport(trusted));
    const listener = await listenMp07LocalServer(server);
    const base = `http://${listener.host}:${listener.port}`;
    try {
      const page = await fetch(`${base}/`);
      const html = await page.text();
      expect(page.status).toBe(200);
      expect(html).toContain("Needs you");
      expect(page.headers.get("content-security-policy")).toContain("default-src 'self'");

      const state = await fetch(`${base}/mp07/state`);
      expect(state.status).toBe(200);
      expect((await state.json()).schemaVersion).toBe("mp07-product-state-v1");

      const invalidContentType = await fetch(`${base}/mp07/decision`, {
        method: "POST",
        headers: { "content-type": "text/plain" },
        body: "{}",
      });
      expect(invalidContentType.status).toBe(415);

      const decision = await fetch(`${base}/mp07/decision`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          schemaVersion: "human-decision-v1",
          approvalId,
          decision: "REJECT",
          presentationDigest: digest,
          nativePresentationBindingHash: bindingHash,
        }),
      });
      expect(decision.status).toBe(200);
      expect((await decision.json()).decision.approvalId).toBe(approvalId);
    } finally {
      await listener.close();
    }
  });
});
