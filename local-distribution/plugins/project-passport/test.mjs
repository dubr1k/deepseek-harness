import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { runInNewContext } from 'node:vm';
import { collect } from './src/data.js';
import { apply, inject } from './src/index.js';

async function fixture(run) {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'passport-')));
  try { await run(root); } finally { await fs.rm(root, { recursive: true, force: true }); }
}
test('empty directory and missing Git return explicit empty sections', () => fixture(async root => {
  const data = await collect({ path: root, title: 'Empty' });
  assert.equal(data.purpose, null); assert.equal(data.git, null); assert.deepEqual(data.files, []); assert.ok(data.updatedAt);
}));
test('reads bounded allowlist and open plan tasks without following links', () => fixture(async root => {
  await fs.writeFile(path.join(root, 'package.json'), JSON.stringify({ description: 'Real description', scripts: { dev: 'vite', test: 'node --test', deploy: 'publish', check: 'TOKEN=secret command' } }));
  await fs.writeFile(path.join(root, 'README.md'), '# Demo\n\nPurpose text.');
  await fs.writeFile(path.join(root, 'PLAN.md'), '- [ ] Open task\n- [x] Closed task');
  await fs.writeFile(path.join(root, '.env'), 'SECRET=never');
  await fs.mkdir(path.join(root, 'docs'));
  await fs.symlink(path.join(root, '.env'), path.join(root, 'docs', 'README.md'));
  await fs.writeFile(path.join(root, 'TODO.md'), 'x'.repeat(25000));
  await fs.writeFile(path.join(root, 'docs', 'usage.md'), '# Запуск\n```sh\n$ python app.py\n```\n# Deployment\n```sh\ndeploy production\n```');
  const data = await collect({ path: root, title: 'Demo' });
  assert.equal(data.purpose, 'Real description'); assert.equal(data.purposeSource, 'package.json → description');
  assert.deepEqual(data.commands.map(c => c.command), ['python app.py', 'npm run dev', 'npm run test']);
  assert.equal(data.commands[0].source, 'docs/usage.md:2');
  assert.equal(data.documentation.length, 2); assert.equal(data.tasks.length, 1); assert.equal(data.tasks[0].line, 1);
  assert.ok(!data.files.includes('.env')); assert.ok(!data.files.includes('docs/README.md')); assert.ok(data.notices.length);
}));
test('UI copy is English while extracted document language is preserved', () => fixture(async root => {
  for (const file of ['src/client.js', 'src/index.js', 'locale/ru.json', 'locale/en.json']) {
    assert.ok(!/[А-Яа-яЁё]/.test(await fs.readFile(file, 'utf8')), file);
  }
  const dataSource = await fs.readFile('src/data.js', 'utf8');
  const cyrillicLines = dataSource.split('\n').filter(line => /[А-Яа-яЁё]/.test(line));
  assert.ok(cyrillicLines.every(line => line.includes('purposeHeading =') || line.includes('accept:')), 'Cyrillic is only in document heading matchers');
  await fs.writeFile(path.join(root, 'AGENTS.md'), '# Проект\n\nИсходное назначение.\n\n- [ ] Исходная задача');
  const data = await collect({ path: root, title: 'Project' });
  assert.equal(data.purpose, 'Исходное назначение.'); assert.equal(data.tasks[0].text, 'Исходная задача');
  assert.equal(JSON.parse(await fs.readFile('locale/ru.json')).meta.title, 'Project Passport');
}));
test('Commands and Команды headings expose explicitly marked shell blocks with sources', () => fixture(async root => {
  await fs.writeFile(path.join(root, 'AGENTS.md'), '# Project\n\nProject purpose.\n\n## Commands\n```bash\npnpm run build\npnpm run test\n```\n\n## Команды\n```sh\npnpm run lint\n```\n\n## Examples\n```bash\nnot-a-project-command\n```');
  const data = await collect({ path: root, title: 'Commands regression' });
  assert.deepEqual(data.commands.map(command => command.command), ['pnpm run build\npnpm run test', 'pnpm run lint']);
  assert.deepEqual(data.commands.map(command => command.source), ['AGENTS.md:6', 'AGENTS.md:12']);
}));
test('AGENTS and linked documents precede fallback sources and retain source lines', () => fixture(async root => {
  await fs.mkdir(path.join(root, 'guide'));
  await fs.writeFile(path.join(root, 'AGENTS.md'), '# Project\n\nAuthoritative purpose.\n\n[Guide](guide/run.md#commands)\n\n## Запуск\n```sh\npython primary.py\n```\n- [ ] Primary task');
  await fs.writeFile(path.join(root, 'guide', 'run.md'), '[Back](../AGENTS.md#project)\n## Проверка\n```bash\npytest\n```\n- [ ] Linked task');
  await fs.writeFile(path.join(root, 'README.md'), '# Demo\n\nFallback purpose.\n## Запуск\n```sh\nnode fallback.js\n```');
  await fs.writeFile(path.join(root, 'package.json'), JSON.stringify({ description: 'Manifest purpose', scripts: { test: 'node --test' } }));
  const data = await collect({ path: root, title: 'Priority' });
  assert.equal(data.purpose, 'Authoritative purpose.'); assert.equal(data.purposeSource, 'AGENTS.md:3');
  assert.deepEqual(data.commands.map(c => c.command), ['python primary.py', 'pytest', 'node fallback.js', 'npm run test']);
  assert.equal(data.commands[0].source, 'AGENTS.md:8'); assert.equal(data.commands[1].source, 'guide/run.md:3');
  assert.deepEqual(data.tasks.map(t => [t.text, t.file]), [['Primary task', 'AGENTS.md'], ['Linked task', 'guide/run.md']]);
  assert.equal(data.documentation.filter(doc => doc.file === 'AGENTS.md').length, 1);
}));
test('linked traversal, network URLs, symlinks, secrets and oversized files are excluded', () => fixture(async container => {
  const root = path.join(container, 'project'); await fs.mkdir(root);
  await fs.writeFile(path.join(container, 'outside.md'), 'OUTSIDE CONTENT');
  await fs.writeFile(path.join(root, 'secret.md'), 'SECRET CONTENT');
  await fs.writeFile(path.join(root, 'large.md'), 'X'.repeat(25000));
  await fs.symlink(path.join(container, 'outside.md'), path.join(root, 'alias.md'));
  await fs.symlink(container, path.join(root, 'linked'));
  await fs.mkdir(path.join(root, '.agents'));
  await fs.writeFile(path.join(root, '.agents', 'guide.md'), '## Purpose\n\nLinked purpose.');
  await fs.writeFile(path.join(root, 'AGENTS.md'), '# Guide\n\n[Outside](../outside.md) [Encoded](%2e%2e/outside.md) [File](file:///etc/passwd) [Remote](https://example.com/readme.md) [Alias](alias.md) [Directory](linked/outside.md) [Secret](secret.md) [Big](large.md) [Good](.agents/guide.md#purpose)');
  const data = await collect({ path: root, title: 'Bounds' });
  assert.equal(data.purpose, 'Linked purpose.');
  assert.deepEqual(data.documentation.map(doc => doc.file), ['AGENTS.md', '.agents/guide.md']);
  assert.ok(!JSON.stringify(data).includes('OUTSIDE CONTENT')); assert.ok(!JSON.stringify(data).includes('SECRET CONTENT'));
}));
test('missing AGENTS is explicit and the link document budget is enforced', () => fixture(async root => {
  const empty = await collect({ path: root, title: 'Missing' }); assert.ok(empty.notices.some(note => note.includes('AGENTS.md not found')));
  await fs.writeFile(path.join(root, 'AGENTS.md'), '# Links\n' + Array.from({ length: 20 }, (_, i) => `[D${i}](d${i}.md)`).join(' '));
  for (let i = 0; i < 20; i++) await fs.writeFile(path.join(root, `d${i}.md`), `# Doc ${i}`);
  const data = await collect({ path: root, title: 'Limit' }); assert.equal(data.documentation.length, 12);
}));
test('Git reports a real branch and tracked changes without file contents', () => fixture(async root => {
  execFileSync('git', ['init', '--initial-branch=passport-test', root]);
  await fs.writeFile(path.join(root, 'README.md'), 'Test project');
  execFileSync('git', ['-C', root, 'add', 'README.md']);
  const data = await collect({ path: root, title: 'Git fixture' });
  assert.ok(data.git.branch.includes('passport-test')); assert.equal(data.git.trackedChanges, 1);
  assert.ok(!JSON.stringify(data.git).includes('README.md'));
}));
test('Client uses the same-origin authenticated API route for list and selection', async () => {
  let module, Page, dictionary; const calls = [], pending = [], states = [];
  const React = { createElement: (type, props, ...children) => ({ type, props, children }), useState(initial) { const slot = states.length; states.push(initial); return [initial, value => { states[slot] = value; }]; }, useRef: initial => ({ current: initial }), useEffect: effect => { effect(); } };
  runInNewContext(await fs.readFile('src/client.js', 'utf8'), { window: { __ModuleLoader__: { load(value) { module = value.factory(name => { if (name === '@deepseek-ai/dsh-client-ui-primitives') return { MarkdownText: function MarkdownText() {} }; assert.equal(name, 'react'); return React; }); } } }, AbortController, fetch(url, options) { calls.push({ url, options }); const result = Promise.resolve(Response.json(url.includes('?') ? { title: 'Real project', path: '/registered' } : { projects: [{ id: 'one', title: 'Real project', path: '/registered' }] })); pending.push(result); return result; } });
  const ctx = { effect(fn) { fn(); }, layout: { selectPanel() {} }, locale: { register(_id, _lang, words) { dictionary = words; return () => {}; }, bind() { return key => dictionary[key]; } }, slots: { inject(_name, fn) { fn(); }, register(options, component) { if (options.name === 'main') Page = component; return () => {}; } } };
  module.apply(ctx); const tree = Page(); await Promise.all(pending); await new Promise(setImmediate);
  const route = '/api/project-passport-16f6f54d-d6b2-4f85-81f1-515c5a10dc8b';
  assert.equal(calls[0].url, route); assert.equal(calls[0].options.method, 'GET'); assert.equal(calls[0].options.credentials, 'same-origin'); assert.ok(calls[0].options.signal instanceof AbortSignal);
  assert.equal(states[0][0].id, 'one');
  function find(node, type) { if (!node || typeof node !== 'object') return null; if (node.type === type) return node; for (const child of node.children ?? []) { const found = find(child, type); if (found) return found; } return null; }
  find(tree, 'select').props.onChange({ target: { value: 'one' } }); await Promise.all(pending); await new Promise(setImmediate);
  assert.equal(calls[1].url, route + '?id=one'); assert.equal(states[2].path, '/registered');
});
test('exact Connection route validates selections and disposes without manual identity handling', () => fixture(async root => {
  assert.deepEqual(inject, ['workspaceRegistry', 'connection']);
  const effects = []; let route, removed = false;
  const project = { id: 'one', title: 'One', path: root };
  const ctx = { effect(fn) { const dispose = fn(); effects.push(dispose); }, connection: { fetch: { register(value) { route = value; return async () => { removed = true; }; } } }, workspaceRegistry: { list: () => [project], get: id => id === 'one' ? project : undefined } };
  apply(ctx);
  assert.equal(route.path, '/api/project-passport-16f6f54d-d6b2-4f85-81f1-515c5a10dc8b'); assert.deepEqual(route.methods, ['GET']); assert.equal(route.requestBody, 'buffered');
  const request = suffix => new Request('http://localhost' + route.path + suffix);
  assert.equal((await route.fetch(request('?id=../../etc'))).status, 404);
  for (const suffix of ['?id=', '?id=one&id=two', '?path=/etc', '?id=' + 'a'.repeat(201)]) assert.equal((await route.fetch(request(suffix))).status, 400);
  assert.equal((await (await route.fetch(request(''))).json()).projects.length, 1);
  assert.equal((await (await route.fetch(request('?id=one'))).json()).path, root);
  assert.equal((await route.fetch(new Request('http://localhost' + route.path, { method: 'POST' }))).status, 405);
  const aborted = new AbortController(); aborted.abort();
  assert.equal((await route.fetch(new Request('http://localhost' + route.path + '?id=one', { signal: aborted.signal }))).status, 400);
  for (const dispose of effects.reverse()) await dispose();
  assert.ok(removed); assert.equal((await route.fetch(request(''))).status, 503);
}));
