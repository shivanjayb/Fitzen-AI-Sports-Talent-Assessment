#!/usr/bin/env bash
# Clone the two research video-forgery codebases at pinned commits into ./vendor (gitignored).
# They are for offline research on a GPU machine, never shipped in the app. Read README.md first:
# DeepfakeBench is CC BY-NC 4.0 (non-commercial) and face-focused; DeMamba publishes no trained weights.
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p vendor

fetch() { # name url commit
  if [ -d "vendor/$1/.git" ]; then echo "vendor/$1 already present"; return; fi
  git clone --filter=blob:none "$2" "vendor/$1"
  git -C "vendor/$1" checkout --quiet "$3"
  echo "vendor/$1 at $3"
}

fetch DeMamba https://github.com/chenhaoxing/DeMamba.git 646db285f4b473b2678d9a9eeb836f781459fa99
fetch DeepfakeBench https://github.com/SCLBD/DeepfakeBench.git f188b1c105465e2e5377eb536a95022ae0e4522d
