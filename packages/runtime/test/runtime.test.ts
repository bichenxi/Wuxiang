import { describe, expect, it } from "vitest";
import { SurfaceRuntime, RuntimeError } from "../src/index";

const initial = { version: "0.1", surfaceId: "s", revision: 0, actions: [{ id: "submit" }], nodes: [{ type: "button", id: "b", label: "Submit", actionId: "submit" }] };
describe("SurfaceRuntime", () => {
  it("atomically replaces validated snapshots and hides mutable state", () => {
    const runtime = new SurfaceRuntime(initial);
    const copy = runtime.getSnapshot(); copy.nodes[0]!.type = "text";
    expect(runtime.getSnapshot().nodes[0]!.type).toBe("button");
    expect(() => runtime.replace({ ...initial, revision: 0, extra: true })).toThrow();
    expect(() => runtime.replace({ ...initial, revision: 0 })).toThrow(/newer/);
    runtime.replace({ ...initial, revision: 1 });
    expect(runtime.getSnapshot().revision).toBe(1);
  });
  it("rejects stale, illegal and duplicate events", () => {
    const runtime = new SurfaceRuntime(initial, { historyLimit: 2 });
    expect(() => runtime.dispatch({ surfaceId: "s", revision: 1, actionId: "submit", eventId: "e" })).toThrow(/stale/);
    expect(() => runtime.dispatch({ surfaceId: "s", revision: 0, actionId: "unknown", eventId: "e" })).toThrow(/allowlisted/);
    runtime.dispatch({ surfaceId: "s", revision: 0, actionId: "submit", eventId: "e" });
    expect(() => runtime.dispatch({ surfaceId: "s", revision: 0, actionId: "submit", eventId: "e" })).toThrow(/duplicate/);
    expect(runtime.getEvents()).not.toBe(runtime.getEvents());
  });
  it("keeps bounded read-only replay", () => {
    const runtime = new SurfaceRuntime(initial, { historyLimit: 2 });
    runtime.dispatch({ surfaceId: "s", revision: 0, actionId: "submit" });
    const history = runtime.replay(); expect(history.length).toBeLessThanOrEqual(2);
    expect(() => (history[0] as { revision: number }).revision = 100).not.toThrow();
    expect(runtime.getSnapshot().revision).toBe(0);
  });
  it("checks event payloads at the runtime boundary and isolates observers", () => {
    const runtime = new SurfaceRuntime(initial);
    runtime.subscribe((snapshot) => { snapshot.nodes[0]!.id = "mutated"; });
    let observed = ""; runtime.subscribe((snapshot) => { observed = snapshot.nodes[0]!.id; });
    expect(() => runtime.dispatch({ surfaceId: "s", revision: 0, actionId: "submit", payload: new Date() })).toThrow(/plain JSON/);
    runtime.dispatch({ surfaceId: "s", revision: 0, actionId: "submit", payload: { destination: "杭州" } });
    expect(observed).toBe("b");
  });
  it("enforces required and select values when bypassing the renderer", () => {
    const runtime = new SurfaceRuntime({ version: "0.1", surfaceId: "f", revision: 0, actions: [{ id: "submit" }], nodes: [{ type: "form", id: "form", submitActionId: "submit", children: [{ type: "input", id: "name", field: "name", label: "Name", required: true }, { type: "select", id: "style", field: "style", label: "Style", required: true, options: [{ value: "slow", label: "Slow" }] }] }] });
    expect(() => runtime.dispatch({ surfaceId: "f", revision: 0, actionId: "submit", payload: { name: "", style: "slow" } })).toThrow(/required/);
    expect(() => runtime.dispatch({ surfaceId: "f", revision: 0, actionId: "submit", payload: { name: "A", style: "invalid" } })).toThrow(/invalid option/);
    runtime.dispatch({ surfaceId: "f", revision: 0, actionId: "submit", payload: { name: "A", style: "slow" } });
  });
});
