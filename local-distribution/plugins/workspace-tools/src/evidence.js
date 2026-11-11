import * as fs from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

export const hash = value => createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
export const textOf = blocks => (Array.isArray(blocks) ? blocks : []).filter(block => block?.type === 'text' && typeof block.text === 'string').map(block => block.text).join('\n');
export const sensitive = value => value.split(/[\\/]/).some(part => /^(?:\.env.*|\.git|\.ssh|\.credentials.*)$|secret|credential|password|private|(?:\.pem|\.key|\.p12|\.pfx)$|id_rsa|id_ed25519/i.test(part));
export function assertText(value, name, max = 200000) { if (typeof value !== 'string' || value.length > max) throw new Error(`Invalid ${name}.`); return value; }
export const quote = value => `'${value.replace(/'/g, `'"'"'`)}'`;

/** Bounded, linked Markdown extraction; document text never executes here. */
export async function projectDocuments(root, signal) {
  const documents = [], seen = new Set(); let bytes = 0;
  async function visit(relative, depth) {
    if (seen.has(relative) || seen.size >= 12 || depth > 2 || sensitive(relative)) return;
    seen.add(relative); signal?.throwIfAborted();
    const absolute = path.resolve(root, relative);
    if (!absolute.startsWith(root + path.sep)) return;
    if (relative.split('/').some(part => part.startsWith('.') && part !== '.agents')) return;
    let handle;
    try {
      if (await fs.realpath(path.dirname(absolute)) !== path.dirname(absolute)) return;
      handle = await fs.open(absolute, constants.O_RDONLY | constants.O_NOFOLLOW);
      const stat = await handle.stat(); if (!stat.isFile() || stat.size > 24576 || bytes + stat.size > 98304) return;
      const buffer = Buffer.alloc(stat.size + 1); const read = await handle.read(buffer, 0, buffer.length, 0);
      if (read.bytesRead > stat.size) return;
      bytes += read.bytesRead; const text = buffer.subarray(0, read.bytesRead).toString('utf8');
      if (text.includes('\0') || /-----BEGIN .*PRIVATE KEY-----|(?:sk-[a-zA-Z0-9]{16,}|gh[pousr]_[a-zA-Z0-9]{20,})/.test(text)) return;
      documents.push({ file: relative, text });
      if (!/\.md$/i.test(relative)) return;
      const links = [...text.matchAll(/(?<!!)\[[^\]\n]*\]\(\s*(<[^>]+>|[^\s)]+)/g)].map(m => m[1]);
      links.push(...[...text.matchAll(/^\s*\[[^\]\n]+\]:\s*(<[^>]+>|\S+)/gm)].map(m => m[1]));
      for (let link of links) {
        link = link.replace(/^<|>$/g, '').split('#')[0];
        if (!link || /^(?:[a-z][\w+.-]*:|\/|\\)/i.test(link) || link.includes('?')) continue;
        try { link = decodeURIComponent(link); } catch { continue; }
        if (!/\.md$/i.test(link) || /[\\\0]/.test(link)) continue;
        const target = path.resolve(root, path.dirname(relative), link);
        if (target.startsWith(root + path.sep)) await visit(path.relative(root, target), depth + 1);
      }
    } catch (error) { if (!['ENOENT', 'ELOOP', 'ENOTDIR'].includes(error.code)) throw error; }
    finally { await handle?.close(); }
  }
  await visit('AGENTS.md', 0); await visit('README.md', 0); await visit('package.json', 0);
  const checks = [];
  function add(command, source) {
    if (!command.trim() || command.length > 4000 || checks.length >= 40 || !/(?:\btest\b|\blint\b|\bcheck\b|typecheck|\bbuild\b)/i.test(command) || /(?:secret|token|password|api[_-]?key)\s*[=:]/i.test(command)) return;
    if (!checks.some(item => item.command === command)) checks.push({ id: hash([command, source]), command, source });
  }
  for (const doc of documents) {
    if (doc.file === 'package.json') {
      try { const pkg = JSON.parse(doc.text); for (const [name, command] of Object.entries(pkg.scripts ?? {})) if (/^(?:test|lint|check|typecheck|build)(?::[\w-]+)?$/.test(name) && typeof command === 'string') add(`npm run ${name}`, `package.json → scripts.${name}`); }
      catch { /* A malformed manifest supplies no selectable checks. */ }
      continue;
    }
    let heading = '', fence = false, accept = false, continued = '', firstLine = 0;
    doc.text.split('\n').forEach((line, index) => {
      if (/^#{1,6}\s/.test(line) && !fence) heading = line;
      const marker = /^\s*```(\w*)\s*$/.exec(line);
      if (marker) { if (fence && continued) { add(continued, `${doc.file}:${firstLine}`); continued = ''; } fence = !fence; accept = fence && /^(?:bash|sh|shell|console|zsh)$/.test(marker[1]) && /commands?|команд|checks?|проверк|tests?|тест|build|сборк/i.test(heading); return; }
      if (!fence || !accept || !line.trim() || /^\s*#/.test(line)) return;
      const command = line.replace(/^\s*\$\s+/, ''); if (!continued) firstLine = index + 1;
      continued += (continued ? '\n' : '') + command;
      if (!/\\\s*$/.test(command)) { add(continued, `${doc.file}:${firstLine}`); continued = ''; }
    });
  }
  return { documents, checks, caveats: documents.some(doc => doc.file === 'AGENTS.md') ? ['Documentation is bounded: 12 files, 2 link hops, 24 KiB/file, 96 KiB total. No command runs during discovery.'] : ['AGENTS.md not found or unreadable; using bounded fallback documentation. No command runs during discovery.'] };
}

/** Hash the complete returned diff; refuse truncated output instead of calling a partial hash complete. */
export async function gitSnapshot(root, run, signal) {
  const dotgit = await fs.lstat(path.join(root, '.git')).catch(error => { if (error.code === 'ENOENT') return null; throw error; });
  if (!dotgit?.isDirectory() || dotgit.isSymbolicLink()) throw new Error('A local Git repository is required; external worktree metadata is not read.');
  const git = `git --no-optional-locks -c core.fsmonitor=false -c core.untrackedCache=false -C ${quote(root)} --git-dir=${quote(path.join(root, '.git'))} --work-tree=${quote(root)}`;
  async function read(args) {
    const result = await run(`${git} ${args}`, root, signal, 'read-only');
    if (result.exitCode !== 0 || result.timedOut || result.aborted) throw new Error('Git read failed.');
    if (result.stdout.truncated || result.stderr.truncated) throw new Error('Git output exceeds the bound. Review is incomplete; no full fingerprint was produced.');
    return result.stdout.text;
  }
  const raw = await read('status --porcelain=v1 -z --untracked-files=all --ignore-submodules=all');
  if (raw.split('\0').some(item => item && sensitive(item.replace(/^[ ?MADRCU!]{2} /, '')))) throw new Error('Sensitive paths are present in Git status. Their contents will not be read.');
  const staged = await read('diff --cached --no-ext-diff --no-textconv --ignore-submodules=all --');
  const unstaged = await read('diff --no-ext-diff --no-textconv --ignore-submodules=all --');
  return { status: raw.replaceAll('\0', '\n'), staged, unstaged, fingerprint: hash([raw, staged, unstaged]), capturedAt: new Date().toISOString(), complete: true, caveats: ['Untracked files are listed, not read or reviewed. Staged and unstaged diffs are separate.'] };
}

/** Only visible text, calls and tool outputs enter a handoff; no reasoning or provider payloads. */
export function handoffEvidence(events, git, identity) {
  const calls = new Map(), claims = [], checks = [], unresolved = [], users = [];
  for (const event of events) {
    if (event.type === 'tool/call') { calls.set(event.data.callId, { name: event.data.name, arguments: event.data.arguments, seq: event.seq }); continue; }
    if (event.type === 'user/message') { const text = textOf(event.data.content); if (text) users.push({ seq: event.seq, text: text.slice(0, 3000) }); continue; }
    if (event.type === 'assistant/message') { const text = textOf(event.data.message?.content); if (text) claims.push({ seq: event.seq, text: text.slice(0, 1200) }); continue; }
    if (event.type !== 'tool/result') continue;
    const msg = event.data.message; const call = calls.get(msg?.toolCallId); if (!call) continue;
    if (!/^(?:bash|shell|run_code)$/.test(call.name)) { if (msg?.isError || event.data.error) unresolved.push({ seq: event.seq, tool: call.name, evidence: textOf(msg?.content).slice(0, 1500) }); continue; }
    const output = textOf(msg.content); const marker = /\[exit code:\s*(-?\d+)\]\s*$/i.exec(output);
    const meta = event.data.meta; const exitCode = typeof meta?.exitCode === 'number' ? meta.exitCode : marker ? Number(marker[1]) : null;
    let args; try { args = JSON.parse(call.arguments); } catch { args = {}; }
    checks.push({ seq: event.seq, tool: call.name, command: typeof args.command === 'string' ? args.command.slice(0, 3000) : 'Unknown command', exitCode, successEvidence: exitCode === 0 && !msg.isError && !event.data.error, output: output.slice(-4000) });
  }
  return { ...identity, git, claims: claims.slice(-6), userText: users.slice(-6), checks: checks.slice(-30), unresolved: unresolved.slice(-12), nextStep: 'Unknown — edit the next concrete step before saving.', caveats: ['Assistant text is a claim, not verified tool success.', 'Only explicit exit-code evidence can establish a successful check. Missing exit code remains unknown.', 'Thinking, reasoning, replay and provider-private content are excluded.'] };
}

/** Select only actual completed Firecrawl calls, keeping the source result separate from notes. */
export function firecrawlCaptures(events) {
  const calls = new Map(), results = [];
  for (const event of events) {
    if (event.type === 'tool/call' && /^(?:mcp__firecrawl__firecrawl_scrape|firecrawl_scrape)$/.test(event.data.name)) {
      try { const args = JSON.parse(event.data.arguments); const url = new URL(args.url); if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) continue; calls.set(event.data.callId, { url: url.href, callSeq: event.seq, tool: event.data.name }); } catch { /* Non-URL or malformed calls cannot be source evidence. */ }
    }
    if (event.type !== 'tool/result' || event.data.error || event.data.message?.isError) continue;
    const call = calls.get(event.data.message?.toolCallId); if (!call) continue;
    const raw = textOf(event.data.message.content); if (!raw || raw.length > 524288) continue;
    let content = raw, title = 'Title unavailable', sourceUrl = call.url;
    try {
      const parsed = JSON.parse(raw); const data = parsed.data ?? parsed;
      if (parsed.success === false || data.success === false) continue;
      if (typeof data.markdown === 'string') content = data.markdown;
      if (typeof data.metadata?.title === 'string') title = data.metadata.title;
      if (typeof data.metadata?.sourceURL === 'string') { const parsedUrl = new URL(data.metadata.sourceURL); if (['http:','https:'].includes(parsedUrl.protocol) && !parsedUrl.username && !parsedUrl.password) sourceUrl = parsedUrl.href; }
    } catch { /* A text-only MCP response is retained verbatim as the captured result. */ }
    results.push({ seq: event.seq, callSeq: call.callSeq, tool: call.tool, url: sourceUrl, title, retrievedAt: new Date(event.time).toISOString(), content, rawResult: raw, sourceType: 'Actual completed Firecrawl result', caveat: content === raw ? 'This is the verbatim tool response; page fields were not separately decoded.' : '' });
  }
  return results.slice(-30);
}

export function verifyQuotes(content, quotes) {
  if (!Array.isArray(quotes) || quotes.length > 30) throw new Error('Invalid quotes.');
  return quotes.map(text => ({ text: assertText(text, 'quote', 10000), verified: text.length > 0 && content.includes(text) }));
}

export function recordMarkdown(record) {
  const context = `Project: ${record.projectTitle} (${record.projectPath})\nSession: ${record.sessionId || 'Not selected'}\nSaved: ${record.createdAt}\nRecord: ${record.id}`;
  if (record.kind === 'handoff') return `# Handoff\n\n${context}\n\nEditable draft (user-authored):\n\n${record.markdown}\n\n## Next concrete step\n\n${record.nextStep || 'Unknown'}\n\n## Captured evidence details\n\n\`\`\`json\n${JSON.stringify(record.evidence ?? {}, null, 2)}\n\`\`\`\n`;
  if (record.kind === 'note') return `# ${record.source.title}\n\n${context}\n\n## Source evidence (untrusted)\n\nURL: ${record.source.url}\nRetrieved: ${record.source.retrievedAt}\nTool/result sequence: ${record.source.tool} / ${record.source.seq}\n\n${record.source.content}\n\n## Verbatim quotations\n\n${record.quotes.map(q => `**${q.verified ? 'Verified in captured source' : 'Unverified'}**\n\n> ${q.text.replaceAll('\n', '\n> ')}`).join('\n\n')}\n\n## User conclusions and notes (not source evidence)\n\n${record.notes}\n\n## Linked questions\n\n${record.questions}\n`;
  return `# Pre-commit review\n\n${context}\n\nState: ${record.state}\nFingerprint: ${record.git.fingerprint}\nStale: ${record.stale ? 'yes' : 'no'}\nReviewer session: ${record.childId || 'Not started'}\n\n## Checks\n\n${(record.checks ?? []).map(c => `### ${c.command}\n\nSource: ${c.source}\nCWD: ${c.cwd}\nStarted: ${c.startedAt}\nEnded: ${c.endedAt}\nExit: ${c.exitCode ?? 'unknown'}\nTimeout: ${c.timedOut}\nCancelled: ${c.aborted}\nOutput truncated: ${!!c.stdout?.truncated || !!c.stderr?.truncated}\nFingerprint: ${c.fingerprint}\n\n\`\`\`text\n${c.stdout?.text ?? ''}\n${c.stderr?.text ?? ''}\n\`\`\``).join('\n\n')}\n\n## Findings\n\n${(record.findings ?? []).map(f => `- **${f.severity}** ${f.file}:${f.line ?? '?'} — ${f.message}\n  Caveat: ${f.caveat}`).join('\n')}\n\n## Reviewer raw response\n\n${record.reviewerText || 'Not completed'}\n\n## Caveats\n\n${(record.caveats ?? []).join('\n')}\n`;
}

export function handoffMarkdown(evidence) {
  const issues = [
    ...evidence.unresolved.map(c => `- ${c.tool} (seq ${c.seq}): ${c.evidence.slice(0,240)}`),
    ...evidence.checks.filter(c => c.exitCode !== null && c.exitCode !== 0).map(c => `- Check seq ${c.seq}: ${c.command.slice(0,200)}; exit ${c.exitCode}.`),
    ...(evidence.workflow ?? []).flatMap(r => [
      ...r.checks.filter(c => c.exitCode !== 0 || c.timedOut || c.aborted).map(c => `- Record ${r.id} (${r.current}): ${c.command}; exit ${c.exitCode ?? 'unknown'}, timeout ${c.timedOut}, cancelled ${c.aborted}.`),
      ...(r.findings ?? []).map(f => `- Review ${r.id} (${r.current}): ${f.severity} ${f.file}:${f.line ?? '?'} — ${f.message} Caveat: ${f.caveat || 'None recorded'}`),
    ]),
  ];
  return `## Work reported by the assistant (claims)\n\n${evidence.claims.map(c => `- Message ${c.seq}: ${c.text.replaceAll('\n',' ').slice(0,260)}`).join('\n') || 'Unknown'}\n\n## Actual Git status\n\n\`\`\`text\n${evidence.git.status.slice(0,3000)}\n\`\`\`\nFingerprint: ${evidence.git.fingerprint}\n\n## Conversation tool check evidence\n\n${evidence.checks.map(c => `- seq ${c.seq}: ${c.command.slice(0,200)}; exit ${c.exitCode ?? 'unknown'}; ${c.successEvidence ? 'successful terminal exit evidence at that time' : 'failure or unverified'}`).join('\n') || 'Unknown — no tool exit evidence.'}\n\n## Workflow checks and review evidence (separate durable records)\n\n${(evidence.workflow ?? []).map(r => `- Record ${r.id}; fingerprint ${r.fingerprint}; current: ${r.current}; state ${r.state}; reviewer ${r.childId || 'not started'} (${r.stopReason || 'unknown'}).\n${r.checks.map(c => `  - ${c.command}: exit ${c.exitCode ?? 'unknown'}, timeout ${c.timedOut}, cancelled ${c.aborted}; ${c.endedAt}`).join('\n')}`).join('\n') || 'No matching Workflow records.'}\n\n## Failures and unresolved issues\n\n${issues.join('\n') || 'Unknown — absence of an error is not proof all issues are resolved.'}\n\n## Caveats\n\n${evidence.caveats.join('\n')}\n`;
}
