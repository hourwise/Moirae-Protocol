import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { MP07_DASHBOARD_DOCUMENT } from "../../web/src/index.js";
import {
  MP07_MAX_DECISION_BODY_BYTES,
  Mp07LocalHostTransport,
  type Mp07LocalTransportResult,
  type Mp07TransportErrorV1,
} from "./transport.js";

const LOCAL_CSP =
  "default-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'";

function responseHeaders(contentType: string): Record<string, string> {
  return {
    "cache-control": "no-store",
    "content-type": contentType,
    "content-security-policy": LOCAL_CSP,
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY",
  };
}

function writeJson(
  response: ServerResponse,
  statusCode: number,
  body: Mp07LocalTransportResult["body"] | Mp07TransportErrorV1,
): void {
  const encoded = JSON.stringify(body);
  response.writeHead(statusCode, responseHeaders("application/json; charset=utf-8"));
  response.end(encoded);
}

function writeError(response: ServerResponse, statusCode: number, message: string): void {
  writeJson(response, statusCode, {
    schemaVersion: "mp07-transport-error-v1",
    code: "STATE_READ_FAILURE",
    message,
  });
}

function requestPath(request: IncomingMessage): string {
  return new URL(request.url ?? "/", "http://127.0.0.1").pathname;
}

async function readBoundedJson(request: IncomingMessage): Promise<unknown> {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.byteLength;
    if (size > MP07_MAX_DECISION_BODY_BYTES) throw new Error("REQUEST_TOO_LARGE");
    chunks.push(buffer);
  }
  if (size === 0) throw new Error("INVALID_JSON");
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
}

async function handleRequest(
  request: IncomingMessage,
  response: ServerResponse,
  transport: Mp07LocalHostTransport,
): Promise<void> {
  const path = requestPath(request);
  const method = request.method ?? "GET";

  if (method === "GET" && (path === "/" || path === "/index.html")) {
    response.writeHead(200, responseHeaders("text/html; charset=utf-8"));
    response.end(MP07_DASHBOARD_DOCUMENT);
    return;
  }

  if (method === "GET" && path === "/mp07/state") {
    try {
      const state = await transport.readState();
      response.writeHead(200, responseHeaders("application/json; charset=utf-8"));
      response.end(JSON.stringify(state));
    } catch {
      writeError(response, 503, "Current product state is unavailable.");
    }
    return;
  }

  if (method === "POST" && path === "/mp07/decision") {
    if (request.headers["content-type"] !== "application/json") {
      writeJson(response, 415, {
        schemaVersion: "mp07-transport-error-v1",
        code: "UNSUPPORTED_CONTENT_TYPE",
        message: "Decision submissions require application/json.",
      });
      return;
    }
    try {
      const result = await transport.submitDecision(await readBoundedJson(request));
      writeJson(response, result.statusCode, result.body);
    } catch (error) {
      const message =
        error instanceof Error && error.message === "REQUEST_TOO_LARGE"
          ? "The decision request exceeds the local bounded size."
          : "The decision request is not valid JSON.";
      writeJson(response, 400, {
        schemaVersion: "mp07-transport-error-v1",
        code:
          error instanceof Error && error.message === "REQUEST_TOO_LARGE"
            ? "REQUEST_TOO_LARGE"
            : "INVALID_DECISION_ENVELOPE",
        message,
      });
    }
    return;
  }

  if (method !== "GET" && method !== "POST") {
    response.writeHead(405, {
      ...responseHeaders("application/json; charset=utf-8"),
      allow: "GET, POST",
    });
    response.end(JSON.stringify({ error: "METHOD_NOT_ALLOWED" }));
    return;
  }

  writeError(response, 404, "The local MP-07 route was not found.");
}

export function createMp07LocalServer(transport: Mp07LocalHostTransport): Server {
  return createServer((request, response) => {
    void handleRequest(request, response, transport).catch(() => {
      if (!response.headersSent)
        writeError(response, 500, "The local host boundary failed closed.");
      else response.destroy();
    });
  });
}

export function listenMp07LocalServer(
  server: Server,
  port = 0,
): Promise<{
  readonly host: "127.0.0.1";
  readonly port: number;
  readonly close: () => Promise<void>;
}> {
  return new Promise((resolve, reject) => {
    const onError = (error: Error): void => {
      server.off("listening", onListening);
      reject(error);
    };
    const onListening = (): void => {
      server.off("error", onError);
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("The local server did not expose a TCP address."));
        return;
      }
      resolve({
        host: "127.0.0.1",
        port: address.port,
        close: () =>
          new Promise<void>((closeResolve, closeReject) => {
            server.close((error) => (error ? closeReject(error) : closeResolve()));
          }),
      });
    };
    server.once("error", onError);
    server.once("listening", onListening);
    server.listen(port, "127.0.0.1");
  });
}
