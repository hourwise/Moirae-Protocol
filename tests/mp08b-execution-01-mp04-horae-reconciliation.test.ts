import { mkdtempSync, rmSync } from "node:fs";
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
  MP04_DEPENDENCY_PROVENANCE,
  createMp04ExecutionCoordinator,
  type Mp04EffectAdapterIdentityV1,
  type Mp04HoraePort,
} from "../packages/execution-coordinator/src/index.js";
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
import { createMp08bDurableQueueRuntime } from "../apps/host/src/queue-runtime.js";

const FATES_ROOT = process.env.MP05_FATES_ANANKE_ROOT;
const describeReal = FATES_ROOT ? describe : describe.skip;
const NOW = "2026-09-03T12:00:00.000Z";
const LATER = "2026-09-03T12:06:00.000Z";
const SOURCE_REQUEST_ID = "REQUEST-MP02-DETAILS-001";
const ADAPTER_ID: Mp04EffectAdapterIdentityV1 = {
  id: "synthetic.moirae.execution-01",
  version: "1",
};

type ExecutionMode = "CONFIRMED" | "ABSENT" | "UNKNOWN";

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
    modelId: "mock/execution-01-fixture",
    live: false,
    invoke: async () => ({
      proposal: proposalFor(action),
      metadata: {
        sdk: "@strands-agents/sdk",
        sdkVersion: "1.16.0",
        provider: "mock",
        modelId: "mock/execution-01-fixture",
        requestId: "MP08B-EXECUTION-01",
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
    request: `Offline Execution-01 fixture for ${action}; no model call is allowed.`,
    compilerContext: {
      ...createDemoCompilerContext(SOURCE_REQUEST_ID),
      agentPrincipalId: MP03_ACTING_AGENT,
    },
    authenticatedContext: authenticatedContextFor(action),
    now: NOW,
  };
}

function envelope(prepared: Mp08bPreparedApprovalV1) {
  return {
    schemaVersion: "human-decision-v1" as const,
    approvalId: prepared.binding.approvalId,
    decision: "APPROVE" as const,
    presentationDigest: prepared.preparation.presentation.presentationDigest,
    nativePresentationBindingHash: prepared.preparation.presentation.nativePresentationBindingHash,
  };
}

function paths() {
  const directory = mkdtempSync(join(tmpdir(), "moirae-mp08b-execution-01-"));
  return {
    directory,
    approvalStorePath: join(directory, "approval.sqlite"),
    bindingStorePath: join(directory, "approval-bindings.json"),
    queuePath: join(directory, "queue.json"),
    activityPath: join(directory, "activity.json"),
    horaePath: join(directory, "horae.json"),
  };
}

async function approvedQueueFixture(action: Mp03Action) {
  const values = paths();
  const trustedTime = clock();
  const approvalRuntime = await createMp08bDurableApprovalRuntime({
    fatesRoot: FATES_ROOT!,
    approvalStorePath: values.approvalStorePath,
    bindingStorePath: values.bindingStorePath,
    proposal: proposalSource(action),
    trustedTime,
  });
  const prepared = await approvalRuntime.prepareApproval(requestFor(action));
  const decision = await approvalRuntime.submitDecision({
    approvalId: prepared.binding.approvalId,
    envelope: envelope(prepared),
  });
  expect(decision.status).toBe("APPROVED");
  const queueRuntime = createMp08bDurableQueueRuntime({
    approvalRuntime,
    queuePath: values.queuePath,
    activityPath: values.activityPath,
    trustedTime,
    instanceId: "execution-01-worker",
    leaseDurationMs: 10 * 60 * 1_000,
    retryBudget: 2,
  });
  const enqueued = await queueRuntime.enqueueApproved(prepared.binding.approvalId);
  const claimed = await queueRuntime.claim({
    deliveryId: enqueued.work.deliveryId,
    workerId: "execution-01-worker",
  });
  expect(claimed.status).toBe("READY_FOR_MP04");
  if (claimed.status !== "READY_FOR_MP04" || !claimed.claim)
    throw new Error("The approved fixture did not reach READY_FOR_MP04.");
  return { values, trustedTime, approvalRuntime, prepared, queueRuntime, enqueued, claimed };
}

function horaeFixture(mode: ExecutionMode): Mp04HoraePort {
  let record: Record<string, unknown> | undefined;
  return {
    execute: async (input) => {
      const authority = input.authority as Record<string, unknown>;
      const confirmed = mode === "CONFIRMED";
      const absent = mode === "ABSENT";
      record = {
        durableExecutionId: authority.durableExecutionId,
        authority,
        authorityInstanceDigest: authority.authorityInstanceDigest,
        nativeActionHash: authority.nativeActionHash,
        operation: authority.operation,
        argumentsDigest: authority.argumentsDigest,
        targetDigest: authority.targetDigest,
        effectAdapter: ADAPTER_ID,
        state: confirmed || absent ? "terminal" : "effect_reconciliation_required",
        history: [
          { state: "authority_validated", event: "authority validated" },
          { state: "execution_reserved", event: "execution reserved" },
          { state: "executor_invocation_started", event: "bounded fixture invoked" },
          ...(confirmed || absent
            ? [{ state: "terminal", event: `bounded fixture ${mode.toLowerCase()}` }]
            : [{ state: "effect_reconciliation_required", event: "fixture outcome ambiguous" }]),
        ],
        claim: {
          owner: input.owner,
          generation: 1,
          claimDigest: `sha256:${"3".repeat(64)}`,
        },
        ...(confirmed || absent
          ? {
              receipt: {
                result: mode,
                checksum: `sha256:${"4".repeat(64)}`,
              },
              result: mode,
            }
          : {}),
        updatedAt: input.now,
      };
      return record;
    },
    recover: async () => record,
    get: () => record,
  };
}

function executionFor(
  approvalRuntime: Awaited<ReturnType<typeof createMp08bDurableApprovalRuntime>>,
  mode: ExecutionMode,
) {
  return createMp04ExecutionCoordinator({
    ananke: approvalRuntime.getMp04AnankePort(),
    horae: horaeFixture(mode),
    effectAdapter: ADAPTER_ID,
    owner: "execution-01-worker",
    provenance: MP04_DEPENDENCY_PROVENANCE,
  });
}

describeReal("MP-08B EXECUTION-01 local MP-04/Horae reconciliation composition", () => {
  it.each([
    "SEND_APPOINTMENT_DETAILS",
    "RESCHEDULE_APPOINTMENT",
    "TRANSMIT_CUSTOMER_CONTACT_DIRECTORY",
  ] as Mp03Action[])("reaches MP-04 through an exact approved claim for %s", async (action) => {
    const fixture = await approvedQueueFixture(action);
    try {
      const execution = executionFor(fixture.approvalRuntime, "CONFIRMED");
      const result = await fixture.queueRuntime.executeClaimed({
        deliveryId: fixture.enqueued.work.deliveryId,
        claim: fixture.claimed.claim!,
        execution,
      });
      expect(result.status).toBe("COMPLETED");
      expect(result.execution?.status).toBe("CONFIRMED");
      expect(fixture.queueRuntime.inspectOutcome(fixture.enqueued.work.workId)).toMatchObject({
        outcome: "COMPLETED",
        mp04DurableExecutionId: result.execution?.durableExecutionId,
      });
      expect(fixture.queueRuntime.listActivity(fixture.enqueued.work.workId).at(-1)).toMatchObject({
        state: "COMPLETED",
        mp04Status: "CONFIRMED",
      });
    } finally {
      fixture.approvalRuntime.close();
      rmSync(fixture.values.directory, { recursive: true, force: true });
    }
  });

  it("persists UNKNOWN reconciliation truth and never upgrades it to completion", async () => {
    const fixture = await approvedQueueFixture("SEND_APPOINTMENT_DETAILS");
    try {
      const result = await fixture.queueRuntime.executeClaimed({
        deliveryId: fixture.enqueued.work.deliveryId,
        claim: fixture.claimed.claim!,
        execution: executionFor(fixture.approvalRuntime, "UNKNOWN"),
      });
      expect(result.status).toBe("RECONCILIATION_REQUIRED");
      expect(result.execution?.status).toBe("UNKNOWN");
      const restartedQueue = createMp08bDurableQueueRuntime({
        approvalRuntime: fixture.approvalRuntime,
        queuePath: fixture.values.queuePath,
        activityPath: fixture.values.activityPath,
        trustedTime: fixture.trustedTime,
        instanceId: "restarted-execution-worker",
      });
      expect(restartedQueue.inspectOutcome(fixture.enqueued.work.workId)).toMatchObject({
        outcome: "RECONCILIATION_REQUIRED",
        mp04DurableExecutionId: result.execution?.durableExecutionId,
      });
    } finally {
      fixture.approvalRuntime.close();
      rmSync(fixture.values.directory, { recursive: true, force: true });
    }
  });

  it("rejects an executor-shaped CONFIRMED result without accepted reconciliation evidence", async () => {
    const fixture = await approvedQueueFixture("RESCHEDULE_APPOINTMENT");
    try {
      const result = await fixture.queueRuntime.executeClaimed({
        deliveryId: fixture.enqueued.work.deliveryId,
        claim: fixture.claimed.claim!,
        execution: {
          executeAdmittedAction: async () => ({ status: "CONFIRMED" }) as never,
        },
      });
      expect(result.status).toBe("BOUNDARY_BLOCKED");
      expect(fixture.queueRuntime.inspectOutcome(fixture.enqueued.work.workId)?.outcome).toBe(
        "BOUNDARY_BLOCKED",
      );
    } finally {
      fixture.approvalRuntime.close();
      rmSync(fixture.values.directory, { recursive: true, force: true });
    }
  });

  it("rejects a stale or mismatched worker claim before MP-04", async () => {
    const fixture = await approvedQueueFixture("TRANSMIT_CUSTOMER_CONTACT_DIRECTORY");
    try {
      const execution = executionFor(fixture.approvalRuntime, "CONFIRMED");
      const forgedClaim = { ...fixture.claimed.claim!, workerId: "attacker-worker" };
      const result = await fixture.queueRuntime.executeClaimed({
        deliveryId: fixture.enqueued.work.deliveryId,
        claim: forgedClaim,
        execution,
      });
      expect(result.status).toBe("CLAIM_REJECTED");
      expect(fixture.queueRuntime.inspectOutcome(fixture.enqueued.work.workId)?.outcome).toBe(
        "OPEN",
      );
    } finally {
      fixture.approvalRuntime.close();
      rmSync(fixture.values.directory, { recursive: true, force: true });
    }
  });

  it("fails closed when the approved native state expires after claim", async () => {
    const fixture = await approvedQueueFixture("SEND_APPOINTMENT_DETAILS");
    try {
      fixture.trustedTime.value = LATER;
      const result = await fixture.queueRuntime.executeClaimed({
        deliveryId: fixture.enqueued.work.deliveryId,
        claim: fixture.claimed.claim!,
        execution: executionFor(fixture.approvalRuntime, "CONFIRMED"),
      });
      expect(result.status).toBe("BOUNDARY_BLOCKED");
      expect(result.reason).toMatch(/approved|expired/i);
      expect(fixture.queueRuntime.inspectOutcome(fixture.enqueued.work.workId)?.outcome).toBe(
        "BOUNDARY_BLOCKED",
      );
    } finally {
      fixture.approvalRuntime.close();
      rmSync(fixture.values.directory, { recursive: true, force: true });
    }
  });
});
