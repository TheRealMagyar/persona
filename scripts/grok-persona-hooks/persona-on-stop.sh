#!/bin/bash
# Grok Stop → Persona speaks last assistant message (TTS + lip sync)
set -euo pipefail

PAYLOAD="$(cat || true)"
# Only act on genuine end-of-turn completions.
REASON="$(printf '%s' "$PAYLOAD" | python3 -c 'import sys,json
try:
  d=json.load(sys.stdin)
  print(d.get("reason") or "")
except Exception:
  print("")
' 2>/dev/null || true)"

if [ "$REASON" != "end_turn" ] && [ -n "$REASON" ]; then
  # Still allow missing reason (some clients omit it).
  if [ "$REASON" = "channel_closed" ] || [ "$REASON" = "shutdown" ]; then
    exit 0
  fi
fi

TEXT="$(printf '%s' "$PAYLOAD" | python3 -c 'import sys,json
try:
  d=json.load(sys.stdin)
  print(d.get("lastAssistantMessage") or "")
except Exception:
  print("")
' 2>/dev/null || true)"

if [ -z "${TEXT// }" ]; then
  exit 0
fi

# Skip pure tool/debug dumps
if printf '%s' "$TEXT" | grep -Eq '^(Error|Traceback|FAILED)'; then
  exit 0
fi

python3 - "$TEXT" <<'PY' 2>/dev/null || true
import json, sys, urllib.request
text = sys.argv[1]
if len(text) > 4000:
    text = text[:4000]
body = json.dumps({"text": text, "audio": True}).encode()
req = urllib.request.Request(
    "http://127.0.0.1:47831/speak",
    data=body,
    method="POST",
    headers={"Content-Type": "application/json"},
)
try:
    urllib.request.urlopen(req, timeout=3)
except Exception:
    pass
PY
exit 0
