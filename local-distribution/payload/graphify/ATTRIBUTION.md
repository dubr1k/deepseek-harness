# Sources and adaptation boundary

This is an independently written local DSH instruction adapter. It does not vendor the Graphify implementation or replace the shared upstream skill. It is not endorsed as an official Graphify/DSH plugin. Installed CLI examined: graphifyy **0.9.72**.

Canonical project: https://github.com/Graphify-Labs/graphify . The active documentation branch examined was **v8**, not the outdated main-branch README. Documentation snapshot consulted: **b57cf9108ea3ae571f3e6b3f5dff7de900750127** (this identifies the consulted documentation tip, not a claim that the installed wheel was built from that exact commit).

- [README](https://github.com/Graphify-Labs/graphify/blob/b57cf9108ea3ae571f3e6b3f5dff7de900750127/README.md)
- [Native AGENTS template](https://github.com/Graphify-Labs/graphify/blob/b57cf9108ea3ae571f3e6b3f5dff7de900750127/graphify/always_on/agents-md.md)
- [Query and memory documentation](https://github.com/Graphify-Labs/graphify/blob/b57cf9108ea3ae571f3e6b3f5dff7de900750127/graphify/skills/agents/references/query.md)
- [Hooks documentation](https://github.com/Graphify-Labs/graphify/blob/b57cf9108ea3ae571f3e6b3f5dff7de900750127/graphify/skills/agents/references/hooks.md)

Installed implementation was checked where prose and behavior diverged: auto-refresh in __main__.py; CLI query cache stamps and exact flags in cli.py; query logging in querylog.py; MCP in serve.py; memory/reflection writes in ingest.py and reflect.py; detached rebuild/checkout/merge-driver behavior in hooks.py.

Deliberate differences:

- Native DSH tools/roles replace foreign Task/Agent/runtime recipes; no recursive fan-out.
- Existing graph first for relevant relationship questions, but no unconditional graph build for a simple task.
- Precise project roots and explicit graph/memory/output paths; no accidental global/test graph selection.
- Original source verification, freshness uncertainty, and honest inferred-edge handling.
- CLI auto-refresh/query logging suppressed per call; cache-stamp writes disclosed; strict read-only roles use native file tools.
- No automatic API selection, installs, hooks/watch, memory writes, exports or updates after every edit.
- AST-only CLI and host-agent semantic extraction are distinct; missing DSH usage metadata is not fabricated.
- Skill discovery does not imply MCP connectivity or approval-policy integration.

Upstream updates may change commands/behavior. Check installed version and revalidate rather than silently reinstalling or applying another client's bootstrap.
