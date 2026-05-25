(() => {
  const { renderTabs } = window.MovieTrackerUI;
  const routes = window.MovieTrackerRoutes;
  const CURRENT_USER_STORAGE_KEY = "movieTracker.currentUser";
  const DEFAULT_AVATAR_KEY = "violet";
  const avatarPresets = Object.freeze({
    violet: {
      id: "violet",
      label: "Лиловый",
      background: "linear-gradient(135deg, #8c7fff, #6e53f4)",
      shadow: "0 12px 28px rgba(124, 92, 252, 0.26)",
    },
    ocean: {
      id: "ocean",
      label: "Океан",
      background: "linear-gradient(135deg, #5fd1ff, #3772ff)",
      shadow: "0 12px 28px rgba(55, 114, 255, 0.24)",
    },
    mint: {
      id: "mint",
      label: "Мята",
      background: "linear-gradient(135deg, #72e0b8, #2fa877)",
      shadow: "0 12px 28px rgba(47, 168, 119, 0.24)",
    },
    sunset: {
      id: "sunset",
      label: "Закат",
      background: "linear-gradient(135deg, #ffb36b, #f06a72)",
      shadow: "0 12px 28px rgba(240, 106, 114, 0.24)",
    },
    rose: {
      id: "rose",
      label: "Роза",
      background: "linear-gradient(135deg, #ff8dc7, #d9508f)",
      shadow: "0 12px 28px rgba(217, 80, 143, 0.24)",
    },
    graphite: {
      id: "graphite",
      label: "Графит",
      background: "linear-gradient(135deg, #7f8798, #30374a)",
      shadow: "0 12px 28px rgba(48, 55, 74, 0.28)",
    },
  });

  function getAvatarPreset(avatarKey = DEFAULT_AVATAR_KEY) {
    return avatarPresets[avatarKey] ?? avatarPresets[DEFAULT_AVATAR_KEY];
  }

  function getAvatarStyle(avatarKey = DEFAULT_AVATAR_KEY, size = 38) {
    const preset = getAvatarPreset(avatarKey);
    return [
      `--avatar-size:${size}px`,
      `--avatar-bg:${preset.background}`,
      `--avatar-shadow:${preset.shadow}`,
    ].join(";");
  }

  function readStoredCurrentUser() {
    try {
      const rawValue = window.localStorage.getItem(CURRENT_USER_STORAGE_KEY);
      return rawValue ? JSON.parse(rawValue) : null;
    } catch (error) {
      console.warn(error);
      return null;
    }
  }

  function getHeaderUser() {
    const foldersApi = window.MovieTrackerFolders;
    const fallbackUser = foldersApi?.currentUser ?? {};
    const storedUser = readStoredCurrentUser() ?? {};
    const stateUser =
      foldersApi?.readState?.()?.users?.[storedUser.id ?? fallbackUser.id] ?? {};

    return {
      ...fallbackUser,
      ...stateUser,
      ...storedUser,
    };
  }

  function renderUserAvatarIcon(size = 18) {
    return `
      <svg width="${size}" height="${size}" viewBox="0 0 20 20" fill="none" aria-hidden="true">
        <circle cx="10" cy="7" r="4" fill="rgba(255,255,255,0.92)"></circle>
        <path d="M2 18c0-4 3.6-7 8-7s8 3 8 7" stroke="rgba(255,255,255,0.92)" stroke-width="1.5" stroke-linecap="round"></path>
      </svg>
    `;
  }

  function renderUserAvatar({
    avatarKey = DEFAULT_AVATAR_KEY,
    avatarImage = "",
    size = 38,
    className = "",
    iconSize = Math.max(18, Math.round(size * 0.46)),
  } = {}) {
    const classes = ["user-avatar", className].filter(Boolean).join(" ");
    const imageMarkup = avatarImage
      ? `<img class="user-avatar__image" src="${avatarImage}" alt="" />`
      : renderUserAvatarIcon(iconSize);
    return `
      <span class="${classes}" style="${getAvatarStyle(avatarKey, size)}" aria-hidden="true">
        ${imageMarkup}
      </span>
    `;
  }

  function createPrimaryTabs(activeSection = "") {
    return [
      {
        label: "История просмотра",
        active: activeSection === "history",
        static: activeSection === "history",
        url: activeSection === "history" ? "" : routes.watchHistory,
      },
      {
        label: "Папки",
        active: activeSection === "folders",
        static: activeSection === "folders",
        url: activeSection === "folders" ? "" : routes.folders,
      },
    ];
  }

  function createSupportTabs(activeSection = "") {
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

  function renderFooterLinks(tabs) {
    return tabs
      .map((tab) => {
        const navAttribute = tab.url ? `data-nav-url="${tab.url}"` : "";
        const activeClass = tab.active ? "history-footer__link--active" : "";

        return `
          <button
            class="history-footer__link ${activeClass}"
            type="button"
            ${navAttribute}
            ${tab.active ? 'aria-current="page"' : ""}
          >
            ${tab.label}
          </button>
        `;
      })
      .join("");
  }

  function renderMobileMenu(tabs, supportTabs, profileUrl, profileActive) {
    const mobileTabs = [
      ...tabs,
      {
        label: "Профиль",
        active: profileActive,
        static: profileActive,
        url: profileActive ? "" : profileUrl,
      },
    ];

    return `
      <div class="history-page__mobile-menu-shell">
        <button
          class="history-page__menu-toggle"
          type="button"
          data-menu-toggle
          aria-expanded="false"
          aria-controls="history-mobile-menu"
          aria-label="Открыть меню"
        >
          <span></span>
          <span></span>
          <span></span>
        </button>
        <div class="history-page__mobile-menu" data-mobile-menu hidden>
          <button
            class="history-page__mobile-menu-backdrop"
            type="button"
            data-menu-close
            aria-label="Закрыть меню"
          ></button>
          <section
            class="history-page__mobile-menu-panel"
            id="history-mobile-menu"
            role="dialog"
            aria-modal="true"
            aria-label="Навигация по разделам"
          >
            <div class="history-page__mobile-menu-head">
              <strong class="history-page__mobile-menu-title">Навигация</strong>
              <button
                class="history-page__mobile-menu-close"
                type="button"
                data-menu-close
                aria-label="Закрыть меню"
              >
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
                  <path d="M4.5 4.5L13.5 13.5M13.5 4.5L4.5 13.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"></path>
                </svg>
              </button>
            </div>
            <nav class="history-page__mobile-menu-nav" aria-label="Мобильная навигация">
              ${renderTabs(mobileTabs)}
              <div class="history-page__mobile-menu-group" aria-label="Информация о проекте">
                ${renderTabs(supportTabs)}
              </div>
            </nav>
          </section>
        </div>
      </div>
    `;
  }

  function renderAppHeader({
    tabs = createPrimaryTabs(),
    supportTabs = createSupportTabs(),
    profileUrl = routes.profile(),
    profileActive = false,
  } = {}) {
    const headerUser = getHeaderUser();
    return `
      <header class="history-page__navbar">
        <div class="history-page__logo" aria-hidden="true"></div>
        <nav class="history-page__tabs history-page__tabs--desktop" aria-label="Навигация по разделам">
          ${renderTabs(tabs)}
        </nav>
        <button
          class="history-page__avatar history-page__avatar--desktop ${profileActive ? "history-page__avatar--active" : ""}"
          type="button"
          data-nav-url="${profileUrl}"
          aria-label="Открыть профиль"
        >
          ${renderUserAvatar({
            avatarKey: headerUser.avatarKey,
            avatarImage: headerUser.avatarImage,
            size: 38,
            className: "history-page__avatar-visual",
            iconSize: 18,
          })}
        </button>
        ${renderMobileMenu(tabs, supportTabs, profileUrl, profileActive)}
      </header>
    `;
  }

  function renderAppFooter(year = "2026", activeSupportSection = "") {
    return `
      <footer class="history-footer">
        <div class="history-footer__links">
          ${renderFooterLinks(createSupportTabs(activeSupportSection))}
        </div>
        <div class="history-footer__year">${year}</div>
      </footer>
    `;
  }

  function renderBackLink(className, label, url) {
    return `
      <a class="${className}" href="${url}" data-nav-url="${url}">
        <svg width="16" height="16" viewBox="0 0 18 18" fill="none" aria-hidden="true">
          <path d="M11 4L6 9L11 14" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"></path>
        </svg>
        ${label}
      </a>
    `;
  }

  window.MovieTrackerAppShell = {
    createPrimaryTabs,
    createSupportTabs,
    renderAppFooter,
    renderAppHeader,
    renderBackLink,
    renderUserAvatar,
    renderUserAvatarIcon,
    avatarPresets,
    defaultAvatarKey: DEFAULT_AVATAR_KEY,
    getAvatarPreset,
  };
})();
