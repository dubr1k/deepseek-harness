#!/bin/zsh
set -eu
cd -- "${0:A:h}"
if [[ -d Integrations ]]; then cd Integrations; fi
name='DeepSeek Harness (Pi 1.5.2).app'
for app in "$HOME/Applications/$name" "/Applications/$name"; do
  if [[ -x "$app/Contents/MacOS/DeepSeek Harness" ]]; then
    export ELECTRON_RUN_AS_NODE=1
    exec "$app/Contents/MacOS/DeepSeek Harness" --expose-internals ./configure.mjs --fork-desktop
  fi
done
print -u2 "Скопируйте $name в Applications или ~/Applications, затем повторите настройку."
exit 1
