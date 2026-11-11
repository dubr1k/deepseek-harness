import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
await mkdir('dist', { recursive: true });
const model = (await readFile('src/ui-model.js', 'utf8')).replace(/^export /gm, '');
for (const name of ['evidence.js','engine.js','index.js','client.js']) {
  let source = await readFile('src/' + name, 'utf8');
  if (name === 'client.js') source = source.replace('/* BUILD_UI_MODEL */', model);
  await writeFile('dist/' + name, source);
  execFileSync(process.execPath, ['--check', 'dist/' + name], { stdio: 'inherit' });
}
console.log('Built all runtime entry points, including tested UI request model.');
