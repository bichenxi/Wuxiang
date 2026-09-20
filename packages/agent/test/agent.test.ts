import { describe, expect, it, vi } from "vitest";
import { AgentCallerAbortedError } from "../src/errors.js";
import { createAgentHttpHandler } from "../src/http.js";
import { createAgentService } from "../src/service.js";
import type { AgentGenerateRequest } from "../src/types.js";

const request: AgentGenerateRequest = {
  requestId: "request-1",
  prompt: "Make a greeting card",
  surfaceId: "surface-1",
  revision: 1
};

const surface = {
  version: "0.1",
  surfaceId: "surface-1",
  revision: 1,
  nodes: [{ type: "text", id: "hello", text: "Hello" }],
  actions: []
};

function responseText(text: string, usage = { input_tokens: 12, output_tokens: 8 }): Response {
  return new Response(JSON.stringify({
    status: "completed",
    output: [
      { type: "reasoning", summary: [] },
      { type: "message", content: [{ type: "output_text", text }] }
    ],
    usage
  }), { headers: { "Content-Type": "application/json" } });
}

function makeService(fetch: typeof globalThis.fetch, other: { timeoutMs?: number; now?: () => number } = {}) {
  return createAgentService({ apiKey: "test-secret", model: "test-model", fetch, ...other });
}

describe("AgentService", () => {
  it("returns a validated UI and sends the configured Responses API request", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async (_input, init) => {
      expect(init?.method).toBe("POST");
      expect(new Headers(init?.headers).get("authorization")).toBe("Bearer test-secret");
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      expect(body.model).toBe("test-model");
      expect(body.store).toBe(false);
      expect(body.text).toEqual({ format: { type: "json_object" } });
      expect(body.max_output_tokens).toBe(4_000);
      return responseText(JSON.stringify({ mode: "ui", text: "A greeting", surface }));
    });

    const result = await makeService(fetch).generate(request);
    expect(result).toMatchObject({
      requestId: "request-1",
      mode: "ui",
      text: "A greeting",
      surface,
      diagnostics: { attempts: 1, outcome: "success", inputTokens: 12, outputTokens: 8 }
    });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("returns text mode without requiring a surface", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () => responseText(JSON.stringify({ mode: "text", text: "A short answer" })));
    const result = await makeService(fetch).generate(request);
    expect(result).toMatchObject({ mode: "text", text: "A short answer", diagnostics: { outcome: "success" } });
    expect("surface" in result).toBe(false);
  });

  it("repairs invalid output once using bounded raw output and totals usage across attempts", async () => {
    const invalid = "{ \"mode\": \"ui\", \"surface\": { \"oops\": true } }";
    const inputs: string[] = [];
    const fetch = vi.fn<typeof globalThis.fetch>(async (_input, init) => {
      const body = JSON.parse(String(init?.body)) as { input: string };
      inputs.push(body.input);
      return inputs.length === 1
        ? responseText(invalid, { input_tokens: 7, output_tokens: 3 })
        : responseText(JSON.stringify({ mode: "ui", text: "Fixed", surface }));
    });

    const result = await makeService(fetch).generate(request);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(inputs[1]).toContain(invalid);
    expect(result).toMatchObject({
      mode: "ui",
      diagnostics: { attempts: 2, outcome: "repaired", inputTokens: 19, outputTokens: 11 }
    });
  });

  it("uses a safe text fallback after two invalid outputs without returning model content", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () => responseText("secret provider text"));
    const result = await makeService(fetch).generate(request);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({ mode: "text", diagnostics: { attempts: 2, outcome: "fallback", reason: "invalid_output" } });
    expect(result.text).not.toContain("secret provider text");
  });

  it("validates output metadata and action references before returning UI", async () => {
    const wrongSurface = { ...surface, revision: 2 };
    const fetch = vi.fn<typeof globalThis.fetch>(async () => responseText(JSON.stringify({ mode: "ui", text: "Wrong revision", surface: wrongSurface })));
    const result = await makeService(fetch).generate(request);
    expect(result).toMatchObject({ mode: "text", diagnostics: { attempts: 2, reason: "invalid_output" } });
  });

  it("falls back without calling the provider when configuration is missing", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>();
    const service = createAgentService({ fetch });
    expect(service.status()).toEqual({ configured: false, provider: "openai", model: null });
    const result = await service.generate({ ...request, prompt: "请做一个问候界面" });
    expect(result).toMatchObject({ mode: "text", diagnostics: { attempts: 0, outcome: "fallback", reason: "not_configured" } });
    expect(result.text).toContain("尚未配置");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("handles provider failures without returning provider details", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () => new Response("private secret error", { status: 401 }));
    const result = await makeService(fetch).generate(request);
    expect(result).toMatchObject({ mode: "text", diagnostics: { attempts: 1, reason: "provider_error" } });
    expect(result.text).not.toContain("private secret error");
  });

  it("detects refusals and does not try to repair them", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () => new Response(JSON.stringify({
      status: "completed",
      output: [{ type: "message", content: [{ type: "refusal", refusal: "private refusal detail" }] }],
      usage: { input_tokens: 5, output_tokens: 2 }
    })));
    const result = await makeService(fetch).generate(request);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ diagnostics: { attempts: 1, reason: "refusal", inputTokens: 5, outputTokens: 2 } });
    expect(result.text).not.toContain("private refusal detail");
  });

  it("repairs incomplete provider responses and accepts a later valid response", async () => {
    let calls = 0;
    const fetch = vi.fn<typeof globalThis.fetch>(async () => {
      calls += 1;
      if (calls === 1) return new Response(JSON.stringify({ status: "incomplete", output: [], usage: { input_tokens: 5, output_tokens: 2 } }));
      return responseText(JSON.stringify({ mode: "text", text: "Recovered" }));
    });
    const result = await makeService(fetch).generate(request);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({ text: "Recovered", diagnostics: { outcome: "repaired", inputTokens: 17, outputTokens: 10 } });
  });

  it("enforces the overall deadline even when a fetch implementation ignores abort", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(() => new Promise(() => undefined));
    const result = await makeService(fetch, { timeoutMs: 10 }).generate(request);
    expect(result).toMatchObject({ mode: "text", diagnostics: { attempts: 1, reason: "timeout" } });
  });

  it("stops after caller cancellation while the provider body is stalled", async () => {
    let bodyCancelled = false;
    const fetch = vi.fn<typeof globalThis.fetch>(async () => new Response(new ReadableStream({
      cancel() { bodyCancelled = true; }
    })));
    const controller = new AbortController();
    const pending = makeService(fetch).generate(request, controller.signal);
    await Promise.resolve();
    await Promise.resolve();
    controller.abort();
    await expect(pending).rejects.toBeInstanceOf(AgentCallerAbortedError);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(bodyCancelled).toBe(true);
  });

  it("rejects stale, unallowlisted, and malformed form events before provider calls", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>();
    const currentSurface = {
      version: "0.1",
      surfaceId: "surface-1",
      revision: 0,
      nodes: [{ type: "button", id: "go", label: "Go", actionId: "go" }],
      actions: [{ id: "go" }]
    };
    await expect(makeService(fetch).generate({
      ...request,
      currentSurface,
      revision: 1,
      event: { eventId: "event-1", surfaceId: "surface-1", revision: 2, actionId: "go" }
    })).rejects.toThrow("event");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rejects out-of-bounds prompts", async () => {
    await expect(makeService(vi.fn()).generate({ ...request, prompt: "x".repeat(4_001) })).rejects.toThrow("prompt");
  });
});

describe("Agent HTTP routes", () => {
  function httpRequest(path: string, init: RequestInit = {}): Request {
    const headers = new Headers(init.headers);
    headers.set("host", "127.0.0.1:5173");
    return new Request(`http://127.0.0.1:5173${path}`, { ...init, headers });
  }

  it("serves no-key status and rejects unsafe origins", async () => {
    const handler = createAgentHttpHandler(createAgentService());
    const status = await handler(httpRequest("/api/agent/status"));
    expect(status.status).toBe(200);
    expect(await status.json()).toEqual({ configured: false, provider: "openai", model: null });

    const denied = await handler(httpRequest("/api/agent/status", { headers: { origin: "https://attacker.example" } }));
    expect(denied.status).toBe(403);
  });

  it("enforces route, method, content type, and body-size boundaries", async () => {
    const service = createAgentService();
    const handler = createAgentHttpHandler(service);
    expect((await handler(httpRequest("/elsewhere"))).status).toBe(404);
    expect((await handler(httpRequest("/api/agent/status", { method: "POST" }))).status).toBe(405);
    expect((await handler(httpRequest("/api/agent/generate", { method: "POST", body: "{}" }))).status).toBe(415);

    const tooLarge = await handler(httpRequest("/api/agent/generate", {
      method: "POST",
      headers: { "content-type": "application/json", "content-length": "300001" },
      body: "{}"
    }));
    expect(tooLarge.status).toBe(413);
    expect(tooLarge.headers.get("cache-control")).toBe("no-store");
  });

  it("keeps request validation errors generic and never returns provider secrets", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () => new Response("private server detail", { status: 500 }));
    const handler = createAgentHttpHandler(makeService(fetch));
    const invalid = await handler(httpRequest("/api/agent/generate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...request, extra: "field" })
    }));
    expect(invalid.status).toBe(400);
    expect(await invalid.json()).toEqual({ error: "Invalid request." });

    const result = await handler(httpRequest("/api/agent/generate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(request)
    }));
    expect(result.status).toBe(200);
    expect(await result.text()).not.toContain("private server detail");
  });
});
