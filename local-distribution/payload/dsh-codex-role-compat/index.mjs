/** Preserve role restrictions across Agent creation, preset selection and teardown. */
export const name = 'codex-role-policy'
export const inject = ['agentPresets', 'tools', 'agents']
export function apply(ctx, config) {
  if (typeof config.presetId !== 'string' || !Array.isArray(config.allow)
    || config.allow.some(value => typeof value !== 'string')) throw new Error('Invalid Codex role policy')
  const applied = new Map()
  const remove = agent => { applied.get(agent)?.(); applied.delete(agent) }
  const ensure = agent => {
    if (ctx.agentPresets.composedPreset(agent.ctx) !== config.presetId) { remove(agent); return }
    if (!applied.has(agent)) {
      applied.set(agent, agent.ctx.tools.restrict({ allow: config.allow }))
      agent.ctx.effect(() => () => { applied.delete(agent) })
    }
  }
  ctx.effect(() => () => { for (const dispose of applied.values()) dispose(); applied.clear() })
  ctx.on('agent/created', ({ agent }) => ensure(agent))
  ctx.on('agent-preset/selected', sessionId => {
    const agent = ctx.agents.get(sessionId)
    if (agent !== undefined) ensure(agent)
  })
  ctx.on('agent/pre-step', ({ agent }, next) => { ensure(agent); return next() })
  ctx.on('agent/disposed', ({ agent }) => remove(agent))
}
