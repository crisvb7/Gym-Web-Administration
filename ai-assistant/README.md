# OlimpIA — asistente de IA del gimnasio

App de escritorio (Windows y Mac) con un chat de IA que trabaja directamente sobre la misma base de
datos Supabase que la web de administración: consulta y gestiona socios, clases, pagos, **rutinas**
y **planes de comidas**, lee las **fichas de los clientes** (PDF, Word, Excel, texto o fotos) y hace
tareas **automáticas** (p.ej. "cada día 1, la rutina y la dieta del mes de cada cliente según su
ficha").

No forma parte de la web ni se despliega con ella: es un programa aparte que se instala en el
ordenador del gimnasio.

## Para el dueño del gimnasio

### Instalar

1. Ejecuta `OlimpIA-Setup-1.2.0.exe`. Como el instalador no está firmado, Windows puede mostrar
   "Windows protegió su PC": pulsa **Más información → Ejecutar de todas formas**.
2. Al abrirla por primera vez aparece la pantalla de **Ajustes**: pega la clave de OpenAI y la
   clave de Supabase (service_role) y pulsa **Guardar**. La app comprueba al momento que las dos
   funcionan.
3. Listo. OlimpIA queda configurada para **arrancar sola al encender el ordenador** (oculta, con
   su icono en la bandeja del sistema, junto al reloj). Se puede desactivar en Ajustes.

### Fichas de clientes

- Por defecto la carpeta es `Documentos\OlimpIA` (se puede cambiar en Ajustes → "Elegir…").
- Crea dentro una carpeta `Fichas` y deja ahí la ficha de cada cliente **con su nombre y
  apellidos**, igual que en la web: `Fichas\María López.pdf`, `Fichas\Juan Pérez.docx`… También vale
  una subcarpeta por cliente con varios documentos (`Fichas\María López\…`).
- Formatos: PDF (con texto, no escaneado), Word `.docx`, Excel, CSV, `.txt`, `.md`, `.rtf`. Las
  fotos o los PDF escaneados se pueden adjuntar en el chat con 📎.
- También se le puede pedir por el chat: "crea la carpeta Fichas", "guarda esta ficha como la de
  María López" (adjuntándola), "apunta en la ficha de Juan que se ha lesionado el tobillo".

### Rutinas y dietas automáticas

Pídeselo en el chat, por ejemplo:

> Cada día 1 de cada mes, prepara la rutina de entrenamiento y el plan de comidas del mes a medida
> para cada cliente según su ficha de la carpeta Fichas.

Por defecto los planes **se guardan solos**. Si pides revisarlos antes, quedan con un botón ✅
Confirmar en la conversación "🕒 Tareas automáticas" (ojo: el cliente no los ve hasta que se
confirman).

- Para cada cliente lee su ficha, lo busca en la base de datos y tiene en cuenta sus marcas, lo que
  ha entrenado y su plan anterior. Si no lo encuentra o hay dos socios con el mismo nombre, no le
  asigna nada y lo explica.
- **Las tareas se hacen en la nube (Supabase), aunque el ordenador esté apagado.** El ordenador solo
  hace falta para subir las fichas: OlimpIA revisa la carpeta al arrancar y cada minuto mientras
  está abierta, y sube las que han cambiado. Basta con que el ordenador se encienda alguna vez
  después de editar una ficha.
- La pantalla **Tareas y fichas** muestra las tareas, el resultado de la última ejecución (qué
  clientes se quedaron sin cambios), un botón **▶ Ejecutar ahora** y el estado de cada ficha en la
  nube: ✅ subida, o ⚠️ si no hay ningún socio con ese nombre, hay varios, o es una imagen que no se
  puede leer.
- Los resultados llegan al hilo "🕒 Tareas automáticas" la próxima vez que se abre OlimpIA. Los
  clientes ven sus planes en la app del gimnasio desde el primer momento.

### Seguridad

- Por defecto OlimpIA **hace directamente lo que se le pide** (asignar rutinas, registrar pagos…).
  Si se prefiere revisar antes cada cambio, en Ajustes se activa "Pedir confirmación": los cambios
  quedan con un botón ✅ Confirmar. Cada tarea automática puede pedir confirmación aunque el ajuste
  general sea "directo".
- La clave de Supabase (service_role) da acceso total a la base de datos: se guarda solo en este
  ordenador (`%APPDATA%\OlimpIA\.env`) y el servidor interno solo acepta conexiones del propio
  ordenador, nunca de otros equipos de la red.

## Para quien mantenga esto

Node.js 18+.

```bash
cd ai-assistant
npm install
npm start            # servidor + interfaz en http://localhost:3000 (configura en Ajustes, o copia .env.example a .env)
npm run dev          # igual, reiniciando al guardar
npm run cli          # versión de consola
npm run typecheck
npm run electron     # app de escritorio en modo desarrollo (usa el .env del proyecto)
npm run dist:win     # instalador de Windows → release/OlimpIA-Setup-<versión>.exe (también se puede generar desde Mac)
npm run dist:mac     # .dmg para Mac
npm run deploy:cloud # empaqueta el worker y despliega la función olimpia-tasks en Supabase
```

Datos de la app instalada: `%APPDATA%\OlimpIA\` en Windows, `~/Library/Application Support/OlimpIA/`
en Mac (`.env`, `data/conversations`, `data/scheduled-tasks.json`, `server.log`). Si existe la
configuración de la versión anterior (`GymBot AI`), se copia automáticamente la primera vez.

### Cómo funciona

- Usa la API de OpenAI con **tool calling**: el modelo decide qué herramienta llamar y el servidor la
  ejecuta contra Supabase o la carpeta de fichas. El modelo se cambia en Ajustes (por defecto
  `gpt-5.5`: con `gpt-4o` los planes mensuales salían con 2-3 ejercicios por sesión y progresiones
  irreales; tarda ~3 min por cliente en un plan mensual de rutina + comidas).
- Las herramientas que escriben datos (`update_member`, `create_class`, `register_payment`,
  `assign_workout_plan`, `assign_meal_plan`, `delete_workout_plan`, `delete_meal_plan`) no exponen
  al modelo el parámetro que escribe de verdad: lo decide `writeMode.ts` en cada turno (ajuste
  `REQUIRE_CONFIRMATION` o el de la tarea programada). En modo confirmación, solo el botón
  **Confirmar** (o `s` en la consola) la ejecuta.
- Antes de guardar una rutina se comprueban siempre las marcas personales del socio
  (`personalRecordsCheck.ts`, ±10 %; los pesos dictados por el usuario mandan) y que no tenga ya un
  plan en esas fechas (`existingPlan.ts`; para rehacerlo, `replace_existing`).
- **Tareas en la nube** (`src/cloud/`): las tareas viven en la tabla `olimpia_tasks`. pg_cron llama
  cada minuto a la función `olimpia-tasks` (`supabase/functions/`), que ejecuta `cloud/worker.ts`:
  lanza las tareas que tocan (hora del gimnasio), crea un trabajo por cliente con su ficha
  (`olimpia_fichas`) y avanza cada trabajo **una ronda del modelo por llamada**, con la Responses
  API en modo `background`: ninguna llamada espera al modelo, así que el límite de 150 s de las
  funciones no importa. Usa las mismas herramientas y comprobaciones que el chat (menos las de la
  carpeta local). La app de escritorio (`cloud/sync.ts`) sube la clave/modelo de OpenAI y la zona
  horaria a `olimpia_settings`, sube las fichas que usan las tareas y trae los resultados
  (`olimpia_task_jobs`) a su hilo "🕒 Tareas automáticas", con sus botones Confirmar.
- Las tablas `olimpia_*` tienen RLS sin políticas y ningún permiso para anon/authenticated: solo la
  service_role (app y función) las ve. La migración es
  `supabase/migrations/20261013120000_olimpia_cloud_tasks.sql`.
- Si cambias algo que usa la nube (herramientas, system prompt, worker), vuelve a desplegar la
  función: `npm run deploy:cloud` (empaqueta con esbuild en `worker.bundle.js` y despliega).
- A cada turno se le da un system prompt nuevo (con la fecha de hoy) y solo los mensajes recientes
  que caben en el contexto; el historial completo se guarda en disco.

```
ai-assistant/
  src/
    server.ts            # servidor web: chat, confirmaciones, historial, ajustes, tareas
    index.ts             # versión de consola (npm run cli)
    chatEngine.ts        # bucle de conversación + tool calling + confirmaciones
    config.ts            # ajustes (.env), editables en caliente desde la interfaz
    conversationStore.ts # conversaciones en disco (data/conversations/)
    scheduledTasks.ts    # tareas programadas (tabla olimpia_tasks) y cuándo toca cada una
    cloud/
      worker.ts          # worker de la nube: lanza tareas y avanza cada cliente paso a paso
      cloudTools.ts      # herramientas disponibles en la nube
      sync.ts            # app de escritorio ↔ nube: ajustes, fichas, resultados
      edge.ts            # entrada que se empaqueta para la función de Supabase
    fileIngestion.ts     # lee PDF, Word, Excel, CSV, texto e imágenes
    uploads.ts           # copia de los adjuntos del chat (para archivarlos en la carpeta)
    writeMode.ts         # modo de escritura del turno: directo o con botón Confirmar
    dates.ts             # fechas en hora local (no UTC)
    systemPrompt.ts      # instrucciones del asistente
    tools/
      confirmation.ts    # protocolo de confirmación + salvaguarda de "mes completo"
      registry.ts        # herramientas de escritura que ejecuta el botón Confirmar
      existingPlan.ts    # evita duplicar planes y sustituye sin perder el anterior si falla
      personalRecordsCheck.ts # pesos de la rutina frente a las marcas personales
      members.ts, classes.ts, billing.ts, workouts.ts, nutrition.ts, activity.ts, dashboard.ts
      localFiles.ts      # carpeta de fichas: listar, leer, crear carpetas, guardar notas y adjuntos
      tasks.ts           # crear/listar/borrar tareas programadas
  public/                # interfaz (HTML/CSS/JS sin build)
  electron/
    main.cjs             # app de escritorio: servidor interno, ventana, bandeja, arranque con el sistema
    preload.cjs          # puente seguro interfaz ↔ escritorio (elegir carpeta, arranque automático)
    icon.ico/.icns/.png, tray.png
```

### Ampliar el asistente

1. Crea la herramienta en `src/tools/` con `zodFunction` (de `openai/helpers/zod`): nombre,
   descripción, parámetros (Zod) y la función que consulta/escribe.
2. Si **escribe** datos, sigue el patrón de `assignWorkoutPlanImpl` en `workouts.ts`: implementación
   real `fooImpl` con un parámetro `confirmed`, y un `zodFunction` con `.omit({ confirmed: true })`
   que llama a `fooImpl({ ...input, confirmed: !confirmationRequired() })`. Añádela a
   `tools/registry.ts`.
3. Añádela al array `tools` de `src/tools/index.ts` (y a `TOOL_TAGS` en `public/app.js` para su
   etiqueta en el chat).
