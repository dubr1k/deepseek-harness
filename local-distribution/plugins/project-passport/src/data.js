import * as fs from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';

/** Fixed security ceilings, not an indexing configuration. */
export const LIMITS = Object.freeze({ entries: 160, directories: 12, depth: 2, fileBytes: 24576, totalBytes: 98304, linkedDocuments: 12, linkDepth: 2 });
const SECRET = /(?:^\.|secret|credential|password|token|private|\.pem$|\.key$|\.p12$|\.pfx$|id_rsa|id_ed25519)/i;
const FILES = /^(?:readme(?:\.[a-z-]+)?\.md|package\.json|plan\.md|todo\.md|roadmap\.md|makefile|pyproject\.toml|cargo\.toml|go\.mod|tsconfig\.json|dockerfile|compose\.ya?ml|license(?:\.md)?)$/i;
const DIRS = /^(?:docs?|src|app|tests?|scripts)$/i;
const absent = error => error?.code === 'ENOENT';

/** Read only allowlisted ordinary files without following symlinks. */
export async function collect(project, signal) {
  const root = await fs.realpath(project.path);
  if (root !== path.resolve(project.path)) throw new Error('The project directory changed. Register it again.');
  const result = { title: project.title, path: root, purpose: null, purposeSource: null, documentation: [], commands: [], files: [], tasks: [], git: null, notices: [], updatedAt: null, limits: LIMITS };
  let bytes = 0, entries = 0, directories = 0;
  const texts = new Map();
  async function read(relative) {
    signal?.throwIfAborted();
    const full = path.resolve(root, relative);
    if (!full.startsWith(root + path.sep) || relative.split(/[\\/]/).some(part => part !== '.agents' && SECRET.test(part))) return null;
    const parent = await fs.realpath(path.dirname(full));
    if (parent !== root && !parent.startsWith(root + path.sep)) return null;
    // Parent equality prevents symlinked intermediate directories, including in-root aliases.
    if (parent !== path.dirname(full)) return null;
    let handle;
    try {
      handle = await fs.open(full, constants.O_RDONLY | constants.O_NOFOLLOW);
      const stat = await handle.stat();
      if (!stat.isFile() || stat.size > LIMITS.fileBytes || bytes + stat.size > LIMITS.totalBytes) {
        result.notices.push('Some files were skipped: size limit reached.'); return null;
      }
      const buffer = Buffer.alloc(Math.min(stat.size + 1, LIMITS.fileBytes + 1));
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
      bytes += bytesRead;
      if (bytesRead > stat.size || bytes > LIMITS.totalBytes) return null;
      const text = buffer.subarray(0, bytesRead).toString('utf8');
      if (text.includes('\0')) return null;
      // Known credential material is never returned to the UI.
      if (/-----BEGIN .*PRIVATE KEY-----|(?:sk-[a-zA-Z0-9]{16,}|gh[pousr]_[a-zA-Z0-9]{20,})/.test(text)) {
        result.notices.push('A file containing possible secrets was hidden.'); return null;
      }
      return text;
    } finally { await handle?.close(); }
  }
  const primary = new Set();
  const visited = new Set();
  async function linked(file, depth) {
    if (visited.has(file) || visited.size >= LIMITS.linkedDocuments) return;
    visited.add(file);
    let text;
    try { text = await read(file); }
    catch (error) { if (file === 'AGENTS.md') result.notices.push(absent(error) ? 'AGENTS.md not found. Using fallback sources: README, documentation and manifest.' : 'AGENTS.md is unavailable. Using fallback sources.'); else result.notices.push(`Linked document unavailable: ${file}.`); return; }
    if (text === null) { result.notices.push(`Document skipped due to read limits: ${file}.`); return; }
    texts.set(file, text); primary.add(file); result.files.push(file);
    if (depth >= LIMITS.linkDepth) return;
    // Inline Markdown links and reference-link definitions; no image/network resolution.
    const targets = [...text.matchAll(/(?<!!)\[[^\]\n]+\]\(\s*(<[^>]+>|[^\s)]+)(?:\s+[^)]*)?\)/g)].map(match => match[1]);
    targets.push(...[...text.matchAll(/^\s*\[[^\]\n]+\]:\s*(<[^>]+>|\S+)/gm)].map(match => match[1]));
    for (let target of targets) {
      signal?.throwIfAborted();
      target = target.replace(/^<|>$/g, '').split('#')[0];
      if (!target || /^(?:[a-z][a-z\d+.-]*:|\/|\\)/i.test(target) || target.includes('?')) continue;
      try { target = decodeURIComponent(target); } catch { continue; }
      if (!/\.md$/i.test(target) || target.includes('\\') || target.includes('\0')) continue;
      const absolute = path.resolve(root, path.dirname(file), target);
      if (!absolute.startsWith(root + path.sep)) continue;
      const next = path.relative(root, absolute).split(path.sep).join('/');
      if (next.split('/').length > 8) continue;
      await linked(next, depth + 1);
    }
  }
  await linked('AGENTS.md', 0);
  async function walk(relative, depth) {
    if (++directories > LIMITS.directories) { result.notices.push('Directory limit reached.'); return; }
    signal?.throwIfAborted();
    const directory = path.join(root, relative);
    if (await fs.realpath(directory) !== directory) return;
    const dir = await fs.opendir(directory);
    for await (const entry of dir) {
      if (++entries > LIMITS.entries) { result.notices.push('Entry limit reached.'); break; }
      if (SECRET.test(entry.name) || entry.isSymbolicLink()) continue;
      const rel = relative ? `${relative}/${entry.name}` : entry.name;
      if (entry.isFile() && (FILES.test(entry.name) || (/^docs?\//i.test(rel) && /\.md$/i.test(entry.name)))) {
        result.files.push(rel);
        if (/^(?:readme.*\.md|package\.json|plan\.md|todo\.md|roadmap\.md)$/i.test(entry.name) || (/^docs?\//i.test(rel) && /\.md$/i.test(entry.name))) {
          try { if (!texts.has(rel)) { const text = await read(rel); if (text !== null) texts.set(rel, text); } }
          catch (error) { if (!absent(error)) result.notices.push(`Could not read ${rel}.`); }
        }
      } else if (entry.isDirectory() && depth < LIMITS.depth && DIRS.test(entry.name) && entries < LIMITS.entries) {
        await walk(rel, depth + 1);
      }
    }
  }
  await walk('', 0);
  for (const [file, text] of texts) {
    if (primary.has(file) || /readme.*\.md$/i.test(file) || (/^docs?\//i.test(file) && /\.md$/i.test(file))) {
      result.documentation.push({ file, text });
      if (!result.purpose && (primary.has(file) || /readme.*\.md$/i.test(file))) {
        const lines = text.split('\n');
        const purposeHeading = lines.findIndex(line => /^#{1,6}\s+(?:назначение|о проекте|цель|purpose|about(?: the project)?|overview)\s*$/i.test(line));
        const start = purposeHeading >= 0 ? purposeHeading + 1 : 0;
        const paragraph = lines.slice(start).join('\n').split(/\n\s*\n/).map(s => s.trim()).find(s => s && !/^(?:#|!\[|\[!|<|```|\||[-*+]\s|\[)/.test(s));
        // Linked instructions without a purpose section only supplement the root guide.
        if (paragraph && (file === 'AGENTS.md' || !primary.has(file) || purposeHeading >= 0)) {
          result.purpose = paragraph.slice(0, 900);
          result.purposeSource = `${file}:${lines.findIndex(line => line.trim() === paragraph.split('\n')[0]) + 1}`;
        }
      }
      let heading = '', fence = null;
      text.split('\n').forEach((line, index) => {
        const title = /^#{1,6}\s+(.+)$/.exec(line);
        if (!fence && title) heading = title[1];
        const marker = /^\s*(`{3,}|~{3,})([\w-]*)\s*$/.exec(line);
        if (marker) {
          if (fence && marker[1][0] === fence.marker[0] && marker[1].length >= fence.marker.length) {
            const command = fence.lines.join('\n').trim();
            if (fence.accept && command && command.length <= 2400 && result.commands.length < 40 && !/(?:secret|token|password|api[_-]?key)\s*[=:]/i.test(command)) {
              result.commands.push({ name: heading, command, definition: null, source: `${file}:${fence.line}` });
            }
            fence = null;
          } else if (!fence) fence = { marker: marker[1], line: index + 1, lines: [], accept: /^(?:bash|sh|shell|console|zsh)$/i.test(marker[2]) && /(?:\b(?:commands?|run|running|start|launch|development|dev|test|testing|check|lint|build)\b|команд|запуск|проверк|тест|сборк|разработк)/i.test(heading) };
        } else if (fence) fence.lines.push(line.replace(/^\s*\$\s+/, ''));
      });
    }
    if (primary.has(file) || /(?:^|\/)(?:plan|todo|roadmap)\.md$/i.test(file)) {
      text.split('\n').forEach((line, index) => {
        const match = /^\s*[-*+]\s+\[ \]\s+(.+)$/.exec(line);
        if (match && result.tasks.length < 60) result.tasks.push({ text: match[1].slice(0, 500), file, line: index + 1 });
      });
    }
  }
  if (texts.has('package.json')) {
    try {
      const pkg = JSON.parse(texts.get('package.json'));
      if (![...primary].some(file => result.purposeSource?.startsWith(file + ':')) && typeof pkg.description === 'string' && pkg.description.trim()) { result.purpose = pkg.description.slice(0, 900); result.purposeSource = 'package.json → description'; }
      // Only named launch/check scripts; never execute or expose unrelated operations.
      if (pkg.scripts && typeof pkg.scripts === 'object') for (const [name, command] of Object.entries(pkg.scripts)) {
        if (/^(?:start|dev|serve|test|check|lint|typecheck|build)(?::[\w-]+)?$/.test(name) && typeof command === 'string') {
          if (/(?:secret|token|password|api[_-]?key)\s*[=:]/i.test(command)) continue;
          result.commands.push({ name, command: `npm run ${name}`, definition: command.slice(0, 1200), source: 'package.json' });
        }
      }
    } catch { result.notices.push('package.json: could not parse JSON.'); }
  }
  try { result.git = await gitStatus(root, signal); }
  catch { result.notices.push('Git data unavailable.'); }
  result.files = [...new Set(result.files)];
  result.commands = result.commands.filter((command, index, all) => index === all.findIndex(other => other.command === command.command));
  result.notices = [...new Set(result.notices)];
  result.updatedAt = new Date().toISOString();
  return result;
}

/** Run only a fixed, read-only Git status; do not search parent repositories. */
async function gitStatus(root, signal) {
  let stat;
  try { stat = await fs.lstat(path.join(root, '.git')); }
  catch (error) { if (absent(error)) return null; throw error; }
  if (!stat.isDirectory() || stat.isSymbolicLink()) return { unavailable: 'External Git directories are not read.' };
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_')));
  Object.assign(env, { GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: process.platform === 'win32' ? 'NUL' : '/dev/null', GIT_TERMINAL_PROMPT: '0', GIT_OPTIONAL_LOCKS: '0' });
  const output = await new Promise((resolve, reject) => execFile('git', ['--no-optional-locks', '-c', 'core.fsmonitor=false', '-c', 'core.untrackedCache=false', '-C', root, '--git-dir', path.join(root, '.git'), '--work-tree', root, 'status', '--porcelain=v1', '--branch', '--untracked-files=no', '--ignore-submodules=all'], { env, signal, timeout: 5000, maxBuffer: 32768, encoding: 'utf8' }, (error, stdout) => error ? reject(error) : resolve(stdout)));
  const lines = output.trimEnd().split('\n');
  return { branch: lines[0]?.replace(/^## /, '') || null, trackedChanges: lines.length - 1, note: 'Tracked change count only; no file contents or untracked files.' };
}
