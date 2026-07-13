(() => {
  "use strict";

  const CONFIG = window.UTOPIA_CONFIG || {};
  const DEFAULT_DRAW_DATE = "2026-07-17T20:00:00-04:00";
  const MAX_PROOF_BYTES = 5 * 1024 * 1024;

  const qs = (selector) => document.querySelector(selector);
  const qsa = (selector) => [...document.querySelectorAll(selector)];

  const state = {
    prizes: [],
    winners: []
  };

  let countdownTimer = null;

  const prizeLabels = {
    "PREMIO-001": "Primer premio",
    "PREMIO-002": "Segundo premio",
    "PREMIO-003": "Tercer premio"
  };

  function buildUrl(action, params = {}) {
    const url = new URL(CONFIG.apiUrl);

    url.searchParams.set("action", action);

    Object.entries(params).forEach(([key, value]) => {
      if (
        value !== undefined &&
        value !== null &&
        value !== ""
      ) {
        url.searchParams.set(key, value);
      }
    });

    return url.toString();
  }

  async function getJson(action, params = {}) {
    const response = await fetch(
      buildUrl(action, params),
      {
        method: "GET",
        cache: "no-store",
        redirect: "follow"
      }
    );

    if (!response.ok) {
      throw new Error(
        `Error ${response.status}`
      );
    }

    return response.json();
  }

  async function postForm(payload) {
    const form = new URLSearchParams();

    Object.entries(payload).forEach(
      ([key, value]) => {
        form.set(
          key,
          Array.isArray(value)
            ? JSON.stringify(value)
            : String(value ?? "")
        );
      }
    );

    const response = await fetch(
      CONFIG.apiUrl,
      {
        method: "POST",
        headers: {
          "Content-Type":
            "application/x-www-form-urlencoded;charset=UTF-8"
        },
        body: form.toString(),
        redirect: "follow"
      }
    );

    if (!response.ok) {
      throw new Error(
        `Error ${response.status}`
      );
    }

    return response.json();
  }

  function startCountdown(
    dateInput = DEFAULT_DRAW_DATE
  ) {
    const target =
      new Date(dateInput).getTime();

    if (!Number.isFinite(target)) {
      return;
    }

    if (countdownTimer) {
      window.clearInterval(
        countdownTimer
      );
    }

    const update = () => {
      const difference = Math.max(
        0,
        target - Date.now()
      );

      const values = {
        days: Math.floor(
          difference / 86400000
        ),

        hours: Math.floor(
          (difference % 86400000) /
            3600000
        ),

        minutes: Math.floor(
          (difference % 3600000) /
            60000
        ),

        seconds: Math.floor(
          (difference % 60000) /
            1000
        )
      };

      Object.entries(values).forEach(
        ([id, value]) => {
          const element =
            qs(`#${id}`);

          if (element) {
            element.textContent =
              String(value).padStart(
                2,
                "0"
              );
          }
        }
      );
    };

    update();

    countdownTimer =
      window.setInterval(
        update,
        1000
      );
  }

  function createRollingNumbers() {
    const track =
      qs("#rollingTrack");

    if (!track) {
      return;
    }

    track.innerHTML = "";

    for (
      let i = 0;
      i < 48;
      i += 1
    ) {
      const digit =
        document.createElement(
          "span"
        );

      digit.className =
        "rolling-digit";

      digit.textContent =
        Math.floor(
          Math.random() * 10
        );

      track.appendChild(digit);

      const speed =
        150 +
        Math.floor(
          Math.random() * 360
        );

      window.setInterval(() => {
        digit.classList.remove(
          "flip"
        );

        void digit.offsetWidth;

        digit.classList.add(
          "flip"
        );

        window.setTimeout(() => {
          digit.textContent =
            Math.floor(
              Math.random() * 10
            );
        }, 80);
      }, speed);
    }
  }

  function setupMenu() {
    const button =
      qs("#menuButton");

    const nav =
      qs("#nav");

    if (!button || !nav) {
      return;
    }

    button.addEventListener(
      "click",
      () => {
        const open =
          nav.classList.toggle(
            "open"
          );

        button.setAttribute(
          "aria-expanded",
          String(open)
        );
      }
    );

    qsa("#nav a").forEach(
      (link) => {
        link.addEventListener(
          "click",
          () => {
            nav.classList.remove(
              "open"
            );

            button.setAttribute(
              "aria-expanded",
              "false"
            );
          }
        );
      }
    );
  }

  function applyPrizeStatuses(
    prizes
  ) {
    state.prizes = prizes;

    prizes.forEach((prize) => {
      const status = qs(
        `#status-${prize.id}`
      );

      if (!status) {
        return;
      }

      if (prize.winner) {
        status.textContent =
          `Ganador: ticket ${prize.winner.ticket}`;

        status.classList.add(
          "has-winner"
        );
      } else {
        status.textContent =
          "Consultar ganador →";

        status.classList.remove(
          "has-winner"
        );
      }
    });
  }

  async function loadRaffle() {
    try {
      const data = await getJson(
        "raffle",
        {
          raffleId:
            CONFIG.raffleId
        }
      );

      if (!data.ok) {
        return;
      }

      const raffle = data.raffle;

      if (qs("#ticketPrice")) {
        qs(
          "#ticketPrice"
        ).textContent =
          `${new Intl.NumberFormat(
            "es-BO"
          ).format(
            raffle.ticketPrice
          )} ${raffle.currency}`;
      }

      if (raffle.drawDate) {
        startCountdown(
          raffle.drawDate
        );

        const date =
          new Date(
            raffle.drawDate
          );

        const formattedDate =
          new Intl.DateTimeFormat(
            "es-BO",
            {
              day: "2-digit",
              month: "2-digit",
              year: "numeric"
            }
          ).format(date);

        const formattedTime =
          new Intl.DateTimeFormat(
            "es-BO",
            {
              hour: "2-digit",
              minute: "2-digit",
              hour12: false
            }
          ).format(date);

        if (qs("#drawDate")) {
          qs(
            "#drawDate"
          ).textContent =
            formattedDate;
        }

        if (
          qs("#countdownDateTime")
        ) {
          qs(
            "#countdownDateTime"
          ).textContent =
            `${formattedDate} a las ${formattedTime}`;
        }
      }

      applyPrizeStatuses(
        raffle.prizes || []
      );
    } catch (error) {
      console.error(error);
    }
  }

  function formatWinnerDate(
    value
  ) {
    if (!value) {
      return "—";
    }

    return new Intl.DateTimeFormat(
      "es-BO",
      {
        dateStyle: "long",
        timeStyle: "short"
      }
    ).format(
      new Date(value)
    );
  }

  async function openWinner(
    prizeId
  ) {
    const modal =
      qs("#winnerModal");

    const prize =
      state.prizes.find(
        (item) =>
          item.id === prizeId
      );

    const fallback = qs(
      `[data-prize-id="${prizeId}"] h3`
    );

    if (
      qs("#modalPrizeOrder")
    ) {
      qs(
        "#modalPrizeOrder"
      ).textContent =
        prizeLabels[prizeId] ||
        "Resultado del premio";
    }

    if (
      qs("#modalPrizeName")
    ) {
      qs(
        "#modalPrizeName"
      ).textContent =
        prize?.name ||
        fallback?.textContent ||
        "Premio";
    }

    if (qs("#winnerLoading")) {
      qs(
        "#winnerLoading"
      ).hidden = false;
    }

    if (qs("#winnerData")) {
      qs(
        "#winnerData"
      ).hidden = true;
    }

    if (qs("#noWinner")) {
      qs(
        "#noWinner"
      ).hidden = true;
    }

    if (
      modal &&
      typeof modal.showModal ===
        "function"
    ) {
      modal.showModal();
    } else if (modal) {
      modal.setAttribute(
        "open",
        ""
      );
    }

    try {
      const data = await getJson(
        "winner",
        {
          prizeId
        }
      );

      if (
        qs("#winnerLoading")
      ) {
        qs(
          "#winnerLoading"
        ).hidden = true;
      }

      if (
        !data.ok ||
        !data.winner
      ) {
        if (qs("#noWinner")) {
          qs(
            "#noWinner"
          ).hidden = false;
        }

        if (
          qs("#noWinner strong")
        ) {
          qs(
            "#noWinner strong"
          ).textContent =
            "¡El próximo ganador puedes ser tú!";
        }

        if (
          qs("#noWinner p")
        ) {
          qs(
            "#noWinner p"
          ).textContent =
            "Participa y mantente atento a los resultados oficiales.";
        }

        return;
      }

      const winner =
        data.winner;

      if (qs("#modalTicket")) {
        qs(
          "#modalTicket"
        ).textContent =
          winner.ticket;
      }

      if (
        qs("#modalWinnerName")
      ) {
        qs(
          "#modalWinnerName"
        ).textContent =
          winner.fullName;
      }

      if (
        qs("#modalIdentity")
      ) {
        qs(
          "#modalIdentity"
        ).textContent =
          winner.identityNumber;
      }

      if (qs("#modalPhone")) {
        qs(
          "#modalPhone"
        ).textContent =
          winner.phone;
      }

      if (qs("#modalCode")) {
        qs(
          "#modalCode"
        ).textContent =
          winner.participationCode;
      }

      if (qs("#modalDate")) {
        qs(
          "#modalDate"
        ).textContent =
          formatWinnerDate(
            winner.drawDate
          );
      }

      if (qs("#winnerData")) {
        qs(
          "#winnerData"
        ).hidden = false;
      }
    } catch (error) {
      console.error(error);

      if (
        qs("#winnerLoading")
      ) {
        qs(
          "#winnerLoading"
        ).hidden = true;
      }

      if (qs("#noWinner")) {
        qs(
          "#noWinner"
        ).hidden = false;
      }

      if (
        qs("#noWinner strong")
      ) {
        qs(
          "#noWinner strong"
        ).textContent =
          "¡El próximo ganador puedes ser tú!";
      }

      if (qs("#noWinner p")) {
        qs(
          "#noWinner p"
        ).textContent =
          "Participa y mantente atento a los resultados oficiales.";
      }
    }
  }

  function setupPrizeCards() {
    qsa(".prize-card").forEach(
      (card) => {
        card.addEventListener(
          "click",
          () => {
            openWinner(
              card.dataset.prizeId
            );
          }
        );
      }
    );

    qs(
      "#closeWinnerModal"
    )?.addEventListener(
      "click",
      () => {
        qs(
          "#winnerModal"
        )?.close();
      }
    );

    qs(
      "#winnerModal"
    )?.addEventListener(
      "click",
      (event) => {
        if (
          event.target ===
          qs("#winnerModal")
        ) {
          qs(
            "#winnerModal"
          ).close();
        }
      }
    );
  }

  async function loadWinners() {
    const container =
      qs("#winnersGrid");

    if (!container) {
      return;
    }

    try {
      const data = await getJson(
        "winners",
        {
          raffleId:
            CONFIG.raffleId
        }
      );

      if (!data.ok) {
        return;
      }

      state.winners =
        data.winners || [];

      container.innerHTML = "";

      if (
        !state.winners.length
      ) {
        container.innerHTML = `
          <article class="empty-winner">
            <span>🏆</span>

            <h3>
              ¡El próximo ganador puedes ser tú!
            </h3>

            <p>
              Participa y mantente atento a los resultados oficiales.
            </p>
          </article>
        `;

        return;
      }

      state.winners
        .sort(
          (a, b) =>
            Number(a.order || 0) -
            Number(b.order || 0)
        )
        .forEach((winner) => {
          const card =
            document.createElement(
              "article"
            );

          card.className =
            "winner-card";

          card.innerHTML = `
            <div class="winner-number">
              ${escapeHtml(
                winner.ticket
              )}
            </div>

            <small>
              ${escapeHtml(
                prizeLabels[
                  winner.prizeId
                ] || "Premio"
              )}
            </small>

            <h3>
              ${escapeHtml(
                winner.prizeName
              )}
            </h3>

            <dl>
              <div>
                <dt>Ganador</dt>
                <dd>
                  ${escapeHtml(
                    winner.fullName
                  )}
                </dd>
              </div>

              <div>
                <dt>Cédula</dt>
                <dd>
                  ${escapeHtml(
                    winner.identityNumber
                  )}
                </dd>
              </div>

              <div>
                <dt>Celular</dt>
                <dd>
                  ${escapeHtml(
                    winner.phone
                  )}
                </dd>
              </div>

              <div>
                <dt>Código</dt>
                <dd>
                  ${escapeHtml(
                    winner.participationCode
                  )}
                </dd>
              </div>
            </dl>
          `;

          container.appendChild(
            card
          );
        });

      applyPrizeStatuses(
        state.prizes.map(
          (prize) => ({
            ...prize,

            winner:
              state.winners.find(
                (winner) =>
                  winner.prizeId ===
                  prize.id
              ) ||
              prize.winner
          })
        )
      );
    } catch (error) {
      console.error(error);
    }
  }

  function setupPaymentMethod() {
    const select =
      qs("#paymentMethod");

    const panel =
      qs("#qrPaymentPanel");

    const proof =
      qs("#paymentProof");

    if (
      !select ||
      !panel ||
      !proof
    ) {
      return;
    }

    const update = () => {
      const show =
        select.value === "QR";

      panel.hidden = !show;

      if (!show) {
        proof.value = "";
      }
    };

    select.addEventListener(
      "change",
      update
    );

    proof.addEventListener(
      "change",
      () => {
        const file =
          proof.files?.[0];

        const fileName =
          qs("#proofFileName");

        if (!fileName) {
          return;
        }

        fileName.textContent =
          file
            ? `${file.name} · ${(
                file.size /
                1024 /
                1024
              ).toFixed(2)} MB`
            : "Formatos permitidos: JPG, PNG, WEBP o PDF. Máximo 5 MB.";
      }
    );

    update();
  }

  function parseTickets(raw) {
    return [
      ...new Set(
        raw
          .split(",")
          .map(
            (ticket) =>
              ticket.trim()
          )
          .filter(Boolean)
      )
    ];
  }

  function readProof(file) {
    return new Promise(
      (resolve, reject) => {
        if (!file) {
          reject(
            new Error(
              "Adjunta el comprobante de pago."
            )
          );

          return;
        }

        if (
          file.size >
          MAX_PROOF_BYTES
        ) {
          reject(
            new Error(
              "El comprobante supera el máximo de 5 MB."
            )
          );

          return;
        }

        const allowed = [
          "image/jpeg",
          "image/png",
          "image/webp",
          "application/pdf"
        ];

        if (
          !allowed.includes(
            file.type
          )
        ) {
          reject(
            new Error(
              "El comprobante debe ser JPG, PNG, WEBP o PDF."
            )
          );

          return;
        }

        const reader =
          new FileReader();

        reader.onerror = () => {
          reject(
            new Error(
              "No se pudo leer el comprobante."
            )
          );
        };

        reader.onload = () => {
          const dataUrl =
            String(
              reader.result || ""
            );

          resolve({
            proofName: file.name,
            proofMime: file.type,
            proofBase64:
              dataUrl.includes(",")
                ? dataUrl.split(",")[1]
                : dataUrl
          });
        };

        reader.readAsDataURL(file);
      }
    );
  }

  function setupParticipation() {
    const form =
      qs("#participationForm");

    const button =
      qs("#submitButton");

    const result =
      qs("#formResult");

    if (
      !form ||
      !button ||
      !result
    ) {
      return;
    }

    form.addEventListener(
      "submit",
      async (event) => {
        event.preventDefault();

        result.textContent = "";

        const tickets =
          parseTickets(
            qs("#tickets").value
          );

        if (!tickets.length) {
          result.style.color =
            "#b42318";

          result.textContent =
            "Ingresa al menos un ticket.";

          return;
        }

        if (
          qs("#paymentMethod")
            .value !== "QR"
        ) {
          result.style.color =
            "#b42318";

          result.textContent =
            "Selecciona el pago mediante QR.";

          return;
        }

        button.disabled = true;

        button.textContent =
          "Enviando participación y comprobante...";

        try {
          const proofData =
            await readProof(
              qs("#paymentProof")
                .files?.[0]
            );

          const data =
            await postForm({
              action: "register",

              raffleId:
                CONFIG.raffleId,

              tickets,

              fullName:
                qs(
                  "#fullName"
                ).value.trim(),

              identityNumber:
                qs(
                  "#identityNumber"
                ).value.trim(),

              phone:
                qs(
                  "#phone"
                ).value.trim(),

              city:
                qs(
                  "#city"
                ).value.trim(),

              paymentMethod:
                "QR",

              notes: "",

              ...proofData
            });

          if (!data.ok) {
            result.style.color =
              "#b42318";

            result.textContent =
              data
                .duplicatedTickets
                ?.length
                ? `Los siguientes tickets ya están ocupados: ${data.duplicatedTickets.join(
                    ", "
                  )}.`
                : data.error ||
                  "No se pudo registrar la participación.";

            return;
          }

          result.style.color =
            "#15834b";

          result.innerHTML =
            `Participación y comprobante enviados correctamente. ` +
            `Tu código es <strong>${escapeHtml(
              data.participationCode
            )}</strong>.`;

          form.reset();

          if (
            qs("#qrPaymentPanel")
          ) {
            qs(
              "#qrPaymentPanel"
            ).hidden = true;
          }

          if (
            qs("#proofFileName")
          ) {
            qs(
              "#proofFileName"
            ).textContent =
              "Formatos permitidos: JPG, PNG, WEBP o PDF. Máximo 5 MB.";
          }
        } catch (error) {
          console.error(error);

          result.style.color =
            "#b42318";

          result.textContent =
            error.message ||
            "No se pudo enviar la participación.";
        } finally {
          button.disabled = false;

          button.textContent =
            "Registrar participación y enviar comprobante";
        }
      }
    );
  }

  function setupTicketSearch() {
    const form =
      qs("#ticketSearchForm");

    const output =
      qs("#ticketSearchResult");

    const button =
      qs("#ticketSearchButton");

    if (
      !form ||
      !output ||
      !button
    ) {
      return;
    }

    form.addEventListener(
      "submit",
      async (event) => {
        event.preventDefault();

        output.hidden = true;
        output.innerHTML = "";

        button.disabled = true;

        try {
          const data =
            await getJson(
              "ticket",
              {
                raffleId:
                  CONFIG.raffleId,

                ticket:
                  qs(
                    "#ticketSearchInput"
                  ).value.trim(),

                phone:
                  qs(
                    "#ticketPhoneInput"
                  ).value.trim()
              }
            );

          output.hidden = false;

          if (!data.ok) {
            output.innerHTML =
              `<article>` +
              `${escapeHtml(
                data.error ||
                "Los datos ingresados no coinciden."
              )}` +
              `</article>`;

            return;
          }

          output.innerHTML = `
            <article>
              Ticket
              <strong>
                ${escapeHtml(
                  data.ticket.number
                )}
              </strong>
              <br>

              Participante:
              ${escapeHtml(
                data.ticket.fullName
              )}
              <br>

              Estado:
              <strong>
                ${escapeHtml(
                  data.ticket.status
                )}
              </strong>
              <br>

              Código:
              ${escapeHtml(
                data.ticket
                  .participationCode
              )}
            </article>
          `;
        } catch (error) {
          console.error(error);

          output.hidden = false;

          output.innerHTML =
            "<article>No fue posible realizar la consulta en este momento.</article>";
        } finally {
          button.disabled = false;
        }
      }
    );
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll(
        "&",
        "&amp;"
      )
      .replaceAll(
        "<",
        "&lt;"
      )
      .replaceAll(
        ">",
        "&gt;"
      )
      .replaceAll(
        '"',
        "&quot;"
      )
      .replaceAll(
        "'",
        "&#039;"
      );
  }

  startCountdown(
    DEFAULT_DRAW_DATE
  );

  createRollingNumbers();

  setupMenu();

  setupPrizeCards();

  setupPaymentMethod();

  setupParticipation();

  setupTicketSearch();

  loadRaffle();

  loadWinners();

  window.setInterval(
    loadWinners,
    Math.max(
      5,
      Number(
        CONFIG.refreshSeconds ||
          10
      )
    ) * 1000
  );
})();
