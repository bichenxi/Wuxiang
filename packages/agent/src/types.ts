import type { Surface, SurfaceEvent } from "@wuxiang/protocol";

export type AgentMode = "ui" | "text";
export type AgentOutcome = "success" | "repaired" | "fallback";
export type AgentFallbackReason = "not_configured" | "timeout" | "provider_error" | "invalid_output" | "refusal";

export type AgentDiagnostics = {
  attempts: number;
  durationMs: number;
  outcome: AgentOutcome;
  reason?: AgentFallbackReason;
  inputTokens?: number;
  outputTokens?: number;
};

export type AgentStatus = {
  configured: boolean;
  provider: "openai";
  model: string | null;
};

export type AgentGenerateRequest = {
  requestId: string;
  prompt: string;
  surfaceId: string;
  revision: number;
  currentSurface?: Surface;
  event?: SurfaceEvent;
};

export type AgentGenerateResponse = {
  requestId: string;
  mode: AgentMode;
  text: string;
  surface?: Surface;
  diagnostics: AgentDiagnostics;
};

export type AgentServiceOptions = {
  apiKey?: string;
  model?: string;
  timeoutMs?: number;
  fetch?: typeof globalThis.fetch;
  now?: () => number;
  maxConcurrentRequests?: number;
};
