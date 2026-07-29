"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  DEFAULT_VOICE_APP_PATTERN,
  buildDefaultPattern,
  identityMatchesVoiceApp,
} = require("./voice-app-identity.cjs");

test("matches Codex and ChatGPT by default (process audio)", () => {
  const cases = [
    "Codex /Applications/Codex.app/Contents/MacOS/Codex",
    "codex-desktop",
    "ChatGPT.exe",
    "openai-codex",
  ];
  for (const identity of cases) {
    assert.equal(
      identityMatchesVoiceApp(identity, DEFAULT_VOICE_APP_PATTERN),
      true,
      `expected match: ${identity}`,
    );
  }
});

test("does not match Grok CLI by default (no Core Audio stream)", () => {
  const cases = [
    "/Users/me/.grok/bin/grok agent --reasoning-effort xhigh stdio",
    "grok-0.2.114-macos-aarch64",
    "Grok",
  ];
  for (const identity of cases) {
    assert.equal(
      identityMatchesVoiceApp(identity, DEFAULT_VOICE_APP_PATTERN),
      false,
      `expected no match: ${identity}`,
    );
  }
});

test("matches Grok when PERSONA_MATCH_GROK_PROCESS=1", () => {
  const pattern = buildDefaultPattern({ PERSONA_MATCH_GROK_PROCESS: "1" });
  assert.equal(
    identityMatchesVoiceApp(
      "/Users/me/.grok/bin/grok agent --reasoning-effort xhigh stdio",
      pattern,
    ),
    true,
  );
});

test("rejects persona-grok paths and bare .grok directories", () => {
  const cases = [
    "node /Users/me/Documents/GitHub/persona-grok/electron/main.cjs",
    "node /Users/me/Documents/GitHub/persona-grok",
    "cat /Users/me/.grok/config.toml",
    "persona",
    "Music",
    "helium",
  ];
  for (const identity of cases) {
    assert.equal(
      identityMatchesVoiceApp(identity, DEFAULT_VOICE_APP_PATTERN),
      false,
      `expected no match: ${identity}`,
    );
  }
});
