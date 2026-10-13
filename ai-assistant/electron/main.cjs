// Proceso principal de Electron: arranca el mismo servidor Express (dist/server.js) dentro de este
// proceso y lo muestra en una ventana nativa. Así la app de escritorio reutiliza el 100% del
// backend/servidor web, sin duplicar lógica.
const { app, BrowserWindow, Tray, Menu, shell, dialog, nativeImage, ipcMain, Notification } = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const http = require("node:http");
const { pathToFileURL } = require("node:url");

const APP_NAME = "OlimpIA";
const PROJECT_ROOT = path.join(__dirname, "..");
// Puerto poco común para no chocar con otros programas del ordenador (el servidor solo escucha en
// 127.0.0.1, nunca es accesible desde otros equipos).
const PORT = process.env.PORT ? Number(process.env.PORT) : 47615;
// Se arrancó sola al iniciar sesión en el ordenador: se queda en la bandeja, sin abrir ventana.
const STARTED_HIDDEN = process.argv.includes("--hidden");

// Por defecto Electron usa el campo "name" de package.json ("gym-ai-assistant") para la carpeta
// de datos de usuario; la fijamos al nombre de la app (%APPDATA%\OlimpIA en Windows) antes de que
// se resuelva cualquier app.getPath('userData').
app.setName(APP_NAME);
if (process.platform === "win32") app.setAppUserModelId("com.crisvb7.olimpia");

let mainWindow = null;
let tray = null;
let quitting = false;

// --- 1. Configuración (.env) y datos en la carpeta de datos del usuario ------------------------
// Una app instalada normalmente no puede escribir dentro de su propia carpeta de instalación
// (Archivos de programa), así que la configuración y los datos (conversaciones, tareas) viven en
// la carpeta de datos del usuario del sistema operativo.
function resolvePaths() {
  // En desarrollo (`npm run electron`, sin empaquetar) usamos el .env y las carpetas del propio
  // proyecto, igual que `npm start`.
  if (!app.isPackaged) {
    return { envPath: path.join(PROJECT_ROOT, ".env"), userDataDir: PROJECT_ROOT, defaultFilesDir: path.join(PROJECT_ROOT, "shared-files") };
  }

  const userDataDir = app.getPath("userData");
  fs.mkdirSync(userDataDir, { recursive: true });
  migrateFromGymBot(userDataDir);

  const envPath = path.join(userDataDir, ".env");
  if (!fs.existsSync(envPath)) {
    fs.copyFileSync(path.join(PROJECT_ROOT, ".env.example"), envPath);
  }
  // Las fichas en Documentos\OlimpIA: una carpeta que el dueño del gimnasio encuentra fácilmente.
  return { envPath, userDataDir, defaultFilesDir: path.join(app.getPath("documents"), APP_NAME) };
}

// Antes la app se llamaba "GymBot AI": si existe su configuración (y aún no la de OlimpIA), la
// copiamos para no tener que volver a escribir las claves ni perder conversaciones y tareas.
function migrateFromGymBot(userDataDir) {
  const oldDir = path.join(path.dirname(userDataDir), "GymBot AI");
  if (!fs.existsSync(oldDir) || fs.existsSync(path.join(userDataDir, ".env"))) return;
  try {
    if (fs.existsSync(path.join(oldDir, ".env"))) {
      // El modelo fijado en GymBot (gpt-4o) se quita para usar el de OlimpIA por defecto: con
      // gpt-4o los planes salían pobres y llegó a improvisar borrados asignando ejercicios falsos.
      const env = fs.readFileSync(path.join(oldDir, ".env"), "utf-8").replace(/^OPENAI_MODEL=gpt-4o\s*$/m, "OPENAI_MODEL=");
      fs.writeFileSync(path.join(userDataDir, ".env"), env);
    }
    if (fs.existsSync(path.join(oldDir, "data"))) {
      fs.cpSync(path.join(oldDir, "data"), path.join(userDataDir, "data"), { recursive: true });
    }
  } catch (err) {
    console.error("No se pudo migrar la configuración de GymBot AI:", err);
  }
}

// --- 2. Arrancar el servidor en el mismo proceso ------------------------------------------------
// El proceso principal de Electron YA es un runtime de Node.js completo, así que en vez de
// lanzar dist/server.js como un subproceso aparte, lo importamos directamente aquí: en una app
// empaquetada, que Electron se relance a sí mismo como subproceso falla con ENOENT en Windows.
let logStream = null;
function openLogFile(userDataDir) {
  const logPath = path.join(userDataDir, "server.log");
  // Si el log crece demasiado (meses de uso), se empieza uno nuevo.
  try {
    if (fs.statSync(logPath).size > 5 * 1024 * 1024) fs.renameSync(logPath, `${logPath}.old`);
  } catch {
    // no existía
  }
  logStream = fs.createWriteStream(logPath, { flags: "a" });
  logStream.write(`\n--- Arranque ${new Date().toISOString()} ---\n`);
  // Una app empaquetada no tiene consola visible: reenviamos console.log/error/warn también al
  // archivo de log para poder diagnosticar el servidor interno (Express, Supabase, OpenAI...).
  for (const method of ["log", "error", "warn"]) {
    const original = console[method].bind(console);
    console[method] = (...args) => {
      original(...args);
      logStream.write(
        args.map((a) => (typeof a === "string" ? a : a instanceof Error ? a.stack : JSON.stringify(a))).join(" ") + "\n",
      );
    };
  }
  return logPath;
}

// dialog.showErrorBox() no espera a que el usuario cierre el diálogo: si justo después llamamos a
// app.quit(), el diálogo desaparece antes de poder leerse. Usamos la versión con Promise.
function fatalError(title, message) {
  logStream?.write(`FATAL: ${title}\n${message}\n`);
  dialog
    .showMessageBox({ type: "error", title, message, buttons: ["Cerrar"] })
    .catch(() => {})
    .finally(() => {
      quitting = true;
      app.quit();
    });
}

async function startServer(paths) {
  Object.assign(process.env, {
    PORT: String(PORT),
    OLIMPIA_ENV_FILE: paths.envPath,
    OLIMPIA_DATA_DIR: paths.userDataDir,
    OLIMPIA_DEFAULT_FILES_DIR: paths.defaultFilesDir,
  });
  // Notificaciones del sistema cuando termina una tarea automática (las usa src/scheduler.ts).
  globalThis.__olimpiaNotify = (title, body) => {
    if (!Notification.isSupported()) return;
    const n = new Notification({ title, body, icon: path.join(__dirname, "icon.png") });
    n.on("click", showWindow);
    n.show();
  };
  await import(pathToFileURL(path.join(PROJECT_ROOT, "dist", "server.js")).href);
}

function waitForServer(timeoutMs = 20000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tryOnce = () => {
      const req = http.get(`http://127.0.0.1:${PORT}/api/status`, (res) => {
        res.destroy();
        resolve();
      });
      req.on("error", () => {
        if (Date.now() - start > timeoutMs) {
          reject(new Error("El servidor no respondió a tiempo."));
        } else {
          setTimeout(tryOnce, 300);
        }
      });
    };
    tryOnce();
  });
}

// --- 3. Puente con la interfaz (preload.cjs) ---------------------------------------------------
function autostartEnabled() {
  return app.getLoginItemSettings({ args: ["--hidden"] }).openAtLogin;
}

// Preferencia de arranque con el sistema, guardada en la carpeta de datos ("on"/"off"). Se guarda
// aparte porque el registro del sistema apunta a la ruta de la app en el momento de registrarla.
function autostartPrefPath() {
  return path.join(app.getPath("userData"), ".autostart-configured");
}

function setAutostart(enabled) {
  // En desarrollo no tiene sentido registrar el ejecutable genérico de Electron al inicio.
  if (!app.isPackaged) return;
  app.setLoginItemSettings({ openAtLogin: enabled, openAsHidden: true, args: ["--hidden"] });
  fs.writeFileSync(autostartPrefPath(), enabled ? "on" : "off");
}

// Se llama en cada arranque: la primera vez activa el arranque con el sistema (para que las tareas
// automáticas funcionen sin que nadie tenga que acordarse de abrir la app); las siguientes lo vuelve
// a registrar desde la ruta ACTUAL de la app. Si no, al reinstalarla o moverla (p.ej. de la carpeta
// de descarga a Aplicaciones) el sistema seguiría intentando abrir la copia antigua.
function refreshAutostart() {
  if (!app.isPackaged) return;
  let pref = "on";
  try {
    // Formato antiguo: el archivo contenía una fecha (= activado).
    pref = fs.readFileSync(autostartPrefPath(), "utf-8").trim() === "off" ? "off" : "on";
  } catch {
    // Primera vez: activado.
  }
  setAutostart(pref === "on");
}

ipcMain.handle("olimpia:pick-folder", async (_event, current) => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: "Elige la carpeta de fichas y archivos",
    defaultPath: current || app.getPath("documents"),
    properties: ["openDirectory", "createDirectory"],
  });
  return result.canceled ? null : result.filePaths[0];
});

ipcMain.handle("olimpia:open-folder", async (_event, folder) => {
  if (typeof folder !== "string" || !folder) return;
  fs.mkdirSync(folder, { recursive: true });
  await shell.openPath(folder);
});

ipcMain.handle("olimpia:get-autostart", () => autostartEnabled());
ipcMain.handle("olimpia:set-autostart", (_event, enabled) => {
  setAutostart(Boolean(enabled));
  return autostartEnabled();
});

// --- 4. Ventana y bandeja del sistema ----------------------------------------------------------
function createWindow({ show }) {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 900,
    minHeight: 600,
    show,
    backgroundColor: "#161212",
    title: APP_NAME,
    icon: path.join(__dirname, "icon.png"),
    autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, preload: path.join(__dirname, "preload.cjs") },
  });

  mainWindow.loadURL(`http://127.0.0.1:${PORT}`);

  // Los enlaces externos se abren en el navegador normal, no dentro de la app.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  // Cerrar la ventana no cierra la app: así el servidor sigue vivo en segundo plano y las tareas
  // programadas se siguen ejecutando aunque no tengas la ventana abierta.
  mainWindow.on("close", (e) => {
    if (!quitting) {
      e.preventDefault();
      mainWindow.hide();
    }
  });
}

function showWindow() {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function createTray() {
  const icon = nativeImage.createFromPath(path.join(__dirname, "tray.png"));
  tray = new Tray(icon.isEmpty() ? nativeImage.createEmpty() : icon);
  tray.setToolTip(`${APP_NAME} · tareas automáticas activas`);
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: `Abrir ${APP_NAME}`, click: showWindow },
      { type: "separator" },
      {
        label: "Salir (las tareas automáticas se detienen)",
        click: () => {
          quitting = true;
          app.quit();
        },
      },
    ]),
  );
  tray.on("click", showWindow);
}

// --- 5. Arranque -------------------------------------------------------------------------------
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", showWindow);
  // macOS: clic en el icono del Dock con la ventana cerrada.
  app.on("activate", showWindow);

  // Cualquier excepción durante el arranque debe mostrar un diálogo con el error real en vez de
  // que la app desaparezca en silencio.
  process.on("uncaughtException", (err) => {
    if (err && err.code === "EADDRINUSE") {
      fatalError(`No se pudo iniciar ${APP_NAME}`, `El puerto ${PORT} ya está en uso por otro programa.`);
      return;
    }
    fatalError(`Error inesperado en ${APP_NAME}`, err.stack || String(err));
  });

  app.whenReady().then(async () => {
    try {
      const paths = resolvePaths();
      const logPath = openLogFile(paths.userDataDir);

      refreshAutostart();

      try {
        await startServer(paths);
        await waitForServer();
      } catch (err) {
        fatalError(`No se pudo iniciar ${APP_NAME}`, `${err.stack || err.message}\n\nRevisa el archivo de registro:\n${logPath}`);
        return;
      }

      createWindow({ show: !STARTED_HIDDEN });
      createTray();
    } catch (err) {
      fatalError(`Error inesperado en ${APP_NAME}`, err.stack || String(err));
    }
  });

  app.on("window-all-closed", () => {
    // No hacemos nada: la app sigue viva en la bandeja del sistema (ver createWindow -> 'close').
  });

  app.on("before-quit", () => {
    quitting = true;
  });
}
