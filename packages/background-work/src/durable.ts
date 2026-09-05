import {
  closeSync,
  existsSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";

import { canonicalizeJsonV1 } from "../../action-compiler/src/index.js";
import { InMemoryLocalQueue } from "./index.js";
import type {
  ActivityRecordV1,
  ActivitySink,
  LocalQueueOptions,
  LocalQueuePort,
  QueueApprovalReferenceV1,
  QueueAcquireResultV1,
  QueueDeliverySnapshotV1,
  QueueDurableStateV1,
  QueueEnqueueResultV1,
  QueueOutcomeSnapshotV1,
  QueueReleaseResultV1,
  QueueTerminalOutcomeV1,
  QueueWorkV1,
  RetryFailureClassV1,
  SchedulingClaimV1,
} from "./index.js";

const durableStateVersion = "mp06c-durable-queue-state-v1" as const;
const activityStateVersion = "mp06c-durable-activity-v1" as const;
const sleepBuffer = new SharedArrayBuffer(4);

export class DurableQueueError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DurableQueueError";
  }
}

export class DurableQueueBusyError extends DurableQueueError {
  constructor(message = "The MP-06C durable queue store is busy.") {
    super(message);
    this.name = "DurableQueueBusyError";
  }
}

type DurableQueueOptions = LocalQueueOptions & {
  readonly instanceId?: string;
  readonly lockAttempts?: number;
};

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function assertAbsoluteStorePath(filePath: string): string {
  if (!isAbsolute(filePath)) throw new DurableQueueError("Durable MP-06C paths must be absolute.");
  const resolved = resolve(filePath);
  const parent = dirname(resolved);
  mkdirSync(parent, { recursive: true });
  if (existsSync(parent) && lstatSync(parent).isSymbolicLink())
    throw new DurableQueueError("Durable MP-06C store parent cannot be a symbolic link.");
  if (existsSync(resolved) && lstatSync(resolved).isSymbolicLink())
    throw new DurableQueueError("Durable MP-06C store cannot be a symbolic link.");
  return resolved;
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

class FileMutex {
  private readonly lockAttempts: number;

  constructor(
    private readonly lockPath: string,
    private readonly instanceId: string,
    lockAttempts = 100,
  ) {
    this.lockAttempts = Number.isSafeInteger(lockAttempts) && lockAttempts > 0 ? lockAttempts : 100;
  }

  withLock<T>(operation: () => T): T {
    this.acquire();
    try {
      return operation();
    } finally {
      if (existsSync(this.lockPath)) unlinkSync(this.lockPath);
    }
  }

  private acquire(): void {
    mkdirSync(dirname(this.lockPath), { recursive: true });
    for (let attempt = 0; attempt < this.lockAttempts; attempt += 1) {
      try {
        const fd = openSync(this.lockPath, "wx");
        try {
          writeFileSync(
            fd,
            canonicalizeJsonV1({ pid: process.pid, instanceId: this.instanceId }),
            "utf8",
          );
          fsyncSync(fd);
        } finally {
          closeSync(fd);
        }
        return;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
        let owner: { pid?: number };
        try {
          owner = JSON.parse(readFileSync(this.lockPath, "utf8")) as { pid?: number };
        } catch {
          throw new DurableQueueError("The durable MP-06C lock record is malformed.");
        }
        if (typeof owner.pid !== "number" || !Number.isSafeInteger(owner.pid))
          throw new DurableQueueError("The durable MP-06C lock owner is malformed.");
        if (!isProcessAlive(owner.pid)) {
          unlinkSync(this.lockPath);
          continue;
        }
        Atomics.wait(new Int32Array(sleepBuffer), 0, 0, 1);
      }
    }
    throw new DurableQueueBusyError();
  }
}

function emptyState(): QueueDurableStateV1 {
  return { schemaVersion: durableStateVersion, logical: {}, deliveries: {} };
}

function parseJsonFile<T>(filePath: string, label: string): T {
  try {
    return JSON.parse(readFileSync(filePath, "utf8")) as T;
  } catch {
    throw new DurableQueueError(`${label} is malformed or unreadable.`);
  }
}

function atomicWriteJson(filePath: string, value: unknown, instanceId: string): void {
  const temporaryPath = `${filePath}.tmp-${process.pid}-${instanceId}`;
  const contents = `${canonicalizeJsonV1(value)}\n`;
  const fd = openSync(temporaryPath, "w");
  try {
    writeFileSync(fd, contents, "utf8");
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  renameSync(temporaryPath, filePath);
}

function staleTemporaryFiles(filePath: string): string[] {
  const directory = dirname(filePath);
  const prefix = `${basename(filePath)}.tmp-`;
  return readdirSync(directory)
    .filter((name) => name.startsWith(prefix))
    .map((name) => join(directory, name));
}

function assertStateFilePath(filePath: string): void {
  if (existsSync(filePath)) {
    const stat = lstatSync(filePath);
    if (!stat.isFile()) throw new DurableQueueError("The MP-06C durable state path is not a file.");
  }
}

export class DurableFilesystemLocalQueue implements LocalQueuePort {
  private readonly statePath: string;
  private readonly options: LocalQueueOptions;
  private readonly instanceId: string;
  private readonly mutex: FileMutex;

  constructor(statePath: string, options: DurableQueueOptions = {}) {
    this.statePath = assertAbsoluteStorePath(statePath);
    this.options = { ...options };
    this.instanceId = options.instanceId ?? `pid-${process.pid}`;
    this.mutex = new FileMutex(`${this.statePath}.lock`, this.instanceId, options.lockAttempts);
    assertStateFilePath(this.statePath);
  }

  enqueue(work: QueueWorkV1): QueueEnqueueResultV1 {
    return this.mutate((queue) => queue.enqueue(work));
  }

  makeAvailable(deliveryId: string, availableAt: string): QueueDeliverySnapshotV1 {
    return this.mutate((queue) => queue.makeAvailable(deliveryId, availableAt));
  }

  acquire(input: {
    readonly deliveryId: string;
    readonly workerId: string;
    readonly claimId: string;
    readonly now: string;
  }): QueueAcquireResultV1 {
    try {
      return this.mutate((queue) => queue.acquire(input));
    } catch (error) {
      if (error instanceof DurableQueueBusyError)
        return { status: "REJECTED", reason: "STORE_BUSY" };
      throw error;
    }
  }

  complete(input: {
    readonly claim: SchedulingClaimV1;
    readonly outcome: QueueTerminalOutcomeV1;
    readonly observedAt: string;
    readonly mp04DurableExecutionId?: string;
    readonly approvalReference?: QueueApprovalReferenceV1;
  }): QueueDeliverySnapshotV1 {
    return this.mutate((queue) => queue.complete(input));
  }

  parkForApproval(input: {
    readonly claim: SchedulingClaimV1;
    readonly approvalId: string;
    readonly observedAt: string;
  }): QueueDeliverySnapshotV1 {
    return this.mutate((queue) => queue.parkForApproval(input));
  }

  release(input: {
    readonly claim: SchedulingClaimV1;
    readonly availableAt: string;
    readonly retryEligible: boolean;
    readonly failureClass?: RetryFailureClassV1;
  }): QueueReleaseResultV1 {
    return this.mutate((queue) => queue.release(input));
  }

  inspectDelivery(deliveryId: string): QueueDeliverySnapshotV1 | undefined {
    return this.readQueue().inspectDelivery(deliveryId);
  }

  inspectOutcome(workId: string): QueueOutcomeSnapshotV1 | undefined {
    return this.readQueue().inspectOutcome(workId);
  }

  private readState(): QueueDurableStateV1 {
    assertStateFilePath(this.statePath);
    const temporaryFiles = staleTemporaryFiles(this.statePath);
    if (!existsSync(this.statePath)) {
      if (temporaryFiles.length > 0)
        throw new DurableQueueError("A partial MP-06C state replacement was detected.");
      return emptyState();
    }
    const state = parseJsonFile<QueueDurableStateV1>(this.statePath, "MP-06C durable queue state");
    const queue = InMemoryLocalQueue.fromState(state, this.options);
    for (const temporaryFile of temporaryFiles) rmSync(temporaryFile, { force: true });
    return queue.exportState();
  }

  private readQueue(): InMemoryLocalQueue {
    return InMemoryLocalQueue.fromState(this.readState(), this.options);
  }

  private mutate<T>(operation: (queue: InMemoryLocalQueue) => T): T {
    return this.mutex.withLock(() => {
      const queue = InMemoryLocalQueue.fromState(this.readState(), this.options);
      const result = operation(queue);
      atomicWriteJson(this.statePath, queue.exportState(), this.instanceId);
      return result;
    });
  }
}

type DurableActivityState = Readonly<{
  schemaVersion: typeof activityStateVersion;
  records: readonly ActivityRecordV1[];
}>;

export class DurableFilesystemActivitySink implements ActivitySink {
  private readonly path: string;
  private readonly instanceId: string;
  private readonly mutex: FileMutex;

  constructor(
    activityPath: string,
    options: { readonly instanceId?: string; readonly lockAttempts?: number } = {},
  ) {
    this.path = assertAbsoluteStorePath(activityPath);
    this.instanceId = options.instanceId ?? `pid-${process.pid}`;
    this.mutex = new FileMutex(`${this.path}.lock`, this.instanceId, options.lockAttempts);
  }

  append(record: ActivityRecordV1): void {
    this.mutex.withLock(() => {
      const current = this.read();
      current.push(clone(record));
      atomicWriteJson(
        this.path,
        { schemaVersion: activityStateVersion, records: current },
        this.instanceId,
      );
    });
  }

  list(workId?: string): readonly ActivityRecordV1[] {
    return this.read()
      .filter((record) => !workId || record.workId === workId)
      .map((record) => clone(record));
  }

  private read(): ActivityRecordV1[] {
    if (!existsSync(this.path)) return [];
    const state = parseJsonFile<DurableActivityState>(this.path, "MP-06C durable activity state");
    if (state.schemaVersion !== activityStateVersion || !Array.isArray(state.records))
      throw new DurableQueueError("MP-06C durable activity state is malformed.");
    return state.records.map((record) => clone(record));
  }
}
