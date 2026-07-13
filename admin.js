(() => {
  "use strict";

  const CONFIG = window.UTOPIA_CONFIG || {};
  const qs = (selector) => document.querySelector(selector);
  const qsa = (selector) => [...document.querySelectorAll(selector)];
  const PAGE_SIZE = 100;

  const state = {
    token: localStorage.getItem("utopiaAdminToken") || "",
    user: null,
    raffles: [],
    raffleId: CONFIG.raffleId,
    participants: [],
    board: [],
    numberPage: 0,
    selectedNumber: null,
    currentView: "dashboard",
    results: []
  };

  const viewTitles = {
    dashboard: ["Resumen", "Panel general"],
    raffles: ["Sorteos", "Configuración del sorteo"],
    participants: ["Participantes", "Base de datos de participantes"],
    payments: ["Pagos", "Revisión de comprobantes"],
    numbers: ["Números", "Control de números"],
    winners: ["Ganadores", "Sorteo y publicación"],
    reports: ["Reportes", "Estadísticas y exportación"],
    users: ["Usuarios", "Usuarios y permisos"],
    settings: ["Configuración", "Seguridad y auditoría"]
  };

  const roleViews = {
    ADMINISTRADOR: ["dashboard","raffles","participants","payments","numbers","winners","reports","users","settings"],
    OPERADOR: ["dashboard","participants","payments","numbers","settings"],
    FINANZAS: ["dashboard","payments","reports","settings"],
    COMUNICACION: ["dashboard","winners","settings"],
    AUDITOR: ["dashboard","participants","payments","numbers","winners","reports","settings"]
  };

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;").replaceAll("'", "&#039;");
  }

  function formatMoney(value, currency = "Bs") {
    return `${new Intl.NumberFormat("es-BO", {maximumFractionDigits: 2}).format(Number(value || 0))} ${currency}`;
  }

  function downloadText(filename, content, type = "text/plain;charset=utf-8") {
    const blob = new Blob(["\ufeff" + content], {type});
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function api(action, payload = {}) {
    const body = new URLSearchParams();
    body.set("action", action);
    if (state.token) body.set("token", state.token);
    Object.entries(payload).forEach(([key, value]) => {
      body.set(key, typeof value === "object" ? JSON.stringify(value) : String(value ?? ""));
    });

    const response = await fetch(CONFIG.apiUrl, {
      method: "POST",
      headers: {"Content-Type": "application/x-www-form-urlencoded;charset=UTF-8"},
      body: body.toString(),
      redirect: "follow"
    });
    if (!response.ok) throw new Error(`Error ${response.status}`);
    const data = await response.json();
    if (data.authExpired) {
      logout(false);
      throw new Error("La sesión venció. Ingresa nuevamente.");
    }
    return data;
  }

  function showLogin(message = "") {
    qs("#loginScreen").hidden = false;
    qs("#adminShell").hidden = true;
    qs("#loginMessage").textContent = message;
  }

  function showAdmin() {
    qs("#loginScreen").hidden = true;
    qs("#adminShell").hidden = false;
    qs("#sessionName").textContent = state.user.name;
    qs("#sessionRole").textContent = state.user.role;
    applyRoleNavigation();
  }

  function applyRoleNavigation() {
    const allowed = roleViews[state.user.role] || [];
    qsa("#adminNav button").forEach((button) => {
      button.hidden = !allowed.includes(button.dataset.view);
    });
    if (!allowed.includes(state.currentView)) state.currentView = allowed[0] || "dashboard";
  }

  async function login(event) {
    event.preventDefault();
    const button = event.submitter;
    button.disabled = true;
    qs("#loginMessage").textContent = "";
    try {
      const data = await api("adminLogin", {
        username: qs("#loginUser").value.trim(),
        password: qs("#loginPassword").value
      });
      if (!data.ok) throw new Error(data.error || "Usuario o contraseña incorrectos.");
      state.token = data.token;
      state.user = data.user;
      localStorage.setItem("utopiaAdminToken", state.token);
      showAdmin();
      await loadRaffles();
      switchView("dashboard");
    } catch (error) {
      qs("#loginMessage").textContent = error.message;
    } finally {
      button.disabled = false;
    }
  }

  async function restoreSession() {
    if (!state.token) return showLogin();
    try {
      const data = await api("adminSession");
      if (!data.ok) throw new Error("Sesión no válida.");
      state.user = data.user;
      showAdmin();
      await loadRaffles();
      switchView("dashboard");
    } catch {
      logout(false);
    }
  }

  async function logout(callServer = true) {
    if (callServer && state.token) {
      try { await api("adminLogout"); } catch {}
    }
    state.token = "";
    state.user = null;
    localStorage.removeItem("utopiaAdminToken");
    showLogin();
  }

  async function loadRaffles() {
    const data = await api("adminRaffles");
    if (!data.ok) throw new Error(data.error || "No se cargaron los sorteos.");
    state.raffles = data.raffles || [];
    if (!state.raffles.some((raffle) => raffle.id === state.raffleId)) {
      state.raffleId = state.raffles[0]?.id || CONFIG.raffleId;
    }
    const select = qs("#adminRaffleSelect");
    select.innerHTML = state.raffles.map((raffle) =>
      `<option value="${escapeHtml(raffle.id)}">${escapeHtml(raffle.name)} · ${escapeHtml(raffle.status)}</option>`
    ).join("");
    select.value = state.raffleId;
  }

  function switchView(view) {
    state.currentView = view;
    qsa("#adminNav button").forEach((button) => button.classList.toggle("active", button.dataset.view === view));
    qsa(".admin-view").forEach((section) => section.classList.toggle("active", section.id === `view-${view}`));
    const [label, title] = viewTitles[view];
    qs("#currentViewLabel").textContent = label;
    qs("#currentViewTitle").textContent = title;
    refreshView(view);
  }

  async function refreshView(view) {
    try {
      if (view === "dashboard") await loadDashboard();
      if (view === "raffles") await loadRaffleEditor();
      if (view === "participants") await loadParticipants();
      if (view === "payments") await loadPayments();
      if (view === "numbers") await loadAdminBoard();
      if (view === "winners") await loadWinnersAdmin();
      if (view === "reports") await loadReports();
      if (view === "users") await loadUsers();
      if (view === "settings") await loadAudit();
    } catch (error) {
      console.error(error);
      alert(error.message);
    }
  }

  async function loadDashboard() {
    const data = await api("adminDashboard", {raffleId: state.raffleId});
    if (!data.ok) throw new Error(data.error);
    const stats = data.stats;
    qs("#dashRevenue").textContent = formatMoney(stats.revenue, stats.currency);
    qs("#dashSold").textContent = stats.sold;
    qs("#dashAvailable").textContent = stats.available;
    qs("#dashPending").textContent = stats.pendingPayments;
    qs("#dashApproved").textContent = stats.approvedPayments;
    qs("#dashParticipants").textContent = stats.participants;
    qs("#dashProgressText").textContent = `${stats.percent}%`;
    qs("#dashProgressBar").style.width = `${stats.percent}%`;
    qs("#dashStatusList").innerHTML = Object.entries(stats.numberStatuses || {}).map(([label, value]) =>
      `<div><span>${escapeHtml(label)}</span><strong>${value}</strong></div>`
    ).join("");
    renderBarList("#cityStats", data.cities || []);
    renderBarList("#paymentMethodStats", data.methods || []);
    renderAudit("#auditPreview", data.audit || []);
  }

  function renderBarList(selector, items) {
    const max = Math.max(1, ...items.map((item) => item.count));
    qs(selector).innerHTML = items.length ? items.map((item) =>
      `<div><span>${escapeHtml(item.label)}</span><strong>${item.count}</strong></div>`
    ).join("") : "<p>Sin datos todavía.</p>";
  }

  function renderAudit(selector, items) {
    qs(selector).innerHTML = items.length ? items.map((item) =>
      `<article><strong>${escapeHtml(item.action)}</strong>${escapeHtml(item.user)} · ${escapeHtml(item.date)}<br>${escapeHtml(item.detail)}</article>`
    ).join("") : "<p>Sin movimientos.</p>";
  }

  async function loadRaffleEditor() {
    const data = await api("adminGetRaffle", {raffleId: state.raffleId});
    if (!data.ok) throw new Error(data.error);
    const raffle = data.raffle;
    qs("#raffleId").value = raffle.id;
    qs("#raffleName").value = raffle.name;
    qs("#raffleDate").value = raffle.drawDateLocal;
    qs("#rafflePrice").value = raffle.ticketPrice;
    qs("#raffleCurrency").value = raffle.currency;
    qs("#raffleTotal").value = raffle.totalTickets;
    qs("#raffleStatus").value = raffle.status;
    qs("#raffleDescription").value = raffle.description || "";
    qs("#raffleProjectTitle").value = raffle.projectTitle || "";
    qs("#raffleGoal").value = raffle.goalAmount || 0;
    qs("#raffleProjectDescription").value = raffle.projectDescription || "";
    qs("#adminPrizeList").innerHTML = (data.prizes || []).map((prize) => `
      <div class="result-card">
        <small>Premio ${prize.order}</small>
        <h3>${escapeHtml(prize.name)}</h3>
        <p>${escapeHtml(prize.description)}</p>
        <button type="button" data-edit-prize="${escapeHtml(prize.id)}">Editar</button>
      </div>`).join("");
    qsa("[data-edit-prize]").forEach((button) => button.addEventListener("click", () => editPrize(button.dataset.editPrize, data.prizes)));
  }

  async function saveRaffle(event) {
    event.preventDefault();
    const data = await api("adminSaveRaffle", {
      raffle: {
        id: qs("#raffleId").value.trim(),
        name: qs("#raffleName").value.trim(),
        drawDate: qs("#raffleDate").value,
        ticketPrice: Number(qs("#rafflePrice").value),
        currency: qs("#raffleCurrency").value.trim(),
        totalTickets: Number(qs("#raffleTotal").value),
        status: qs("#raffleStatus").value,
        description: qs("#raffleDescription").value.trim(),
        projectTitle: qs("#raffleProjectTitle").value.trim(),
        goalAmount: Number(qs("#raffleGoal").value || 0),
        projectDescription: qs("#raffleProjectDescription").value.trim()
      }
    });
    qs("#raffleMessage").textContent = data.ok ? "Sorteo guardado correctamente." : data.error;
    if (data.ok) {
      state.raffleId = data.raffle.id;
      await loadRaffles();
      await loadRaffleEditor();
    }
  }

  function newRaffle() {
    qs("#raffleForm").reset();
    qs("#raffleId").value = "";
    qs("#raffleCurrency").value = "Bs";
    qs("#raffleStatus").value = "PAUSADO";
    qs("#raffleTotal").value = 1000;
  }

  async function duplicateRaffle() {
    const data = await api("adminDuplicateRaffle", {raffleId: state.raffleId});
    if (!data.ok) return alert(data.error);
    state.raffleId = data.raffleId;
    await loadRaffles();
    await loadRaffleEditor();
  }

  async function editPrize(prizeId, prizes) {
    const prize = prizes.find((item) => item.id === prizeId);
    const name = prompt("Nombre del premio", prize.name);
    if (name === null) return;
    const description = prompt("Descripción", prize.description || "");
    if (description === null) return;
    const imageUrl = prompt("URL pública de la imagen del premio", prize.imageUrl || "");
    if (imageUrl === null) return;
    const data = await api("adminSavePrize", {
      prize: {...prize, name, description, imageUrl}
    });
    if (!data.ok) alert(data.error);
    else loadRaffleEditor();
  }

  async function loadParticipants() {
    const data = await api("adminParticipants", {
      raffleId: state.raffleId,
      search: qs("#participantSearch").value.trim(),
      status: qs("#participantStatusFilter").value
    });
    if (!data.ok) throw new Error(data.error);
    state.participants = data.participants || [];
    qs("#participantsTable").innerHTML = state.participants.length ? state.participants.map((item) => `
      <tr>
        <td><strong>${escapeHtml(item.code)}</strong></td>
        <td>${escapeHtml(item.fullName)}<br><small>${escapeHtml(item.city)}</small></td>
        <td>${item.tickets.map(escapeHtml).join(", ")}</td>
        <td>${escapeHtml(item.phone)}<br>${escapeHtml(item.email)}</td>
        <td><strong>${escapeHtml(item.status)}</strong></td>
        <td>${escapeHtml(item.createdAt)}</td>
        <td><div class="table-actions"><button data-edit-participant="${escapeHtml(item.code)}">Editar</button><button data-open-proof="${escapeHtml(item.proofUrl || "")}">Comprobante</button></div></td>
      </tr>`).join("") : '<tr><td colspan="7">Sin resultados.</td></tr>';
    qsa("[data-edit-participant]").forEach((button) => button.addEventListener("click", () => openParticipantEditor(button.dataset.editParticipant)));
    qsa("[data-open-proof]").forEach((button) => button.addEventListener("click", () => {
      if (button.dataset.openProof) window.open(button.dataset.openProof, "_blank", "noopener");
      else alert("No existe comprobante.");
    }));
  }

  function openParticipantEditor(code) {
    const item = state.participants.find((participant) => participant.code === code);
    qs("#editParticipationCode").value = code;
    qs("#editName").value = item.fullName;
    qs("#editPhone").value = item.phone;
    qs("#editEmail").value = item.email;
    qs("#editCity").value = item.city;
    qs("#editIdentity").value = item.identityNumber;
    qs("#editNotes").value = item.notes || "";
    qs("#participantModal").showModal();
  }

  async function saveParticipant(event) {
    event.preventDefault();
    const data = await api("adminUpdateParticipant", {
      participant: {
        code: qs("#editParticipationCode").value,
        fullName: qs("#editName").value.trim(),
        phone: qs("#editPhone").value.trim(),
        email: qs("#editEmail").value.trim(),
        city: qs("#editCity").value.trim(),
        identityNumber: qs("#editIdentity").value.trim(),
        notes: qs("#editNotes").value.trim()
      }
    });
    if (!data.ok) return alert(data.error);
    qs("#participantModal").close();
    loadParticipants();
  }

  function exportParticipantsCsv() {
    const header = ["Código","Nombre","WhatsApp","Correo","Ciudad","Cédula","Números","Estado","Fecha"];
    const rows = state.participants.map((item) => [
      item.code,item.fullName,item.phone,item.email,item.city,item.identityNumber,
      item.tickets.join(" "),item.status,item.createdAt
    ]);
    const csv = [header, ...rows].map((row) => row.map((cell) => `"${String(cell ?? "").replaceAll('"','""')}"`).join(",")).join("\n");
    downloadText("participantes-sorteo.csv", csv, "text/csv;charset=utf-8");
  }

  async function loadPayments() {
    const data = await api("adminParticipants", {
      raffleId: state.raffleId,
      status: qs("#paymentStatusFilter").value
    });
    if (!data.ok) throw new Error(data.error);
    const items = (data.participants || []).filter((item) =>
      ["COMPROBANTE_RECIBIDO","EN_REVISION","APROBADO","RECHAZADO","VENCIDO"].includes(item.status)
    );
    qs("#paymentCards").innerHTML = items.length ? items.map((item) => `
      <article class="payment-card">
        <header><div><h3>${escapeHtml(item.fullName)}</h3><small>${escapeHtml(item.code)}</small></div><strong>${escapeHtml(item.status)}</strong></header>
        <p>Números: ${item.tickets.map(escapeHtml).join(", ")}<br>Total: ${formatMoney(item.totalAmount, item.currency)}<br>WhatsApp: ${escapeHtml(item.phone)}</p>
        <div class="actions">
          <button class="review" data-payment="EN_REVISION" data-code="${escapeHtml(item.code)}">En revisión</button>
          <button class="approve" data-payment="APROBADO" data-code="${escapeHtml(item.code)}">Aprobar</button>
          <button class="reject" data-payment="RECHAZADO" data-code="${escapeHtml(item.code)}">Rechazar</button>
          <button data-proof="${escapeHtml(item.proofUrl || "")}">Ver comprobante</button>
        </div>
      </article>`).join("") : "<p>No hay pagos para mostrar.</p>";
    qsa("[data-payment]").forEach((button) => button.addEventListener("click", () => decidePayment(button.dataset.code, button.dataset.payment)));
    qsa("[data-proof]").forEach((button) => button.addEventListener("click", () => button.dataset.proof ? window.open(button.dataset.proof, "_blank", "noopener") : alert("Sin comprobante.")));
  }

  async function decidePayment(code, decision) {
    const notes = prompt("Observaciones de la operación", "") ?? "";
    const data = await api("adminPaymentDecision", {
      raffleId: state.raffleId, participationCode: code, decision, notes
    });
    if (!data.ok) alert(data.error);
    else {
      await loadPayments();
      await loadDashboard();
    }
  }

  async function loadAdminBoard() {
    const data = await api("adminBoard", {raffleId: state.raffleId});
    if (!data.ok) throw new Error(data.error);
    state.board = data.tickets || [];
    renderAdminBoard();
  }

  function renderAdminBoard() {
    const grid = qs("#adminNumberGrid");
    const pages = Math.max(1, Math.ceil(state.board.length / PAGE_SIZE));
    state.numberPage = Math.max(0, Math.min(state.numberPage, pages - 1));
    const items = state.board.slice(state.numberPage * PAGE_SIZE, state.numberPage * PAGE_SIZE + PAGE_SIZE);
    grid.innerHTML = items.map((item) =>
      `<button class="${String(item.status).toLowerCase().replace("_","-")} ${statusClass(item.status)}" data-admin-number="${escapeHtml(item.number)}" title="${escapeHtml(item.status)}">${escapeHtml(item.number)}</button>`
    ).join("");
    qs("#adminNumberPageLabel").textContent = `Página ${state.numberPage + 1} de ${pages}`;
    qsa("[data-admin-number]").forEach((button) => button.addEventListener("click", () => openNumberModal(button.dataset.adminNumber)));
  }

  function statusClass(status) {
    return {DISPONIBLE:"available",RESERVADO:"reserved",EN_REVISION:"review",VENDIDO:"sold",BLOQUEADO:"blocked"}[status] || "blocked";
  }

  function openNumberModal(number) {
    state.selectedNumber = number;
    const item = state.board.find((entry) => entry.number === number);
    qs("#numberModalTitle").textContent = `Número ${number}`;
    qs("#numberModalInfo").innerHTML = `<p>Estado: <strong>${escapeHtml(item.status)}</strong></p><p>${escapeHtml(item.owner || "")}</p>`;
    qs("#numberModal").showModal();
  }

  async function numberAction(action) {
    let participant = {};
    if (action === "ASSIGN") {
      participant = {
        fullName: prompt("Nombre completo") || "",
        phone: prompt("WhatsApp") || "",
        email: prompt("Correo") || "",
        city: prompt("Ciudad") || "",
        identityNumber: prompt("Cédula") || ""
      };
      if (!participant.fullName || !participant.phone) return;
    }
    const notes = prompt("Observaciones", "") ?? "";
    const data = await api("adminNumberAction", {
      raffleId: state.raffleId,
      number: state.selectedNumber,
      numberAction: action,
      participant,
      notes
    });
    if (!data.ok) alert(data.error);
    else {
      qs("#numberModal").close();
      loadAdminBoard();
    }
  }

  function searchAdminNumber() {
    const raw = qs("#adminNumberSearch").value.replace(/\D/g, "");
    const item = state.board.find((entry) => Number(entry.number) === Number(raw));
    if (!item) return alert("Número no encontrado.");
    const index = state.board.indexOf(item);
    state.numberPage = Math.floor(index / PAGE_SIZE);
    renderAdminBoard();
  }

  async function loadWinnersAdmin() {
    const [raffleData, resultsData] = await Promise.all([
      api("adminGetRaffle", {raffleId: state.raffleId}),
      api("adminResults", {raffleId: state.raffleId})
    ]);
    if (!raffleData.ok) throw new Error(raffleData.error);
    state.results = resultsData.results || [];
    qs("#drawPrizeSelect").innerHTML = (raffleData.prizes || []).map((prize) =>
      `<option value="${escapeHtml(prize.id)}">${prize.order}. ${escapeHtml(prize.name)}</option>`
    ).join("");
    renderResults();
  }

  async function drawPreview() {
    const data = await api("adminDrawPreview", {
      raffleId: state.raffleId,
      prizeId: qs("#drawPrizeSelect").value
    });
    if (!data.ok) return alert(data.error);
    qs("#drawPreview").innerHTML = `
      <dl>
        <div><dt>Código del sorteo</dt><dd>${escapeHtml(data.raffleCode)}</dd></div>
        <div><dt>Total de participantes</dt><dd>${data.participants}</dd></div>
        <div><dt>Números vendidos</dt><dd>${data.sold}</dd></div>
        <div><dt>Lista final validada</dt><dd>${data.eligible}</dd></div>
        <div><dt>Fecha y hora</dt><dd>${escapeHtml(data.drawDate)}</dd></div>
        <div><dt>Usuario responsable</dt><dd>${escapeHtml(data.responsible)}</dd></div>
      </dl>`;
  }

  async function runDraw() {
    if (!confirm("El resultado quedará bloqueado y no podrá modificarse. ¿Continuar?")) return;
    const button = qs("#runDraw");
    button.disabled = true;
    button.textContent = "Seleccionando...";
    qs("#drawMessage").textContent = "";
    try {
      const data = await api("adminDraw", {
        raffleId: state.raffleId,
        prizeId: qs("#drawPrizeSelect").value
      });
      if (!data.ok) throw new Error(data.error);
      qs("#drawMessage").textContent = `Ganador: ${data.winner.ticket} · ${data.winner.fullName}`;
      await loadWinnersAdmin();
    } catch (error) {
      qs("#drawMessage").textContent = error.message;
    } finally {
      button.disabled = false;
      button.textContent = "Realizar sorteo";
    }
  }

  function renderResults() {
    qs("#resultsList").innerHTML = state.results.length ? state.results.map((result) => `
      <article class="result-card">
        <small>${escapeHtml(prizeLabels(result.order))}</small>
        <h3>${escapeHtml(result.prizeName)}</h3>
        <p>Número ganador: <strong>${escapeHtml(result.ticket)}</strong><br>${escapeHtml(result.fullName)} · ${escapeHtml(result.city)}</p>
        <textarea readonly>${escapeHtml(result.whatsappCopy)}</textarea>
        <div class="actions">
          <button data-copy-result="${escapeHtml(result.id)}">Copiar WhatsApp</button>
          <button data-art-result="${escapeHtml(result.id)}">Descargar arte</button>
          <button data-cert-result="${escapeHtml(result.id)}">Certificado</button>
          <button data-publish-result="${escapeHtml(result.id)}">${result.published ? "Ocultar" : "Publicar"}</button>
        </div>
      </article>`).join("") : "<p>Aún no existen resultados.</p>";
    qsa("[data-copy-result]").forEach((button) => button.addEventListener("click", () => {
      const result = state.results.find((item) => item.id === button.dataset.copyResult);
      navigator.clipboard.writeText(result.whatsappCopy);
      button.textContent = "Copiado";
    }));
    qsa("[data-art-result]").forEach((button) => button.addEventListener("click", () => downloadWinnerArt(button.dataset.artResult)));
    qsa("[data-cert-result]").forEach((button) => button.addEventListener("click", () => printCertificate(button.dataset.certResult)));
    qsa("[data-publish-result]").forEach((button) => button.addEventListener("click", () => togglePublish(button.dataset.publishResult)));
  }

  function prizeLabels(order) {
    return ["Primer premio","Segundo premio","Tercer premio"][Number(order)-1] || "Premio";
  }

  function downloadWinnerArt(resultId) {
    const result = state.results.find((item) => item.id === resultId);
    const canvas = document.createElement("canvas");
    canvas.width = 1080; canvas.height = 1080;
    const ctx = canvas.getContext("2d");
    const gradient = ctx.createLinearGradient(0,0,1080,1080);
    gradient.addColorStop(0,"#031a36"); gradient.addColorStop(1,"#087481");
    ctx.fillStyle = gradient; ctx.fillRect(0,0,1080,1080);
    ctx.fillStyle = "#8ed600"; ctx.font = "900 62px Montserrat"; ctx.textAlign = "center";
    ctx.fillText("¡TENEMOS GANADOR!",540,160);
    ctx.fillStyle = "#ffffff"; ctx.font = "900 190px Montserrat"; ctx.fillText(result.ticket,540,430);
    ctx.font = "800 54px Montserrat"; ctx.fillText(result.fullName,540,560);
    ctx.fillStyle = "#baff72"; ctx.font = "800 42px Montserrat"; ctx.fillText(result.prizeName,540,650);
    ctx.fillStyle = "#ffffff"; ctx.font = "500 31px Montserrat";
    ctx.fillText("Gracias por apoyar los proyectos de Fundación Utopía.",540,820);
    ctx.fillText("Participa, gana y transforma vidas.",540,875);
    const link = document.createElement("a");
    link.download = `ganador-${result.ticket}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
  }

  function printCertificate(resultId) {
    const result = state.results.find((item) => item.id === resultId);
    const win = window.open("", "_blank");
    win.document.write(`<!doctype html><html><head><title>Certificado</title><style>body{font-family:Arial;text-align:center;padding:70px;border:18px solid #0872b9}h1{color:#0872b9;font-size:46px}h2{font-size:40px}.number{font-size:90px;color:#6baa00;font-weight:bold}</style></head><body><h1>CERTIFICADO DE GANADOR</h1><p>Fundación Utopía certifica que</p><h2>${escapeHtml(result.fullName)}</h2><p>es ganador de</p><h2>${escapeHtml(result.prizeName)}</h2><div class="number">${escapeHtml(result.ticket)}</div><p>Código: ${escapeHtml(result.participationCode)}</p><p>${escapeHtml(result.drawDate)}</p></body></html>`);
    win.document.close(); win.print();
  }

  async function togglePublish(resultId) {
    const result = state.results.find((item) => item.id === resultId);
    const data = await api("adminPublishResult", {resultId, published: !result.published});
    if (!data.ok) alert(data.error);
    else loadWinnersAdmin();
  }

  async function loadReports() {
    const data = await api("adminReport", {raffleId: state.raffleId});
    if (!data.ok) throw new Error(data.error);
    state.report = data;
    qs("#reportContent").innerHTML = Object.entries(data.summary).map(([label, value]) =>
      `<article class="report-card"><small>${escapeHtml(label)}</small><strong>${escapeHtml(value)}</strong></article>`
    ).join("");
  }

  function exportReportCsv() {
    const rows = [["Indicador","Valor"], ...Object.entries(state.report?.summary || {})];
    const csv = rows.map((row) => row.map((cell) => `"${String(cell).replaceAll('"','""')}"`).join(",")).join("\n");
    downloadText("reporte-sorteo.csv", csv, "text/csv;charset=utf-8");
  }

  function exportReportExcel() {
    const rows = Object.entries(state.report?.summary || {})
      .map(([label, value]) => `<tr><td>${escapeHtml(label)}</td><td>${escapeHtml(value)}</td></tr>`).join("");
    const html = `<html><head><meta charset="utf-8"></head><body><table border="1"><tr><th>Indicador</th><th>Valor</th></tr>${rows}</table></body></html>`;
    downloadText("reporte-sorteo.xls", html, "application/vnd.ms-excel;charset=utf-8");
  }

  async function loadUsers() {
    const data = await api("adminUsers");
    if (!data.ok) throw new Error(data.error);
    qs("#usersTable").innerHTML = (data.users || []).map((user) => `
      <div class="user-row"><div><strong>${escapeHtml(user.name)}</strong><br><small>${escapeHtml(user.username)} · ${escapeHtml(user.role)} · ${escapeHtml(user.status)}</small></div><button data-reset-user="${escapeHtml(user.username)}">Restablecer clave</button></div>
    `).join("");
    qsa("[data-reset-user]").forEach((button) => button.addEventListener("click", () => resetUserPassword(button.dataset.resetUser)));
  }

  async function createUser(event) {
    event.preventDefault();
    const data = await api("adminCreateUser", {
      user: {
        username: qs("#newUsername").value.trim(),
        name: qs("#newUserName").value.trim(),
        email: qs("#newUserEmail").value.trim(),
        role: qs("#newUserRole").value,
        password: qs("#newUserPassword").value
      }
    });
    qs("#userMessage").textContent = data.ok ? "Usuario creado." : data.error;
    if (data.ok) {
      event.target.reset();
      loadUsers();
    }
  }

  async function resetUserPassword(username) {
    const password = prompt(`Nueva contraseña para ${username}`);
    if (!password) return;
    const data = await api("adminResetPassword", {username, password});
    alert(data.ok ? "Contraseña actualizada." : data.error);
  }

  async function loadAudit() {
    const data = await api("adminAudit");
    if (!data.ok) throw new Error(data.error);
    renderAudit("#auditFull", data.audit || []);
  }

  async function changeOwnPassword() {
    const currentPassword = prompt("Contraseña actual");
    if (!currentPassword) return;
    const newPassword = prompt("Nueva contraseña");
    if (!newPassword) return;
    const data = await api("adminChangePassword", {currentPassword, newPassword});
    alert(data.ok ? "Contraseña actualizada." : data.error);
  }

  function setupEvents() {
    qs("#loginForm").addEventListener("submit", login);
    qs("#logoutButton").addEventListener("click", () => logout());
    qsa("#adminNav button").forEach((button) => button.addEventListener("click", () => switchView(button.dataset.view)));
    qs("#adminRaffleSelect").addEventListener("change", (event) => {
      state.raffleId = event.target.value;
      refreshView(state.currentView);
    });
    qs("#raffleForm").addEventListener("submit", saveRaffle);
    qs("#newRaffleButton").addEventListener("click", newRaffle);
    qs("#duplicateRaffle").addEventListener("click", duplicateRaffle);
    qs("#searchParticipants").addEventListener("click", loadParticipants);
    qs("#exportParticipants").addEventListener("click", exportParticipantsCsv);
    qs("#participantEditForm").addEventListener("submit", saveParticipant);
    qs("#refreshPayments").addEventListener("click", loadPayments);
    qs("#adminRefreshNumbers").addEventListener("click", loadAdminBoard);
    qs("#adminSearchNumber").addEventListener("click", searchAdminNumber);
    qs("#adminNumberPrev").addEventListener("click", () => {state.numberPage -= 1; renderAdminBoard();});
    qs("#adminNumberNext").addEventListener("click", () => {state.numberPage += 1; renderAdminBoard();});
    qs("#blockNumber").addEventListener("click", () => numberAction("BLOCK"));
    qs("#releaseNumber").addEventListener("click", () => numberAction("RELEASE"));
    qs("#assignNumber").addEventListener("click", () => numberAction("ASSIGN"));
    qs("#loadDrawPreview").addEventListener("click", drawPreview);
    qs("#runDraw").addEventListener("click", runDraw);
    qs("#reportCsv").addEventListener("click", exportReportCsv);
    qs("#reportExcel").addEventListener("click", exportReportExcel);
    qs("#reportPrint").addEventListener("click", () => window.print());
    qs("#userForm").addEventListener("submit", createUser);
    qs("#changeOwnPassword").addEventListener("click", changeOwnPassword);
    qsa("[data-close-modal]").forEach((button) => button.addEventListener("click", () => button.closest("dialog").close()));
  }

  setupEvents();
  restoreSession();
})();
