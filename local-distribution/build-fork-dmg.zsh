#!/bin/zsh
set -eu
setopt pipefail
if (( $# != 2 )); then
  print -u2 'Usage: build-fork-dmg.zsh <fork.app> <output.dmg>'
  exit 2
fi
app=${1:A}
output=${2:A}
kit=${0:A:h}
[[ -d "$app" && ! -e "$output" ]]
stage=$(mktemp -d)
trap 'rm -rf -- "$stage"' EXIT
root="$stage/volume"
integration="$root/Integrations"
mkdir -p "$integration/payload" "$integration/plugins"
codesign --verify --deep --strict "$app"
# Read the kit manifest with the Node runtime supplied by this exact app.
electron="$app/Contents/MacOS/DeepSeek Harness"
archive=$(ELECTRON_RUN_AS_NODE=1 "$electron" -p 'JSON.parse(require("fs").readFileSync(process.argv[1])).codex.package' "$kit/versions.json")
[[ "$archive" == payload/dsh-codex-auth-*.tgz && "${archive:t}" == "${archive#payload/}" ]]
ditto --noextattr --norsrc "$app" "$root/DeepSeek Harness (Pi 1.5.2).app"
codesign --verify --deep --strict "$root/DeepSeek Harness (Pi 1.5.2).app"
ln -s /Applications "$root/Applications"
cp "$kit/Configure Fork.command" "$root/Настроить Harness.command"
cp "$kit/docs/MACOS-FORK.ru.md" "$root/Установка.txt"
cp "$kit"/{LICENSE,configure.mjs,install-local-plugins.mjs,plugins.json,versions.json} "$integration/"
cp "$kit/$archive" "$integration/payload/"
cp -R "$kit"/payload/{dsh-codex-role-compat,graphify,roles.yml,settings.json,open-design.json} "$integration/payload/"
cp -R "$kit"/plugins/{project-passport,workspace-tools,task-templates} "$integration/plugins/"
hdiutil create -quiet -fs HFS+ -format UDZO -volname 'DSH Fork macOS ARM64' -srcfolder "$root" "$stage/release.dmg"
mv "$stage/release.dmg" "$output"
