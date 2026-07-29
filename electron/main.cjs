"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const {
  app,
  BrowserWindow,
  globalShortcut,
  ipcMain,
  Menu,
  nativeImage,
  screen,
  Tray,
} = require("electron");
const { createBridgeServer, DEFAULT_PORT } = require("./bridge-server.cjs");
const {
  createPersonaMcpHandler,
  getAnimationEventName,
} = require("./mcp-server.cjs");
const {
  configureHyprlandWindow,
  getHyprlandWindowPlacement,
} = require("./hyprland-window.cjs");
const { createAudioListener } = require("./audio-listener.cjs");
const { isAllowedRendererNavigation } = require("./navigation-policy.cjs");
const { parseProtocolUrl, voiceState } = require("./protocol-actions.cjs");
const { SpeechDriver } = require("./speech-driver.cjs");
const { askPersonaChat } = require("./chat-service.cjs");

const WINDOW_WIDTH = 430;
const WINDOW_HEIGHT = 860;
const startInBackground = process.argv.includes("--background");
const protocolScheme = "persona";
const debugEnabled = process.env.PERSONA_DEBUG === "1";

let avatarWindow = null;
let bridge = null;
let isQuitting = false;
let latestEvent = null;
let latestListenerStatus = null;
let latestVoiceState = null;
let audioListener = null;
let speechDriver = null;
let lastSpokenText = "";
let lastSpokenAt = 0;
let tray = null;

let hyprlandConfigured = false;
let hyprlandConfiguring = false;
let hyprlandConfigurationTimer = null;
let hyprlandLastPosition = null;
let rendererLoadHookAttached = false;
let mcpAnimationRequestId = 0;
const pendingRendererEvents = new Map();

app.setName("Persona");

function debugLog(...values) {
  if (debugEnabled) console.error("[persona]", ...values);
}

function positionWindow(window) {
  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  const bounds = window.getBounds();
  const margin = 24;
  window.setPosition(
    Math.round(display.workArea.x + display.workArea.width - bounds.width - margin),
    Math.round(display.workArea.y + display.workArea.height - bounds.height - margin),
    false,
  );
}

function scheduleHyprlandWindowConfiguration({
  attempt = 0,
  force = false,
  position = null,
  reposition = !hyprlandConfigured,
} = {}) {
  if (
    (hyprlandConfigured && !force) ||
    hyprlandConfiguring ||
    !avatarWindow ||
    avatarWindow.isDestroyed()
  ) {
    return;
  }
  clearTimeout(hyprlandConfigurationTimer);
  const delays = [0, 80, 200, 500, 1000];
  hyprlandConfigurationTimer = setTimeout(async () => {
    hyprlandConfigurationTimer = null;
    if (!avatarWindow || avatarWindow.isDestroyed()) return;
    hyprlandConfiguring = true;
    hyprlandConfigured = await configureHyprlandWindow({
      pid: process.pid,
      width: WINDOW_WIDTH,
      height: WINDOW_HEIGHT,
      onDebug: debugLog,
      position,
      reposition,
    });
    hyprlandConfiguring = false;
    if (!hyprlandConfigured && attempt + 1 < delays.length) {
      scheduleHyprlandWindowConfiguration({
        attempt: attempt + 1,
        force: true,
        position,
        reposition,
      });
    }
  }, delays[attempt] ?? delays.at(-1));
  hyprlandConfigurationTimer.unref?.();
}

function notifyRendererVisibility(visible) {
  if (!avatarWindow || avatarWindow.isDestroyed()) return;
  avatarWindow.webContents.send("persona:visibility", visible);
}

function showOverlay({ focus = false } = {}) {
  const window = createWindow();
  if (window.isMinimized()) window.restore();
  if (focus) {
    if (!window.isVisible()) window.show();
    window.focus();
  } else if (!window.isVisible()) {
    window.showInactive();
  }
  notifyRendererVisibility(true);
  scheduleHyprlandWindowConfiguration();
}

async function hideOverlay() {
  debugLog("hide overlay");
  const placement = await getHyprlandWindowPlacement(process.pid);
  if (placement) {
    hyprlandLastPosition = { x: placement.x, y: placement.y };
  }
  notifyRendererVisibility(false);
  avatarWindow?.hide();
}

function warnIfCharacterMediaMissing() {
  const modelPath = path.join(__dirname, "..", "public", "assets", "model.vrm");
  const distModelPath = path.join(__dirname, "..", "dist", "assets", "model.vrm");
  if (fs.existsSync(modelPath) || fs.existsSync(distModelPath)) return;
  console.error(
    [
      "[persona] Character media is missing — the window will show setup instructions only.",
      "  Place public/assets/model.vrm (+ animations/*.vrma), or run:",
      "    npm run assets:dev-model",
      "  then: npm run demo",
    ].join("\n"),
  );
}

function toggleOverlay() {
  if (avatarWindow?.isVisible()) void hideOverlay();
  else showOverlay({ focus: true });
}

function createWindow() {
  if (avatarWindow && !avatarWindow.isDestroyed()) return avatarWindow;

  avatarWindow = new BrowserWindow({
    width: WINDOW_WIDTH,
    height: WINDOW_HEIGHT,
    minWidth: 360,
    minHeight: 640,
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: "#00000000",
    hasShadow: true,
    roundedCorners: true,
    autoHideMenuBar: true,
    alwaysOnTop: true,
    skipTaskbar: false,
    resizable: true,
    movable: true,
    title: "Persona",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  avatarWindow.setAlwaysOnTop(true, "floating");
  avatarWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  avatarWindow.setOpacity(1);
  avatarWindow.setMovable(true);
  avatarWindow.once("ready-to-show", () => {
    positionWindow(avatarWindow);
    scheduleHyprlandWindowConfiguration();
  });
  avatarWindow.on("show", () => {
    avatarWindow.setAlwaysOnTop(true, "floating");
    avatarWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    avatarWindow.setOpacity(1);
    notifyRendererVisibility(true);
    scheduleHyprlandWindowConfiguration({
      force: true,
      position: hyprlandLastPosition,
      reposition: !hyprlandConfigured || hyprlandLastPosition != null,
    });
  });
  avatarWindow.on("hide", () => {
    notifyRendererVisibility(false);
  });
  avatarWindow.on("close", (event) => {
    if (isQuitting) return;
    event.preventDefault();
    void hideOverlay();
  });
  avatarWindow.on("closed", () => {
    clearTimeout(hyprlandConfigurationTimer);
    hyprlandConfigurationTimer = null;
    hyprlandConfigured = false;
    hyprlandConfiguring = false;
    rendererLoadHookAttached = false;
    avatarWindow = null;
  });

  const rendererUrl =
    process.env.VITE_DEV_SERVER_URL ||
    pathToFileURL(path.join(__dirname, "..", "dist", "index.html")).href;
  avatarWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  avatarWindow.webContents.on("will-navigate", (event, targetUrl) => {
    if (!isAllowedRendererNavigation(targetUrl, rendererUrl)) event.preventDefault();
  });
  void avatarWindow.loadURL(rendererUrl);
  return avatarWindow;
}

function flushPendingRendererEvents() {
  rendererLoadHookAttached = false;
  if (!avatarWindow || avatarWindow.isDestroyed() || avatarWindow.webContents.isLoading()) return;
  for (const event of pendingRendererEvents.values()) {
    avatarWindow.webContents.send("persona:event", event);
  }
  pendingRendererEvents.clear();
}

function ensureRendererLoadHook() {
  if (
    rendererLoadHookAttached ||
    !avatarWindow ||
    avatarWindow.isDestroyed() ||
    !avatarWindow.webContents.isLoading()
  ) {
    return;
  }
  rendererLoadHookAttached = true;
  avatarWindow.webContents.once("did-finish-load", flushPendingRendererEvents);
}

function emitToRenderer(event) {
  latestEvent = event;
  pendingRendererEvents.set(event.type, event);
  if (!avatarWindow || avatarWindow.isDestroyed()) return;
  if (avatarWindow.webContents.isLoading()) {
    ensureRendererLoadHook();
    return;
  }
  avatarWindow.webContents.send("persona:event", event);
  pendingRendererEvents.delete(event.type);
}

function handleBridgeEvent(event) {
  if (event.type !== "audio-level" || event.level > 0.025) debugLog("event", event);
  if (event.type === "state") {
    latestVoiceState = event.state;
    if (event.state.phase === "starting" || event.state.phase === "active") {
      showOverlay();
    }
  } else if (event.type === "audio-level" && event.level > 0.025) {
    showOverlay();
  } else if (event.type === "animation") {
    showOverlay();
  }
  emitToRenderer(event);
}

function handleListenerStatus(status) {
  latestListenerStatus = status;
  emitToRenderer({ type: "listener-status", status });
}

async function handleMcpWindowAction(action) {
  if (action === "show") showOverlay({ focus: true });
  else if (action === "hide") await hideOverlay();
  else if (avatarWindow?.isVisible()) await hideOverlay();
  else showOverlay({ focus: true });
  return avatarWindow?.isVisible() ?? false;
}

function getMcpStatus() {
  return {
    windowVisible: avatarWindow?.isVisible() ?? false,
    voiceState: latestVoiceState,
    listener: latestListenerStatus,
    speaking: speechDriver?.isSpeaking() ?? false,
  };
}

function mapSpeechAnimation(name) {
  if (name === "talk") return "talk";
  if (name === "idle") return "idle";
  return null;
}

async function handleSpeakRequest({ text, audio = true, voice = null }) {
  if (!speechDriver) return { spoken: false, reason: "unavailable" };
  const normalized = String(text ?? "").trim();
  if (!normalized) return { spoken: false, reason: "empty" };
  // Dedup nested Grok Stop hooks when Persona chat already spoke the same line.
  if (
    normalized === lastSpokenText &&
    Date.now() - lastSpokenAt < 8_000
  ) {
    return { spoken: false, reason: "dedup" };
  }
  lastSpokenText = normalized;
  lastSpokenAt = Date.now();
  showOverlay();
  // Body motion: only voice state → TALK (stable loop). The renderer rotates
  // talk1/2/3 on a timer with soft crossfades — no MCP animation spam here.
  return speechDriver.speak(normalized, { audio, voice });
}function handleListenRequest() {
  showOverlay();
  speechDriver?.stop();
  handleBridgeEvent(voiceState("listening"));
}

function handleStopSpeakingRequest() {
  speechDriver?.stop();
  handleBridgeEvent(voiceState("idle"));
}

function handleProtocolUrl(rawUrl) {
  const commands = parseProtocolUrl(rawUrl, protocolScheme);
  if (!commands) return false;
  for (const command of commands) {
    if (command.type === "show") showOverlay({ focus: true });
    else if (command.type === "hide") void hideOverlay();
    else if (command.type === "toggle") toggleOverlay();
    else if (command.type === "event") handleBridgeEvent(command.event);
  }
  return true;
}

function handleProtocolArgv(argv) {
  const protocolUrl = argv.find((value) => value.startsWith(`${protocolScheme}://`));
  if (protocolUrl) handleProtocolUrl(protocolUrl);
}

function createTray() {
  const iconPath = path.join(__dirname, "..", "build", "icon.png");
  const icon = nativeImage.createFromPath(iconPath).resize({ width: 20, height: 20 });
  tray = new Tray(icon);
  tray.setToolTip("Persona");
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: "Show Persona", click: () => showOverlay({ focus: true }) },
      { label: "Hide Persona", click: () => void hideOverlay() },
      { type: "separator" },
      { label: "Preview listening", click: () => handleBridgeEvent(voiceState("listening")) },
      { label: "Preview speaking", click: () => handleBridgeEvent(voiceState("speaking")) },
      {
        label: "Preview dance",
        click: () => handleBridgeEvent({ type: "animation", animation: "DANCE" }),
      },
      { type: "separator" },
      {
        label: "Quit",
        click: () => {
          isQuitting = true;
          app.quit();
        },
      },
    ]),
  );
  tray.on("click", toggleOverlay);
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", (_event, argv) => {
    const handled = argv.some((value) => value.startsWith(`${protocolScheme}://`));
    handleProtocolArgv(argv);
    if (!handled && !argv.includes("--background")) showOverlay({ focus: true });
  });

  app.on("open-url", (event, url) => {
    event.preventDefault();
    handleProtocolUrl(url);
  });

  app.whenReady().then(async () => {
    app.setAppUserModelId("com.xikhar.persona");
    // Keep the dock icon in unpackaged dev so the app is discoverable; packaged
    // Persona stays tray-first like the upstream product.
    if (app.isPackaged) {
      app.dock?.hide();
      app.setAsDefaultProtocolClient(protocolScheme);
    } else {
      app.dock?.show?.();
    }
    warnIfCharacterMediaMissing();

    ipcMain.handle("persona:get-snapshot", () => latestEvent);
    ipcMain.on("persona:hide", () => void hideOverlay());
    ipcMain.handle("persona:stop-speaking", () => {
      handleStopSpeakingRequest();
    });
    ipcMain.handle("persona:chat", async (_event, rawText) => {
      const text = typeof rawText === "string" ? rawText.trim() : "";
      if (!text) return { ok: false, text: "", error: "empty" };
      showOverlay();
      handleListenRequest();
      const result = await askPersonaChat(text);
      const reply = result.text || "…";
      try {
        await handleSpeakRequest({ text: reply, audio: true });
      } catch (error) {
        debugLog("speak failed", error);
      }
      return result;
    });

    speechDriver = new SpeechDriver({
      onState: (activity, phase) => {
        handleBridgeEvent(voiceState(activity, phase));
      },
      onLevel: (level) => {
        handleBridgeEvent({ type: "audio-level", level });
      },
      onAnimation: (name) => {
        const animation = mapSpeechAnimation(name);
        if (animation == null) return;
        const eventName = getAnimationEventName(animation);
        if (eventName == null) return;
        // Talk/idle from speech should not use one-shot MCP override priority
        // except as voice animation; drive via state (talk) + levels.
        if (eventName === "TALK" || eventName === "IDLE") return;
        mcpAnimationRequestId += 1;
        handleBridgeEvent({
          type: "animation",
          animation: eventName,
          source: "mcp",
          requestId: mcpAnimationRequestId,
        });
      },
    });

    const mcpHandler = createPersonaMcpHandler({
      onAnimation: (animation) => {
        const eventName = getAnimationEventName(animation);
        if (eventName == null) return;
        mcpAnimationRequestId += 1;
        handleBridgeEvent({
          type: "animation",
          animation: eventName,
          source: "mcp",
          requestId: mcpAnimationRequestId,
        });
      },
      onWindowAction: handleMcpWindowAction,
      getStatus: getMcpStatus,
      onSpeak: handleSpeakRequest,
      onListen: handleListenRequest,
      onStopSpeaking: handleStopSpeakingRequest,
    });
    bridge = createBridgeServer({
      port: Number(process.env.PERSONA_BRIDGE_PORT || DEFAULT_PORT),
      onEvent: handleBridgeEvent,
      mcpHandler,
      onSpeak: handleSpeakRequest,
      onListen: handleListenRequest,
    });
    try {
      await bridge.listen();
    } catch (error) {
      console.error(
        "[persona] local integration server unavailable:",
        error instanceof Error ? error.message : String(error),
      );
      bridge = null;
    }

    createTray();
    globalShortcut.register("CommandOrControl+Shift+A", toggleOverlay);
    handleProtocolArgv(process.argv);

    audioListener = createAudioListener({
      isPackaged: app.isPackaged,
      resourcesPath: process.resourcesPath,
      onActivity: (activity) => {
        debugLog("listener activity", activity);
        handleBridgeEvent(voiceState(activity));
      },
      onDebug: debugEnabled ? (nodes) => debugLog("listener output nodes", nodes) : null,
      onLevel: (level) => handleBridgeEvent({ type: "audio-level", level }),
      onSession: (active) => {
        debugLog("listener session", active);
        handleBridgeEvent(voiceState(active ? "listening" : "idle", active ? "active" : "inactive"));
      },
      onStatus: (status) => {
        debugLog("listener status", status);
        handleListenerStatus(status);
      },
    });
    if (audioListener) void audioListener.start();
    if (!audioListener) {
      handleListenerStatus({
        available: false,
        capturing: false,
        monitoring: false,
        source: null,
      });
    }

    if (!startInBackground) {
      createWindow();
      showOverlay({ focus: true });
    }
  });
}

app.on("activate", () => showOverlay({ focus: true }));

app.on("before-quit", () => {
  isQuitting = true;
  clearTimeout(hyprlandConfigurationTimer);
  speechDriver?.stop();
  audioListener?.stop();
  globalShortcut.unregisterAll();
  void bridge?.close().catch((error) => debugLog("integration server close failed", error));
});

app.on("window-all-closed", () => {
  // The tray, protocol handler, and adapter server keep Persona available.
});
