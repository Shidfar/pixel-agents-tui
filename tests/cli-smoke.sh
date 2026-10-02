#!/usr/bin/env bash
# Smoke test for the binary: renders demo frames headless, exits 0, restores the screen, quits on stdin EOF.
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p "${HOME}/scratch"
out="$(mktemp -d "${HOME}/scratch/pa-cli.XXXX")"
bun src/cli/main.ts --demo --frames 3 --size 80x24 < /dev/null > "$out/frames.ans"
grep -q $'\x1b\[?1049h' "$out/frames.ans"
grep -q $'\x1b\[?1049l' "$out/frames.ans"
grep -q 'pixel-agents' "$out/frames.ans"
( printf '' | bun src/cli/main.ts --demo --size 80x24 > /dev/null ) &
pid=$!; sleep 3; if kill -0 "$pid" 2>/dev/null; then kill "$pid"; echo "did not exit on stdin EOF"; exit 1; fi
bun build --compile --minify src/cli/main.ts --outfile "$out/pixel-agents" > /dev/null
"$out/pixel-agents" --demo --frames 2 --size 60x20 < /dev/null > /dev/null
echo "cli smoke ok"
