import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SurfaceRenderer } from "../src/index";

let root: Root | undefined;
let container: HTMLDivElement | undefined;
afterEach(() => { act(() => root?.unmount()); container?.remove(); root = undefined; container = undefined; });

describe("SurfaceRenderer", () => {
  it("submits a controlled form through Enter and returns current values", async () => {
    const onEvent = vi.fn();
    const surface = { version: "0.1" as const, surfaceId: "form", revision: 0, actions: [{ id: "submit" }], nodes: [{ type: "form" as const, id: "f", submitActionId: "submit", children: [{ type: "input" as const, id: "q", field: "query", label: "Query", value: "杭州", required: true }, { type: "button" as const, id: "b", label: "提交", actionId: "submit" }] }] };
    container = document.createElement("div"); document.body.append(container); root = createRoot(container);
    await act(async () => { root!.render(<SurfaceRenderer surface={surface} onEvent={onEvent} />); });
    const form = container.querySelector("form")!;
    await act(async () => { form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
    expect(onEvent).toHaveBeenCalledWith({ actionId: "submit", payload: { query: "杭州" } });
  });
});
