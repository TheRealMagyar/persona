"use strict";

const { spawn } = require("node:child_process");

const DEFAULT_MAX_CHARS = 1_800;
const LEVEL_INTERVAL_MS = 55;

function stripForSpeech(text) {
  return String(text ?? "")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/!\[[^\]]*\]\([^)]+\)/g, " ")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/[*_~>|-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function truncateSpeech(text, maxChars = DEFAULT_MAX_CHARS) {
  if (text.length <= maxChars) return text;
  const slice = text.slice(0, maxChars);
  const breakAt = Math.max(slice.lastIndexOf(". "), slice.lastIndexOf("! "), slice.lastIndexOf("? "));
  return `${(breakAt > 40 ? slice.slice(0, breakAt + 1) : slice).trim()}…`;
}

function pickVoice(text, preferred) {
  if (preferred) return preferred;
  // Hungarian diacritics or common unaccented chat words → Tünde.
  if (
    /[áéíóöőúüűÁÉÍÓÖŐÚÜŰ]/.test(text) ||
    /\b(szia|hello|helló|koszi|köszi|koszonom|köszönöm|igen|nem|miért|miert|hogy|vagy|csá|csáó)\b/i.test(
      text,
    )
  ) {
    return "Tünde";
  }
  return process.env.PERSONA_TTS_VOICE || "Samantha";
}

/**
 * Drives Persona "talking" for text chats: optional macOS TTS + synthetic
 * amplitude envelope for lip sync (no microphone / loopback required).
 */
class SpeechDriver {
  constructor({
    onState = () => {},
    onLevel = () => {},
    onAnimation = () => {},
    spawnProcess = spawn,
    platform = process.platform,
  } = {}) {
    this.onState = onState;
    this.onLevel = onLevel;
    this.onAnimation = onAnimation;
    this.spawnProcess = spawnProcess;
    this.platform = platform;
    this.generation = 0;
    this.child = null;
    this.levelTimer = null;
    this.speaking = false;
  }

  isSpeaking() {
    return this.speaking;
  }

  stop() {
    this.generation += 1;
    this.clearLevelTimer();
    if (this.child) {
      try {
        this.child.kill("SIGTERM");
      } catch {
        // Process may already have exited.
      }
      this.child = null;
    }
    if (this.speaking) {
      this.speaking = false;
      this.onLevel(0);
      this.onState("idle", "active");
      this.onAnimation("idle");
    }
  }

  clearLevelTimer() {
    if (this.levelTimer) {
      clearInterval(this.levelTimer);
      this.levelTimer = null;
    }
  }

  startLevelPump(generation) {
    this.clearLevelTimer();
    let t = 0;
    this.levelTimer = setInterval(() => {
      if (generation !== this.generation) return;
      t += LEVEL_INTERVAL_MS / 1000;
      // Speech-like envelope: base + formant flutter + occasional peaks.
      const flutter = 0.22 + Math.abs(Math.sin(t * 11.3)) * 0.35;
      const peak = Math.sin(t * 2.4) > 0.75 ? 0.25 : 0;
      const level = Math.min(1, flutter + peak + Math.random() * 0.12);
      this.onLevel(level);
    }, LEVEL_INTERVAL_MS);
    this.levelTimer.unref?.();
  }

  async speak(rawText, {
    audio = true,
    voice = null,
    maxChars = DEFAULT_MAX_CHARS,
  } = {}) {
    const cleaned = truncateSpeech(stripForSpeech(rawText), maxChars);
    if (!cleaned) {
      return { spoken: false, reason: "empty" };
    }

    this.stop();
    const generation = this.generation;
    this.speaking = true;
    this.onState("speaking", "active");
    this.onAnimation("talk");
    this.startLevelPump(generation);

    const selectedVoice = pickVoice(cleaned, voice);
    let playedAudio = false;

    try {
      if (audio && this.platform === "darwin") {
        playedAudio = true;
        await this.runSay(cleaned, selectedVoice, generation);
      } else if (audio && this.platform !== "darwin") {
        // Approximate duration when system TTS is unavailable.
        const ms = Math.min(20_000, Math.max(1_200, cleaned.length * 55));
        await this.wait(ms, generation);
      } else {
        const ms = Math.min(12_000, Math.max(900, cleaned.length * 40));
        await this.wait(ms, generation);
      }
    } finally {
      if (generation === this.generation) {
        this.clearLevelTimer();
        this.child = null;
        this.speaking = false;
        this.onLevel(0);
        this.onState("idle", "active");
        this.onAnimation("idle");
      }
    }

    return {
      spoken: true,
      audio: playedAudio,
      voice: selectedVoice,
      characters: cleaned.length,
      preview: cleaned.slice(0, 120),
    };
  }

  runSay(text, voice, generation) {
    return new Promise((resolve, reject) => {
      if (generation !== this.generation) {
        resolve();
        return;
      }
      const args = voice ? ["-v", voice, text] : [text];
      const child = this.spawnProcess("say", args, {
        stdio: ["ignore", "ignore", "pipe"],
      });
      this.child = child;
      let stderr = "";
      child.stderr?.on("data", (chunk) => {
        stderr += chunk.toString();
      });
      child.once("error", (error) => {
        if (generation === this.generation) reject(error);
        else resolve();
      });
      child.once("exit", (code) => {
        if (generation !== this.generation) {
          resolve();
          return;
        }
        if (code && code !== 0) {
          reject(new Error(stderr.trim() || `say exited with code ${code}`));
          return;
        }
        resolve();
      });
    });
  }

  wait(ms, generation) {
    return new Promise((resolve) => {
      const timer = setTimeout(() => resolve(), ms);
      timer.unref?.();
      if (generation !== this.generation) {
        clearTimeout(timer);
        resolve();
      }
    });
  }
}

module.exports = {
  DEFAULT_MAX_CHARS,
  SpeechDriver,
  pickVoice,
  stripForSpeech,
  truncateSpeech,
};
