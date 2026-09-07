# 无相首期 PRD：M0 SDK 工程基础

## 目标与用户

目标是交付一个可运行、可验证、可本地演示的 SDK 骨架，证明开发者可以用声明式 surface 表达一个任务交互闭环。目标用户是有复杂 Agent 交互的独立开发者和小团队。M0 不验证真实模型生成，也不宣称 AI MVP；真实 AI 闭环从 M1 开始。

## M0 用户故事

1. 作为开发者，我可以从 workspace 导入 protocol、runtime 和 React 包，构造一个 surface 并渲染它。
2. 作为开发者，我可以只允许注册的组件和 action，坏数据被拒绝且不会部分写入。
3. 作为用户，我可以填写旅行偏好，查看 mock 结果，再修改偏好并保留已有值。
4. 作为开发者，我可以读取有限历史并做只读 replay；replay 不会再次触发副作用。

## 范围与验收

### 工程结构

- npm workspaces + TypeScript。
- `packages/protocol`：版本 `0.1` 的类型/校验语义。
- `packages/runtime`：框架无关的 surface 状态、事件、历史和 replay。
- `packages/react`：九类白名单组件的渲染适配。
- `examples/playground`：本地旅行偏好 mock 闭环。

验收：安装、typecheck、build 和适当测试能在干净环境完成；示例可本地运行；每个包的最终导出以代码为准并在变更后同步本文件。

### 最小协议语义

| 语义 | M0 要求 |
| --- | --- |
| 版本 | 明确协议版本 `0.1`，版本不匹配时拒绝或显式报错 |
| surface | 有 `surfaceId` 和单调 `revision`，一次更新对应一个可验证 surface |
| tree | 用节点树表示组件和布局，节点类型必须落在 renderer catalog |
| action | 事件只能引用 allowlist 内 action；payload 经过校验 |
| 更新 | 合法更新原子替换，失败不改变当前 surface |

字段名、数据类型和错误类型必须由代码实现确认；本表是产品语义，不替代公共 API 文档。

### Runtime 行为

- 严格校验协议、节点、action 和 revision。
- 拒绝过期 event；不把过期输入交给业务副作用。
- 历史有明确有限上限，超限按实现约定淘汰并可观察。
- replay 只读取历史和重建状态，不执行网络、预订或其他副作用。
- 测试覆盖合法更新、非法更新、原子性、过期 event、历史上限和 replay 无副作用。

### React 渲染器

只实现 `Text`、`Card`、`Stack`、`Button`、`Input`、`Select`、`Form`、`Table`、`Progress`。未注册节点显示可诊断错误或被拒绝；不得通过 surface 让模型/输入注入任意 React 组件或代码。

### Playground

流程固定为“旅行偏好 mock 表单 → mock 结果 → 修改偏好并保留值”。不使用真实模型、预订、云、外部 API 或持久化账户。示例用于人工检查和自动化测试，不能作为旅游产品承诺。

## 非目标

M0 不做真实模型调用、服务端 key 管理、生成/修复循环、取消/超时、文本 fallback、流式更新、MCP/A2UI/AG-UI/LangGraph/AI SDK adapter、鉴权、组织治理、云托管、生产 SLA、发布和部署。

## M1 入口条件

M1 必须让真实模型生成 schema，并由服务端保管 key；生成结果经 validation，允许有限修复，失败时返回文本 fallback；请求可取消并有超时。M1 的完成判据是可观察的生成、校验、修复、fallback 和时延指标，而非仅有 mock。

## 安全与可诊断性

输入默认为不可信。组件目录和 action allowlist 是执行边界；错误要带可定位信息但不泄露 secret。M0 不执行动态代码；日志和历史应避免记录不必要的敏感值。最终安全边界以 runtime 测试和代码为准，不使用“100% safe”之类绝对表述。

## 待定事项（不阻塞 M0）

- M1 前评估 A2UI 映射/复用与维护内部协议的成本、边界和许可证。
- M1 模型供应商、生成协议、修复次数、超时默认值和文本 fallback 格式。
- React 之外的 renderer、streaming 传输和第一个生态 adapter。
- 许可证（Apache-2.0/MIT/其他）、Cloud/Enterprise 功能切分、价格和发布策略。
