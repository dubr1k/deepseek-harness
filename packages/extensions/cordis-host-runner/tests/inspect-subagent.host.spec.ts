import { afterEach, describe, expect, it } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import TypertGateway from '@deepseek-ai/dsh-api-gateway'
import RemoteAccess from '@deepseek-ai/dsh-api-remote-access'
import { Peer } from '@deepseek-ai/dsh-client-connection'
import TypertRegistry from '@deepseek-ai/dsh-typert-registry'
import type { CordisInspectQueryRequest } from '../src/types.ts'
import { AGENT_A, AGENT_B, setup } from './helpers.ts'

declare module '@deepseek-ai/dsh-typert-protocol' {
  interface PrincipalMap {
    /** Caller with no access to the pending query's Session. */
    'inspect-guest': { readonly kind: 'inspect-guest' }
  }
}

const roots: Context[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map(ctx => ctx.fiber.dispose()))
})

describe('Client inspect replies for Creator children', () => {
  it('settles an existing child query without activating its Session through ordinary routing', async () => {
    const { ctx, runner } = await setup({ clientInspectTimeoutMs: 10_000 })
    roots.push(ctx)
    await ctx.plugin(TypertRegistry)
    await ctx.plugin(RemoteAccess)
    await ctx.plugin(TypertGateway)
    ctx.typert.lookups.register('agent', {
      parameter: 'agent', wire: 'agentId', resource: 'session',
      hostTypeSymbol: '@deepseek-ai/dsh-agent#Agent',
      wireTypeSymbol: '@deepseek-ai/dsh-session/types#SessionId',
      resolve: (id) => { throw new Error(`session "${id}" is owned by subagent routing`) },
    })
    runner.syncInspectManifest([{
      id: 'Fixture', description: 'Client query fixture.',
      methods: [{ name: 'read', description: 'Read the Client fixture.', inputSchema: {}, outputSchema: { type: 'string' } }],
    }])
    let request: CordisInspectQueryRequest | undefined
    ctx.on('cordis/inspect-query', (value) => { request = value })
    const gateway = ctx.typertGateway
    ctx.effect(() => gateway.registerRemoteEvents(async function* (signal) {
      await new Promise<void>((resolve) => { signal.addEventListener('abort', () => { resolve() }, { once: true }) })
    }, { home: '/fixture' }))
    const peer = new Peer(ctx, { principal: { kind: 'owner' } })
    const connection = new AbortController()
    const stream = await gateway.wireStream.open('$events', { args: {} }, (async function* () {})(), peer, connection.signal)
    const iterator = stream[Symbol.asyncIterator]()
    await iterator.next()
    const query = ctx.cordisInspect.query('client', 'Fixture', 'read', {}, AGENT_A, connection.signal)
    const settled = query.then(value => ({ value }), (error: unknown) => ({ error }))
    expect(request).toBeDefined()
    const call = (agentId: typeof AGENT_A.id, caller = peer) => gateway.invoke({
      peer: caller, namespace: 'dynamicCordisRunner', method: 'resolveInspectQuery',
      args: { agentId, requestId: request!.requestId, resolution: { ok: true, data: 'client-result' } },
    })
    try {
      ctx.remoteAccess.registerPolicy('inspect-guest', { bindings: () => [{
        role: { name: 'inspect-session', resource: 'session', actions: ['dynamicCordisRunner/resolveInspectQuery'] },
        resource: { kind: 'session', id: AGENT_A.id },
      }] })
      const guest = new Peer(ctx, { principal: { kind: 'inspect-guest' } })
      await expect(gateway.invoke({
        peer: guest, namespace: 'dynamicCordisRunner', method: 'resolveInspectQuery',
        args: { agentId: AGENT_B.id, requestId: request!.requestId, resolution: { ok: true, data: 'unauthorized' } },
      })).rejects.toMatchObject({ code: 'remote-access/denied' })
      await expect(call(AGENT_B.id)).resolves.toEqual({ accepted: false })
      await expect(call(AGENT_A.id, guest)).resolves.toEqual({ accepted: true })
      expect(await settled).toEqual({ value: 'client-result' })
      await expect(call(AGENT_A.id)).resolves.toEqual({ accepted: false })
    } finally {
      connection.abort()
      await iterator.return?.()
      await settled
    }
  })
})
