# Developing Persona (Grok Build)

## Architecture

Persona has intentionally narrow layers:

1. **Native / PipeWire listeners** (optional) — discover Codex/ChatGPT playback and emit normalized levels.  
2. **Speech driver** — local TTS + synthetic level envelope for text chat.  
3. **Electron main** — window, tray, shortcuts, bridge HTTP, MCP, chat (`grok -p`), protocol URLs.  
4. **Preload** — sandboxed bridge: events, chat, visibility, hide.  
5. **Renderer (React + Three.js + VRM)** — model, one stable idle/talk loop, one-shot clips, lip sync, blink, UI chrome + terminal.

No renderer access to filesystem, process list, or raw audio.

```text
┌─────────────────────────────────────────────────────────┐
│  Grok Build / Codex                                     │
│   MCP tools · HTTP hooks · optional process audio       │
└───────────────────────┬─────────────────────────────────┘
                        │ 127.0.0.1:47831
┌───────────────────────▼─────────────────────────────────┐
│  Electron main                                          │
│   bridge-server · mcp-server · speech-driver            │
│   chat-service · process discovery · native helper      │
└───────────────────────┬─────────────────────────────────┘
                        │ IPC (preload)
┌───────────────────────▼─────────────────────────────────┐
│  Renderer                                               │
│   Scene / Avatar · ChatTerminal · WindowChrome          │
└─────────────────────────────────────────────────────────┘
```

## Key modules

| Path | Role |
| --- | --- |
| `electron/main.cjs` | App lifecycle, window, tray, wiring |
| `electron/bridge-server.cjs` | HTTP: health, events, speak, hooks, MCP |
| `electron/mcp-server.cjs` | MCP tool schemas + handlers |
| `electron/speech-driver.cjs` | TTS + lip envelope |
| `electron/chat-service.cjs` | Headless `grok -p` for terminal |
| `electron/voice-app-identity.cjs` | Process identity patterns |
| `electron/process-discovery.cjs` | macOS/Windows process trees |
| `electron/native-process-audio-listener.cjs` | Spawns native helper + backoff |
| `electron/linux-pipewire-listener.cjs` | Linux capture |
| `src/hooks/useVrmAnimation.ts` | Stable clip play (no idle restart thrash) |
| `src/hooks/useAmplitudeLipSync.ts` | Visemes from level |
| `src/components/ChatTerminal.tsx` | In-window chat UI |
| `src/components/WindowChrome.tsx` | Drag bar |
| `scripts/fetch-dev-assets.cjs` | Free local-dev VRM/VRMA download |
| `scripts/grok-persona-hooks/` | Hook install samples |

## Animation policy

- **Idle / talk:** one primary clip each, `LoopRepeat`, never re-`play()` while already on that type.  
- **One-shots** (greeting, happy, dance, finger-gun): `LoopOnce`, force restart on button/MCP.  
- Soft crossfades only; no hard-stop mid-pose.  
- Do not rotate idle clips on a timer (that looked like “replaying” while idle).  
- Frame delta clamped (~1/30s) to avoid hitch spikes.

Primary files: `public/assets/animations/idle.vrma`, `talk1.vrma`, etc. Catalog: `src/animation-catalog.ts`.

## MCP contract

`electron/mcp-server.cjs` owns tool schemas and maps calls to main callbacks only.
It does not receive the Electron `app` object, renderer handles, arbitrary paths,
or shell execution.

Each `POST /mcp` uses a fresh Streamable HTTP transport (stateless).

When extending tools:

- prefer a small product action over internal Electron primitives;  
- closed schemas for every argument;  
- accurate read-only / side-effect hints;  
- self-contained server instructions;  
- protocol-level tests for discovery, valid calls, and rejects.

## Listener contract

All platforms:

- `onSession(active)`  
- `onActivity("listening" | "speaking")`  
- `onLevel(0..1)`  
- `onStatus(...)`

`AudioActivityGate` smooths short silences for body talk vs lips.

Native helpers (macOS/Windows) emit NDJSON on stdout:

```json
{"type":"ready","source":"macOS process audio"}
{"type":"level","level":0.21}
{"type":"error","message":"..."}
```

Failed captures use backoff (5s → 60s). Default process match excludes Grok CLI;
see [INTEGRATIONS.md](INTEGRATIONS.md).

## Commands

```bash
npm run lint
npm test                 # node + vitest
npm run test:node
npm run test:renderer
npm run assets:check
npm run assets:dev-pack
npm run build
npm run native:build
npm run native:test
npm run dev              # Vite HMR + Electron
npm start                # Electron only (uses dist/)
npm run demo             # build + start
npm run check            # lint, test, assets, audit, build
```

`npm start` / `npm run demo` run `env -u ELECTRON_RUN_AS_NODE` so a polluted shell
does not break Electron.

Native build:

- **Linux** — no compile; uses system PipeWire tools  
- **macOS** — Objective-C++ / Core Audio → `native/bin/darwin/persona-audio-listener`  
- **Windows** — VS Build Tools / WASAPI → `native/bin/win32/…`

## Tests

Node (`electron/*.test.cjs`, `scripts/*.test.cjs`): MCP, bridge, protocol, process
discovery, speech driver, chat helpers, assets, native paths, etc.

Vitest: animation catalog, crossfade, priority, camera framing.

CI cannot open a real voice call or grant OS audio permissions — use the manual
checklist in [RELEASING.md](RELEASING.md) before shipping.

## Local debug

```bash
PERSONA_DEBUG=1 npm start
curl -s http://127.0.0.1:47831/health
curl -s -X POST http://127.0.0.1:47831/speak \
  -H 'Content-Type: application/json' \
  -d '{"text":"Teszt","audio":true}'
```

## Native API references

- Apple: [Capturing system audio with Core Audio taps](https://developer.apple.com/documentation/coreaudio/capturing-system-audio-with-core-audio-taps)  
- Microsoft: [Application loopback audio capture](https://learn.microsoft.com/en-us/samples/microsoft/windows-classic-samples/applicationloopbackaudio-sample/)  
