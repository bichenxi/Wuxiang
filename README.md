# 无相 Wuxiang

无相是一个 foundation 级的 Agent Interface Runtime：Agent 用受限的声明式协议描述当前 UI，runtime 校验并保存一个 surface 快照；用户操作以事件回到 Agent，下一份状态原子替换当前 surface。

## 启动

需要 Node.js 20 或更新版本。

```sh
npm install
npm run dev
```

浏览器打开 Vite 提供的本地地址。示例是一个本地 mock agent：旅行偏好表单会生成演示卡片和行程表，修改偏好会保留输入。它不连接模型或外部服务，不提供实时景点/酒店信息，也不会发起付款。

常用检查：

```sh
npm run build
npm run typecheck
npm test
npm run check
```

## 目录

- `packages/protocol`：版本为 `0.1` 的 JSON-safe surface/node/action 类型与严格校验器。首期组件包括 Text、Card、Stack、Button、Input、Select、Form、Table、Progress，并限制未知字段、未知组件、树深、节点数、字段/节点/选项/列的重复和总大小。
- `packages/runtime`：不依赖 React 的快照 runtime。它校验替换版本，拒绝过期或未声明事件，限制事件/快照历史，向读取方返回拷贝；replay 只返回只读拷贝，不执行外部动作。
- `packages/react`：注册表式 renderer，使用普通 React 元素和受控表单，不执行 AI 生成的 JS/HTML，也不使用 `dangerouslySetInnerHTML`。
- `examples/playground`：固定 shell + 动态 surface 的本地演示。

项目规划与技术决策见：

- [`docs/PROJECT_BRIEF.md`](docs/PROJECT_BRIEF.md)：项目定位、假设与成功指标
- [`docs/PRD.md`](docs/PRD.md)：M0 首期范围与验收标准
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)：分层、状态不变量与安全边界
- [`docs/API.md`](docs/API.md)：当前实际导出和最小闭环用法
- [`docs/ROADMAP.md`](docs/ROADMAP.md)：M1–M3 任务板
- [`docs/DECISIONS.md`](docs/DECISIONS.md)：架构决策记录

所有包均为 private，许可证暂为 `UNLICENSED`，当前不发布 npm 包。协议是无相自己的 foundation 实验，不宣称兼容 A2UI、MCP Apps 或其他协议。

## 当前范围

本仓库完成协议边界、runtime 快照/事件/回放、React renderer 和 mock 闭环。真实模型接入、网络数据、鉴权、付款、生产部署、外部动作执行和跨协议兼容均未实现。
