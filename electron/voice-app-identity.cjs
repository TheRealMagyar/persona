"use strict";

/**
 * Process / stream identity for apps whose *playback* Persona can lip-sync to.
 *
 * Codex / ChatGPT desktop voice produce real Core Audio / PipeWire streams.
 * Grok Build CLI (`grok agent … stdio`) does NOT — it has no output audio
 * process, so matching it only spawns the native helper, fails, and retries
 * every poll (CPU hitch + sticky UI). Text chat uses Persona's own TTS path.
 *
 * To force process-audio matching for another app:
 *   PERSONA_TARGET_PROCESS_PATTERN='my-app' npm start
 */
const CODEX_CHAT_IDENTITY =
  /(?:^|[\\/\s._=-])(?:codex(?:-desktop)?|chatgpt|openai(?:-codex)?)(?=$|[\\/\s._=-])/i;

// Optional: only used when PERSONA_MATCH_GROK_PROCESS=1
const GROK_IDENTITY =
  /(?:^|[/\\])(?:grok(?:-build)?(?:-[\w.-]+)?|grok\.exe)(?=$|[\s"'])/i;
const GROK_APP_NAME = /(?:^|[\s"'])grok(?:[\s._-]+build)?(?=$|[\s"'])/i;

function buildDefaultPattern(environment = process.env) {
  if (environment.PERSONA_MATCH_GROK_PROCESS === "1") {
    return new RegExp(
      `(?:${CODEX_CHAT_IDENTITY.source})|(?:${GROK_IDENTITY.source})|(?:${GROK_APP_NAME.source})`,
      "i",
    );
  }
  return new RegExp(CODEX_CHAT_IDENTITY.source, "i");
}

const DEFAULT_VOICE_APP_PATTERN = buildDefaultPattern();

function identityMatchesVoiceApp(identity, pattern = DEFAULT_VOICE_APP_PATTERN) {
  if (identity == null || identity === "") return false;
  pattern.lastIndex = 0;
  return pattern.test(String(identity));
}

module.exports = {
  CODEX_CHAT_IDENTITY,
  DEFAULT_VOICE_APP_PATTERN,
  GROK_APP_NAME,
  GROK_IDENTITY,
  buildDefaultPattern,
  identityMatchesVoiceApp,
};
