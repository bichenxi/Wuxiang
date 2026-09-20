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

- 状态：`accepted`
- 决策：M0 和本轮 M1 都不宣称 A2UI、MCP Apps、AG-UI、LangGraph 或 AI SDK 兼容。M1 保留原生 Surface `0.1`，完成单 provider 的真实模型闭环；本轮不实现 A2UI adapter。
- 原因：A2UI 是声明式组件协议，MCP Apps 是 HTML 沙箱 iframe + JSON-RPC/postMessage 模式，assistant-ui 是相邻 React/Cloud 组合，抽象层次和边界不同。
- 复核：按 ADR-0008 记录 A2UI v0.9.1 的概念映射、缺口和重新评估条件；不把字段改名当兼容。

## ADR-0008：M1 保留原生 Surface `0.1`，不做 A2UI adapter

- 状态：`accepted`（本轮范围决策）
- 背景：截至 2026-09-20，A2UI 官方首页列 `v0.9.1` 为 current、`v1.0` 为 candidate。v0.9.1 使用分消息的 surface 生命周期：`createSurface`、`updateComponents`、`updateDataModel`、`deleteSurface`；组件以扁平列表传输，并通过 ID 引用构成邻接表；结构与独立 data model 可分别增量更新。
- 决策：M1 使用已有原生 `Surface 0.1` 形成单 provider 的真实模型闭环。协议变化和 A2UI interoperability 均不纳入本轮实现范围。
- 理由：本轮首先要验证 JSON 输出、原生 schema 校验、最多一次修复、文本 fallback、取消/超时和用户闭环。此时没有外部 renderer、agent 或客户明确要求 A2UI 的证据；同时维护双协议会扩张生成提示、校验、状态同步和测试面，分散对“少写任务交互代码、用户更快完成任务”的首轮验证。

### 概念映射与缺口

| Surface `0.1` 概念 | A2UI v0.9.1 对照 | 映射判断与代价 |
| --- | --- | --- |
| `surfaceId` | 各 lifecycle/update 消息中的 `surfaceId` | 名称和角色近似，可映射；A2UI 还引入 `catalogId`、surface 建立/删除生命周期，原生 Surface 不表达这些协议状态。 |
| 嵌套 `nodes` tree | 扁平 `updateComponents` + `root` 与 child Component ID 引用 | 可通过唯一 node ID 展平，并从父子关系构建引用；需定义 root、顺序、容器/表单语义及转换验证。组件类型/属性仍需 catalog 映射，不能直接复制 JSON。 |
| 节点内联字段值 | 独立 `updateDataModel`，组件属性可用动态值/path/function | 需要拆分组件结构和 data model，定义表单 value/path 双向绑定、默认值、缺失值和局部更新语义；简单输入值可映射，但不保证无损。 |
| `actions` allowlist、`actionId`、提交 payload | A2UI 组件 catalog 声明的 action/function 语义与客户端 `action` 消息 | 需把每个 Wuxiang action 和 payload 规范化为双方一致的 action 名、参数、能力及权限策略；名字对应不等于副作用授权。 |
| `revision` 与原子 `replace` | v0.9.1 有序增量消息流；状态更新不由同名 revision 统一表示 | 无直接等价。adapter 必须定义消息顺序、缓冲/提交、重放、过期与跨 surface 状态规则；不能把 `revision` 直接说成 A2UI event/version。 |
| 固定白名单 renderer | A2UI catalog（basic 或自定义） | 可建立一份受控 catalog 映射；组件差异、函数支持、主题和 renderer capability 需显式版本化。自定义 catalog 仍需两端协商。 |
| 删除/替换与 React 本地 state | A2UI `deleteSurface` 与增量生命周期 | 当前应用状态保留/清除规则需设计；surface 删除、重新创建、旧事件迟到和 input state 回填都需专门验证。 |
| 单次 JSON 响应 | A2UI streaming protocol 与独立 transport contract | 不是只转换数据结构；若未来上流式，需有序分帧、消息边界和返回 action 通道，并测试断线/取消/部分渲染。 |

表格是设计层映射评估，不代表已有兼容代码或通过的互操作测试。A2UI 官网标明项目采用 Apache 2.0；若未来复制/改编其规范、代码或采用相关实现，分发前应做来源与许可证清单、NOTICE/声明等许可义务核对，并由项目所有者完成授权决定。这里不构成法律分析，也不改变无相当前 `UNLICENSED` 状态。

### 备选方案

| 方案 | 收益 | 代价与风险 | 结论 |
| --- | --- | --- | --- |
| A. 继续原生 Surface `0.1` | 能沿用当前 runtime/React API；本轮范围集中在模型校验、修复、fallback 和用户任务闭环。 | 维护内部协议的机会成本；本轮不具备标准互操作性，之后如要互通需迁移或适配。 | **采用。**仅为本轮实验范围，不代表生态优劣或市场结论。 |
| B. 直接采用 A2UI | 复用已有版本化协议、目录概念及生态定义，减少自定义结构的长期维护。 | 需将当前嵌套 tree、内联字段值、atomic replace/revision 转到 A2UI 消息流、扁平 ID 引用和 data model；调整模型 prompt、校验、renderer 与历史行为，并选择明确版本/catalog。 | 暂不采用；要在形成外部互操作需求后重新比较迁移成本。 |
| C. 保留原生格式并提供 A2UI adapter | 可以分阶段验证现有 API 同标准间的转换，避免立即改变本地消费端。 | 同时维护两套格式、转换损失和状态一致性；需覆盖生命周期、组件/functions/catalog、data binding、action、revision、streaming 和错误互操作矩阵。 | 本轮不做；需要具体消费者和可定义的互操作范围后再立项。 |

### 重新评估触发条件

- M1 真实模型闭环与诊断指标完成后，出现至少一个明确的外部 A2UI renderer/agent/产品集成需求。
- 首批开发者实验表明“不兼容现有 Agent UI 协议”是实际接入阻力，而非视觉或模型质量问题。
- A2UI v1.0 发布稳定版，或其 catalog/data/action 语义发生会影响转换的变更。
- 产品转向多个 renderer、agent framework 或需要协议级流式互操作。

重新评估时，先冻结互操作 profile 与版本，选一组代表性 surfaces/actions/data updates 做双向或单向转换测试，统计无损率、实现/维护代码量和故障行为，再决定直接采用或 adapter；在此之前不得在 README/API/产品文案声称兼容。
