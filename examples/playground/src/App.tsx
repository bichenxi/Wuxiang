import { useEffect, useMemo, useRef, useState } from "react";
import { parseSurface, type Surface, type SurfaceEvent } from "@wuxiang/protocol";
import { SurfaceRuntime } from "@wuxiang/runtime";
import { SurfaceRenderer, type RendererEvent } from "@wuxiang/react";

type Preferences = { destination: string; style: string; days: string };
type Mode = "local" | "ai";
type Diagnostics = {
  attempts: number;
  durationMs: number;
  outcome: "success" | "repaired" | "fallback";
  reason?: "not_configured" | "timeout" | "provider_error" | "invalid_output" | "refusal";
  inputTokens?: number;
  outputTokens?: number;
};
type AgentStatus = { configured: boolean; provider: "openai"; model: string | null };
type RequestState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "cancelled"; message: string }
  | { status: "error"; message: string }
  | { status: "result"; text: string; diagnostics: Diagnostics; mode: "ui" | "text" };

const demoPrefs: Preferences = { destination: "杭州", style: "慢旅行", days: "4" };
const maxPromptLength = 4_000;
const starterPrompts = [
  { label: "规划旅行", prompt: "帮我规划一次杭州慢旅行，安排 4 天，留出自由活动时间。" },
  { label: "比较选择", prompt: "帮我比较杭州和苏州的周末旅行，列出适合人群和取舍。" },
  { label: "直接回答", prompt: "用清楚、简短的方式解释什么是声明式界面。" },
];

const formSurface = (revision = 0, values: Preferences = demoPrefs): Surface => ({
  version: "0.1",
  surfaceId: "travel-demo",
  revision,
  actions: [{ id: "submit", label: "生成演示方案" }],
  nodes: [{
    type: "card",
    id: "preference-card",
    title: "先说说你的偏好",
    description: "无相会根据这几个输入，生成一份本地演示界面。",
    children: [{
      type: "form",
      id: "preference-form",
      submitActionId: "submit",
      children: [{
        type: "stack",
        id: "preference-fields",
        gap: "md",
        children: [
          { type: "input", id: "destination", field: "destination", label: "想去哪里", value: values.destination, placeholder: "例如：杭州", required: true },
          { type: "select", id: "style", field: "style", label: "旅行节奏", value: values.style, required: true, options: [
            { value: "慢旅行", label: "慢旅行 · 留点空白" },
            { value: "城市漫游", label: "城市漫游 · 走走看看" },
            { value: "自然探索", label: "自然探索 · 多一点户外" },
          ] },
          { type: "input", id: "days", field: "days", label: "计划几天", value: values.days, placeholder: "例如：4", required: true },
        ],
      }, { type: "button", id: "submit-button", label: "生成演示方案", actionId: "submit", variant: "primary" }],
    }],
  }],
});

const resultSurface = (revision: number, prefs: Preferences): Surface => {
  const days = Number(prefs.days);
  const rows = Array.from({ length: days }, (_, index) => ({
    day: `第 ${index + 1} 天`,
    plan: index === 0 ? `${prefs.destination}城市漫步` : index === days - 1 ? "收尾与返程" : "在地街区与一顿慢饭",
    note: index === 0 ? "留给你调整" : index === days - 1 ? "演示数据" : "不接实时信息",
  }));
  return {
    version: "0.1",
    surfaceId: "travel-demo",
    revision,
    actions: [{ id: "modify", label: "修改偏好" }],
    nodes: [{
      type: "card",
      id: "result-card",
      title: `${prefs.destination} · ${prefs.style}`,
      description: `根据 ${prefs.days} 天偏好生成的演示结果`,
      children: [
        { type: "progress", id: "progress", value: 100, label: "界面已生成" },
        { type: "table", id: "itinerary", columns: [
          { key: "day", label: "天数" },
          { key: "plan", label: "安排" },
          { key: "note", label: "留白" },
        ], rows },
        { type: "stack", id: "result-actions", direction: "row", gap: "sm", children: [
          { type: "button", id: "modify-button", label: "修改偏好", actionId: "modify", variant: "secondary" },
        ] },
      ],
    }],
  };
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function makeId(prefix: string, sequence: number): string {
  const random = globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${sequence}-${random}`;
}

function parseAgentStatus(value: unknown): AgentStatus | null {
  if (!isRecord(value) || typeof value.configured !== "boolean" || value.provider !== "openai") return null;
  if (value.model !== null && typeof value.model !== "string") return null;
  return { configured: value.configured, provider: "openai", model: value.model };
}

function parseDiagnostics(value: unknown): Diagnostics | null {
  if (!isRecord(value)) return null;
  if (!Number.isSafeInteger(value.attempts) || (value.attempts as number) < 0) return null;
  if (typeof value.durationMs !== "number" || !Number.isFinite(value.durationMs) || value.durationMs < 0) return null;
  if (value.outcome !== "success" && value.outcome !== "repaired" && value.outcome !== "fallback") return null;
  const reasons = ["not_configured", "timeout", "provider_error", "invalid_output", "refusal"] as const;
  if (value.reason !== undefined && !reasons.includes(value.reason as typeof reasons[number])) return null;
  if (value.inputTokens !== undefined && (!Number.isSafeInteger(value.inputTokens) || (value.inputTokens as number) < 0)) return null;
  if (value.outputTokens !== undefined && (!Number.isSafeInteger(value.outputTokens) || (value.outputTokens as number) < 0)) return null;
  return {
    attempts: value.attempts as number,
    durationMs: value.durationMs,
    outcome: value.outcome,
    ...(value.reason ? { reason: value.reason as Diagnostics["reason"] } : {}),
    ...(value.inputTokens !== undefined ? { inputTokens: value.inputTokens as number } : {}),
    ...(value.outputTokens !== undefined ? { outputTokens: value.outputTokens as number } : {}),
  };
}

function reasonLabel(reason: Diagnostics["reason"]): string | null {
  switch (reason) {
    case "not_configured": return "服务端还没有配置 AI 密钥";
    case "timeout": return "服务响应超时";
    case "provider_error": return "AI 服务暂时不可用";
    case "invalid_output": return "AI 返回内容无法使用";
    case "refusal": return "AI 没有生成这个请求的界面";
    default: return null;
  }
}

function diagnosticsOutcome(outcome: Diagnostics["outcome"]): string {
  if (outcome === "success") return "成功";
  if (outcome === "repaired") return "修复后使用";
  return "文本回退";
}

function createRuntime(surface: Surface): SurfaceRuntime {
  return new SurfaceRuntime(surface);
}

export function App() {
  const initialRuntime = useMemo(() => createRuntime(formSurface()), []);
  const [runtime, setRuntime] = useState(initialRuntime);
  const runtimeRef = useRef(runtime);
  const localRuntimeRef = useRef(initialRuntime);
  const aiRuntimeRef = useRef<SurfaceRuntime | null>(null);
  const [surface, setSurface] = useState(runtime.getSnapshot());
  const [events, setEvents] = useState<ReadonlyArray<SurfaceEvent>>([]);
  const [lastPrefs, setLastPrefs] = useState(demoPrefs);
  const [mode, setMode] = useState<Mode>("local");
  const [showHistory, setShowHistory] = useState(false);
  const [replayIndex, setReplayIndex] = useState(-1);
  const [interactionError, setInteractionError] = useState("");
  const [prompt, setPrompt] = useState("");
  const [agentStatus, setAgentStatus] = useState<{ loading: boolean; value: AgentStatus | null; error: boolean }>({ loading: true, value: null, error: false });
  const [requestState, setRequestState] = useState<RequestState>({ status: "idle" });
  const pendingAiEventRef = useRef<SurfaceEvent | null>(null);
  const requestGenerationRef = useRef(0);
  const requestSequenceRef = useRef(0);
  const requestControllerRef = useRef<AbortController | null>(null);
  runtimeRef.current = runtime;

  useEffect(() => runtime.subscribe((next, event) => {
    setSurface(next);
    if (event) setEvents(runtime.getEvents());
  }), [runtime]);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    void fetch("/api/agent/status", { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("status unavailable");
        return response.json() as Promise<unknown>;
      })
      .then((body) => {
        if (!active) return;
        const parsed = parseAgentStatus(body);
        setAgentStatus({ loading: false, value: parsed, error: parsed === null });
      })
      .catch(() => {
        if (active && !controller.signal.aborted) setAgentStatus({ loading: false, value: null, error: true });
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, []);

  useEffect(() => () => {
    requestGenerationRef.current += 1;
    requestControllerRef.current?.abort();
    requestControllerRef.current = null;
  }, []);

  const activeSnapshots = runtime.replay();

  const cancelOutstandingRequest = (message: string) => {
    requestGenerationRef.current += 1;
    requestControllerRef.current?.abort();
    requestControllerRef.current = null;
    setRequestState({ status: "cancelled", message });
  };

  const switchMode = (nextMode: Mode) => {
    if (nextMode === mode) return;
    if (requestState.status === "loading") cancelOutstandingRequest("请求已取消，当前界面保持不变。");
    if (nextMode === "local") {
      setRuntime(localRuntimeRef.current);
    } else if (aiRuntimeRef.current) {
      setRuntime(aiRuntimeRef.current);
    }
    setMode(nextMode);
    setInteractionError("");
    setReplayIndex(-1);
  };

  const handleEvent = (event: RendererEvent) => {
    const activeRuntime = runtimeRef.current;
    try {
      const activeSurface = activeRuntime.getSnapshot();
      if (mode === "local" && event.actionId === "submit") {
        const incoming = event.payload && typeof event.payload === "object" ? event.payload as Record<string, unknown> : {};
        const rawDays = typeof incoming.days === "string" ? incoming.days : demoPrefs.days;
        if (!/^[1-7]$/.test(rawDays)) {
          setInteractionError("演示支持 1–7 天，请输入整数天数。");
          return;
        }
      }
      const emitted = activeRuntime.dispatch({
        surfaceId: activeSurface.surfaceId,
        revision: activeSurface.revision,
        actionId: event.actionId,
        payload: event.payload,
      });
      setEvents(activeRuntime.getEvents());

      if (mode === "ai") {
        pendingAiEventRef.current = emitted;
      } else if (emitted.actionId === "submit") {
        const payload = emitted.payload && typeof emitted.payload === "object" ? emitted.payload as Record<string, unknown> : {};
        const rawDays = typeof payload.days === "string" ? payload.days : demoPrefs.days;
        const prefs: Preferences = {
          destination: typeof payload.destination === "string" ? payload.destination : demoPrefs.destination,
          style: typeof payload.style === "string" ? payload.style : demoPrefs.style,
          days: rawDays,
        };
        setLastPrefs(prefs);
        activeRuntime.replace(resultSurface(activeSurface.revision + 1, prefs));
      } else if (emitted.actionId === "modify") {
        activeRuntime.replace(formSurface(activeSurface.revision + 1, lastPrefs));
      }
      setInteractionError("");
    } catch {
      setInteractionError("这个操作没有被当前界面接受，请重试。");
    }
  };

  const submitPrompt = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const task = prompt.trim();
    if (!task || requestState.status === "loading") return;

    const activeAiRuntime = aiRuntimeRef.current;
    const currentSurface = activeAiRuntime?.getSnapshot();
    const sequence = ++requestSequenceRef.current;
    const requestId = makeId("request", sequence);
    const surfaceId = currentSurface?.surfaceId ?? makeId("surface", sequence);
    const revision = currentSurface ? currentSurface.revision + 1 : 0;
    const eventForRequest = currentSurface ? pendingAiEventRef.current ?? undefined : undefined;
    const body = {
      requestId,
      prompt: task,
      surfaceId,
      revision,
      ...(currentSurface ? { currentSurface } : {}),
      ...(eventForRequest ? { event: eventForRequest } : {}),
    };

    requestControllerRef.current?.abort();
    const controller = new AbortController();
    requestControllerRef.current = controller;
    const generation = ++requestGenerationRef.current;
    const isCurrent = () => requestGenerationRef.current === generation && !controller.signal.aborted;
    setRequestState({ status: "loading" });
    setInteractionError("");

    try {
      const response = await fetch("/api/agent/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (!response.ok) {
        if (!isCurrent()) return;
        const message = response.status === 400
          ? "请求未被接受，请检查描述后重试。"
          : "暂时无法连接 AI 服务，请稍后重试。";
        setRequestState({ status: "error", message });
        return;
      }
      const result: unknown = await response.json();
      if (!isCurrent()) return;
      if (!isRecord(result) || result.requestId !== requestId || (result.mode !== "ui" && result.mode !== "text") || typeof result.text !== "string") {
        setRequestState({ status: "error", message: "AI 返回内容无法读取，请调整描述后重试。" });
        return;
      }
      const diagnostics = parseDiagnostics(result.diagnostics);
      if (!diagnostics) {
        setRequestState({ status: "error", message: "AI 返回内容无法读取，请调整描述后重试。" });
        return;
      }

      if (result.mode === "ui") {
        let generated: Surface;
        try {
          generated = parseSurface(result.surface);
        } catch {
          setRequestState({ status: "error", message: "AI 返回的界面无法校验，请调整描述后重试。" });
          return;
        }
        if (generated.surfaceId !== surfaceId || generated.revision !== revision) {
          setRequestState({ status: "error", message: "AI 返回的界面版本与当前请求不匹配。" });
          return;
        }
        if (currentSurface && aiRuntimeRef.current) {
          const updated = aiRuntimeRef.current.replace(generated);
          setSurface(updated);
          setEvents(aiRuntimeRef.current.getEvents());
        } else {
          const nextRuntime = createRuntime(generated);
          aiRuntimeRef.current = nextRuntime;
          setRuntime(nextRuntime);
          setSurface(nextRuntime.getSnapshot());
          setEvents(nextRuntime.getEvents());
        }
        pendingAiEventRef.current = null;
      }
      setRequestState({ status: "result", text: result.text, diagnostics, mode: result.mode });
    } catch {
      if (isCurrent()) setRequestState({ status: "error", message: "暂时无法连接 AI 服务，请稍后重试。" });
    } finally {
      if (requestGenerationRef.current === generation) {
        requestControllerRef.current = null;
      }
    }
  };

  const cancelPrompt = () => cancelOutstandingRequest("已取消；当前界面保持不变。");

  const reset = () => {
    if (requestState.status === "loading") cancelOutstandingRequest("请求已取消；已恢复本地演示。");
    else {
      requestGenerationRef.current += 1;
      requestControllerRef.current?.abort();
      requestControllerRef.current = null;
    }
    const freshLocalRuntime = createRuntime(formSurface());
    localRuntimeRef.current = freshLocalRuntime;
    aiRuntimeRef.current = null;
    pendingAiEventRef.current = null;
    runtimeRef.current = freshLocalRuntime;
    setRuntime(freshLocalRuntime);
    setSurface(freshLocalRuntime.getSnapshot());
    setEvents([]);
    setMode("local");
    setLastPrefs(demoPrefs);
    setInteractionError("");
    setReplayIndex(-1);
  };

  const isBusy = requestState.status === "loading";
  const isAiSurfaceUnavailable = mode === "ai" && !aiRuntimeRef.current;
  const isReadOnly = isBusy || isAiSurfaceUnavailable;
  const diagnostics = requestState.status === "result" ? requestState.diagnostics : null;
  const snapshots = activeSnapshots;

  return <div className="playground">
    <header className="topbar">
      <a className="brand" href="/" aria-label="无相首页">
        <span className="brand-mark">无</span>
        <span><strong>无相</strong><small>Agent Interface Runtime</small></span>
      </a>
      <div className="topbar-actions">
        <span className="version">foundation · 0.1</span>
        <button className="history-button" type="button" onClick={() => setShowHistory((show) => !show)}>
          {showHistory ? "收起事件" : "查看事件"}
        </button>
      </div>
    </header>

    <main className="workspace">
      <section className="intro">
        <div>
          <p className="eyebrow">固定 Shell · 动态 Surface</p>
          <h1>把对话变成<br /><em>可操作的界面</em></h1>
          <p className="intro-copy">无相让 Agent 用声明式协议描述界面。选择本地演示或 AI 生成，看看界面如何随任务变化。</p>
        </div>
        <div className={`status ${agentStatus.value?.configured ? "status-ready" : ""}`}>
          <span className="status-dot" />
          {agentStatus.loading ? "正在检查 AI 配置" : agentStatus.value?.configured ? "AI 已配置" : "本地演示可用"}
          <small>{agentStatus.value?.configured ? `OpenAI${agentStatus.value.model ? ` · ${agentStatus.value.model}` : ""}` : "不会伪装成真实 AI 结果"}</small>
        </div>
      </section>

      <nav className="mode-switch" aria-label="选择运行模式">
        <button type="button" className={mode === "local" ? "selected" : ""} aria-pressed={mode === "local"} onClick={() => switchMode("local")}>本地演示</button>
        <button type="button" className={mode === "ai" ? "selected" : ""} aria-pressed={mode === "ai"} onClick={() => switchMode("ai")}>AI 生成</button>
      </nav>

      {mode === "local" ? <div className="demo-notice">
        <span>本地演示</span>
        <p>这是一个确定性的本地闭环示例，不提供实时景点、酒店信息，也不会发起付款。</p>
      </div> : <section className="ai-composer" aria-label="AI 任务输入">
        <div className="composer-heading">
          <div><p className="side-label">AI 生成</p><h2>描述你要完成的任务</h2></div>
          <span className="prompt-limit">{prompt.length}/{maxPromptLength}</span>
        </div>
        {!agentStatus.loading && (!agentStatus.value?.configured || agentStatus.error) ? <p className="configuration-note" role="status">
          {agentStatus.error
            ? "暂时无法读取服务配置状态。请检查本地服务后重试。"
            : "服务端尚未配置 AI。请在服务端 .env 中设置 OPENAI_API_KEY 和 OPENAI_MODEL；此处提交会明确显示文本回退，不会伪造 AI 界面。"}
        </p> : null}
        <div className="starter-prompts" aria-label="起始任务">
          {starterPrompts.map((starter) => <button key={starter.label} type="button" disabled={isBusy} onClick={() => setPrompt(starter.prompt)}>{starter.label}</button>)}
        </div>
        <form className="prompt-form" onSubmit={submitPrompt}>
          <label className="sr-only" htmlFor="agent-prompt">任务描述</label>
          <textarea
            id="agent-prompt"
            rows={4}
            maxLength={maxPromptLength}
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            placeholder="例如：帮我规划一次 4 天的杭州慢旅行，给我一个可以继续修改的安排。"
          />
          <div className="composer-actions">
            <span>最多 4,000 字符 · 提交后会发送给本地服务</span>
            {isBusy
              ? <button className="primary-action cancel-action" type="button" onClick={cancelPrompt}>取消请求</button>
              : <button className="primary-action" type="submit" disabled={!prompt.trim()}>发送任务</button>}
          </div>
        </form>
        {isBusy ? <p className="request-message" role="status"><span className="loading-mark" />正在生成，当前界面仍可查看。</p> : null}
        {requestState.status === "cancelled" ? <p className="request-message cancelled-message" role="status">{requestState.message}</p> : null}
        {requestState.status === "error" ? <p className="request-message error-message" role="alert">{requestState.message}</p> : null}
        {requestState.status === "result" ? <div className="agent-result" aria-live="polite">
          <div className="result-heading"><strong>{requestState.mode === "ui" ? "界面已更新" : "文字回复"}</strong><span>{requestState.diagnostics.outcome === "fallback" ? "回退结果" : "AI 回复"}</span></div>
          <p>{requestState.text}</p>
          {requestState.diagnostics.reason === "not_configured" ? <p className="configuration-note result-config-note">在服务端 .env 配置 OPENAI_API_KEY 和 OPENAI_MODEL 后，可启用真实 AI 生成。</p> : null}
          <details className="diagnostics">
            <summary>开发诊断</summary>
            <dl>
              <div><dt>结果</dt><dd>{diagnostics ? diagnosticsOutcome(diagnostics.outcome) : "—"}</dd></div>
              <div><dt>尝试次数</dt><dd>{diagnostics?.attempts ?? "—"}</dd></div>
              <div><dt>耗时</dt><dd>{diagnostics ? `${diagnostics.durationMs} ms` : "—"}</dd></div>
              {diagnostics?.reason ? <div><dt>原因</dt><dd>{reasonLabel(diagnostics.reason)}</dd></div> : null}
              {diagnostics?.inputTokens !== undefined ? <div><dt>输入 token</dt><dd>{diagnostics.inputTokens}</dd></div> : null}
              {diagnostics?.outputTokens !== undefined ? <div><dt>输出 token</dt><dd>{diagnostics.outputTokens}</dd></div> : null}
            </dl>
          </details>
        </div> : null}
      </section>}

      <div className="content-grid">
        <section className="surface-panel" aria-label="当前界面">
          <div className="surface-heading"><span>当前 Surface</span><span className="revision">revision {surface.revision}</span></div>
          <SurfaceRenderer surface={surface} onEvent={handleEvent} readOnly={isReadOnly || replayIndex >= 0} />
          {isAiSurfaceUnavailable ? <p className="surface-hint">首次生成前保留本地演示画面。AI 界面成功返回后会在此显示。</p> : null}
          {interactionError ? <p className="runtime-error" role="alert">{interactionError}</p> : null}
        </section>
        <aside className="side-panel">
          <div>
            <p className="side-label">运行时</p>
            <h2>每次只展示<br />一个当前状态</h2>
            <p>{mode === "local"
              ? "本地演示会根据输入确定性地替换界面。事件回到运行时校验，不会调用外部服务。"
              : "AI 可以返回新界面或文字。界面事件会在下一次生成时附上当前状态一起发送。"}</p>
          </div>
          <button type="button" className="reset-button" onClick={reset}>重新开始</button>
        </aside>
      </div>

      {showHistory ? <section className="history">
        <div className="surface-heading"><span>事件历史</span><span className="revision">仅本地只读回放</span></div>
        {events.length === 0 ? <p>还没有事件。</p> : <ol>{events.map((event) => <li key={event.eventId}>
          <code>{event.actionId}</code><span>revision {event.revision}</span><small>{event.eventId}</small>
        </li>)}</ol>}
        <div className="replay-row"><span>只读快照</span>{snapshots.map((snapshot, index) => <button
          type="button"
          className={replayIndex === index ? "selected" : ""}
          key={`${snapshot.surfaceId}-${snapshot.revision}-${index}`}
          onClick={() => setReplayIndex(replayIndex === index ? -1 : index)}
        >revision {snapshot.revision}</button>)}</div>
        {replayIndex >= 0 && snapshots[replayIndex]
          ? <div className="replay-preview"><SurfaceRenderer surface={snapshots[replayIndex]!} readOnly onEvent={() => undefined} /></div>
          : null}
      </section> : null}
    </main>

    <footer><span>无相 Wuxiang</span><span>声明式 UI · 安全边界 · 可回放</span></footer>
  </div>;
}
