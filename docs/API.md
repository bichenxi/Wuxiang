# SDK API

本文对应当前 workspace 中 `@wuxiang/protocol`、`@wuxiang/runtime` 和 `@wuxiang/react` 的源码导出。包目前是 private，示例用于仓库内 playground 或 workspace 消费者；它不是已发布 npm 包的安装承诺。

## 最小闭环

下面的 React 组件构造一个 `SurfaceRuntime`，把 renderer 的事件补上当前 surface 的 `surfaceId` 和 `revision` 后交给 runtime。renderer 不生成 `eventId`、`surfaceId` 或 `revision`，这些字段由 runtime/宿主补齐。

```tsx
import { useState } from "react";
import { SurfaceRenderer, type RendererEvent } from "@wuxiang/react";
import { SurfaceRuntime } from "@wuxiang/runtime";
import type { Surface } from "@wuxiang/protocol";
import "@wuxiang/react/styles.css";

const initial: Surface = {
  version: "0.1",
  surfaceId: "demo",
  revision: 0,
  actions: [{ id: "submit", label: "提交" }],
  nodes: [
    {
      type: "form",
      id: "form",
      submitActionId: "submit",
      children: [
        { type: "input", id: "name", field: "name", label: "姓名", required: true },
        { type: "button", id: "submit-button", label: "提交", actionId: "submit" },
      ],
    },
  ],
};

export function Demo() {
  const [runtime] = useState(() => new SurfaceRuntime(initial));
  const [surface, setSurface] = useState(() => runtime.getSnapshot());

  const onEvent = (event: RendererEvent) => {
    runtime.dispatch({
      ...event,
      surfaceId: surface.surfaceId,
      revision: surface.revision,
    });
    runtime.replace({
      version: "0.1",
      surfaceId: surface.surfaceId,
      revision: surface.revision + 1,
      actions: [],
      nodes: [{ type: "text", id: "result", text: "已提交" }],
    });
    setSurface(runtime.getSnapshot());
  };

  return <SurfaceRenderer surface={surface} onEvent={onEvent} />;
}
```

`dispatch` 只接受当前 revision 的 allowlisted action；它本身不改变 surface。示例在 dispatch 成功后用递增 revision 的 text surface 调用 `replace`，因此能看到“表单 → 结果”的最小闭环。这个 mock 处理不会替代服务端业务处理；生产宿主应在事件进入副作用或业务 API 前重新执行身份、权限、资源和业务状态检查。

## `@wuxiang/protocol`

源码入口：[packages/protocol/src/index.ts](../packages/protocol/src/index.ts)。

### 导出

- `PROTOCOL_VERSION`：当前为字面量 `"0.1"`。
- `Surface`：`version`、`surfaceId`、非负安全整数 `revision`、`nodes` 和 `actions`。
- `SurfaceNode` 联合及九种节点类型：`text`、`card`、`stack`、`button`、`input`、`select`、`form`、`table`、`progress`。
- `SurfaceAction`：非空 `id`，可选 `label`。
- `SurfaceEvent`：`eventId`、`surfaceId`、`revision`、`actionId`，以及可选 `payload`。
- `parseSurface(input)`：严格校验并返回脱离输入对象的 `Surface`。
- `validateSurface`：`parseSurface` 的别名。
- `isSurface(input)`：捕获校验错误并返回 boolean。
- `cloneSurface(surface)`：返回 structured clone。
- `SurfaceValidationError`：带 `path` 的校验错误。
- 上限常量：`MAX_TREE_DEPTH = 12`、`MAX_NODE_COUNT = 200`、`MAX_SURFACE_BYTES = 200_000`；当前实现用 `JSON.stringify(input).length` 比较该值，即 JavaScript 字符串的 UTF-16 code units，不是按 UTF-8 字节计算。

### Surface 约束

`parseSurface` 先对输入调用 `JSON.stringify` 并检查结果长度，再要求顶层是对象、节点和字段符合协议；顶层和节点对象不能有未知字段。除上述总量上限外，当前实现还执行这些边界：字符串通常非空且最多 10,000 个字符；action 最多 100 个；节点 id 全局唯一；input/select 的 field 全局唯一；不允许嵌套 form；select 最多 100 个不重复选项，已有 value 必须为空或命中选项；table 最多 30 列和 1,000 行；progress 的 value 在 0–100；树深度和节点总数都受上限限制。

校验失败抛出 `SurfaceValidationError`，错误消息包含路径，例如 `surface.nodes[0].actionId: action 'submit' is not allowlisted`。未知字段、重复 id/field、错误版本和未在 allowlist 中的 action 都在此层拒绝。成功返回的是新对象，不会把调用方传入对象作为 runtime 内部状态。

## `@wuxiang/runtime`

源码入口：[packages/runtime/src/index.ts](../packages/runtime/src/index.ts)。

### 导出

- `RuntimeOptions`：`historyLimit?: number`，默认 `20`，只接受 `1` 到 `100` 的安全整数。
- `DispatchInput`：`SurfaceEvent` 去掉必填 `eventId` 后，`eventId` 可选；runtime 会生成缺省 id。
- `RuntimeListener`：`(surface, event?) => void`。
- `RuntimeError`：runtime 输入、状态和事件边界错误。
- `SurfaceRuntime`：surface 状态、有限历史、事件日志和 listener 管理。

### `SurfaceRuntime`

```ts
const runtime = new SurfaceRuntime(initial, { historyLimit: 20 });

const current = runtime.getSnapshot();
const stop = runtime.subscribe((next, event) => {
  // next 和 event 都是副本；这里可以更新宿主视图。
});

const event = runtime.dispatch({
  surfaceId: current.surfaceId,
  revision: current.revision,
  actionId: "submit",
  payload: { name: "Ada" },
});

const history = runtime.replay();
const events = runtime.getEvents();
stop();
```

构造函数先调用 `parseSurface`；历史初始包含一份初始 snapshot。`getSnapshot()`、`getHistory()`、`replay()`、`getEvents()` 和 listener 参数都通过 clone 返回，调用方修改拿到的对象不会修改 runtime 内部状态。`replay()` 当前是 `getHistory()` 的只读语义别名：返回历史副本，不重新 dispatch event，也不执行网络、模型或其他外部副作用。

`replace(candidate)` 先完整校验，再要求 `surfaceId` 与当前会话一致且 `revision` 严格更大；校验失败或 revision 不新时，当前状态保持不变。成功后替换当前 surface、追加历史并通知 listener。它是原子状态更新，不是业务授权或副作用执行入口。

`subscribe(listener)` 返回取消订阅函数。listener 内不要把收到的副本当作 runtime 内部可变引用。`clearEventLog()` 清空事件日志和当前 event-id 去重集合，不清空 surface 历史。

### event 校验和错误

`dispatch` 先拒绝未知字段，然后要求 event 是对象；`eventId` 非空且最多 200 个字符，`surfaceId`/`actionId` 非空字符串，`revision` 是非负安全整数。payload 必须符合 runtime 的 plain-data 检查：不允许循环引用、非有限数字、数组超过 200 项、超过 8 层嵌套、`__proto__`/`constructor`/`prototype` 键或 `JSON.stringify(payload).length` 超过 32,000 个 JavaScript 字符串 UTF-16 code units。

随后 runtime 按顺序检查：event id 是否仍在去重窗口、surfaceId 是否匹配、revision 是否等于当前 revision、action 是否在当前 surface 的 allowlist。失败抛出 `RuntimeError`，不会记录 event，也不会通知 listener。通过后才写入有限 event log 和 history，并通知 listener。

### snapshot、`readOnly` 与 `Object.freeze`

runtime 的 snapshot 是 **独立的可变副本**：实现使用 `structuredClone`，因此修改 `runtime.getSnapshot()` 或 `replay()` 返回值不会影响 runtime；但返回对象本身没有通过 `Object.freeze` 冻结。TypeScript 的 `ReadonlyArray` 只是类型层提示，不能替代运行时不可变性。

`@wuxiang/react` 的 `readOnly` 是 renderer 的交互开关：它会禁用 button、input、select，并阻止 form submit 和 event emit；它不冻结 `Surface` 数据，也不构成服务端授权。需要本地不可变视图时，调用方可以对自己的副本执行 `Object.freeze`，但 runtime 不依赖 freeze 才能保持内部状态隔离。

### event-id 去重边界

`SurfaceRuntime` 只在内存中保留最多 `historyLimit` 个 event，并在 event 从日志窗口淘汰时移除其 id；`clearEventLog()` 也会清除去重集合。因此这是有限窗口内的重复提交抑制，不是端到端 exactly-once 保证。进程重启、多个 runtime 实例、分布式重试或窗口之外的重复 id 都需要更高层的幂等键、持久化和业务处理。

runtime 只验证协议 allowlist 和当前 revision；它不验证用户身份、组织权限、资源所有权、支付/预订条件或业务状态。所有真实副作用前仍须由服务端重新授权和执行幂等控制。

## `@wuxiang/react`

源码入口：[packages/react/src/index.tsx](../packages/react/src/index.tsx)。

### 导出

- `RendererEvent`：从 `SurfaceEvent` 去掉 `eventId`、`surfaceId`、`revision`，保留 `actionId` 和可选 `payload`。
- `SurfaceRendererProps`：`surface`、`onEvent`，可选 `className`、`readOnly`。
- `ComponentRenderer`、`ComponentRegistry`、`RenderContext` 类型。
- `createDefaultRegistry()`：返回九类内置节点 renderer 的 registry。
- `SurfaceRenderer`：校验并渲染 surface，维护表单字段值，按用户操作触发 `onEvent`。
- `parseSurface`：从 protocol re-export。

`SurfaceRenderer` 对传入 surface 再次调用 `parseSurface`；失败时渲染 `role="alert"` 的错误区域，不触发 event。输入和 select 的初始值来自节点 value，用户修改值留在 renderer 的本地 state；表单提交时以当前字段值作为 payload。组件 disabled 或 renderer `readOnly` 时不会发出相应操作。

当前 `SurfaceRendererProps` 没有 registry 注入字段；`ComponentRegistry` 和 `createDefaultRegistry` 是已导出的类型/工厂，custom registry 的接线不属于 M0 已承诺的 renderer API。

## `@wuxiang/agent`

源码入口：[packages/agent/src/index.ts](../packages/agent/src/index.ts)。该包当前只作为本地服务端 workspace 包使用，不把密钥或 OpenAI 调用暴露到浏览器。

`createAgentService({ apiKey, model, fetch, timeoutMs })` 创建生成服务。`generate` 接收 `requestId`、`prompt`、`surfaceId`、`revision`，可选带上紧邻前一版本的 `currentSurface` 和已由 runtime 校验的 `event`。模型返回的 JSON envelope 必须先通过本地 protocol 校验，最多进行一次有限修复；失败会返回带 `reason` 的文本 fallback。诊断包含 attempts、durationMs、outcome，若供应商提供则累计 input/output token。

`createAgentHttpHandler(service)` 提供两个本地路由：`GET /api/agent/status` 返回配置状态；`POST /api/agent/generate` 返回 UI 或文本结果。handler 只接受 loopback 同源请求、JSON body，并限制请求大小；`OPENAI_API_KEY` 和 `OPENAI_MODEL` 只应通过服务端环境变量注入。真实模型调用依赖运行环境配置，仓库测试使用 mock fetch 验证协议和失败边界。
