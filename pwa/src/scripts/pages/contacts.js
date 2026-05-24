(() => {
  const routes = window.MovieTrackerRoutes;
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

  function renderPhoneIcon() {
    return `
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
        <path d="M5.3 2.75H3.95C3.26 2.75 2.75 3.31 2.88 3.98C3.56 7.44 5.25 10.68 7.77 13.2C10.29 15.72 13.53 17.41 16.99 18.09C17.66 18.22 18.22 17.71 18.22 17.02V15.67C18.22 15.1 17.84 14.59 17.29 14.44L14.44 13.67C13.95 13.53 13.43 13.68 13.08 14.04L11.84 15.28C9.79 14.33 7.64 12.18 6.69 10.13L7.93 8.89C8.29 8.53 8.44 8.01 8.3 7.52L7.53 4.67C7.38 4.12 6.87 3.74 6.3 3.74H5.3V2.75Z" stroke="currentColor" stroke-width="1.35" stroke-linecap="round" stroke-linejoin="round"></path>
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
            ${renderContactLink("tel:+79040093782", "Телефон", "+79040093782", renderPhoneIcon())}
          </div>
        </article>
      </section>

      ${renderAppFooter("2026", "contacts")}
    `;
  }

  function renderPage() {
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
  }

  initContactsPage();
})();
