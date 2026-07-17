
(() => {
  "use strict";

  const BUILD_VERSION = "12.4.5-20260716";
  console.info(`[Sorteos Utopía] app.js ${BUILD_VERSION}`);

  const CONFIG = window.UTOPIA_CONFIG || {};
  const URL_RAFFLE_ID = new URLSearchParams(window.location.search).get("raffleId");
  const REQUESTED_RAFFLE_ID = String(URL_RAFFLE_ID || "").trim();
  const MAX_PROOF_BYTES = 5 * 1024 * 1024;
  const PAGE_SIZE = 100;
  const qs = (selector) => document.querySelector(selector);
  const qsa = (selector) => [...document.querySelectorAll(selector)];
  const inflightGetRequests = new Map();
  let refreshTick = 0;

  const state = {
    raffle: {
      id: REQUESTED_RAFFLE_ID || "",
      name: "",
      drawDate: "",
      ticketPrice: 0,
      currency: "Bs",
      totalTickets: 0
    },
    board: [],
    stats: {},
    page: 0,
    selected: new Set(),
    hold: null,
    holdTickets: new Set(),
    holdSyncTimer: null,
    holdSyncRequested: false,
    holdSignature: "",
    isHolding: false,
    paymentMethods: [],
    reservation: null,
    reservationTimer: null,
    proofFile: null,
    confirmation: null,
    lastRegisteredPhone: "",
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
    const key = `${action}|${JSON.stringify(params || {})}`;
    if (inflightGetRequests.has(key)) return inflightGetRequests.get(key);
    const request = (async () => {
      const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
      const timeout = controller ? window.setTimeout(() => controller.abort(), 25000) : null;
      let response;
      try {
        response = await fetch(buildUrl(action, params), {
          method: "GET",
          cache: "no-store",
          redirect: "follow",
          signal: controller?.signal
        });
      } catch (error) {
        if (error?.name === "AbortError") throw new Error("La consulta tardó demasiado. Intenta nuevamente.");
        throw new Error("No fue posible conectar con Google Apps Script.");
      } finally {
        if (timeout) window.clearTimeout(timeout);
      }
      if (!response.ok) throw new Error(`Error ${response.status}`);
      if (typeof response.json === "function" && typeof response.text !== "function") return response.json();
      const text = await response.text();
      try { return JSON.parse(text); }
      catch { throw new Error("La API no devolvió datos JSON. Publica una nueva implementación de Apps Script con acceso para cualquier persona."); }
    })();
    inflightGetRequests.set(key, request);
    try { return await request; } finally { inflightGetRequests.delete(key); }
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
    return String(state.raffle?.id || REQUESTED_RAFFLE_ID || "").trim();
  }

  function normalizePaymentMethod(method, index = 0) {
    const source = typeof method === "string" ? {id:method,type:method,label:method,enabled:true} : (method || {});
    const raw = String(source.type || source.id || source.label || "OTRO")
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toUpperCase().replace(/[\s-]+/g, "_");
    let type = raw;
    if (raw.includes("TRANSFER") || raw.includes("BANCO")) type = "TRANSFERENCIA_BANCARIA";
    else if (raw.includes("QR")) type = "QR";
    else if (raw.includes("EFECT")) type = "EFECTIVO";
    const labels = {QR:"QR",TRANSFERENCIA_BANCARIA:"Transferencia bancaria",EFECTIVO:"Efectivo"};
    return {
      ...source,
      id: String(source.id || type || `METODO_${index + 1}`).replace(/[^a-zA-Z0-9_-]/g, "_").toUpperCase(),
      type,
      label: source.label || labels[type] || source.name || "Otro método",
      enabled: source.enabled !== false
    };
  }

  function selectedPaymentMethod() {
    const id = String(qs("#paymentMethod")?.value || "");
    return state.paymentMethods.find((method) => method.id === id) || null;
  }

  function selectedPaymentType() {
    return selectedPaymentMethod()?.type || "";
  }

  function updateUrlRaffle(raffleId) {
    const url = new URL(window.location.href);
    if (raffleId) url.searchParams.set("raffleId", raffleId);
    else url.searchParams.delete("raffleId");
    window.history.replaceState({}, "", url);
  }

  function statusLabel(status) {
    return ({DISPONIBLE:"Disponible",RESERVADO:"Reservado",EN_REVISION:"En revisión",VENDIDO:"Vendido",BLOQUEADO:"Bloqueado"})[status] || status;
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
    return Math.max(3, String(Math.max(1, total)).length);
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
    const randomTicket = 1 + Math.floor(Math.random() * totalTickets);
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
  function applyPublicRaffleBackground(raffle) {
    const hero = qs("#inicio.hero") || qs(".hero");
    const video = qs("#heroVideo") || qs(".hero-bg-video");
    if (!hero || !video) return;
    const type = String(raffle.publicBackgroundType || raffle.backgroundType || "VIDEO").toUpperCase();
    const url = String(raffle.publicBackgroundUrl || raffle.backgroundUrl || "").trim();
    if (type === "IMAGEN" && url) {
      try { video.pause(); } catch {}
      video.hidden = true;
      hero.classList.add("public-background-image");
      hero.style.backgroundImage = `linear-gradient(90deg,rgba(3,28,61,.94),rgba(5,47,95,.56)),url("${url.replaceAll('"','%22')}")`;
      return;
    }
    hero.classList.remove("public-background-image");
    hero.style.backgroundImage = "";
    video.hidden = false;
    if (url && video.src !== url) {
      video.src = url;
      video.load();
    }
    const play = video.play();
    if (play?.catch) play.catch(() => {});
  }

  function applyRaffle(raffle) {
    restoreActiveRaffleView();
    state.raffle = raffle;
    applyPublicRaffleBackground(raffle);
    const date = parseDateInput(raffle.drawDate) || new Date();
    const formattedDate = new Intl.DateTimeFormat("es-BO", {
      day: "2-digit", month: "2-digit", year: "numeric", timeZone: "America/La_Paz"
    }).format(date);
    const formattedTime = new Intl.DateTimeFormat("es-BO", {
      hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "America/La_Paz"
    }).format(date);

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

    state.paymentMethods = (Array.isArray(raffle.paymentMethods) ? raffle.paymentMethods : ["QR"])
      .map(normalizePaymentMethod).filter((method) => method.enabled);
    if (!state.paymentMethods.length) state.paymentMethods = [normalizePaymentMethod("QR")];
    const methodSelect=qs("#paymentMethod");
    if(methodSelect){
      const previous=methodSelect.value;
      methodSelect.innerHTML='<option value="">Seleccionar</option>'+state.paymentMethods.map(method=>`<option value="${escapeHtml(method.id)}">${escapeHtml(method.label)}</option>`).join('');
      if(state.paymentMethods.some(method=>method.id===previous))methodSelect.value=previous;
    }

    applyContactSettings(raffle);
    renderImpactContent(raffle.impactItems || []);
    renderFaq(raffle.faqItems || []);
    renderPrizes(raffle.prizes || []);
    startCountdown(date);
    startHeroNumberAnimation();
    syncFormAvailability();
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
  function applyPublicRafflesData(data) {
    const wrapper = qs("#publicRaffleSelectWrap");
    const selector = qs("#publicRaffleSelect");
    const raffles = data?.raffles || data?.sorteos || [];
    if (!data?.ok || !raffles.length) throw new Error(data?.error || "No existe un sorteo activo y publicado.");
    const requested = currentRaffleId() || REQUESTED_RAFFLE_ID;
    const selectedId = raffles.some((item) => item.id === requested)
      ? requested
      : (data.principalRaffleId || raffles[0].id);
    state.raffle = {...state.raffle, id:selectedId};
    if (wrapper && selector) {
      selector.innerHTML = raffles.map((item) =>
        `<option value="${escapeHtml(item.id)}">${escapeHtml(item.name)} · ${escapeHtml(item.status || "ACTIVO")}</option>`
      ).join("");
      selector.value = selectedId;
      wrapper.hidden = raffles.length < 2;
    }
    updateUrlRaffle(selectedId);
    return raffles;
  }

  async function loadPublicRaffles() {
    return applyPublicRafflesData(await getJson("raffles"));
  }

  function applyRaffleData(data) {
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
    updateUrlRaffle(raffle.id);
    return raffle;
  }

  async function loadRaffle() {
    return applyRaffleData(await getJson("raffle", {raffleId: currentRaffleId()}));
  }

  async function switchPublicRaffle(raffleId) {
    if (!raffleId || raffleId === currentRaffleId()) return;
    await cancelCurrentSelection();
    state.raffle = {...state.raffle, id: raffleId};
    state.page = 0;
    state.selected.clear();
    state.reservation = null;
    updateSelection();
    updateUrlRaffle(raffleId);
    setPublicNotice("Cargando sorteo…", "info");
    try {
      await loadPublicBootstrap(raffleId);
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

  const operationalSectionIds = ["premios","como-participar","sorteos","participar","ganadores","consulta","proyectos","transparencia","preguntas"];
  function setOperationalSectionsHidden(hidden) {
    operationalSectionIds.forEach((id) => { const section=document.getElementById(id); if(section)section.hidden=hidden; });
  }
  function restoreActiveRaffleView() {
    document.body.classList.remove("no-active-raffle");
    setOperationalSectionsHidden(false);
    const picker=qs("#publicRaffleSelectWrap");if(picker)picker.hidden=true;
  }
  function showNoActiveRaffle(message="No existe un sorteo activo y publicado.") {
    document.body.classList.add("no-active-raffle");
    setOperationalSectionsHidden(true);
    state.raffle={id:"",name:"",drawDate:"",ticketPrice:0,currency:"Bs",totalTickets:0,publicRefreshSeconds:Number(CONFIG.refreshSeconds||15)};
    state.board=[];state.stats={total:0,sold:0,reserved:0,review:0,available:0,blocked:0};state.page=0;state.selected.clear();
    if(state.countdownTimer){clearInterval(state.countdownTimer);state.countdownTimer=null;}
    if(state.heroNumberTimer){clearInterval(state.heroNumberTimer);state.heroNumberTimer=null;}
    setText("#heroStatusBadge","Sin sorteo activo");
    setText("#heroOrganization","Fundación Utopía");
    setText("#heroRaffleName","PRÓXIMAMENTE");
    setText("#heroDescription","En este momento no existe una rifa activa. Publicaremos la próxima convocatoria desde esta misma página.");
    setText("#heroPrice","—");setText("#heroSold","0");setText("#heroAvailable","0");
    setText("#countdownDateTime","Sin fecha programada");
    ["#days","#hours","#minutes","#seconds"].forEach(id=>setText(id,"00"));
    const strip=qs("#heroNumberStrip");if(strip)strip.innerHTML="";
    const selector=qs("#publicRaffleSelect");if(selector)selector.innerHTML="";
    const wrapper=qs("#publicRaffleSelectWrap");if(wrapper)wrapper.hidden=true;
    updateStats();renderBoard();updateUrlRaffle("");
    document.title="Sorteos Utopía | Sin sorteo activo";
    setPublicNotice(message,"info");
  }

  function createFallbackBoard() {
    const total = Number(state.raffle?.totalTickets || 0);
    if (!total) return [];
    return Array.from({length: total}, (_, index) => ({
      number: formatTicket(index + 1),
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
    const total = Math.max(0, Math.floor(Number(state.raffle?.totalTickets || 0)));
    if (!total) return [];

    /*
      El tablero siempre respeta el rango configurado del sorteo.
      Si el sorteo tiene 370 números, solo puede mostrar 001–370,
      aunque en la hoja hayan quedado filas antiguas de un rango mayor.
    */
    const byNumber = new Map();
    (rawTickets || []).forEach((item) => {
      const rawNumber = item.number ?? item.ticket ?? item.numero ?? item.numeroTicket;
      const numeric = Number(String(rawNumber ?? "").replace(/\D/g, ""));
      if (!Number.isInteger(numeric) || numeric < 1 || numeric > total || byNumber.has(numeric)) return;
      const status = canonicalTicketStatus(item);
      byNumber.set(numeric, {
        ...item,
        number: formatTicket(numeric),
        status,
        label: item.label || item.etiqueta || status
      });
    });

    return Array.from({length: total}, (_, index) => {
      const numeric = index + 1;
      return byNumber.get(numeric) || {
        number: formatTicket(numeric),
        status: "DISPONIBLE",
        label: "Disponible"
      };
    });
  }
  function applyBoardData(data, {preservePage = true} = {}) {
    if (!data || data.ok === false) throw new Error(data?.error || "No se pudo cargar el tablero.");
    if (data.raffleId && data.raffleId !== currentRaffleId()) {
      state.raffle = {...state.raffle, id:data.raffleId};
      updateUrlRaffle(data.raffleId);
    }
    const rawTickets = data.tickets || data.numbers || data.numeros || data.board || data.data?.tickets || [];
    state.board = normalizeBoard(rawTickets);
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
    removeUnavailableSelections();
    renderBoard();
    setPublicNotice("", "");
    return data;
  }

  async function loadBoard({preservePage = true} = {}) {
    const requestedId=currentRaffleId();
    const data=await getJson("board", {raffleId: requestedId});
    if(data?.ok && data.raffleId && data.raffleId!==requestedId) return loadPublicBootstrap(data.raffleId);
    return applyBoardData(data, {preservePage});
  }

  function updateStats() {
    const stats = state.stats;
    const soldPercent = stats.total ? Math.round((stats.sold / stats.total) * 100) : 0;

    setText("#heroSold", stats.sold ?? 0);
    setText("#heroAvailable", stats.available ?? 0);
  }
  function removeUnavailableSelections() {
    if (state.reservation || state.hold) return;
    const available = new Set(state.board.filter((item) => item.status === "DISPONIBLE").map((item) => item.number));
    let changed = false;
    [...state.selected].forEach((number) => {
      if (!available.has(number)) { state.selected.delete(number); changed = true; }
    });
    if (changed) updateSelection();
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
      const ownSelection = state.selected.has(item.number);
      const statusClass = statusClasses[item.status] || "blocked";
      button.type = "button";
      button.className = `ticket-button ${statusClass}${ownSelection ? " selected" : ""}`;
      button.innerHTML = `<strong>${escapeHtml(item.number)}</strong><small>${escapeHtml(statusLabel(item.status))}</small>`;
      button.title = `${item.number} · ${statusLabel(item.status)}`;
      button.setAttribute("aria-label", `${item.number}, ${statusLabel(item.status)}`);
      const selectable = item.status === "DISPONIBLE" && !state.reservation;
      button.disabled = !selectable && !ownSelection;
      button.addEventListener("click", () => toggleTicket(item.number));
      grid.appendChild(button);
    });
    qs("#ticketPageLabel").textContent = `Página ${state.page + 1} de ${totalPages}`;
    qs("#ticketPrevPage").disabled = state.page <= 0;
    qs("#ticketNextPage").disabled = state.page >= totalPages - 1;
  }
  function toggleTicket(number) {
    if (state.reservation) return;
    const item = state.board.find((ticket) => ticket.number === number);
    if (!state.selected.has(number) && item?.status !== "DISPONIBLE") return;
    if (state.selected.has(number)) state.selected.delete(number);
    else state.selected.add(number);
    updateSelection();
    renderBoard();
    scheduleHoldSync();
  }

  function selectionSignature() {
    return [...state.selected].sort((a,b) => Number(a)-Number(b)).join(",");
  }

  function scheduleHoldSync() {
    state.holdSyncRequested = true;
    if (state.holdSyncTimer) window.clearTimeout(state.holdSyncTimer);
    state.holdSyncTimer = window.setTimeout(() => syncTicketHold().catch((error) => {
      setPublicNotice(error.message, "error");
    }), 140);
  }

  async function syncTicketHold() {
    if (state.reservation) return state.hold;
    state.holdSyncRequested = true;
    if (state.isHolding) return state.hold;
    state.isHolding = true;
    try {
      while (state.holdSyncRequested && !state.reservation) {
        state.holdSyncRequested = false;
        const tickets = [...state.selected].sort((a,b) => Number(a)-Number(b));
        const signature = tickets.join(",");
        if (!tickets.length) {
          if (state.hold?.code) await cancelCurrentSelection();
          state.holdSignature = "";
          state.holdTickets.clear();
          continue;
        }
        const data = await postForm({
          action:"holdTickets",
          raffleId:currentRaffleId(),
          tickets,
          holdCode:state.hold?.code || ""
        });
        if (!data.ok) {
          if (data.unavailableTickets?.length) {
            data.unavailableTickets.forEach((number) => state.selected.delete(String(number)));
          }
          throw new Error(data.error || "No se pudo reservar temporalmente la selección.");
        }
        const previousHeld = new Set(state.holdTickets);
        const currentHeld = new Set((data.tickets || tickets).map(String));
        state.hold = {code:data.holdCode,expiresAt:data.expiresAt};
        state.holdSignature = [...currentHeld].sort((a,b)=>Number(a)-Number(b)).join(",");
        state.holdTickets = currentHeld;
        state.board = state.board.map((item) => {
          if (currentHeld.has(item.number)) return {...item,status:"RESERVADO",label:"Reservado por ti"};
          if (previousHeld.has(item.number) && item.status === "RESERVADO") return {...item,status:"DISPONIBLE",label:"Disponible"};
          return item;
        });
        updateSelection();
        renderBoard();
        if (signature !== selectionSignature()) state.holdSyncRequested = true;
      }
      return state.hold;
    } finally {
      state.isHolding = false;
      if (state.holdSyncRequested && !state.reservation) scheduleHoldSync();
    }
  }

  async function cancelCurrentSelection() {
    const code = state.reservation?.code || state.hold?.code;
    if (code) {
      try { await postForm({action:"cancelReservation",raffleId:currentRaffleId(),participationCode:code,holdCode:code}); }
      catch (error) { console.warn(error); }
    }
    state.hold = null;
    state.holdTickets.clear();
    state.holdSignature = "";
    const paymentSelect=qs("#paymentMethod");if(paymentSelect)paymentSelect.disabled=false;
    if (!state.reservation) state.selected.clear();
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
      const summary=qs("#paymentSummary");if(summary)summary.hidden=true;
      const details=qs("#paymentDetailsPanel");if(details)details.hidden=true;
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
    const method = selectedPaymentMethod();
    const type = method?.type || "";
    const canShowPayment = Boolean(method) && isTermsAccepted() && state.selected.size > 0;
    const summary = qs("#paymentSummary");
    const details = qs("#paymentDetailsPanel");
    if (summary) summary.hidden = !canShowPayment;
    if (details) details.hidden = !canShowPayment;
    ["#qrMethodPanel","#bankMethodPanel","#cashMethodPanel","#genericMethodPanel"].forEach((selector) => {
      const element = qs(selector); if (element) element.hidden = true;
    });
    if (canShowPayment) {
      setText("#paymentMethodTitle", method.label || "Método de pago");
      setText("#paymentInstructions", method.instructions || "Sigue las instrucciones y registra tu participación.");
      if (type === "QR") {
        const panel=qs("#qrMethodPanel"); if(panel)panel.hidden=false;
        const image=qs("#paymentQrImage");
        if(image){const fallback="assets/qr-pago.png";image.src=safeImageUrl(method.qrUrl || state.raffle.qrPaymentUrl,fallback);installImageFallback(image,fallback);}
      } else if (type === "TRANSFERENCIA_BANCARIA") {
        const panel=qs("#bankMethodPanel"); if(panel)panel.hidden=false;
        const fields = [
          ["#bankName",method.bankName],["#bankHolder",method.accountHolder],["#bankAccount",method.accountNumber],
          ["#bankAccountType",method.accountType],["#bankIdentity",method.identityNumber],["#bankCurrency",method.currency]
        ];
        fields.forEach(([selector,value])=>setText(selector,value||"No especificado"));
      } else if (type === "EFECTIVO") {
        const panel=qs("#cashMethodPanel"); if(panel)panel.hidden=false;
      } else {
        const panel=qs("#genericMethodPanel"); if(panel)panel.hidden=false;
      }
    }
    const proofField = qs("#proofField");
    const proofRequired = canShowPayment && type !== "EFECTIVO";
    if (proofField) proofField.hidden = !proofRequired;
    const proofReady = !proofRequired || !!qs("#paymentProof")?.files?.[0];
    if (canShowPayment && (state.reservation || state.hold)) startReservationCountdown();
    const canSubmit = canShowPayment && hasParticipantValues() && proofReady && Boolean(state.reservation);
    const submit = qs("#submitButton"); if (submit) submit.disabled = !canSubmit;
  }
  async function reserveTickets() {
    if (state.reservation || state.isReserving) return state.reservation;
    const person = validateParticipantFields();
    if (!state.hold || state.holdSignature !== selectionSignature()) await syncTicketHold();
    if (!state.hold || state.holdSignature !== selectionSignature()) throw new Error("No se pudieron reservar todos los tickets seleccionados. Intenta nuevamente.");
    state.isReserving = true;
    try {
      const data = await postForm({
        action: "reserve",
        raffleId: currentRaffleId(),
        tickets: [...state.selected],
        holdCode: state.hold?.code || "",
        ...person,
        city: person.department,
        paymentMethod: qs("#paymentMethod").value
      });
      if (!data.ok) {
        if (data.unavailableTickets?.length) throw new Error(`Ya no están disponibles: ${data.unavailableTickets.join(", ")}.`);
        throw new Error(data.error || "No se pudo crear la reserva.");
      }
      state.reservation = {code:data.participationCode,expiresAt:data.expiresAt};
      state.hold = null;
      const paymentSelect=qs("#paymentMethod");if(paymentSelect)paymentSelect.disabled=true;
      qs("#reservationMessage").hidden = false;
      qs("#reservationMessage").textContent = "Reserva confirmada. Completa el pago y envía tu comprobante antes de que termine el tiempo.";
      startReservationCountdown();
      state.holdTickets = new Set(state.selected);
      renderBoard();
      syncFormAvailability();
      return state.reservation;
    } finally {
      state.isReserving = false;
    }
  }
  async function tryAutoReserve() {
    if (!isTermsAccepted() || !selectedPaymentMethod() || !state.selected.size || !hasParticipantValues() || state.reservation) return;
    try {
      const status = qs("#reservationMessage");
      if (status) { status.hidden=false; status.textContent = "Confirmando reserva e iniciando el tiempo de pago…"; }
      await reserveTickets();
    } catch (error) {
      console.error(error);
      const status = qs("#reservationMessage");
      if (status) { status.hidden=false; status.textContent = error.message; }
    }
  }
  function startReservationCountdown() {
    if (state.reservationTimer) window.clearInterval(state.reservationTimer);
    const update = () => {
      const countdown=qs("#reservationCountdown");
      const timerSource=state.reservation || (selectedPaymentMethod() ? state.hold : null);
      if (!timerSource) { if(countdown)countdown.textContent="--:--"; return; }
      const expiration = parseDateInput(timerSource.expiresAt);
      const diff = (expiration ? expiration.getTime() : 0) - Date.now();
      if (diff <= 0) {
        window.clearInterval(state.reservationTimer);
        if(state.reservation)state.reservation=null;
        else state.hold=null;
        const paymentSelect=qs("#paymentMethod");if(paymentSelect)paymentSelect.disabled=false;
        state.selected.clear();
        if(countdown)countdown.textContent = "00:00";
        const message=qs("#reservationMessage");if(message){message.hidden=false;message.textContent = "La reserva venció. Selecciona nuevamente tus números.";}
        updateSelection();
        loadBoard().catch(() => {});
        syncFormAvailability();
        return;
      }
      const minutes = Math.floor(diff / 60000);
      const seconds = Math.floor((diff % 60000) / 1000);
      if(countdown)countdown.textContent = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
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
      const proofFile = qs("#paymentProof")?.files?.[0];
      const proofRequired = selectedPaymentType() !== "EFECTIVO";
      const proofData = proofRequired ? await readProof(proofFile) : {};
      state.proofFile = proofFile || null;
      if (!state.reservation) await reserveTickets();
      const data = await postForm({action:"confirmRegistration",raffleId:currentRaffleId(),participationCode:state.reservation.code,...proofData});
      if (!data.ok) throw new Error(data.error || "No se pudo confirmar la participación.");
      state.confirmation = data;
      state.lastRegisteredPhone = getParticipantValues().phone || data.phone || "";
      result.style.color = "#15834b";
      result.innerHTML = `<strong>Participación registrada correctamente.</strong><br>Revisa el estado de tus tickets con el número de WhatsApp que registraste.`;
      const lookupInput = qs("#lookupPhone");
      if (lookupInput && state.lastRegisteredPhone) lookupInput.value = state.lastRegisteredPhone;
      qs("#confirmationActions").hidden = false;
      state.reservation = null; state.hold = null; state.holdTickets.clear(); state.holdSignature = "";
      const paymentSelect=qs("#paymentMethod");if(paymentSelect)paymentSelect.disabled=false;
      if (state.reservationTimer) window.clearInterval(state.reservationTimer);
      state.selected.clear();
      qs("#participationForm").reset();
      qs("#participantFields").hidden = true;
      updateSelection(); syncFormAvailability(); await loadBoard();
    } catch (error) {
      console.error(error);
      result.style.color = "#b42318";
      result.textContent = publicErrorMessage(error,"No se pudo completar el registro en este momento. Intenta nuevamente.");
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

  async function showRegisteredTicketStatus() {
    const phone = String(state.lastRegisteredPhone || qs("#lookupPhone")?.value || "").trim();
    if (!phone) return;
    const input = qs("#lookupPhone");
    if (input) input.value = phone;
    qs("#consulta")?.scrollIntoView({behavior: "smooth", block: "start"});
    await lookupByPhone({preventDefault() {}});
  }

  function applyWinnersData(data) {
    if (!data?.ok) return data;
    const container = qs("#winnersGrid");
    if (!container) return data;
    container.innerHTML = "";
    const winners = data.winners || [];
    if (!winners.length) {
      container.innerHTML = '<article class="empty-card"><span>🏆</span><h3>¡El próximo ganador puedes ser tú!</h3><p>Participa y mantente atento a los resultados.</p></article>';
      return data;
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
    return data;
  }

  async function loadWinners() {
    return applyWinnersData(await getJson("winners", {raffleId: currentRaffleId()}));
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
    const available = state.board.filter((item) => item.status === "DISPONIBLE").map((item) => item.number);
    const requested = Math.max(1, Math.floor(Number(qs("#randomQuantity").value || 1)));
    const quantity = Math.min(requested, available.length);
    for (let index = available.length - 1; index > 0; index -= 1) {
      const random = Math.floor(Math.random() * (index + 1));
      [available[index], available[random]] = [available[random], available[index]];
    }
    state.selected.clear();
    available.slice(0, quantity).forEach((number) => state.selected.add(number));
    if (requested > available.length) qs("#reservationMessage").textContent = `Solo existen ${available.length} números disponibles.`;
    updateSelection(); renderBoard(); scheduleHoldSync();
  }
  async function loadPublicBootstrap(raffleId = currentRaffleId()) {
    const data = await getJson("bootstrap", {raffleId});
    if (!data?.ok) throw new Error(data?.error || "No se pudo cargar la página.");
    applyPublicRafflesData({ok:true,raffles:data.raffles||[],principalRaffleId:data.principalRaffleId});
    applyRaffleData(data.raffleData || {ok:true,raffle:data.raffle});
    applyBoardData(data.boardData || {ok:true,raffleId:currentRaffleId(),tickets:data.tickets||[]}, {preservePage:false});
    applyWinnersData(data.winnersData || {ok:true,winners:data.winners||[]});
    return data;
  }

  function setupEvents() {
    const on = (selector, event, handler) => { const element = qs(selector); if (element) element.addEventListener(event, handler); };
    on("#ticketPrevPage", "click", () => { state.page -= 1; renderBoard(); });
    on("#ticketNextPage", "click", () => { state.page += 1; renderBoard(); });
    on("#searchBoardTicket", "click", searchTicket);
    on("#randomTickets", "click", chooseRandomTickets);
    on("#refreshBoard", "click", () => loadBoard().catch((error) => setPublicNotice(error.message, "error")));
    on("#publicRaffleSelect", "change", (event) => switchPublicRaffle(event.target.value));
    on("#terms", "change", () => {syncFormAvailability();tryAutoReserve();});
    ["#fullName", "#phone", "#email", "#identityNumber", "#department"].forEach((selector) => {
      on(selector, "input", () => { syncFormAvailability(); tryAutoReserve(); });
      on(selector, "change", () => { syncFormAvailability(); tryAutoReserve(); });
    });
    on("#paymentMethod", "change", async () => { syncFormAvailability(); await tryAutoReserve(); });
    on("#paymentProof", "change", () => {
      const file = qs("#paymentProof")?.files?.[0];
      setText("#proofFileName", file ? `${file.name} · ${(file.size / 1024 / 1024).toFixed(2)} MB` : "Adjunta imagen o PDF del pago. Máximo 5 MB.");
      syncFormAvailability();
    });
    on("#participationForm", "submit", submitParticipation);
    on("#checkMyTickets", "click", () => { showRegisteredTicketStatus().catch(() => {}); });
    on("#phoneLookupForm", "submit", lookupByPhone);
    on("#closeWinnerModal", "click", () => qs("#winnerModal")?.close());
    on("#winnerModal", "click", (event) => {if (event.target === qs("#winnerModal")) qs("#winnerModal")?.close();});
    window.addEventListener("beforeunload", () => {
      if (!state.reservation && state.hold?.code && CONFIG.apiUrl && navigator.sendBeacon) {
        const body=new URLSearchParams({action:"cancelReservation",raffleId:currentRaffleId(),holdCode:state.hold.code,participationCode:state.hold.code});
        navigator.sendBeacon(CONFIG.apiUrl,body);
      }
    });
  }
  async function initialize() {
    const heroVideo = qs("#heroVideo") || qs(".hero-bg-video");
    if (heroVideo) {
      heroVideo.autoplay=true;heroVideo.loop=true;heroVideo.muted=true;heroVideo.defaultMuted=true;heroVideo.playsInline=true;heroVideo.volume=0;heroVideo.controls=false;
      heroVideo.setAttribute("muted", "");heroVideo.setAttribute("playsinline", "");heroVideo.setAttribute("webkit-playsinline", "");heroVideo.removeAttribute("controls");
      const playHeroVideo=()=>{if(!heroVideo.paused)return;const promise=heroVideo.play();if(promise?.catch)promise.catch(()=>{});};
      heroVideo.addEventListener("loadedmetadata",playHeroVideo,{once:true});heroVideo.addEventListener("canplay",playHeroVideo);heroVideo.addEventListener("ended",()=>{heroVideo.currentTime=0;playHeroVideo();});document.addEventListener("pointerdown",playHeroVideo,{once:true});document.addEventListener("visibilitychange",()=>{if(!document.hidden)playHeroVideo();});
      try{heroVideo.load();playHeroVideo();}catch{}
    }
    setupMenu(); setupEvents();
    state.board=[]; state.stats={total:0,sold:0,reserved:0,review:0,available:0,blocked:0};
    updateStats(); renderBoard(); syncFormAvailability();
    try {
      await loadPublicBootstrap(REQUESTED_RAFFLE_ID);
    } catch (error) {
      console.error(error);
      showNoActiveRaffle(error.message);
    }
    window.setInterval(async()=>{
      try{
        refreshTick += 1;
        if(!currentRaffleId()) await loadPublicBootstrap("");
        else {
          await loadBoard();
          if(refreshTick % 4 === 0) await loadWinners();
        }
      } catch(error){
        if(String(error?.message||error).toLowerCase().includes("no existe un sorteo activo"))showNoActiveRaffle(error.message);
        else setPublicNotice(error.message,"error");
      }
    },Math.max(10,Number(state.raffle?.publicRefreshSeconds||CONFIG.refreshSeconds||15))*1000);
  }


  const boot = () => initialize().catch((error) => {
    console.error(error);
    setPublicNotice(error.message || "No se pudo iniciar la página.", "error");
  });
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, {once:true});
  else boot();
})();
