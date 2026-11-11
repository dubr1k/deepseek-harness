window.__ModuleLoader__.load({
  id: '@dsh-local/dsh-workflow-tools',
  factory(require) {
    /** Request epochs prevent a late response from mutating another project, session or tab. */
class ViewRequests {
  constructor() { this.generation = 0; this.active = null; }
  invalidate() { this.generation++; this.active?.controller.abort(); }
  start() { this.active?.controller.abort(); const ticket = { generation: this.generation, controller: new AbortController() }; this.active = ticket; return ticket; }
  accepts(ticket) { return this.active === ticket && this.generation === ticket.generation && !ticket.controller.signal.aborted; }
  finish(ticket) { return this.active === ticket; }
}
/** Existence is independent of an editable draft's possibly empty text. */
const canSaveHandoff = (exists, text, nextStep) => exists && text.trim().length > 0 && nextStep.trim().length > 0;
/** Both saved-copy and saved-export read the durable record, never an unsaved preview. */
async function loadSavedMarkdown(load, projectId, id) { return load({ action: 'export', projectId, id }); }

    const React = require('react'), h = React.createElement;
    const { Button, Checkbox, Input, MarkdownText, Modal } = require('@deepseek-ai/dsh-client-ui-primitives');
    const ID = '@dsh-local/dsh-workflow-tools';
    const labels = { code: { copyLabel: 'Copy code', copiedLabel: 'Copied' }, footnotes: 'Footnotes' };
    let contextSession = '', contextTab = 'notebook', visible = false;
    return { inject: ['slots', 'layout', 'locale'], apply(ctx) {
      const words = { title: 'Workspace tools', handoff: 'Handoff', review: 'Pre-commit review', notebook: 'Research notebook' };
      ctx.effect(() => ctx.locale.register(ID, 'en', words)); ctx.effect(() => ctx.locale.register(ID, 'ru', words));
      const t = ctx.locale.bind(ID);
      async function api(args, signal) {
        const response = await fetch('/api/dsh-workflow-tools', { method: 'POST', credentials: 'same-origin', cache: 'no-store', headers: { 'content-type': 'application/json' }, body: JSON.stringify(args), signal });
        const result = await response.json(); if (!response.ok) throw new Error(result.error || 'Workflow operation failed.'); return result;
      }
      function Icon({ size = 20 }) { return h('svg', { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, 'aria-hidden': true }, h('rect', { x: 3, y: 5, width: 18, height: 15, rx: 2 }), h('path', { d: 'M8 5V3h8v2M3 11h18M10 11v3h4v-3' })); }
      function ContextActions(props) {
        return h('div', { style: { display: 'flex', gap: 4 } }, ...['handoff','review'].map(tab => h(Button, { key: tab, variant: 'ghost', onClick: () => { contextSession = props.sessionId; contextTab = tab; ctx.layout.selectPanel(ID); } }, t(tab))));
      }
      function Preview({ text }) { return h('div', { className: 'wt-preview' }, h('p', { className: 'wt-muted' }, 'Preview — review the content before saving or sharing.'), h(MarkdownText, { text: text.replace(/!\[/g, '['), labels, omitHtml: true })); }
      function Page() {
        const [projects, setProjects] = React.useState([]), [projectId, setProjectId] = React.useState('');
        const [sessions, setSessions] = React.useState([]), [sessionId, setSessionId] = React.useState(contextSession);
        const [tab, setTab] = React.useState(contextTab), [busy, setBusy] = React.useState(false), [error, setError] = React.useState(''), [notice, setNotice] = React.useState('');
        const [records, setRecords] = React.useState([]), [record, setRecord] = React.useState(null), [markdown, setMarkdown] = React.useState('');
        const [draft, setDraft] = React.useState(''), [draftExists, setDraftExists] = React.useState(false), [draftId, setDraftId] = React.useState(''), [nextStep, setNextStep] = React.useState('Unknown'), [handoffDetails, setHandoffDetails] = React.useState(null), [checks, setChecks] = React.useState([]);
        const [dirty, setDirty] = React.useState(false), [pendingNavigation, setPendingNavigation] = React.useState(null);
        const [sources, setSources] = React.useState([]), [sourceSeq, setSourceSeq] = React.useState(''), [notes, setNotes] = React.useState(''), [questions, setQuestions] = React.useState(''), [quotes, setQuotes] = React.useState('');
        const alive = React.useRef(true), requests = React.useRef(new ViewRequests());
        React.useEffect(() => { visible = true; return () => { visible = false; alive.current = false; requests.current.invalidate(); }; }, []);
        async function act(args, accept) {
          const ticket = requests.current.start(); setBusy(true); setError(''); setNotice('');
          try { const value = await api(args, ticket.controller.signal); if (!alive.current || !requests.current.accepts(ticket)) return null; accept?.(value); return value; }
          catch (failure) { if (alive.current && requests.current.accepts(ticket)) setError(failure.message || 'Operation failed.'); return null; }
          finally { if (alive.current && requests.current.finish(ticket)) setBusy(false); }
        }
        React.useEffect(() => { act({ action: 'projects', sessionId: contextSession || undefined }, value => { setProjects(value.projects); if (value.contextProjectId) selectProject(value.contextProjectId); }); }, []);
        function clearView() { setRecord(null); setMarkdown(''); setDraft(''); setDraftExists(false); setDraftId(''); setNextStep('Unknown'); setHandoffDetails(null); setDirty(false); setChecks([]); setSources([]); setSourceSeq(''); setNotes(''); setQuestions(''); setQuotes(''); }
        function navigate(change) { requests.current.invalidate(); setBusy(false); if (dirty) setPendingNavigation(() => change); else change(); }
        async function selectProject(id) {
          requests.current.invalidate(); setProjectId(id); setSessions([]); setSessionId(''); setRecords([]); clearView();
          if (!id) return;
          const generation = requests.current.generation;
          await act({ action: 'sessions', projectId: id }, value => { setSessions(value.sessions); if (value.sessions.some(session => session.id === contextSession)) setSessionId(contextSession); });
          if (generation === requests.current.generation) await act({ action: 'records', projectId: id }, value => setRecords(value.records));
        }
        function changeSession(id) { requests.current.invalidate(); setSessionId(id); clearView(); }
        function refreshRecords() { return act({ action: 'records', projectId }, value => setRecords(value.records)); }
        function showRecord(value) {
          setRecord(value.record); setSessionId(value.record.sessionId); setMarkdown(value.markdown ?? ''); setChecks([]); setDirty(false);
          if (value.record.kind === 'handoff') { setTab('handoff'); setDraft(value.record.markdown); setDraftExists(true); setDraftId(value.record.id); setNextStep(value.record.nextStep || 'Unknown'); setHandoffDetails(value.record.evidence); }
          if (value.record.kind === 'review') setTab('review');
          if (value.record.kind === 'note') { setTab('notebook'); setSources([value.record.source]); setSourceSeq(String(value.record.source.seq)); setNotes(value.record.notes); setQuestions(value.record.questions); setQuotes(value.record.quotes.map(item => item.text).join('\n\n---\n\n')); }
        }
        function open(id) { return act({ action: 'open', projectId, id }, showRecord); }
        async function copy(text) { try { await navigator.clipboard.writeText(text); setNotice('Copied.'); } catch { setError('Could not copy. Select the text manually.'); } }
        async function exportRecord() {
          const value = await loadSavedMarkdown(args => act(args), projectId, record.id); if (!value) return;
          const url = URL.createObjectURL(new Blob([value.markdown], { type: 'text/markdown;charset=utf-8' }));
          try { const anchor = document.createElement('a'); anchor.href = url; anchor.download = value.filename; anchor.click(); } finally { URL.revokeObjectURL(url); }
        }
        async function saved(value) { showRecord({ record: value.record, markdown: value.markdown ?? value.record.markdown ?? '' }); setRecords(previous => [{ id: value.record.id, kind: value.record.kind, state: value.record.state ?? 'saved', createdAt: value.record.createdAt, sessionId: value.record.sessionId, title: value.record.source?.title ?? value.record.kind }, ...previous.filter(item => item.id !== value.record.id)]); setNotice('Saved. This version is now available in Saved in this project.'); }
        const command = (text, onClick, disabled = false, primary = false) => h(Button, { variant: primary ? 'primary' : 'outline', onClick, disabled: busy || disabled }, text);
        const hasContext = !!projectId && !!sessionId;
        const recordBusy = record && ['checking','starting-review','reviewing'].includes(record.state);
        const noteArgs = () => ({ projectId, sessionId: record?.kind === 'note' ? record.sessionId : sessionId, seq: Number(sourceSeq), ...(record?.kind === 'note' ? { id: record.id } : {}), notes, questions, quotes: quotes ? quotes.split(/\n\n---\n\n/) : [] });
        return h('main', { className: 'wt-page' }, h('style', null, `.wt-page{box-sizing:border-box;height:100%;overflow:auto;padding:calc(24px + var(--dsh-frame-top-clearance,0px)) 24px 40px;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font-size:13px}.wt-wrap{max-width:1040px;margin:auto}.wt-row{display:flex;align-items:center;gap:12px;flex-wrap:wrap}.wt-head{justify-content:space-between;margin-bottom:24px}.wt-page h1{font-size:22px;font-weight:500;margin:0}.wt-page h2{font-size:16px;font-weight:500;margin:24px 0 12px}.wt-page h3{font-size:14px;font-weight:500}.wt-page p{line-height:1.6}.wt-muted{color:var(--dsw-alias-label-secondary)}.wt-page select,.wt-page textarea{box-sizing:border-box;max-width:100%;font:inherit;color:inherit;background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l1);border-radius:8px;padding:10px}.wt-page select{min-width:200px;flex:1}.wt-page textarea{width:100%;min-height:120px;resize:vertical;line-height:1.6}.wt-page :focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px}.wt-tabs{padding:16px 0;border-bottom:1px solid var(--dsw-alias-border-l1)}.wt-grid{display:grid;grid-template-columns:minmax(0,1fr) 240px;gap:24px}.wt-saved{border-left:1px solid var(--dsw-alias-border-l1);padding-left:20px}.wt-preview{border-top:1px solid var(--dsw-alias-border-l1);margin-top:20px;padding-top:12px;overflow-wrap:anywhere}.wt-page pre{white-space:pre-wrap;overflow-wrap:anywhere;max-height:320px;overflow:auto;background:var(--dsw-alias-bg-layer-1);padding:12px;border-radius:8px;font-size:12px}.wt-check{padding:12px 0;border-bottom:1px solid var(--dsw-alias-border-l1)}.wt-error{color:var(--dsw-alias-state-error-primary)}.wt-page code{overflow-wrap:anywhere;white-space:pre-wrap}.wt-saved button{margin:4px 0;width:100%;text-align:left}@media(max-width:800px){.wt-grid{grid-template-columns:minmax(0,1fr)}.wt-saved{border-left:0;border-top:1px solid var(--dsw-alias-border-l1);padding-left:0}.wt-page{padding-left:16px;padding-right:16px}}`),
          h('div', { className: 'wt-wrap' },
            h('header', { className: 'wt-row wt-head' }, h('h1', null, t('title')), command('Back to conversation', () => navigate(() => ctx.layout.selectPanel(null)))),
            h('div', { className: 'wt-row' },
              h('select', { 'aria-label': 'Project', value: projectId, onChange: event => { const id = event.target.value; navigate(() => selectProject(id)); }, disabled: busy }, h('option', { value: '' }, 'Select registered project'), ...projects.map(project => h('option', { key: project.id, value: project.id }, project.title + ' — ' + project.path))),
              h('select', { 'aria-label': 'Conversation', value: sessionId, onChange: event => { const id = event.target.value; navigate(() => changeSession(id)); }, disabled: busy || !projectId }, h('option', { value: '' }, 'Select conversation'), ...sessions.map(session => h('option', { key: session.id, value: session.id }, (session.title || session.id) + (session.root ? '' : ' · subagent') + (session.live ? ' · active' : ''))))),
            h('p', { className: 'wt-muted' }, 'Choose a project and conversation. Saved versions stay with the project and can be exported as Markdown.'),
            h('nav', { className: 'wt-row wt-tabs', 'aria-label': 'Workflow tools' }, ...['handoff','review','notebook'].map(key => h(Button, { key, variant: tab === key ? 'primary' : 'ghost', 'aria-current': tab === key ? 'page' : undefined, onClick: () => navigate(() => { setTab(key); clearView(); }) }, t(key)))),
            pendingNavigation && h(Modal, { open: true, title: 'Unsaved local edits', closeLabel: 'Keep editing', onClose: () => setPendingNavigation(null) }, h('p', null, 'This navigation would discard local edits or an unsaved preview. Saved records will not be changed.'), h('div', { className: 'wt-row' }, h(Button, { variant: 'outline', onClick: () => setPendingNavigation(null) }, 'Keep editing'), h(Button, { variant: 'primary', onClick: () => { const change = pendingNavigation; setPendingNavigation(null); setDirty(false); change(); } }, 'Discard local edits and continue'))),
            busy && h('p', { role: 'status' }, 'Working…'), error && h('p', { role: 'alert', className: 'wt-error' }, error), notice && h('p', { role: 'status' }, notice),
            h('div', { className: 'wt-grid' }, h('div', null,
              tab === 'handoff' && h('section', null, h('h2', null, 'Evidence-based handoff'), h('p', null, 'Collect a concise handoff from the conversation, changed files and recorded checks. Review the draft and add the next concrete step.'),
                command('Collect preview', () => navigate(() => act({ action: 'handoff_preview', projectId, sessionId }, value => { setDraft(value.markdown); setDraftExists(true); setHandoffDetails(value.evidence); setNextStep('Unknown'); setDirty(true); setDraftId(''); setRecord(null); setMarkdown(value.markdown); })), !hasContext, true),
                draftExists && h(React.Fragment, null, h('h3', null, 'Editable preview'), h('textarea', { 'aria-label': 'Handoff draft', value: draft, onChange: event => { setDirty(true); setDraft(event.target.value); setMarkdown(event.target.value); } }), h('h3', null, 'Next concrete step — enter an explicit step or keep Unknown'), h(Input, { 'aria-label': 'Next concrete step', value: nextStep, onChange: event => { setDirty(true); setNextStep(event.target.value); } }), h('p', { className: 'wt-muted' }, 'Unresolved fields remain Unknown. Saving edited text does not turn assistant claims into verified evidence.'), h('div', { className: 'wt-row' }, command('Save new handoff', () => act({ action: 'handoff_save', projectId, sessionId: record?.kind === 'handoff' ? record.sessionId : sessionId, ...(draftId ? { id: draftId } : {}), markdown: draft, nextStep }, saved), !hasContext || !canSaveHandoff(draftExists, draft, nextStep)), command('Copy draft', () => copy(draft))), handoffDetails && h('details', null, h('summary', null, 'Captured evidence details (visible content only)'), h('pre', null, JSON.stringify(handoffDetails, null, 2))))),
              tab === 'review' && h('section', null, h('h2', null, 'Pre-commit review'), h('p', null, 'Inspect your changes, choose checks from project documentation, then request a native review.'),
                command('Prepare review', () => act({ action: 'prepare_review', projectId, sessionId }, value => { setRecord(value.record); setChecks([]); setMarkdown(''); }), !hasContext, true),
                record?.kind === 'review' && h(React.Fragment, null,
                  h('p', null, 'Review: ', h('code', null, record.id), ' · ', record.state, ' · ', record.stale ? 'STALE' : 'captured diff'), h('p', null, 'Project: ', record.projectPath, ' · Session: ', record.sessionId), h('code', null, 'Fingerprint: ' + record.git.fingerprint),
                  h('div', { className: 'wt-row' }, command('Refresh state / verify staleness', () => open(record.id)), command('Cancel work', () => act({ action: 'cancel', projectId, id: record.id, confirm: true }, () => open(record.id)), !recordBusy)),
                  h('details', null, h('summary', null, 'Git status'), h('pre', null, record.git.status)), h('details', null, h('summary', null, 'Staged diff'), h('pre', null, record.git.staged || 'No staged changes')), h('details', null, h('summary', null, 'Unstaged diff'), h('pre', null, record.git.unstaged || 'No unstaged changes')),
                  h('h3', null, 'Choose documented checks'), !record.docs.checks.length && h('p', null, 'No supported documented checks found.'),
                  ...record.docs.checks.map(check => h('div', { key: check.id, className: 'wt-check' }, h(Checkbox, { label: check.command, checked: checks.includes(check.id), disabled: busy || recordBusy || record.stale, onChange: checked => setChecks(previous => checked ? [...previous, check.id] : previous.filter(id => id !== check.id)) }), h('p', { className: 'wt-muted' }, 'Source: ' + check.source), h('code', null, 'CWD: ' + record.projectPath))),
                  h('div', { className: 'wt-row' }, command('Run selected checks', () => act({ action: 'run_checks', projectId, id: record.id, fingerprint: record.git.fingerprint, checkIds: checks, confirm: true }, () => open(record.id)), recordBusy || record.stale || !checks.length, true), command('Run native read-only reviewer', () => act({ action: 'start_review', projectId, id: record.id, fingerprint: record.git.fingerprint, confirm: true }, () => open(record.id)), recordBusy || record.stale)),
                  record.childId && h('p', null, 'Native reviewer session: ', h('code', null, record.childId)),
                  (record.caveats ?? []).map((caveat,index) => h('p', { key: index, className: 'wt-muted' }, caveat)))),
              tab === 'notebook' && h('section', null, h('h2', null, 'Project research notebook'), h('p', null, 'Save Firecrawl materials from this conversation with their URL and retrieval date. Keep source quotations separate from your notes and conclusions.'),
                command('List completed Firecrawl sources', () => act({ action: 'firecrawl_sources', projectId, sessionId }, value => { setSources(value.sources); setSourceSeq(''); setRecord(null); }), !hasContext, true),
                h('p', null, h('select', { 'aria-label': 'Completed Firecrawl result', value: sourceSeq, onChange: event => { const seq = event.target.value; navigate(() => { setSourceSeq(seq); setRecord(null); setMarkdown(''); setNotes(''); setQuestions(''); setQuotes(''); setDirty(false); }); } }, h('option', { value: '' }, 'Select completed source'), ...sources.map(source => h('option', { key: source.seq, value: String(source.seq) }, source.title + ' · ' + source.url + ' · seq ' + source.seq)))),
                h('h3', null, 'User conclusions and notes (not source evidence)'), h('textarea', { 'aria-label': 'User notes', value: notes, onChange: event => { setDirty(true); setNotes(event.target.value); } }),
                h('h3', null, 'Verbatim quotes'), h('p', { className: 'wt-muted' }, 'Separate quotations with a blank line, --- on its own line, then a blank line. Quotes are marked verified only when found exactly in the captured source.'), h('textarea', { 'aria-label': 'Verbatim quotes', value: quotes, onChange: event => { setDirty(true); setQuotes(event.target.value); } }),
                h('h3', null, 'Linked questions'), h(Input, { 'aria-label': 'Linked questions', value: questions, onChange: event => { setDirty(true); setQuestions(event.target.value); } }),
                h('div', { className: 'wt-row' }, command('Capture preview / verify quotes', () => act({ action: 'capture_preview', ...noteArgs() }, value => { setMarkdown(value.markdown); setNotice('Preview only. Select Save to persist.'); }), !hasContext || !sourceSeq), command('Save new note', () => act({ action: 'note_save', ...noteArgs() }, saved), !hasContext || !sourceSeq, true))),
              record && h('section', null, h('h3', null, 'Selected durable record'), h('p', null, record.kind + ' · ' + record.id + ' · ' + record.createdAt), h('div', { className: 'wt-row' }, command('Export saved Markdown', exportRecord), command('Copy saved Markdown', async () => { const value = await loadSavedMarkdown(args => act(args), projectId, record.id); if (value) await copy(value.markdown); }))),
              markdown && h(Preview, { text: markdown })
            ), h('aside', { className: 'wt-saved', 'aria-label': 'Saved project records' }, h('h2', null, 'Saved in this project'), command('Refresh saved records', refreshRecords, !projectId), ...records.map(item => h(Button, { key: item.id, variant: 'ghost', onClick: () => navigate(() => open(item.id)), disabled: busy }, item.title + ' · ' + item.state + ' · ' + new Date(item.createdAt).toLocaleString('en-US'))), !records.length && h('p', { className: 'wt-muted' }, 'No saved records.')))
          ));
      }
      ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({ name: 'sidebar.panellist', id: ID, order: 50, label: () => t('title') }, Icon));
      ctx.slots.inject('main', () => ctx.slots.register({ name: 'main', key: ID }, Page));
      ctx.slots.inject('conversation.session.header.actions', () => ctx.slots.register({ name: 'conversation.session.header.actions', id: ID + ':actions', order: 30, label: () => t('title') }, ContextActions));
      ctx.effect(() => () => { if (visible) ctx.layout.selectPanel(null); contextSession = ''; contextTab = 'notebook'; });
    } };
  }
});
