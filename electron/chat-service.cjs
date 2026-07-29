"use strict";

const { spawn } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const PERSONA_RULES = [
  "You are Persona, a lively desktop companion character living in a floating window.",
  "Reply in the user's language (Hungarian if they write Hungarian).",
  "Keep answers short and spoken-friendly: 1-3 sentences, no markdown, no code fences, no bullet lists unless asked.",
  "Be warm, playful, and concise — this text will be read aloud by TTS.",
  "Do not use tools. Do not claim you can edit files or run commands.",
].join(" ");

function resolveGrokBinary() {
  if (process.env.PERSONA_GROK_BIN) return process.env.PERSONA_GROK_BIN;
  const home = os.homedir();
  const candidates = [
    path.join(home, ".grok", "bin", "grok"),
    "/usr/local/bin/grok",
    "grok",
  ];
  for (const candidate of candidates) {
    if (candidate === "grok") return candidate;
    try {
      if (fs.existsSync(candidate)) return candidate;
    } catch {
      // continue
    }
  }
  return "grok";
}

/**
 * Ask Grok headless for a short spoken reply. Falls back to a local line if
 * the CLI is unavailable.
 */
function askPersonaChat(userText, {
  spawnProcess = spawn,
  grokBin = resolveGrokBinary(),
  timeoutMs = 90_000,
} = {}) {
  const prompt = String(userText ?? "").trim();
  if (!prompt) {
    return Promise.resolve({
      ok: false,
      text: "",
      error: "empty",
    });
  }

  return new Promise((resolve) => {
    const args = [
      "-p",
      prompt,
      "--rules",
      PERSONA_RULES,
      "--max-turns",
      "1",
      "--disallowed-tools",
      "Agent,run_terminal_command,run_terminal_cmd,spawn_subagent,web_search,web_fetch,search_replace,write,read_file,grep,list_dir,search_tool,use_tool,image_gen,image_edit",
      "--output-format",
      "plain",
    ];

    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };

    let child;
    try {
      child = spawnProcess(grokBin, args, {
        stdio: ["ignore", "pipe", "pipe"],
        env: {
          ...process.env,
          // Avoid nested persona MCP recursion noise.
          GROK_DISABLE_MCP: process.env.GROK_DISABLE_MCP || "0",
        },
      });
    } catch (error) {
      finish({
        ok: false,
        text: localFallback(prompt),
        error: error instanceof Error ? error.message : String(error),
        fallback: true,
      });
      return;
    }

    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      try {
        child.kill("SIGTERM");
      } catch {
        // ignore
      }
      finish({
        ok: false,
        text: localFallback(prompt),
        error: "timeout",
        fallback: true,
      });
    }, timeoutMs);
    timer.unref?.();

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString("utf8");
    });
    child.once("error", (error) => {
      clearTimeout(timer);
      finish({
        ok: false,
        text: localFallback(prompt),
        error: error.message,
        fallback: true,
      });
    });
    child.once("exit", (code) => {
      clearTimeout(timer);
      const text = cleanReply(stdout);
      if (text) {
        finish({ ok: true, text, code });
        return;
      }
      finish({
        ok: false,
        text: localFallback(prompt),
        error: stderr.trim() || `grok exited ${code}`,
        fallback: true,
      });
    });
  });
}

function cleanReply(text) {
  return String(text ?? "")
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("npm warn") && !line.startsWith("["))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function localFallback(prompt) {
  if (/[áéíóöőúüűÁÉÍÓÖŐÚÜŰ]/.test(prompt) || /\b(szia|hogy|vagy|köszi)\b/i.test(prompt)) {
    return "Hallom! Még pofázok, csak épp a nagyobb agyam szundikál — írj újra egy pillanat múlva.";
  }
  return "I hear you! My bigger brain is napping for a second — try again in a moment.";
}

module.exports = {
  PERSONA_RULES,
  askPersonaChat,
  cleanReply,
  localFallback,
  resolveGrokBinary,
};
