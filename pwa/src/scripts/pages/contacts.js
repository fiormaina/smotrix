(() => {
  const routes = window.MovieTrackerRoutes;
  const { hasAuthenticatedSession, navigateToPage } = window.MovieTrackerUI;
  const {
    createPrimaryTabs,
    renderAppFooter,
    renderAppHeader,
    renderUserAvatar,
  } = window.MovieTrackerAppShell;

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

  function renderMailIcon() {
    return `
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
        <rect x="2.25" y="4" width="13.5" height="10" rx="2.2" stroke="currentColor" stroke-width="1.5"></rect>
        <path d="M3.5 5.5L9 9.75L14.5 5.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"></path>
      </svg>
    `;
  }

  function renderContactLink(href, label, value, iconMarkup) {
    return `
      <a class="contact-card__link" href="${href}">
        <span class="contact-card__icon" aria-hidden="true">
          ${iconMarkup}
        </span>
        <span class="contact-card__meta">
          <span class="contact-card__label">${label}</span>
          <span class="contact-card__value">${value}</span>
        </span>
      </a>
    `;
  }

  function renderPageContent() {
    return `
      <section class="history-heading" aria-label="Контакты проекта">
        <div>
          <h2 class="history-heading__title">Контакты</h2>
        </div>
      </section>

      <section class="info-page__section" aria-label="Контакты создателя">
        <article class="contact-card">
          <div class="contact-card__hero">
            ${renderUserAvatar({
              size: 78,
              className: "contact-card__avatar",
              iconSize: 30,
            })}
            <div>
              <p class="contact-card__lead">Привет! Меня зовут Фомина Ирина и я создатель Смотрикса. Связаться со мной:</p>
            </div>
          </div>
          <div class="contact-card__methods">
            ${renderContactLink("mailto:fomina.irina.tver@gmail.com", "Почта", "fomina.irina.tver@gmail.com", renderMailIcon())}
          </div>
        </article>
      </section>

      ${renderAppFooter("2026", "contacts")}
    `;
  }

  function renderGuestInfoModal() {
    return `
      <div class="info-page__guest-backdrop">
        <section class="modal-card info-page__guest-modal" role="dialog" aria-modal="true" aria-label="Контакты">
          <button class="modal-card__close" type="button" data-action="close-guest-info" aria-label="Закрыть">
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
              <path d="M4.5 4.5L13.5 13.5M13.5 4.5L4.5 13.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"></path>
            </svg>
          </button>
          <h2 class="modal-card__title">Контакты</h2>
          <div class="modal-card__body">
            <article class="contact-card contact-card--modal">
              <div class="contact-card__hero">
                ${renderUserAvatar({
                  size: 78,
                  className: "contact-card__avatar",
                  iconSize: 30,
                })}
                <div>
                  <p class="contact-card__lead">Привет! Меня зовут Фомина Ирина и я создатель Смотрикса.</p>
                </div>
              </div>
              <div class="contact-card__methods">
                ${renderContactLink("mailto:fomina.irina.tver@gmail.com", "Почта", "fomina.irina.tver@gmail.com", renderMailIcon())}
              </div>
            </article>
          </div>
        </section>
      </div>
    `;
  }

  function renderPage() {
    if (!hasAuthenticatedSession()) {
      return `
        <div class="history-page info-page info-page--guest info-page--contacts">
          <h1 class="sr-only">Страница контактов Смотрикс</h1>
          <div class="history-page__shell">
            <div class="history-page__content">
              ${renderGuestInfoModal()}
            </div>
          </div>
        </div>
      `;
    }

    return `
      <div class="history-page info-page info-page--contacts">
        <h1 class="sr-only">Страница контактов Смотрикс</h1>
        <div class="history-page__shell">
          ${renderAppHeader({
            tabs: createPrimaryTabs(),
            supportTabs: createSupportTabs("contacts"),
          })}
          <div class="history-page__content">
            ${renderPageContent()}
          </div>
        </div>
      </div>
    `;
  }

  function initContactsPage() {
    const rootElement = document.querySelector("#contacts-app");
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

  initContactsPage();
})();
