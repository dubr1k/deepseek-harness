import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';
const source = await readFile(new URL('./dist/client.js',import.meta.url),'utf8');
function harness(raw=null, fail=false) {
  let plugin, state=[], cursor=0, storage=raw, copied, selected=null;
  const registrations=[], cleanups=[];
  const React={createElement:(type,props,...children)=>({type,props:props||{},children:children.flat(Infinity).filter(x=>x!==false&&x!=null)}),Fragment:'fragment',useSyncExternalStore:()=>{},useState(initial){const i=cursor++;if(!(i in state))state[i]=typeof initial==='function'?initial():initial;return [state[i],value=>{state[i]=typeof value==='function'?value(state[i]):value;}];}};
  vm.runInNewContext(source,{window:{__ModuleLoader__:{load:p=>{plugin=p.factory(()=>React);}}},localStorage:{getItem:()=>storage,setItem:(k,v)=>{if(fail)throw Error('quota');storage=v;}},crypto:{randomUUID:()=> 'id-'+Math.random()},navigator:{clipboard:{writeText:async text=>{copied=text;}}}});
  const ctx={locale:{register:()=>()=>{},bind:()=>k=>k,subscribe:()=>()=>{},getSnapshot:()=>({})},layout:{selectPanel:p=>selected=p},effect:f=>{cleanups.push(f());},slots:{inject:(key,f)=>{const dispose=f();cleanups.push(dispose);},register:(opts,component)=>{registrations.push({opts,component});return ()=>{registrations.splice(registrations.findIndex(r=>r.component===component),1);};}}};
  plugin.apply(ctx);
  const page=registrations.find(r=>r.opts.name==='main').component;
  const render=()=>{cursor=0;return page();};
  const nodes=(tree,type)=>{const found=[];function walk(n){if(!n||typeof n!=='object')return;if(n.type===type)found.push(n);n.children?.forEach(walk);}walk(tree);return found;};
  return {render,nodes,registrations,get storage(){return storage;},get copied(){return copied;},get selected(){return selected;},dispose(){cleanups.reverse().forEach(f=>f?.());},reset(){state=[];}};
}
test('empty library, add, persistence, repeated parameters and literal replacement',async()=>{
 const a=harness();let tree=a.render();assert.equal(a.nodes(tree,'select').length,0);
 a.nodes(tree,'input')[0].props.onChange({target:{value:'Research'}});
 a.nodes(tree,'textarea')[0].props.onChange({target:{value:'{{тема}} / {{ тема }} / {{toString}}'}});
 tree=a.render();a.nodes(tree,'form')[0].props.onSubmit({preventDefault(){}});
 assert.equal(JSON.parse(a.storage).length,1);
 tree=a.render();assert.equal(a.nodes(tree,'input').length,3);
 const fields=a.nodes(tree,'input');fields[0].props.onChange({target:{value:'$& {{other}}'}});fields[1].props.onChange({target:{value:'safe'}});
 tree=a.render();assert.equal(a.nodes(tree,'textarea')[0].props.value,'$& {{other}} / $& {{other}} / safe');
 await a.nodes(tree,'button').find(n=>n.children.includes('copy')).props.onClick();assert.equal(a.copied,'$& {{other}} / $& {{other}} / safe');
 a.reset();tree=a.render();assert.equal(a.nodes(tree,'option').length,2);
});
test('malformed storage does not overwrite data',()=>{const a=harness('{broken');const tree=a.render();assert.equal(a.nodes(tree,'button').at(-1).props.disabled,true);a.nodes(tree,'form')[0].props.onSubmit({preventDefault(){}});assert.equal(a.storage,'{broken');});
test('save errors preserve draft and do not claim saved',()=>{const a=harness(null,true);let tree=a.render();a.nodes(tree,'input')[0].props.onChange({target:{value:'A'}});a.nodes(tree,'textarea')[0].props.onChange({target:{value:'B'}});tree=a.render();a.nodes(tree,'form')[0].props.onSubmit({preventDefault(){}});tree=a.render();assert.equal(a.nodes(tree,'input')[0].props.value,'A');assert.equal(a.storage,null);assert.ok(a.nodes(tree,'p').some(n=>n.children.includes('saveError')));});
test('owned registration teardown only navigates away when active',()=>{for(const active of [false,true]){const a=harness();a.registrations.find(r=>r.opts.name==='sidebar.panellist').component({active,size:20});a.dispose();assert.equal(a.registrations.length,0);assert.equal(a.selected,null);}});
test('manifest patch and runtime exports are distributable',async()=>{const p=JSON.parse(await readFile('package.json','utf8'));const patch=JSON.parse(await readFile('cordis.patch.yml','utf8'));assert.equal(p.dsh.bundle.patch,'./cordis.patch.yml');for(const op of patch)for(const row of op.insert){assert.ok(row.id.startsWith(p.name+':'));assert.equal(row.name,p.name);}for(const key of ['.','./client','./icon'])assert.ok((await readFile(p.exports[key])).length);for(const l of ['en','ru'])assert.ok(JSON.parse(await readFile(`locale/${l}.json`,'utf8')).meta.title);await import('./dist/index.js');});
