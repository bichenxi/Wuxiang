# 外部来源笔记

记录日期：2026-09-20（用户讨论来源另记阅读日期）。来源事实不等于无相能力或商业结论。

## 用户讨论来源

- 来源：[《评估无相产品可行性》完整分享链接](https://chatgpt.com/share/6a9e4c6c-0d84-83ea-99a6-52c57f95963e)
- 阅读日期：2026-09-07
- 主题：无相的产品理念、固定 shell 与动态 surface 的架构、Wuxiang/Morph 品牌命名、开源与闭源商业化边界。
- 提炼：讨论提出让 Agent 生成声明式交互 UI、由受控组件渲染并把事件交回 Agent；同时比较了开源核心、云服务和企业能力等方向。本文将其中用户意愿、讨论建议、本期决策和待验证假设分开记录，不作逐字转录，也不把可行性或收入判断当作事实。

## A2UI

- 来源：[A2UI v0.9.1 协议](https://a2ui.org/specification/v0.9.1-a2ui/)、[A2UI v1.0 candidate 协议](https://a2ui.org/specification/v1.0-a2ui/)、[项目首页与版本状态](https://a2ui.org/)
- 核验日期：2026-09-20
- 摘要：官方首页列 `v0.9.1` 为当前版本、`v1.0` 为候选。v0.9.1 用 `createSurface`、`updateComponents`、`updateDataModel`、`deleteSurface` 四类 server-to-client 消息；组件按扁平列表和 ID 引用组织，UI 结构与 data model 分开更新。
- 对本项目的影响：ADR-0008 选择 M1 继续使用原生 Surface `0.1`，此轮不做 adapter，也不声称兼容。A2UI 官网标示 Apache 2.0；若未来分发时复制/改编相关规范或代码，应先由项目所有者复核来源与许可证事项。本笔记不构成法律分析。

## OpenAI structured output 与 JSON mode

- 来源：[Structured model outputs（Responses API）](https://developers.openai.com/api/docs/guides/structured-outputs?api-mode=responses)
- 核验日期：2026-09-20
- 摘要：Responses API 可用 `text.format` 配置 JSON mode 或 JSON Schema Structured Outputs。两者都输出 JSON，但 JSON mode 不保证匹配业务 schema；官方建议在可用时优先 Structured Outputs。响应处理需区分拒答、incomplete 和有效文本。
- 对本项目的影响：M1 本轮选择 JSON mode，之后仍用无相 `parseSurface` 做最终校验并至多修复一次；这是为了先避免维护第二套严格 nullable 深递归 schema 的阶段取舍，并非 OpenAI 推荐 JSON mode 优先，也不代表稳定 schema 兼容性。应结合真实校验失败率、模型支持与 schema 维护成本复核是否迁移。

## MCP Apps

- 来源：[MCP Apps overview](https://modelcontextprotocol.io/extensions/apps/overview)
- 摘要：MCP Apps 让 MCP host 在聊天中渲染交互 HTML，通常运行于 sandboxed iframe；App 与 host 通过 JSON-RPC 风格消息和 `postMessage` 双向通信。它是 MCP 扩展，不是简单的 JSON 字段兼容层。
- 对本项目的影响：若未来接入，需要设计明确 adapter、权限和通信边界；M0 不宣称支持。

## assistant-ui

- 来源：[assistant-ui pricing](https://www.assistant-ui.com/pricing)
- 摘要：页面说明 assistant-ui 核心库采用 MIT，使用者可保留自己的 backend；可选 assistant-cloud 提供 threads、history 和 auth 等托管能力，并按方案收费。该产品与无相在 UI/Cloud 方向相邻，不能直接推导无相定价。
- 对本项目的影响：支持“基础能力与托管能力分层”的待验证思路，但无相许可证、价格和云功能尚未决定。

## 不足与核对

- AG-UI、LangGraph、AI SDK 的适配边界尚未核验，路线图只列为后续事项。
- 外部版本、价格和支持矩阵会变化；在作兼容或商业决定前重新查看官方来源。
- 来源页面的安全、性能和采用描述不作为无相的安全、性能或市场承诺。
