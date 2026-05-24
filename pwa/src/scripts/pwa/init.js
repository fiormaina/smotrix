(() => {
  const INSTALL_PROMPT_DISMISS_KEY = "movieTracker.installPromptDismissed";
  let deferredInstallPrompt = null;

  function getProjectRootPath() {
    const pathname = window.location.pathname;
    const pagesMarker = "/pages/";

    if (pathname.includes(pagesMarker)) {
      return pathname.slice(0, pathname.indexOf(pagesMarker) + 1);
    }

    return pathname.replace(/[^/]*$/, "");
  }

  function resolveProjectUrl(path = "") {
    return new URL(path, `${window.location.origin}${getProjectRootPath()}`);
  }

  function isStandaloneMode() {
    return window.matchMedia?.("(display-mode: standalone)")?.matches || window.navigator.standalone === true;
  }

  function isMobileDevice() {
    if (window.navigator.userAgentData && typeof window.navigator.userAgentData.mobile === "boolean") {
      return window.navigator.userAgentData.mobile;
    }

    const userAgent = String(window.navigator.userAgent || "");
    if (/(Android|iPhone|iPad|iPod|Mobile)/i.test(userAgent)) {
      return true;
    }

    return Boolean(
      window.matchMedia?.("(max-width: 900px) and (pointer: coarse)")?.matches,
    );
  }

  function hasDismissedInstallPrompt() {
    try {
      return window.localStorage.getItem(INSTALL_PROMPT_DISMISS_KEY) === "1";
    } catch (error) {
      return false;
    }
  }

  function dismissInstallPrompt() {
    try {
      window.localStorage.setItem(INSTALL_PROMPT_DISMISS_KEY, "1");
    } catch (error) {
      console.warn(error);
    }
  }

  function getInstallCardElements() {
    return {
      actionButton: document.querySelector("[data-pwa-install-action]"),
      card: document.querySelector("[data-pwa-install-card]"),
    };
  }

  function getStatusBannerElements() {
    return {
      actionButton: document.querySelector("[data-pwa-status-action]"),
      banner: document.querySelector("[data-pwa-status-banner]"),
      text: document.querySelector("[data-pwa-status-text]"),
    };
  }

  function ensureChrome() {
    if (!document.body || document.querySelector("[data-pwa-chrome]")) return;

    document.body.insertAdjacentHTML(
      "afterbegin",
      `
        <div class="pwa-chrome" data-pwa-chrome>
          <section class="pwa-status-banner pwa-status-banner--hidden" data-pwa-status-banner>
            <div class="pwa-status-banner__content">
              <span class="pwa-status-banner__dot" aria-hidden="true"></span>
              <p class="pwa-status-banner__text" data-pwa-status-text></p>
            </div>
            <button class="pwa-status-banner__action" type="button" data-pwa-status-action>
              Проверить снова
            </button>
          </section>
          <section class="pwa-install-card pwa-install-card--hidden" data-pwa-install-card>
            <div class="pwa-install-card__copy">
              <strong>Установите Movie Tracker</strong>
              <p>Приложение будет открываться как отдельный экран и быстрее поднимать уже закэшированную оболочку.</p>
            </div>
            <div class="pwa-install-card__actions">
              <button class="pwa-install-card__button" type="button" data-pwa-install-action>
                Установить
              </button>
              <button class="pwa-install-card__dismiss" type="button" data-pwa-install-dismiss>
                Позже
              </button>
            </div>
          </section>
        </div>
      `,
    );

    document.body.addEventListener("click", handleChromeClick);
  }

  function updateInstallCard() {
    const { card } = getInstallCardElements();
    if (!card) return;

    const shouldShow =
      isMobileDevice() &&
      Boolean(deferredInstallPrompt) &&
      !isStandaloneMode() &&
      !hasDismissedInstallPrompt();
    card.classList.toggle("pwa-install-card--hidden", !shouldShow);
  }

  function updateStatusBanner(networkState) {
    const { banner, text } = getStatusBannerElements();
    if (!banner || !text) return;

    const mode = networkState?.mode ?? "checking";
    const shouldHideBanner = mode === "online" || mode === "checking";
    const messages = {
      checking: "Проверяем соединение с Movie Tracker API...",
      degraded: "Сервер сейчас недоступен. Попробуйте позже",
      offline: "Сети нет. Доступны только уже открытые и закэшированные экраны.",
      online: "",
    };

    banner.dataset.mode = mode;
    text.textContent = messages[mode] ?? messages.checking;
    banner.classList.toggle("pwa-status-banner--hidden", shouldHideBanner);
  }

  async function promptInstall() {
    if (!deferredInstallPrompt) return;

    deferredInstallPrompt.prompt();
    const outcome = await deferredInstallPrompt.userChoice;

    if (outcome?.outcome !== "accepted") {
      dismissInstallPrompt();
    }

    deferredInstallPrompt = null;
    updateInstallCard();
  }

  function handleChromeClick(event) {
    const installButton = event.target.closest("[data-pwa-install-action]");
    if (installButton) {
      promptInstall().catch((error) => console.error(error));
      return;
    }

    const dismissButton = event.target.closest("[data-pwa-install-dismiss]");
    if (dismissButton) {
      dismissInstallPrompt();
      updateInstallCard();
      return;
    }

    const refreshButton = event.target.closest("[data-pwa-status-action]");
    if (refreshButton) {
      window.MovieTrackerNetwork?.refresh?.();
    }
  }

  async function registerServiceWorker() {
    if (!("serviceWorker" in navigator)) return;

    try {
      const registration = await navigator.serviceWorker.register(resolveProjectUrl("service-worker.js"), {
        scope: getProjectRootPath(),
        updateViaCache: "none",
      });

      registration.addEventListener("updatefound", () => {
        const nextWorker = registration.installing;
        if (!nextWorker) return;

        nextWorker.addEventListener("statechange", () => {
          if (nextWorker.state === "installed" && navigator.serviceWorker.controller) {
            nextWorker.postMessage({ type: "SKIP_WAITING" });
          }
        });
      });

      navigator.serviceWorker.addEventListener("controllerchange", () => {
        window.location.reload();
      });

      await registration.update();
    } catch (error) {
      console.error("Service worker registration failed", error);
    }
  }

  function init() {
    ensureChrome();
    updateInstallCard();
    document.body.classList.toggle("app-standalone", isStandaloneMode());
    window.MovieTrackerNetwork?.subscribe?.(updateStatusBanner);
    registerServiceWorker();
  }

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredInstallPrompt = event;
    updateInstallCard();
  });

  window.addEventListener("appinstalled", () => {
    deferredInstallPrompt = null;
    updateInstallCard();
    document.body.classList.add("app-standalone");
  });

  window.addEventListener("resize", updateInstallCard);

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
