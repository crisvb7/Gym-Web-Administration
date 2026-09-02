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
const viewChat = document.getElementById("view-chat");
const viewMembers = document.getElementById("view-members");
const membersSearch = document.getElementById("members-search");
const membersTableBody = document.getElementById("members-table-body");
const membersEmpty = document.getElementById("members-empty");

let attachedFile = null;

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
  list_local_files: "Archivos",
  read_local_file: "Archivos",
  list_scheduled_tasks: "Tareas",
  create_scheduled_task: "Tareas",
  delete_scheduled_task: "Tareas",
  list_class_bookings: "Reservas",
  list_workout_logs: "Rutinas",
  list_nutrition_logs: "Nutrición",
  list_calorie_goal_history: "Nutrición",
};

function escapeHtml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// Convierte un subconjunto muy simple de markdown (negrita, listas, código en línea,
// párrafos) a HTML seguro, escapando primero todo el texto.
function renderMarkdown(text) {
  const escaped = escapeHtml(text);
  const blocks = escaped.split(/\n{2,}/);

  const html = blocks
    .map((block) => {
      const lines = block.split("\n").filter((l) => l.trim() !== "");
      const isList = lines.length > 0 && lines.every((l) => /^\s*-\s+/.test(l));

      if (isList) {
        const items = lines.map((l) => `<li>${inline(l.replace(/^\s*-\s+/, ""))}</li>`).join("");
        return `<ul>${items}</ul>`;
      }
      return `<p>${lines.map(inline).join("<br>")}</p>`;
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
  avatar.textContent = role === "assistant" ? "G" : "AD";

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
    <div class="msg-avatar assistant">G</div>
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
    <div class="msg-avatar assistant">G</div>
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
      "¡Hola! Soy **GymBot**, tu asistente de administración para el gimnasio. Puedo ayudarte a:\n\n" +
      "- Consultar y gestionar **miembros**\n" +
      "- Revisar **pagos** y facturación\n" +
      "- Administrar **clases**, **rutinas** y **nutrición**\n" +
      "- Ejecutar **tareas programadas** de forma recurrente\n\n" +
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

// --- Navegación entre secciones (Chat IA / Miembros) --------------------------------------------
function switchView(view) {
  navItems.forEach((btn) => btn.classList.toggle("active", btn.dataset.nav === view));
  viewChat.hidden = view !== "chat";
  viewMembers.hidden = view !== "members";
  // El historial de conversaciones solo tiene sentido mientras se ve el chat.
  historySection.style.display = view === "chat" ? "" : "none";

  if (view === "members") {
    loadMembers(membersSearch.value.trim());
    membersSearch.focus();
  }
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

function init() {
  loadHistory();
  loadConversationList();
  refreshStats();
  setInterval(refreshStats, 30000);
  textarea.focus();
}

init();
