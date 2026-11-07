---
kind: upgrade-guide
description: "回复 Client 检查的 Host 插件须传入 SessionId，而不是 Agent。"
---

# Client 检查回复使用 Session 身份

[English](guide.md) | 中文

## 变更

`DynamicCordisRunnerService.resolveInspectQuery` 的首个参数从 `agent: Agent` 改为 `agentId: SessionId`。回复直接完成已有请求，无须激活其 Session，因此也适用于 Creator 子代理路由管理的 Session。Session 访问检查和待处理请求的身份检查仍然生效。

Remote 端点仍为 `dynamicCordisRunner/resolveInspectQuery`，线协议字段仍为 `agentId`、`requestId` 和 `resolution`。现有浏览器调用方无须修改。

## 迁移

1. 在直接调用 `ctx.dynamicCordisRunner.resolveInspectQuery` 的 Host 插件中，将首个参数 `agent` 改为 `agent.id`。已持有待处理请求 `agentId` 的调用方直接传入该值。
2. 编译插件，确认回执接受该 Session 的待处理请求，并拒绝无关请求或已完成的请求。
