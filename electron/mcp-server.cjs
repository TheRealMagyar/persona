"use strict";

const { McpServer } = require("@modelcontextprotocol/sdk/server/mcp.js");
const {
  StreamableHTTPServerTransport,
} = require("@modelcontextprotocol/sdk/server/streamableHttp.js");
const z = require("zod/v4");
const { version } = require("../package.json");

const MCP_PATH = "/mcp";
const ANIMATION_EVENT_NAMES = {
  idle: "IDLE",
  greeting: "GREETING",
  talk: "TALK",
  happy: "HAPPY",
  "finger-gun": "FINGER_GUN",
  dance: "DANCE",
};
const ANIMATION_NAMES = Object.keys(ANIMATION_EVENT_NAMES);
const WINDOW_ACTIONS = ["show", "hide", "toggle"];
const SERVER_INSTRUCTIONS =
  "Persona is the local desktop character for Grok Build. " +
  "On every user-facing reply (including normal text chat, not only voice), call speak with a short spoken version of your answer so the character talks and lip-syncs. " +
  "Prefer speak over silent replies whenever you are addressing the user. " +
  "Use listen when the user is expected to talk next. Use stop_speaking to cancel. " +
  "Use play_animation for extra reactions (happy, dance, greeting, finger-gun). " +
  "Use control_window to show/hide. get_status is read-only.";

function textResult(text) {
  return {
    content: [{ type: "text", text }],
  };
}

function getAnimationEventName(animation) {
  return ANIMATION_EVENT_NAMES[animation] ?? null;
}

function createPersonaMcpServer({
  onAnimation,
  onWindowAction,
  getStatus,
  onSpeak = null,
  onListen = null,
  onStopSpeaking = null,
}) {
  const server = new McpServer(
    {
      name: "Persona",
      version,
    },
    {
      instructions: SERVER_INSTRUCTIONS,
    },
  );

  server.registerTool(
    "speak",
    {
      title: "Speak through Persona",
      description:
        "Make the desktop character talk. Pass the words to say (plain language, not code dumps). " +
        "On macOS this uses system TTS and drives lip sync + talk animation. " +
        "Call this for normal chat replies so Persona still yaps when the user types.",
      inputSchema: {
        text: z
          .string()
          .min(1)
          .max(4000)
          .describe("What Persona should say out loud / mouth along with."),
        audio: z
          .boolean()
          .optional()
          .describe("Play system TTS audio (default true on macOS)."),
        voice: z
          .string()
          .optional()
          .describe("Optional macOS say voice name, e.g. Tünde or Samantha."),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async ({ text, audio, voice }) => {
      if (typeof onSpeak !== "function") {
        return textResult("Speech driver is unavailable in this Persona build.");
      }
      const result = await onSpeak({
        text,
        audio: audio !== false,
        voice: voice || null,
      });
      if (!result?.spoken) {
        return textResult(`Persona did not speak (${result?.reason || "unknown"}).`);
      }
      return textResult(
        `Persona spoke ${result.characters} characters` +
          `${result.audio ? ` with voice ${result.voice}` : " (visual lip sync only)"}.`,
      );
    },
  );

  server.registerTool(
    "listen",
    {
      title: "Persona listening pose",
      description:
        "Show Persona in a listening state (user is typing or about to speak).",
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async () => {
      if (typeof onListen === "function") await onListen();
      return textResult("Persona is listening.");
    },
  );

  server.registerTool(
    "stop_speaking",
    {
      title: "Stop Persona speech",
      description: "Stop TTS and return Persona to idle.",
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async () => {
      if (typeof onStopSpeaking === "function") await onStopSpeaking();
      return textResult("Persona stopped speaking.");
    },
  );

  server.registerTool(
    "play_animation",
    {
      title: "Play Persona animation",
      description:
        "Play one installed character animation once in the desktop window. This shows Persona and temporarily takes priority over voice-driven body motion.",
      inputSchema: {
        animation: z
          .enum(ANIMATION_NAMES)
          .describe("The character animation to play."),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async ({ animation }) => {
      await onAnimation(animation);
      return textResult(`Persona is playing the ${animation} animation.`);
    },
  );

  server.registerTool(
    "control_window",
    {
      title: "Control Persona window",
      description:
        "Show, hide, or toggle the local Persona window. Hiding the window does not quit Persona.",
      inputSchema: {
        action: z.enum(WINDOW_ACTIONS).describe("The window action to perform."),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async ({ action }) => {
      const visible = await onWindowAction(action);
      return textResult(`Persona's window is now ${visible ? "visible" : "hidden"}.`);
    },
  );

  server.registerTool(
    "get_status",
    {
      title: "Get Persona status",
      description:
        "Read Persona's window visibility, voice state, and local listener status.",
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async () => textResult(JSON.stringify(await getStatus())),
  );

  return server;
}

function createPersonaMcpHandler(controller) {
  return async (request, response, parsedBody) => {
    const server = createPersonaMcpServer(controller);
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });

    try {
      await server.connect(transport);
      await transport.handleRequest(request, response, parsedBody);
    } catch (error) {
      if (!response.headersSent) {
        response.writeHead(500, { "content-type": "application/json" });
        response.end(
          JSON.stringify({
            jsonrpc: "2.0",
            error: { code: -32603, message: "Internal server error" },
            id: null,
          }),
        );
      }
      throw error;
    } finally {
      await transport.close();
      await server.close();
    }
  };
}

module.exports = {
  ANIMATION_EVENT_NAMES,
  ANIMATION_NAMES,
  MCP_PATH,
  SERVER_INSTRUCTIONS,
  WINDOW_ACTIONS,
  createPersonaMcpHandler,
  createPersonaMcpServer,
  getAnimationEventName,
};
