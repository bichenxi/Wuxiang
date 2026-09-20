import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "../src/App.js";

describe("playground", () => {
  let root: Root | undefined;
  let container: HTMLDivElement | undefined;

  afterEach(() => {
    if (root) {
      act(() => root?.unmount());
    }
    root = undefined;
    container?.remove();
    container = undefined;
    vi.unstubAllGlobals();
  });

  it("renders the local demo and checks agent configuration", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      configured: false,
      provider: "openai",
      model: null,
    }), { headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(<App />);
      await Promise.resolve();
    });

    expect(container.textContent).toContain("本地演示");
    expect(container.textContent).toContain("先说说你的偏好");
    expect(fetchMock).toHaveBeenCalledWith("/api/agent/status", expect.objectContaining({
      signal: expect.any(AbortSignal),
    }));
  });
});
