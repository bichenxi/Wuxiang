import { useEffect, useMemo, useState } from "react";
import type { Surface } from "@wuxiang/protocol";
import { SurfaceRuntime } from "@wuxiang/runtime";
import { SurfaceRenderer, type RendererEvent } from "@wuxiang/react";

type Preferences = { destination: string; style: string; days: string };
const demoPrefs: Preferences = { destination: "杭州", style: "慢旅行", days: "4" };

const formSurface = (revision = 0, values: Preferences = demoPrefs): Surface => ({ version: "0.1", surfaceId: "travel-demo", revision, actions: [{ id: "submit", label: "生成演示方案" }], nodes: [{ type: "card", id: "preference-card", title: "先说说你的偏好", description: "无相会根据这几个输入，生成一份本地演示界面。", children: [{ type: "form", id: "preference-form", submitActionId: "submit", children: [{ type: "stack", id: "preference-fields", gap: "md", children: [{ type: "input", id: "destination", field: "destination", label: "想去哪里", value: values.destination, placeholder: "例如：杭州", required: true }, { type: "select", id: "style", field: "style", label: "旅行节奏", value: values.style, required: true, options: [{ value: "慢旅行", label: "慢旅行 · 留点空白" }, { value: "城市漫游", label: "城市漫游 · 走走看看" }, { value: "自然探索", label: "自然探索 · 多一点户外" }] }, { type: "input", id: "days", field: "days", label: "计划几天", value: values.days, placeholder: "例如：4", required: true }] }, { type: "button", id: "submit-button", label: "生成演示方案", actionId: "submit", variant: "primary" }] }] }] });

const resultSurface = (revision: number, prefs: Preferences): Surface => { const days = Number(prefs.days); const rows = Array.from({ length: days }, (_, index) => ({ day: `第 ${index + 1} 天`, plan: index === 0 ? `${prefs.destination}城市漫步` : index === days - 1 ? "收尾与返程" : "在地街区与一顿慢饭", note: index === 0 ? "留给你调整" : index === days - 1 ? "演示数据" : "不接实时信息" })); return { version: "0.1", surfaceId: "travel-demo", revision, actions: [{ id: "modify", label: "修改偏好" }], nodes: [{ type: "card", id: "result-card", title: `${prefs.destination} · ${prefs.style}`, description: `根据 ${prefs.days} 天偏好生成的演示结果`, children: [{ type: "progress", id: "progress", value: 100, label: "界面已生成" }, { type: "table", id: "itinerary", columns: [{ key: "day", label: "天数" }, { key: "plan", label: "安排" }, { key: "note", label: "留白" }], rows }, { type: "stack", id: "result-actions", direction: "row", gap: "sm", children: [{ type: "button", id: "modify-button", label: "修改偏好", actionId: "modify", variant: "secondary" }] }] }] }; };

export function App() {
  const runtime = useMemo(() => new SurfaceRuntime(formSurface()), []);
  const [surface, setSurface] = useState(runtime.getSnapshot());
  const [events, setEvents] = useState(runtime.getEvents());
  const [lastPrefs, setLastPrefs] = useState(demoPrefs);
  const [showHistory, setShowHistory] = useState(false);
  const [replayIndex, setReplayIndex] = useState(-1);
  const [error, setError] = useState("");
  useEffect(() => runtime.subscribe((next, event) => { setSurface(next); if (event) setEvents(runtime.getEvents()); }), [runtime]);

  const handleEvent = (event: RendererEvent) => {
    try {
      if (event.actionId === "submit") { const incoming = event.payload && typeof event.payload === "object" ? event.payload as Record<string, unknown> : {}; const rawDays = typeof incoming.days === "string" ? incoming.days : demoPrefs.days; if (!/^[1-7]$/.test(rawDays)) { setError("演示支持 1–7 天，请输入整数天数。"); return; } }
      const emitted = runtime.dispatch({ surfaceId: surface.surfaceId, revision: surface.revision, actionId: event.actionId, payload: event.payload });
      const payload = emitted.payload && typeof emitted.payload === "object" ? emitted.payload as Record<string, unknown> : {};
      if (emitted.actionId === "submit") {
        const rawDays = typeof payload.days === "string" ? payload.days : demoPrefs.days;
        const prefs: Preferences = { destination: typeof payload.destination === "string" ? payload.destination : demoPrefs.destination, style: typeof payload.style === "string" ? payload.style : demoPrefs.style, days: rawDays };
        setLastPrefs(prefs); runtime.replace(resultSurface(surface.revision + 1, prefs));
      } else if (emitted.actionId === "modify") runtime.replace(formSurface(surface.revision + 1, lastPrefs));
      setError("");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "事件未被接受"); }
  };

  const reset = () => { runtime.replace(formSurface(surface.revision + 1)); setLastPrefs(demoPrefs); setError(""); };
  const snapshots = runtime.replay();
  return <div className="playground"><header className="topbar"><a className="brand" href="/" aria-label="无相首页"><span className="brand-mark">无</span><span><strong>无相</strong><small>Agent Interface Runtime</small></span></a><div className="topbar-actions"><span className="version">foundation · 0.1</span><button className="history-button" type="button" onClick={() => setShowHistory((show) => !show)}>{showHistory ? "收起事件" : "查看事件"}</button></div></header><main className="workspace"><section className="intro"><div><p className="eyebrow">固定 Shell · 动态 Surface</p><h1>把对话变成<br /><em>可操作的界面</em></h1><p className="intro-copy">无相让 Agent 用声明式协议描述界面。输入你的偏好，看看一个 surface 如何被安全地替换。</p></div><div className="status"><span className="status-dot" />本地 mock agent<br /><small>不会调用外部服务</small></div></section><div className="demo-notice"><span>演示数据</span><p>这是一个本地闭环示例，不提供实时景点、酒店信息，也不会发起付款。</p></div><div className="content-grid"><section className="surface-panel"><div className="surface-heading"><span>当前 Surface</span><span className="revision">revision {surface.revision}</span></div><SurfaceRenderer surface={surface} onEvent={handleEvent} />{error ? <p className="runtime-error" role="alert">{error}</p> : null}</section><aside className="side-panel"><div><p className="side-label">运行时</p><h2>每次只展示<br />一个当前状态</h2><p>事件回到 Agent，新的状态原子替换当前 surface。runtime 会拒绝过期 revision 和未声明 action。</p></div><button type="button" className="reset-button" onClick={reset}>重新开始</button></aside></div>{showHistory ? <section className="history"><div className="surface-heading"><span>事件历史</span><span className="revision">仅本地回放</span></div>{events.length === 0 ? <p>还没有事件。</p> : <ol>{events.map((event) => <li key={event.eventId}><code>{event.actionId}</code><span>revision {event.revision}</span><small>{event.eventId}</small></li>)}</ol>}<div className="replay-row"><span>只读快照</span>{snapshots.map((snapshot, index) => <button type="button" className={replayIndex === index ? "selected" : ""} key={`${snapshot.revision}-${index}`} onClick={() => setReplayIndex(index)}>revision {snapshot.revision}</button>)}</div>{replayIndex >= 0 && snapshots[replayIndex] ? <div className="replay-preview"><SurfaceRenderer surface={snapshots[replayIndex]} readOnly onEvent={() => undefined} /></div> : null}</section> : null}</main><footer><span>无相 Wuxiang</span><span>声明式 UI · 安全边界 · 可回放</span></footer></div>;
}
