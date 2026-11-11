import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { installLocalPlugins, mergeSettings } from '../install-local-plugins.mjs';

const base = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
test('portable bundles resolve from a fresh profile and preserve unrelated packages', () => {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-kit-test-'));
  try {
    const manifest = { dependencies: { existing: '1.2.3' }, dsh: { profile: { bundles: ['existing'] } } };
    installLocalPlugins(base, profile, manifest);
    installLocalPlugins(base, profile, manifest);
    assert.equal(manifest.dependencies.existing, '1.2.3');
    assert.equal(new Set(manifest.dsh.profile.bundles).size, manifest.dsh.profile.bundles.length);
    for (const p of JSON.parse(fs.readFileSync(path.join(base, 'plugins.json')))) {
      const target = path.join(profile, manifest.dependencies[p.name].slice(5));
      const pkg = JSON.parse(fs.readFileSync(path.join(target, 'package.json')));
      assert.equal(pkg.version, p.version);
      assert.ok(fs.existsSync(path.join(target, pkg.dsh.bundle.patch)));
      const entry = typeof pkg.exports['.'] === 'string' ? pkg.exports['.'] : pkg.exports['.'].default;
      assert.ok(fs.existsSync(path.join(target, entry)));
    }
  } finally { fs.rmSync(profile, { recursive: true, force: true }); }
});

test('settings merge preserves unrelated user settings and is idempotent', () => {
  const before = [{ id: 'subagent', config: { custom: true, maxDepth: 9 } }, { id: 'other', config: { keep: true } }];
  const settings = JSON.parse(fs.readFileSync(path.join(base, 'payload/settings.json')));
  const result = mergeSettings(before, settings);
  assert.equal(result.find(x => x.id === 'subagent').config.custom, true);
  assert.equal(result.find(x => x.id === 'subagent').config.maxDepth, 1);
  assert.deepEqual(result.find(x => x.id === 'other'), before[1]);
  assert.deepEqual(mergeSettings(result, settings), result);
  assert.equal(before[0].config.maxDepth, 9);
});
