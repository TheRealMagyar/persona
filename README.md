<p align="center">
  <img src="./public/assets/avatar.png" alt="Persona avatar" width="144" />
</p>

<h1 align="center">Persona (Grok Build)</h1>

<p align="center">
  Desktop character for Grok Build — talks, lip-syncs, and lives next to your editor.
</p>

---

Persona is a cross-platform desktop companion (VRM character) that:

- **Speaks** replies out loud (macOS system TTS) and lip-syncs
- Exposes an **MCP server** so Grok Build (and Codex) can control it
- Can **auto-react** to Grok turns via hooks (listen → speak last message)
- Has a built-in **chat terminal** under the character
- Optionally lip-syncs to **Codex / ChatGPT desktop voice** via process-scoped audio

This tree is based on [xikhar/persona](https://github.com/xikhar/persona), extended for Grok Build text chat and local TTS.

## Platform support

| Platform    | Process voice listener (Codex/ChatGPT) | TTS speak (text chat) | Distribution               |
| ----------- | -------------------------------------- | --------------------- | -------------------------- |
| Linux       | PipeWire process-stream capture        | visual only*          | AppImage and DEB           |
| Windows     | WASAPI process-loopback                | visual only*          | NSIS installer             |
| macOS 14.2+ | Core Audio process tap                 | `say` (e.g. Tünde)    | DMG and ZIP, arm64 and x64 |

\*System TTS is wired for macOS (`say`). Other platforms still drive talk pose + lip envelope without audio unless you plug in another TTS backend.

Linux requires `pw-dump` and `pw-record` on `PATH`. Windows process-loopback needs Windows 10 build 20348+. macOS asks once for System Audio Recording permission (only for process capture).

Persona does **not** capture the microphone, save audio, or send audio over the network. Process listeners discard samples after RMS. Text-chat speech uses local `say` only.

## Quick start (macOS)

Requirements:

- Node.js 24+
- npm
- Hardware-accelerated desktop session
- Xcode Command Line Tools (for `npm run native:build` on macOS)

```bash
npm install

# Download free local-dev model + animations (not for redistribution)
npm run assets:dev-pack

# Native process-audio helper (macOS / Windows)
npm run native:build

# Build renderer + launch
unset ELECTRON_RUN_AS_NODE   # important if this env is set in your shell
npm run demo
```

If Electron fails with “failed to install correctly”:

```bash
rm -rf node_modules/electron/dist
node node_modules/electron/install.js
```

### Window controls

| Input | Action |
| --- | --- |
| Top bar / drag band | Move the window |
| Scroll | Zoom |
| Left-drag (on character) | Orbit |
| Right-drag | Pan |
| Bottom terminal | Chat with Persona (Grok CLI + TTS) |
| Toolbar buttons | Idle / Hi / Talk / Happy / Dance / lip test |
| `⌘⇧A` / `Ctrl+Shift+A` | Toggle visibility |
| Tray menu | Show / hide / previews / quit |

## Connect to Grok Build

1. Start Persona (`npm run demo` or `npm start`).
2. Register MCP (once):

```bash
grok mcp add --transport http persona http://127.0.0.1:47831/mcp
```

Or in `~/.grok/config.toml`:

```toml
[mcp_servers.persona]
url = "http://127.0.0.1:47831/mcp"
enabled = true
```

3. Install hooks so Grok text turns drive Persona automatically (listen on submit, speak on stop):

```bash
# Already documented under scripts/grok-persona-hooks/
# Example install:
mkdir -p ~/.grok/hooks
cp scripts/grok-persona-hooks/persona-hooks.json ~/.grok/hooks/persona.json
```

HTTP hooks (preferred — show up cleanly in Grok `/hooks`):

```json
{
  "hooks": {
    "UserPromptSubmit": [
      {
        "hooks": [
          { "type": "http", "url": "http://127.0.0.1:47831/hooks/prompt", "timeout": 5 }
        ]
      }
    ],
    "Stop": [
      {
        "hooks": [
          { "type": "http", "url": "http://127.0.0.1:47831/hooks/stop", "timeout": 10 }
        ]
      }
    ]
  }
}
```

Or equivalent `[[hooks.*]]` blocks in `~/.grok/config.toml` (see [Integrations](docs/INTEGRATIONS.md)).

4. **New Grok session**, then check `/mcps` and `/hooks`.

### MCP tools

| Tool | Purpose |
| --- | --- |
| `speak` | TTS + lip sync + talk pose (`text`, optional `audio`, `voice`) |
| `listen` | Listening pose |
| `stop_speaking` | Stop TTS / return to idle |
| `play_animation` | One-shot: `idle`, `greeting`, `talk`, `happy`, `finger-gun`, `dance` |
| `control_window` | `show` / `hide` / `toggle` |
| `get_status` | Window, voice state, listener |

### Codex (optional)

```bash
codex mcp add persona --url http://127.0.0.1:47831/mcp
```

## Built-in chat terminal

The bottom panel talks to the local `grok` CLI headless (`grok -p …`), then runs the reply through Persona’s `speak` path (TTS + animation). Requires `grok` on `PATH` or `~/.grok/bin/grok`.

## Process audio (Codex / ChatGPT)

By default the process listener targets **Codex** and **ChatGPT** desktop voice only.

The **Grok CLI is not matched** for process audio: it has no Core Audio/PipeWire playback stream, and matching it only spawned the native helper, failed, and retried (CPU hitch / sticky UI). Text chat uses TTS instead.

| Env | Effect |
| --- | --- |
| `PERSONA_TARGET_PROCESS_PATTERN` | Custom regex for process identity |
| `PERSONA_MATCH_GROK_PROCESS=1` | Also try to tap Grok CLI (usually useless without real audio out) |
| `PERSONA_BRIDGE_PORT` | Override default `47831` |
| `PERSONA_TTS_VOICE` | Default English voice for `say` (Hungarian text prefers **Tünde**) |
| `PERSONA_DEBUG=1` | Verbose main-process logs |
| `PERSONA_GROK_BIN` | Path to `grok` for the chat terminal |

## Character assets

Media is not committed. Stable slots under `public/assets/`:

```text
public/assets/
├── model.vrm
├── manifest.json
└── animations/
    ├── idle.vrma
    ├── idle2.vrma          # optional extra
    ├── talk1.vrma
    ├── talk2.vrma
    ├── talk3.vrma
    ├── greeting.vrma
    ├── happy.vrma
    ├── finger-gun.vrma
    └── dance.vrma
```

Dev pack (local test only):

```bash
npm run assets:dev-pack      # model + animations
npm run assets:dev-model     # model only
npm run assets:check
```

For publishing, complete license/source fields in `manifest.json`, set `distributionAllowed` to `true`, and read [ASSET_LICENSES.md](ASSET_LICENSES.md).

## Build packages

```bash
npm run dist:linux
npm run dist:windows
npm run dist:mac
```

Outputs go to `release/`. See [docs/RELEASING.md](docs/RELEASING.md).

## Development

```bash
npm run check          # lint, tests, assets, audit, build
npm test
npm run native:build
npm run native:test
npm run dev            # Vite + Electron
```

More detail:

- [Architecture and development](docs/DEVELOPMENT.md)
- [Integrations (MCP, hooks, HTTP, listeners)](docs/INTEGRATIONS.md)
- [Release process](docs/RELEASING.md)
- [Security policy](SECURITY.md)

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| `Electron failed to install correctly` | Re-run `node node_modules/electron/install.js` |
| `app.setName` / Electron API undefined | `unset ELECTRON_RUN_AS_NODE` then start again |
| Empty transparent window | Missing `model.vrm` — run `npm run assets:dev-pack` |
| Hooks missing in Grok | New session; check `~/.grok/hooks/persona.json` and `/hooks` |
| MCP offline | Persona must be running; `curl http://127.0.0.1:47831/health` |
| Animation “restarts” while idle | Use current build — idle is a single stable loop |
| Fan spin / hitch with only Grok open | Fixed by not process-tapping Grok CLI by default |

## License

Application source: [MIT License](LICENSE).  
Character assets are excluded until replaced and documented for distribution.
