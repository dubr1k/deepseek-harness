import { mkdir, copyFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
await mkdir('dist', { recursive: true });
for (const name of ['index.js', 'data.js', 'client.js']) {
  execFileSync(process.execPath, ['--check', `src/${name}`], { stdio: 'inherit' });
  await copyFile(`src/${name}`, `dist/${name}`);
}
console.log('Built all Host and Client entry points.');
