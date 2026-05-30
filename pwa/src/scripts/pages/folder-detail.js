(() => {
  const {
    ensureAuthenticatedPageAccess,
    escapeHtml,
    navigateToPage,
    renderModalShell,
    renderToasts,
    writeClipboardText,
  } = window.MovieTrackerUI;
  const { createToastController } = window.MovieTrackerHelpers;
  const {
    createPrimaryTabs,
    renderAppHeader,
    renderBackLink: renderShellBackLink,
  } = window.MovieTrackerAppShell;
  const {
    addItemToFolder,
    currentUser,
    deleteFolder,
    fetchFolderView,
    fetchMediaItem,
    fetchRecentMedia,
    getMediaItem,
    getFolderView,
    getRecentMedia,
    removeItemFromFolder,
    saveFolder,
    searchMedia,
    searchMediaRemote,
    unsaveFolder,
    updateFolder,
  } = window.MovieTrackerFolders;
  const routes = window.MovieTrackerRoutes;
  const ACCESS_TOKEN_STORAGE_KEY = "movieTracker.accessToken";
  const CURRENT_USER_STORAGE_KEY = "movieTracker.currentUser";
  const PENDING_SEARCH_KEY = "movieTracker.openFolderSearch";
  const PENDING_FOLDER_SOURCE_KEY = "movieTracker.pendingFolderSource";
  const RECENT_CONTENT_LIMIT = 5;

  const initialState = {
    tabs: createPrimaryTabs("folders"),
    status: "loading",
    errorMessage: "",
    folder: null,
    editMode: false,
    form: {
      title: "",
      description: "",
      visibility: "private",
    },
    errors: {},
    search: {
      open: true,
      activated: false,
      query: "",
      loading: false,
      recentItems: [],
      results: [],
      touched: false,
    },
    deleteOverlayOpen: false,
    pendingAction: "",
    toasts: [],
  };

  let state = cloneState(initialState);
  let rootElement = null;
  let searchTimer = 0;
  let searchRequestToken = 0;
  const showToast = createToastController(setState);

  const PROTECTED_FOLDER_SYSTEM_KEYS = new Set([
    "continue-watching",
    "continue_watching",
    "watching",
    "in-progress",
    "completed",
    "viewed",
    "watched",
    "recently-viewed",
    "recently_viewed",
  ]);
  const PROTECTED_FOLDER_TITLES = new Set([
    "продолжить просмотр",
    "просмотрено",
  ]);

  function normalizeMetaText(value) {
    return String(value ?? "")
      .split("·")
      .map((part) => part.trim())
      .filter(Boolean)
      .join(" · ");
  }

  function hasDisplayValue(value) {
    if (value === null || value === undefined) return false;
    if (typeof value === "number") return Number.isFinite(value) && value > 0;
    return String(value).trim().length > 0;
  }

  function renderMetaParagraph(className, value) {
    const text = normalizeMetaText(value);
    return text ? `<p class="${className}">${escapeHtml(text)}</p>` : "";
  }

  function renderBadge(value) {
    return hasDisplayValue(value)
      ? `<span class="folder-detail__item-badge">${escapeHtml(String(value).trim())}</span>`
      : "";
  }

  function isProtectedSystemFolder(folder) {
    if (!folder) return false;

    const normalizedSystemKey = String(folder.systemKey ?? folder.system_key ?? "")
      .trim()
      .toLowerCase()
      .replace(/[\s_]+/g, "-");
    const normalizedTitle = String(folder.title ?? "").trim().toLowerCase();

    return PROTECTED_FOLDER_SYSTEM_KEYS.has(normalizedSystemKey) || PROTECTED_FOLDER_TITLES.has(normalizedTitle);
  }

  function canRemoveFolderItem(folder) {
    return folder?.role === "owner" && !isProtectedSystemFolder(folder);
  }

  function canEditFolder(folder) {
    return folder?.role === "owner" && folder?.canEdit !== false && !isProtectedSystemFolder(folder);
  }

  function canDeleteFolder(folder) {
    return folder?.role === "owner" && folder?.canDelete !== false && !isProtectedSystemFolder(folder);
  }

  function cloneState(value) {
    return {
      ...value,
      tabs: value.tabs.map((tab) => ({ ...tab })),
      folder: value.folder ? { ...value.folder, owner: { ...value.folder.owner }, items: value.folder.items.map((item) => ({ ...item })) } : null,
      form: { ...value.form },
      errors: { ...value.errors },
      search: {
        ...value.search,
        recentItems: value.search.recentItems.map((item) => ({ ...item })),
        results: value.search.results.map((item) => ({ ...item })),
      },
      toasts: [...value.toasts],
    };
  }

  function setState(updater) {
    state = typeof updater === "function" ? updater(state) : updater;
    renderApp();
  }

  function getRouteParams() {
    const params = new URLSearchParams(window.location.search);
    return {
      folderId: params.get("id") ?? "",
      publicSlug: params.get("share") ?? "",
    };
  }

  function renderBackLink() {
    return renderShellBackLink("folder-detail__back", "Папки", routes.folders);
  }

  function getMovieDetailUrl(id) {
    return routes.movieDetail({ id });
  }

  function openMovieDetail(id) {
    if (!id) return;
    navigateToPage(getMovieDetailUrl(id));
  }

  function renderLoadingState() {
    return `
      <section class="folder-detail__loading" aria-live="polite">
        <div class="folder-detail__loading-icon" aria-hidden="true"></div>
        <h1 class="folder-detail__state-title">Загружаем папку</h1>
        <div class="folder-detail__loading-line"></div>
        <div class="folder-detail__loading-line"></div>
      </section>
    `;
  }

  function renderStateCard(title, text, actionLabel = "", action = "") {
    const actionButton = actionLabel
      ? `<button class="profile-button profile-button--primary" type="button" data-action="${escapeHtml(action)}">${escapeHtml(actionLabel)}</button>`
      : "";

    return `
      <section class="folder-detail__state" aria-live="polite">
        <div class="folder-detail__state-icon" aria-hidden="true">
          <svg width="28" height="28" viewBox="0 0 18 18" fill="none">
            <path d="M3.2 5.2H7L8.4 6.8H14.8V13.4C14.8 14.06 14.26 14.6 13.6 14.6H4.4C3.74 14.6 3.2 14.06 3.2 13.4V5.2Z" stroke="currentColor" stroke-width="1.55" stroke-linejoin="round"></path>
            <path d="M6.1 9L8.1 11L11.9 7.2" stroke="currentColor" stroke-width="1.55" stroke-linecap="round" stroke-linejoin="round"></path>
          </svg>
        </div>
        <h1 class="folder-detail__state-title">${escapeHtml(title)}</h1>
        <p class="folder-detail__state-text">${escapeHtml(text)}</p>
        ${actionButton}
      </section>
    `;
  }

  function renderUnavailableState() {
    if (state.status === "unavailable") {
      return renderStateCard("Недоступная ссылка", "Публичная ссылка не найдена. Возможно, она была введена с ошибкой или уже больше не существует.", "Вернуться к папкам", "go-folders");
    }

    if (state.status === "private-link") {
      return renderStateCard("Папка стала приватной", "Владелец закрыл доступ по ссылке. Сохраненные у себя пользователи по-прежнему увидят актуальное содержимое только в своей библиотеке.", "Вернуться к папкам", "go-folders");
    }

    if (state.status === "owner-deleted") {
      return renderStateCard("Владелец удалил папку", "Оригинальная публичная папка была удалена владельцем и больше недоступна ни по ссылке, ни в сохраненных.", "Вернуться к папкам", "go-folders");
    }

    if (state.status === "deleted") {
      return renderStateCard("Папка недоступна", "Публичная папка была удалена и больше не может быть открыта.", "Вернуться к папкам", "go-folders");
    }

    if (state.status === "forbidden") {
      return renderStateCard("Отсутствует доступ", "Эта папка приватная и не сохранена в вашей библиотеке.", "Вернуться к папкам", "go-folders");
    }

    if (state.status === "error") {
      return renderStateCard("Ошибка загрузки", state.errorMessage || "Не удалось загрузить папку. Попробуйте обновить страницу или вернуться позже.", "Повторить", "retry");
    }

    return renderStateCard("Папка не найдена", "Такой папки нет или ссылка больше не актуальна.", "Вернуться к папкам", "go-folders");
  }

  function renderMeta(folder) {
    return `
      <div class="folder-detail__meta">
        <span class="folder-detail__meta-chip"><strong>Владелец:</strong> ${escapeHtml(folder.ownerName)}</span>
        <span class="folder-detail__meta-chip"><strong>Статус:</strong> ${folder.isPublic ? "Публичная" : "Приватная"}</span>
        <span class="folder-detail__meta-chip"><strong>Обновлена:</strong> ${escapeHtml(folder.updatedAtLabel)}</span>
        <span class="folder-detail__meta-chip"><strong>Элементов:</strong> ${folder.itemsCount}</span>
      </div>
    `;
  }

  function renderFolderActions(folder) {
    if (folder.role === "owner") {
      const canEdit = canEditFolder(folder);
      const canDelete = canDeleteFolder(folder);
      const editButton = state.editMode
        ? ""
        : !canEdit
          ? ""
        : `
          <button class="profile-button" type="button" data-action="toggle-edit">
            <svg width="16" height="16" viewBox="0 0 18 18" fill="none" aria-hidden="true">
              <path d="M10.9 4.2L13.8 7.1M3.8 14.2L6.9 13.55L14.3 6.15C15.1 5.35 15.1 4.05 14.3 3.25C13.5 2.45 12.2 2.45 11.4 3.25L4 10.65L3.8 14.2Z" stroke="currentColor" stroke-width="1.55" stroke-linecap="round" stroke-linejoin="round"></path>
            </svg>
            Редактировать
          </button>
        `;

      return `
        <div class="folder-detail__actions">
          ${editButton}
          <button class="profile-button" type="button" data-action="copy-link">
            <svg width="16" height="16" viewBox="0 0 18 18" fill="none" aria-hidden="true">
              <path d="M7.4 10.6C6.25 9.45 6.25 7.6 7.4 6.45L9.65 4.2C10.8 3.05 12.65 3.05 13.8 4.2C14.95 5.35 14.95 7.2 13.8 8.35L12.78 9.37" stroke="currentColor" stroke-width="1.55" stroke-linecap="round"></path>
              <path d="M10.6 7.4C11.75 8.55 11.75 10.4 10.6 11.55L8.35 13.8C7.2 14.95 5.35 14.95 4.2 13.8C3.05 12.65 3.05 10.8 4.2 9.65L5.22 8.63" stroke="currentColor" stroke-width="1.55" stroke-linecap="round"></path>
            </svg>
            Копировать ссылку
          </button>
          ${canDelete
            ? `
              <button class="profile-button" type="button" data-action="delete-folder" ${state.pendingAction ? "disabled" : ""}>
                <svg width="16" height="16" viewBox="0 0 18 18" fill="none" aria-hidden="true">
                  <path d="M4.2 5.6H13.8" stroke="currentColor" stroke-width="1.55" stroke-linecap="round"></path>
                  <path d="M7.2 3.8H10.8M6 5.6L6.45 14.1C6.49 14.73 7 15.2 7.63 15.2H10.37C11 15.2 11.51 14.73 11.55 14.1L12 5.6" stroke="currentColor" stroke-width="1.55" stroke-linecap="round" stroke-linejoin="round"></path>
                </svg>
                Удалить папку
              </button>
            `
            : ""}
        </div>
      `;
    }

    if (folder.role === "saved") {
      return `
        <div class="folder-detail__actions">
          <button class="profile-button" type="button" data-action="copy-link">
            <svg width="16" height="16" viewBox="0 0 18 18" fill="none" aria-hidden="true">
              <path d="M7.4 10.6C6.25 9.45 6.25 7.6 7.4 6.45L9.65 4.2C10.8 3.05 12.65 3.05 13.8 4.2C14.95 5.35 14.95 7.2 13.8 8.35L12.78 9.37" stroke="currentColor" stroke-width="1.55" stroke-linecap="round"></path>
              <path d="M10.6 7.4C11.75 8.55 11.75 10.4 10.6 11.55L8.35 13.8C7.2 14.95 5.35 14.95 4.2 13.8C3.05 12.65 3.05 10.8 4.2 9.65L5.22 8.63" stroke="currentColor" stroke-width="1.55" stroke-linecap="round"></path>
            </svg>
            Копировать ссылку
          </button>
          <button class="profile-button" type="button" data-action="unsave-folder" ${state.pendingAction ? "disabled" : ""}>
            <svg width="16" height="16" viewBox="0 0 18 18" fill="none" aria-hidden="true">
              <path d="M4.2 5.6H13.8" stroke="currentColor" stroke-width="1.55" stroke-linecap="round"></path>
              <path d="M7.2 3.8H10.8M6 5.6L6.45 14.1C6.49 14.73 7 15.2 7.63 15.2H10.37C11 15.2 11.51 14.73 11.55 14.1L12 5.6" stroke="currentColor" stroke-width="1.55" stroke-linecap="round" stroke-linejoin="round"></path>
            </svg>
            Удалить из сохраненных
          </button>
        </div>
      `;
    }

    const canSaveWithoutAuth = hasAuthenticatedSession();

    return `
      <div class="folder-detail__actions">
        <button class="profile-button" type="button" data-action="copy-link">
          <svg width="16" height="16" viewBox="0 0 18 18" fill="none" aria-hidden="true">
            <path d="M7.4 10.6C6.25 9.45 6.25 7.6 7.4 6.45L9.65 4.2C10.8 3.05 12.65 3.05 13.8 4.2C14.95 5.35 14.95 7.2 13.8 8.35L12.78 9.37" stroke="currentColor" stroke-width="1.55" stroke-linecap="round"></path>
            <path d="M10.6 7.4C11.75 8.55 11.75 10.4 10.6 11.55L8.35 13.8C7.2 14.95 5.35 14.95 4.2 13.8C3.05 12.65 3.05 10.8 4.2 9.65L5.22 8.63" stroke="currentColor" stroke-width="1.55" stroke-linecap="round"></path>
          </svg>
          Копировать ссылку
        </button>
        <button class="profile-button profile-button--primary" type="button" data-action="${canSaveWithoutAuth ? "save-folder" : "login-to-save"}" ${state.pendingAction ? "disabled" : ""}>${canSaveWithoutAuth ? "Сохранить себе" : "Войти, чтобы сохранить"}</button>
      </div>
    `;
  }

  function readStoredSessionValue(key) {
    try {
      return String(window.localStorage.getItem(key) ?? "").trim();
    } catch (error) {
      console.warn(error);
      return "";
    }
  }

  function hasAuthenticatedSession() {
    return Boolean(
      readStoredSessionValue(ACCESS_TOKEN_STORAGE_KEY) &&
      readStoredSessionValue(CURRENT_USER_STORAGE_KEY),
    );
  }

  function buildLoginRedirectUrl() {
    const loginUrl = new URL(routes.home, window.location.href);
    loginUrl.searchParams.set("auth", "login");
    loginUrl.searchParams.set("redirect", window.location.href);
    return loginUrl.href;
  }

  function redirectToLoginForSave() {
    window.location.href = buildLoginRedirectUrl();
  }

  function renderEditForm(folder) {
    if (!state.editMode || !canEditFolder(folder)) return "";

    return `
      <div class="folder-detail__edit">
        <label class="folder-detail__field">
          <span class="folder-detail__label">Название папки</span>
          <input class="folder-detail__input" type="text" value="${escapeHtml(state.form.title)}" data-edit-field="title" ${state.pendingAction ? "disabled" : ""} />
          ${state.errors.title ? `<span class="folder-detail__error">${escapeHtml(state.errors.title)}</span>` : ""}
        </label>
        <label class="folder-detail__field">
          <span class="folder-detail__label">Описание</span>
          <textarea class="folder-detail__textarea" data-edit-field="description" ${state.pendingAction ? "disabled" : ""}>${escapeHtml(state.form.description)}</textarea>
          ${state.errors.description ? `<span class="folder-detail__error">${escapeHtml(state.errors.description)}</span>` : ""}
        </label>
        <div class="folder-detail__field">
          <span class="folder-detail__label">Доступ</span>
          <div class="folder-detail__switch">
            <button
              class="folder-detail__switch-button ${state.form.visibility === "private" ? "folder-detail__switch-button--active" : ""}"
              type="button"
              data-edit-visibility="private"
              ${state.pendingAction ? "disabled" : ""}
            >
              Приватная
            </button>
            <button
              class="folder-detail__switch-button ${state.form.visibility === "public" ? "folder-detail__switch-button--active" : ""}"
              type="button"
              data-edit-visibility="public"
              ${state.pendingAction ? "disabled" : ""}
            >
              Публичная
            </button>
          </div>
          ${state.errors.visibility ? `<span class="folder-detail__error">${escapeHtml(state.errors.visibility)}</span>` : ""}
        </div>
        <div class="folder-detail__edit-actions">
          <button class="profile-button" type="button" data-action="cancel-edit" ${state.pendingAction ? "disabled" : ""}>Отмена</button>
          <button class="profile-button profile-button--primary" type="button" data-action="save-edit" ${state.pendingAction ? "disabled" : ""}>
            ${state.pendingAction === "save-edit" ? "Сохраняем..." : "Сохранить изменения"}
          </button>
        </div>
      </div>
    `;
  }

  function renderSearchResult(result, folder) {
    const exists = folder.items.some((item) => item.id === result.id);
    const isPendingAdd = state.pendingAction === `add-item:${result.id}`;
    const buttonLabel = exists ? "Уже в папке" : isPendingAdd ? "Добавляем..." : "Добавить";

    return `
      <article class="folder-detail__result">
        <div class="folder-detail__poster" aria-hidden="true"></div>
        <div class="folder-detail__result-main">
          <h3 class="folder-detail__result-title">${escapeHtml(result.title)}</h3>
          <p class="folder-detail__result-row">
            ${renderBadge(result.typeLabel)}
            ${renderBadge(result.year)}
            ${renderBadge(result.watchStatusLabel)}
          </p>
          ${renderMetaParagraph("folder-detail__result-meta", result.meta)}
        </div>
        <div class="folder-detail__search-actions">
          <button class="profile-button ${exists ? "" : "profile-button--primary"}" type="button" data-action="add-item" data-id="${result.id}" ${(exists || state.pendingAction) ? "disabled" : ""}>
            ${buttonLabel}
          </button>
        </div>
      </article>
    `;
  }

  function renderSearchPanel(folder) {
    if (folder.role !== "owner") return "";

    const hasQuery = Boolean(state.search.query.trim());
    const shouldShowRecent = state.search.activated && !hasQuery;
    const recentItems = shouldShowRecent ? state.search.recentItems : [];
    let content = "";

    if (state.search.loading) {
      content = `<p class="folder-detail__search-state">Ищем...</p>`;
    } else if (hasQuery && state.search.touched && !state.search.results.length) {
      content = `<div class="folder-detail__empty"><div class="folder-detail__empty-icon" aria-hidden="true"></div><strong>Поиск ничего не нашел</strong><p class="folder-detail__hint">Попробуйте другое название или уточните запрос.</p></div>`;
    } else if (hasQuery) {
      content = `
        <div class="folder-detail__search-results">${state.search.results.map((item) => renderSearchResult(item, folder)).join("")}</div>
      `;
    } else if (shouldShowRecent) {
      content = recentItems.length
        ? `
          <div class="folder-detail__search-group">
            <h3 class="folder-detail__search-title">Недавно просмотренное</h3>
            <div class="folder-detail__search-results">${recentItems.map((item) => renderSearchResult(item, folder)).join("")}</div>
          </div>
        `
        : `<p class="folder-detail__search-state">Недавно просмотренного пока нет.</p>`;
    }

    return `
      <div class="folder-detail__search" aria-label="Добавление контента в папку">
        <div class="folder-detail__search-field">
          <input class="folder-detail__search-input" type="text" value="${escapeHtml(state.search.query)}" placeholder="Поиск" data-search-input ${state.pendingAction ? "disabled" : ""} />
          <span class="folder-detail__search-icon" aria-hidden="true">
            <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
              <circle cx="6.5" cy="6.5" r="5" stroke="currentColor" stroke-width="1.5"></circle>
              <path d="M10.5 10.5L14 14" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"></path>
            </svg>
          </span>
        </div>
        ${content}
      </div>
    `;
  }

  function renderAddSection(folder) {
    if (folder.role !== "owner") return "";

    return `
      <section class="folder-detail__add">
        <h2 class="folder-detail__section-title">Добавить</h2>
        ${renderSearchPanel(folder)}
      </section>
    `;
  }

  function renderItem(item, folder) {
    const ownerControls = canRemoveFolderItem(folder)
      ? `
        <div class="folder-detail__item-actions">
          <button class="folder-detail__icon-button folder-detail__icon-button--danger" type="button" data-action="remove-item" data-id="${item.id}" ${state.pendingAction ? "disabled" : ""} aria-label="Удалить из папки">
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
              <path d="M4.2 5.6H13.8" stroke="currentColor" stroke-width="1.55" stroke-linecap="round"></path>
              <path d="M7.2 3.8H10.8M6 5.6L6.45 14.1C6.49 14.73 7 15.2 7.63 15.2H10.37C11 15.2 11.51 14.73 11.55 14.1L12 5.6" stroke="currentColor" stroke-width="1.55" stroke-linecap="round" stroke-linejoin="round"></path>
            </svg>
          </button>
        </div>
      `
      : "";

    return `
      <article class="folder-detail__item" data-card-id="${escapeHtml(item.id)}" tabindex="0" role="button" aria-label="Открыть ${escapeHtml(item.title)}">
        <div class="folder-detail__poster" aria-hidden="true"></div>
        <div class="folder-detail__item-main">
          <h3 class="folder-detail__item-title">${escapeHtml(item.title)}</h3>
          <p class="folder-detail__item-row">
            ${renderBadge(item.year)}
            ${renderBadge(item.typeLabel)}
            ${renderBadge(item.watchStatusLabel)}
            ${item.userRating ? `<span class="folder-detail__item-rating"><svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor" aria-hidden="true"><polygon points="7,1 8.8,5 13,5.5 10,8.4 10.9,12.5 7,10.5 3.1,12.5 4,8.4 1,5.5 5.2,5"></polygon></svg>${item.userRating}</span>` : ""}
          </p>
          ${renderMetaParagraph("folder-detail__item-meta", item.meta)}
          <p class="folder-detail__item-date">Добавлено ${escapeHtml(item.addedAtLabel)}</p>
        </div>
        ${ownerControls}
      </article>
    `;
  }

  function renderItemsSection(folder) {
    const emptyTitle = folder.role === "owner" ? "Папка пока пустая" : "В этой папке пока ничего нет";
    const emptyText = folder.role === "owner"
      ? "Добавьте фильмы или сериалы."
      : "Папка пока пустая.";

    const listContent = folder.items.length
      ? `<div class="folder-detail__items">${folder.items.map((item) => renderItem(item, folder)).join("")}</div>`
      : `
        <div class="folder-detail__empty" aria-live="polite">
          <div class="folder-detail__empty-icon" aria-hidden="true">
            <svg width="26" height="26" viewBox="0 0 18 18" fill="none">
              <path d="M3.2 5.2H7L8.4 6.8H14.8V13.4C14.8 14.06 14.26 14.6 13.6 14.6H4.4C3.74 14.6 3.2 14.06 3.2 13.4V5.2Z" stroke="currentColor" stroke-width="1.55" stroke-linejoin="round"></path>
              <path d="M9 7V11M7 9H11" stroke="currentColor" stroke-width="1.55" stroke-linecap="round"></path>
            </svg>
          </div>
          <strong>${emptyTitle}</strong>
          <p class="folder-detail__hint">${emptyText}</p>
        </div>
      `;

    return `
      <section class="folder-detail__section">
        <div class="folder-detail__section-head">
          <h2 class="folder-detail__section-title">Содержимое</h2>
        </div>
        ${listContent}
      </section>
    `;
  }

  function renderDeleteOverlay() {
    if (!state.deleteOverlayOpen || !state.folder) return "";

    return renderModalShell(
      "Удалить папку",
      `
        <p class="delete-confirm">
          Папка «${escapeHtml(state.folder.title)}» будет удалена полностью. Если она была публичной, ссылка перестанет работать.
        </p>
      `,
      `
        <div class="modal-card__footer modal-card__footer--split">
          <button class="modal-card__secondary" type="button" data-action="close-delete">Отмена</button>
          <button class="modal-card__confirm modal-card__confirm--danger" type="button" data-action="confirm-delete" ${state.pendingAction ? "disabled" : ""}>
            ${state.pendingAction === "delete-folder" ? "Удаляем..." : "Удалить"}
          </button>
        </div>
      `,
      "folder-delete",
    );
  }

  function renderFolder() {
    const folder = state.folder;
    if (!folder) return renderUnavailableState();
    const description = folder.description
      ? `<p class="folder-detail__description">${escapeHtml(folder.description)}</p>`
      : "";

    return `
      <section class="folder-detail__hero">
        <div class="folder-detail__hero-top">
          <div>
            <span class="folder-detail__eyebrow">${folder.role === "owner" ? "Моя папка" : folder.role === "saved" ? "Сохраненная папка" : "Публичная папка"}</span>
            <h1 class="folder-detail__title">${escapeHtml(folder.title)}</h1>
            ${description}
          </div>
          ${renderFolderActions(folder)}
        </div>
        ${renderMeta(folder)}
        ${renderEditForm(folder)}
      </section>
      ${renderAddSection(folder)}
      ${renderItemsSection(folder)}
    `;
  }

  function renderContent() {
    if (state.status === "loading") return renderLoadingState();
    if (state.status !== "ok") return renderUnavailableState();
    return renderFolder();
  }

  function renderPage() {
    return `
      <div class="history-page folder-detail-page">
        <h1 class="sr-only">Папка Movie Tracker</h1>
        <div class="history-page__shell">
          ${renderAppHeader({ tabs: state.tabs })}

          <div class="history-page__content">
            <section class="folder-detail">
              ${renderBackLink()}
              ${renderContent()}
            </section>
          </div>
        </div>
        ${renderToasts(state.toasts)}
        ${renderDeleteOverlay()}
      </div>
    `;
  }

  function renderApp() {
    if (!rootElement) return;
    rootElement.innerHTML = renderPage();
  }

  function restoreSearchFocus() {
    const input = rootElement?.querySelector("[data-search-input]");
    if (!input) return;
    const valueLength = input.value.length;
    input.focus();
    input.setSelectionRange(valueLength, valueLength);
  }

  function syncEditForm(folder) {
    state.form.title = folder.title;
    state.form.description = folder.description;
    state.form.visibility = folder.isPublic ? "public" : "private";
    state.errors = {};
  }

  function updateFolderInState(folder) {
    setState((currentState) => ({
      ...currentState,
      folder,
      pendingAction: "",
      deleteOverlayOpen: false,
    }));
  }

  async function loadFolder() {
    const route = getRouteParams();

    setState((currentState) => ({
      ...currentState,
      status: "loading",
      errorMessage: "",
      deleteOverlayOpen: false,
      pendingAction: "",
    }));

    try {
      const result = await fetchFolderView({
        folderId: route.folderId,
        publicSlug: route.publicSlug,
        viewerId: currentUser.id,
      });

      if (result.status === "ok") {
        consumePendingSearch(result.folder.id);
        const pendingSource = consumePendingFolderSource(result.folder.id);
        setState((currentState) => ({
          ...currentState,
          status: "ok",
          folder: result.folder,
          editMode: false,
          errors: {},
          search: {
            ...currentState.search,
            open: result.folder.role === "owner",
            activated: result.folder.role === "owner" ? Boolean(pendingSource?.title) : false,
            loading: false,
            recentItems: [],
            results: [],
            query: pendingSource?.title ?? "",
            touched: Boolean(pendingSource?.title),
          },
        }));
        syncEditForm(result.folder);
        renderApp();
        if (result.folder.role === "owner") {
          hydrateRecentMedia();
        }
        if (pendingSource?.title) {
          window.requestAnimationFrame(restoreSearchFocus);
        }
        if (pendingSource) {
          resolvePendingFolderSource(result.folder.id, pendingSource);
        }
        return;
      }

      setState((currentState) => ({
        ...currentState,
        status: result.status,
        folder: null,
      }));
    } catch (error) {
      console.error(error);
      setState((currentState) => ({
        ...currentState,
        status: "error",
        errorMessage: error.message,
        folder: null,
      }));
    }
  }

  function storePendingToast(message, type = "success") {
    window.sessionStorage.setItem("movieTracker.pendingFolderToast", JSON.stringify({ message, type }));
  }

  async function hydrateRecentMedia() {
    try {
      const recentItems = await fetchRecentMedia(RECENT_CONTENT_LIMIT);
      setState((currentState) => ({
        ...currentState,
        search: {
          ...currentState.search,
          recentItems: Array.isArray(recentItems) ? recentItems.map((item) => ({ ...item })) : getRecentMedia(RECENT_CONTENT_LIMIT),
        },
      }));
    } catch (error) {
      console.error(error);
      setState((currentState) => ({
        ...currentState,
        search: {
          ...currentState.search,
          recentItems: getRecentMedia(RECENT_CONTENT_LIMIT),
        },
      }));
    }
  }

  function openDeleteOverlay() {
    if (!canDeleteFolder(state.folder)) return;

    setState((currentState) => ({
      ...currentState,
      deleteOverlayOpen: true,
    }));
  }

  function closeDeleteOverlay() {
    if (state.pendingAction) return;
    setState((currentState) => ({
      ...currentState,
      deleteOverlayOpen: false,
    }));
  }

  function toggleEditMode() {
    if (!canEditFolder(state.folder)) return;

    if (!state.editMode) {
      syncEditForm(state.folder);
    }

    setState((currentState) => ({
      ...currentState,
      editMode: !currentState.editMode,
      errors: {},
    }));
  }

  async function saveEdit() {
    if (!canEditFolder(state.folder) || state.pendingAction) return;

    setState((currentState) => ({
      ...currentState,
      pendingAction: "save-edit",
      errors: {},
    }));

    try {
      const folder = await updateFolder(state.folder.id, {
        title: state.form.title,
        description: state.form.description,
        visibility: state.form.visibility,
      });
      setState((currentState) => ({
        ...currentState,
        folder,
        editMode: false,
        pendingAction: "",
      }));
      showToast("Изменения сохранены", "success");
    } catch (error) {
      console.error(error);
      if (error.code === "validation") {
        setState((currentState) => ({
          ...currentState,
          errors: { ...(error.errors ?? {}) },
          pendingAction: "",
        }));
        return;
      }

      setState((currentState) => ({
        ...currentState,
        pendingAction: "",
      }));
      showToast("Ошибка загрузки", "error");
    }
  }

  async function copyLink() {
    if (!state.folder?.publicUrl) return;

    try {
      await writeClipboardText(state.folder.publicUrl);
      showToast("Ссылка скопирована", "success");
    } catch (error) {
      console.error(error);
      showToast("Ошибка загрузки", "error");
    }
  }

  async function savePublicFolder() {
    if (!state.folder || state.pendingAction) return;

    if (!hasAuthenticatedSession()) {
      redirectToLoginForSave();
      return;
    }

    setState((currentState) => ({
      ...currentState,
      pendingAction: "save-folder",
    }));

    try {
      const result = await saveFolder(state.folder.id);
      if (result.status === "already-saved") {
        setState((currentState) => ({
          ...currentState,
          folder: result.folder,
          pendingAction: "",
        }));
        showToast("Папка уже сохранена", "success");
        return;
      }

      setState((currentState) => ({
        ...currentState,
        folder: result.folder,
        pendingAction: "",
      }));
      showToast("Папка сохранена", "success");
    } catch (error) {
      console.error(error);
      if (error?.status === 401) {
        setState((currentState) => ({
          ...currentState,
          pendingAction: "",
        }));
        redirectToLoginForSave();
        return;
      }

      setState((currentState) => ({
        ...currentState,
        pendingAction: "",
      }));
      showToast(error.code === "access" ? "Ошибка доступа" : "Папка недоступна", "error");
    }
  }

  async function removeSavedFolder() {
    if (!state.folder || state.pendingAction) return;

    setState((currentState) => ({
      ...currentState,
      pendingAction: "unsave-folder",
    }));

    try {
      await unsaveFolder(state.folder.id);
      storePendingToast("Папка удалена", "success");
      navigateToPage(routes.folders);
    } catch (error) {
      console.error(error);
      setState((currentState) => ({
        ...currentState,
        pendingAction: "",
      }));
      showToast("Ошибка доступа", "error");
    }
  }

  async function confirmDeleteFolder() {
    if (!canDeleteFolder(state.folder) || state.pendingAction) return;

    setState((currentState) => ({
      ...currentState,
      pendingAction: "delete-folder",
    }));

    try {
      await deleteFolder(state.folder.id);
      storePendingToast("Папка удалена", "success");
      navigateToPage(routes.folders);
    } catch (error) {
      console.error(error);
      setState((currentState) => ({
        ...currentState,
        pendingAction: "",
      }));
      showToast(error.code === "access" ? "Ошибка доступа" : "Ошибка загрузки", "error");
    }
  }

  function runSearch(query) {
    window.clearTimeout(searchTimer);
    const hasQuery = Boolean(query.trim());
    const requestToken = ++searchRequestToken;

    setState((currentState) => ({
      ...currentState,
      search: {
        ...currentState.search,
        query,
        loading: hasQuery,
        touched: hasQuery,
        activated: currentState.search.activated || hasQuery,
        results: hasQuery ? currentState.search.results : [],
      },
    }));
    window.requestAnimationFrame(restoreSearchFocus);

    if (!hasQuery) {
      return;
    }

    searchTimer = window.setTimeout(() => {
      searchMediaRemote(query)
        .then((results) => {
          if (requestToken !== searchRequestToken) return;

          setState((currentState) => ({
            ...currentState,
            search: {
              ...currentState.search,
              loading: false,
              results: Array.isArray(results) ? results.map((item) => ({ ...item })) : searchMedia(query),
            },
          }));
          window.requestAnimationFrame(restoreSearchFocus);
        })
        .catch((error) => {
          console.error(error);
          if (requestToken !== searchRequestToken) return;

          setState((currentState) => ({
            ...currentState,
            search: {
              ...currentState.search,
              loading: false,
              results: searchMedia(query),
            },
          }));
          window.requestAnimationFrame(restoreSearchFocus);
        });
    }, 180);
  }

  function consumePendingFolderSource(folderId) {
    const rawValue = window.sessionStorage.getItem(PENDING_FOLDER_SOURCE_KEY);
    if (!rawValue) return null;

    try {
      const parsedValue = JSON.parse(rawValue);
      if (parsedValue?.folderId === folderId) {
        window.sessionStorage.removeItem(PENDING_FOLDER_SOURCE_KEY);
        return parsedValue;
      }
    } catch (error) {
      console.warn(error);
      window.sessionStorage.removeItem(PENDING_FOLDER_SOURCE_KEY);
    }

    return null;
  }

  async function resolvePendingFolderSource(folderId, source) {
    const mediaItem = source?.mediaId
      ? await fetchMediaItem(source.mediaId).catch(() => getMediaItem(source.mediaId))
      : null;

    if (!source?.mediaId || !mediaItem) {
      if (source?.title) {
        runSearch(source.title);
      }
      return;
    }

    setState((currentState) => ({
      ...currentState,
      pendingAction: `add-item:${source.mediaId}`,
    }));

    try {
      const result = await addItemToFolder(folderId, source.mediaId);
      setState((currentState) => ({
        ...currentState,
        folder: result.folder,
        pendingAction: "",
      }));
      showToast(result.status === "duplicate" ? "Элемент уже добавлен" : "Добавлено в папку", "success");
    } catch (error) {
      console.error(error);
      setState((currentState) => ({
        ...currentState,
        pendingAction: "",
      }));
      if (source?.title) {
        runSearch(source.title);
      }
    }
  }

  async function handleAddItem(mediaId) {
    if (!state.folder || state.folder.role !== "owner" || state.pendingAction) return;

    setState((currentState) => ({
      ...currentState,
      pendingAction: `add-item:${mediaId}`,
    }));

    try {
      const result = await addItemToFolder(state.folder.id, mediaId);
      if (result.status === "duplicate") {
        setState((currentState) => ({
          ...currentState,
          folder: result.folder,
          pendingAction: "",
        }));
        showToast("Элемент уже добавлен", "success");
        return;
      }

      setState((currentState) => ({
        ...currentState,
        folder: result.folder,
        pendingAction: "",
      }));
      runSearch(state.search.query);
      showToast("Изменения сохранены", "success");
    } catch (error) {
      console.error(error);
      setState((currentState) => ({
        ...currentState,
        pendingAction: "",
      }));
      showToast(error.code === "access" ? "Ошибка доступа" : "Ошибка загрузки", "error");
    }
  }

  function consumePendingSearch(folderId) {
    const rawValue = window.sessionStorage.getItem(PENDING_SEARCH_KEY);
    if (!rawValue) return false;

    try {
      const parsedValue = JSON.parse(rawValue);
      if (parsedValue?.folderId === folderId) {
        window.sessionStorage.removeItem(PENDING_SEARCH_KEY);
        return true;
      }
    } catch (error) {
      console.warn(error);
      window.sessionStorage.removeItem(PENDING_SEARCH_KEY);
    }

    return false;
  }

  async function handleRemoveItem(mediaId) {
    if (!state.folder || !canRemoveFolderItem(state.folder) || state.pendingAction) return;

    setState((currentState) => ({
      ...currentState,
      pendingAction: `remove-item:${mediaId}`,
    }));

    try {
      const folder = await removeItemFromFolder(state.folder.id, mediaId);
      updateFolderInState(folder);
      runSearch(state.search.query);
      showToast("Изменения сохранены", "success");
    } catch (error) {
      console.error(error);
      setState((currentState) => ({
        ...currentState,
        pendingAction: "",
      }));
      showToast("Ошибка доступа", "error");
    }
  }

  function activateSearchPanel() {
    if (!state.search.open || state.search.activated) return;

    setState((currentState) => ({
      ...currentState,
      search: {
        ...currentState.search,
        activated: true,
      },
    }));
    if (!state.search.recentItems.length) {
      hydrateRecentMedia();
    }
    window.requestAnimationFrame(restoreSearchFocus);
  }

  function handleRootClick(event) {
    const navButton = event.target.closest("[data-nav-url]");
    if (navButton) {
      navigateToPage(navButton.dataset.navUrl);
      return;
    }

    if (event.target.dataset.modalBackdrop === "folder-delete") {
      closeDeleteOverlay();
      return;
    }

    const searchInput = event.target.closest("[data-search-input]");
    if (searchInput) {
      activateSearchPanel();
      return;
    }

    const visibilityButton = event.target.closest("[data-edit-visibility]");
    if (visibilityButton) {
      state.form.visibility = visibilityButton.dataset.editVisibility;
      delete state.errors.visibility;
      renderApp();
      return;
    }

    const actionButton = event.target.closest("[data-action]");
    if (actionButton) {
      const action = actionButton.dataset.action;
      const id = actionButton.dataset.id;

      if (action === "retry") {
        loadFolder();
        return;
      }

      if (action === "go-folders") {
        navigateToPage(routes.folders);
        return;
      }

      if (action === "toggle-edit") {
        toggleEditMode();
        return;
      }

      if (action === "cancel-edit") {
        syncEditForm(state.folder);
        setState((currentState) => ({
          ...currentState,
          editMode: false,
          errors: {},
        }));
        return;
      }

      if (action === "save-edit") {
        saveEdit();
        return;
      }

      if (action === "copy-link") {
        copyLink();
        return;
      }

      if (action === "save-folder") {
        savePublicFolder();
        return;
      }

      if (action === "login-to-save") {
        redirectToLoginForSave();
        return;
      }

      if (action === "unsave-folder") {
        removeSavedFolder();
        return;
      }

      if (action === "delete-folder") {
        openDeleteOverlay();
        return;
      }

      if (action === "confirm-delete") {
        confirmDeleteFolder();
        return;
      }

      if (action === "close-delete") {
        closeDeleteOverlay();
        return;
      }

      if (action === "add-item") {
        handleAddItem(id);
        return;
      }

      if (action === "remove-item") {
        handleRemoveItem(id);
        return;
      }
    }

    const contentCard = event.target.closest("[data-card-id]");
    if (contentCard && !event.target.closest("button, a, input, textarea, select")) {
      openMovieDetail(contentCard.dataset.cardId);
      return;
    }
  }

  function handleRootKeydown(event) {
    const contentCard = event.target.closest("[data-card-id]");
    if (!contentCard || event.target !== contentCard) return;
    if (event.key !== "Enter" && event.key !== " ") return;

    event.preventDefault();
    openMovieDetail(contentCard.dataset.cardId);
  }

  function handleRootInput(event) {
    const editField = event.target.closest("[data-edit-field]");
    if (editField) {
      state.form[editField.dataset.editField] = editField.value;
      delete state.errors[editField.dataset.editField];
      return;
    }

    const searchInput = event.target.closest("[data-search-input]");
    if (searchInput) {
      runSearch(searchInput.value);
    }
  }

  function initPendingToast() {
    const rawToast = window.sessionStorage.getItem("movieTracker.pendingFolderToast");
    if (!rawToast) return;

    try {
      const toast = JSON.parse(rawToast);
      if (toast?.message) {
        showToast(toast.message, toast.type || "success");
      }
    } catch (error) {
      console.warn(error);
    } finally {
      window.sessionStorage.removeItem("movieTracker.pendingFolderToast");
    }
  }

  function initFolderDetailPage() {
    if (!ensureAuthenticatedPageAccess()) return;

    rootElement = document.querySelector("#folder-detail-app");
    if (!rootElement) return;

    rootElement.addEventListener("click", handleRootClick);
    rootElement.addEventListener("keydown", handleRootKeydown);
    rootElement.addEventListener("input", handleRootInput);
    rootElement.addEventListener("focusin", (event) => {
      if (event.target.closest("[data-search-input]")) {
        activateSearchPanel();
      }
    });
    renderApp();
    initPendingToast();
    loadFolder();
  }

  initFolderDetailPage();
})();
