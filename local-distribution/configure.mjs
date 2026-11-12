import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import {installLocalPlugins, mergeSettings, retireExternalCodexRunner} from './install-local-plugins.mjs';
const app='/Applications/DeepSeek Harness.app';
const executable=path.join(app,'Contents/MacOS/DeepSeek Harness');
const resources=path.join(app,'Contents/Resources');
const require=createRequire(path.join(resources,'app.asar/dsh/package.json'));
const yaml=require('js-yaml');
class Expression { constructor(value) { this.value=value; } }
const schema=yaml.DEFAULT_SCHEMA.extend([new yaml.Type('tag:yaml.org,2002:js',{kind:'scalar',construct:v=>new Expression(v),instanceOf:Expression,represent:v=>v.value})]);
const home=path.join(os.homedir(),'.dsh');
const profile=path.join(home,'profiles/desktop');
const base=path.dirname(fileURLToPath(import.meta.url));
if(!fs.existsSync(path.join(profile,'package.json'))) throw new Error('Launch DSH once, then quit it before setup.');
try { execFileSync('/usr/bin/pgrep',['-f',`${executable}($| --expose-internals .*dsh-desktop-host)`],{stdio:'pipe'}); throw new Error('Quit DSH before setup.'); } catch(e) { if(e.status!==1) throw e; }
const versions=JSON.parse(fs.readFileSync(path.join(base,'versions.json'),'utf8'));
const expected=versions.desktop;
const installed=execFileSync('/usr/bin/plutil',['-extract','CFBundleShortVersionString','raw',path.join(app,'Contents/Info.plist')],{encoding:'utf8'}).trim();
if(installed!==expected) throw new Error(`This kit requires DSH ${expected}; found ${installed}. Validate a new release before upgrading.`);
const backup=path.join(home,'backups',`before-codex-kit-${Date.now()}`);
fs.cpSync(profile,backup,{recursive:true,dereference:false});
try {
 const payload=path.join(base,'payload');
 const plugin=path.join(home,'local-plugins/codex-kit');fs.mkdirSync(plugin,{recursive:true});
 const archive=path.join(plugin,path.basename(versions.codex.package));fs.copyFileSync(path.join(base,versions.codex.package),archive);
 const role=path.join(profile,'created-plugins/dsh-codex-role-compat');fs.cpSync(path.join(payload,'dsh-codex-role-compat'),role,{recursive:true});
 const manifestFile=path.join(profile,'package.json');const manifest=JSON.parse(fs.readFileSync(manifestFile,'utf8'));
 manifest.dependencies??={};manifest.dependencies['dsh-codex-auth']=`file:${archive}`;manifest.dependencies['dsh-codex-role-compat']='link:./created-plugins/dsh-codex-role-compat';
 retireExternalCodexRunner(manifest);
 installLocalPlugins(base,profile,manifest);
 const bundles=manifest.dsh.profile.bundles; if(!bundles.includes('dsh-codex-auth'))bundles.push('dsh-codex-auth');
 manifest.dsh.profile.bundles=bundles.filter(x=>x!=='@deepseek-ai/dsh-subagent-codex');
 fs.writeFileSync(manifestFile,JSON.stringify(manifest,null,2)+'\n');
 const file=path.join(profile,'cordis.patch.yml');const current=yaml.load(fs.readFileSync(file,'utf8'),{schema})??[];
 const roles=yaml.load(fs.readFileSync(path.join(payload,'roles.yml'),'utf8'),{schema});const ids=new Set(roles.map(x=>x.id));
 const settings=JSON.parse(fs.readFileSync(path.join(payload,'settings.json'),'utf8'));
 const next=mergeSettings(current,settings).map(x=>x.insert?{...x,insert:x.insert.filter(v=>!ids.has(v.id))}:x).filter(x=>!x.insert||x.insert.length);
 next.push({insert:roles});
 const python=path.join(resources,'runtime/primary-runtime/dependencies/python/bin/python3.12');
 const codex=path.join(os.homedir(),'.codex/config.toml');
 if(fs.existsSync(codex)) {
  const config=JSON.parse(execFileSync(python,['-B','-c',"import tomllib,json,sys;print(json.dumps(tomllib.load(open(sys.argv[1],'rb')).get('mcp_servers',{}).get('firecrawl',{})))",codex],{encoding:'utf8'}));
  if(config.command){const node='/opt/homebrew/opt/node@24/bin';
   const launcher=path.join(plugin,'firecrawl.py');const secret=path.join(plugin,'firecrawl.json');
   fs.writeFileSync(secret,JSON.stringify(config),{mode:0o600});
   fs.writeFileSync(launcher,`import os,json,shutil\nfrom pathlib import Path\nc=json.loads(Path(__file__).with_name('firecrawl.json').read_text())\nos.environ.update(c.get('env',{}))\nos.environ['PATH']='${node}:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin'\ncmd=shutil.which(c['command'])\nif not cmd: raise RuntimeError('Firecrawl executable missing')\nos.execv(cmd,[cmd,*c.get('args',[])])\n`,{mode:0o700});
   for(const entry of next) if(entry.insert) entry.insert=entry.insert.filter(v=>v.id!=='mcp-firecrawl');
   next.push({insert:[{id:'mcp-firecrawl',name:'@deepseek-ai/dsh-mcp-client',config:{transport:'stdio',serverName:'firecrawl',command:python,args:['-B',launcher],startupTimeoutMs:120000,toolCallTimeoutMs:120000}}]});
  }
 }
 const design=JSON.parse(fs.readFileSync(path.join(payload,'open-design.json'),'utf8'));
 design.config.command=process.env.OPEN_DESIGN_CLI || path.join(os.homedir(),'.local/lib/open-design-shared/od.cjs');
 if(fs.existsSync(design.config.command) && !next.some(e=>e.insert?.some(v=>v.id==='mcp-open-design'))) next.push({insert:[design]});
 fs.writeFileSync(file,yaml.dump(next,{schema,lineWidth:-1,noRefs:true}));
 const skill=path.join(home,'skills/graphify');if(fs.existsSync(skill))fs.cpSync(skill,path.join(backup,'graphify-skill'),{recursive:true});
 fs.cpSync(path.join(payload,'graphify'),skill,{recursive:true});
 const pnpm=path.join(resources,'runtime/primary-runtime/dependencies/pnpm/bin/pnpm.mjs');
 execFileSync(executable,['--expose-internals',pnpm,'install','--ignore-scripts','--no-frozen-lockfile'],{cwd:profile,env:{...process.env,ELECTRON_RUN_AS_NODE:'1',CI:'true'},stdio:'inherit'});
 console.log(`Installed stable integration kit. Backup: ${backup}. Start DSH. Existing conversations and authentication were preserved.`);
} catch(error) {
 const failed=profile+`.failed-${Date.now()}`;fs.renameSync(profile,failed);fs.cpSync(backup,profile,{recursive:true,dereference:false});
 console.error(`Profile restored; failed candidate retained at ${failed}`);throw error;
}
