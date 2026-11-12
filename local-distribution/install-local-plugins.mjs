import fs from 'node:fs';
import path from 'node:path';

// Copy portable, version-pinned bundles into the target profile. The caller owns backup/rollback.
export function installLocalPlugins(base, profile, manifest) {
  const plugins = JSON.parse(fs.readFileSync(path.join(base, 'plugins.json'), 'utf8'));
  manifest.dependencies ??= {};
  manifest.dsh ??= {};
  manifest.dsh.profile ??= {};
  manifest.dsh.profile.bundles ??= [];
  for (const plugin of plugins) {
    if (!/^[a-z0-9-]+$/.test(plugin.directory)) throw new Error('Invalid plugin directory');
    const source = path.join(base, 'plugins', plugin.directory);
    const pkg = JSON.parse(fs.readFileSync(path.join(source, 'package.json'), 'utf8'));
    if (pkg.name !== plugin.name || pkg.version !== plugin.version || !pkg.dsh?.bundle) throw new Error(`Invalid bundle: ${plugin.directory}`);
    const relative = `created-plugins/stable-kit/${plugin.directory}-${plugin.version}`;
    fs.cpSync(source, path.join(profile, relative), { recursive: true });
    manifest.dependencies[plugin.name] = `link:./${relative}`;
    if (!manifest.dsh.profile.bundles.includes(plugin.name)) manifest.dsh.profile.bundles.push(plugin.name);
  }
  return manifest;
}

export function mergeSettings(current, settings) {
  const result = [...current];
  for (const setting of settings) {
    const i = result.findIndex(entry => entry.id === setting.id);
    if (i < 0) result.push(setting);
    else result[i] = { ...result[i], ...setting, ...(setting.config || result[i].config ? { config: { ...result[i].config, ...setting.config } } : {}) };
  }
  return result;
}

/**
 * Remove the retired external runner whose peers shadow the signed Desktop runtime.
 * @param manifest - target profile manifest; unrelated dependencies and bundles are retained.
 * @returns the same manifest after removing the external runner.
 */
export function retireExternalCodexRunner(manifest) {
  delete manifest.dependencies?.['@deepseek-ai/dsh-subagent-codex'];
  if (manifest.dsh?.profile?.bundles) manifest.dsh.profile.bundles = manifest.dsh.profile.bundles.filter(name => name !== '@deepseek-ai/dsh-subagent-codex');
  return manifest;
}
