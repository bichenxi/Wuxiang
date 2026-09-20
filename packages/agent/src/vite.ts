import type { Plugin } from "vite";
import { createAgentHttpHandler } from "./http.js";
import { createAgentService } from "./service.js";

export type AgentDevPluginOptions = {
  apiKey?: string;
  model?: string;
  timeoutMs?: number;
};

export function agentDevPlugin(options: AgentDevPluginOptions = {}): Plugin {
  const handler = createAgentHttpHandler(createAgentService(options));

  return {
    name: "wuxiang-agent-dev-api",
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        let pathname: string;
        try {
          pathname = new URL(request.url ?? "/", "http://localhost").pathname;
        } catch {
          next();
          return;
        }
        if (pathname !== "/api/agent/status" && pathname !== "/api/agent/generate") {
          next();
          return;
        }

        const callerController = new AbortController();
        request.on("aborted", () => callerController.abort());
        response.on("close", () => {
          if (!response.writableEnded) callerController.abort();
        });

        const headers = new Headers();
        for (const [key, value] of Object.entries(request.headers)) {
          if (Array.isArray(value)) headers.set(key, value.join(", "));
          else if (value !== undefined) headers.set(key, value);
        }
        const method = request.method ?? "GET";
        const requestUrl = new URL(request.url ?? "/", `http://${headers.get("host") ?? "localhost"}`);
        const init: RequestInit & { duplex?: "half" } = {
          method,
          headers,
          signal: callerController.signal
        };
        if (method !== "GET" && method !== "HEAD") {
          init.body = request as unknown as BodyInit;
          init.duplex = "half";
        }

        void handler(new Request(requestUrl, init)).then(async (result) => {
          if (response.destroyed || response.writableEnded) return;
          response.statusCode = result.status;
          result.headers.forEach((value, key) => response.setHeader(key, value));
          const body = await result.arrayBuffer();
          if (!response.destroyed && !response.writableEnded) response.end(Buffer.from(body));
        }).catch(() => {
          if (response.destroyed || response.writableEnded) return;
          response.statusCode = 500;
          response.setHeader("Content-Type", "application/json; charset=utf-8");
          response.setHeader("Cache-Control", "no-store");
          response.end(JSON.stringify({ error: "The agent request could not be completed." }));
        });
      });
    }
  };
}
