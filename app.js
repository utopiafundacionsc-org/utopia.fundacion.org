(() => {
  "use strict";

  const CONFIG = window.UTOPIA_CONFIG || {};
  const MAX_PROOF_BYTES = 5 * 1024 * 1024;
  const PAGE_SIZE = 100;
  const qs = (selector) => document.querySelector(selector);
  const qsa = (selector) => [...document.querySelectorAll(selector)];

  const state = {
    raffle: null,
    board: [],
    stats: {},
    page: 0,
    selected: new Set(),
    reservation: null,
    reservationTimer: null,
    proofFile: null,
    confirmation: null
  };

  const prizeLabels = {
    "PREMIO-001": "Primer premio",
    "PREMIO-002": "Segundo premio",
    "PREMIO-003": "Tercer premio"
  };

  const statusClasses = {
    DISPONIBLE: "available",
    RESERVADO: "reserved",
    EN_REVISION: "review",
    VENDIDO: "sold",
    BLOQUEADO: "blocked"
  };

  function buildUrl(action, params = {}) {
    const url = new URL(CONFIG.apiUrl);
    url.searchParams.set("action", action);
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== "") {
        url.searchParams.set(key, value);
      }
    });
    return url.toString();
  }

  async function getJson(action, params = {}) {
    const response = await fetch(buildUrl(action, params), {
      method: "GET",
      cache: "no-store",
      redirect: "follow"
    });
    if (!response.ok) throw new Error(`Error ${response.status}`);
    return response.json();
  }

  async function postForm(payload) {
    const body = new URLSearchParams();
    Object.entries(payload).forEach(([key, value]) => {
      body.set(key, Array.isArray(value) ? JSON.stringify(value) : String(value ?? ""));
    });
    const response = await fetch(CONFIG.apiUrl, {
      method: "POST",
      headers: {"Content-Type": "application/x-www-form-urlencoded;charset=UTF-8"},
      body: body.toString(),
      redirect: "follow"
    });
    if (!response.ok) throw new Error(`Error ${response.status}`);
    return response.json();
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function formatMoney(value, currency = "Bs") {
    return `${new Intl.NumberFormat("es-BO", {maximumFractionDigits: 2}).format(Number(value || 0))} ${currency}`;
  }

  function formatTicket(number) {
    const total = Number(state.raffle?.totalTickets || 1000);
    const digits = Math.max(3, String(Math.max(0, total - 1)).length);
    return String(number).padStart(digits, "0");
  }

  function createRollingNumbers() {
    const track = qs("#rollingTrack");
    if (!track) return;
    track.innerHTML = "";
    for (let index = 0; index < 50; index += 1) {
      const digit = document.createElement("span");
      digit.className = "rolling-digit";
      digit.textContent = Math.floor(Math.random() * 10);
      track.appendChild(digit);
      const speed = 150 + Math.floor(Math.random() * 360);
      window.setInterval(() => {
        digit.classList.remove("flip");
        void digit.offsetWidth;
        digit.classList.add("flip");
        window.setTimeout(() => {
          digit.textContent = Math.floor(Math.random() * 10);
        }, 80);
      }, speed);
    }
  }

  function setupMenu() {
    const button = qs("#menuButton");
    const nav = qs("#nav");
    if (!button || !nav) return;
    button.addEventListener("click", () => {
      const open = nav.classList.toggle("open");
      button.setAttribute("aria-expanded", String(open));
    });
    qsa("#nav a").forEach((link) => link.addEventListener("click", () => {
      nav.classList.remove("open");
      button.setAttribute("aria-expanded", "false");
    }));
  }

  function startCountdown(dateInput) {
    const target = new Date(dateInput).getTime();
    const update = () => {
      const diff = Math.max(0, target - Date.now());
      const values = {
        days: Math.floor(diff / 86400000),
        hours: Math.floor((diff % 86400000) / 3600000),
        minutes: Math.floor((diff % 3600000) / 60000),
        seconds: Math.floor((diff % 60000) / 1000)
      };
      Object.entries(values).forEach(([id, value]) => {
        const element = qs(`#${id}`);
        if (element) element.textContent = String(value).padStart(2, "0");
      });
    };
    update();
    window.setInterval(update, 1000);
  }

  function applyRaffle(raffle) {
    state.raffle = raffle;
    const date = new Date(raffle.drawDate);
    const formattedDate = new Intl.DateTimeFormat("es-BO", {
      day: "2-digit", month: "2-digit", year: "numeric"
    }).format(date);
    const formattedTime = new Intl.DateTimeFormat("es-BO", {
      hour: "2-digit", minute: "2-digit", hour12: false
    }).format(date);

    qs("#countdownDateTime").textContent = `${formattedDate} a las ${formattedTime}`;
    qs("#heroPrice").textContent = formatMoney(raffle.ticketPrice, raffle.currency);
    qs("#footerPrice").textContent = `Ticket: ${formatMoney(raffle.ticketPrice, raffle.currency)}`;
    qs("#footerDate").textContent = `Fecha: ${formattedDate}`;
    qs("#summaryUnit").textContent = formatMoney(raffle.ticketPrice, raffle.currency);
    qs("#projectTitle").textContent = raffle.projectTitle || "Proyectos que transforman vidas";
    qs("#projectDescription").textContent = raffle.projectDescription || "Lo recaudado apoya programas educativos, sociales y comunitarios.";
    qs("#projectGoal").textContent = raffle.goalAmount ? formatMoney(raffle.goalAmount, raffle.currency) : "—";
    startCountdown(raffle.drawDate);
    applyPrizeStatuses(raffle.prizes || []);
  }

  function applyPrizeStatuses(prizes) {
    prizes.forEach((prize) => {
      const element = qs(`#status-${prize.id}`);
      if (!element) return;
      const image = qs(`#image-${prize.id}`);
      if (image && prize.imageUrl) image.src = prize.imageUrl;
      if (prize.winner) {
        element.textContent = `Ganador: ${prize.winner.ticket}`;
        element.classList.add("has-winner");
      } else {
        element.textContent = "Consultar ganador →";
        element.classList.remove("has-winner");
      }
    });
  }

  async function loadRaffle() {
    const data = await getJson("raffle", {raffleId: CONFIG.raffleId});
    if (!data.ok) throw new Error(data.error || "No se pudo cargar el sorteo.");
    applyRaffle(data.raffle);
  }

  async function loadBoard({preservePage = true} = {}) {
    const data = await getJson("board", {raffleId: CONFIG.raffleId});
    if (!data.ok) throw new Error(data.error || "No se pudo cargar el tablero.");
    state.board = data.tickets || [];
    state.stats = data.stats || {};
    if (!preservePage) state.page = 0;
    qs("#reservationMinutesText").textContent = `${data.reservationMinutes || 15} minutos`;
    updateStats();
    renderBoard();
    removeUnavailableSelections();
  }

  function updateStats() {
    const stats = state.stats;
    const soldPercent = stats.total ? Math.round((stats.sold / stats.total) * 100) : 0;
    qs("#heroSold").textContent = stats.sold ?? 0;
    qs("#heroAvailable").textContent = stats.available ?? 0;
    qs("#statTotal").textContent = stats.total ?? 0;
    qs("#statSold").textContent = stats.sold ?? 0;
    qs("#statReserved").textContent = stats.reserved ?? 0;
    qs("#statReview").textContent = stats.review ?? 0;
    qs("#statAvailable").textContent = stats.available ?? 0;
    qs("#statPercent").textContent = `${soldPercent}%`;
    qs("#progressBar").style.width = `${soldPercent}%`;

    const raised = Number(stats.sold || 0) * Number(state.raffle?.ticketPrice || 0);
    qs("#projectRaised").textContent = formatMoney(raised, state.raffle?.currency || "Bs");
    const goal = Number(state.raffle?.goalAmount || 0);
    const projectPercent = goal ? Math.min(100, Math.round((raised / goal) * 100)) : soldPercent;
    qs("#projectPercent").textContent = `${projectPercent}%`;
  }

  function removeUnavailableSelections() {
    if (state.reservation) return;
    const available = new Set(
      state.board.filter((item) => item.status === "DISPONIBLE").map((item) => item.number)
    );
    [...state.selected].forEach((number) => {
      if (!available.has(number)) state.selected.delete(number);
    });
    updateSelection();
  }

  function renderBoard() {
    const grid = qs("#ticketGrid");
    const totalPages = Math.max(1, Math.ceil(state.board.length / PAGE_SIZE));
    state.page = Math.min(Math.max(0, state.page), totalPages - 1);
    const start = state.page * PAGE_SIZE;
    const items = state.board.slice(start, start + PAGE_SIZE);
    grid.innerHTML = "";

    items.forEach((item) => {
      const button = document.createElement("button");
      const statusClass = statusClasses[item.status] || "blocked";
      button.type = "button";
      button.className = `ticket-button ${statusClass}`;
      button.textContent = item.number;
      button.title = item.label || item.status;
      if (state.selected.has(item.number)) button.classList.add("selected");
      const selectable = item.status === "DISPONIBLE" && !state.reservation;
      button.disabled = !selectable && !state.selected.has(item.number);
      button.addEventListener("click", () => toggleTicket(item.number));
      grid.appendChild(button);
    });

    qs("#ticketPageLabel").textContent = `Página ${state.page + 1} de ${totalPages}`;
    qs("#ticketPrevPage").disabled = state.page <= 0;
    qs("#ticketNextPage").disabled = state.page >= totalPages - 1;
  }

  function toggleTicket(number) {
    if (state.reservation) return;
    if (state.selected.has(number)) state.selected.delete(number);
    else state.selected.add(number);
    updateSelection();
    renderBoard();
  }

  function updateSelection() {
    const numbers = [...state.selected].sort((a, b) => Number(a) - Number(b));
    qs("#tickets").value = numbers.join(", ");
    qs("#selectedTicketCount").textContent = numbers.length;
    qs("#summaryCount").textContent = numbers.length;
    const total = numbers.length * Number(state.raffle?.ticketPrice || 0);
    qs("#selectedTotal").textContent = formatMoney(total, state.raffle?.currency || "Bs");
    qs("#summaryTotal").textContent = formatMoney(total, state.raffle?.currency || "Bs");

    const chips = qs("#selectedTicketChips");
    chips.innerHTML = "";
    if (!numbers.length) {
      chips.innerHTML = "<span>Ninguno</span>";
    } else {
      numbers.forEach((number) => {
        const chip = document.createElement("span");
        chip.innerHTML = `${escapeHtml(number)}${state.reservation ? "" : ` <button type="button" aria-label="Quitar ${escapeHtml(number)}">×</button>`}`;
        chip.querySelector("button")?.addEventListener("click", () => toggleTicket(number));
        chips.appendChild(chip);
      });
    }
    updatePaymentVisibility();
  }

  function updatePaymentVisibility() {
    const qrSelected = qs("#paymentMethod").value === "QR";
    const hasTickets = state.selected.size > 0;
    qs("#paymentSummary").hidden = !(qrSelected && hasTickets);
    qs("#reserveActions").hidden = !(qrSelected && hasTickets);
  }

  function searchTicket() {
    const raw = qs("#boardSearch").value.replace(/\D/g, "");
    if (raw === "") return;
    const number = formatTicket(Number(raw));
    const index = state.board.findIndex((item) => item.number === number);
    if (index < 0) {
      alert("Ese número no existe en este sorteo.");
      return;
    }
    state.page = Math.floor(index / PAGE_SIZE);
    renderBoard();
    window.setTimeout(() => {
      const visible = [...qs("#ticketGrid").children].find((button) => button.textContent === number);
      visible?.scrollIntoView({behavior: "smooth", block: "center"});
      visible?.focus();
    }, 50);
  }

  function chooseRandomTickets() {
    if (state.reservation) return;
    const quantity = Math.min(20, Math.max(1, Number(qs("#randomQuantity").value || 1)));
    const available = state.board
      .filter((item) => item.status === "DISPONIBLE" && !state.selected.has(item.number))
      .map((item) => item.number);
    for (let index = available.length - 1; index > 0; index -= 1) {
      const random = Math.floor(Math.random() * (index + 1));
      [available[index], available[random]] = [available[random], available[index]];
    }
    available.slice(0, quantity).forEach((number) => state.selected.add(number));
    updateSelection();
    renderBoard();
  }

  function validateParticipantFields() {
    const values = {
      fullName: qs("#fullName").value.trim(),
      phone: qs("#phone").value.trim(),
      email: qs("#email").value.trim(),
      city: qs("#city").value.trim(),
      identityNumber: qs("#identityNumber").value.trim()
    };
    if (!state.selected.size) throw new Error("Selecciona al menos un número.");
    if (!values.fullName || !values.phone || !values.email || !values.city || !values.identityNumber) {
      throw new Error("Completa todos los datos del participante.");
    }
    if (qs("#paymentMethod").value !== "QR") throw new Error("Selecciona el método de pago QR.");
    return values;
  }

  async function reserveTickets() {
    if (state.reservation) return state.reservation;
    const person = validateParticipantFields();
    const button = qs("#reserveButton");
    button.disabled = true;
    button.textContent = "Reservando...";
    try {
      const data = await postForm({
        action: "reserve",
        raffleId: CONFIG.raffleId,
        tickets: [...state.selected],
        ...person,
        paymentMethod: "QR"
      });
      if (!data.ok) {
        if (data.unavailableTickets?.length) {
          throw new Error(`Ya no están disponibles: ${data.unavailableTickets.join(", ")}.`);
        }
        throw new Error(data.error || "No se pudo crear la reserva.");
      }
      state.reservation = {
        code: data.participationCode,
        expiresAt: data.expiresAt
      };
      qs("#reservationMessage").textContent = `Reserva creada. Código: ${data.participationCode}`;
      qs("#qrPaymentPanel").hidden = false;
      qs("#cancelReservation").hidden = false;
      button.hidden = true;
      startReservationCountdown();
      await loadBoard();
      renderBoard();
      return state.reservation;
    } finally {
      button.disabled = false;
      button.textContent = "Reservar números y mostrar QR";
    }
  }

  function startReservationCountdown() {
    if (state.reservationTimer) window.clearInterval(state.reservationTimer);
    const update = () => {
      if (!state.reservation) return;
      const diff = new Date(state.reservation.expiresAt).getTime() - Date.now();
      if (diff <= 0) {
        window.clearInterval(state.reservationTimer);
        state.reservation = null;
        qs("#reservationCountdown").textContent = "00:00";
        qs("#reservationMessage").textContent = "La reserva venció. Selecciona nuevamente tus números.";
        qs("#qrPaymentPanel").hidden = true;
        qs("#cancelReservation").hidden = true;
        qs("#reserveButton").hidden = false;
        loadBoard();
        return;
      }
      const minutes = Math.floor(diff / 60000);
      const seconds = Math.floor((diff % 60000) / 1000);
      qs("#reservationCountdown").textContent = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
    };
    update();
    state.reservationTimer = window.setInterval(update, 1000);
  }

  async function cancelReservation() {
    if (!state.reservation) return;
    const button = qs("#cancelReservation");
    button.disabled = true;
    try {
      await postForm({
        action: "cancelReservation",
        raffleId: CONFIG.raffleId,
        participationCode: state.reservation.code
      });
      state.reservation = null;
      if (state.reservationTimer) window.clearInterval(state.reservationTimer);
      qs("#qrPaymentPanel").hidden = true;
      qs("#cancelReservation").hidden = true;
      qs("#reserveButton").hidden = false;
      qs("#reservationMessage").textContent = "Reserva cancelada.";
      await loadBoard();
    } finally {
      button.disabled = false;
    }
  }

  function readProof(file) {
    return new Promise((resolve, reject) => {
      if (!file) return reject(new Error("Adjunta el comprobante de pago."));
      if (file.size > MAX_PROOF_BYTES) return reject(new Error("El comprobante supera 5 MB."));
      const allowed = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
      if (!allowed.includes(file.type)) return reject(new Error("El comprobante debe ser JPG, PNG, WEBP o PDF."));
      const reader = new FileReader();
      reader.onerror = () => reject(new Error("No se pudo leer el comprobante."));
      reader.onload = () => {
        const dataUrl = String(reader.result || "");
        resolve({
          proofName: file.name,
          proofMime: file.type,
          proofBase64: dataUrl.includes(",") ? dataUrl.split(",")[1] : dataUrl
        });
      };
      reader.readAsDataURL(file);
    });
  }

  async function submitParticipation(event) {
    event.preventDefault();
    const result = qs("#formResult");
    const button = qs("#submitButton");
    result.textContent = "";
    button.disabled = true;
    button.textContent = "Enviando...";
    try {
      if (!qs("#terms").checked) throw new Error("Debes aceptar los términos y condiciones.");
      const proofFile = qs("#paymentProof").files?.[0];
      const proofData = await readProof(proofFile);
      state.proofFile = proofFile;
      if (!state.reservation) await reserveTickets();

      const data = await postForm({
        action: "confirmRegistration",
        raffleId: CONFIG.raffleId,
        participationCode: state.reservation.code,
        ...proofData
      });
      if (!data.ok) throw new Error(data.error || "No se pudo confirmar la participación.");

      state.confirmation = data;
      result.style.color = "#15834b";
      result.innerHTML = `Participación registrada. Código: <strong>${escapeHtml(data.participationCode)}</strong>. Estado: <strong>${escapeHtml(data.status)}</strong>.`;
      fillReceipt(data);
      qs("#confirmationActions").hidden = false;
      qs("#qrPaymentPanel").hidden = true;
      qs("#reserveActions").hidden = true;
      state.reservation = null;
      if (state.reservationTimer) window.clearInterval(state.reservationTimer);
      state.selected.clear();
      updateSelection();
      await loadBoard();
    } catch (error) {
      result.style.color = "#b42318";
      result.textContent = error.message || "No se pudo registrar la participación.";
    } finally {
      button.disabled = false;
      button.textContent = "Registrar participación y enviar comprobante";
    }
  }

  function fillReceipt(data) {
    const name = qs("#fullName").value.trim();
    qs("#receiptGreeting").textContent = `Hola, ${name}. Tu participación fue registrada correctamente.`;
    qs("#receiptCode").textContent = data.participationCode;
    qs("#receiptTickets").textContent = (data.tickets || []).join(", ");
    qs("#receiptAmount").textContent = formatMoney(data.totalAmount, data.currency);
    qs("#receiptDate").textContent = qs("#countdownDateTime").textContent;
  }

  function buildConfirmationMessage() {
    const data = state.confirmation;
    if (!data) return "";
    const name = data.fullName || qs("#fullName").value.trim();
    return [
      "🎉 *PARTICIPACIÓN REGISTRADA – SORTEOS UTOPÍA*",
      "",
      `Hola, ${name}. Tu participación fue registrada correctamente.`,
      "",
      `*Código:* ${data.participationCode}`,
      `*Números:* ${(data.tickets || []).join(", ")}`,
      `*Total:* ${formatMoney(data.totalAmount, data.currency)}`,
      `*Fecha del sorteo:* ${qs("#countdownDateTime").textContent}`,
      `*Estado:* ${data.status}`,
      "",
      "Gracias por apoyar los proyectos de Fundación Utopía.",
      "",
      "*Participa, gana y ayuda a transformar vidas.*"
    ].join("\n");
  }

  async function shareWhatsapp() {
    const message = buildConfirmationMessage();
    if (!message) return;
    if (navigator.share && state.proofFile) {
      const files = [state.proofFile];
      try {
        if (!navigator.canShare || navigator.canShare({files})) {
          await navigator.share({text: message, files});
          return;
        }
      } catch (error) {
        if (error.name === "AbortError") return;
      }
    }
    const number = String(CONFIG.whatsappBusiness || "").replace(/\D/g, "");
    const base = number ? `https://wa.me/${number}` : "https://wa.me/";
    window.open(`${base}?text=${encodeURIComponent(message)}`, "_blank", "noopener");
  }

  async function loadWinners() {
    const data = await getJson("winners", {raffleId: CONFIG.raffleId});
    if (!data.ok) return;
    const container = qs("#winnersGrid");
    container.innerHTML = "";
    const winners = data.winners || [];
    if (!winners.length) {
      container.innerHTML = '<article class="empty-card"><span>🏆</span><h3>¡El próximo ganador puedes ser tú!</h3><p>Participa y mantente atento a los resultados.</p></article>';
      return;
    }
    winners.sort((a, b) => Number(a.order) - Number(b.order)).forEach((winner) => {
      const article = document.createElement("article");
      article.className = "winner-card";
      article.innerHTML = `
        <div class="winner-number">${escapeHtml(winner.ticket)}</div>
        <small>${escapeHtml(prizeLabels[winner.prizeId] || "Premio")}</small>
        <h3>${escapeHtml(winner.prizeName)}</h3>
        <dl>
          <div><dt>Ganador</dt><dd>${escapeHtml(winner.fullName)}</dd></div>
          <div><dt>Ciudad</dt><dd>${escapeHtml(winner.city || "—")}</dd></div>
          <div><dt>Código</dt><dd>${escapeHtml(winner.participationCode)}</dd></div>
        </dl>`;
      container.appendChild(article);
      const status = qs(`#status-${winner.prizeId}`);
      if (status) {
        status.textContent = `Ganador: ${winner.ticket}`;
        status.classList.add("has-winner");
      }
    });
  }

  async function openWinner(prizeId) {
    const modal = qs("#winnerModal");
    qs("#modalPrizeOrder").textContent = prizeLabels[prizeId] || "Resultado";
    qs("#modalPrizeName").textContent = qs(`[data-prize-id="${prizeId}"] h3`)?.textContent || "Premio";
    qs("#winnerLoading").hidden = false;
    qs("#winnerData").hidden = true;
    qs("#noWinner").hidden = true;
    modal.showModal();
    try {
      const data = await getJson("winner", {prizeId});
      qs("#winnerLoading").hidden = true;
      if (!data.ok || !data.winner) {
        qs("#noWinner").hidden = false;
        return;
      }
      const winner = data.winner;
      qs("#modalTicket").textContent = winner.ticket;
      qs("#modalWinnerName").textContent = winner.fullName;
      qs("#modalCity").textContent = winner.city || "—";
      qs("#modalCode").textContent = winner.participationCode;
      qs("#modalDate").textContent = new Intl.DateTimeFormat("es-BO", {
        dateStyle: "long", timeStyle: "short"
      }).format(new Date(winner.drawDate));
      qs("#winnerData").hidden = false;
    } catch {
      qs("#winnerLoading").hidden = true;
      qs("#noWinner").hidden = false;
    }
  }

  async function lookupByPhone(event) {
    event.preventDefault();
    const output = qs("#phoneLookupResult");
    output.hidden = false;
    output.textContent = "Consultando...";
    try {
      const data = await getJson("ticketsByPhone", {
        raffleId: CONFIG.raffleId,
        phone: qs("#lookupPhone").value.trim()
      });
      if (!data.ok) {
        output.textContent = data.error || "No se encontraron registros.";
        return;
      }
      output.innerHTML = `
        <h3>${escapeHtml(data.fullName)}</h3>
        <p>Estado y números registrados:</p>
        <div class="lookup-ticket-list">
          ${(data.tickets || []).map((item) => `<span>${escapeHtml(item.number)} · ${escapeHtml(item.status)}</span>`).join("")}
        </div>`;
    } catch {
      output.textContent = "No fue posible realizar la consulta.";
    }
  }

  function setupEvents() {
    qs("#ticketPrevPage").addEventListener("click", () => {state.page -= 1; renderBoard();});
    qs("#ticketNextPage").addEventListener("click", () => {state.page += 1; renderBoard();});
    qs("#searchBoardTicket").addEventListener("click", searchTicket);
    qs("#randomTickets").addEventListener("click", chooseRandomTickets);
    qs("#refreshBoard").addEventListener("click", () => loadBoard());
    qs("#paymentMethod").addEventListener("change", updatePaymentVisibility);
    qs("#reserveButton").addEventListener("click", async () => {
      try { await reserveTickets(); }
      catch (error) { qs("#reservationMessage").textContent = error.message; }
    });
    qs("#cancelReservation").addEventListener("click", cancelReservation);
    qs("#paymentProof").addEventListener("change", () => {
      const file = qs("#paymentProof").files?.[0];
      qs("#proofFileName").textContent = file ? `${file.name} · ${(file.size / 1024 / 1024).toFixed(2)} MB` : "JPG, PNG, WEBP o PDF. Máximo 5 MB.";
    });
    qs("#participationForm").addEventListener("submit", submitParticipation);
    qs("#shareWhatsapp").addEventListener("click", shareWhatsapp);
    qs("#printReceipt").addEventListener("click", () => {
      qs("#digitalReceipt").hidden = false;
      window.print();
      qs("#digitalReceipt").hidden = true;
    });
    qs("#phoneLookupForm").addEventListener("submit", lookupByPhone);
    qsa(".prize-card").forEach((card) => card.addEventListener("click", () => openWinner(card.dataset.prizeId)));
    qs("#closeWinnerModal").addEventListener("click", () => qs("#winnerModal").close());
    qs("#winnerModal").addEventListener("click", (event) => {
      if (event.target === qs("#winnerModal")) qs("#winnerModal").close();
    });
  }

  async function initialize() {
    createRollingNumbers();
    setupMenu();
    setupEvents();
    try {
      await loadRaffle();
      await loadBoard({preservePage: false});
      await loadWinners();
    } catch (error) {
      console.error(error);
      qs("#formResult").textContent = "No se pudo cargar la información del sorteo.";
    }
    window.setInterval(async () => {
      if (!state.reservation) {
        try {
          await loadBoard();
          await loadWinners();
        } catch {}
      }
    }, Math.max(10, Number(CONFIG.refreshSeconds || 15)) * 1000);
  }

  initialize();
})();
