import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { describe, expect, it } from "vitest";

import {
  MP03_ACTING_AGENT,
  MP03_AUTHENTICATED_WORKLOAD,
  MP03_CAUSATION_ID,
  MP03_CORRELATION_ID,
  MP03_POLICY_VERSION,
  MP03_PROFILE,
  MP03_REQUESTER,
  MP03_RUNTIME_ID,
  MP03_RUNTIME_INSTANCE,
  MP03_SESSION_ID,
  MP03_TENANT_ID,
  type Mp03Action,
  type Mp03AuthenticatedContext,
} from "../packages/fates-adapter/src/index.js";
import {
  createDemoCompilerContext,
  primaryCompilerFixtures,
} from "../packages/test-fixtures/src/index.js";
import type { AgentProposalV1 } from "../packages/strands-agent/src/proposal.js";
import type {
  Mp08bCompositionRequestV1,
  Mp08bProposalSource,
} from "../apps/host/src/composition.js";
import {
  createMp08bDurableApprovalRuntime,
  type Mp08bPreparedApprovalV1,
} from "../apps/host/src/approval-runtime.js";
import {
  createMp08bDurableQueueRuntime,
  type Mp08bDurableQueueRuntime,
} from "../apps/host/src/queue-runtime.js";

const FATES_ROOT = process.env.MP05_FATES_ANANKE_ROOT;
const describeReal = FATES_ROOT ? describe : describe.skip;
const NOW = "2026-09-03T12:00:00.000Z";
const LATER = "2026-09-03T12:00:02.000Z";
const SOURCE_REQUEST_ID = "REQUEST-MP02-DETAILS-001";

type TestClock = { value: string; now(): string };

function clock(): TestClock {
  return {
    value: NOW,
    now() {
      return this.value;
    },
  };
}

function proposalFor(action: Mp03Action): AgentProposalV1 {
  const proposal =
    primaryCompilerFixtures[
      action === "SEND_APPOINTMENT_DETAILS" ? 0 : action === "RESCHEDULE_APPOINTMENT" ? 1 : 2
    ].proposal;
  return action === "TRANSMIT_CUSTOMER_CONTACT_DIRECTORY"
    ? { ...proposal, recipientReference: "personal-address@example.test" }
    : proposal;
}

function compilerContextFor() {
  return {
    ...createDemoCompilerContext(SOURCE_REQUEST_ID),
    agentPrincipalId: MP03_ACTING_AGENT,
  };
}

function authenticatedContextFor(action: Mp03Action): Mp03AuthenticatedContext {
  const profile = MP03_PROFILE[action];
  return {
    authenticatedPrincipal: {
      id: MP03_AUTHENTICATED_WORKLOAD,
      kind: "service",
      tenantId: MP03_TENANT_ID,
    },
    actingPrincipal: {
      id: MP03_ACTING_AGENT,
      kind: "agent",
      tenantId: MP03_TENANT_ID,
    },
    representedPrincipal: {
      id: MP03_REQUESTER,
      kind: "human",
      tenantId: MP03_TENANT_ID,
    },
    runtimeId: MP03_RUNTIME_ID,
    runtimeInstanceId: MP03_RUNTIME_INSTANCE,
    sessionId: MP03_SESSION_ID,
    tenantId: MP03_TENANT_ID,
    resourceScope: profile.scope as Mp03AuthenticatedContext["resourceScope"],
    correlation: {
      requestId: SOURCE_REQUEST_ID,
      correlationId: MP03_CORRELATION_ID,
      causationId: MP03_CAUSATION_ID,
    },
    policyVersion: MP03_POLICY_VERSION,
    purpose: profile.purpose,
  };
}

function proposalSource(action: Mp03Action): Mp08bProposalSource {
  return {
    boundary: "STRANDS_PROPOSAL",
    provider: "mock",
    modelId: "mock/queue-01-fixture",
    live: false,
    invoke: async () => ({
      proposal: proposalFor(action),
      metadata: {
        sdk: "@strands-agents/sdk",
        sdkVersion: "1.16.0",
        provider: "mock",
        modelId: "mock/queue-01-fixture",
        requestId: "MP08B-QUEUE-01",
        requestCount: 1,
        structuredOutput: true,
        stopReason: "end_turn",
        latencyMs: 0,
      } as const,
    }),
  };
}

function requestFor(action: Mp03Action): Mp08bCompositionRequestV1 {
  return {
    request: `Offline Queue-01 fixture for ${action}; no model call is allowed.`,
    compilerContext: compilerContextFor(),
    authenticatedContext: authenticatedContextFor(action),
    now: NOW,
  };
}

function envelope(prepared: Mp08bPreparedApprovalV1, decision: "APPROVE" | "REJECT") {
  return {
    schemaVersion: "human-decision-v1" as const,
    approvalId: prepared.binding.approvalId,
    decision,
    presentationDigest: prepared.preparation.presentation.presentationDigest,
    nativePresentationBindingHash: prepared.preparation.presentation.nativePresentationBindingHash,
  };
}

function paths() {
  const directory = mkdtempSync(join(tmpdir(), "moirae-mp08b-queue-01-"));
  return {
    directory,
    approvalStorePath: join(directory, "approval.sqlite"),
    bindingStorePath: join(directory, "approval-bindings.json"),
    queuePath: join(directory, "queue.json"),
    activityPath: join(directory, "activity.json"),
  };
}

async function approvalRuntimeFor(
  action: Mp03Action,
  values: ReturnType<typeof paths>,
  trustedTime: TestClock,
) {
  return createMp08bDurableApprovalRuntime({
    fatesRoot: FATES_ROOT!,
    approvalStorePath: values.approvalStorePath,
    bindingStorePath: values.bindingStorePath,
    proposal: proposalSource(action),
    trustedTime,
  });
}

function queueRuntimeFor(
  approvalRuntime: Awaited<ReturnType<typeof createMp08bDurableApprovalRuntime>>,
  values: ReturnType<typeof paths>,
  trustedTime: TestClock,
  instanceId: string,
): Mp08bDurableQueueRuntime {
  return createMp08bDurableQueueRuntime({
    approvalRuntime,
    queuePath: values.queuePath,
    activityPath: values.activityPath,
    trustedTime,
    instanceId,
    leaseDurationMs: 1_000,
    retryBudget: 2,
  });
}

async function approvedQueueFixture(action: Mp03Action) {
  const values = paths();
  const trustedTime = clock();
  const approvalRuntime = await approvalRuntimeFor(action, values, trustedTime);
  const prepared = await approvalRuntime.prepareApproval(requestFor(action));
  const decision = await approvalRuntime.submitDecision({
    approvalId: prepared.binding.approvalId,
    envelope: envelope(prepared, "APPROVE"),
  });
  expect(decision.status).toBe("APPROVED");
  const queueRuntime = queueRuntimeFor(approvalRuntime, values, trustedTime, "queue-fixture");
  return { values, trustedTime, approvalRuntime, prepared, queueRuntime };
}

describeReal("MP-08B QUEUE-01 real Fates durable queue and worker", () => {
  it.each([
    "SEND_APPOINTMENT_DETAILS",
    "RESCHEDULE_APPOINTMENT",
    "TRANSMIT_CUSTOMER_CONTACT_DIRECTORY",
  ] as Mp03Action[])("enqueues one exact approved continuation for %s", async (action) => {
    const fixture = await approvedQueueFixture(action);
    try {
      const result = await fixture.queueRuntime.enqueueApproved(
        fixture.prepared.binding.approvalId,
      );
      expect(result.enqueue.status).toBe("ENQUEUED");
      expect(result.approval.state).toBe("APPROVED");
      expect(result.approval.decisionId).toBeTruthy();
      expect(result.work.actionIntentDigest).toBe(fixture.prepared.binding.intent.canonicalDigest);
      expect(result.work.actionIntentIdempotencyKey).toBe(
        fixture.prepared.binding.intent.idempotencyKey,
      );
      expect(result.work.protocolReferences?.approval).toEqual({
        approvalId: fixture.prepared.binding.approvalId,
        decisionId: result.approval.decisionId,
      });
      expect(result.delivery.state).toBe("AVAILABLE");
      expect(fixture.queueRuntime.capabilities).toEqual({
        durableLocalQueue: true,
        boundedWorker: true,
        hostedDurableQueue: false,
        externalEffects: false,
      });
    } finally {
      fixture.approvalRuntime.close();
      rmSync(fixture.values.directory, { recursive: true, force: true });
    }
  });

  it("rejects REJECTED approval without creating a queue item", async () => {
    const values = paths();
    const trustedTime = clock();
    const approvalRuntime = await approvalRuntimeFor(
      "SEND_APPOINTMENT_DETAILS",
      values,
      trustedTime,
    );
    try {
      const prepared = await approvalRuntime.prepareApproval(
        requestFor("SEND_APPOINTMENT_DETAILS"),
      );
      const decision = await approvalRuntime.submitDecision({
        approvalId: prepared.binding.approvalId,
        envelope: envelope(prepared, "REJECT"),
      });
      expect(decision.status).toBe("REJECTED");
      const queueRuntime = queueRuntimeFor(approvalRuntime, values, trustedTime, "reject-queue");
      await expect(queueRuntime.enqueueApproved(prepared.binding.approvalId)).rejects.toThrow(
        /APPROVED MP-05/,
      );
      expect(existsSync(values.queuePath)).toBe(false);
    } finally {
      approvalRuntime.close();
      rmSync(values.directory, { recursive: true, force: true });
    }
  });

  it("claims once, persists the lease, and reclaims only after expiry", async () => {
    const fixture = await approvedQueueFixture("SEND_APPOINTMENT_DETAILS");
    try {
      const enqueued = await fixture.queueRuntime.enqueueApproved(
        fixture.prepared.binding.approvalId,
      );
      const first = await fixture.queueRuntime.claim({
        deliveryId: enqueued.work.deliveryId,
        workerId: "worker-a",
      });
      expect(first.status).toBe("READY_FOR_MP04");
      expect(first.claim).toMatchObject({
        workerId: "worker-a",
        workId: enqueued.work.workId,
        deliveryId: enqueued.work.deliveryId,
        generation: 1,
      });
      expect(fixture.queueRuntime.inspectDelivery(enqueued.work.deliveryId)?.state).toBe("CLAIMED");

      const restartedApproval = await approvalRuntimeFor(
        "SEND_APPOINTMENT_DETAILS",
        fixture.values,
        fixture.trustedTime,
      );
      const restartedQueue = queueRuntimeFor(
        restartedApproval,
        fixture.values,
        fixture.trustedTime,
        "restarted-queue",
      );
      try {
        const activeLease = await restartedQueue.claim({
          deliveryId: enqueued.work.deliveryId,
          workerId: "worker-b",
        });
        expect(activeLease.status).toBe("CLAIM_REJECTED");
        expect(activeLease.reason).toBe("ALREADY_CLAIMED");

        fixture.trustedTime.value = LATER;
        const reclaimed = await restartedQueue.claim({
          deliveryId: enqueued.work.deliveryId,
          workerId: "worker-b",
        });
        expect(reclaimed.status).toBe("READY_FOR_MP04");
        expect(reclaimed.reclaimed).toBe(true);
        expect(reclaimed.claim?.generation).toBe(2);
        expect(reclaimed.claim?.workerId).toBe("worker-b");
      } finally {
        restartedApproval.close();
      }
    } finally {
      fixture.approvalRuntime.close();
      rmSync(fixture.values.directory, { recursive: true, force: true });
    }
  });

  it("arbitrates two workers with one durable claim and no effect boundary", async () => {
    const fixture = await approvedQueueFixture("RESCHEDULE_APPOINTMENT");
    try {
      const enqueued = await fixture.queueRuntime.enqueueApproved(
        fixture.prepared.binding.approvalId,
      );
      const otherQueue = queueRuntimeFor(
        fixture.approvalRuntime,
        fixture.values,
        fixture.trustedTime,
        "other-worker-instance",
      );
      const [first, second] = await Promise.all([
        fixture.queueRuntime.claim({ deliveryId: enqueued.work.deliveryId, workerId: "worker-a" }),
        otherQueue.claim({ deliveryId: enqueued.work.deliveryId, workerId: "worker-b" }),
      ]);
      expect([first.status, second.status].sort()).toEqual(["CLAIM_REJECTED", "READY_FOR_MP04"]);
      expect(fixture.queueRuntime.inspectOutcome(enqueued.work.workId)?.outcome).toBe("OPEN");
      expect(fixture.queueRuntime.listActivity(enqueued.work.workId).length).toBeGreaterThan(0);
    } finally {
      fixture.approvalRuntime.close();
      rmSync(fixture.values.directory, { recursive: true, force: true });
    }
  });

  it("rejects a forged queue approval reference before any MP-04 path", async () => {
    const fixture = await approvedQueueFixture("TRANSMIT_CUSTOMER_CONTACT_DIRECTORY");
    try {
      const enqueued = await fixture.queueRuntime.enqueueApproved(
        fixture.prepared.binding.approvalId,
      );
      const raw = JSON.parse(readFileSync(fixture.values.queuePath, "utf8")) as {
        deliveries: Record<
          string,
          { work: { protocolReferences?: { approval?: { approvalId: string } } } }
        >;
      };
      raw.deliveries[enqueued.work.deliveryId].work.protocolReferences!.approval!.approvalId =
        "forged-approval";
      writeFileSync(fixture.values.queuePath, JSON.stringify(raw), "utf8");
      const restarted = queueRuntimeFor(
        fixture.approvalRuntime,
        fixture.values,
        fixture.trustedTime,
        "forged-reference-worker",
      );
      const result = await restarted.claim({
        deliveryId: enqueued.work.deliveryId,
        workerId: "forged-reference-worker",
      });
      expect(result.status).toBe("BLOCKED");
      expect(result.reason).toMatch(/durable host approval binding|approval reread/i);
      expect(fixture.queueRuntime.inspectOutcome(enqueued.work.workId)?.outcome).toBe(
        "BOUNDARY_BLOCKED",
      );
    } finally {
      fixture.approvalRuntime.close();
      rmSync(fixture.values.directory, { recursive: true, force: true });
    }
  });

  it("makes repeated approved enqueue idempotent after queue restart", async () => {
    const fixture = await approvedQueueFixture("SEND_APPOINTMENT_DETAILS");
    try {
      const first = await fixture.queueRuntime.enqueueApproved(fixture.prepared.binding.approvalId);
      const restarted = queueRuntimeFor(
        fixture.approvalRuntime,
        fixture.values,
        fixture.trustedTime,
        "duplicate-enqueue",
      );
      const second = await restarted.enqueueApproved(fixture.prepared.binding.approvalId);
      expect(second.enqueue.status).toBe("DUPLICATE_DELIVERY");
      expect(second.work).toEqual(first.work);
      expect(second.delivery.state).toBe("AVAILABLE");
    } finally {
      fixture.approvalRuntime.close();
      rmSync(fixture.values.directory, { recursive: true, force: true });
    }
  });
});
