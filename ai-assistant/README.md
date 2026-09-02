# Gym AI Assistant

Chatbot de IA **independiente** de la web de administración del gimnasio. Es una app de
Node.js/TypeScript (servidor web propio + interfaz de chat) que habla directamente con la misma
base de datos Supabase que usa `Gym-Web-Administration`, para consultar y gestionar socios, clases,
facturación, rutinas de ejercicios y planes de comidas en lenguaje natural.

No es un componente de React ni se despliega junto a la web: es un programa aparte que ejecutas en
tu propia máquina (o en un servidor) con `npm start`, con su propia interfaz en el navegador.

## Cómo funciona

- Usa la [API de OpenAI](https://platform.openai.com/docs) (ChatGPT) con **function calling /
  tool use**: el modelo decide qué función necesita llamar (buscar un socio, asignar una rutina,
  leer un Excel...) y el script ejecuta esa función contra Supabase o el sistema de archivos.
- **Ninguna escritura a la base de datos ocurre sin que tú lo confirmes.** Las herramientas que
  modifican datos (`update_member`, `create_class`, `register_payment`, `assign_workout_plan`,
  `assign_meal_plan`) tienen el parámetro que activa la escritura real oculto para el modelo: la
  IA solo puede generar una propuesta con resumen. Solo el clic en el botón **✅ Confirmar** de la
  interfaz (o responder `s`/`n` en la consola) ejecuta el cambio de verdad — esto es así tanto si
  la propuesta viene de un mensaje tuyo como de una **tarea programada automática**.
- Las herramientas de solo lectura (`list_members`, `list_classes`, `list_exercises`,
  `list_recipes`, `dashboard_summary`, etc.) no piden confirmación.

## 1. Instalación

Requiere Node.js 18 o superior.

```bash
cd ai-assistant
npm install
```

## 2. Configuración (.env)

```bash
cp .env.example .env
```

Rellena `.env` con:

- `OPENAI_API_KEY`: tu clave de la API de OpenAI, desde https://platform.openai.com/api-keys
- `OPENAI_MODEL` (opcional): modelo a usar, debe soportar function calling y (para adjuntar
  imágenes) visión. Por defecto `gpt-4o`.
- `SUPABASE_URL`: ya viene rellenada (`https://vnockjqtkbhgytmmbdlb.supabase.co`), es la misma que
  usa la web.
- `SUPABASE_SERVICE_ROLE_KEY`: la **service_role key** de tu proyecto Supabase (⚠️ **no** es la
  misma que la `anon key` que usa la web en `src/lib/supabase.ts`). Se obtiene en:
  Supabase Dashboard → Settings → API → Project API keys → `service_role`.
- `LOCAL_FILES_DIR` (opcional): carpeta que el asistente puede leer en cualquier momento (ver
  abajo). Por defecto, `ai-assistant/shared-files/`.

> **Importante sobre la service_role key:** salta las reglas de Row Level Security (RLS) y da
> acceso total a la base de datos. Por eso:
> - Nunca la subas a git (`.env` ya está en `.gitignore`).
> - Nunca la pongas en código de frontend/navegador.
> - Este script debe ejecutarse solo en tu máquina o en un servidor de confianza, nunca
>   exponerse públicamente.

## 3. Ejecución

```bash
npm start
```

Abre **http://localhost:3000** en el navegador. Ejemplos de peticiones:

- "¿Cómo va el gimnasio hoy?"
- "Súbele la cuota a 45€ a Juan Pérez" *(email si hay varios con el mismo nombre)*
- "Prepárame la rutina de octubre para María López, quiere ganar masa muscular"
- "Asígnale el plan de comidas de esta semana a Pedro, bajo en calorías"
- "Mira el Excel de la carpeta compartida y dime qué clientes hay"
- "Cada día 1 de mes, revisa quién tiene el pago pendiente y avísame"

También existe una versión de consola (sin interfaz web ni tareas programadas): `npm run cli`.

Durante el desarrollo puedes usar `npm run dev` (reinicia automáticamente al guardar cambios) o
`npm run typecheck` para comprobar tipos sin compilar.

## App de escritorio (Electron)

Además de la versión web, existe una app instalable de Windows que abre la misma interfaz en una
ventana nativa (con icono propio y en la bandeja del sistema), arrancando el mismo servidor por
dentro — no duplica nada, es un envoltorio sobre el mismo código.

**Probarla sin instalar** (modo desarrollo, usa el `.env` del proyecto):
```bash
npm run electron
```

**Generar el instalador** (`release\GymBot AI Setup 1.0.0.exe`):
```bash
npm run dist:win
```

La primera vez que abras la app instalada, crea un `.env` en tu carpeta de datos de usuario
(`%APPDATA%\GymBot AI\.env`) y te pide rellenarlo (clave de OpenAI + Supabase) antes de arrancar —
los datos (conversaciones, tareas programadas, carpeta compartida) también viven ahí, no dentro de
la carpeta de instalación. Cerrar la ventana no cierra la app: se queda en la bandeja del sistema
para que las tareas programadas sigan funcionando; usa "Salir" en el icono de la bandeja para
cerrarla del todo.

> **Nota para quien mantenga esto — bug conocido de `electron-builder` en Windows:** al empaquetar,
> `electron-builder` puede fallar con `EPERM: operation not permitted, rename ...win-unpacked.tmp
> -> ...win-unpacked` al extraer el binario de Electron. No es un problema de antivirus/permisos
> (se descartó exhaustivamente: exclusión de Defender confirmada por GUI, Controlled Folder Access
> desactivado, sin antivirus de terceros, falla igual como Administrador) — es un bug del propio
> extractor de `electron-builder` en Windows. El workaround (ya aplicado en `package.json` vía
> `"electronDist": ".electron-dist"`) es extraer el Electron descargado con la herramienta nativa
> de Windows en vez de con el extractor interno:
> ```powershell
> Expand-Archive -Path "$env:LOCALAPPDATA\electron\Cache\<hash>\electron-v44.0.0-win32-x64.zip" -DestinationPath ".electron-dist" -Force
> ```
> (el hash de la carpeta cambia; búscalo con `Get-ChildItem "$env:LOCALAPPDATA\electron\Cache" -Recurse -Filter *.zip`).
> Si subes la versión de Electron en el futuro, tendrás que repetir este paso con el nuevo `.zip` y
> actualizar `electronVersion` en `package.json`.

## Historial de conversaciones

Cada conversación se guarda en su propio archivo (`data/conversations/<id>.json`) y sobrevive a
reinicios del servidor. En la barra lateral tienes:

- **＋ Nuevo chat**: empieza una conversación nueva sin perder las anteriores.
- **Lista de conversaciones pasadas**: haz clic para retomar cualquiera donde la dejaste (con su
  historial completo y cualquier confirmación pendiente todavía sin resolver). El título se toma
  automáticamente de tu primer mensaje. Pasa el ratón por encima para ver el botón ✕ y borrarla.

## Carpeta compartida (archivos sin subir cada vez)

Cualquier archivo que dejes en `LOCAL_FILES_DIR` (por defecto `ai-assistant/shared-files/`) es
visible para el asistente en cualquier momento, sin tener que adjuntarlo en el chat — solo
pídeselo ("mira el Excel de clientes"). Soporta hojas de cálculo (XLSX/XLS/CSV) y texto plano
(.txt/.md/.json). Las imágenes solo se pueden interpretar adjuntándolas directamente en el chat
(el botón 📎), no desde esta carpeta.

## Tareas programadas (automatización)

Puedes pedirle al bot, en lenguaje natural, que haga algo de forma recurrente: "cada día 31,
prepara las rutinas de todos los clientes según el Excel de la carpeta, adaptando cada una a sus
notas". El bot crea una tarea (guardada en `data/scheduled-tasks.json`) que se revisa y ejecuta
sola, sin que tengas el navegador abierto.

**Importante:**
- El proceso de Node (`npm start`) tiene que seguir **encendido** para que las tareas se disparen —
  no hace falta el navegador abierto, pero sí el servidor. Si apagas el ordenador o cierras la
  terminal, las tareas no se ejecutarán hasta que vuelvas a arrancarlo (al arrancar, comprueba
  inmediatamente si hay alguna tarea pendiente de ese día). Para que esto funcione 24/7 de verdad,
  necesitas dejar el proceso corriendo en una máquina que no se apague (un servidor, un Mac mini,
  un PC siempre encendido...) — con Windows Task Scheduler, `pm2`, o similar.
- El **contenido** de lo que la tarea genera (rutinas, comidas...) sigue pidiendo tu confirmación
  con el botón, exactamente igual que si lo hubieras pedido tú por chat — una tarea automática
  nunca escribe datos reales de un cliente sin que la apruebes. Abre la web cuando quieras revisar
  y confirmar lo que se haya preparado.
- Las tareas automáticas escriben en su propio hilo de conversación fijo, **"🕒 Tareas
  automáticas"**, visible en el historial de la barra lateral — ábrelo cuando quieras revisar y
  confirmar lo que se haya preparado mientras no mirabas.

## Estructura del proyecto

```
ai-assistant/
  src/
    server.ts          # servidor web (interfaz de chat, confirmaciones, historial)
    index.ts            # versión de consola (npm run cli)
    chatEngine.ts         # bucle de conversación + tool calling + confirmaciones
    conversationStore.ts   # conversaciones persistentes en disco (data/conversations/)
    scheduler.ts             # comprueba y dispara las tareas programadas
    scheduledTasks.ts          # persistencia de tareas (data/scheduled-tasks.json)
    fileIngestion.ts            # interpreta imágenes/Excel/CSV adjuntados o leídos
    config.ts                    # carga y valida las variables de entorno
    supabaseClient.ts              # cliente de Supabase (service_role)
    stats.ts                        # estadísticas del panel (barra superior)
    cli.ts                            # utilidades de consola
    systemPrompt.ts                    # instrucciones del asistente (system prompt)
    tools/
      confirmation.ts    # protocolo de confirmación + salvaguarda de "mes completo"
      registry.ts           # mapa tool -> implementación real (para el botón Confirmar)
      members.ts               # buscar/ver/actualizar socios
      classes.ts                  # listar/crear clases y disciplinas
      billing.ts                     # listar facturas, registrar pagos
      workouts.ts                       # ejercicios y rutinas asignadas
      nutrition.ts                         # recetas y planes de comidas asignados
      localFiles.ts                           # leer la carpeta compartida
      tasks.ts                                   # crear/listar/borrar tareas programadas
      dashboard.ts                                  # resumen general del día
      index.ts                                         # exporta todas las herramientas
  public/               # frontend (HTML/CSS/JS sin build, servido por Express)
  shared-files/         # carpeta compartida por defecto (ver arriba)
  data/                 # tareas programadas persistidas (no se sube a git)
  electron/
    main.cjs              # proceso principal de Electron (arranca el servidor + ventana)
    icon.ico / icon.png     # icono de la app
  .electron-dist/       # Electron pre-extraído para el build en Windows (no se sube a git)
```

## Ampliar el asistente

Para añadir una nueva capacidad:

1. Crea un nuevo archivo en `src/tools/` (o añade una función al archivo existente que
   corresponda) usando `zodFunction` (de `openai/helpers/zod`) para definir nombre, descripción,
   schema de parámetros (Zod) y la función `function` que consulta/escribe en Supabase.
2. Si la herramienta **escribe** datos: sigue el patrón de `assignWorkoutPlanImpl` en
   `workouts.ts` — separa la implementación real (`fooImpl`, con un parámetro `confirmed`) del
   `zodFunction` expuesto al modelo (que usa `.omit({ confirmed: true })` sobre el schema y llama
   a `fooImpl({ ...input, confirmed: false })`), y añádela también a `tools/registry.ts` para que
   el botón "Confirmar" pueda ejecutarla directamente.
3. Expórtala desde `src/tools/index.ts` añadiéndola al array `tools`.

No hace falta tocar `chatEngine.ts` ni `server.ts`: el modelo descubre las herramientas nuevas
automáticamente a partir de su descripción, y el mecanismo de confirmación/historial ya es
genérico para cualquier herramienta nueva que sigas ese patrón.
