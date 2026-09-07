# 外部来源笔记

记录日期：2026-09-07。来源事实不等于无相能力或商业结论。

## 用户讨论来源

- 来源：[《评估无相产品可行性》完整分享链接](https://chatgpt.com/share/6a9e4c6c-0d84-83ea-99a6-52c57f95963e)
- 阅读日期：2026-09-07
- 主题：无相的产品理念、固定 shell 与动态 surface 的架构、Wuxiang/Morph 品牌命名、开源与闭源商业化边界。
- 提炼：讨论提出让 Agent 生成声明式交互 UI、由受控组件渲染并把事件交回 Agent；同时比较了开源核心、云服务和企业能力等方向。本文将其中用户意愿、讨论建议、本期决策和待验证假设分开记录，不作逐字转录，也不把可行性或收入判断当作事实。

## A2UI

- 来源：[a2ui.org](https://a2ui.org/)
- 摘要：页面列出 A2UI `v0.9.1` 为当前版本、`v1.0` 为候选版本；其核心是 Agent 发送声明式组件描述，由客户端 catalog 渲染。它提供协议、组件和 renderer 生态，但无相 M0 尚未兼容它。
- 对本项目的影响：M1 前评估映射/复用，M0 的 `0.1` 仅作内部试验协议。不要把官网的安全表述改写成无相保证。

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
