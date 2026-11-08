#!/bin/zsh
set -eu
cd -- "${0:A:h}"
export ELECTRON_RUN_AS_NODE=1
exec "/Applications/DeepSeek Harness.app/Contents/MacOS/DeepSeek Harness" --expose-internals ./configure.mjs
