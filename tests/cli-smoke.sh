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
printf '' | bun src/cli/main.ts --demo --size 80x24 > /dev/null &
pid=$!; sleep 3; if kill -0 "$pid" 2>/dev/null; then kill "$pid"; echo "did not exit on stdin EOF"; exit 1; fi
bun build --compile --minify src/cli/main.ts --outfile "$out/pixel-agents" > /dev/null
"$out/pixel-agents" --demo --frames 2 --size 60x20 < /dev/null > /dev/null
# --shared reads other accounts' folders: a waiting stranger is shown but never alerts (R7); your own
# account's folder, links (R9), a file whose id is not its name and a stale file are not shown, and
# nothing under the shared root is ever deleted.
snap() {
  bun -e '
    import { initialSnapshot } from "./src/engine/truth"
    const now = Date.now()
    const s = initialSnapshot({ sessionId: process.argv[1], name: "api", cwd: "", now, day: "2026-10-05" })
    const waiting = { kind: "permission", tool: "Bash", detail: "npm publish", at: now }
    console.log(JSON.stringify({ ...s, agents: [{ ...s.agents[0], activity: "permission", waiting }] }))
  ' "$1"
}
shared="$out/shared"; elsewhere="$out/elsewhere"; account="$(basename "$HOME")"
mkdir -p "$out/empty" "$shared/pixel-agents-alex/sessions" "$shared/pixel-agents-sneaky" "$elsewhere/sessions"
snap alex-0001 > "$shared/pixel-agents-alex/sessions/alex-0001.json"
snap linked-0001 > "$elsewhere/sessions/linked-0001.json"
ln -s "$elsewhere/sessions/linked-0001.json" "$shared/pixel-agents-alex/sessions/linked-0001.json"
snap other-0001 > "$shared/pixel-agents-alex/sessions/renamed-0001.json"
snap old-0001 > "$shared/pixel-agents-alex/sessions/old-0001.json"; touch -t 202001010000 "$shared/pixel-agents-alex/sessions/old-0001.json"
ln -s "$elsewhere" "$shared/pixel-agents-linked"
ln -s "$elsewhere/sessions" "$shared/pixel-agents-sneaky/sessions"
if [[ "$account" =~ ^[a-z0-9._-]{1,32}$ ]]; then
  mkdir -p "$shared/pixel-agents-$account/sessions"
  snap self-0001 > "$shared/pixel-agents-$account/sessions/self-0001.json"
fi
"$out/pixel-agents" --shared --shared-root "$shared" --dir "$out/empty" --frames 2 --size 80x24 < /dev/null > "$out/shared.ans"
grep -q ' 1 sessions' "$out/shared.ans" || { echo "--shared: expected exactly 1 session"; exit 1; }
grep -q ' 0 waiting' "$out/shared.ans" || { echo "--shared: a foreign session must not count as waiting"; exit 1; }
[ -e "$shared/pixel-agents-alex/sessions/old-0001.json" ] || { echo "--shared: a foreign file was deleted"; exit 1; }
"$out/pixel-agents" --shared-root "$shared" --dir "$out/empty" --frames 2 --size 80x24 < /dev/null > "$out/unshared.ans"
grep -q ' 0 sessions' "$out/unshared.ans" || { echo "without --shared, the shared root must not be read"; exit 1; }
echo "cli smoke ok"
