import { AgentInputError } from "./errors.js";
import type { AgentService } from "./service.js";
import type { AgentStatus } from "./types.js";

const JSON_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store"
};

function jsonResponse(status: number, value: unknown): Response {
  return new Response(JSON.stringify(value), { status, headers: JSON_HEADERS });
}

function loopbackHost(host: string | null): string | undefined {
  if (!host || host.length > 255 || /[\s/@\\]/.test(host)) return undefined;
  let parsed: URL;
  try {
    parsed = new URL(`http://${host}`);
  } catch {
    return undefined;
  }
  if (parsed.username || parsed.password || parsed.pathname !== "/" || parsed.search || parsed.hash) return undefined;
  if (parsed.hostname !== "localhost" && parsed.hostname !== "127.0.0.1") return undefined;
  return parsed.host.toLowerCase();
}

function isLocalSameOrigin(request: Request): boolean {
  const host = loopbackHost(request.headers.get("host"));
  if (!host) return false;
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    const parsed = new URL(origin);
    return parsed.protocol === "http:" && parsed.origin !== "null" && parsed.host.toLowerCase() === host;
  } catch {
    return false;
  }
}

async function readJson(request: Request): Promise<unknown> {
  if (!request.body) throw new AgentInputError("Missing request body.");
  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let body = "";
  try {
    while (true) {
      if (request.signal.aborted) throw request.signal.reason;
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > 300_000) throw new AgentInputError("Request is too large.");
      body += decoder.decode(value, { stream: true });
    }
    body += decoder.decode();
  } catch (error) {
    if (error instanceof AgentInputError) throw error;
    throw new AgentInputError("Invalid request body.");
  } finally {
    reader.releaseLock();
  }
  try {
    return JSON.parse(body) as unknown;
  } catch {
    throw new AgentInputError("Invalid JSON.");
  }
}

export type AgentRouteHandler = (request: Request) => Promise<Response>;

export function createAgentHttpHandler(service: Pick<AgentService, "status" | "generate">): AgentRouteHandler {
  return async (request) => {
    if (!isLocalSameOrigin(request)) return jsonResponse(403, { error: "Request origin is not allowed." });

    const pathname = new URL(request.url).pathname;
    if (pathname === "/api/agent/status") {
      if (request.method !== "GET") return jsonResponse(405, { error: "Method not allowed." });
      const status: AgentStatus = service.status();
      return jsonResponse(200, status);
    }
    if (pathname !== "/api/agent/generate") return jsonResponse(404, { error: "Not found." });
    if (request.method !== "POST") return jsonResponse(405, { error: "Method not allowed." });

    const contentType = request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
    if (contentType !== "application/json") return jsonResponse(415, { error: "Content-Type must be application/json." });
    const contentLength = request.headers.get("content-length");
    if (contentLength && (!/^\d+$/.test(contentLength) || Number(contentLength) > 300_000)) {
      return jsonResponse(413, { error: "Request is too large." });
    }

    let body: unknown;
    try {
      body = await readJson(request);
      return jsonResponse(200, await service.generate(body, request.signal));
    } catch (error) {
      if (request.signal.aborted) return new Response(null, { status: 499, headers: { "Cache-Control": "no-store" } });
      if (error instanceof AgentInputError) {
        const tooLarge = error.message === "Request is too large.";
        return jsonResponse(tooLarge ? 413 : 400, { error: tooLarge ? "Request is too large." : "Invalid request." });
      }
      return jsonResponse(500, { error: "The agent request could not be completed." });
    }
  };
}
