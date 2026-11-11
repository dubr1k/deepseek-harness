window.__ModuleLoader__.load({
  id: '@dsh-local/view-16f6f54d-d6b2-4f85-81f1-515c5a10dc8b',
  factory(require) {
    const React = require('react'), h = React.createElement;
    const { MarkdownText } = require('@deepseek-ai/dsh-client-ui-primitives');
    const ID = '@dsh-local/view-16f6f54d-d6b2-4f85-81f1-515c5a10dc8b';
    const ROUTE = '/api/project-passport-16f6f54d-d6b2-4f85-81f1-515c5a10dc8b';
    return { inject: ['slots', 'layout', 'locale'], apply(ctx) {
      const words = { title: 'Project Passport', refresh: 'Refresh', back: 'Back to conversation', missing: 'Not found', select: 'Select a registered project', purpose: 'Purpose', docs: 'Documentation', git: 'Git', commands: 'Run and check', files: 'Important files', tasks: 'Open plan tasks', copy: 'Copy', copied: 'Copied', failedCopy: 'Could not copy. Select the command manually.', loading: 'Reading project…', empty: 'No registered projects.', updated: 'Updated', limits: 'Primary source: AGENTS.md and local links (up to 12 documents, 2 hops). Fallback scan: depth 2, up to 160 entries. Up to 24 KiB per file, 96 KiB total. Read-only; no network, secrets or symbolic links.', tasksHint: 'Open checkboxes from AGENTS.md and linked documents first, then PLAN.md, TODO.md and ROADMAP.md. Each task includes its source. Sessions and deferred development are never started.', changes: 'Changed tracked files', error: 'Could not load data. Select Refresh to retry.', definition: 'Definition', source: 'Source', note: 'Commands are copied only, never executed.', footnotes: 'Footnotes', noCommands: 'Not found: checked package.json scripts and explicit shell blocks under command, run, build and check headings in documentation.' };
      ctx.effect(() => ctx.locale.register(ID, 'ru', words));
      ctx.effect(() => ctx.locale.register(ID, 'en', words));
      const t = ctx.locale.bind(ID);
      const markdownLabels = { code: { copyLabel: t('copy'), copiedLabel: t('copied') }, footnotes: t('footnotes') };
      const markdown = text => h(MarkdownText, { text, labels: markdownLabels, omitHtml: true });
      let selected = '', cached = null, mounted = false;
      function Icon({ size = 20 }) { return h('svg', { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, 'aria-hidden': true }, h('rect', { x: 5, y: 3, width: 14, height: 18, rx: 2 }), h('path', { d: 'M9 8h6M9 12h6M9 16h4' })); }
      function Page() {
        const [projects, setProjects] = React.useState([]), [id, setId] = React.useState(selected);
        const [data, setData] = React.useState(cached), [busy, setBusy] = React.useState(false), [error, setError] = React.useState(''), [copy, setCopy] = React.useState('');
        const current = React.useRef(null);
        React.useEffect(() => { mounted = true; return () => { mounted = false; current.current?.abort(); }; }, []);
        async function query(nextId, roster = false) {
          current.current?.abort(); const controller = new AbortController(); current.current = controller;
          setBusy(true); setError(''); setCopy('');
          try {
            const readProject = async projectId => { const suffix = projectId === null ? '' : '?id=' + encodeURIComponent(projectId); const response = await fetch(ROUTE + suffix, { method: 'GET', credentials: 'same-origin', cache: 'no-store', signal: controller.signal }); const value = await response.json(); if (!response.ok) throw new Error(value.error || t('error')); controller.signal.throwIfAborted(); return value; };
            if (roster) { const value = await readProject(null); setProjects(value.projects); if (nextId && !value.projects.some(p => p.id === nextId)) { selected = ''; cached = null; setId(''); setData(null); return; } }
            if (nextId) { const value = await readProject(nextId); if (!controller.signal.aborted) { cached = value; setData(value); } }
          } catch (failure) { if (!controller.signal.aborted) setError(failure.message || t('error')); }
          finally { if (!controller.signal.aborted) setBusy(false); }
        }
        React.useEffect(() => { query(selected, true); }, []);
        function choose(value) { selected = value; cached = null; setId(value); setData(null); query(value); }
        const section = (title, content) => h('section', { className: 'pp-section' }, h('h2', null, t(title)), content);
        const missing = () => h('p', { className: 'pp-muted' }, t('missing'));
        return h('main', { className: 'pp-page' },
          h('style', null, `.pp-page{box-sizing:border-box;height:100%;overflow:auto;padding:calc(24px + var(--dsh-frame-top-clearance,0px)) 24px 32px;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-base);font-size:13px}.pp-wrap{max-width:900px;margin:auto}.pp-page h1{font-size:22px;font-weight:500;margin:0}.pp-page h2{font-size:15px;font-weight:500;margin:0 0 12px}.pp-header,.pp-controls,.pp-command{display:flex;gap:12px;align-items:center;flex-wrap:wrap}.pp-header{justify-content:space-between;margin-bottom:24px}.pp-controls{margin-bottom:16px}.pp-page button,.pp-page select{font:inherit;color:inherit;background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l1);border-radius:8px;padding:8px 12px;min-height:36px}.pp-page select{flex:1;min-width:160px;max-width:100%}.pp-page button{cursor:pointer}.pp-page button:disabled{opacity:.5;cursor:default}.pp-page :focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px}.pp-section{padding:20px 0;border-top:1px solid var(--dsw-alias-border-l1)}.pp-page p{margin:8px 0;line-height:1.6}.pp-command code,.pp-path code,.pp-raw{white-space:pre-wrap;overflow-wrap:anywhere;font-size:12px}.pp-raw{max-height:360px;overflow:auto;background:var(--dsw-alias-bg-layer-1);padding:12px;border-radius:8px}.pp-page a{color:var(--dsw-alias-brand-primary)}.pp-muted{color:var(--dsw-alias-label-secondary)}.pp-error{color:var(--dsw-alias-state-error-primary)}.pp-files li{margin:8px 0;overflow-wrap:anywhere}.pp-files{padding-left:20px}.pp-command{justify-content:space-between}.pp-command-item{margin:16px 0}.pp-path{overflow-wrap:anywhere}.pp-page summary{cursor:pointer;padding:8px 0}.pp-document{border:1px solid var(--dsw-alias-border-l1);border-radius:8px;margin:12px 0;min-width:0}.pp-document>summary{padding:14px 18px;font-weight:600;overflow-wrap:anywhere}.pp-document[open]>summary{border-bottom:1px solid var(--dsw-alias-border-l1)}.pp-markdown{padding:18px;min-width:0;overflow-wrap:anywhere}.pp-markdown>div{min-width:0}.pp-document pre{max-width:100%}.pp-document table{font-size:inherit}@media(max-width:560px){.pp-page{padding-left:16px;padding-right:16px}.pp-header{gap:16px}}`),
          h('div', { className: 'pp-wrap' },
            h('header', { className: 'pp-header' }, h('h1', null, t('title')), h('button', { onClick: () => ctx.layout.selectPanel(null) }, t('back'))),
            h('div', { className: 'pp-controls' }, h('select', { value: id, 'aria-label': t('select'), onChange: e => choose(e.target.value) }, h('option', { value: '' }, t('select')), ...projects.map(p => h('option', { key: p.id, value: p.id }, p.title + ' — ' + p.path))), h('button', { disabled: busy, onClick: () => query(id, true) }, t('refresh'))),
            h('p', { className: 'pp-muted' }, t('limits')),
            busy && h('p', { role: 'status' }, t('loading')),
            error && h('p', { role: 'alert', className: 'pp-error' }, error),
            !busy && !projects.length && !error && h('p', null, t('empty')),
            data && h(React.Fragment, null,
              h('p', { className: 'pp-path' }, data.title, h('br'), h('code', null, data.path)),
              h('p', { className: 'pp-muted' }, t('updated') + ': ' + new Date(data.updatedAt).toLocaleString('en-US')),
              section('purpose', data.purpose ? h(React.Fragment, null, markdown(data.purpose), h('p', { className: 'pp-muted' }, t('source') + ': ' + data.purposeSource)) : missing()),
              section('docs', data.documentation.length ? data.documentation.map((doc, index) => h('details', { key: doc.file, id: 'pp-document-' + index, className: 'pp-document' }, h('summary', null, doc.file), h('div', { className: 'pp-markdown' }, markdown(doc.text)))) : missing()),
              section('git', data.git ? data.git.unavailable ? h('p', null, data.git.unavailable) : h(React.Fragment, null, h('code', null, data.git.branch || t('missing')), h('p', null, t('changes') + ': ' + data.git.trackedChanges), h('p', { className: 'pp-muted' }, data.git.note)) : missing()),
              section('commands', h(React.Fragment, null, h('p', { className: 'pp-muted' }, t('note')), data.commands.length ? data.commands.map((command, index) => h('div', { key: index, className: 'pp-command-item' }, h('div', { className: 'pp-command' }, h('code', null, command.command), h('button', { onClick: async () => { try { await navigator.clipboard.writeText(command.command); setCopy(t('copied')); } catch { setCopy(t('failedCopy')); } } }, t('copy'))), h('p', { className: 'pp-muted' }, t('source') + ': ' + command.source), command.definition && h('details', null, h('summary', null, t('definition')), h('pre', { className: 'pp-raw' }, command.definition)))) : h('p', null, t('noCommands')), h('p', { role: 'status' }, copy))),
              section('files', data.files.length ? h('ul', { className: 'pp-files' }, ...data.files.map(file => h('li', { key: file }, h('code', null, file)))) : missing()),
              section('tasks', h(React.Fragment, null, h('p', { className: 'pp-muted' }, t('tasksHint')), data.tasks.length ? h('ul', null, ...data.tasks.map((task, i) => h('li', { key: i }, task.text, h('br'), h('code', { className: 'pp-muted' }, task.file + ':' + task.line)))) : missing())),
              ...data.notices.map(note => h('p', { className: 'pp-muted', key: note }, note)))
          ));
      }
      ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({ name: 'sidebar.panellist', id: ID, order: 35, label: () => t('title') }, Icon));
      ctx.slots.inject('main', () => ctx.slots.register({ name: 'main', key: ID }, Page));
      ctx.effect(() => () => { if (mounted) ctx.layout.selectPanel(null); cached = null; selected = ''; });
    } };
  }
});
