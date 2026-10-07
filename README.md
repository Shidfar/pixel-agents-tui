# pixel-agents

A pixel-art office where every Claude Code agent on your machine is a character. What a character does matches what its agent is doing, the moment it happens: it types at its desk while the agent edits a file, stands up with a red bubble when a permission dialog opens, and walks to the couch when the turn ends.

It ships two ways from one TypeScript engine:

- **The plugin.** `/office` opens the office in a pane beside the Claude Code transcript.
- **The binary.** `pixel-agents` draws the same office full-screen in its own terminal.

![The whole office at noon: four demo sessions, two subagents, labels and bubbles](docs/screenshots/fit-noon.png)

Tested with Claude Code 2.1.287.

## What you see

Every session in every repo shows up, along with its subagents and teammates, for as long as they exist. Nothing is guessed from timers or from reading transcripts: a "waiting for permission" bubble appears exactly when the dialog opens and clears when it is answered, and "idle" means the turn really ended.

| The agent is | The character |
|---|---|
| editing or writing, running a command | types at its desk; the monitor shows code or a terminal, and a bubble shows the file or command |
| reading, searching, thinking | reads at its desk |
| waiting on a permission prompt or a question | stands up, faces you and bobs, with a red `!` or yellow `?` bubble |
| planning | stands at the whiteboard |
| delegating to subagents | leans back at its desk: "waiting on 2 interns" |
| idle | after a few seconds, walks to the couch to watch TV, or gets coffee |
| a subagent that finished | hands over its work, then leaves by the door |

Around the characters the office is alive: the windows follow your local clock and show weather that tracks how full your context window is (clear, clouds, rain, storm, lightning), desk lamps glow at night, a cat wanders, paper planes fly between agents that message each other, and the whiteboard shows today's totals across all sessions. A `git commit` throws confetti, and a test run ends in a check mark or a puff of smoke.

![The office zoomed in at night, in a storm](docs/screenshots/x2-night-storm.png)

On kitty and Ghostty the office is drawn as a true-pixel image instead of terminal cells (HD mode). It turns on by itself there, and `g` toggles it. Terminals that cannot show images get Claude Code's alt text, so press `g` to go back to cells.

![HD mode at native resolution](docs/screenshots/hd.png)

## Install

In Claude Code:

```
/plugin marketplace add Shidfar/pixel-agents-tui
/plugin install pixel-agents@pixel-agents-tui
```

The plugin needs Claude Code 2.1.287 or newer, because it is a hooks module (a mod).

To work on it, clone the repo and start Claude Code with the plugin loaded from the folder:

```
claude --plugin-dir .
```

If Claude Code says `hooks modules are turned off`, that is a rollout switch on Anthropic's side. It is read from a cached copy at startup and can serve "off" for a single run, so start Claude Code again.

## Use

`/office` toggles the pane. It works in the middle of a turn. `/office demo` toggles a scripted crew of four fake sessions with subagents, which is a good way to see everything without waiting for real work.

The pane asks for about half of your terminal's width, between 56 and 128 columns. If the pane was open when your last session ended, the next session reopens it. Claude Code only does that on its own in terminals 144 columns wide or more (110 once you have opened the pane yourself).

A row of buttons along the bottom of the pane shows the hotkeys. The binary uses the same keys.

| Key | Does | Pane | Binary |
|---|---|---|---|
| `z` | cycle the zoom: auto, fit, 2x, 1x | yes | yes |
| `t` | cycle the theme: default, warm, cool, dark, light | yes | yes |
| `l` | show or hide labels | yes | yes |
| `n` | show or hide effects | yes | yes |
| `g` | switch HD pixels on or off | yes | no |
| `d` | toggle the demo crew | yes | yes |
| `q` | quit | no | yes |
| `Esc` | close the pane | yes | no |
| arrow keys | pan the view when zoomed | no | yes |

When another session has an agent waiting on a permission prompt or a question, a one-line band above your prompt says so until it is resolved: `⚠ api-service is waiting: Bash(npm publish)`. Each new wait also gets one toast. Your own session is never alerted, because Claude Code already prompts you there.

The Claude Code desktop app has no pane to draw into, so the plugin shows a text roster instead: each session's agents, with their activity and detail.

## The standalone binary

```
pixel-agents [--demo] [--theme name] [--fps n] [--dir path]
```

It draws the office full-screen in your terminal's alternate screen, with truecolor half-blocks, and quits on `q`, on Ctrl-C and when stdin closes. It reads the same state folder as the pane (see below), so it shows every session that has the plugin loaded. `--demo` runs the scripted crew without any session, and `--dir` reads a different state folder.

Download the binary for your machine from the [releases page](https://github.com/Shidfar/pixel-agents-tui/releases): `pixel-agents-darwin-arm64`, `pixel-agents-darwin-x64`, `pixel-agents-linux-x64` or `pixel-agents-linux-arm64`. Or build it yourself. This needs [Bun](https://bun.sh):

```
npm run build
```

which writes `dist/pixel-agents`.

## How it works

The plugin listens to Claude Code's own hook events: tool calls starting and finishing, permission requests and denials, subagent spawns, turns starting and completing, compaction, and the session starting and ending. A small reducer turns those events into one snapshot per session. A tool is tracked from its start to its end by id, so "done" is never inferred.

No transcript is ever read.

### The state folder and your privacy

Each session writes only its own file, `~/.claude/pixel-agents/sessions/<sessionId>.json`, at most four times a second plus a heartbeat every five seconds. Every open pane and the binary read the whole folder, which is how one office shows all your sessions.

A file holds:

- the session id, a name (the repo folder, with `-2` added for a second session in the same repo) and the working directory path
- for each agent: its label, its current activity, and a short detail, which is a file basename or the first 30 characters of a command
- your context fill as a percentage, a few counters (tools, edits, commits, permission prompts, errors) and the last 32 effects

It stays on your machine, under your home directory. A session whose file has not been updated for 20 seconds counts as gone, and its characters walk out. Files older than an hour are deleted by whichever viewer notices them.

Your preferences (theme, zoom, labels, effects, HD, whether the pane was open) are kept in the plugin's own store inside Claude Code. The binary does not read them.

## Development

You need Node (CI runs 24), [Bun](https://bun.sh), TypeScript and Claude Code 2.1.287 or newer:

```
npm i -g bun typescript
npm ci
```

Every check, from the repo root:

```
claude plugin validate --strict .     # manifest, plus static analysis of hooks/register.ts
claude plugin test                    # every tests/*.test.ts, no session or network needed
tsc -p .                              # engine, hooks and tests
tsc -p src/cli                        # the binary
bash tests/cli-smoke.sh               # the binary draws demo frames, exits on EOF and compiles
```

CI runs the same checks on every push and pull request. A run of `claude plugin test` that prints `hooks modules are turned off` is the rollout switch above, not a failure, so CI reports it as a skipped step with a warning. On a tag that starts with `v`, CI also builds the four binaries and attaches them to a release.

The code is laid out like this:

```
hooks/register.ts      the only file that touches Claude Code's hook API
src/engine/            the pure engine: truth reducer, world, simulation, renderer, art
src/cli/main.ts        the binary
tests/                 engine and mod tests, plus the binary's smoke test
tools/shot/            screenshot tooling
```

`src/engine` is pure. It has no Node or Bun APIs, no `Date`, no `Math.random` and no timers: time, the local hour, the day and random seeds all come in as parameters, which keeps every test deterministic and lets the same engine run inside Claude Code and inside Bun. Its imports have no file extensions, which Claude Code, Bun and `tsc` accept and Node does not, so any script that imports the engine runs under Bun.

### Screenshots

The pictures in this README come from the engine itself, without a Claude session. Run these from the repo root:

```
bun tools/shot/frames.mjs      # fit-noon.png, x2-night-storm.png and hd.png
bun tools/shot/sheet.mjs       # art-sheet.png, every tile and character frame
```

Both write to `docs/screenshots/`. `npm run shots` runs the first.

To capture a real session, `tools/shot/drive.py` runs an interactive `claude` in a pseudo-terminal of a given size, answers its terminal queries, sends your keystrokes and logs the output. `tools/shot/screen.mjs` replays that log in a headless terminal and paints a PNG:

```
python3 tools/shot/drive.py 200 50 session.log . '[["wait",8],["send","/office demo"],["wait",1],["send","\\r"],["wait",8]]' -- --plugin-dir .
node tools/shot/screen.mjs session.log 200 50 session.png
```

The steps are `["wait", seconds]`, `["send", text]` and `["until", text, timeout_seconds]`. Send an escape sequence in one piece, because a split ESC reads as the Esc key. In a folder Claude Code has not seen before, answer its two dialogs first: for the trust dialog `["until","Yes,",15],["wait",1.5],["send","\\u001b[B"],["wait",1],["send","\\r"]`, and for the MCP servers dialog `["until","reject",10],["wait",1],["send","\\u001b"]`.

## Credits and license

The sprite art (tiles, furniture and characters) derives from [pablodelucca/pixel-agents](https://github.com/pablodelucca/pixel-agents), which is MIT licensed. Its license text is in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). The art sheet below shows what was carried over:

![Every tile and character frame in the art](docs/screenshots/art-sheet.png)

The license for this repository's own code has not been decided yet.
