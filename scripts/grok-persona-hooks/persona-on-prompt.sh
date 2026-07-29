#!/bin/bash
# Grok UserPromptSubmit → Persona listening pose
set -euo pipefail
# Drain stdin (hook payload) so Grok does not block on a full pipe.
cat >/dev/null || true
curl -sS -m 2 -X POST "http://127.0.0.1:47831/listen" \
  -H "Content-Type: application/json" \
  -d '{}' >/dev/null 2>&1 || true
exit 0
