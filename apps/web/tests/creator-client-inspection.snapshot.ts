/** A real Creator child receives the live browser's inspect reply without ordinary Session activation. */
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { expect, it } from 'vitest'
import type { Session } from '@deepseek-ai/dsh-session'
import { prepareSessionSnapshotFixtureForComparison } from '@deepseek-ai/dsh-llm-replay'
import {
  fixtureContext, normalizeSessionSnapshots, normalizedSystemPrompts, normalizedToolSchemas,
  formatSystemPromptSnapshot, formatToolSchemasSnapshot, parseToolSchemasSnapshot,
  redactSessionSnapshotIds, refreshFixtureReplacements, scrubSessionSnapshot,
  stabilizeFixtureMessageIds, stabilizeRefreshLog, tokenizeSessionFixtureCwd,
} from '@deepseek-ai/dsh-session-snapshot'
import type {} from '@deepseek-ai/dsh-subagent'
import type {} from '@deepseek-ai/dsh-cordis-host-runner'
import {
  fixtureUserPrompts, launchWebScaffold, normalizeWebSessionVolatiles, rawSessionLog,
  readPersistedEvents, recordedSessionFixturePath, selectedSessionFixture, webSnapshotMode,
} from './scaffold.ts'
import { connectFreshWorkspace, newEnglishPage, REPO_ROOT } from './support.ts'

const DIR = fileURLToPath(new URL('../../../snapshots/web/creator-client-inspection', import.meta.url))
const MODE = webSnapshotMode()

it.skipIf(MODE === 'record')('delivers live Client inspection to a spawned Creator in the shipped Web composition', async () => {
  const paths = await Promise.all(['session.v4.jsonl', 'session.1.v4.jsonl']
    .map(file => selectedSessionFixture(join(DIR, file))))
  let expected = await Promise.all(paths.map(path => readFile(path, 'utf8')))
  const scaffold = await launchWebScaffold({
    replayFixture: paths[0]!, replayChildFixtures: [paths[1]!], compareReplaySession: false,
  })
  const browser = await chromium.launch()
  try {
    const sessions: Session[] = []
    scaffold.ctx.on('session/created', (session) => { sessions.push(session) })
    const page = await newEnglishPage(browser)
    await page.goto(scaffold.authenticatedUrl, { waitUntil: 'load' })
    await connectFreshWorkspace(page, scaffold.workspaceCwd)
    await expect.poll(() => scaffold.ctx.cordisInspect.list().some(
      provider => provider.platform === 'client' && provider.id === 'Slots',
    )).toBe(true)
    const settled = scaffold.whenTurnSettled()
    const input = page.locator('[data-composer-input]').first()
    await input.fill(fixtureUserPrompts(expected[0]!)[0]!)
    await input.press('Enter')
    const parent = scaffold.ctx.agents.get(await settled)
    if (parent === undefined) throw new Error('created parent has no Agent')
    const activation = await scaffold.ctx.subagents.startActivation({
      provider: 'spawn', label: 'Inspect Client from Creator', delivery: 'caller',
      signal: new AbortController().signal, parent, agentPreset: 'cordis',
      prompt: [{ type: 'text', text: 'Query Client Slots.listSubTree with root creator-regression-missing-slot, then reply CLIENT_INSPECTION_DONE.' }],
    })
    try {
      await activation.result
    } finally {
      await activation.dispose()
    }
    expect(sessions).toHaveLength(2)
    const child = sessions[1]!
    expect(child.header).toMatchObject({ parentSession: parent.id, origin: 'subagent', agentPreset: 'cordis' })
    const results = child.snapshotEvents().filter(event => event.type === 'tool/result')
    expect(results).toHaveLength(1)
    expect(results[0]!.data.message.isError).toBe(false)
    const content = results[0]!.data.message.content[0]!
    if (content.type !== 'text') throw new Error('inspect reply must contain text')
    expect(JSON.parse(content.text)).toEqual({
      platform: 'client', provider: 'Slots', method: 'listSubTree',
      data: { requestedRoot: { name: 'creator-regression-missing-slot', available: false }, trees: [], referencedTypes: [] },
    })
    await scaffold.ctx.sessions.flush(parent.session)
    for (const session of sessions) {
      expect(await readPersistedEvents(scaffold, session.id)).toEqual(session.snapshotEvents())
    }
    const raw = sessions.map(session => normalizeWebSessionVolatiles(rawSessionLog(session), scaffold.workspaceCwd))
    const context = { sessionIds: sessions.map(session => String(session.id)), cwd: scaffold.workspaceCwd }
    for (const [index, log] of raw.entries()) {
      const pin = index === 0 ? join(DIR, '../fresh-round-trip') : DIR
      const suffix = index === 0 ? '' : '.1'
      const schemas = normalizedToolSchemas(log, context)
      const prompts = normalizedSystemPrompts(log, context)
      expect(schemas.length).toBeGreaterThan(0)
      expect(prompts).toHaveLength(1)
      const schemaPath = join(pin, `tool-schemas${suffix}.expected.json`)
      const promptPath = join(pin, `system-prompt${suffix}.expected.md`)
      const prompt = formatSystemPromptSnapshot(prompts[0]!.split(REPO_ROOT).join('{{sourceRoot}}')
        .split(scaffold.baseUrl).join('{{webUrl}}'))
      if (MODE === 'refresh' && index === 1) {
        await writeFile(schemaPath, formatToolSchemasSnapshot(schemas[0]!, schemas.slice(1)))
        await writeFile(promptPath, prompt)
      }
      const schemaPin = parseToolSchemasSnapshot(await readFile(schemaPath, 'utf8'))
      expect(schemas).toEqual([schemaPin.initial, ...schemaPin.changes])
      expect(prompt).toBe(await readFile(promptPath, 'utf8'))
    }
    if (MODE === 'refresh') {
      const replacements = refreshFixtureReplacements(raw.map((content, index) => ({
        id: sessions[index]!.id, createdAt: sessions[index]!.header.createdAt, content,
      })), expected)
      expected = redactSessionSnapshotIds(stabilizeFixtureMessageIds(raw.map((log, index) =>
        tokenizeSessionFixtureCwd(scrubSessionSnapshot(stabilizeRefreshLog(
          prepareSessionSnapshotFixtureForComparison(log), expected[index]!, replacements, context,
        ))).split(scaffold.harnessHome).join('{{harnessHome}}')), expected))
      await Promise.all(expected.map((log, index) => writeFile(
        recordedSessionFixturePath(paths[index]!, sessions[index]!.header.version), log,
      )))
    }
    expect(normalizeSessionSnapshots(raw, context))
      .toEqual(normalizeSessionSnapshots(expected, fixtureContext(expected[0]!)))
  } finally {
    await browser.close()
    await scaffold.close()
  }
})
