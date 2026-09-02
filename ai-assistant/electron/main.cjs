// Proceso principal de Electron: arranca el mismo servidor Express (dist/server.js) como
// subproceso y lo muestra en una ventana nativa. Así la app de escritorio reutiliza el 100% del
// backend/servidor web, sin duplicar lógica.
const { app, BrowserWindow, Tray, Menu, shell, dialog, nativeImage } = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const http = require("node:http");
const { pathToFileURL } = require("node:url");

const PROJECT_ROOT = path.join(__dirname, "..");
const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;

// Por defecto Electron usa el campo "name" de package.json ("gym-ai-assistant") para la carpeta
// de datos de usuario, no el "productName" ("GymBot AI") que se ve en el título/instalador — eso
// haría que la config viviera en %APPDATA%\gym-ai-assistant en vez de %APPDATA%\GymBot AI, algo
// confuso e inconsistente con el resto de la marca. Lo fijamos explícitamente antes de que
// cualquier app.getPath('userData') se resuelva.
app.setName("GymBot AI");

let mainWindow = null;
let tray = null;
let quitting = false;

// --- 1. Configuración (.env) en la carpeta de datos del usuario -----------------------------
// Una app instalada normalmente no puede escribir dentro de su propia carpeta de instalación
// (Archivos de programa), así que la configuración y los datos (conversaciones, tareas, carpeta
// compartida) viven en la carpeta de datos del usuario del sistema operativo.
function ensureEnvFile() {
  // En desarrollo (`npm run electron`, no empaquetada) usamos el .env del propio proyecto, igual
  // que `npm start` — así no hay que duplicar configuración mientras desarrollas. Solo una app YA
  // instalada (empaquetada) usa la carpeta de datos del usuario del sistema.
  if (!app.isPackaged) {
    return { envPath: path.join(PROJECT_ROOT, ".env"), userDataDir: PROJECT_ROOT, isFirstRun: false };
  }

  const userDataDir = app.getPath("userData");
  fs.mkdirSync(userDataDir, { recursive: true });
  const envPath = path.join(userDataDir, ".env");

  if (!fs.existsSync(envPath)) {
    const examplePath = path.join(PROJECT_ROOT, ".env.example");
    fs.copyFileSync(examplePath, envPath);
    return { envPath, userDataDir, isFirstRun: true };
  }
  return { envPath, userDataDir, isFirstRun: false };
}

function loadEnvFile(envPath) {
  const raw = fs.readFileSync(envPath, "utf-8");
  const vars = {};
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    vars[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
  }
  return vars;
}

// --- 2. Arrancar el servidor en el mismo proceso ------------------------------------------------
// El proceso principal de Electron YA es un runtime de Node.js completo, así que en vez de
// lanzar dist/server.js como un subproceso aparte (lo que se probó primero con
// `spawn(process.execPath, ...)` + `ELECTRON_RUN_AS_NODE=1`), lo importamos directamente aquí.
//
// La razón del cambio: en una app YA EMPAQUETADA, cuando el propio proceso de Electron (corriendo
// en modo GUI normal, no como Node) intenta lanzar una copia de sí mismo como subproceso, esa
// llamada a spawn() falla con `ENOENT` de forma consistente en Windows — aunque el .exe existe y
// esa MISMA ruta funciona perfectamente si quien hace el spawn es un proceso de Node externo (se
// verificó con un script de prueba aislado). Es decir: el fallo no es de la ruta ni de
// ELECTRON_RUN_AS_NODE en sí, sino específico de que un Electron empaquetado en modo GUI intente
// relanzarse a sí mismo. Importar el servidor in-process evita el problema por completo — no hay
// ningún subproceso que lanzar, así que no hay nada que pueda fallar con ENOENT.
let logStream = null;
function openLogFile(userDataDir) {
  const logPath = path.join(userDataDir, "server.log");
  logStream = fs.createWriteStream(logPath, { flags: "a" });
  logStream.write(`\n--- Arranque ${new Date().toISOString()} ---\n`);
  // Una app empaquetada no tiene consola visible: reenviamos console.log/error/warn también al
  // archivo de log para poder diagnosticar el servidor interno (Express, Supabase, OpenAI...).
  for (const method of ["log", "error", "warn"]) {
    const original = console[method].bind(console);
    console[method] = (...args) => {
      original(...args);
      logStream.write(args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" ") + "\n");
    };
  }
  return logPath;
}

// dialog.showErrorBox() no espera a que el usuario cierre el diálogo (a diferencia de lo que
// parece por su nombre): la llamada vuelve enseguida. Si justo después llamamos a app.quit(), la
// app se cierra casi al instante y el diálogo desaparece antes de que se pueda leer — así es como
// la ventana de error "desaparecía en silencio". Usamos la versión con Promise y esperamos a que
// el usuario pulse el botón antes de cerrar.
function fatalError(title, message) {
  logStream?.write(`FATAL: ${title}\n${message}\n`);
  dialog
    .showMessageBox({ type: "error", title, message, buttons: ["Cerrar"] })
    .catch(() => {})
    .finally(() => app.quit());
}

async function startServer(envVars, userDataDir) {
  Object.assign(process.env, envVars, { PORT: String(PORT), GYMBOT_DATA_DIR: userDataDir });
  const serverEntry = path.join(PROJECT_ROOT, "dist", "server.js");
  await import(pathToFileURL(serverEntry).href);
}

function waitForServer(timeoutMs = 20000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tryOnce = () => {
      const req = http.get(`http://localhost:${PORT}/api/stats`, (res) => {
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

// --- 3. Ventana y bandeja del sistema ----------------------------------------------------------
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: "#161212",
    title: "GymBot AI",
    autoHideMenuBar: true,
    webPreferences: { contextIsolation: true },
  });

  mainWindow.loadURL(`http://localhost:${PORT}`);

  // Cerrar la ventana no cierra la app: así el servidor sigue vivo en segundo plano y las tareas
  // programadas se siguen ejecutando aunque no tengas la ventana abierta.
  mainWindow.on("close", (e) => {
    if (!quitting) {
      e.preventDefault();
      mainWindow.hide();
    }
  });
}

function createTray() {
  const icon = nativeImage.createFromPath(path.join(__dirname, "icon.png"));
  tray = new Tray(icon.isEmpty() ? nativeImage.createEmpty() : icon);
  tray.setToolTip("GymBot AI");
  tray.setContextMenu(
    Menu.buildFromTemplate([
      {
        label: "Abrir GymBot AI",
        click: () => {
          mainWindow.show();
          mainWindow.focus();
        },
      },
      { type: "separator" },
      {
        label: "Salir",
        click: () => {
          quitting = true;
          app.quit();
        },
      },
    ]),
  );
  tray.on("click", () => {
    mainWindow.show();
    mainWindow.focus();
  });
}

// --- 4. Arranque -------------------------------------------------------------------------------
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      mainWindow.show();
      mainWindow.focus();
    }
  });

  // Cualquier excepción durante el arranque (incluidas las de ensureEnvFile/loadEnvFile, que
  // antes no estaban protegidas) debe mostrar un diálogo con el error real en vez de que la app
  // desaparezca en silencio sin ninguna pista de qué ha pasado.
  process.on("uncaughtException", (err) => {
    fatalError("Error inesperado en GymBot AI", err.stack || String(err));
  });

  app.whenReady().then(async () => {
    try {
      const { envPath, userDataDir, isFirstRun } = ensureEnvFile();

      if (isFirstRun) {
        await dialog.showMessageBox({
          type: "info",
          title: "Configuración necesaria",
          message: "Primera vez que abres GymBot AI",
          detail:
            "Se ha creado un archivo de configuración (.env) que necesitas rellenar con tu clave de " +
            "OpenAI y las credenciales de Supabase antes de poder usar la app. Se abrirá ahora en tu " +
            "editor de texto — guárdalo y vuelve a abrir GymBot AI.",
        });
        shell.openPath(envPath);
        app.quit();
        return;
      }

      const envVars = loadEnvFile(envPath);
      if (!envVars.OPENAI_API_KEY || !envVars.SUPABASE_SERVICE_ROLE_KEY) {
        const { response } = await dialog.showMessageBox({
          type: "warning",
          title: "Falta configuración",
          message: "El archivo .env todavía no está completo",
          detail: `Faltan claves necesarias (OPENAI_API_KEY y/o SUPABASE_SERVICE_ROLE_KEY) en:\n${envPath}`,
          buttons: ["Abrir .env y salir", "Salir"],
        });
        if (response === 0) shell.openPath(envPath);
        app.quit();
        return;
      }

      openLogFile(userDataDir);

      try {
        await startServer(envVars, userDataDir);
        await waitForServer();
      } catch (err) {
        fatalError(
          "No se pudo iniciar GymBot AI",
          `${err.stack || err.message}\n\nRevisa el archivo server.log en:\n${path.join(userDataDir, "server.log")}`,
        );
        return;
      }

      createWindow();
      createTray();
    } catch (err) {
      fatalError("Error inesperado en GymBot AI", err.stack || String(err));
    }
  });

  app.on("window-all-closed", () => {
    // No hacemos nada: la app sigue viva en la bandeja del sistema (ver createWindow -> 'close').
  });

  app.on("before-quit", () => {
    quitting = true;
  });
}
