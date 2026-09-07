import { describe, expect, it } from "vitest";
import { MAX_NODE_COUNT, parseSurface, SurfaceValidationError } from "../src/index";

const valid = () => ({ version: "0.1", surfaceId: "demo", revision: 0, actions: [{ id: "go", label: "Go" }], nodes: [{ type: "button", id: "b", label: "Go", actionId: "go" }] });

describe("protocol validation", () => {
  it("accepts valid data and clones it", () => { const surface = parseSurface(valid()); expect(surface.surfaceId).toBe("demo"); expect(surface).not.toBe(valid()); });
  it("rejects unknown fields and unallowlisted actions", () => {
    expect(() => parseSurface({ ...valid(), extra: true })).toThrow(SurfaceValidationError);
    expect(() => parseSurface({ ...valid(), nodes: [{ type: "button", id: "b", label: "Go", actionId: "nope" }] })).toThrow(/allowlisted/);
  });
  it("limits untrusted tree size", () => {
    const nodes = Array.from({ length: MAX_NODE_COUNT + 1 }, (_, i) => ({ type: "text", id: String(i), text: "x" }));
    expect(() => parseSurface({ ...valid(), nodes })).toThrow(/root nodes/);
  });
  it("enforces form field identity and select values at the protocol boundary", () => {
    const base = { version: "0.1", surfaceId: "form", revision: 0, actions: [{ id: "submit" }], nodes: [{ type: "form", id: "f", submitActionId: "submit", children: [{ type: "input", id: "a", field: "same", label: "A" }, { type: "select", id: "b", field: "same", label: "B", options: [{ value: "x", label: "X" }] }] }] };
    expect(() => parseSurface(base)).toThrow(/duplicate field/);
    expect(() => parseSurface({ ...base, nodes: [{ ...base.nodes[0], children: [{ type: "select", id: "s", field: "choice", label: "Choice", value: "bad", options: [{ value: "x", label: "X" }] }] }] })).toThrow(/one of the options/);
  });
  it("allows clearing text fields and table cells", () => {
    expect(parseSurface({ ...valid(), nodes: [{ type: "input", id: "i", field: "q", label: "Query", value: "" }, { type: "table", id: "t", columns: [{ key: "name", label: "Name" }], rows: [{ name: "" }] }] }).nodes).toHaveLength(2);
  });
});
