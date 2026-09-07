import { cloneSurface, parseSurface, type Surface, type SurfaceEvent } from "@wuxiang/protocol";

export type RuntimeOptions = { historyLimit?: number };
export type RuntimeListener = (surface: Surface, event?: SurfaceEvent) => void;
export type DispatchInput = Omit<SurfaceEvent, "eventId"> & { eventId?: string };
export class RuntimeError extends Error { constructor(message: string) { super(message); this.name = "RuntimeError"; } }

type HistoryEntry = { surface: Surface; event?: SurfaceEvent };

const makeEventId = (): string => `evt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
const safePayload = (value: unknown): unknown => {
  const seen = new WeakSet<object>();
  const visit = (item: unknown, depth: number): unknown => {
    if (depth > 8) throw new RuntimeError("event payload is too deeply nested");
    if (item === null || typeof item === "string" || typeof item === "boolean") return item;
    if (typeof item === "number" && Number.isFinite(item)) return item;
    if (Array.isArray(item)) { if (item.length > 200) throw new RuntimeError("event payload array is too large"); return item.map((entry) => visit(entry, depth + 1)); }
    if (typeof item !== "object" || Object.getPrototypeOf(item) !== Object.prototype) throw new RuntimeError("event payload must be plain JSON data");
    if (seen.has(item)) throw new RuntimeError("event payload cannot be cyclic"); seen.add(item);
    const result: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
    for (const [key, entry] of Object.entries(item)) { if (key === "__proto__" || key === "constructor" || key === "prototype") throw new RuntimeError("event payload contains an unsafe key"); result[key] = visit(entry, depth + 1); }
    seen.delete(item); return result;
  };
  const result = visit(value, 0); let serialized: string;
  try { serialized = JSON.stringify(result); } catch { throw new RuntimeError("event payload must be finite JSON data"); }
  if (serialized.length > 32_000) throw new RuntimeError("event payload is too large");
  return result;
};
const validateFormPayload = (surface: Surface, actionId: string, payload: unknown): void => {
  const forms: Array<Extract<Surface["nodes"][number], { type: "form" }>> = [];
  const visit = (node: Surface["nodes"][number]): void => { if (node.type === "form" && node.submitActionId === actionId) forms.push(node); if ("children" in node) node.children.forEach(visit); };
  surface.nodes.forEach(visit);
  if (forms.length === 0) return;
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) throw new RuntimeError("form event payload must be an object");
  const values = payload as Record<string, unknown>;
  for (const form of forms) {
    const fields: Array<{ field: string; required?: boolean; options?: string[] }> = [];
    const collect = (node: Surface["nodes"][number]): void => { if (node.type === "input") fields.push({ field: node.field, required: node.required }); if (node.type === "select") fields.push({ field: node.field, required: node.required, options: node.options.map((option) => option.value) }); if ("children" in node) node.children.forEach(collect); };
    form.children.forEach(collect);
    for (const field of fields) { const value = values[field.field]; if (value !== undefined && typeof value !== "string") throw new RuntimeError(`form field '${field.field}' must be a string`); if (field.required && (typeof value !== "string" || value.length === 0)) throw new RuntimeError(`required form field '${field.field}' is empty`); if (field.options && typeof value === "string" && value !== "" && !field.options.includes(value)) throw new RuntimeError(`form field '${field.field}' has an invalid option`); }
  }
};

export class SurfaceRuntime {
  private current: Surface;
  private readonly historyLimit: number;
  private readonly historyEntries: HistoryEntry[];
  private readonly seenEventIds = new Set<string>();
  private readonly eventLog: SurfaceEvent[] = [];
  private readonly listeners = new Set<RuntimeListener>();

  constructor(initial: unknown, options: RuntimeOptions = {}) {
    this.current = parseSurface(initial);
    const requestedLimit = options.historyLimit ?? 20;
    if (!Number.isSafeInteger(requestedLimit) || requestedLimit < 1 || requestedLimit > 100) throw new RuntimeError("historyLimit must be an integer from 1 to 100");
    this.historyLimit = requestedLimit;
    this.historyEntries = [{ surface: cloneSurface(this.current) }];
  }

  getSnapshot(): Surface { return cloneSurface(this.current); }
  getHistory(): ReadonlyArray<Surface> { return this.historyEntries.map((entry) => cloneSurface(entry.surface)); }
  getEvents(): ReadonlyArray<SurfaceEvent> { return this.eventLog.map((event) => structuredClone(event)); }
  subscribe(listener: RuntimeListener): () => void { this.listeners.add(listener); return () => this.listeners.delete(listener); }

  replace(candidate: unknown): Surface {
    const next = parseSurface(candidate);
    if (next.surfaceId !== this.current.surfaceId) throw new RuntimeError("surfaceId cannot change during a runtime session");
    if (next.revision <= this.current.revision) throw new RuntimeError("replacement revision must be newer than the current revision");
    this.current = next;
    this.historyEntries.push({ surface: cloneSurface(next) });
    this.trimHistory();
    const snapshot = this.getSnapshot();
    this.listeners.forEach((listener) => listener(this.getSnapshot()));
    return snapshot;
  }

  dispatch(input: DispatchInput): SurfaceEvent {
    if (typeof input !== "object" || input === null || Array.isArray(input)) throw new RuntimeError("event must be an object");
    const raw = input as Record<string, unknown>;
    for (const key of Object.keys(raw)) if (!["eventId", "surfaceId", "revision", "actionId", "payload"].includes(key)) throw new RuntimeError(`unknown event field '${key}'`);
    const eventId = raw.eventId === undefined ? makeEventId() : raw.eventId;
    if (typeof eventId !== "string" || eventId.length === 0 || eventId.length > 200) throw new RuntimeError("eventId must be a non-empty string");
    if (typeof raw.surfaceId !== "string" || raw.surfaceId.length === 0) throw new RuntimeError("surfaceId must be a non-empty string");
    if (!Number.isSafeInteger(raw.revision) || (raw.revision as number) < 0) throw new RuntimeError("revision must be a non-negative integer");
    if (typeof raw.actionId !== "string" || raw.actionId.length === 0) throw new RuntimeError("actionId must be a non-empty string");
    const event: SurfaceEvent = { eventId, surfaceId: raw.surfaceId, revision: raw.revision as number, actionId: raw.actionId };
    if (raw.payload !== undefined) event.payload = safePayload(raw.payload);
    if (this.seenEventIds.has(event.eventId)) throw new RuntimeError("duplicate eventId");
    if (event.surfaceId !== this.current.surfaceId) throw new RuntimeError("event surfaceId does not match the active surface");
    if (event.revision !== this.current.revision) throw new RuntimeError("stale event revision");
    if (!this.current.actions.some((action) => action.id === event.actionId)) throw new RuntimeError("event action is not allowlisted");
    validateFormPayload(this.current, event.actionId, event.payload);
    this.seenEventIds.add(event.eventId);
    this.eventLog.push(structuredClone(event));
    this.trimEvents();
    const snapshot = this.getSnapshot();
    this.historyEntries.push({ surface: snapshot, event: structuredClone(event) });
    this.trimHistory();
    this.listeners.forEach((listener) => listener(this.getSnapshot(), structuredClone(event)));
    return structuredClone(event);
  }

  /** Return immutable copies of snapshots; replay performs no action dispatch or external work. */
  replay(): ReadonlyArray<Surface> { return this.getHistory(); }
  clearEventLog(): void { this.eventLog.length = 0; this.seenEventIds.clear(); }

  private trimHistory(): void { while (this.historyEntries.length > this.historyLimit) this.historyEntries.shift(); }
  private trimEvents(): void { while (this.eventLog.length > this.historyLimit) { const removed = this.eventLog.shift(); if (removed) this.seenEventIds.delete(removed.eventId); } }
}
