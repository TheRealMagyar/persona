# Persona integrations

Persona is controlled through narrow local contracts: MCP tools, HTTP endpoints,
URL protocol, and optional process-scoped audio meters. The renderer never sees
raw audio, transcripts, prompts, credentials, or host-app internals.

## Overview

| Path | Used for |
| --- | --- |
| MCP `http://127.0.0.1:47831/mcp` | Grok Build / Codex tools |
| HTTP `/speak`, `/listen`, `/hooks/*` | TTS, hooks, scripts |
| HTTP `/events` | Low-level state / level / animation events |
| `persona://…` | OS URL protocol (packaged apps) |
| Process audio listener | Codex / ChatGPT desktop voice lip-sync |
| Built-in chat terminal | Local `grok -p` + TTS |

Default bind: `127.0.0.1:47831` (`PERSONA_BRIDGE_PORT` to override).

---

## MCP server

Persona serves a **Streamable HTTP** MCP endpoint while the app is running.

### Grok Build

```bash
grok mcp add --transport http persona http://127.0.0.1:47831/mcp
```

`~/.grok/config.toml`:

```toml
[mcp_servers.persona]
url = "http://127.0.0.1:47831/mcp"
enabled = true
```

```bash
grok mcp list
grok mcp doctor persona
```

Reload in an open session: `/mcps` → `r`, or start a new session.

### Codex

```bash
codex mcp add persona --url http://127.0.0.1:47831/mcp
codex mcp get persona
```

### Tools

| Tool | Input | Effect |
| --- | --- | --- |
| `speak` | `text` (required), optional `audio` (default true), optional `voice` | macOS TTS (`say`), synthetic level envelope, talk pose |
| `listen` | — | Listening pose; stops current speech |
| `stop_speaking` | — | Stops TTS and returns toward idle |
| `play_animation` | `animation`: `idle` \| `greeting` \| `talk` \| `happy` \| `finger-gun` \| `dance` | One-shot body clip (MCP priority) |
| `control_window` | `action`: `show` \| `hide` \| `toggle` | Window visibility |
| `get_status` | — | JSON: window, voice state, listener, speaking flag |

Server instructions tell clients to call `speak` for user-facing replies so
text chat still drives the character.

Animation names are a product contract, not file paths. Swap VRMA media without
changing MCP config.

One-shot MCP animations take temporary priority over idle/talk loops. Lip sync
continues during the clip. A newer one-shot replaces the current one; when it
finishes, Persona returns to the current idle or speaking base.

---

## Grok hooks (automatic text-chat behavior)

Hooks make Persona react to Grok **without** the model remembering to call MCP
every time.

| Event | Endpoint | Behavior |
| --- | --- | --- |
| `UserPromptSubmit` | `POST /hooks/prompt` | Listening pose |
| `Stop` (`end_turn`) | `POST /hooks/stop` | Speak `lastAssistantMessage` (TTS + lips) |

### Install (HTTP hooks — recommended)

`~/.grok/hooks/persona.json`:

```json
{
  "hooks": {
    "UserPromptSubmit": [
      {
        "hooks": [
          {
            "type": "http",
            "url": "http://127.0.0.1:47831/hooks/prompt",
            "timeout": 5
          }
        ]
      }
    ],
    "Stop": [
      {
        "hooks": [
          {
            "type": "http",
            "url": "http://127.0.0.1:47831/hooks/stop",
            "timeout": 10
          }
        ]
      }
    ]
  }
}
```

Or in `~/.grok/config.toml`:

```toml
[[hooks.UserPromptSubmit]]
hooks = [
  { type = "http", url = "http://127.0.0.1:47831/hooks/prompt", timeout = 5 },
]

[[hooks.Stop]]
hooks = [
  { type = "http", url = "http://127.0.0.1:47831/hooks/stop", timeout = 10 },
]
```

Repo copies live under `scripts/grok-persona-hooks/`.

**Requirements:** Persona running; **new Grok session** after installing hooks;
check `/hooks` in the UI.

Stop hooks skip `channel_closed` / `shutdown`. Empty `lastAssistantMessage` is
ignored. Nested speak of the same text is deduped for a few seconds.

---

## Speech (TTS)

`electron/speech-driver.cjs` drives text chat speech:

1. Strip markdown noise, truncate long replies  
2. Pick voice (Hungarian diacritics / common HU words → **Tünde**, else Samantha / `PERSONA_TTS_VOICE`)  
3. `say` on macOS when `audio: true`  
4. Synthetic amplitude envelope for lip sync  
5. Voice state `speaking` → renderer talk loop  

Manual:

```bash
curl -H 'Content-Type: application/json' \
  --data '{"text":"Szia! Most a Persona beszél.","audio":true}' \
  http://127.0.0.1:47831/speak
```

```bash
curl -X POST http://127.0.0.1:47831/listen
```

---

## Built-in chat terminal

The Electron window includes a bottom terminal. Submitting a line:

1. Listening pose  
2. `grok -p` with short companion rules and tools disabled  
3. `speak` on the reply  

Override binary: `PERSONA_GROK_BIN`.

---

## Process audio listeners

Used for **Codex / ChatGPT desktop voice** lip-sync, not for Grok CLI text chat.

### Default targets

| Application | Matched by default |
| --- | --- |
| Codex (`Codex`, `codex-desktop`, `openai-codex`) | Yes |
| ChatGPT | Yes |
| Grok CLI (`grok`, versioned binaries) | **No** |

Matching the Grok CLI is off by default: it has no process playback stream, so
the native helper failed and retried every poll (CPU thrash, hitchy UI).

Enable experimental Grok process matching only if you know you need it:

```bash
PERSONA_MATCH_GROK_PROCESS=1 npm start
```

Custom app:

```bash
PERSONA_TARGET_PROCESS_PATTERN='my-voice-app' npm start
```

Paths like `persona-grok` or `~/.grok/config.toml` alone do not match.

### Platform notes

**Linux** — PipeWire graph; `pw-record` on one stream; RMS in memory; samples discarded.

**Windows** — WASAPI app loopback, process tree include mode; Win10 20348+.

**macOS** — Core Audio process tap + private aggregate; macOS 14.2+; System Audio Recording permission once.

Failures use exponential backoff (5s → 60s) so a bad target does not spin the helper forever.

---

## URL protocol

Packaged installs register `persona://`.

| URL | Effect |
| --- | --- |
| `persona://show` | Show and focus |
| `persona://hide` | Hide without quitting |
| `persona://toggle` | Toggle visibility |
| `persona://listening` | Listening state |
| `persona://thinking` | Idle while preparing |
| `persona://speaking?level=0.3` | Speaking + optional level |
| `persona://inactive` | End voice state |
| `persona://greeting` / `happy` / `finger-gun` / `dance` | Preview motions |

`open` (macOS), `xdg-open` (Linux), `start` (Windows).

---

## Loopback HTTP API

Host must be loopback. Native clients may omit `Origin`. Browsers limited to
trusted local origins.

### `GET /health`

```json
{ "ok": true, "lastState": null }
```

No user content.

### `POST /events`

Voice state:

```json
{
  "type": "state",
  "state": {
    "phase": "active",
    "activity": "speaking",
    "microphoneMuted": false,
    "outputMuted": false
  }
}
```

Phases: `inactive` \| `starting` \| `active` \| `stopping`  
Activities: `idle` \| `listening` \| `speaking`

Level:

```json
{ "type": "audio-level", "level": 0.31 }
```

Animation:

```json
{ "type": "animation", "animation": "DANCE" }
```

Allowed: `IDLE`, `GREETING`, `TALK`, `HAPPY`, `FINGER_GUN`, `DANCE`.

```bash
curl -H 'Content-Type: application/json' \
  --data '{"type":"state","state":{"phase":"active","activity":"speaking","microphoneMuted":false,"outputMuted":false}}' \
  http://127.0.0.1:47831/events
```

### `POST /speak`

```json
{ "text": "Hello", "audio": true, "voice": "Tünde" }
```

Fire-and-forget `202` so hooks are not blocked for the full TTS duration.

### `POST /listen`

Listening pose.

### `POST /hooks/prompt` / `POST /hooks/stop`

Grok HTTP hook payloads (see above).

### `POST /mcp`

Streamable HTTP MCP (JSON-RPC body).

---

## Environment variables

| Variable | Meaning |
| --- | --- |
| `PERSONA_BRIDGE_PORT` | Listen port (default `47831`) |
| `PERSONA_TARGET_PROCESS_PATTERN` | Custom process regex |
| `PERSONA_MATCH_GROK_PROCESS=1` | Include Grok CLI in process audio matching |
| `PERSONA_TTS_VOICE` | Default English `say` voice |
| `PERSONA_GROK_BIN` | Path to `grok` for chat terminal |
| `PERSONA_DEBUG=1` | Verbose main logs |
| `PERSONA_DEV_MODEL_URL` / `PERSONA_DEV_VRMA_BASE` | Override dev asset download URLs |
| `ELECTRON_RUN_AS_NODE` | Must be **unset** when launching Electron |

---

## Security notes

- Loopback-only HTTP; non-loopback `Host` rejected  
- No mic capture; process audio is meter-only and discarded  
- MCP tools do not expose shell or arbitrary paths  
- TTS text is local `say` only  
- Character assets are separate from the MIT app license until you clear redistribution  
