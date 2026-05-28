(() => {
  const routes = window.MovieTrackerRoutes;
  const { hasAuthenticatedSession, navigateToPage } = window.MovieTrackerUI;
  const { createPrimaryTabs, renderAppFooter, renderAppHeader } = window.MovieTrackerAppShell;

  function createSupportTabs(activeSection = "") {
    if (typeof window.MovieTrackerAppShell.createSupportTabs === "function") {
      return window.MovieTrackerAppShell.createSupportTabs(activeSection);
    }

    return [
      {
        label: "О проекте",
        active: activeSection === "about",
        static: activeSection === "about",
        url: activeSection === "about" ? "" : routes.about,
      },
      {
        label: "Контакты",
        active: activeSection === "contacts",
        static: activeSection === "contacts",
        url: activeSection === "contacts" ? "" : routes.contacts,
      },
    ];
  }

  function renderPageContent() {
    return `
      <section class="history-heading" aria-label="О проекте Смотрикс">
        <div>
          <h2 class="history-heading__title">О проекте</h2>
        </div>
      </section>

      <section class="info-page__section" aria-label="Описание проекта">
        <article class="info-card">
          <div class="info-card__text">
            <p>Платформа "Смотрикс" помогает сохранять фильмы, сериалы и видео, которые вы смотрите, в одном удобном месте. Больше не нужно вспоминать, на какой платформе вы видели нужный фильм или как назывался сериал, который начали смотреть неделю назад.</p>
            <p>Вы можете вести личную историю просмотров, добавлять материалы вручную, распределять их по папкам и быстро возвращаться к интересному контенту. Это удобно, если вы смотрите видео на разных сайтах и хотите держать всё под рукой.</p>
            <p>С помощью браузерного расширения часть просмотров может сохраняться автоматически: сервис определяет информацию о видео и добавляет её в вашу медиатеку. А если нужный материал не был найден автоматически, его всегда можно добавить самостоятельно.</p>
            <p>Также вы можете создавать собственные подборки, делиться ими и находить интересные материалы у других пользователей.</p>
          </div>
        </article>
      </section>

      ${renderAppFooter("2026", "about")}
    `;
  }

  function renderGuestInfoModal() {
    return `
      <div class="info-page__guest-backdrop">
        <section class="modal-card info-page__guest-modal" role="dialog" aria-modal="true" aria-label="О проекте">
          <button class="modal-card__close" type="button" data-action="close-guest-info" aria-label="Закрыть">
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
              <path d="M4.5 4.5L13.5 13.5M13.5 4.5L4.5 13.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"></path>
            </svg>
          </button>
          <h2 class="modal-card__title">О проекте</h2>
          <div class="modal-card__body">
            <div class="info-card info-card--modal">
              <div class="info-card__text">
                <p>Платформа "Смотрикс" помогает сохранять фильмы, сериалы и видео, которые вы смотрите, в одном удобном месте.</p>
                <p>Вы можете вести личную историю просмотров, добавлять материалы вручную, распределять их по папкам и быстро возвращаться к интересному контенту.</p>
                <p>С помощью браузерного расширения часть просмотров может сохраняться автоматически, а нужный материал всегда можно добавить самостоятельно.</p>
                <p>После входа в аккаунт вам будут доступны все разделы приложения и полная навигация.</p>
              </div>
            </div>
          </div>
        </section>
      </div>
    `;
  }

  function renderPage() {
    if (!hasAuthenticatedSession()) {
      return `
        <div class="history-page info-page info-page--guest info-page--about">
          <h1 class="sr-only">Страница о проекте Смотрикс</h1>
          <div class="history-page__shell">
            <div class="history-page__content">
              ${renderGuestInfoModal()}
            </div>
          </div>
        </div>
      `;
    }

    return `
      <div class="history-page info-page info-page--about">
        <h1 class="sr-only">Страница о проекте Смотрикс</h1>
        <div class="history-page__shell">
          ${renderAppHeader({
            tabs: createPrimaryTabs(),
            supportTabs: createSupportTabs("about"),
          })}
          <div class="history-page__content">
            ${renderPageContent()}
          </div>
        </div>
      </div>
    `;
  }

  function initAboutPage() {
    const rootElement = document.querySelector("#about-app");
    if (!rootElement) return;
    rootElement.innerHTML = renderPage();
    rootElement.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (
        target.closest("[data-action='close-guest-info']") ||
        target.classList.contains("info-page__guest-backdrop")
      ) {
        navigateToPage(routes.home);
      }
    });
  }

  initAboutPage();
})();
