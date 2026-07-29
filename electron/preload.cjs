"use strict";

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("personaBridge", {
  getSnapshot: () => ipcRenderer.invoke("persona:get-snapshot"),
  hide: () => ipcRenderer.send("persona:hide"),
  chat: (text) => ipcRenderer.invoke("persona:chat", text),
  stopSpeaking: () => ipcRenderer.invoke("persona:stop-speaking"),
  subscribe: (listener) => {
    const handler = (_event, payload) => listener(payload);
    ipcRenderer.on("persona:event", handler);
    return () => ipcRenderer.off("persona:event", handler);
  },
  onVisibility: (listener) => {
    const handler = (_event, visible) => listener(Boolean(visible));
    ipcRenderer.on("persona:visibility", handler);
    return () => ipcRenderer.off("persona:visibility", handler);
  },
});
