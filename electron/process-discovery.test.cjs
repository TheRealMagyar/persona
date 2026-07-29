"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  configuredPattern,
  parseMacProcessList,
  parseWindowsProcessList,
  selectVoiceProcessTree,
} = require("./process-discovery.cjs");

test("parses macOS ps output and includes a Codex helper process tree", () => {
  const processes = parseMacProcessList(`
  10 1 /Applications/Codex.app/Contents/MacOS/Codex /Applications/Codex.app/Contents/MacOS/Codex
  11 10 /Applications/Codex Helper /Applications/Codex.app/Contents/Frameworks/Codex Helper --type=utility
  20 1 /Applications/Music.app/MacOS/Music /Applications/Music.app/MacOS/Music
`);
  assert.deepEqual(selectVoiceProcessTree(processes, { ownProcessId: 99 }), {
    pids: [10, 11],
    rootPids: [10],
  });
});

test("parses one or many Windows CIM process records", () => {
  const processes = parseWindowsProcessList(
    JSON.stringify([
      {
        ProcessId: 100,
        ParentProcessId: 1,
        Name: "Codex.exe",
        CommandLine: '"C:\\\\Program Files\\\\Codex\\\\Codex.exe"',
      },
      {
        ProcessId: 101,
        ParentProcessId: 100,
        Name: "electron.exe",
        CommandLine: "electron.exe --type=utility",
      },
    ]),
  );
  assert.deepEqual(selectVoiceProcessTree(processes, { ownProcessId: 999 }), {
    pids: [100, 101],
    rootPids: [100],
  });
  assert.equal(parseWindowsProcessList('{"ProcessId":7,"Name":"ChatGPT.exe"}')[0].pid, 7);
});

test("supports a custom target application pattern without accepting invalid regex", () => {
  assert.equal(configuredPattern({ PERSONA_TARGET_PROCESS_PATTERN: "my-voice-app" }).test("my-voice-app"), true);
  assert.equal(configuredPattern({ PERSONA_TARGET_PROCESS_PATTERN: "[" }).test("Codex"), true);
});

test("does not confuse Persona's project path with the Codex application", () => {
  const selected = selectVoiceProcessTree(
    [
      {
        pid: 40,
        parentId: 1,
        name: "persona",
        command: "/home/user/Projects/persona/release/persona",
      },
    ],
    { ownProcessId: 999 },
  );
  assert.deepEqual(selected, { pids: [], rootPids: [] });
});

test("does not select Grok CLI by default (no process audio)", () => {
  const processes = parseMacProcessList(`
  50 1 /Users/me/.grok/bin/grok /Users/me/.grok/bin/grok agent --reasoning-effort xhigh stdio
  51 50 /Users/me/.grok/downloads/grok-0.2.114-macos-aarch64 /Users/me/.grok/downloads/grok-0.2.114-macos-aarch64 agent
  60 1 /Applications/Music.app/MacOS/Music /Applications/Music.app/MacOS/Music
`);
  assert.deepEqual(selectVoiceProcessTree(processes, { ownProcessId: 99 }), {
    pids: [],
    rootPids: [],
  });
});

test("selects the Grok Build CLI when explicitly enabled", () => {
  const { buildDefaultPattern } = require("./voice-app-identity.cjs");
  const processes = parseMacProcessList(`
  50 1 /Users/me/.grok/bin/grok /Users/me/.grok/bin/grok agent --reasoning-effort xhigh stdio
  51 50 /Users/me/.grok/downloads/grok-0.2.114-macos-aarch64 /Users/me/.grok/downloads/grok-0.2.114-macos-aarch64 agent
`);
  assert.deepEqual(
    selectVoiceProcessTree(processes, {
      ownProcessId: 99,
      pattern: buildDefaultPattern({ PERSONA_MATCH_GROK_PROCESS: "1" }),
    }),
    { pids: [50, 51], rootPids: [50] },
  );
});

test("does not match persona-grok paths or the .grok config directory alone", () => {
  const selected = selectVoiceProcessTree(
    [
      {
        pid: 70,
        parentId: 1,
        name: "node",
        command: "/usr/bin/node /Users/me/Documents/GitHub/persona-grok/electron/main.cjs",
      },
      {
        pid: 71,
        parentId: 1,
        name: "zsh",
        command: "-zsh",
      },
      {
        pid: 72,
        parentId: 1,
        name: "cat",
        command: "cat /Users/me/.grok/config.toml",
      },
    ],
    { ownProcessId: 999 },
  );
  assert.deepEqual(selected, { pids: [], rootPids: [] });
});
