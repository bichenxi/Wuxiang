# 无相架构决策记录

状态含义：`accepted` 表示本期执行；`conditional` 表示先执行试验但后续需证据复核；`open` 表示未决。

## ADR-0001：M0 先做可运行 SDK 骨架

- 状态：`accepted`
- 决策：M0 交付 npm workspaces、TypeScript 的 protocol/runtime/react 包和本地 playground。
- 原因：先验证状态、校验、事件和 renderer 的工程闭环，控制真实 AI、云和生态适配的变量。
- 不代表：M0 不是 AI MVP，不代表真实模型可生成可用 UI。
- 复核：M1 接入真实模型后，以完成率、错误率、校验成功率和时延重新判断。

## ADR-0002：内部协议先采用 `0.1` 试验语义

- 状态：`conditional`
- 决策：M0 以 `surfaceId`、`revision`、节点树和 action allowlist 为最小语义。
- 原因：让 runtime 和 renderer 有清晰边界，便于原子更新、过期拒绝和 replay 测试。
- 边界：它不是新标准，也不宣称与 A2UI/MCP Apps 兼容；具体字段和 API 以代码为准。
- 复核：M1 前对 A2UI 映射/复用与维护自定义协议做成本、兼容、许可证评估。

## ADR-0003：固定 shell + 动态 surface

- 状态：`accepted`
- 决策：应用保留可控 shell，Agent 只产生 catalog 内的声明式 surface；按任务可选择 text、UI 或 text+UI。
- 原因：保持应用导航和安全边界稳定，同时给复杂任务提供表单、结果和回填能力。
- 边界：M0 仅证明 UI surface，text/router 策略和模型选择留到 M1。

## ADR-0004：白名单组件与 action allowlist

- 状态：`accepted`
- 决策：React 首期只允许九类组件；action 需登记并校验 payload，未知节点和过期 event 拒绝。
- 原因：降低任意代码和不可控副作用风险，保证 runtime 框架无关且可测。
- 复核：组件扩展必须有 catalog、输入校验、错误和副作用测试；不使用绝对安全承诺。

## ADR-0005：M0 暂不发布或授权

- 状态：`accepted`
- 决策：所有包 `private`、`UNLICENSED`，不发布、不部署；Apache-2.0/MIT 等待后续决定。
- 原因：仓库仍在试验期，先避免对 API 稳定性和商业模式作承诺。
- 商业原则：基础校验与自托管不应成为收费门槛；云托管和组织治理可作为潜在付费边界，价格待验证。

## ADR-0006：旅行偏好仅作闭环样例

- 状态：`accepted`
- 决策：用 mock 表单→结果→修改保留值展示交互闭环。
- 原因：场景足够具体，可测状态回填、action 和结果渲染。
- 边界：无真实模型、预订、旅游供应商、云或旅游业务定位。

## ADR-0007：生态兼容延后并单独决策

- 状态：`open`
- 决策：M0 不宣称 A2UI、MCP Apps、AG-UI、LangGraph 或 AI SDK 兼容；M1 先评估一个目标。
- 原因：A2UI 是声明式组件协议，MCP Apps 是 HTML 沙箱 iframe + JSON-RPC/postMessage 模式，assistant-ui 是相邻 React/Cloud 组合，抽象层次和边界不同。
- 复核：以官方版本、适配成本、许可证和实验结果决定，不把字段改名当兼容。
