const chatMessages = document.getElementById("chat-messages");
const chatForm = document.getElementById("chat-form");
const textarea = document.getElementById("chat-textarea");
const sendButton = document.getElementById("send-button");
const statusDot = document.getElementById("status-dot");
const statusText = document.getElementById("status-text");
const modelBadge = document.getElementById("model-badge");
const quickActions = document.getElementById("quick-actions");
const fileInput = document.getElementById("file-input");
const attachButton = document.getElementById("attach-button");
const attachmentPreview = document.getElementById("attachment-preview");
const attachmentName = document.getElementById("attachment-name");
const attachmentRemove = document.getElementById("attachment-remove");
const newChatButton = document.getElementById("new-chat-button");
const historyList = document.getElementById("history-list");
const historySection = document.getElementById("history-section");
const navItems = document.querySelectorAll(".nav-item[data-nav]");
const views = {
  chat: document.getElementById("view-chat"),
  tasks: document.getElementById("view-tasks"),
  members: document.getElementById("view-members"),
  settings: document.getElementById("view-settings"),
};
const membersSearch = document.getElementById("members-search");
const membersTableBody = document.getElementById("members-table-body");
const membersEmpty = document.getElementById("members-empty");

let attachedFile = null;

// Funciones extra que solo existen dentro de la app de escritorio (electron/preload.cjs): elegir
// carpeta con el diálogo del sistema, abrirla en el explorador, arrancar con el ordenador...
const desktop = window.olimpia || null;

const TOOL_TAGS = {
  list_members: "Miembros",
  get_member: "Miembros",
  update_member: "Miembros",
  list_classes: "Horarios",
  list_disciplines: "Horarios",
  create_class: "Horarios",
  list_invoices: "Pagos",
  register_payment: "Pagos",
  dashboard_summary: "Resumen",
  list_exercises: "Rutinas",
  list_workout_plan: "Rutinas",
  assign_workout_plan: "Rutinas",
  list_recipes: "Nutrición",
  list_meal_plan: "Nutrición",
  assign_meal_plan: "Nutrición",
  delete_meal_plan: "Nutrición",
  delete_workout_plan: "Rutinas",
  list_local_files: "Archivos",
  read_local_file: "Archivos",
  list_scheduled_tasks: "Tareas",
  create_scheduled_task: "Tareas",
  delete_scheduled_task: "Tareas",
  list_class_bookings: "Reservas",
  list_workout_logs: "Rutinas",
  list_personal_records: "Rutinas",
  create_local_folder: "Archivos",
  save_local_file: "Archivos",
  save_attachment_to_folder: "Archivos",
  set_files_folder: "Archivos",
  list_nutrition_logs: "Nutrición",
  list_calorie_goal_history: "Nutrición",
};

function escapeHtml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Convierte un subconjunto muy simple de markdown (negrita, listas, código en línea,
// párrafos) a HTML seguro, escapando primero todo el texto.
function renderMarkdown(text) {
  const escaped = escapeHtml(text);
  const blocks = escaped.split(/\n{2,}/);

  const html = blocks
    .map((block) => {
      const lines = block.split("\n").filter((l) => l.trim() !== "");
      const isList = lines.length > 0 && lines.every((l) => /^\s*[-*]\s+/.test(l));
      const isOrdered = lines.length > 0 && lines.every((l) => /^\s*\d+[.)]\s+/.test(l));

      if (isList) {
        const items = lines.map((l) => `<li>${inline(l.replace(/^\s*[-*]\s+/, ""))}</li>`).join("");
        return `<ul>${items}</ul>`;
      }
      if (isOrdered) {
        const items = lines.map((l) => `<li>${inline(l.replace(/^\s*\d+[.)]\s+/, ""))}</li>`).join("");
        return `<ol>${items}</ol>`;
      }
      return lines
        .map((l) => {
          const heading = l.match(/^#{1,6}\s+(.*)$/);
          return heading ? `<h4>${inline(heading[1])}</h4>` : `<p>${inline(l)}</p>`;
        })
        .join("")
        .replace(/<\/p><p>/g, "<br>");
    })
    .join("");

  return html;

  function inline(line) {
    return line
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/`(.+?)`/g, "<code>$1</code>");
  }
}

function timeLabel() {
  return new Date().toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
}

function addMessage({ role, text, tags = [], time = timeLabel() }) {
  const row = document.createElement("div");
  row.className = `msg-row ${role}`;

  if (role === "system") {
    row.innerHTML = `<div class="msg-bubble">${escapeHtml(text)}</div>`;
    chatMessages.appendChild(row);
    scrollToBottom();
    return row;
  }

  const avatar = document.createElement("div");
  avatar.className = `msg-avatar ${role}`;
  avatar.textContent = role === "assistant" ? "O" : "AD";

  const body = document.createElement("div");
  body.className = "msg-body";

  const tagsHtml =
    tags.length > 0
      ? `<div class="msg-tags">${tags.map((t) => `<span class="msg-tag">${escapeHtml(t)}</span>`).join("")}</div>`
      : "";

  const bubbleContent = role === "assistant" ? renderMarkdown(text) : `<p>${escapeHtml(text)}</p>`;

  body.innerHTML = `${tagsHtml}<div class="msg-bubble">${bubbleContent}</div><div class="msg-time">${time}</div>`;

  row.appendChild(avatar);
  row.appendChild(body);
  chatMessages.appendChild(row);
  scrollToBottom();
  return row;
}

// Tarjetas de confirmación con botones reales: la ejecución de cada acción NUNCA depende de que
// el modelo "se acuerde" de hacerlo bien, siempre pasa por /api/confirm. Puede haber varias a la
// vez (p.ej. una rutina Y un plan de comidas propuestos en el mismo mensaje), cada una con su
// propio id e independiente de las demás.
function addPendingActionCard(id, summary) {
  const row = document.createElement("div");
  row.className = "msg-row assistant";
  row.innerHTML = `
    <div class="msg-avatar assistant">O</div>
    <div class="msg-body">
      <div class="msg-tags"><span class="msg-tag">Confirmación requerida</span></div>
      <div class="msg-bubble confirm-card">
        <p>${escapeHtml(summary)}</p>
        <div class="confirm-actions">
          <button type="button" class="btn-confirm">✅ Confirmar</button>
          <button type="button" class="btn-cancel">❌ Cancelar</button>
        </div>
      </div>
      <div class="msg-time">${timeLabel()}</div>
    </div>
  `;
  chatMessages.appendChild(row);
  scrollToBottom();

  const confirmBtn = row.querySelector(".btn-confirm");
  const cancelBtn = row.querySelector(".btn-cancel");
  confirmBtn.addEventListener("click", () => resolvePendingAction(id, row, true));
  cancelBtn.addEventListener("click", () => resolvePendingAction(id, row, false));

  return row;
}

async function resolvePendingAction(id, row, approve) {
  const actions = row.querySelector(".confirm-actions");
  if (actions) actions.innerHTML = `<span class="typing"><span></span><span></span><span></span></span>`;
  setSending(true);

  try {
    const res = await fetch("/api/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, approve }),
    });
    const data = await res.json();
    if (actions) actions.remove();

    if (!res.ok) {
      addMessage({ role: "system", text: data.error || "Error desconocido." });
    } else {
      addMessage({ role: "assistant", text: data.reply, tags: [approve ? "Confirmado" : "Cancelado"] });
    }
  } catch {
    addMessage({ role: "system", text: "No se pudo conectar con el servidor." });
  } finally {
    setSending(false);
    textarea.focus();
    loadConversationList();
  }
}

function addTypingIndicator() {
  const row = document.createElement("div");
  row.className = "msg-row assistant";
  row.innerHTML = `
    <div class="msg-avatar assistant">O</div>
    <div class="msg-body">
      <div class="msg-bubble"><span class="typing"><span></span><span></span><span></span></span></div>
    </div>
  `;
  chatMessages.appendChild(row);
  scrollToBottom();
  return row;
}

function scrollToBottom() {
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function toolTagsFor(toolsUsed) {
  const labels = new Set(toolsUsed.map((name) => TOOL_TAGS[name] || name));
  return Array.from(labels);
}

async function sendMessage(text) {
  // Las tarjetas de confirmación pendientes de turnos anteriores siguen siendo válidas (el
  // servidor las conserva hasta que se resuelven): no las tocamos al enviar un mensaje nuevo.
  const file = attachedFile;
  const displayText = file ? `${text || "(sin texto)"}\n📎 ${file.name}` : text;
  addMessage({ role: "user", text: displayText });
  textarea.value = "";
  clearAttachment();
  autoResize();
  setSending(true);

  const typingRow = addTypingIndicator();

  try {
    const formData = new FormData();
    formData.append("message", text);
    if (file) formData.append("file", file);

    const res = await fetch("/api/chat", { method: "POST", body: formData });
    const data = await res.json();

    typingRow.remove();

    if (!res.ok) {
      addMessage({ role: "system", text: data.error || "Error desconocido." });
    } else {
      addMessage({ role: "assistant", text: data.reply, tags: toolTagsFor(data.toolsUsed || []) });
      if (data.model) modelBadge.textContent = data.model;
      for (const pending of data.pendingActions || []) {
        addPendingActionCard(pending.id, pending.summary);
      }
    }
  } catch (err) {
    typingRow.remove();
    addMessage({ role: "system", text: "No se pudo conectar con el servidor." });
  } finally {
    setSending(false);
    textarea.focus();
    loadConversationList();
  }
}

function setSending(isSending) {
  sendButton.disabled = isSending;
  textarea.disabled = isSending;
}

function autoResize() {
  textarea.style.height = "auto";
  textarea.style.height = `${Math.min(textarea.scrollHeight, 140)}px`;
}

chatForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const text = textarea.value.trim();
  if ((!text && !attachedFile) || sendButton.disabled) return;
  sendMessage(text);
});

textarea.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    chatForm.requestSubmit();
  }
});

textarea.addEventListener("input", autoResize);

const MAX_ATTACHMENT_BYTES = 15 * 1024 * 1024;

attachButton.addEventListener("click", () => fileInput.click());

fileInput.addEventListener("change", () => {
  const file = fileInput.files?.[0];
  fileInput.value = ""; // permite volver a seleccionar el mismo archivo si lo quita y lo pone otra vez
  if (!file) return;

  if (file.size > MAX_ATTACHMENT_BYTES) {
    addMessage({ role: "system", text: "El archivo es demasiado grande (máximo 15 MB)." });
    return;
  }

  attachedFile = file;
  attachmentName.textContent = `📎 ${file.name}`;
  attachmentPreview.hidden = false;
  textarea.focus();
});

attachmentRemove.addEventListener("click", () => clearAttachment());

function clearAttachment() {
  attachedFile = null;
  attachmentPreview.hidden = true;
  attachmentName.textContent = "";
}

quickActions.addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-prompt]");
  if (!btn || sendButton.disabled) return;
  sendMessage(btn.dataset.prompt);
});

function formatEuros(value) {
  return new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(
    value,
  );
}

async function refreshStats() {
  try {
    const res = await fetch("/api/stats");
    if (!res.ok) throw new Error("stats error");
    const stats = await res.json();

    document.getElementById("stat-members").textContent = stats.activeMembers;
    document.getElementById("stat-income").textContent = formatEuros(stats.incomeThisMonth);
    document.getElementById("stat-classes").textContent = stats.classesToday;
    document.getElementById("stat-payments").textContent = stats.paymentsThisMonth;
    if (stats.model) modelBadge.textContent = stats.model;

    statusDot.className = "status-dot online";
    statusText.textContent = "Conectado";
  } catch {
    statusDot.className = "status-dot offline";
    statusText.textContent = "Sin conexión";
  }
}

function showWelcomeMessage() {
  addMessage({
    role: "assistant",
    text:
      "¡Hola! Soy **OlimpIA**, tu asistente del gimnasio. Puedo ayudarte a:\n\n" +
      "- Consultar y gestionar **miembros**, **pagos** y **clases**\n" +
      "- Preparar **rutinas** y **planes de comidas** a medida, leyendo la **ficha** de cada cliente\n" +
      "- Leer **PDF, Word, Excel o fotos** que me adjuntes o que dejes en la carpeta de fichas\n" +
      "- Hacer cosas **automáticamente** cada día, semana o mes (p.ej. las rutinas de todos el día 1)\n\n" +
      "¿En qué puedo ayudarte hoy?",
    tags: ["Inicio"],
  });
}

// Al cargar la página (o cambiar de conversación), recuperamos lo que haya pasado en la
// conversación activa (incluidas las tareas programadas que se hayan ejecutado solas mientras el
// navegador estaba cerrado) en vez de empezar siempre de cero.
async function loadHistory() {
  chatMessages.innerHTML = "";
  try {
    const res = await fetch("/api/history");
    if (!res.ok) throw new Error("history error");
    const data = await res.json();

    if (!data.messages || data.messages.length === 0) {
      showWelcomeMessage();
      return;
    }

    for (const msg of data.messages) {
      addMessage({ role: msg.role, text: msg.text });
    }
    for (const pending of data.pendingActions || []) {
      addPendingActionCard(pending.id, pending.summary);
    }
    if (data.model) modelBadge.textContent = data.model;
  } catch {
    showWelcomeMessage();
  }
}

function conversationLabel(conv) {
  if (conv.id === "automation") return "🕒 " + conv.title.replace(/^🕒\s*/, "");
  return conv.title;
}

async function loadConversationList() {
  try {
    const res = await fetch("/api/conversations");
    if (!res.ok) throw new Error("conversations error");
    const conversations = await res.json();

    historyList.innerHTML = "";
    for (const conv of conversations) {
      const item = document.createElement("div");
      item.className = `history-item${conv.active ? " active" : ""}`;
      item.innerHTML = `
        <span class="history-item-title"></span>
        <button type="button" class="history-item-delete" aria-label="Eliminar conversación">✕</button>
      `;
      item.querySelector(".history-item-title").textContent = conversationLabel(conv);
      item.addEventListener("click", () => switchConversation(conv.id));
      item.querySelector(".history-item-delete").addEventListener("click", (e) => {
        e.stopPropagation();
        deleteConversationItem(conv.id);
      });
      historyList.appendChild(item);
    }
  } catch {
    // si falla, simplemente dejamos la lista como estaba
  }
}

async function switchConversation(id) {
  if (sendButton.disabled) return;
  try {
    await fetch(`/api/conversations/${id}/activate`, { method: "POST" });
    await loadHistory();
    await loadConversationList();
    textarea.focus();
  } catch {
    addMessage({ role: "system", text: "No se pudo cambiar de conversación." });
  }
}

async function startNewChat() {
  if (sendButton.disabled) return;
  try {
    await fetch("/api/conversations", { method: "POST" });
    await loadHistory();
    await loadConversationList();
    textarea.focus();
  } catch {
    addMessage({ role: "system", text: "No se pudo crear una conversación nueva." });
  }
}

async function deleteConversationItem(id) {
  try {
    await fetch(`/api/conversations/${id}`, { method: "DELETE" });
    await loadHistory(); // el servidor puede haber cambiado la conversación activa
    await loadConversationList();
  } catch {
    addMessage({ role: "system", text: "No se pudo eliminar la conversación." });
  }
}

newChatButton.addEventListener("click", startNewChat);

// --- Navegación entre secciones --------------------------------------------------------------
function switchView(view) {
  navItems.forEach((btn) => btn.classList.toggle("active", btn.dataset.nav === view));
  for (const [name, el] of Object.entries(views)) el.hidden = name !== view;
  // El historial de conversaciones solo tiene sentido mientras se ve el chat.
  historySection.style.display = view === "chat" ? "" : "none";

  if (view === "chat") {
    loadHistory();
    loadConversationList();
  }
  if (view === "members") {
    loadMembers(membersSearch.value.trim());
    membersSearch.focus();
  }
  if (view === "tasks") {
    loadTasks();
    loadFichas();
    loadFiles();
  }
  if (view === "settings") loadSettings();
}

navItems.forEach((btn) => {
  btn.addEventListener("click", () => switchView(btn.dataset.nav));
});

async function loadMembers(search = "") {
  membersTableBody.innerHTML = `<tr><td colspan="3" class="members-loading">Cargando…</td></tr>`;
  membersEmpty.hidden = true;

  try {
    const url = search ? `/api/members?q=${encodeURIComponent(search)}` : "/api/members";
    const res = await fetch(url);
    if (!res.ok) throw new Error("members error");
    const members = await res.json();

    membersTableBody.innerHTML = "";
    if (members.length === 0) {
      membersEmpty.hidden = false;
      return;
    }

    for (const m of members) {
      const row = document.createElement("tr");
      row.innerHTML = `
        <td>${escapeHtml(m.first_name || "")}</td>
        <td>${escapeHtml(m.last_name || "")}</td>
        <td>${escapeHtml(m.email || "")}</td>
      `;
      membersTableBody.appendChild(row);
    }
  } catch {
    membersTableBody.innerHTML = "";
    membersEmpty.hidden = false;
    membersEmpty.textContent = "No se pudieron cargar los socios.";
  }
}

let membersSearchTimer = null;
membersSearch.addEventListener("input", () => {
  clearTimeout(membersSearchTimer);
  membersSearchTimer = setTimeout(() => loadMembers(membersSearch.value.trim()), 300);
});

// --- Tareas automáticas y carpeta de fichas ---------------------------------------------------
const tasksList = document.getElementById("tasks-list");
const filesList = document.getElementById("files-list");
const filesRoot = document.getElementById("files-root");
const filesOpenButton = document.getElementById("files-open");
let tasksPollTimer = null;
let currentFilesDir = "";

async function loadTasks() {
  clearTimeout(tasksPollTimer);
  try {
    const res = await fetch("/api/tasks");
    const tasks = await res.json();
    if (!res.ok) throw new Error(tasks.error);
    tasksList.innerHTML = "";

    if (tasks.length === 0) {
      tasksList.innerHTML = `<div class="empty-card">Todavía no hay tareas automáticas. Pídele una a OlimpIA desde el chat.</div>`;
      return;
    }

    for (const task of tasks) {
      const card = document.createElement("div");
      card.className = "task-card";
      const pills = [
        `<span class="pill">🗓️ ${escapeHtml(task.schedule)}</span>`,
        task.clients
          ? `<span class="pill">👥 ${escapeHtml(task.clients.join(", "))}</span>`
          : task.clientFilesFolder !== null
            ? `<span class="pill">📁 Por cada ficha de "${escapeHtml(task.clientFilesFolder || "(carpeta principal)")}"</span>`
            : "",
        task.requireConfirmation
          ? `<span class="pill">✋ Pide confirmación</span>`
          : `<span class="pill ok">⚡ Guarda los cambios sola</span>`,
        task.running ? `<span class="pill ok">⏳ Ejecutándose…</span>` : "",
      ].join("");
      const last = task.lastRunDate
        ? `Última ejecución: ${escapeHtml(task.lastRunDate)}${task.lastRunSummary ? ` — ${escapeHtml(task.lastRunSummary)}` : ""}`
        : "Todavía no se ha ejecutado.";
      card.innerHTML = `
        <div class="task-main">
          <div class="task-description"></div>
          <div class="task-meta">${pills}</div>
          <div class="task-last">${last}</div>
        </div>
        <div class="row-actions">
          <button type="button" class="btn-secondary" data-action="run" ${task.running ? "disabled" : ""}>▶ Ejecutar ahora</button>
          <button type="button" class="btn-danger" data-action="delete">Eliminar</button>
        </div>
      `;
      card.querySelector(".task-description").textContent = task.description;
      card.querySelector('[data-action="run"]').addEventListener("click", (e) => runTaskNow(task.id, e.currentTarget));
      card.querySelector('[data-action="delete"]').addEventListener("click", (e) => deleteTask(task.id, e.currentTarget));
      tasksList.appendChild(card);
    }

    // Mientras alguna tarea se está ejecutando, refrescamos para ver cuándo termina.
    if (tasks.some((t) => t.running) && !views.tasks.hidden) {
      tasksPollTimer = setTimeout(loadTasks, 5000);
    }
  } catch (err) {
    tasksList.innerHTML = `<div class="empty-card"></div>`;
    tasksList.firstChild.textContent = err?.message || "No se pudieron cargar las tareas.";
  }
}

// --- Fichas en la nube --------------------------------------------------------------------------
const fichasList = document.getElementById("fichas-list");
const fichasSyncInfo = document.getElementById("fichas-sync-info");
const fichasSyncButton = document.getElementById("fichas-sync");

const FICHA_STATUS = {
  ok: { pill: "ok", text: "✅ En la nube" },
  not_found: { pill: "warn", text: "⚠️ Socio no encontrado" },
  duplicate: { pill: "warn", text: "⚠️ Nombre repetido" },
  unreadable: { pill: "warn", text: "⚠️ No se puede leer" },
};

function formatDateTime(iso) {
  return new Date(iso).toLocaleString("es-ES", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

async function loadFichas(sync = false) {
  fichasSyncButton.disabled = true;
  try {
    const res = await fetch(`/api/fichas${sync ? "?sync=1" : ""}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    fichasSyncInfo.textContent = data.sync.error
      ? `⚠️ No se pudo sincronizar: ${data.sync.error}`
      : data.sync.lastSyncAt
        ? `Última comprobación: ${formatDateTime(data.sync.lastSyncAt)}`
        : "";
    fichasList.innerHTML = "";
    if (data.fichas.length === 0) {
      fichasList.innerHTML = `<div class="members-empty">Ninguna tarea usa fichas todavía. Se subirán solas cuando crees una tarea por cliente.</div>`;
      return;
    }
    for (const f of data.fichas) {
      const status = FICHA_STATUS[f.matchStatus] || FICHA_STATUS.ok;
      const row = document.createElement("div");
      row.className = "file-row ficha-row";
      row.innerHTML = `
        <span class="file-name"></span>
        <span class="file-info"><span class="pill ${status.pill}"></span> <span class="ficha-date"></span></span>
        <span class="ficha-note"></span>
      `;
      row.querySelector(".file-name").textContent = `📄 ${f.clientName}${f.folder ? `  ·  ${f.folder}` : ""}`;
      row.querySelector(".pill").textContent = status.text;
      row.querySelector(".ficha-date").textContent = `subida ${formatDateTime(f.syncedAt)}`;
      row.querySelector(".ficha-note").textContent = f.matchNote || "";
      fichasList.appendChild(row);
    }
  } catch (err) {
    fichasList.innerHTML = `<div class="members-empty"></div>`;
    fichasList.firstChild.textContent = err?.message || "No se pudo leer el estado de las fichas.";
  } finally {
    fichasSyncButton.disabled = false;
  }
}

fichasSyncButton.addEventListener("click", () => loadFichas(true));

async function runTaskNow(id, button) {
  button.disabled = true;
  const res = await fetch(`/api/tasks/${id}/run`, { method: "POST" });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    button.disabled = false;
    button.textContent = data.error || "Error";
    return;
  }
  loadTasks();
}

// Pide un segundo clic para confirmar (sin diálogos del navegador).
async function deleteTask(id, button) {
  if (button.dataset.armed !== "1") {
    button.dataset.armed = "1";
    button.textContent = "¿Seguro? Pulsa otra vez";
    setTimeout(() => {
      button.dataset.armed = "";
      button.textContent = "Eliminar";
    }, 4000);
    return;
  }
  await fetch(`/api/tasks/${id}`, { method: "DELETE" });
  loadTasks();
}

document.getElementById("tasks-refresh").addEventListener("click", () => {
  loadTasks();
  loadFichas();
  loadFiles();
});

async function loadFiles() {
  try {
    const res = await fetch("/api/files");
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    currentFilesDir = data.root;
    filesRoot.innerHTML = `Carpeta: <code></code>`;
    filesRoot.querySelector("code").textContent = data.root;
    filesOpenButton.hidden = !desktop;

    filesList.innerHTML = "";
    if (data.files.length === 0) {
      filesList.innerHTML = `<div class="members-empty">La carpeta está vacía. Crea dentro una carpeta "Fichas" con la ficha de cada cliente.</div>`;
      return;
    }
    for (const f of data.files) {
      const row = document.createElement("div");
      row.className = `file-row ${f.type}`;
      const depth = f.path.replace(/\/$/, "").split("/").length - 1;
      row.innerHTML = `<span class="file-name"></span><span class="file-info"></span>`;
      row.style.paddingLeft = `${16 + depth * 18}px`;
      row.querySelector(".file-name").textContent = `${f.type === "folder" ? "📁" : "📄"} ${f.path.replace(/\/$/, "").split("/").pop()}`;
      row.querySelector(".file-info").textContent = f.type === "file" ? `${f.size_kb} KB · ${f.modified}` : "";
      filesList.appendChild(row);
    }
  } catch (err) {
    filesList.innerHTML = `<div class="members-empty">No se pudo leer la carpeta de fichas.</div>`;
  }
}

filesOpenButton.addEventListener("click", () => desktop?.openFolder(currentFilesDir));

// --- Ajustes -----------------------------------------------------------------------------------
const settingsForm = document.getElementById("settings-form");
const settingsResult = document.getElementById("settings-result");
const setupBanner = document.getElementById("setup-banner");
const filesPickButton = document.getElementById("set-files-pick");
const autostartRow = document.getElementById("autostart-row");
const autostartInput = document.getElementById("set-autostart");

async function loadSettings() {
  settingsResult.textContent = "";
  settingsResult.className = "settings-result";
  try {
    const s = await (await fetch("/api/settings")).json();
    document.getElementById("set-openai-key").value = "";
    document.getElementById("set-openai-key").placeholder = s.openaiApiKey ? `Guardada (${s.openaiApiKey}) — escribe para cambiarla` : "sk-…";
    document.getElementById("set-supabase-key").value = "";
    document.getElementById("set-supabase-key").placeholder = s.supabaseServiceRoleKey
      ? `Guardada (${s.supabaseServiceRoleKey}) — escribe para cambiarla`
      : "eyJ…";
    document.getElementById("set-openai-model").value = s.openaiModel;
    document.getElementById("set-supabase-url").value = s.supabaseUrl;
    document.getElementById("set-files-dir").value = s.localFilesDir;
    document.getElementById("set-require-confirmation").checked = s.requireConfirmation;
  } catch {
    settingsResult.textContent = "No se pudieron cargar los ajustes.";
    settingsResult.className = "settings-result error";
  }

  filesPickButton.hidden = !desktop;
  autostartRow.hidden = !desktop?.getAutostart;
  if (desktop?.getAutostart) autostartInput.checked = await desktop.getAutostart();
}

filesPickButton.addEventListener("click", async () => {
  const folder = await desktop?.pickFolder(document.getElementById("set-files-dir").value);
  if (folder) document.getElementById("set-files-dir").value = folder;
});

autostartInput.addEventListener("change", () => desktop?.setAutostart(autostartInput.checked));

const CHECK_LABELS = { supabase: "Supabase", openai: "OpenAI", folder: "Carpeta de fichas" };

settingsForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const saveButton = document.getElementById("settings-save");
  saveButton.disabled = true;
  settingsResult.className = "settings-result";
  settingsResult.textContent = "Guardando y comprobando la conexión…";

  try {
    const body = Object.fromEntries(new FormData(settingsForm).entries());
    body.requireConfirmation = document.getElementById("set-require-confirmation").checked;
    const res = await fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    const lines = Object.entries(data.checks).map(
      ([key, value]) => `${value === "ok" ? "✅" : "❌"} ${CHECK_LABELS[key] || key}${value === "ok" ? "" : `: ${value.replace(/^Error: /, "")}`}`,
    );
    settingsResult.textContent = lines.join("\n");
    settingsResult.className = `settings-result ${data.ok ? "ok" : "error"}`;
    if (data.ok) {
      setupBanner.hidden = true;
      refreshStats();
    }
    await loadSettings().then(() => {
      settingsResult.textContent = lines.join("\n");
      settingsResult.className = `settings-result ${data.ok ? "ok" : "error"}`;
    });
  } catch (err) {
    settingsResult.textContent = `No se pudo guardar: ${err.message || err}`;
    settingsResult.className = "settings-result error";
  } finally {
    saveButton.disabled = false;
  }
});

async function init() {
  // Primera vez (o claves borradas): directamente a Ajustes, con un aviso de bienvenida.
  try {
    const status = await (await fetch("/api/status")).json();
    if (status.missingSettings.length > 0) {
      setupBanner.hidden = false;
      switchView("settings");
      statusDot.className = "status-dot offline";
      statusText.textContent = "Falta configuración";
      return;
    }
  } catch {
    // Si falla, seguimos con el chat normal y ya se verá el error ahí.
  }

  loadHistory();
  loadConversationList();
  refreshStats();
  setInterval(refreshStats, 30000);
  textarea.focus();
}

init();
