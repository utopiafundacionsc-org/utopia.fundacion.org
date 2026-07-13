(() => {
  "use strict";

  const CONFIG = window.UTOPIA_CONFIG;
  const qs = (selector) => document.querySelector(selector);
  const qsa = (selector) => [...document.querySelectorAll(selector)];

  const state = {
    raffle: null,
    prizes: [],
    winners: []
  };

  const prizeLabels = {
    "PREMIO-001": "Primer premio",
    "PREMIO-002": "Segundo premio",
    "PREMIO-003": "Tercer premio"
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

    if (!response.ok) {
      throw new Error(`Error de conexión: ${response.status}`);
    }

    return response.json();
  }

  async function postForm(payload) {
    const form = new URLSearchParams();
    Object.entries(payload).forEach(([key, value]) => {
      form.set(key, Array.isArray(value) ? JSON.stringify(value) : String(value ?? ""));
    });

    const response = await fetch(CONFIG.apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8"
      },
      body: form.toString(),
      redirect: "follow"
    });

    if (!response.ok) {
      throw new Error(`Error de conexión: ${response.status}`);
    }

    return response.json();
  }

  function setConnection(mode, text) {
    const status = qs("#connectionStatus");
    status.className = `connection ${mode}`;
    status.innerHTML = `<i></i> ${text}`;
  }

  function createRollingNumbers() {
    const track = qs("#rollingTrack");
    for (let i = 0; i < 48; i += 1) {
      const digit = document.createElement("span");
      digit.className = "rolling-digit";
      digit.textContent = Math.floor(Math.random() * 10);
      track.appendChild(digit);

      const speed = 130 + Math.floor(Math.random() * 390);
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

    button.addEventListener("click", () => {
      const open = nav.classList.toggle("open");
      button.setAttribute("aria-expanded", String(open));
    });

    qsa("#nav a").forEach((link) => {
      link.addEventListener("click", () => {
        nav.classList.remove("open");
        button.setAttribute("aria-expanded", "false");
      });
    });
  }

  function startCountdown(dateInput) {
    const target = new Date(dateInput).getTime();

    function update() {
      const diff = Math.max(0, target - Date.now());
      const days = Math.floor(diff / 86400000);
      const hours = Math.floor((diff % 86400000) / 3600000);
      const minutes = Math.floor((diff % 3600000) / 60000);
      const seconds = Math.floor((diff % 60000) / 1000);

      qs("#days").textContent = String(days).padStart(2, "0");
      qs("#hours").textContent = String(hours).padStart(2, "0");
      qs("#minutes").textContent = String(minutes).padStart(2, "0");
      qs("#seconds").textContent = String(seconds).padStart(2, "0");
    }

    update();
    window.setInterval(update, 1000);
  }

  function applyRaffle(raffle) {
    state.raffle = raffle;
    qs("#ticketPrice").textContent =
      `${new Intl.NumberFormat("es-BO").format(raffle.ticketPrice)} ${raffle.currency}`;

    const date = new Date(raffle.drawDate);
    qs("#drawDate").textContent = new Intl.DateTimeFormat("es-BO", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric"
    }).format(date);

    startCountdown(raffle.drawDate);
  }

  function applyPrizeStatuses(prizes) {
    state.prizes = prizes;

    prizes.forEach((prize) => {
      const status = qs(`#status-${prize.id}`);
      if (!status) return;

      if (prize.winner) {
        status.textContent = `Ganador: ticket ${prize.winner.ticket}`;
        status.classList.add("has-winner");
      } else {
        status.textContent = "Consultar ganador →";
        status.classList.remove("has-winner");
      }
    });
  }

  async function loadRaffle() {
    try {
      const data = await getJson("raffle", { raffleId: CONFIG.raffleId });
      if (!data.ok) throw new Error(data.error || "No se pudo cargar la rifa.");

      applyRaffle(data.raffle);
      applyPrizeStatuses(data.raffle.prizes || []);
      setConnection("online", "Google conectado");
    } catch (error) {
      console.error(error);
      setConnection("error", "Sin conexión");
      // Keep the visible fallback date and price from the design.
      startCountdown("2026-07-17T20:00:00-04:00");
    }
  }

  function formatWinnerDate(value) {
    if (!value) return "—";
    return new Intl.DateTimeFormat("es-BO", {
      dateStyle: "long",
      timeStyle: "short"
    }).format(new Date(value));
  }

  async function openWinner(prizeId) {
    const modal = qs("#winnerModal");
    const prize = state.prizes.find((item) => item.id === prizeId);
    const fallbackCard = qs(`[data-prize-id="${prizeId}"] h3`);

    qs("#modalPrizeOrder").textContent = prizeLabels[prizeId] || "Resultado del premio";
    qs("#modalPrizeName").textContent =
      prize?.name || fallbackCard?.textContent || "Premio";

    qs("#winnerLoading").hidden = false;
    qs("#winnerData").hidden = true;
    qs("#noWinner").hidden = true;

    if (typeof modal.showModal === "function") modal.showModal();
    else modal.setAttribute("open", "");

    try {
      const data = await getJson("winner", { prizeId });

      qs("#winnerLoading").hidden = true;

      if (!data.ok || !data.winner) {
        qs("#noWinner").hidden = false;
        return;
      }

      const winner = data.winner;
      qs("#modalTicket").textContent = winner.ticket;
      qs("#modalWinnerName").textContent = winner.fullName;
      qs("#modalIdentity").textContent = winner.identityNumber;
      qs("#modalPhone").textContent = winner.phone;
      qs("#modalCode").textContent = winner.participationCode;
      qs("#modalDate").textContent = formatWinnerDate(winner.drawDate);
      qs("#winnerData").hidden = false;
    } catch (error) {
      console.error(error);
      qs("#winnerLoading").hidden = true;
      qs("#noWinner").hidden = false;
      qs("#noWinner strong").textContent = "No fue posible consultar Google Sheets.";
      qs("#noWinner p").textContent = "Revisa la conexión y vuelve a intentarlo.";
    }
  }

  function setupPrizeCards() {
    qsa(".prize-card").forEach((card) => {
      card.addEventListener("click", () => openWinner(card.dataset.prizeId));
    });

    qs("#closeWinnerModal").addEventListener("click", () => {
      qs("#winnerModal").close();
    });

    qs("#winnerModal").addEventListener("click", (event) => {
      if (event.target === qs("#winnerModal")) qs("#winnerModal").close();
    });
  }

  async function loadWinners() {
    const container = qs("#winnersGrid");

    try {
      const data = await getJson("winners", { raffleId: CONFIG.raffleId });
      if (!data.ok) throw new Error(data.error || "No se pudieron cargar los ganadores.");

      state.winners = data.winners || [];
      container.innerHTML = "";

      if (!state.winners.length) {
        container.innerHTML = `
          <article class="empty-winner">
            <span>🏆</span>
            <h3>Aún no se publicaron ganadores</h3>
            <p>Los resultados aparecerán aquí cuando se realice el sorteo.</p>
          </article>
        `;
        return;
      }

      state.winners
        .sort((a, b) => Number(a.order || 0) - Number(b.order || 0))
        .forEach((winner) => {
          const card = document.createElement("article");
          card.className = "winner-card";
          card.innerHTML = `
            <div class="winner-number">${escapeHtml(winner.ticket)}</div>
            <small>${escapeHtml(prizeLabels[winner.prizeId] || "Premio")}</small>
            <h3>${escapeHtml(winner.prizeName)}</h3>
            <dl>
              <div><dt>Ganador</dt><dd>${escapeHtml(winner.fullName)}</dd></div>
              <div><dt>Cédula</dt><dd>${escapeHtml(winner.identityNumber)}</dd></div>
              <div><dt>Celular</dt><dd>${escapeHtml(winner.phone)}</dd></div>
              <div><dt>Código</dt><dd>${escapeHtml(winner.participationCode)}</dd></div>
            </dl>
          `;
          container.appendChild(card);
        });

      applyPrizeStatuses(
        state.prizes.map((prize) => ({
          ...prize,
          winner: state.winners.find((winner) => winner.prizeId === prize.id) || prize.winner
        }))
      );
    } catch (error) {
      console.error(error);
    }
  }

  function parseTickets(raw) {
    return [...new Set(
      raw
        .split(",")
        .map((ticket) => ticket.trim())
        .filter(Boolean)
    )];
  }

  function setupParticipation() {
    const form = qs("#participationForm");
    const button = qs("#submitButton");
    const result = qs("#formResult");

    form.addEventListener("submit", async (event) => {
      event.preventDefault();

      const tickets = parseTickets(qs("#tickets").value);
      if (!tickets.length) {
        result.style.color = "#b42318";
        result.textContent = "Ingresa al menos un ticket.";
        return;
      }

      const payload = {
        action: "register",
        raffleId: CONFIG.raffleId,
        tickets,
        fullName: qs("#fullName").value.trim(),
        identityNumber: qs("#identityNumber").value.trim(),
        phone: qs("#phone").value.trim(),
        city: qs("#city").value.trim(),
        paymentMethod: qs("#paymentMethod").value,
        notes: ""
      };

      button.disabled = true;
      button.textContent = "Registrando...";
      result.textContent = "";

      try {
        const data = await postForm(payload);

        if (!data.ok) {
          result.style.color = "#b42318";
          if (data.duplicatedTickets?.length) {
            result.textContent =
              `Los siguientes tickets ya están ocupados: ${data.duplicatedTickets.join(", ")}.`;
          } else {
            result.textContent = data.error || "No se pudo registrar la participación.";
          }
          return;
        }

        result.style.color = "#15834b";
        result.innerHTML =
          `Registro correcto. Tu código es <strong>${escapeHtml(data.participationCode)}</strong>. ` +
          `Estado: <strong>${escapeHtml(data.status)}</strong>.`;

        form.reset();
      } catch (error) {
        console.error(error);
        result.style.color = "#b42318";
        result.textContent =
          "No se pudo enviar el registro. Verifica que la aplicación web de Google tenga acceso para cualquier persona.";
      } finally {
        button.disabled = false;
        button.textContent = "Registrar participación";
      }
    });
  }

  function setupTicketSearch() {
    const form = qs("#ticketSearchForm");
    const output = qs("#ticketSearchResult");

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const ticket = qs("#ticketSearchInput").value.trim();
      output.textContent = "Consultando...";

      try {
        const data = await getJson("ticket", {
          raffleId: CONFIG.raffleId,
          ticket
        });

        if (!data.ok) {
          output.innerHTML = `<article>${escapeHtml(data.error || "Ticket no encontrado.")}</article>`;
          return;
        }

        output.innerHTML = `
          <article>
            Ticket <strong>${escapeHtml(data.ticket.number)}</strong><br>
            Participante: ${escapeHtml(data.ticket.fullName)}<br>
            Estado: <strong>${escapeHtml(data.ticket.status)}</strong><br>
            Código: ${escapeHtml(data.ticket.participationCode)}
          </article>
        `;
      } catch (error) {
        output.innerHTML = "<article>No fue posible consultar el ticket.</article>";
      }
    });
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  createRollingNumbers();
  setupMenu();
  setupPrizeCards();
  setupParticipation();
  setupTicketSearch();

  qs("#refreshWinners").addEventListener("click", loadWinners);

  loadRaffle().then(loadWinners);

  window.setInterval(() => {
    loadWinners();
  }, Math.max(5, Number(CONFIG.refreshSeconds || 10)) * 1000);
})();
