window.__ModuleLoader__.load({
  id: '@dsh-local/view-fdb987b9-a0c5-4c5a-95a7-cb6447e1e59b',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const ID = '@dsh-local/view-fdb987b9-a0c5-4c5a-95a7-cb6447e1e59b';
    const KEY = ID + ':templates:v1';
    const pattern = () => /\{\{\s*([^{}]+?)\s*\}\}/gu;
    const parameters = text => [...new Set([...text.matchAll(pattern())].map(m => m[1].trim()).filter(Boolean))];
    const fill = (text, values) => text.replace(pattern(), (match, name) => Object.hasOwn(values, name.trim()) ? values[name.trim()] : match);
    const dictionaries = {
      ru: {title:'Шаблоны заданий', back:'К беседе', intro:'Собственные шаблоны на этом устройстве. Готовый текст не отправляется агенту.', empty:'Библиотека пока пуста. Добавьте первый шаблон ниже.', add:'Добавить шаблон', name:'Название', text:'Текст шаблона', hint:'Параметры обозначаются так: {{тема}}. Одинаковые параметры заполняются один раз.', save:'Сохранить шаблон', choose:'Выберите шаблон', params:'Параметры', none:'В этом шаблоне нет параметров.', preview:'Готовое задание', copy:'Копировать', copied:'Скопировано', copyError:'Не удалось скопировать. Выделите текст задания и скопируйте вручную.', storageError:'Не удалось прочитать локальную библиотеку. Сохранение отключено, чтобы не потерять данные.', saveError:'Не удалось сохранить. Проверьте доступ к локальному хранилищу.', required:'Заполните название и текст.', missing:'Заполните все параметры для копирования.', saved:'Шаблон сохранён.'},
      en: {title:'Task templates', back:'Back to conversation', intro:'Your templates on this device. Prepared text is never sent to the agent.', empty:'Your library is empty. Add your first template below.', add:'Add template', name:'Name', text:'Template text', hint:'Use parameters like {{topic}}. Repeated parameters are filled once.', save:'Save template', choose:'Choose a template', params:'Parameters', none:'This template has no parameters.', preview:'Prepared task', copy:'Copy', copied:'Copied', copyError:'Could not copy. Select the prepared text and copy it manually.', storageError:'Could not read the local library. Saving is disabled to protect your data.', saveError:'Could not save. Check access to local storage.', required:'Enter a name and template text.', missing:'Fill all parameters to copy.', saved:'Template saved.'}
    };
    return {
      inject: ['slots', 'layout', 'locale'],
      apply(ctx) {
        for (const [locale, dict] of Object.entries(dictionaries)) ctx.effect(() => ctx.locale.register(ID, locale, dict));
        const t = ctx.locale.bind(ID);
        let selected = false;
        function Icon({size = 20, active}) {
          selected = active;
          return h('svg', {width:size, height:size, viewBox:'0 0 24 24', fill:'none', stroke:'currentColor', strokeWidth:1.7, 'aria-hidden':true}, h('rect',{x:5,y:3,width:15,height:18,rx:2}), h('path',{d:'M2 7h5M2 12h5M2 17h5M11 8l-2 4 2 4m4-8 2 4-2 4'}));
        }
        function Page() {
          React.useSyncExternalStore(fn => ctx.locale.subscribe(fn), () => ctx.locale.getSnapshot());
          const [initial] = React.useState(() => {
            try {
              const raw = localStorage.getItem(KEY);
              const data = raw === null ? [] : JSON.parse(raw);
              if (!Array.isArray(data) || data.some(x => !x || typeof x.id !== 'string' || typeof x.name !== 'string' || typeof x.text !== 'string')) throw Error('Invalid library');
              return {data, error:false};
            } catch { return {data:[], error:true}; }
          });
          const [items, setItems] = React.useState(initial.data);
          const [current, setCurrent] = React.useState('');
          const [name, setName] = React.useState('');
          const [text, setText] = React.useState('');
          const [values, setValues] = React.useState({});
          const [status, setStatus] = React.useState('');
          const chosen = items.find(x => x.id === current);
          const names = chosen ? parameters(chosen.text) : [];
          const valueOf = n => Object.hasOwn(values, n) ? values[n] : '';
          const complete = names.every(n => valueOf(n).trim());
          const result = chosen ? fill(chosen.text, values) : '';
          function save(e) {
            e.preventDefault();
            if (initial.error) return;
            if (!name.trim() || !text.trim()) {setStatus('required'); return;}
            try {
              // Read again before appending so another open window's additions are preserved.
              const raw = localStorage.getItem(KEY);
              const latest = raw === null ? [] : JSON.parse(raw);
              if (!Array.isArray(latest) || latest.some(x => !x || typeof x.id !== 'string' || typeof x.name !== 'string' || typeof x.text !== 'string')) throw Error('Invalid library');
              const item = {id:crypto.randomUUID(), name:name.trim(), text};
              const next = [...latest, item];
              localStorage.setItem(KEY, JSON.stringify(next));
              setItems(next); setCurrent(item.id); setValues({}); setName(''); setText(''); setStatus('saved');
            } catch {setStatus('saveError');}
          }
          async function copy() {
            try {await navigator.clipboard.writeText(result); setStatus('copied');}
            catch {setStatus('copyError');}
          }
          const field = (label, control) => h('label', {className:'tt-field', key:label}, h('span',null,label), control);
          return h('section', {className:'tt-page'},
            h('style',null,`.tt-page{height:100%;box-sizing:border-box;overflow:auto;padding:24px;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-base);font:14px/1.5 inherit}.tt-page *{box-sizing:border-box}.tt-wrap{max-width:900px;margin:auto}.tt-page h1{font-size:22px;margin:16px 0 8px}.tt-page h2{font-size:16px;margin:0 0 16px}.tt-card{padding:20px;margin:20px 0;border:1px solid var(--dsw-alias-border-l1);border-radius:12px;background:var(--dsw-alias-bg-layer-1)}.tt-field{display:flex;flex-direction:column;gap:6px;margin:12px 0}.tt-page input,.tt-page textarea,.tt-page select{width:100%;font:inherit;color:inherit;background:var(--dsw-alias-bg-base);border:1px solid var(--dsw-alias-border-l2);border-radius:8px;padding:9px 12px}.tt-page textarea{resize:vertical;min-height:130px}.tt-page button{font:inherit;color:inherit;background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l2);border-radius:8px;padding:8px 14px;cursor:pointer}.tt-page button:disabled{opacity:.5;cursor:default}.tt-page :focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px}.tt-muted{color:var(--dsw-alias-label-secondary)}.tt-status{white-space:pre-wrap;overflow-wrap:anywhere}`),
            h('div',{className:'tt-wrap'},
              h('button',{onClick:() => ctx.layout.selectPanel(null)},t('back')),
              h('h1',null,t('title')),h('p',{className:'tt-muted'},t('intro')),
              initial.error && h('p',{role:'alert'},t('storageError')),
              !items.length && !initial.error && h('p',null,t('empty')),
              items.length > 0 && h('div',{className:'tt-card'},
                field(t('choose'),h('select',{value:current,onChange:e => {setCurrent(e.target.value);setValues({});setStatus('');}},h('option',{value:''},t('choose')),items.map(x => h('option',{key:x.id,value:x.id},x.name)))),
                chosen && h(React.Fragment,null,h('h2',null,t('params')),
                  names.length ? names.map(n => field(n,h('input',{key:n,value:valueOf(n),onChange:e => {setValues(v => ({...v,[n]:e.target.value}));setStatus('');}}))) : h('p',{className:'tt-muted'},t('none')),
                  field(t('preview'),h('textarea',{readOnly:true,value:result,rows:9})),
                  !complete && h('p',{className:'tt-muted'},t('missing')),
                  h('button',{disabled:!complete,onClick:copy},t('copy')))),
              h('form',{className:'tt-card',onSubmit:save},h('h2',null,t('add')),
                field(t('name'),h('input',{value:name,required:true,onChange:e=>setName(e.target.value),disabled:initial.error})),
                field(t('text'),h('textarea',{value:text,required:true,onChange:e=>setText(e.target.value),disabled:initial.error})),
                h('p',{className:'tt-muted'},t('hint')),h('button',{type:'submit',disabled:initial.error},t('save'))),
              h('p',{className:'tt-status',role:'status','aria-live':'polite'},status ? t(status) : '')));
        }
        ctx.slots.inject('main', () => ctx.slots.register({name:'main',key:ID},Page));
        ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({name:'sidebar.panellist',id:ID,order:30,label:()=>t('title')},Icon));
        ctx.effect(() => () => {if (selected) ctx.layout.selectPanel(null);});
      }
    };
  }
});
