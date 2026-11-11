import {mkdir, readFile, writeFile} from 'node:fs/promises';
import vm from 'node:vm';
await mkdir(new URL('./dist/', import.meta.url), {recursive:true});
for (const file of ['index.js','client.js']) {
  const text = await readFile(new URL('./src/'+file, import.meta.url),'utf8');
  if (file === 'client.js') new vm.Script(text);
  await writeFile(new URL('./dist/'+file, import.meta.url),text);
}
console.log('Built both runtime exports.');
