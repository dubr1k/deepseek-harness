import { z } from 'zod';
import { WorkflowEngine } from './engine.js';

export const inject = ['workspaceRegistry', 'sessionQuery', 'sessionController', 'shell', 'tools', 'agents', 'subagents', 'storageDomain', 'connection'];
const defaults = { checkTimeoutMs: 60000, outputMaxBytes: 262144, maxSessionEvents: 20000, reviewContextMaxChars: 120000, reviewerTool: 'reviewer_astra' };
/** Standard Schema validation keeps operational limits configurable without private imports. */
export const Config = { '~standard': { version: 1, vendor: 'dsh-workflow-tools', validate(input) {
  const result = { ...defaults, ...(input ?? {}) };
  if (typeof input !== 'object' || input === null || Array.isArray(input) || Object.keys(result).some(key => !(key in defaults))) return { issues: [{ message: 'Invalid workflow tools configuration.' }] };
  for (const key of ['checkTimeoutMs','outputMaxBytes','maxSessionEvents','reviewContextMaxChars']) if (!Number.isSafeInteger(result[key]) || result[key] < 1000 || result[key] > ({checkTimeoutMs:300000,outputMaxBytes:1048576,maxSessionEvents:100000,reviewContextMaxChars:250000})[key]) return { issues: [{ message: `Invalid ${key}.` }] };
  if (typeof result.reviewerTool !== 'string' || !/^[a-zA-Z][\w-]{0,80}$/.test(result.reviewerTool)) return { issues: [{ message: 'Invalid reviewer tool name.' }] };
  return { value: result };
} } };

export const operationSchema = {
  type: 'object', additionalProperties: false,
  properties: {
    action: { type: 'string', enum: ['projects','sessions','records','open','export','handoff_preview','handoff_save','prepare_review','run_checks','start_review','cancel','firecrawl_sources','capture_preview','note_save'] },
    projectId: { type: 'string', maxLength: 200 }, sessionId: { type: 'string', maxLength: 200 }, id: { type: 'string', maxLength: 200 },
    markdown: { type: 'string', maxLength: 200000 }, nextStep: { type: 'string', maxLength: 2000 }, fingerprint: { type: 'string', maxLength: 64 },
    checkIds: { type: 'array', maxItems: 20, items: { type: 'string', maxLength: 64 } }, confirm: { type: 'boolean' },
    seq: { type: 'integer', minimum: 0 }, notes: { type: 'string', maxLength: 50000 }, questions: { type: 'string', maxLength: 10000 },
    quotes: { type: 'array', maxItems: 30, items: { type: 'string', maxLength: 10000 } }
  }, required: ['action']
};
const requestSchema = z.object({ action: z.enum(operationSchema.properties.action.enum), projectId: z.string().max(200).optional(), sessionId: z.string().max(200).optional(), id: z.string().max(200).optional(), markdown: z.string().max(200000).optional(), nextStep: z.string().max(2000).optional(), fingerprint: z.string().max(64).optional(), checkIds: z.array(z.string().max(64)).max(20).optional(), confirm: z.boolean().optional(), seq: z.number().int().nonnegative().optional(), notes: z.string().max(50000).optional(), questions: z.string().max(10000).optional(), quotes: z.array(z.string().max(10000)).max(30).optional() }).strict();
const recordSchema = z.object({ id: z.string(), kind: z.enum(['handoff','review','note']), projectId: z.string(), projectTitle: z.string(), projectPath: z.string(), sessionId: z.string(), createdAt: z.string() }).passthrough();

/** Storage names follow the installed UNIT_NAME_RE: lowercase SQL-safe identifiers. */
export const storageDomainSpec = { name: 'dsh_workflow_tools', version: 1, layout: 'per-record', tables: { records: { valueSchema: recordSchema } } };

async function boundedJson(request) {
  if (request.headers.get('content-type')?.split(';')[0].trim() !== 'application/json') throw new Error('Expected application/json.');
  const reader = request.body?.getReader(); if (!reader) throw new Error('Missing request body.');
  const chunks = []; let size = 0;
  try { while (true) { const next = await reader.read(); if (next.done) break; size += next.value.length; if (size > 400000) { await reader.cancel(); throw new Error('Request exceeds 400 KB.'); } chunks.push(next.value); } }
  finally { reader.releaseLock(); }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

/** Mount only this bundle's routes, operation tool and native reviewer listeners. */
export async function apply(ctx, config) {
  const validated = Config['~standard'].validate(config ?? {}); if (validated.issues) throw new Error(validated.issues[0].message);
  const domain = await ctx.storageDomain.open(storageDomainSpec);
  const engine = new WorkflowEngine(ctx, domain.table('records'), validated.value);
  ctx.effect(() => {
    const offStart = ctx.root.on('subagent/start', info => engine.childStarted(info));
    const offEnd = ctx.root.on('subagent/end', info => engine.childEnded(info));
    return async () => { await engine.close(); offStart(); offEnd(); await domain.close(); };
  });
  await engine.recover();
  const dispatch = (args, signal, caller) => engine.dispatch(requestSchema.parse(args), signal, caller);
  ctx.effect(() => ctx.tools.register({
    name: 'workspace_tools',
    description: 'Evidence-based project handoff, pre-commit review and Firecrawl research capture. Select project/session explicitly. Read-only preview/prepare never runs checks. run_checks requires selected captured checkIds, fingerprint and confirm:true for an explicit user Run. start_review requires explicit user consent and a live idle ROOT session, uses only the configured native read-only reviewer. Save creates a new durable record; export returns Markdown without overwriting files. Never auto commit, push, fix, resume a conversation or fetch a source. Notebook captures actual successful Firecrawl results from the selected conversation.',
    parameters: operationSchema,
    output: { schema: { type: 'object', additionalProperties: true }, render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }] },
    isConcurrencySafe: args => ['projects','sessions','records','open','export','firecrawl_sources'].includes(args.action),
    execute: (args, execution) => dispatch(args, execution.signal, execution.agent)
  }));
  ctx.effect(() => ctx.connection.fetch.register({ path: '/api/dsh-workflow-tools', methods: ['POST'], requestBody: 'buffered', fetch: async request => {
    const headers = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
    try { return Response.json(await dispatch(await boundedJson(request), request.signal), { headers }); }
    catch (error) { return Response.json({ error: error instanceof z.ZodError ? 'Invalid workflow request.' : error.message || 'Workflow operation failed.' }, { status: 400, headers }); }
  } }));
}
