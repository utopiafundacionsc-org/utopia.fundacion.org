
(() => {
  "use strict";

  const BUILD_VERSION = "11.4.0-20260714";
  console.info(`[Sorteos Utopía] app.js ${BUILD_VERSION}`);

  const CONFIG = window.UTOPIA_CONFIG || {};
  const URL_RAFFLE_ID = new URLSearchParams(window.location.search).get("raffleId");
  const REQUESTED_RAFFLE_ID = String(URL_RAFFLE_ID || CONFIG.raffleId || "RIFA-UTOPIA-2026").trim();
  const MAX_PROOF_BYTES = 5 * 1024 * 1024;
  const PAGE_SIZE = 100;
  const qs = (selector) => document.querySelector(selector);
  const qsa = (selector) => [...document.querySelectorAll(selector)];

  const state = {
    raffle: {
      id: REQUESTED_RAFFLE_ID,
      name: "Rifa Solidaria Mundial 2026",
      drawDate: "2026-07-17T20:00:00-04:00",
      ticketPrice: 50,
      currency: "Bs",
      totalTickets: 1000
    },
    board: [],
    stats: {},
    page: 0,
    selected: new Set(),
    reservation: null,
    reservationTimer: null,
    proofFile: null,
    confirmation: null,
    isReserving: false,
    countdownTimer: null,
    heroNumberTimer: null
  };

  const prizeLabels = {
    "PREMIO-001": "Primer premio",
    "PREMIO-002": "Segundo premio",
    "PREMIO-003": "Tercer premio"
  };

  const fallbackPrizes = [
    {id:"PREMIO-001",order:1,name:'Televisor FLUX de 50"',description:'UHD 4K · Smart Android 14',imageUrl:'assets/premio-televisor.jpg',status:'PENDIENTE'},
    {id:"PREMIO-002",order:2,name:'Parlante MASTER-G',description:'Con batería, USB y Bluetooth',imageUrl:'assets/premio-parlante.jpg',status:'PENDIENTE'},
    {id:"PREMIO-003",order:3,name:'Cafetera OSTER de 12 tazas',description:'Con filtro permanente',imageUrl:'assets/premio-cafetera.jpg',status:'PENDIENTE'}
  ];

  const statusClasses = {
    DISPONIBLE: "available",
    RESERVADO: "reserved",
    EN_REVISION: "review",
    VENDIDO: "sold",
    BLOQUEADO: "blocked"
  };

  const fallbackImpactItems = [
    {
      title: "Educación y becas",
      text: "Tu aporte contribuye a impulsar oportunidades educativas y acompañamiento formativo.",
      image: "assets/rifa-solidaria-2026.png"
    },
    {
      title: "Acción comunitaria",
      text: "Cada participación fortalece actividades solidarias, campañas y proyectos comunitarios.",
      image: "assets/logo-utopia.png.jpeg"
    },
    {
      title: "Transformación social",
      text: "La rifa apoya iniciativas con impacto real en personas, familias y comunidades.",
      image: "assets/logo-circulo-amigos-utopia.png"
    }
  ];

  const fallbackFaq = [
    {
      question: "¿Cuándo queda vendido mi número?",
      answer: "Cuando el equipo revisa y aprueba tu comprobante de pago."
    },
    {
      question: "¿Qué ocurre si mi reserva vence?",
      answer: "El número vuelve a quedar disponible para otros participantes."
    },
    {
      question: "¿Puedo comprar varios números?",
      answer: "Sí. Puedes seleccionar varios y el sistema calcula el total automáticamente."
    },
    {
      question: "¿Cómo consulto mis números?",
      answer: "Ingresa tu WhatsApp en la sección de consulta y verás todos los números registrados a tu nombre."
    }
  ];

  function buildUrl(action, params = {}) {
    const base = String(CONFIG.apiUrl || "").trim();
    if (!base) throw new Error("Falta configurar apiUrl en config.js.");
    const url = new URL(base);
    url.searchParams.set("action", action);
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, value);
    });
    url.searchParams.set("_v", BUILD_VERSION);
    return url.toString();
  }

  async function getJson(action, params = {}) {
    let response;
    try {
      response = await fetch(buildUrl(action, params), {
        method: "GET",
        cache: "no-store",
        redirect: "follow"
      });
    } catch (error) {
      throw new Error("No fue posible conectar con Google Apps Script.");
    }
    if (!response.ok) throw new Error(`Error ${response.status}`);
    if (typeof response.json === "function" && typeof response.text !== "function") return response.json();
    const text = await response.text();
    try { return JSON.parse(text); }
    catch { throw new Error("La API no devolvió datos JSON. Publica una nueva implementación de Apps Script con acceso para cualquier persona."); }
  }

  async function postForm(payload) {
    const body = new URLSearchParams();
    Object.entries(payload).forEach(([key, value]) => {
      body.set(key, Array.isArray(value) ? JSON.stringify(value) : String(value ?? ""));
    });
    let response;
    try {
      response = await fetch(String(CONFIG.apiUrl || "").trim(), {
        method: "POST",
        headers: {"Content-Type": "application/x-www-form-urlencoded;charset=UTF-8"},
        body: body.toString(),
        redirect: "follow"
      });
    } catch {
      throw new Error("No fue posible conectar con Google Apps Script.");
    }
    if (!response.ok) throw new Error(`Error ${response.status}`);
    if (typeof response.json === "function" && typeof response.text !== "function") return response.json();
    const text = await response.text();
    try { return JSON.parse(text); }
    catch { throw new Error("La API no devolvió datos JSON. Revisa la implementación publicada."); }
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

  function currentRaffleId() {
    return String(state.raffle?.id || REQUESTED_RAFFLE_ID || CONFIG.raffleId || "RIFA-UTOPIA-2026");
  }

  function driveFileId(value) {
    const text = String(value || "");
    const patterns = [/\/d\/([a-zA-Z0-9_-]+)/, /[?&]id=([a-zA-Z0-9_-]+)/, /googleusercontent\.com\/d\/([a-zA-Z0-9_-]+)/];
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) return match[1];
    }
    return "";
  }

  function safeImageUrl(value, fallback = "") {
    const text = String(value || "").trim();
    if (!text) return fallback;
    if (/^(assets\/|data:image\/|blob:)/i.test(text)) return text;
    const id = driveFileId(text);
    if (id) return `https://drive.google.com/thumbnail?id=${encodeURIComponent(id)}&sz=w2000`;
    return text;
  }

  function installImageFallback(image, fallback) {
    if (!image) return;
    image.addEventListener("error", () => {
      if (fallback && image.dataset.fallbackApplied !== "1") {
        image.dataset.fallbackApplied = "1";
        image.src = fallback;
      } else {
        image.classList.add("image-error");
      }
    });
  }

  function prizeFallbackImage(prize, index = 0) {
    const order = Number(prize?.order || index + 1);
    return ({1:"assets/premio-televisor.jpg",2:"assets/premio-parlante.jpg",3:"assets/premio-cafetera.jpg"})[order] || "assets/rifa-solidaria-2026.png";
  }

  function prizeOrdinal(order) {
    const names = ["Primer premio", "Segundo premio", "Tercer premio", "Cuarto premio", "Quinto premio"];
    return names[Number(order) - 1] || `Premio ${order}`;
  }

  function renderPrizes(prizes = []) {
    const grid = qs("#prizeGrid") || qs(".prize-grid");
    if (!grid) return;
    const configured = Array.isArray(prizes) ? prizes.filter(Boolean) : [];
    const source = [...(configured.length ? configured : fallbackPrizes)]
      .sort((a,b) => Number(a.order || 0) - Number(b.order || 0));
    const countLabel = qs("#prizeCountLabel");
    if (countLabel) countLabel.textContent = source.length === 1 ? "Una oportunidad de ganar" : `${source.length} oportunidades de ganar`;
    grid.innerHTML = source.map((prize, index) => {
      const fallback = prizeFallbackImage(prize, index);
      const image = safeImageUrl(prize.imageUrl, fallback);
      const status = prize.winner ? `Ganador: ${escapeHtml(prize.winner.ticket)}` : "Consultar ganador →";
      return `<button class="prize-card" data-prize-id="${escapeHtml(prize.id)}" type="button">
        <span class="prize-order">${escapeHtml(prize.order || index + 1)}</span>
        <div class="prize-image"><img src="${escapeHtml(image)}" data-fallback="${escapeHtml(fallback)}" alt="${escapeHtml(prize.name || "Premio")}"></div>
        <div class="prize-copy"><small>${escapeHtml(prizeOrdinal(prize.order || index + 1))}</small><h3>${escapeHtml(prize.name || "Premio")}</h3><p>${escapeHtml(prize.description || "")}</p><span class="${prize.winner ? "has-winner" : ""}">${status}</span></div>
      </button>`;
    }).join("");
    qsa("#prizeGrid img").forEach((image) => installImageFallback(image, image.dataset.fallback));
    qsa("#prizeGrid .prize-card").forEach((card) => card.addEventListener("click", () => openWinner(card.dataset.prizeId)));
  }


  function setText(selector, value) {
    const element = qs(selector);
    if (element) element.textContent = value;
  }

  function isTechnicalConnectionError(error) {
    const message = String(error?.message || error || "").toLowerCase();
    return message.includes("failed to fetch") ||
      message.includes("networkerror") ||
      message.includes("load failed") ||
      message.includes("error 0");
  }

  function publicErrorMessage(error, fallback) {
    return isTechnicalConnectionError(error) ? fallback : String(error?.message || fallback);
  }

  function getTicketDigits() {
    const total = Number(state.raffle?.totalTickets || 1000);
    return Math.max(3, String(Math.max(0, total - 1)).length);
  }

  function formatTicket(number) {
    return String(number).padStart(getTicketDigits(), "0");
  }

  function parseDateInput(value) {
    if (!value) return null;
    if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;

    const direct = new Date(value);
    if (!Number.isNaN(direct.getTime())) return direct;

    const raw = String(value).trim();
    const match = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2}))?$/);
    if (match) {
      const [, dd, mm, yyyy, hh = "20", min = "00"] = match;
      const custom = new Date(Number(yyyy), Number(mm) - 1, Number(dd), Number(hh), Number(min), 0, 0);
      if (!Number.isNaN(custom.getTime())) return custom;
    }

    return null;
  }

  function getHeroDigitCount() {
    const totalTickets = Math.max(
      1,
      Math.floor(Number(state.raffle?.totalTickets || 1))
    );

    /*
      El número de cuadros se calcula desde TOTAL_NUMEROS,
      configurado en el panel administrativo.

      Ejemplos:
      100 rifas   = 3 cuadros
      1000 rifas  = 4 cuadros
      10000 rifas = 5 cuadros
    */
    return String(totalTickets).length;
  }

  function buildHeroNumberBoxes() {
    const strip = qs("#heroNumberStrip");
    if (!strip) return [];

    const digitCount = getHeroDigitCount();
    strip.style.setProperty("--hero-digit-count", String(digitCount));
    strip.innerHTML = "";

    for (let index = 0; index < digitCount; index += 1) {
      const box = document.createElement("span");
      box.textContent = "0";
      strip.appendChild(box);
    }

    return [...strip.querySelectorAll("span")];
  }

  function showRandomValidHeroNumber(digits) {
    const totalTickets = Math.max(
      1,
      Math.floor(Number(state.raffle?.totalTickets || 1))
    );
    const digitCount = getHeroDigitCount();

    /* El número mostrado siempre pertenece al rango válido del sorteo. */
    const randomTicket = Math.floor(Math.random() * totalTickets);
    const value = String(randomTicket).padStart(digitCount, "0");

    digits.forEach((digit, index) => {
      digit.classList.remove("flip");
      void digit.offsetWidth;
      digit.classList.add("flip");

      window.setTimeout(() => {
        digit.textContent = value[index] || "0";
      }, 80 + index * 35);
    });
  }

  function startHeroNumberAnimation() {
    const digits = buildHeroNumberBoxes();
    if (!digits.length) return;

    if (state.heroNumberTimer) {
      window.clearInterval(state.heroNumberTimer);
    }

    showRandomValidHeroNumber(digits);

    state.heroNumberTimer = window.setInterval(() => {
      showRandomValidHeroNumber(digits);
    }, 1150);
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
    const targetDate = parseDateInput(dateInput);
    if (!targetDate) return;

    if (state.countdownTimer) window.clearInterval(state.countdownTimer);

    const update = () => {
      const diff = Math.max(0, targetDate.getTime() - Date.now());
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
    state.countdownTimer = window.setInterval(update, 1000);
  }

  function applyContactSettings(raffle = {}) {
    const contact = raffle.contact || {};
    const owns = (key) => Object.prototype.hasOwnProperty.call(raffle, key);

    const whatsapp = String(
      owns("contactWhatsApp") ? raffle.contactWhatsApp :
      owns("whatsappContact") ? raffle.whatsappContact :
      (contact.whatsapp ?? CONFIG.contactWhatsApp ?? "+59164483623")
    ).trim();
    const facebook = String(
      owns("facebookUrl") ? raffle.facebookUrl : (contact.facebook ?? CONFIG.facebookUrl ?? "")
    ).trim();
    const linkedin = String(
      owns("linkedinUrl") ? raffle.linkedinUrl : (contact.linkedin ?? CONFIG.linkedinUrl ?? "")
    ).trim();
    const tiktok = String(
      owns("tiktokUrl") ? raffle.tiktokUrl : (contact.tiktok ?? CONFIG.tiktokUrl ?? "")
    ).trim();

    const whatsappDigits = whatsapp.replace(/\D/g, "");
    const whatsappLink = qs("#contactWhatsapp");
    const whatsappText = qs("#contactWhatsappText");
    const facebookLink = qs("#contactFacebook");
    const linkedinLink = qs("#contactLinkedIn");
    const tiktokLink = qs("#contactTikTok");

    if (whatsappLink) {
      whatsappLink.hidden = !whatsappDigits;
      whatsappLink.href = whatsappDigits ? `https://wa.me/${whatsappDigits}` : "#";
    }
    if (whatsappText) whatsappText.textContent = whatsapp || "";
    [[facebookLink, facebook], [linkedinLink, linkedin], [tiktokLink, tiktok]].forEach(([link, url]) => {
      if (!link) return;
      link.hidden = !url;
      link.href = url || "#";
    });
  }

  function applyRaffle(raffle) {
    state.raffle = raffle;
    const date = parseDateInput(raffle.drawDate) || new Date();
    const formattedDate = new Intl.DateTimeFormat("es-BO", {
      day: "2-digit", month: "2-digit", year: "numeric", timeZone: "America/La_Paz"
    }).format(date);
    const formattedTime = new Intl.DateTimeFormat("es-BO", {
      hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "America/La_Paz"
    }).format(date);

    setText("#topRaffleName", raffle.name || "Sorteo Utopía");
    setText("#heroRaffleName", raffle.name || "Sorteo Utopía");
    setText("#heroStatusBadge", `Sorteo ${String(raffle.status || "activo").toLowerCase()}`);
    setText("#heroOrganization", raffle.organization || "Fundación Utopía");
    if (raffle.description) setText("#heroDescription", raffle.description);
    document.title = `${raffle.name || "Sorteos Utopía"} | Fundación Utopía`;
    setText("#countdownDateTime", `${formattedDate} a las ${formattedTime}`);
    setText("#heroPrice", formatMoney(raffle.ticketPrice, raffle.currency));
    const footerPrice = qs("#footerPrice");
    const footerDate = qs("#footerDate");
    if (footerPrice) footerPrice.textContent = `Ticket: ${formatMoney(raffle.ticketPrice, raffle.currency)}`;
    if (footerDate) footerDate.textContent = `Fecha: ${formattedDate}`;
    setText("#summaryUnit", formatMoney(raffle.ticketPrice, raffle.currency));
    const randomQuantityInput = qs("#randomQuantity");
    if (randomQuantityInput) randomQuantityInput.max = String(Math.max(1, Number(raffle.totalTickets || 1)));
    const publicInstructions=qs("#publicParticipationInstructions");if(publicInstructions){publicInstructions.textContent=raffle.participationInstructions||"";publicInstructions.hidden=!publicInstructions.textContent;}
    const termsText=qs("#termsText");if(termsText&&raffle.termsText)termsText.textContent=raffle.termsText;
    const qrImage=qs("#paymentQrImage");
    if(qrImage){
      const fallback="assets/qr-pago.png";
      qrImage.src=safeImageUrl(raffle.qrPaymentUrl,fallback);
      installImageFallback(qrImage,fallback);
    }
    const methodSelect=qs("#paymentMethod");
    if(methodSelect){
      const methods=Array.isArray(raffle.paymentMethods)&&raffle.paymentMethods.length?raffle.paymentMethods:["QR"];
      const previous=methodSelect.value;
      methodSelect.innerHTML='<option value="">Seleccionar</option>'+methods.map(method=>`<option value="${escapeHtml(method)}">${escapeHtml(method)}</option>`).join('');
      if(methods.includes(previous))methodSelect.value=previous;
    }

    applyContactSettings(raffle);
    renderImpactContent(raffle.impactItems || []);
    renderFaq(raffle.faqItems || []);
    renderPrizes(raffle.prizes || []);
    startCountdown(date);
    startHeroNumberAnimation();
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

  function renderImpactContent(items) {
    const gallery = qs("#impactGallery");
    if (!gallery) return;
    const source = items.length ? items : fallbackImpactItems;
    gallery.innerHTML = "";
    source.forEach((item) => {
      const article = document.createElement("article");
      article.innerHTML = `
        <img src="${escapeHtml(safeImageUrl(item.image || item.imageUrl, 'assets/rifa-solidaria-2026.png'))}" alt="${escapeHtml(item.title || 'Proyecto Utopía')}">
        <h3>${escapeHtml(item.title || 'Proyecto Utopía')}</h3>
        <p>${escapeHtml(item.text || '')}</p>
      `;
      gallery.appendChild(article);
    });
  }

  function renderFaq(items) {
    const container = qs("#faqList");
    if (!container) return;
    const source = items.length ? items : fallbackFaq;
    container.innerHTML = "";
    source.forEach((item) => {
      const detail = document.createElement("details");
      detail.innerHTML = `<summary>${escapeHtml(item.question)}</summary><p>${escapeHtml(item.answer)}</p>`;
      container.appendChild(detail);
    });
  }

  async function loadRaffle() {
    const data = await getJson("raffle", {raffleId: currentRaffleId()});
    if (!data || data.ok === false) throw new Error(data?.error || "No se pudo cargar el sorteo.");
    const raw = data.raffle || data.sorteo || data.data?.raffle || data;
    if (!raw || !raw.id) throw new Error("La API no devolvió la información del sorteo.");
    const raffle = {
      ...raw,
      prizes: raw.prizes || data.prizes || data.premios || [],
      impactItems: raw.impactItems || data.impactItems || data.reviews || data.resenas || [],
      faqItems: raw.faqItems || data.faqItems || data.faq || data.preguntas || []
    };
    applyRaffle(raffle);
    if (!state.reservation) {
      state.board = createFallbackBoard();
      state.stats = {
        total: state.board.length,
        sold: 0,
        reserved: 0,
        review: 0,
        available: state.board.length,
        blocked: 0
      };
      updateStats();
      renderBoard();
    }
    return raffle;
  }

  async function loadPublicRaffles() {
    const wrapper = qs("#publicRaffleSelectWrap");
    const selector = qs("#publicRaffleSelect");
    if (!wrapper || !selector) return;
    try {
      const data = await getJson("raffles");
      const raffles = data?.raffles || data?.sorteos || [];
      if (!data?.ok || raffles.length < 2) {
        wrapper.hidden = true;
        return;
      }
      selector.innerHTML = raffles.map((item) =>
        `<option value="${escapeHtml(item.id)}">${escapeHtml(item.name)} · ${escapeHtml(item.status || "ACTIVO")}</option>`
      ).join("");
      selector.value = currentRaffleId();
      wrapper.hidden = false;
    } catch {
      wrapper.hidden = true;
    }
  }

  async function switchPublicRaffle(raffleId) {
    if (!raffleId || raffleId === currentRaffleId()) return;
    state.raffle = {...state.raffle, id: raffleId};
    state.page = 0;
    state.selected.clear();
    state.reservation = null;
    updateSelection();
    const url = new URL(window.location.href);
    url.searchParams.set("raffleId", raffleId);
    window.history.replaceState({}, "", url);
    setPublicNotice("Cargando sorteo…", "info");
    try {
      await loadRaffle();
      await loadBoard({preservePage:false});
      await loadWinners();
      setPublicNotice("", "");
    } catch (error) {
      setPublicNotice(error.message, "error");
    }
  }

  function setPublicNotice(message, type = "info") {
    const notice = qs("#publicSystemNotice");
    if (!notice) return;
    notice.textContent = message || "";
    notice.className = `public-system-notice ${type}`;
    notice.hidden = !message;
  }

  function createFallbackBoard() {
    const total = Number(state.raffle?.totalTickets || 0);
    if (!total) return [];
    return Array.from({length: total}, (_, index) => ({
      number: formatTicket(index),
      status: "DISPONIBLE",
      label: "Disponible"
    }));
  }

  function canonicalTicketStatus(item = {}) {
    const source =
      item.status ??
      item.estado ??
      item.numberStatus ??
      item.ticketStatus ??
      item.estadoNumero ??
      item.paymentStatus ??
      item.estadoPago ??
      item.situacion ??
      "DISPONIBLE";

    const normalized = String(source)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim()
      .toUpperCase()
      .replace(/[\s-]+/g, "_");

    const aliases = {
      DISPONIBLE: "DISPONIBLE",
      AVAILABLE: "DISPONIBLE",
      LIBRE: "DISPONIBLE",
      FREE: "DISPONIBLE",
      RECHAZADO: "DISPONIBLE",
      REJECTED: "DISPONIBLE",
      VENCIDO: "DISPONIBLE",
      EXPIRED: "DISPONIBLE",
      RESERVADO: "RESERVADO",
      RESERVED: "RESERVADO",
      PENDIENTE: "RESERVADO",
      PENDING: "RESERVADO",
      RESERVA_TEMPORAL: "RESERVADO",
      EN_REVISION: "EN_REVISION",
      REVISION: "EN_REVISION",
      REVIEW: "EN_REVISION",
      COMPROBANTE_RECIBIDO: "EN_REVISION",
      RECIBIDO: "EN_REVISION",
      PAYMENT_RECEIVED: "EN_REVISION",
      VENDIDO: "VENDIDO",
      SOLD: "VENDIDO",
      APROBADO: "VENDIDO",
      APPROVED: "VENDIDO",
      PAGADO: "VENDIDO",
      GANADOR: "VENDIDO",
      BLOQUEADO: "BLOQUEADO",
      BLOCKED: "BLOQUEADO",
      INACTIVO: "BLOQUEADO",
      CANCELADO: "BLOQUEADO"
    };

    return aliases[normalized] || "BLOQUEADO";
  }

  function normalizeBoard(rawTickets) {
    const tickets = (rawTickets || []).map((item, index) => {
      const rawNumber = item.number ?? item.ticket ?? item.numero ?? item.numeroTicket ?? index;
      const number = /^\d+$/.test(String(rawNumber))
        ? formatTicket(Number(rawNumber))
        : formatTicket(index);
      const status = canonicalTicketStatus(item);
      return {
        ...item,
        number,
        status,
        label: item.label || item.etiqueta || status
      };
    });

    if (!tickets.length) return createFallbackBoard();
    return tickets;
  }

  async function loadBoard({preservePage = true} = {}) {
    const data = await getJson("board", {raffleId: currentRaffleId()});
    if (!data || data.ok === false) throw new Error(data?.error || "No se pudo cargar el tablero.");

    const rawTickets = data.tickets || data.numbers || data.numeros || data.board || data.data?.tickets || [];
    state.board = normalizeBoard(rawTickets);

    /* Los cuadros son la fuente de verdad. Así nunca se mostrará 0 disponibles
       cuando el tablero contiene números libres. */
    state.stats = {
      total: state.board.length,
      sold: state.board.filter((item) => item.status === "VENDIDO").length,
      reserved: state.board.filter((item) => item.status === "RESERVADO").length,
      review: state.board.filter((item) => item.status === "EN_REVISION").length,
      available: state.board.filter((item) => item.status === "DISPONIBLE").length,
      blocked: state.board.filter((item) => item.status === "BLOQUEADO").length
    };

    if (!preservePage) state.page = 0;
    const reservationMinutes = data.reservationMinutes || data.minutosReserva || state.raffle?.reservationMinutes || 15;
    setText("#reservationMinutesText", `${reservationMinutes} minutos`);
    updateStats();
    renderBoard();
    removeUnavailableSelections();
    setPublicNotice("", "");
  }

  function updateStats() {
    const stats = state.stats;
    const soldPercent = stats.total ? Math.round((stats.sold / stats.total) * 100) : 0;

    setText("#heroSold", stats.sold ?? 0);
    setText("#heroAvailable", stats.available ?? 0);
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
    if (!grid) return;

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
    syncFormAvailability();
  }

  function isTermsAccepted() {
    return qs("#terms").checked;
  }

  function showParticipantFieldsIfAllowed() {
    const shouldShow = isTermsAccepted() && state.selected.size > 0;
    qs("#participantFields").hidden = !shouldShow;
    if (!shouldShow) {
      qs("#paymentSummary").hidden = true;
      qs("#qrPaymentPanel").hidden = true;
    }
  }

  function getParticipantValues() {
    return {
      fullName: qs("#fullName").value.trim(),
      phone: qs("#phone").value.trim(),
      email: qs("#email").value.trim(),
      department: qs("#department").value.trim(),
      identityNumber: qs("#identityNumber").value.trim()
    };
  }

  function hasParticipantValues() {
    const values = getParticipantValues();
    return Object.values(values).every(Boolean);
  }

  function validateParticipantFields() {
    const values = getParticipantValues();
    if (!state.selected.size) throw new Error("Selecciona al menos un número.");
    if (!values.fullName || !values.phone || !values.email || !values.department || !values.identityNumber) {
      throw new Error("Completa todos los datos del participante.");
    }
    if (!isTermsAccepted()) throw new Error("Debes aceptar los términos y condiciones.");
    if (!qs("#paymentMethod").value) throw new Error("Selecciona un método de pago.");
    return values;
  }

  function syncFormAvailability() {
    showParticipantFieldsIfAllowed();

    const paymentMethod = qs("#paymentMethod").value;
    const paymentSelected = !!paymentMethod;
    const qrSelected = String(paymentMethod).toUpperCase().includes("QR");
    const canShowPayment = paymentSelected && isTermsAccepted() && state.selected.size > 0;
    qs("#paymentSummary").hidden = !canShowPayment;
    qs("#qrPaymentPanel").hidden = !(canShowPayment && qrSelected);

    const proofRequired = paymentMethod !== "EFECTIVO";
    const proofReady = !proofRequired || !!qs("#paymentProof").files?.[0];
    const canSubmit = canShowPayment && hasParticipantValues() && proofReady;
    qs("#submitButton").disabled = !canSubmit;
  }

  async function reserveTickets() {
    if (state.reservation || state.isReserving) return state.reservation;
    const person = validateParticipantFields();
    state.isReserving = true;
    try {
      const data = await postForm({
        action: "reserve",
        raffleId: currentRaffleId(),
        tickets: [...state.selected],
        ...person,
        city: person.department,
        paymentMethod: qs("#paymentMethod").value
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
      startReservationCountdown();
      await loadBoard();
      renderBoard();
      return state.reservation;
    } finally {
      state.isReserving = false;
    }
  }

  async function tryAutoReserve() {
    if (!isTermsAccepted()) return;
    if (!qs("#paymentMethod").value) return;
    if (!state.selected.size) return;
    if (!hasParticipantValues()) return;
    if (state.reservation) return;

    try {
      qs("#reservationMessage").textContent = "Generando reserva...";
      await reserveTickets();
    } catch (error) {
      console.error(error);
      const status = qs("#reservationMessage");
      if (status) status.textContent = "";
    }
  }

  function startReservationCountdown() {
    if (state.reservationTimer) window.clearInterval(state.reservationTimer);

    const update = () => {
      if (!state.reservation) return;
      const expiration = parseDateInput(state.reservation.expiresAt);
      const diff = (expiration ? expiration.getTime() : 0) - Date.now();
      if (diff <= 0) {
        window.clearInterval(state.reservationTimer);
        state.reservation = null;
        qs("#reservationCountdown").textContent = "00:00";
        qs("#reservationMessage").textContent = "La reserva venció. Selecciona nuevamente tus números.";
        loadBoard().catch(() => {});
        syncFormAvailability();
        return;
      }
      const minutes = Math.floor(diff / 60000);
      const seconds = Math.floor((diff % 60000) / 1000);
      qs("#reservationCountdown").textContent = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
    };

    update();
    state.reservationTimer = window.setInterval(update, 1000);
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
      validateParticipantFields();
      const proofFile = qs("#paymentProof").files?.[0];
      const proofRequired = qs("#paymentMethod").value !== "EFECTIVO";
      const proofData = proofRequired ? await readProof(proofFile) : {};
      state.proofFile = proofFile || null;
      if (!state.reservation) await reserveTickets();

      const data = await postForm({
        action: "confirmRegistration",
        raffleId: currentRaffleId(),
        participationCode: state.reservation.code,
        ...proofData
      });
      if (!data.ok) throw new Error(data.error || "No se pudo confirmar la participación.");

      state.confirmation = data;
      result.style.color = "#15834b";
      result.innerHTML = `Participación registrada. Código: <strong>${escapeHtml(data.participationCode)}</strong>. Estado: <strong>${escapeHtml(data.status)}</strong>.`;
      fillReceipt(data);
      qs("#confirmationActions").hidden = false;

      state.reservation = null;
      if (state.reservationTimer) window.clearInterval(state.reservationTimer);
      state.selected.clear();
      qs("#participationForm").reset();
      qs("#participantFields").hidden = true;
      updateSelection();
      syncFormAvailability();
      await loadBoard();
      window.setTimeout(() => {
        shareWhatsapp().catch(() => {});
      }, 350);
    } catch (error) {
      console.error(error);
      result.style.color = "#b42318";
      result.textContent = publicErrorMessage(
        error,
        "No se pudo completar el registro en este momento. Intenta nuevamente."
      );
    } finally {
      syncFormAvailability();
      button.textContent = "Registrar participación y enviar comprobante";
    }
  }

  function fillReceipt(data) {
    const name = data.fullName || getParticipantValues().fullName || "Participante";
    qs("#receiptGreeting").textContent = `Hola, ${name}. Tu participación fue registrada correctamente.`;
    qs("#receiptCode").textContent = data.participationCode;
    qs("#receiptTickets").textContent = (data.tickets || []).join(", ");
    qs("#receiptAmount").textContent = formatMoney(data.totalAmount, data.currency);
    qs("#receiptDate").textContent = qs("#countdownDateTime").textContent;
  }

  function buildConfirmationMessage() {
    const data = state.confirmation;
    if (!data) return "";
    const name = data.fullName || "Participante";
    return [
      "🎉 *PARTICIPACIÓN CONFIRMADA – SORTEOS UTOPÍA*",
      "",
      `Hola, ${name}. Tu participación fue registrada correctamente.`,
      "",
      `*Código:* ${data.participationCode}`,
      `*Números:* ${(data.tickets || []).join(", ")}`,
      `*Total pagado:* ${formatMoney(data.totalAmount, data.currency)}`,
      `*Fecha del sorteo:* ${qs("#countdownDateTime").textContent}`,
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
      try {
        const files = [state.proofFile];
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
    const data = await getJson("winners", {raffleId: currentRaffleId()});
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
      }).format(parseDateInput(winner.drawDate) || new Date());
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
        raffleId: currentRaffleId(),
        phone: qs("#lookupPhone").value.trim()
      });
      if (!data.ok) {
        output.textContent = data.error || "No se encontraron registros.";
        return;
      }
      output.innerHTML = `
        <h3>${escapeHtml(data.fullName)}</h3>
        <p>Números registrados a tu nombre:</p>
        <div class="lookup-ticket-list">
          ${(data.tickets || []).map((item) => `<span>${escapeHtml(item.number)} · ${escapeHtml(item.status)}</span>`).join("")}
        </div>`;
    } catch {
      output.textContent = "No fue posible realizar la consulta.";
    }
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
    const available = state.board
      .filter((item) => item.status === "DISPONIBLE")
      .map((item) => item.number);
    const requested = Math.max(1, Math.floor(Number(qs("#randomQuantity").value || 1)));
    const quantity = Math.min(requested, available.length);

    for (let index = available.length - 1; index > 0; index -= 1) {
      const random = Math.floor(Math.random() * (index + 1));
      [available[index], available[random]] = [available[random], available[index]];
    }

    state.selected.clear();
    available.slice(0, quantity).forEach((number) => state.selected.add(number));
    if (requested > available.length) {
      qs("#reservationMessage").textContent = `Solo existen ${available.length} números disponibles.`;
    }
    updateSelection();
    renderBoard();
  }

  function setupEvents() {
    const on = (selector, event, handler) => {
      const element = qs(selector);
      if (element) element.addEventListener(event, handler);
    };
    on("#ticketPrevPage", "click", () => { state.page -= 1; renderBoard(); });
    on("#ticketNextPage", "click", () => { state.page += 1; renderBoard(); });
    on("#searchBoardTicket", "click", searchTicket);
    on("#randomTickets", "click", chooseRandomTickets);
    on("#refreshBoard", "click", () => loadBoard().catch((error) => setPublicNotice(error.message, "error")));
    on("#publicRaffleSelect", "change", (event) => switchPublicRaffle(event.target.value));

    on("#terms", "change", syncFormAvailability);
    ["#fullName", "#phone", "#email", "#identityNumber", "#department"].forEach((selector) => {
      on(selector, "input", () => { syncFormAvailability(); tryAutoReserve(); });
      on(selector, "change", () => { syncFormAvailability(); tryAutoReserve(); });
    });

    on("#paymentMethod", "change", async () => {
      syncFormAvailability();
      await tryAutoReserve();
    });

    on("#paymentProof", "change", () => {
      const input = qs("#paymentProof");
      const file = input?.files?.[0];
      setText("#proofFileName", file
        ? `${file.name} · ${(file.size / 1024 / 1024).toFixed(2)} MB`
        : "Adjunta imagen o PDF del pago. Máximo 5 MB.");
      syncFormAvailability();
    });

    on("#participationForm", "submit", submitParticipation);
    on("#printReceipt", "click", () => {
      const receipt = qs("#digitalReceipt");
      if (!receipt) return;
      receipt.hidden = false;
      window.print();
      receipt.hidden = true;
    });
    on("#phoneLookupForm", "submit", lookupByPhone);
    on("#closeWinnerModal", "click", () => qs("#winnerModal")?.close());
    on("#winnerModal", "click", (event) => {
      if (event.target === qs("#winnerModal")) qs("#winnerModal")?.close();
    });
  }

  async function initialize() {
    const heroVideo = qs("#heroVideo") || qs(".hero-bg-video");
    if (heroVideo) {
      heroVideo.autoplay = true;
      heroVideo.loop = true;
      heroVideo.muted = true;
      heroVideo.defaultMuted = true;
      heroVideo.playsInline = true;
      heroVideo.volume = 0;
      heroVideo.controls = false;
      heroVideo.setAttribute("muted", "");
      heroVideo.setAttribute("playsinline", "");
      heroVideo.setAttribute("webkit-playsinline", "");
      heroVideo.removeAttribute("controls");
      const playHeroVideo = () => {
        if (!heroVideo.paused) return;
        const promise = heroVideo.play();
        if (promise?.catch) promise.catch(() => {});
      };
      heroVideo.addEventListener("loadedmetadata", playHeroVideo, {once:true});
      heroVideo.addEventListener("canplay", playHeroVideo);
      heroVideo.addEventListener("ended", () => { heroVideo.currentTime = 0; playHeroVideo(); });
      document.addEventListener("pointerdown", playHeroVideo, {once:true});
      document.addEventListener("visibilitychange", () => { if (!document.hidden) playHeroVideo(); });
      try { heroVideo.load(); playHeroVideo(); } catch {}
    }

    applyContactSettings(state.raffle);
    setupMenu();
    setupEvents();
    startCountdown(state.raffle.drawDate);
    applyRaffle({...state.raffle, prizes:fallbackPrizes});
    state.board = createFallbackBoard();
    state.stats = {total:state.board.length,sold:0,reserved:0,review:0,available:state.board.length,blocked:0};
    updateStats();
    renderBoard();
    syncFormAvailability();

    try {
      await loadRaffle();
      await Promise.all([loadBoard({preservePage:false}), loadWinners(), loadPublicRaffles()]);
    } catch (error) {
      console.error(error);
      setPublicNotice(`${error.message} Se muestran datos locales de respaldo hasta recuperar la conexión.`, "error");
      renderPrizes(state.raffle?.prizes || fallbackPrizes);
      if (!state.board.length) state.board = createFallbackBoard();
      state.stats = {
        total:state.board.length,
        sold:state.board.filter(i=>i.status==="VENDIDO").length,
        reserved:state.board.filter(i=>i.status==="RESERVADO").length,
        review:state.board.filter(i=>i.status==="EN_REVISION").length,
        available:state.board.filter(i=>i.status==="DISPONIBLE").length,
        blocked:state.board.filter(i=>i.status==="BLOQUEADO").length
      };
      updateStats();
      renderBoard();
    }

    window.setInterval(async () => {
      if (!state.reservation) {
        try { await loadBoard(); await loadWinners(); }
        catch (error) { setPublicNotice(error.message, "error"); }
      }
    }, Math.max(10, Number(state.raffle?.publicRefreshSeconds || CONFIG.refreshSeconds || 15)) * 1000);
  }


  const boot = () => initialize().catch((error) => {
    console.error(error);
    setPublicNotice(error.message || "No se pudo iniciar la página.", "error");
  });
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, {once:true});
  else boot();
})();
