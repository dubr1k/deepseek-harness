import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { exec, execFileSync } from 'node:child_process';
import { WorkflowEngine } from './src/engine.js';
import { hash, handoffEvidence, handoffMarkdown, firecrawlCaptures, verifyQuotes, projectDocuments, gitSnapshot, recordMarkdown } from './src/evidence.js';
import { ViewRequests, canSaveHandoff, loadSavedMarkdown } from './src/ui-model.js';
import { Config, operationSchema, storageDomainSpec } from './src/index.js';

const copy = value => JSON.parse(JSON.stringify(value));
const defer = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const tick = () => new Promise(setImmediate);
class Table {
  constructor() { this.data = new Map(); this.before = null; }
  get(id) { return this.data.has(id) ? copy(this.data.get(id)) : undefined; }
  entries() { return [...this.data].map(([id,r]) => [id,copy(r)]).values(); }
  async put(id, record) { await this.before?.(id, record); this.data.set(id, copy(record)); }
}
const config = { checkTimeoutMs: 5000, outputMaxBytes: 262144, maxSessionEvents: 20000, reviewContextMaxChars: 120000, reviewerTool: 'reviewer_astra' };
async function fixture(run, git = false) {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'workflow-unit-')));
  try {
    if (git) { execFileSync('git', ['init','--initial-branch=main',root]); await fs.writeFile(path.join(root,'baseline.txt'),'base\n'); execFileSync('git',['-C',root,'add','.']); execFileSync('git',['-C',root,'-c','user.name=Fixture','-c','user.email=fixture@example.invalid','commit','-m','baseline']); }
    await run(root);
  } finally { assert.ok(root.startsWith(await fs.realpath(os.tmpdir()) + path.sep + 'workflow-unit-')); await fs.rm(root, { recursive: true, force: true }); }
}
function host(root, events = []) {
  const table = new Table(), guards = new Map(), interrupted = [], agents = new Map(); let engine;
  const parent = { id: 'root-session' }; agents.set(parent.id, parent);
  const ctx = {
    workspaceRegistry: { get: id => id === 'p' ? { id, title: 'Fixture', path: root } : undefined, list: () => [{ id: 'p', title:'Fixture',path:root }] },
    sessionQuery: { observeSession: async id => ({ header: { id, cwd: root }, events, [Symbol.dispose]() {} }), filterSessions: async () => [{ header:{id:'root-session',cwd:root},live:true }] },
    sessionController: { state: async () => ({ active:true,running:false }) }, agents: { get: id => agents.get(id) },
    subagents: { resolveName: async (caller, name) => { assert.equal(caller, parent); assert.equal(name, 'native-reviewer'); return 'native-child'; }, interrupt: (id, authority) => interrupted.push({id,authority}) },
    tools: { executable: (_name, scope) => { assert.equal(scope, parent); return {}; }, execute: async () => { throw new Error('Native reviewer unit adapter not installed.'); } },
    shell: { resolve: spec => spec, execute: async spec => ({ result: () => new Promise(resolve => {
      const start = Date.now();
      const childProcess = exec(spec.command, { cwd: spec.workdir, signal: spec.signal, timeout: spec.timeoutMs, maxBuffer: spec.stdoutMaxBytes, env:Object.fromEntries(Object.entries(process.env).filter(([key])=>!key.startsWith('NODE_TEST_'))), shell:'/bin/bash' }, (error, stdout, stderr) => resolve({ exitCode: Number.isInteger(error?.code) ? error.code : error ? null : 0, signal:error?.signal ?? null, timedOut:!!error?.killed && Date.now()-start >= spec.timeoutMs, aborted:!!spec.signal?.aborted, timeoutMs:spec.timeoutMs, stdout:{text:stdout,truncated:false},stderr:{text:stderr,truncated:false} }));
      childProcess.on('error', () => {});
    }) }) }
  };
  engine = new WorkflowEngine(ctx, table, config);
  return { ctx, table, engine, parent, agents, guards, interrupted };
}
const args = (action, rest = {}) => ({action,projectId:'p',sessionId:'root-session',...rest});
async function prepared(h) { const result = await h.engine.dispatch(args('prepare_review')); return result.record; }
async function settle(h) { await Promise.all([...h.engine.jobs.values()].map(op => op.completion)); await Promise.allSettled([...h.engine.pending]); }
function fakeReview(root) { return { id:'r',kind:'review',projectId:'p',projectTitle:'Fixture',projectPath:root,sessionId:'root-session',createdAt:new Date().toISOString(),state:'draft',git:{fingerprint:'fp',status:'M file',staged:'',unstaged:'diff',complete:true},docs:{documents:[],checks:[{id:'check',command:'node --check sample.mjs',source:'AGENTS.md:3'}]},checks:[],findings:[],caveats:[],stale:false }; }
function fastGit(h) { h.engine.git = async () => ({fingerprint:'fp',status:'M file',staged:'',unstaged:'diff',complete:true}); }
function nativeAdapter(h, onStart) {
  h.ctx.tools.execute = async () => {
    const child = { id:'native-child',ctx:{get:name => name === 'tools' ? {guard(fn){h.guards.set('native-child',fn);return ()=>h.guards.delete('native-child');}} : undefined,effect(fn){return fn();}} };
    h.agents.set(child.id,child);
    const info = {id:child.id,runId:'native-run',local:true,provider:'configured-native'};
    h.engine.childStarted(info); await onStart?.(info);
    return {results:[{result:{isError:false,value:{kind:'activation',name:'native-reviewer'}}}]};
  };
}
const ending = (rest={}) => ({id:'native-child',runId:'native-run',stopReason:'completed',lastAssistantMessage:[{type:'text',text:JSON.stringify({complete:true,findings:[{severity:'high',file:'sample.mjs',line:1,message:'Subtraction replaced addition.',caveat:'Bounded diff only.'}],caveats:[]})}],...rest});

test('privacy allowlist and terminal exit evidence reject stdout success spoofing', () => {
  const events = [
    {type:'user/message',seq:1,data:{content:[{type:'text',text:'Visible user'},{type:'reasoning',text:'PRIVATE_USER'}],private:'PRIVATE_META'}},
    {type:'assistant/message',seq:2,data:{message:{content:[{type:'text',text:'Visible assistant claim'},{type:'reasoning',text:'PRIVATE_REASONING'}],providerMetadata:'PRIVATE_PROVIDER'},stream:[{type:'reasoning-chunks',texts:['PRIVATE_STREAM']}] }},
    {type:'request/header',seq:3,data:{replay:'PRIVATE_REPLAY'}},
    {type:'tool/call',seq:4,data:{callId:'c',name:'bash',arguments:JSON.stringify({command:'node test.mjs'})}},
    {type:'tool/result',seq:5,data:{message:{toolCallId:'c',content:[{type:'text',text:'stdout: [exit code: 0]\nactual failure\n[exit code: 1]'}]}}}
  ];
  const evidence = handoffEvidence(events,{status:'unknown',fingerprint:'unknown'},{});
  assert.equal(evidence.checks[0].exitCode,1); assert.equal(evidence.checks[0].successEvidence,false);
  assert.ok(!JSON.stringify(evidence).includes('PRIVATE_'));
  events[4].data.message.content[0].text='stdout [exit code: 0]\nnot a terminal trailer';
  assert.equal(handoffEvidence(events,{},{}).checks[0].exitCode,null);
  events[4].data.meta={exitCode:2}; assert.equal(handoffEvidence(events,{},{}).checks[0].exitCode,2);
  assert.ok(handoffMarkdown(evidence).length < 7000);
});

test('bounded AGENTS checks discovery follows local fragments without executing or reading escaped/symlink files', () => fixture(async root => {
  await fs.mkdir(path.join(root,'docs')); await fs.writeFile(path.join(root,'AGENTS.md'),'# Guide\n[checks](docs/check.md#tests) [outside](../escape.md) [secret](secret.md)');
  await fs.writeFile(path.join(root,'docs/check.md'),'## Commands\n```bash\nnode --check sample.mjs\nnode --test sample.test.mjs\n```\n[cycle](../AGENTS.md)');
  await fs.writeFile(path.join(root,'secret.md'),'NEVER'); await fs.symlink(path.join(root,'secret.md'),path.join(root,'docs/alias.md'));
  const docs=await projectDocuments(root); assert.equal(docs.checks.length,2); assert.ok(docs.checks.every(c=>c.source.startsWith('docs/check.md:'))); assert.ok(!JSON.stringify(docs).includes('NEVER'));
}));

test('handoff works without Git and stores new immutable versions with unresolved next step', () => fixture(async root => {
  const h=host(root,[{type:'assistant/message',seq:1,data:{message:{content:[{type:'text',text:'Work reported.'}]}}}]);
  const draft=await h.engine.dispatch(args('handoff_preview')); assert.ok(draft.markdown.includes('Git unavailable'));
  const one=await h.engine.dispatch(args('handoff_save',{markdown:draft.markdown,nextStep:'Unknown'}));
  const two=await h.engine.dispatch(args('handoff_save',{id:one.record.id,markdown:'Edited version',nextStep:'Ask the owner.'}));
  assert.notEqual(one.record.id,two.record.id); assert.equal(h.table.get(one.record.id).markdown,draft.markdown); assert.equal(h.table.get(two.record.id).nextStep,'Ask the owner.');
  await assert.rejects(h.engine.dispatch(args('handoff_save',{markdown:'',nextStep:'Unknown'})),/required/); await h.engine.close();
}));

test('Git refuses a truncated diff instead of producing a partial fingerprint', () => fixture(async root => {
  let n=0; await assert.rejects(gitSnapshot(root,async()=>({exitCode:0,stdout:{text:++n===1?' M sample\0':'partial',truncated:n>1},stderr:{text:'',truncated:false}})),/no full fingerprint/);
},true));

test('actual safe fixture checks require explicit Run and retain real exit/time/fingerprint; changed diff is stale', () => fixture(async root => {
  await fs.writeFile(path.join(root,'sample.mjs'),'export const add=(a,b)=>a+b;\n');
  await fs.writeFile(path.join(root,'sample.test.mjs'),"import assert from 'node:assert/strict'; import {add} from './sample.mjs'; assert.equal(add(2,3),5);\n");
  await fs.writeFile(path.join(root,'AGENTS.md'),'## Commands\n```sh\nnode --check sample.mjs\nnode --test sample.test.mjs\n```');
  execFileSync('git',['-C',root,'add','.']);execFileSync('git',['-C',root,'-c','user.name=Fixture','-c','user.email=fixture@example.invalid','commit','-m','test fixture']);
  await fs.writeFile(path.join(root,'sample.mjs'),'export const add=(a,b)=>a-b;\n');
  const h=host(root); const r=await prepared(h); assert.equal(r.checks.length,0);
  await assert.rejects(h.engine.dispatch(args('run_checks',{id:r.id,checkIds:r.docs.checks.map(c=>c.id),fingerprint:r.git.fingerprint})),/confirmation/);
  assert.equal(h.engine.jobs.size,0);
  await h.engine.dispatch(args('run_checks',{id:r.id,checkIds:r.docs.checks.map(c=>c.id),fingerprint:r.git.fingerprint,confirm:true})); await settle(h);
  const completed=h.table.get(r.id); assert.equal(completed.state,'checks-completed'); assert.deepEqual(completed.checks.map(c=>c.exitCode),[0,1],JSON.stringify(completed.checks));
  assert.ok(completed.checks.every(c=>c.startedAt && c.endedAt && c.fingerprint===r.git.fingerprint));
  await fs.appendFile(path.join(root,'sample.mjs'),'// changed diff\n');
  assert.equal((await h.engine.dispatch(args('open',{id:r.id}))).record.stale,true);
  await assert.rejects(h.engine.dispatch(args('run_checks',{id:r.id,checkIds:[r.docs.checks[0].id],fingerprint:r.git.fingerprint,confirm:true})),/Diff changed/);
  await h.table.put(r.id, {...h.table.get(r.id), findings:[{severity:'medium',file:'sample.mjs',line:1,message:'Addition became subtraction',caveat:'Captured diff only'}]});
  const handoff=await h.engine.dispatch(args('handoff_preview')); assert.equal(handoff.evidence.workflow[0].current,'stale'); assert.deepEqual(handoff.evidence.workflow[0].checks.map(c=>c.exitCode),[0,1]);
  const issues=handoff.markdown.split('## Failures and unresolved issues')[1]; assert.match(issues,/sample.test.mjs; exit 1/); assert.match(issues,/Addition became subtraction/); assert.match(issues,/stale/);
  await h.engine.close();
},true));

test('concurrent Run is reserved before project/preflight await and cancel prevents later launch', () => fixture(async root => {
  await fs.writeFile(path.join(root,'AGENTS.md'),'## Checks\n```sh\nnode --check sample.mjs\n```');
  const h=host(root); const docs=await projectDocuments(root); const r=fakeReview(root); r.docs=docs; await h.table.put(r.id,r);
  const barrier=defer(); h.engine.git=async()=>{await barrier.promise;return r.git;}; let executed=0; h.engine.run=async()=>{executed++;return {};};
  const first=h.engine.dispatch(args('run_checks',{id:r.id,confirm:true,checkIds:[docs.checks[0].id],fingerprint:'fp'}));
  const rejected = assert.rejects(first,/cancelled/);
  const op=h.engine.jobs.get(r.id); assert.ok(op);
  await assert.rejects(h.engine.dispatch(args('run_checks',{id:r.id,confirm:true,checkIds:[docs.checks[0].id],fingerprint:'fp'})),/active/);
  await h.engine.dispatch(args('cancel',{id:r.id,confirm:true})); barrier.resolve();
  await rejected; await op.completion; assert.equal(executed,0); assert.equal(h.table.get(r.id).state,'cancelled'); await h.engine.close();
}));

test('cancelled command cannot be overwritten by late successful completion', () => fixture(async root => {
  await fs.writeFile(path.join(root,'AGENTS.md'),'## Checks\n```sh\nnode --check sample.mjs\n```');
  const h=host(root); fastGit(h); const r=fakeReview(root);r.docs=await projectDocuments(root); await h.table.put(r.id,r);
  const commandStarted=defer(), commandEnd=defer(); h.engine.run=async()=>{commandStarted.resolve(); await commandEnd.promise;return {exitCode:0,timedOut:false,aborted:false,stdout:{text:'late'},stderr:{text:''}};};
  await h.engine.dispatch(args('run_checks',{id:r.id,confirm:true,checkIds:[r.docs.checks[0].id],fingerprint:'fp'})); await commandStarted.promise;
  const op=h.engine.jobs.get(r.id); await h.engine.dispatch(args('cancel',{id:r.id,confirm:true})); commandEnd.resolve(); await op.completion;
  assert.equal(h.table.get(r.id).state,'cancelled'); assert.equal(h.engine.jobs.size,0); await h.engine.close();
}));

test('fast native end is retained before durable childId write; duplicate end is idempotent', () => fixture(async root => {
  const h=host(root); fastGit(h); await h.table.put('r',fakeReview(root));
  const barrier=defer(); h.table.before=async(_id,r)=>{if(r.childId) await barrier.promise;};
  nativeAdapter(h,info=>{h.engine.childEnded(ending());});
  const start=h.engine.dispatch(args('start_review',{id:'r',confirm:true,fingerprint:'fp'})); const op=h.engine.jobs.get('r'); await start;
  assert.equal(h.engine.childRuns.size,1); assert.ok(h.guards.has('native-child')); barrier.resolve(); await op.completion;
  assert.equal(h.table.get('r').state,'reviewed'); assert.equal(h.table.get('r').childId,'native-child'); assert.equal(h.table.get('r').findings.length,1);
  h.engine.childEnded(ending()); assert.equal(h.engine.guards.size,0); await h.engine.close();
}));

test('unload waits for owned native end and keeps guards until cancelled generation is terminal', () => fixture(async root => {
  const h=host(root); fastGit(h); await h.table.put('r',fakeReview(root)); nativeAdapter(h);
  await h.engine.dispatch(args('start_review',{id:'r',confirm:true,fingerprint:'fp'})); await tick();
  assert.equal(h.table.get('r').state,'reviewing'); const guard=h.guards.get('native-child'); assert.ok(guard);
  assert.ok(guard({name:'bash',arguments:{command:'touch nope'}}));
  let closed=false;const closing=h.engine.close().then(()=>{closed=true;}); await tick();
  assert.equal(closed,false); assert.ok(h.guards.has('native-child')); assert.equal(h.interrupted.length,1);
  h.engine.childEnded(ending({stopReason:'aborted',lastAssistantMessage:[]})); await closing;
  assert.equal(h.table.get('r').state,'cancelled'); assert.equal(h.guards.size,0);
}));

test('agent-tool review allows only its own running root; UI never resumes a cold root', () => fixture(async root => {
  const h=host(root);h.ctx.sessionController.state=async()=>({active:true,running:true});
  assert.equal(await h.engine.liveRoot({root},'root-session',undefined,h.parent),h.parent);
  await assert.rejects(h.engine.liveRoot({root},'root-session',undefined,{id:'child'}),/own root/);
  await assert.rejects(h.engine.liveRoot({root},'root-session'),/idle/);h.agents.clear();await assert.rejects(h.engine.liveRoot({root},'root-session'),/not live/);await h.engine.close();
}));

test('actual-result capture is exact, quotes verify against source and durable notes reopen/export', () => fixture(async root => {
  const content='This domain is for use in documentation examples without needing permission.';
  const events=[{type:'tool/call',seq:640,data:{name:'mcp__firecrawl__firecrawl_scrape',callId:'fc',arguments:'{"url":"https://example.com"}'}},{type:'tool/result',seq:641,time:Date.now(),data:{message:{toolCallId:'fc',content:[{type:'text',text:JSON.stringify({success:true,data:{markdown:content,metadata:{title:'Example Domain',sourceURL:'https://example.com'}}})}]}}}];
  // These are unit data only, not a claim of an actual configured MCP call.
  assert.equal(firecrawlCaptures(events)[0].content,content);assert.deepEqual(verifyQuotes(content,[content,'invented']).map(q=>q.verified),[true,false]);
  const h=host(root,events);const result=await h.engine.dispatch(args('note_save',{seq:641,notes:'My conclusion',questions:'What is this?',quotes:[content,'invented']}));
  const reopened=new WorkflowEngine(h.ctx,h.table,config);const opened=await reopened.dispatch(args('open',{id:result.record.id})); assert.equal(opened.record.source.url,'https://example.com/');assert.ok(opened.markdown.includes('Unverified'));assert.ok(opened.markdown.includes('My conclusion'));assert.ok(opened.markdown.includes('Retrieved:'));
  const saved=await reopened.dispatch(args('export',{id:result.record.id}));assert.ok(saved.markdown.includes(content));await reopened.close();await h.engine.close();
}));

test('UI request epochs reject late tab/source responses; empty drafts stay editable; saved copy reads storage', async () => {
  const requests=new ViewRequests();const first=requests.start();requests.invalidate();assert.equal(requests.accepts(first),false);assert.equal(first.controller.signal.aborted,true);
  const next=requests.start();assert.equal(requests.accepts(next),true);assert.equal(canSaveHandoff(true,'','Unknown'),false);assert.equal(canSaveHandoff(true,'Draft','Unknown'),true);
  let called;const saved=await loadSavedMarkdown(async args=>{called=args;return {markdown:'persisted'};},'p','r');assert.deepEqual(called,{action:'export',projectId:'p',id:'r'});assert.equal(saved.markdown,'persisted');
});

test('public schemas use valid installed storage unit names and bounded explicit actions', () => {
  const installedUnitNameRule = /^[a-z][a-z0-9_]*$/;
  assert.ok(installedUnitNameRule.test(storageDomainSpec.name));
  assert.ok(Object.keys(storageDomainSpec.tables).every(name => installedUnitNameRule.test(name)));
  assert.equal(installedUnitNameRule.test('dsh-workflow-tools'), false);
  assert.equal(storageDomainSpec.version, 1);
  assert.ok(operationSchema.properties.action.enum.includes('run_checks'));assert.equal(operationSchema.additionalProperties,false);assert.equal(Config['~standard'].validate({}).value.reviewerTool,'reviewer_astra');assert.ok(Config['~standard'].validate({checkTimeoutMs:0}).issues);
});


test('named rc.2 reviewer activation resolves to the guarded child', () => fixture(async root => {
  const h = host(root); fastGit(h); await h.table.put('r', fakeReview(root)); nativeAdapter(h);
  await h.engine.dispatch(args('start_review', { id:'r', confirm:true, fingerprint:'fp' })); await tick();
  try { assert.equal(h.table.get('r').state, 'reviewing'); assert.equal(h.table.get('r').childId, 'native-child'); }
  finally { h.engine.childEnded(ending()); await settle(h); await h.engine.close(); }
}));


test('mismatched named activation stops only its guarded child and rejects approval', () => fixture(async root => {
  const h = host(root); fastGit(h); await h.table.put('r', fakeReview(root)); nativeAdapter(h);
  h.ctx.subagents.resolveName = async () => 'unrelated-child';
  await h.engine.dispatch(args('start_review', { id:'r', confirm:true, fingerprint:'fp' })); await tick();
  try { assert.deepEqual(h.interrupted.map(call => call.id), ['native-child']); }
  finally { h.engine.childEnded(ending({stopReason:'aborted', lastAssistantMessage:[]})); await settle(h); await h.engine.close(); }
  assert.equal(h.table.get('r').state, 'failed');
  assert.deepEqual(h.table.get('r').findings, []);
}));
