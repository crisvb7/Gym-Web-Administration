// Expone a la interfaz (public/app.js) solo las funciones de escritorio que necesita, sin darle
// acceso directo a Node ni a Electron.
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("olimpia", {
  pickFolder: (current) => ipcRenderer.invoke("olimpia:pick-folder", current),
  openFolder: (folder) => ipcRenderer.invoke("olimpia:open-folder", folder),
  getAutostart: () => ipcRenderer.invoke("olimpia:get-autostart"),
  setAutostart: (enabled) => ipcRenderer.invoke("olimpia:set-autostart", enabled),
});
