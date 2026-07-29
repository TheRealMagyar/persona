"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  SpeechDriver,
  pickVoice,
  stripForSpeech,
  truncateSpeech,
} = require("./speech-driver.cjs");

test("strips markdown noise for TTS", () => {
  assert.equal(
    stripForSpeech("**Hello** `world`\n\n```js\ncode\n```\n[link](https://x)"),
    "Hello world link",
  );
});

test("truncates long speech near a sentence boundary", () => {
  const text = `${"Word ".repeat(20)}End. ${"More ".repeat(400)}`;
  const out = truncateSpeech(text, 80);
  assert.ok(out.length <= 81);
  assert.ok(out.endsWith("…") || out.endsWith("."));
});

test("picks Hungarian voice for accented text", () => {
  assert.equal(pickVoice("Szia, hogy vagy?"), "Tünde");
  assert.equal(pickVoice("Hello there", "Daniel"), "Daniel");
});

test("speak pumps levels and returns to idle", async () => {
  const states = [];
  const levels = [];
  const animations = [];
  const driver = new SpeechDriver({
    platform: "linux",
    onState: (activity, phase) => states.push({ activity, phase }),
    onLevel: (level) => levels.push(level),
    onAnimation: (animation) => animations.push(animation),
  });

  const result = await driver.speak("Hello from Persona.", { audio: false });
  assert.equal(result.spoken, true);
  assert.ok(states.some((entry) => entry.activity === "speaking"));
  assert.equal(states.at(-1).activity, "idle");
  assert.ok(levels.some((level) => level > 0.1));
  assert.equal(levels.at(-1), 0);
  assert.deepEqual(animations[0], "talk");
  assert.equal(animations.at(-1), "idle");
});
