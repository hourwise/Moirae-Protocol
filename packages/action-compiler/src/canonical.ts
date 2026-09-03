import { createHash } from "node:crypto";

import type { ActionIntentCoreV1, ActionIntentV1 } from "../../action-contracts/src/index.js";

/**
 * Moirae Protocol canonicalization v1.
 *
 * Values are restricted to JSON data. Object keys are sorted by JavaScript
 * code-unit order, arrays retain their semantic order, strings use JSON
 * escaping, finite numbers use JSON's representation, and no whitespace is
 * emitted. The resulting string is encoded as UTF-8 before hashing.
 */
export function canonicalizeJsonV1(value: unknown): string {
  return serialize(value, "$", new WeakSet<object>());
}

function invalidValue(path: string, detail: string): never {
  throw new TypeError(`Canonical JSON only supports strict JSON data: ${detail} at ${path}`);
}

function serialize(value: unknown, path: string, seen: WeakSet<object>): string {
  if (value === null) {
    return "null";
  }

  switch (typeof value) {
    case "string":
      return JSON.stringify(value);
    case "boolean":
      return value ? "true" : "false";
    case "number":
      if (!Number.isFinite(value) || Object.is(value, -0)) {
        invalidValue(path, "numbers must be finite and cannot be negative zero");
      }
      return JSON.stringify(value);
    case "undefined":
    case "bigint":
    case "function":
    case "symbol":
      return invalidValue(path, `unsupported ${typeof value} value`);
    case "object":
      return Array.isArray(value)
        ? serializeArray(value, path, seen)
        : serializeObject(value, path, seen);
    default:
      return invalidValue(path, "unsupported value");
  }
}

function serializeArray(value: unknown[], path: string, seen: WeakSet<object>): string {
  if (seen.has(value)) {
    invalidValue(path, "cyclic or shared object references are not supported");
  }
  seen.add(value);

  if (Object.getOwnPropertySymbols(value).length > 0) {
    invalidValue(path, "symbol properties are not supported");
  }

  for (const key of Object.getOwnPropertyNames(value)) {
    if (key === "length") {
      continue;
    }

    const index = Number(key);
    if (!Number.isInteger(index) || index < 0 || index >= value.length || String(index) !== key) {
      invalidValue(path, "arrays cannot have custom properties");
    }
  }

  const items: string[] = [];
  for (let index = 0; index < value.length; index += 1) {
    if (!Object.hasOwn(value, index)) {
      invalidValue(`${path}[${index}]`, "sparse arrays are not supported");
    }

    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (!descriptor || !("value" in descriptor)) {
      invalidValue(`${path}[${index}]`, "accessor properties are not supported");
    }

    items.push(serialize(descriptor.value, `${path}[${index}]`, seen));
  }

  return `[${items.join(",")}]`;
}

function serializeObject(value: object, path: string, seen: WeakSet<object>): string {
  if (seen.has(value)) {
    invalidValue(path, "cyclic or shared object references are not supported");
  }
  seen.add(value);

  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    invalidValue(path, "only plain objects are supported");
  }
  if (Object.getOwnPropertySymbols(value).length > 0) {
    invalidValue(path, "symbol properties are not supported");
  }

  const keys = Object.keys(value).sort();
  if (Object.getOwnPropertyNames(value).length !== keys.length) {
    invalidValue(path, "non-enumerable properties are not supported");
  }

  const properties = keys.map((key) => {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !("value" in descriptor)) {
      invalidValue(`${path}.${key}`, "accessor properties are not supported");
    }

    return `${JSON.stringify(key)}:${serialize(descriptor.value, `${path}.${key}`, seen)}`;
  });

  return `{${properties.join(",")}}`;
}

export function canonicalUtf8(value: unknown): Uint8Array {
  return new TextEncoder().encode(canonicalizeJsonV1(value));
}

function sha256DomainSeparated(domain: string, value: unknown): string {
  const domainBytes = new TextEncoder().encode(`${domain}\0`);
  const payloadBytes = canonicalUtf8(value);
  const input = new Uint8Array(domainBytes.length + payloadBytes.length);

  input.set(domainBytes);
  input.set(payloadBytes, domainBytes.length);

  return createHash("sha256").update(input).digest("hex");
}

export function canonicalActionIntentCore(core: ActionIntentCoreV1): string {
  return canonicalizeJsonV1(core);
}

export function actionIntentDigest(core: ActionIntentCoreV1): string {
  return sha256DomainSeparated("moirae-protocol/action-intent/v1", core);
}

export function actionIntentIdempotencyKey(
  sourceRequestId: string,
  canonicalDigest: string,
): string {
  return sha256DomainSeparated("moirae-protocol/idempotency/v1", {
    canonicalDigest,
    sourceRequestId,
  });
}

export function actionIntentCoreFromIntent(intent: ActionIntentV1): ActionIntentCoreV1 {
  const core: Record<string, unknown> = { ...intent };
  delete core.canonicalDigest;
  delete core.idempotencyKey;

  return core as ActionIntentCoreV1;
}
