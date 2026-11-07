---
kind: upgrade-guide
description: "Host plugins replying to Client inspection pass a SessionId instead of an Agent."
---

# Client inspection replies use Session identities

English | [中文](guide.zh.md)

## Change

`DynamicCordisRunnerService.resolveInspectQuery` takes `agentId: SessionId` instead of `agent: Agent`. Replies settle an existing request without activating its Session, including Sessions owned by Creator subagent routing. Session access checks and pending-request identity checks still apply.

The Remote endpoint remains `dynamicCordisRunner/resolveInspectQuery` with the same `agentId`, `requestId`, and `resolution` wire fields. Existing browser callers need no changes.

## Migration

1. In Host plugins that call `ctx.dynamicCordisRunner.resolveInspectQuery` directly, replace the first argument `agent` with `agent.id`. A caller that already holds the pending request's `agentId` passes it directly.
2. Compile the plugin and confirm that the acknowledgement accepts a pending request for that Session and rejects an unrelated or already settled request.
