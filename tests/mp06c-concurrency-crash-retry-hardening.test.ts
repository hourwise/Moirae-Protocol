import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { afterEach, describe, expect, it } from "vitest";

import { compileAgentProposal } from "../packages/action-compiler/src/index.js";
import {
  demoCompilerContext,
  primaryCompilerFixtures,
} from "../packages/test-fixtures/src/index.js";
import {
  createQueueWork,
  deterministicQueueIdentity,
  DeterministicLocalWorker,
  DurableFilesystemActivitySink,
  DurableFilesystemLocalQueue,
  InjectedWorkerCrash,
  InMemoryActivitySink,
  InMemoryLocalQueue,
  Mp06RetryableFailure,
  type ActivitySink,
  type LocalQueuePort,
  type Mp04ExecutionPort,
  type Mp06WorkerResultV1,
  type QueueWorkV1,
  type TrustedTimeSource,
  type WorkerCheckpointV1,
  type WorkerFailureInjector,
} from "../packages/background-work/src/index.js";

const NOW = "2026-09-05T12:00:00.000Z";
const later = "2026-09-05T12:00:01.000Z";

class TestClock implements TrustedTimeSource {
  constructor(private current = NOW) {}

  now(): string {
    return this.current;
  }

  set(value: string): void {
    this.current = value;
  }
}

class CrashAt implements WorkerFailureInjector {
  constructor(private readonly target: WorkerCheckpointV1) {}

  checkpoint(point: WorkerCheckpointV1): void {
    if (point === this.target) throw new InjectedWorkerCrash(point);
  }
}

const admitted = () =>
  ({
    status: "ADMITTED",
    decision: "ALLOW",
    authority: "admission-only",
    action: "SEND_APPOINTMENT_DETAILS",
    operation: { server: "moirae", toolName: "sendAppointmentDetails", version: "1" },
    actionHash: "a".repeat(64),
    nativeActionHash: "a".repeat(64),
    approvalId: "approval-mp06c",
  }) as never;

const denied = () => ({ status: "REJECTED", nativeDecision: "DENY" }) as never;
const waiting = () => ({ status: "WAITING_FOR_APPROVAL", decision: "REQUIRE_APPROVAL" }) as never;
function fixture() {
  const result = compileAgentProposal({
    proposal: primaryCompilerFixtures[0].proposal,
    context: { ...demoCompilerContext, sourceRequestId: "REQUEST-MP06C-001" },
  });
  if (result.status !== "COMPILED") throw new Error(`Fixture did not compile: ${result.status}`);
  return result.actionIntent;
}

function newDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), "moirae-mp06c-"));
  testDirectories.push(directory);
  return directory;
}

const testDirectories: string[] = [];

afterEach(() => {
  for (const directory of testDirectories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

function makeQueue(
  clock: TestClock,
  durable = true,
  options: { retryBudget?: number } = {},
): {
  queue: LocalQueuePort;
  activity: ActivitySink;
} {
  if (!durable)
    return {
      queue: new InMemoryLocalQueue({ clock, ...options }),
      activity: new InMemoryActivitySink(),
    };
  const directory = newDirectory();
  return {
    queue: new DurableFilesystemLocalQueue(join(directory, "queue.json"), {
      clock,
      instanceId: "test-instance",
      leaseDurationMs: 1_000,
      retryBudget: options.retryBudget ?? 2,
    }),
    activity: new DurableFilesystemActivitySink(join(directory, "activity.json"), {
      instanceId: "test-activity",
    }),
  };
}

function enqueue(queue: LocalQueuePort, deliveryId = "delivery-1"): QueueWorkV1 {
  const work = createQueueWork(fixture(), { deliveryId });
  queue.enqueue(work);
  queue.makeAvailable(deliveryId, NOW);
  return work;
}

function worker(
  queue: LocalQueuePort,
  activity: ActivitySink,
  clock: TestClock,
  admission: (call: number) => Promise<never>,
  execution: Mp04ExecutionPort,
  crash?: CrashAt,
): { worker: DeterministicLocalWorker; calls: { admission: number } } {
  const calls = { admission: 0 };
  const instance = new DeterministicLocalWorker({
    queue,
    activity,
    clock,
    protocol: { load: async () => ({ intent: fixture(), authenticatedContext: {} }) },
    admission: {
      admitActionIntent: async () => {
        calls.admission += 1;
        return admission(calls.admission);
      },
    },
    execution,
    failureInjector: crash,
  });
  return { worker: instance, calls };
}

async function process(
  current: DeterministicLocalWorker,
  queue: LocalQueuePort,
  work: QueueWorkV1,
  clock: TestClock,
  workerId = "worker-1",
): Promise<Mp06WorkerResultV1> {
  const generation = (queue.inspectDelivery(work.deliveryId)?.generation ?? 0) + 1;
  return current.process({
    deliveryId: work.deliveryId,
    workerId,
    claimId: deterministicQueueIdentity.schedulingClaimId(
      work.workId,
      work.deliveryId,
      workerId,
      generation,
    ),
    now: clock.now(),
  });
}

function confirmedExecution(effect: { count: number }): Mp04ExecutionPort {
  return {
    executeAdmittedAction: async () => {
      if (!(effect as { confirmed?: boolean }).confirmed) {
        effect.count += 1;
        (effect as { confirmed?: boolean }).confirmed = true;
      }
      return {
        status: "CONFIRMED",
        durableExecutionId: `fates-execution:sha256:${"1".repeat(64)}`,
      } as never;
    },
  };
}

describe("MP-06C durable concurrency, crash, retry, and reconciliation hardening", () => {
  it("arbitrates independent durable queue instances and reclaims only after trusted expiry", () => {
    const clock = new TestClock();
    const directory = newDirectory();
    const path = join(directory, "queue.json");
    const first = new DurableFilesystemLocalQueue(path, {
      clock,
      instanceId: "first",
      leaseDurationMs: 1_000,
    });
    const second = new DurableFilesystemLocalQueue(path, {
      clock,
      instanceId: "second",
      leaseDurationMs: 1_000,
    });
    const work = enqueue(first);
    const firstClaim = first.acquire({
      deliveryId: work.deliveryId,
      workerId: "worker-a",
      claimId: deterministicQueueIdentity.schedulingClaimId(
        work.workId,
        work.deliveryId,
        "worker-a",
        1,
      ),
      now: NOW,
    });
    expect(firstClaim.status).toBe("CLAIMED");
    if (firstClaim.status !== "CLAIMED") throw new Error("Expected first claim.");

    const loser = second.acquire({
      deliveryId: work.deliveryId,
      workerId: "worker-b",
      claimId: deterministicQueueIdentity.schedulingClaimId(
        work.workId,
        work.deliveryId,
        "worker-b",
        2,
      ),
      now: "2099-01-01T00:00:00.000Z",
    });
    expect(loser).toEqual({ status: "REJECTED", reason: "ALREADY_CLAIMED" });

    clock.set(later);
    const reclaimed = second.acquire({
      deliveryId: work.deliveryId,
      workerId: "worker-b",
      claimId: deterministicQueueIdentity.schedulingClaimId(
        work.workId,
        work.deliveryId,
        "worker-b",
        2,
      ),
      now: later,
    });
    expect(reclaimed.status).toBe("CLAIMED");
    if (reclaimed.status !== "CLAIMED") throw new Error("Expected reclaimed claim.");
    expect(reclaimed.reclaimed).toBe(true);
    expect(reclaimed.claim.generation).toBe(2);
    expect(reclaimed.claim.expiresAt).toBe("2026-09-05T12:00:02.000Z");
  });

  it("rejects stale releases and completions from the old generation", () => {
    const clock = new TestClock();
    const { queue } = makeQueue(clock);
    const work = enqueue(queue);
    const old = queue.acquire({
      deliveryId: work.deliveryId,
      workerId: "worker-a",
      claimId: deterministicQueueIdentity.schedulingClaimId(
        work.workId,
        work.deliveryId,
        "worker-a",
        1,
      ),
      now: NOW,
    });
    if (old.status !== "CLAIMED") throw new Error("Expected old claim.");
    clock.set(later);
    const current = queue.acquire({
      deliveryId: work.deliveryId,
      workerId: "worker-b",
      claimId: deterministicQueueIdentity.schedulingClaimId(
        work.workId,
        work.deliveryId,
        "worker-b",
        2,
      ),
      now: later,
    });
    if (current.status !== "CLAIMED") throw new Error("Expected current claim.");
    expect(() =>
      queue.complete({ claim: old.claim, outcome: "COMPLETED", observedAt: later }),
    ).toThrow(/active compare-and-set claim/);
    expect(() =>
      queue.release({ claim: old.claim, availableAt: later, retryEligible: false }),
    ).toThrow(/active compare-and-set claim/);
    expect(queue.inspectDelivery(work.deliveryId)?.claim?.generation).toBe(2);
  });

  it("crash before MP-03 is recoverable and performs fresh authority", async () => {
    const clock = new TestClock();
    const { queue, activity } = makeQueue(clock);
    const work = enqueue(queue);
    const effect = { count: 0 };
    const first = worker(
      queue,
      activity,
      clock,
      async () => admitted(),
      confirmedExecution(effect),
      new CrashAt("BEFORE_MP03"),
    );
    await expect(process(first.worker, queue, work, clock)).rejects.toBeInstanceOf(
      InjectedWorkerCrash,
    );
    expect(first.calls.admission).toBe(0);
    clock.set(later);
    const second = worker(
      queue,
      activity,
      clock,
      async () => admitted(),
      confirmedExecution(effect),
    );
    expect((await process(second.worker, queue, work, clock)).status).toBe("completed");
    expect(second.calls.admission).toBe(1);
    expect(effect.count).toBe(1);
  });

  it("crash after ADMITTED before MP-04 ignores the old admission", async () => {
    const clock = new TestClock();
    const { queue, activity } = makeQueue(clock);
    const work = enqueue(queue);
    const effect = { count: 0 };
    const first = worker(
      queue,
      activity,
      clock,
      async () => admitted(),
      confirmedExecution(effect),
      new CrashAt("AFTER_MP03_ADMITTED"),
    );
    await expect(process(first.worker, queue, work, clock)).rejects.toBeInstanceOf(
      InjectedWorkerCrash,
    );
    expect(effect.count).toBe(0);
    clock.set(later);
    const second = worker(queue, activity, clock, async () => denied(), confirmedExecution(effect));
    const result = await process(second.worker, queue, work, clock);
    expect(result).toMatchObject({ status: "denied", queueOutcome: "DENIED" });
    expect(effect.count).toBe(0);
  });

  it("crash immediately before MP-04 cannot turn a fresh DENY into execution", async () => {
    const clock = new TestClock();
    const { queue, activity } = makeQueue(clock);
    const work = enqueue(queue);
    const effect = { count: 0 };
    const first = worker(
      queue,
      activity,
      clock,
      async () => admitted(),
      confirmedExecution(effect),
      new CrashAt("BEFORE_MP04"),
    );
    await expect(process(first.worker, queue, work, clock)).rejects.toBeInstanceOf(
      InjectedWorkerCrash,
    );
    clock.set(later);
    const second = worker(queue, activity, clock, async () => denied(), confirmedExecution(effect));
    await process(second.worker, queue, work, clock);
    expect(effect.count).toBe(0);
  });

  it("repairs COMPLETED after crash following MP-04 CONFIRMED without a second effect", async () => {
    const clock = new TestClock();
    const { queue, activity } = makeQueue(clock);
    const work = enqueue(queue);
    const effect = { count: 0 };
    const first = worker(
      queue,
      activity,
      clock,
      async () => admitted(),
      confirmedExecution(effect),
      new CrashAt("AFTER_MP04_CONFIRMED_BEFORE_QUEUE_COMPLETION"),
    );
    await expect(process(first.worker, queue, work, clock)).rejects.toBeInstanceOf(
      InjectedWorkerCrash,
    );
    expect(effect.count).toBe(1);
    clock.set(later);
    const second = worker(
      queue,
      activity,
      clock,
      async () => admitted(),
      confirmedExecution(effect),
    );
    expect((await process(second.worker, queue, work, clock)).status).toBe("completed");
    expect(effect.count).toBe(1);
    expect(queue.inspectOutcome(work.workId)?.outcome).toBe("COMPLETED");
  });

  it("routes UNKNOWN and RECOVERY_REQUIRED to reconciliation without redispatch", async () => {
    const clock = new TestClock();
    const { queue, activity } = makeQueue(clock);
    const work = enqueue(queue);
    let executeCalls = 0;
    const first = worker(queue, activity, clock, async () => admitted(), {
      executeAdmittedAction: async () => {
        executeCalls += 1;
        return {
          status: "UNKNOWN",
          durableExecutionId: `fates-execution:sha256:${"2".repeat(64)}`,
        } as never;
      },
      recoverActionExecution: async () =>
        ({
          status: "UNKNOWN",
          durableExecutionId: `fates-execution:sha256:${"2".repeat(64)}`,
        }) as never,
    });
    const unknown = await process(first.worker, queue, work, clock);
    expect(unknown).toMatchObject({
      status: "reconciliation-required",
      queueOutcome: "RECONCILIATION_REQUIRED",
    });
    expect(executeCalls).toBe(1);

    const replay = createQueueWork(fixture(), { deliveryId: "delivery-reconcile" });
    queue.enqueue(replay);
    queue.makeAvailable(replay.deliveryId, NOW);
    const reconciliationExecution: Mp04ExecutionPort = {
      executeAdmittedAction: async () => ({ status: "UNKNOWN" }) as never,
      recoverActionExecution: async () =>
        ({
          status: "UNKNOWN",
          durableExecutionId: `fates-execution:sha256:${"2".repeat(64)}`,
        }) as never,
    };
    const second = worker(
      queue,
      activity,
      clock,
      async () => {
        throw new Error("Fresh MP-03 must not run during native reconciliation.");
      },
      reconciliationExecution,
    );
    const recovered = await process(second.worker, queue, replay, clock);
    expect(recovered.status).toBe("reconciliation-required");
    expect(executeCalls).toBe(1);
  });

  it("routes an explicit MP-04 RECOVERY_REQUIRED result without fresh dispatch", async () => {
    const clock = new TestClock();
    const { queue, activity } = makeQueue(clock);
    const work = enqueue(queue);
    let executeCalls = 0;
    const current = worker(queue, activity, clock, async () => admitted(), {
      executeAdmittedAction: async () => {
        executeCalls += 1;
        return {
          status: "RECOVERY_REQUIRED",
          durableExecutionId: `fates-execution:sha256:${"4".repeat(64)}`,
        } as never;
      },
    });
    const result = await process(current.worker, queue, work, clock);
    expect(result).toMatchObject({
      status: "reconciliation-required",
      queueOutcome: "RECONCILIATION_REQUIRED",
    });
    expect(executeCalls).toBe(1);
    expect(queue.inspectOutcome(work.workId)?.mp04DurableExecutionId).toContain(
      "fates-execution:sha256:",
    );
  });

  it("preserves ABSENT as effect-absent and never retries it", async () => {
    const clock = new TestClock();
    const { queue, activity } = makeQueue(clock);
    const work = enqueue(queue);
    const effect = { count: 0 };
    const current = worker(queue, activity, clock, async () => admitted(), {
      executeAdmittedAction: async () =>
        ({
          status: "ABSENT",
          durableExecutionId: `fates-execution:sha256:${"3".repeat(64)}`,
        }) as never,
    });
    const result = await process(current.worker, queue, work, clock);
    expect(result).toMatchObject({ status: "effect-absent", queueOutcome: "EFFECT_ABSENT" });
    expect(effect.count).toBe(0);
    expect(queue.inspectOutcome(work.workId)?.retryAttempt).toBe(0);
  });

  it("classifies only typed pre-authority failures as retryable and uses deterministic backoff", async () => {
    const clock = new TestClock();
    const { queue, activity } = makeQueue(clock, true, { retryBudget: 2 });
    const work = enqueue(queue);
    const effect = { count: 0 };
    const first = worker(
      queue,
      activity,
      clock,
      async () => {
        throw new Mp06RetryableFailure(
          "TRANSIENT_PRE_AUTHORITY",
          "temporary local coordination failure",
        );
      },
      confirmedExecution(effect),
    );
    const retry = await process(first.worker, queue, work, clock);
    expect(retry).toMatchObject({
      status: "retry-eligible",
      queueOutcome: "RETRY_SCHEDULED",
      retryAttempt: 1,
      retryBudget: 2,
    });
    expect(queue.inspectOutcome(work.workId)?.nextEligibleAt).toBe("2026-09-05T12:00:01.000Z");
    expect(queue.inspectDelivery(work.deliveryId)?.state).toBe("RETRY_SCHEDULED");

    clock.set("2026-09-05T12:00:01.000Z");
    queue.makeAvailable(work.deliveryId, clock.now());
    const second = worker(
      queue,
      activity,
      clock,
      async () => admitted(),
      confirmedExecution(effect),
    );
    expect((await process(second.worker, queue, work, clock)).status).toBe("completed");
    expect(effect.count).toBe(1);
  });

  it("exhausts the durable retry budget and resists duplicate-delivery retry storms", async () => {
    const clock = new TestClock();
    const { queue, activity } = makeQueue(clock, true, { retryBudget: 2 });
    const work = enqueue(queue);
    const retrying = () =>
      worker(
        queue,
        activity,
        clock,
        async () => {
          throw new Mp06RetryableFailure(
            "TRANSIENT_COORDINATION",
            "temporary coordination failure",
          );
        },
        { executeAdmittedAction: async () => ({ status: "CONFIRMED" }) as never },
      );

    let result = await process(retrying().worker, queue, work, clock);
    expect(result.retryAttempt).toBe(1);
    clock.set("2026-09-05T12:00:02.000Z");
    queue.makeAvailable(work.deliveryId, clock.now());
    result = await process(retrying().worker, queue, work, clock);
    expect(result.retryAttempt).toBe(2);

    const duplicate = createQueueWork(fixture(), { deliveryId: "delivery-storm" });
    queue.enqueue(duplicate);
    queue.makeAvailable(duplicate.deliveryId, clock.now());
    result = await process(retrying().worker, queue, duplicate, clock);
    expect(result).toMatchObject({ status: "retry-exhausted", queueOutcome: "RETRY_EXHAUSTED" });
    expect(queue.inspectOutcome(work.workId)).toMatchObject({
      retryAttempt: 2,
      retryBudget: 2,
      outcome: "RETRY_EXHAUSTED",
    });

    const replay = await process(retrying().worker, queue, duplicate, clock);
    expect(replay.status).toBe("claim-rejected");
  });

  it("does not spend retry budget while approval is waiting or after DENY", async () => {
    const clock = new TestClock();
    const waitingCase = makeQueue(clock, true, { retryBudget: 2 });
    const waitingWork = enqueue(waitingCase.queue);
    const waitingWorker = worker(
      waitingCase.queue,
      waitingCase.activity,
      clock,
      async () => waiting(),
      {
        executeAdmittedAction: async () => ({ status: "CONFIRMED" }) as never,
      },
    );
    expect(
      (await process(waitingWorker.worker, waitingCase.queue, waitingWork, clock)).status,
    ).toBe("waiting");
    expect(waitingCase.queue.inspectOutcome(waitingWork.workId)?.retryAttempt).toBe(0);

    const denyCase = makeQueue(clock, true, { retryBudget: 2 });
    const denyWork = enqueue(denyCase.queue);
    const denyWorker = worker(denyCase.queue, denyCase.activity, clock, async () => denied(), {
      executeAdmittedAction: async () => ({ status: "CONFIRMED" }) as never,
    });
    expect((await process(denyWorker.worker, denyCase.queue, denyWork, clock)).status).toBe(
      "denied",
    );
    expect(denyCase.queue.inspectOutcome(denyWork.workId)?.retryAttempt).toBe(0);
    const redelivery = createQueueWork(fixture(), { deliveryId: "delivery-deny-redelivery" });
    denyCase.queue.enqueue(redelivery);
    denyCase.queue.makeAvailable(redelivery.deliveryId, clock.now());
    expect((await process(denyWorker.worker, denyCase.queue, redelivery, clock)).reason).toBe(
      "LOGICAL_TERMINAL",
    );
  });

  it("fails closed on malformed, unsupported, and partially written durable state", () => {
    const directory = newDirectory();
    const path = join(directory, "queue.json");
    writeFileSync(path, "{not-json", "utf8");
    expect(() =>
      new DurableFilesystemLocalQueue(path, { instanceId: "malformed" }).inspectOutcome("x"),
    ).toThrow(/malformed or unreadable/);

    writeFileSync(
      path,
      JSON.stringify({ schemaVersion: "old", logical: {}, deliveries: {} }),
      "utf8",
    );
    expect(() =>
      new DurableFilesystemLocalQueue(path, { instanceId: "unsupported" }).inspectOutcome("x"),
    ).toThrow(/schema/);

    rmSync(path, { force: true });
    writeFileSync(`${path}.tmp-stale`, "{}", "utf8");
    expect(() =>
      new DurableFilesystemLocalQueue(path, { instanceId: "partial" }).inspectOutcome("x"),
    ).toThrow(/partial/);
  });

  it("reconstructs queue, retry, claim-generation, and activity state after restart", () => {
    const clock = new TestClock();
    const directory = newDirectory();
    const queuePath = join(directory, "queue.json");
    const activityPath = join(directory, "activity.json");
    const first = new DurableFilesystemLocalQueue(queuePath, {
      clock,
      instanceId: "restart-one",
      retryBudget: 2,
    });
    const work = enqueue(first);
    const claim = first.acquire({
      deliveryId: work.deliveryId,
      workerId: "worker-a",
      claimId: deterministicQueueIdentity.schedulingClaimId(
        work.workId,
        work.deliveryId,
        "worker-a",
        1,
      ),
      now: NOW,
    });
    expect(claim.status).toBe("CLAIMED");
    const activity = new DurableFilesystemActivitySink(activityPath, {
      instanceId: "activity-one",
    });
    activity.append({
      schemaVersion: "mp06b-activity-v1",
      activityId: "restart-activity",
      workId: work.workId,
      deliveryId: work.deliveryId,
      state: "CLAIMED",
      observedAt: NOW,
      workerId: "worker-a",
      sourceRequestId: work.sourceRequestId,
      actionIntentDigest: work.actionIntentDigest,
    });

    const restarted = new DurableFilesystemLocalQueue(queuePath, {
      clock,
      instanceId: "restart-two",
      retryBudget: 2,
    });
    expect(restarted.inspectOutcome(work.workId)).toMatchObject({
      outcome: "OPEN",
      retryAttempt: 0,
    });
    expect(restarted.inspectDelivery(work.deliveryId)?.claim?.workerId).toBe("worker-a");
    expect(new DurableFilesystemActivitySink(activityPath).list(work.workId)).toHaveLength(1);
    expect(readFileSync(queuePath, "utf8")).toContain("mp06c-durable-queue-state-v1");
  });

  it("persists terminal queue state before activity and survives a post-terminal crash", async () => {
    const clock = new TestClock();
    const { queue, activity } = makeQueue(clock);
    const work = enqueue(queue);
    const effect = { count: 0 };
    const crashing = worker(
      queue,
      activity,
      clock,
      async () => admitted(),
      confirmedExecution(effect),
      new CrashAt("AFTER_TERMINAL_QUEUE_PERSISTENCE"),
    );
    await expect(process(crashing.worker, queue, work, clock)).rejects.toBeInstanceOf(
      InjectedWorkerCrash,
    );
    expect(queue.inspectOutcome(work.workId)?.outcome).toBe("COMPLETED");
    expect(effect.count).toBe(1);
    expect((await process(crashing.worker, queue, work, clock)).status).toBe("claim-rejected");
  });

  it("preserves DENY across a crash after queue terminal persistence and redelivery", async () => {
    const clock = new TestClock();
    const { queue, activity } = makeQueue(clock);
    const work = enqueue(queue);
    const current = worker(
      queue,
      activity,
      clock,
      async () => denied(),
      { executeAdmittedAction: async () => ({ status: "CONFIRMED" }) as never },
      new CrashAt("AFTER_TERMINAL_QUEUE_PERSISTENCE"),
    );
    await expect(process(current.worker, queue, work, clock)).rejects.toBeInstanceOf(
      InjectedWorkerCrash,
    );
    expect(queue.inspectOutcome(work.workId)?.outcome).toBe("DENIED");
    const redelivery = createQueueWork(fixture(), { deliveryId: "delivery-deny-after-crash" });
    queue.enqueue(redelivery);
    queue.makeAvailable(redelivery.deliveryId, clock.now());
    const replay = await process(current.worker, queue, redelivery, clock, "worker-2");
    expect(replay).toMatchObject({ status: "claim-rejected", reason: "LOGICAL_TERMINAL" });
    expect(current.calls.admission).toBe(1);
  });

  it("persists retry state before a crash and resumes without resetting the budget", async () => {
    const clock = new TestClock();
    const { queue, activity } = makeQueue(clock, true, { retryBudget: 2 });
    const work = enqueue(queue);
    const crashing = worker(
      queue,
      activity,
      clock,
      async () => {
        throw new Mp06RetryableFailure("TRANSIENT_COORDINATION", "retry me");
      },
      { executeAdmittedAction: async () => ({ status: "CONFIRMED" }) as never },
      new CrashAt("AFTER_RETRY_STATE_PERSISTENCE"),
    );
    await expect(process(crashing.worker, queue, work, clock)).rejects.toBeInstanceOf(
      InjectedWorkerCrash,
    );
    expect(queue.inspectOutcome(work.workId)).toMatchObject({
      outcome: "RETRY_SCHEDULED",
      retryAttempt: 1,
      retryBudget: 2,
    });
  });
});
