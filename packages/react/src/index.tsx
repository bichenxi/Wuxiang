import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import type { Surface, SurfaceEvent, SurfaceNode } from "@wuxiang/protocol";
import { parseSurface } from "@wuxiang/protocol";
import "./styles.css";

export type RendererEvent = Omit<SurfaceEvent, "eventId" | "surfaceId" | "revision">;
export type SurfaceRendererProps = { surface: Surface; onEvent: (event: RendererEvent) => void; className?: string; readOnly?: boolean };
export type ComponentRenderer = (node: SurfaceNode, context: RenderContext) => ReactNode;
export type ComponentRegistry = ReadonlyMap<SurfaceNode["type"], ComponentRenderer>;
export type RenderContext = { values: Record<string, string>; setValue: (field: string, value: string) => void; emit: (actionId: string, payload?: unknown) => void; readOnly: boolean; formSubmitActionId?: string };

const actionPayload = (context: RenderContext): Record<string, string> => ({ ...context.values });

export function createDefaultRegistry(): ComponentRegistry {
  const registry = new Map<SurfaceNode["type"], ComponentRenderer>();
  registry.set("text", (node) => { if (node.type !== "text") return null; return <p className={`wx-text wx-text-${node.tone ?? "default"}`}>{node.text}</p>; });
  registry.set("card", (node, context) => { if (node.type !== "card") return null; return <section className="wx-card">{node.title ? <h2>{node.title}</h2> : null}{node.description ? <p className="wx-text wx-text-muted">{node.description}</p> : null}<div className="wx-card-content">{node.children.map((child) => <RenderNode key={child.id} node={child} context={context} />)}</div></section>; });
  registry.set("stack", (node, context) => { if (node.type !== "stack") return null; return <div className={`wx-stack wx-stack-${node.direction ?? "column"} wx-gap-${node.gap ?? "md"}`}>{node.children.map((child) => <RenderNode key={child.id} node={child} context={context} />)}</div>; });
  registry.set("button", (node, context) => { if (node.type !== "button") return null; const isSubmit = context.formSubmitActionId === node.actionId; return <button type={isSubmit ? "submit" : "button"} className={`wx-button wx-button-${node.variant ?? "primary"}`} disabled={context.readOnly || node.disabled} onClick={isSubmit ? undefined : () => context.emit(node.actionId, actionPayload(context))}>{node.label}</button>; });
  registry.set("input", (node, context) => { if (node.type !== "input") return null; const value = context.values[node.field] ?? node.value ?? ""; return <label className="wx-field"><span>{node.label}{node.required ? <b aria-hidden="true"> *</b> : null}</span><input value={value} placeholder={node.placeholder} required={node.required} disabled={context.readOnly || node.disabled} onChange={(event) => context.setValue(node.field, event.target.value)} /></label>; });
  registry.set("select", (node, context) => { if (node.type !== "select") return null; const value = context.values[node.field] ?? node.value ?? ""; return <label className="wx-field"><span>{node.label}{node.required ? <b aria-hidden="true"> *</b> : null}</span><select value={value} required={node.required} disabled={context.readOnly || node.disabled} onChange={(event) => context.setValue(node.field, event.target.value)}><option value="">请选择</option>{node.options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>; });
  registry.set("form", (node, context) => { if (node.type !== "form") return null; const onSubmit = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); if (context.readOnly || !node.submitActionId) return; const form = event.currentTarget; if (!form.checkValidity()) { form.reportValidity(); return; } context.emit(node.submitActionId, actionPayload(context)); }; const formContext = { ...context, formSubmitActionId: node.submitActionId }; return <form className="wx-form" onSubmit={onSubmit}>{node.children.map((child) => <RenderNode key={child.id} node={child} context={formContext} />)}</form>; });
  registry.set("table", (node) => { if (node.type !== "table") return null; return <div className="wx-table-wrap"><table><thead><tr>{node.columns.map((column) => <th key={column.key}>{column.label}</th>)}</tr></thead><tbody>{node.rows.map((row, rowIndex) => <tr key={rowIndex}>{node.columns.map((column) => <td key={column.key}>{row[column.key] ?? ""}</td>)}</tr>)}</tbody></table></div>; });
  registry.set("progress", (node) => { if (node.type !== "progress") return null; return <div className="wx-progress"><div className="wx-progress-label"><span>{node.label ?? "进度"}</span><span>{node.value}%</span></div><progress max="100" value={node.value}>{node.value}%</progress></div>; });
  return registry;
}

function RenderNode({ node, context, registry }: { node: SurfaceNode; context: RenderContext; registry?: ComponentRegistry }): ReactNode {
  const renderer = (registry ?? createDefaultRegistry()).get(node.type);
  return renderer ? renderer(node, context) : <p className="wx-error">不支持的组件：{node.type}</p>;
}

export function SurfaceRenderer({ surface, onEvent, className, readOnly = false }: SurfaceRendererProps): ReactNode {
  const parsed = useMemo(() => { try { return { surface: parseSurface(surface), error: null }; } catch (error) { return { surface: null, error: error instanceof Error ? error.message : "无法读取 surface" }; } }, [surface]);
  const [values, setValues] = useState<Record<string, string>>({});
  useEffect(() => { if (!parsed.surface) return; const next: Record<string, string> = {}; const visit = (node: SurfaceNode): void => { if (node.type === "input" || node.type === "select") next[node.field] = node.value ?? ""; if ("children" in node) node.children.forEach(visit); }; parsed.surface.nodes.forEach(visit); setValues(next); }, [parsed.surface]);
  if (!parsed.surface) return <div className={`wx-surface ${className ?? ""}`} role="alert"><p className="wx-error">当前界面数据无法读取：{parsed.error}</p></div>;
  const safeSurface = parsed.surface;
  const context: RenderContext = { values, setValue: (field, value) => setValues((current) => ({ ...current, [field]: value })), emit: (actionId, payload) => onEvent({ actionId, payload }), readOnly };
  return <div className={`wx-surface ${className ?? ""}`}>{safeSurface.nodes.map((node) => <RenderNode key={node.id} node={node} context={context} />)}</div>;
}

export { parseSurface };
