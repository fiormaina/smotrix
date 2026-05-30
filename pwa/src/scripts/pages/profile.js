(() => {
  const {
    ensureAuthenticatedPageAccess,
    escapeHtml,
    navigateToPage,
    renderToasts,
    writeClipboardText,
  } = window.MovieTrackerUI;
  const syncOverlayHost =
    window.MovieTrackerUI.syncOverlayHost ||
    ((host, markup) => {
      if (host) host.innerHTML = String(markup ?? "");
    });
  const { createToastController, pluralizeRu } = window.MovieTrackerHelpers;
  const {
    avatarPresets,
    createPrimaryTabs,
    defaultAvatarKey,
    renderAppFooter,
    renderAppHeader,
    renderUserAvatar,
  } = window.MovieTrackerAppShell;
  const { renderPageState } = window.MovieTrackerFeedback;
  const { renderProfileFolderCard } = window.MovieTrackerFolderCard;
  const {
    currentUser,
    fetchProfileView,
    followUser,
    getFolderPublicUrl,
    getProfileUrl,
    getProfileView,
    saveFolder,
    unfollowUser,
    upsertUser,
  } = window.MovieTrackerFolders;
  const routes = window.MovieTrackerRoutes;

  const CURRENT_USER_STORAGE_KEY = "movieTracker.currentUser";
  const ACCESS_TOKEN_STORAGE_KEY = "movieTracker.accessToken";
  const DEFAULT_DISPLAY_NAME = "Пользователь";
  const AVATAR_UPLOAD_MAX_BYTES = 3 * 1024 * 1024;
  const AVATAR_OUTPUT_SIZE = 256;
  const API_BASE_URL = String(window.MovieTrackerConfig?.apiBaseUrl ?? "").replace(/\/+$/, "");
  const API_V1_BASE_URL = `${API_BASE_URL}/api/v1`;
  const PROFILE_ENDPOINT = `${API_V1_BASE_URL}/auth/me`;
  const PROFILE_TEMPORARY_ERROR_MESSAGE = "Не удалось загрузить профиль";

  const initialState = {
    status: "loading",
    errorMessage: "",
    viewerId: currentUser.id,
    isOwner: true,
    user: null,
    tabs: createPrimaryTabs(),
    stats: [],
    statsStatus: "idle",
    publicFolders: [],
    pendingFolderIds: new Set(),
    pendingFollow: false,
    editProfileOverlay: {
      isOpen: false,
      displayName: "",
      username: "",
      avatarKey: defaultAvatarKey,
      avatarImage: "",
      confirmDelete: false,
    },
    socialOverlay: {
      isOpen: false,
      kind: "following",
      status: "idle",
      items: [],
    },
    toasts: [],
  };

  let state = cloneState(initialState);
  let rootElement = null;
  let socialOverlayRequestId = 0;
  let socialOverlayPendingKind = "";
  const showToast = createToastController((updater) => setState(updater, { scope: "overlay" }));

  function getProfileRootElement() {
    const roots = document.querySelectorAll("#profile-app");
    return roots.length ? roots[roots.length - 1] : null;
  }

  function cloneState(value) {
    return {
      ...value,
      user: value.user ? { ...value.user } : null,
      tabs: value.tabs.map((tab) => ({ ...tab })),
      stats: value.stats.map((stat) => ({ ...stat })),
      statsStatus: value.statsStatus ?? "idle",
      publicFolders: value.publicFolders.map((folder) => ({
        ...folder,
        posters: folder.posters.map((poster) => [...poster]),
      })),
      pendingFolderIds: new Set(value.pendingFolderIds ?? []),
      editProfileOverlay: { ...value.editProfileOverlay },
      socialOverlay: {
        ...value.socialOverlay,
        status: value.socialOverlay?.status ?? "idle",
        items: (value.socialOverlay?.items ?? []).map((item) => ({ ...item })),
      },
      toasts: [...value.toasts],
    };
  }

  function setState(updater, options = {}) {
    state = typeof updater === "function" ? updater(state) : updater;
    renderApp(options.scope ?? "full");
  }

  function readAccessToken() {
    return localStorage.getItem(ACCESS_TOKEN_STORAGE_KEY);
  }

  function persistCurrentUser(user) {
    try {
      localStorage.setItem(CURRENT_USER_STORAGE_KEY, JSON.stringify(user));
    } catch (error) {
      console.warn(error);
    }
  }

  function normalizeCountValue(value, fallbackValue = 0) {
    const normalizedValue = Number(value);
    return Number.isFinite(normalizedValue) ? normalizedValue : fallbackValue;
  }

  function normalizeProfileUser(source, fallbackUser = currentUser) {
    const username = source.login ?? source.username ?? fallbackUser.username ?? "user";

    return {
      id: source.id ?? fallbackUser.id,
      username,
      displayName:
        source.displayName ??
        source.display_name ??
        source.name ??
        fallbackUser.displayName ??
        DEFAULT_DISPLAY_NAME,
      followingCount: normalizeCountValue(
        source.followingCount ?? source.following_count,
        fallbackUser.followingCount ?? 0,
      ),
      followersCount: normalizeCountValue(
        source.followersCount ?? source.followers_count,
        fallbackUser.followersCount ?? 0,
      ),
      extensionCode:
        source.extensionCode ??
        source.extension_code ??
        fallbackUser.extensionCode ??
        "MT-USER-2026",
      avatarKey:
        source.avatarKey ??
        source.avatar_key ??
        fallbackUser.avatarKey ??
        defaultAvatarKey,
      avatarImage:
        source.avatarImage ??
        source.avatar_image ??
        source.avatarUrl ??
        fallbackUser.avatarImage ??
        "",
      profileUrl: routes.resolveAppUrl(
        source.profileUrl ??
          source.profile_url ??
          fallbackUser.profileUrl,
        getProfileUrl(username, true),
        { absolute: true },
      ),
      isFollowing:
        source.isFollowing ??
        source.is_following ??
        fallbackUser.isFollowing ??
        false,
      isOwner:
        source.isOwner ??
        source.is_owner ??
        fallbackUser.isOwner ??
        false,
    };
  }

  function getSocialCountKey(kind) {
    return kind === "followers" ? "followersCount" : "followingCount";
  }

  async function sendProfileRequest(url, options = {}) {
    const token = readAccessToken();
    const headers = {
      "Content-Type": "application/json",
      ...(options.headers ?? {}),
    };

    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    const response = await fetch(url, {
      ...options,
      headers,
    });

    let data = null;
    try {
      data = await response.json();
    } catch (error) {
      data = null;
    }

    if (!response.ok) {
      const detail = data?.detail;
      if (detail && typeof detail === "object" && detail.message) {
        throw new Error(detail.message);
      }

      const error = new Error(detail ?? data?.message ?? PROFILE_TEMPORARY_ERROR_MESSAGE);
      error.status = response.status;
      throw error;
    }

    return data;
  }

  const profileApi = {
    async getProfile() {
      return sendProfileRequest(PROFILE_ENDPOINT, { method: "GET" });
    },
    updateProfile(patch) {
      return sendProfileRequest(PROFILE_ENDPOINT, {
        method: "PATCH",
        body: JSON.stringify({
          display_name: patch.displayName,
          login: patch.username,
          avatar_key: patch.avatarKey,
          avatar_image: patch.avatarImage || null,
        }),
      });
    },
    deleteAccount() {
      return Promise.resolve({
        deletedAt: new Date().toISOString(),
      });
    },
  };

  function getRouteTarget() {
    const params = new URLSearchParams(window.location.search);
    return String(params.get("user") ?? "").trim().replace(/^@+/, "");
  }

  function isCurrentUsersRoute(routeTarget, viewer) {
    const normalizedTarget = String(routeTarget ?? "").trim().toLowerCase();
    if (!normalizedTarget || normalizedTarget === "me") return true;

    return (
      normalizedTarget === String(viewer.id ?? "").trim().toLowerCase() ||
      normalizedTarget === String(viewer.username ?? "").trim().toLowerCase()
    );
  }

  function buildFolderPosters(seed) {
    const palette = [
      ["#8c7fff", "#6e53f4"],
      ["#bac7ff", "#8174f4"],
      ["#d8d2f9", "#9b8cff"],
      ["#c8c0f3", "#eef0fb"],
      ["#74d0ff", "#3f8cff"],
      ["#f5d6a2", "#f1ab5f"],
      ["#9be6c7", "#3fb387"],
      ["#f6bcc7", "#ef748d"],
    ];
    const normalizedSeed = String(seed ?? "folder");
    const hash = [...normalizedSeed].reduce((value, char) => value + char.charCodeAt(0), 0);

    return Array.from({ length: 4 }, (_, index) => palette[(hash + index) % palette.length]);
  }

  function decorateFolders(folders) {
    return folders.map((folder) => ({
      ...folder,
      count: folder.itemsCount,
      saved: folder.isSaved,
      owner: folder.ownerName,
      posters: buildFolderPosters(folder.id),
    }));
  }

  function normalizeProfileStats(stats) {
    if (!Array.isArray(stats)) {
      return [];
    }

    return stats
      .map((stat) => ({
        id: String(stat?.id ?? "").trim(),
        value: Number.isFinite(Number(stat?.value)) ? Number(stat.value) : 0,
        label: String(stat?.label ?? "").trim(),
        icon: String(stat?.icon ?? "").trim() || "movie",
      }))
      .filter((stat) => stat.id && stat.label);
  }

  function syncProfileLocation(user, isOwner) {
    const currentUrl = new URL(window.location.href);
    const nextUrl = new URL(
      isOwner ? routes.profile() : getProfileUrl(user.username, false),
      window.location.href,
    );

    if (currentUrl.pathname === nextUrl.pathname && currentUrl.search === nextUrl.search) {
      return;
    }

    window.history.replaceState(window.history.state, "", nextUrl.href);
  }

  async function resolveViewer() {
    const token = readAccessToken();
    if (!token) {
      return { ...currentUser };
    }

    try {
      const responseData = await profileApi.getProfile();
      const viewer = normalizeProfileUser(responseData, currentUser);
      persistCurrentUser(viewer);
      upsertUser(viewer);
      return viewer;
    } catch (error) {
      console.error(error);
      showToast(error.message || PROFILE_TEMPORARY_ERROR_MESSAGE, "error");
      return { ...currentUser };
    }
  }

  async function loadProfileView(options = {}) {
    const routeTarget = getRouteTarget();
    const viewer = await resolveViewer();
    const ownRoute = isCurrentUsersRoute(routeTarget, viewer);
    const profileView = await fetchProfileView({
      userId: ownRoute ? viewer.id : "",
      username: ownRoute ? viewer.username : routeTarget,
      viewerId: viewer.id,
    });

    if (profileView.status !== "ok") {
      setState((currentState) => ({
        ...currentState,
        status: profileView.status,
        errorMessage: profileView.status === "missing" ? "" : PROFILE_TEMPORARY_ERROR_MESSAGE,
        viewerId: viewer.id,
        isOwner: ownRoute,
        user: null,
        publicFolders: [],
        stats: [],
        statsStatus: "idle",
      }));
      return;
    }

    const profileUserSource = ownRoute
      ? {
          ...viewer,
          ...profileView.user,
          isOwner: true,
          isFollowing: false,
          profileUrl: getProfileUrl(viewer.username, true),
        }
      : profileView.user;
    const profileUser = normalizeProfileUser(
      profileUserSource,
      ownRoute ? viewer : profileView.user ?? currentUser,
    );
    const publicFolders = decorateFolders(profileView.publicFolders);
    const profileStats = normalizeProfileStats(profileView.stats);

    syncProfileLocation(profileUser, ownRoute);

    if (ownRoute) {
      persistCurrentUser(profileUser);
      upsertUser(profileUser);
    }

    setState((currentState) => ({
      ...currentState,
      status: "ready",
      errorMessage: "",
      viewerId: viewer.id,
      isOwner: ownRoute,
      user: profileUser,
      publicFolders,
      stats: profileStats,
      statsStatus: Array.isArray(profileView.stats) ? "ready" : "unavailable",
      pendingFollow: options.keepPendingFollow ? currentState.pendingFollow : false,
      editProfileOverlay: ownRoute
        ? currentState.editProfileOverlay
        : { ...initialState.editProfileOverlay },
      socialOverlay: { ...initialState.socialOverlay },
    }));
  }

  function renderAvatarPicker(selectedAvatarKey, hasCustomAvatar = false) {
    return `
      <div class="profile-avatar-picker" role="radiogroup" aria-label="Выбор аватарки">
        ${Object.values(avatarPresets)
          .map((preset) => {
            const isSelected = !hasCustomAvatar && preset.id === selectedAvatarKey;
            return `
              <button
                class="profile-avatar-option ${isSelected ? "profile-avatar-option--selected" : ""}"
                type="button"
                data-profile-avatar="${preset.id}"
                role="radio"
                aria-checked="${isSelected ? "true" : "false"}"
                aria-label="${escapeHtml(preset.label)}"
                title="${escapeHtml(preset.label)}"
              >
                ${renderUserAvatar({
                  avatarKey: preset.id,
                  size: 58,
                  className: "profile-avatar-option__visual",
                  iconSize: 24,
                })}
              </button>
            `;
          })
          .join("")}
      </div>
    `;
  }

  function renderProfileHero() {
    if (!state.user) return "";

    const socialButton = state.isOwner
      ? `
        <button class="profile-button profile-button--primary" type="button" data-action="edit-profile">
          <svg width="16" height="16" viewBox="0 0 18 18" fill="none" aria-hidden="true">
            <path d="M10.9 4.2L13.8 7.1M3.8 14.2L6.9 13.55L14.3 6.15C15.1 5.35 15.1 4.05 14.3 3.25C13.5 2.45 12.2 2.45 11.4 3.25L4 10.65L3.8 14.2Z" stroke="currentColor" stroke-width="1.55" stroke-linecap="round" stroke-linejoin="round"></path>
          </svg>
          Редактировать профиль
        </button>
      `
      : `
        <button
          class="profile-button ${state.user.isFollowing ? "" : "profile-button--primary"}"
          type="button"
          data-action="toggle-follow"
          ${state.pendingFollow ? "disabled" : ""}
        >
          ${state.pendingFollow
            ? state.user.isFollowing ? "Обновляем..." : "Подписываемся..."
            : state.user.isFollowing ? "Вы подписаны" : "Подписаться"}
        </button>
      `;

    return `
      <section class="profile-hero" aria-label="Профиль пользователя">
        <div class="profile-hero__avatar" aria-hidden="true">
          ${renderUserAvatar({
            avatarKey: state.user.avatarKey,
            avatarImage: state.user.avatarImage,
            size: 122,
            className: "profile-hero__avatar-visual",
            iconSize: 46,
          })}
        </div>
        <div class="profile-hero__info">
          <span class="profile-hero__label">${state.isOwner ? "Ваш профиль" : "Публичный профиль"}</span>
          <h1 class="profile-hero__name">${escapeHtml(state.user.displayName)}</h1>
          <div class="profile-hero__meta">
            <span>@${escapeHtml(state.user.username)}</span>
            <span class="profile-hero__dot" aria-hidden="true"></span>
            <button
              class="profile-hero__meta-button"
              type="button"
              data-action="open-social-overlay"
              data-social-kind="following"
            >
              ${state.user.followingCount} подписок
            </button>
            <span class="profile-hero__dot" aria-hidden="true"></span>
            <button
              class="profile-hero__meta-button"
              type="button"
              data-action="open-social-overlay"
              data-social-kind="followers"
            >
              ${state.user.followersCount} подписчиков
            </button>
            <span class="profile-hero__dot" aria-hidden="true"></span>
            <span>${state.publicFolders.length} публичных папок</span>
          </div>
        </div>
        <div class="profile-hero__actions">
          <button class="profile-button" type="button" data-action="copy-profile-link">
            <svg width="16" height="16" viewBox="0 0 18 18" fill="none" aria-hidden="true">
              <path d="M7.4 10.6C6.25 9.45 6.25 7.6 7.4 6.45L9.65 4.2C10.8 3.05 12.65 3.05 13.8 4.2C14.95 5.35 14.95 7.2 13.8 8.35L12.78 9.37" stroke="currentColor" stroke-width="1.55" stroke-linecap="round"></path>
              <path d="M10.6 7.4C11.75 8.55 11.75 10.4 10.6 11.55L8.35 13.8C7.2 14.95 5.35 14.95 4.2 13.8C3.05 12.65 3.05 10.8 4.2 9.65L5.22 8.63" stroke="currentColor" stroke-width="1.55" stroke-linecap="round"></path>
            </svg>
            Копировать ссылку на профиль
          </button>
          ${socialButton}
        </div>
      </section>
    `;
  }

  function getStatIcon(type) {
    const icons = {
      movie: `<path d="M3 4.5H15V13.5H3V4.5Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"></path><path d="M6 4.5L4.5 7.2M9 4.5L7.5 7.2M12 4.5L10.5 7.2M3 7.2H15" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"></path>`,
      series: `<path d="M4 5H14V13.5H4V5Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"></path><path d="M6.2 3.2L8.3 5L11.8 2.8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"></path>`,
      episodes: `<path d="M4.2 4.2H13.8V13.8H4.2V4.2Z" stroke="currentColor" stroke-width="1.5"></path><path d="M7 4.2V13.8M11 4.2V13.8M4.2 8.8H13.8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"></path>`,
      hours: `<circle cx="9" cy="9" r="5.8" stroke="currentColor" stroke-width="1.5"></circle><path d="M9 5.9V9.2L11.4 10.7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"></path>`,
    };

    return icons[type] ?? icons.movie;
  }

  function renderStats() {
    const content = state.statsStatus === "ready"
      ? `
        <div class="profile-stats">
          ${state.stats
            .map(
              (stat) => `
                <article class="profile-stat-card" tabindex="0">
                  <span class="profile-stat-card__icon" aria-hidden="true">
                    <svg width="20" height="20" viewBox="0 0 18 18" fill="none">${getStatIcon(stat.icon)}</svg>
                  </span>
                  <p class="profile-stat-card__value">${escapeHtml(String(stat.value))}</p>
                  <p class="profile-stat-card__label">${escapeHtml(stat.label)}</p>
                </article>
              `,
            )
            .join("")}
        </div>
      `
      : `
        <p class="profile-section__hint">
          Статистика появится здесь, когда backend вернёт данные вашей библиотеки.
        </p>
      `;

    return `
      <section class="profile-section" aria-label="Статистика пользователя">
        <div class="profile-section__head">
          <div>
            <h2 class="profile-section__title">Статистика</h2>
            <p class="profile-section__hint">${escapeHtml(
              state.isOwner
                ? "Сводка по вашему просмотру: фильмы, сериалы, эпизоды и общее время."
                : "Сводка по просмотру пользователя: фильмы, сериалы, эпизоды и часы просмотра.",
            )}</p>
          </div>
        </div>
        ${content}
      </section>
    `;
  }

  function renderProfileBackLink() {
    if (state.isOwner) return "";
    const profileUrl = routes.profile();
    return `
      <a class="profile-page__back" href="${escapeHtml(profileUrl)}" data-nav-url="${escapeHtml(profileUrl)}">
        <svg width="16" height="16" viewBox="0 0 18 18" fill="none" aria-hidden="true">
          <path d="M11 4L6 9L11 14" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"></path>
        </svg>
        В свой профиль
      </a>
    `;
  }

  function renderExtensionConnect() {
    if (!state.isOwner || !state.user) return "";

    return `
      <section class="profile-connect" aria-label="Код подключения расширения">
        <div class="profile-connect__content">
          <span class="profile-connect__label">
            Код для подключения расширения
            <span class="profile-connect__help" tabindex="0" aria-label="Подсказка о коде расширения">
              ?
              <span class="profile-connect__tooltip">
                <strong>Расширение автоматически отслеживает, что вы смотрите, и добавляет это в ваш профиль.</strong>
                <br /><br />
                Поддерживаемые платформы: Кинопоиск, ИВИ, Амедиатека, Premier, KION, Wink, Viju
                <br /><br />
                Как начать:
                <br />
                1. Получите код подключения
                <br />
                2. Войдите или зарегистрируйтесь
                <br />
                3. Вставьте код в расширение
                <br /><br />
                После этого просмотр будет сохраняться автоматически.
              </span>
            </span>
          </span>
          <strong class="profile-connect__code">${escapeHtml(state.user.extensionCode || "MT-USER-2026")}</strong>
        </div>
        <button class="profile-button" type="button" data-action="copy-extension-code">
          <svg width="16" height="16" viewBox="0 0 18 18" fill="none" aria-hidden="true">
            <path d="M6.2 6.2V3.9C6.2 3.3 6.7 2.8 7.3 2.8H14.1C14.7 2.8 15.2 3.3 15.2 3.9V10.7C15.2 11.3 14.7 11.8 14.1 11.8H11.8" stroke="currentColor" stroke-width="1.55" stroke-linejoin="round"></path>
            <path d="M3.9 6.2H10.7C11.3 6.2 11.8 6.7 11.8 7.3V14.1C11.8 14.7 11.3 15.2 10.7 15.2H3.9C3.3 15.2 2.8 14.7 2.8 14.1V7.3C2.8 6.7 3.3 6.2 3.9 6.2Z" stroke="currentColor" stroke-width="1.55" stroke-linejoin="round"></path>
          </svg>
          Копировать код
        </button>
      </section>
    `;
  }

  function renderFolderCard(folder) {
    const saveButton = !state.isOwner
      ? `
        <button
          class="profile-button"
          type="button"
          data-action="save-folder"
          data-id="${escapeHtml(folder.id)}"
          ${folder.saved || state.pendingFolderIds.has(folder.id) ? "disabled" : ""}
        >
          ${state.pendingFolderIds.has(folder.id) ? "Добавляем..." : folder.saved ? "Добавлено" : "Добавить к себе"}
        </button>
      `
      : "";

    return renderProfileFolderCard(
      {
        ...folder,
        countText: `${escapeHtml(String(folder.count))} ${getItemWord(folder.count)}`,
      },
      saveButton,
    );
  }

  function renderFoldersSection() {
    const title = state.isOwner ? "Ваши публичные папки" : "Публичные папки";
    const hint = state.isOwner
      ? "Именно эти подборки видят другие пользователи и могут сохранять к себе."
      : "Чужие публичные подборки доступны для просмотра и сохранения в вашу библиотеку.";

    const content = state.publicFolders.length
      ? `
        <div class="folders-grid profile-public-folders">
          ${state.publicFolders.map(renderFolderCard).join("")}
        </div>
      `
      : `
        <div class="profile-empty-state" aria-live="polite">
          <strong>${escapeHtml(
            state.isOwner ? "Пока нет публичных папок" : "У пользователя пока нет публичных папок",
          )}</strong>
          <p>${escapeHtml(
            state.isOwner
              ? "Сделайте любую папку публичной на странице папок, и она появится здесь."
              : "Когда пользователь откроет хотя бы одну папку для общего доступа, она появится на этой странице.",
          )}</p>
        </div>
      `;

    return `
      <section class="profile-section" aria-label="${escapeHtml(title)}">
        <div class="profile-section__head">
          <div>
            <h2 class="profile-section__title">${escapeHtml(title)}</h2>
            <p class="profile-section__hint">${escapeHtml(hint)}</p>
          </div>
        </div>
        ${content}
      </section>
    `;
  }

  function renderLogoutSection() {
    if (!state.isOwner) return "";

    return `
      <section class="profile-logout" aria-label="Выход из профиля">
        <button class="profile-logout__button" type="button" data-action="logout-profile">
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
            <path d="M7.2 3.2H4.4C3.74 3.2 3.2 3.74 3.2 4.4V13.6C3.2 14.26 3.74 14.8 4.4 14.8H7.2" stroke="currentColor" stroke-width="1.55" stroke-linecap="round"></path>
            <path d="M10.3 5.4L13.9 9L10.3 12.6M6.8 9H13.8" stroke="currentColor" stroke-width="1.55" stroke-linecap="round" stroke-linejoin="round"></path>
          </svg>
          Выйти из профиля
        </button>
      </section>
    `;
  }

  function renderEditProfileOverlay() {
    const overlay = state.editProfileOverlay;
    if (!overlay.isOpen || !state.isOwner) return "";

    return `
      <div class="modal-backdrop" data-modal-backdrop="edit-profile">
        <section class="modal-card profile-edit-modal" role="dialog" aria-modal="true" aria-label="Редактировать профиль">
          <button class="modal-card__close" type="button" data-action="close-edit-profile" aria-label="Закрыть">
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
              <path d="M4.5 4.5L13.5 13.5M13.5 4.5L4.5 13.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"></path>
            </svg>
          </button>
          <h2 class="modal-card__title">Редактировать профиль</h2>

          <div class="profile-edit-form">
            <div class="profile-edit-field">
              <span>Аватарка</span>
              <div class="profile-edit-avatar-preview" aria-hidden="true">
                ${renderUserAvatar({
                  avatarKey: overlay.avatarKey,
                  avatarImage: overlay.avatarImage,
                  size: 82,
                  className: "profile-edit-avatar-preview__visual",
                  iconSize: 32,
                })}
              </div>
              <div class="profile-avatar-upload-row">
                <label class="profile-avatar-upload ${overlay.avatarImage ? "profile-avatar-upload--active" : ""}">
                  <input
                    class="sr-only"
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/gif"
                    data-profile-avatar-input
                  />
                  <span class="profile-avatar-upload__button">Загрузить с устройства</span>
                  <span class="profile-avatar-upload__hint" data-profile-avatar-status>
                    ${overlay.avatarImage ? "Фото загружено с устройства" : "PNG, JPG, WEBP или GIF до 3 МБ"}
                  </span>
                </label>
                ${overlay.avatarImage
                  ? `<button class="profile-avatar-reset" type="button" data-action="clear-custom-avatar">Убрать фото</button>`
                  : ""}
              </div>
              ${renderAvatarPicker(overlay.avatarKey, Boolean(overlay.avatarImage))}
            </div>
            <label class="profile-edit-field">
              <span>Имя</span>
              <input class="profile-edit-input" type="text" value="${escapeHtml(overlay.displayName)}" data-profile-edit-name maxlength="80" />
            </label>
            <label class="profile-edit-field">
              <span>Логин пользователя</span>
              <input class="profile-edit-input" type="text" value="${escapeHtml(overlay.username)}" data-profile-edit-username maxlength="40" />
            </label>
          </div>

          <div class="profile-edit-footer">
            <button class="profile-edit-delete" type="button" data-action="request-delete-account">
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
                <path d="M4.2 5.6H13.8" stroke="currentColor" stroke-width="1.55" stroke-linecap="round"></path>
                <path d="M7.2 3.8H10.8M6 5.6L6.45 14.1C6.49 14.73 7 15.2 7.63 15.2H10.37C11 15.2 11.51 14.73 11.55 14.1L12 5.6" stroke="currentColor" stroke-width="1.55" stroke-linecap="round" stroke-linejoin="round"></path>
              </svg>
              Удалить аккаунт
            </button>
            <div class="profile-edit-footer__actions">
              <button class="modal-card__secondary" type="button" data-action="close-edit-profile">Отмена</button>
              <button class="modal-card__confirm" type="button" data-action="save-profile">Сохранить</button>
            </div>
          </div>
        </section>
      </div>
    `;
  }

  function renderDeleteConfirmOverlay() {
    if (!state.editProfileOverlay.confirmDelete || !state.isOwner) return "";

    return `
      <div class="modal-backdrop profile-delete-backdrop" data-modal-backdrop="delete-account">
        <section class="modal-card profile-delete-modal" role="dialog" aria-modal="true" aria-label="Удалить аккаунт">
          <button class="modal-card__close" type="button" data-action="cancel-delete-account" aria-label="Закрыть">
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
              <path d="M4.5 4.5L13.5 13.5M13.5 4.5L4.5 13.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"></path>
            </svg>
          </button>
          <h2 class="modal-card__title">Удалить аккаунт?</h2>
          <p class="profile-delete-modal__text">Вы уверены что хотите удалить аккаунт?</p>
          <div class="modal-card__footer profile-delete-modal__footer">
            <button class="modal-card__secondary" type="button" data-action="cancel-delete-account">Отмена</button>
            <button class="modal-card__confirm modal-card__confirm--danger" type="button" data-action="confirm-delete-account">Удалить</button>
          </div>
        </section>
      </div>
    `;
  }

  function getSocialOverlayTitle(kind) {
    return kind === "followers" ? "Подписчики" : "Подписки";
  }

  function getSocialOverlayEmptyText(kind) {
    if (kind === "followers") {
      return state.isOwner
        ? "У вас пока нет подписчиков."
        : "У пользователя пока нет подписчиков.";
    }

    return state.isOwner
      ? "У вас пока нет подписок."
      : "Пользователь пока ни на кого не подписан.";
  }

  function readSocialOverlayCollection(data, kind) {
    if (Array.isArray(data?.items)) {
      return { found: true, items: data.items };
    }

    if (Array.isArray(data?.users)) {
      return { found: true, items: data.users };
    }

    if (Array.isArray(data?.profiles)) {
      return { found: true, items: data.profiles };
    }

    if (Array.isArray(data?.[kind])) {
      return { found: true, items: data[kind] };
    }

    if (Array.isArray(data)) {
      return { found: true, items: data };
    }

    return { found: false, items: [] };
  }

  function normalizeSocialOverlayItems(items) {
    return items
      .map((item) => {
        const normalizedUser = normalizeProfileUser(
          item,
          currentUser,
        );

        return {
          ...normalizedUser,
          followingCount: normalizeCountValue(
            item?.followingCount ?? item?.following_count,
            normalizedUser.followingCount,
          ),
          followersCount: normalizeCountValue(
            item?.followersCount ?? item?.followers_count,
            normalizedUser.followersCount,
          ),
          isViewer:
            item?.isViewer ??
            item?.is_viewer ??
            normalizedUser.id === state.viewerId,
        };
      })
      .filter((item) => item.id && item.username)
      .sort((left, right) => left.displayName.localeCompare(right.displayName, "ru"));
  }

  async function fetchSocialOverlayUsers(kind) {
    if (!state.user?.id) {
      return [];
    }

    const requestUrl = new URL(
      `${API_V1_BASE_URL}/profiles/${encodeURIComponent(state.user.id)}/${kind}`,
      window.location.origin,
    );

    if (state.viewerId) {
      requestUrl.searchParams.set("viewerId", state.viewerId);
    }

    try {
      const data = await sendProfileRequest(requestUrl.href, { method: "GET" });
      const collection = readSocialOverlayCollection(data, kind);

      if (!collection.found) {
        throw new Error("Backend не вернул список пользователей");
      }

      return normalizeSocialOverlayItems(collection.items);
    } catch (error) {
      console.warn(`Не удалось загрузить список ${kind}`, error);
      throw error;
    }
  }

  function renderSocialOverlay() {
    if (!state.socialOverlay.isOpen || !state.user) return "";

    const title = getSocialOverlayTitle(state.socialOverlay.kind);
    const overlayStatus = state.socialOverlay.status ?? "idle";
    const items = state.socialOverlay.items ?? [];
    const body = overlayStatus === "loading"
      ? `
        <div class="modal-card__body">
          <div class="profile-social-empty" aria-live="polite">
            <strong>${escapeHtml(title)}</strong>
            <p>Загружаем список...</p>
          </div>
        </div>
      `
      : overlayStatus === "error"
      ? `
        <div class="modal-card__body">
          <div class="profile-social-empty" aria-live="polite">
            <strong>${escapeHtml(title)}</strong>
            <p>Не удалось загрузить список. Попробуйте еще раз позже.</p>
          </div>
        </div>
      `
      : items.length
      ? `
        <div class="modal-card__body">
          <div class="profile-social-list" role="list" aria-label="${escapeHtml(title)}">
            ${items
              .map(
                (item) => `
                  <button class="profile-social-item" type="button" data-nav-url="${escapeHtml(item.profileUrl)}" role="listitem">
                    <span class="profile-social-item__avatar">
                      ${renderUserAvatar({
                        avatarKey: item.avatarKey,
                        avatarImage: item.avatarImage,
                        size: 52,
                        className: "profile-social-item__avatar-visual",
                        iconSize: 22,
                      })}
                    </span>
                    <span class="profile-social-item__content">
                      <span class="profile-social-item__title-row">
                        <span class="profile-social-item__name">${escapeHtml(item.displayName)}</span>
                        ${item.isViewer ? '<span class="profile-social-item__badge">Вы</span>' : ""}
                      </span>
                      <span class="profile-social-item__username">@${escapeHtml(item.username)}</span>
                      <span class="profile-social-item__stats">
                        ${item.followingCount} подписок
                        <span class="profile-social-item__dot" aria-hidden="true"></span>
                        ${item.followersCount} подписчиков
                      </span>
                    </span>
                  </button>
                `,
              )
              .join("")}
          </div>
        </div>
      `
      : `
        <div class="modal-card__body">
          <div class="profile-social-empty" aria-live="polite">
            <strong>${escapeHtml(title)}</strong>
            <p>${escapeHtml(getSocialOverlayEmptyText(state.socialOverlay.kind))}</p>
          </div>
        </div>
      `;

    return `
      <div class="modal-backdrop" data-modal-backdrop="social-profile-list">
        <section class="modal-card profile-social-modal" role="dialog" aria-modal="true" aria-label="${escapeHtml(title)}">
          <button class="modal-card__close" type="button" data-action="close-social-overlay" aria-label="Закрыть">
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
              <path d="M4.5 4.5L13.5 13.5M13.5 4.5L4.5 13.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"></path>
            </svg>
          </button>
          <h2 class="modal-card__title">${escapeHtml(title)}</h2>
          <p class="profile-social-modal__hint">Нажмите на профиль, чтобы открыть страницу пользователя.</p>
          ${body}
        </section>
      </div>
    `;
  }

  function renderStateCard(title, text, actionLabel = "", actionUrl = routes.profile()) {
    return renderPageState({
      className: "profile-empty-state profile-empty-state--page",
      title,
      text,
      actionLabel,
      actionUrl,
    });
  }

  function renderReadyPage() {
    return `
      ${renderProfileBackLink()}
      ${renderProfileHero()}
      ${renderExtensionConnect()}
      ${renderStats()}
      ${renderFoldersSection()}
      ${renderLogoutSection()}
      ${renderAppFooter()}
    `;
  }

  function renderContent() {
    if (state.status === "loading") {
      return renderStateCard("Загружаем профиль", "Собираем публичные папки, подписки и данные пользователя.");
    }

    if (state.status === "missing") {
      return renderStateCard("Профиль не найден", "Такой пользователь не найден или ссылка больше не актуальна.", "Перейти в мой профиль");
    }

    if (state.status !== "ready") {
      return renderStateCard("Не удалось открыть профиль", state.errorMessage || PROFILE_TEMPORARY_ERROR_MESSAGE, "Открыть мой профиль");
    }

    return renderReadyPage();
  }

  function renderOverlays() {
    return `${renderEditProfileOverlay()}${renderDeleteConfirmOverlay()}${renderSocialOverlay()}`;
  }

  function renderPage() {
    return `
      <div class="history-page profile-page">
        <h1 class="sr-only">Профиль пользователя Movie Tracker</h1>
        <div class="history-page__shell">
          <div data-profile-header>
            ${renderAppHeader({ tabs: state.tabs, profileActive: true })}
          </div>
          <div class="history-page__content" data-profile-content>
            ${renderContent()}
          </div>
        </div>
        <div data-profile-toasts>${renderToasts(state.toasts)}</div>
        <div data-profile-overlays>${renderOverlays()}</div>
      </div>
    `;
  }

  function getItemWord(count) {
    return pluralizeRu(count, { one: "элемент", few: "элемента", many: "элементов" });
  }

  function renderApp(scope = "full") {
    if (!rootElement) return;

    if (scope === "full" || !rootElement.querySelector("[data-profile-content]")) {
      rootElement.innerHTML = renderPage();
      return;
    }

    const headerHost = rootElement.querySelector("[data-profile-header]");
    const contentHost = rootElement.querySelector("[data-profile-content]");
    const toastsHost = rootElement.querySelector("[data-profile-toasts]");
    const overlaysHost = rootElement.querySelector("[data-profile-overlays]");

    if (scope === "content") {
      if (headerHost) {
        headerHost.innerHTML = renderAppHeader({ tabs: state.tabs, profileActive: true });
      }
      if (contentHost) {
        contentHost.innerHTML = renderContent();
      }
    }

    if (toastsHost) {
      toastsHost.innerHTML = renderToasts(state.toasts);
    }

    if (overlaysHost) {
      syncOverlayHost(overlaysHost, renderOverlays());
    }
  }

  async function copyProfileLink() {
    if (!state.user?.profileUrl) return;

    try {
      await writeClipboardText(state.user.profileUrl);
      showToast("Ссылка на профиль скопирована", "success");
    } catch (error) {
      console.error(error);
      showToast("Не удалось скопировать ссылку", "error");
    }
  }

  async function copyExtensionCode() {
    if (!state.isOwner || !state.user?.extensionCode) return;

    try {
      await writeClipboardText(state.user.extensionCode);
      showToast("Код расширения скопирован", "success");
    } catch (error) {
      console.error(error);
      showToast("Не удалось скопировать код", "error");
    }
  }

  async function copyFolderLink(folderId) {
    const folder = state.publicFolders.find((item) => item.id === folderId);
    if (!folder) return;

    try {
      await writeClipboardText(folder.publicUrl || getFolderPublicUrl(folder));
      showToast("Ссылка скопирована", "success");
    } catch (error) {
      console.error(error);
      showToast("Не удалось скопировать ссылку", "error");
    }
  }

  async function toggleFollow() {
    if (state.isOwner || !state.user || state.pendingFollow) return;

    setState((currentState) => ({
      ...currentState,
      pendingFollow: true,
    }));

    try {
      const result = state.user.isFollowing
        ? await unfollowUser(state.user.id, state.viewerId)
        : await followUser(state.user.id, state.viewerId);
      const updatedUser = normalizeProfileUser(
        {
          ...state.user,
          ...result.user,
        },
        state.user,
      );

      setState((currentState) => ({
        ...currentState,
        user: updatedUser,
        pendingFollow: false,
      }));
      showToast(
        updatedUser.isFollowing ? "Подписка оформлена" : "Подписка отменена",
        "success",
      );
    } catch (error) {
      console.error(error);
      setState((currentState) => ({
        ...currentState,
        pendingFollow: false,
      }));
      showToast("Не удалось обновить подписку", "error");
    }
  }

  async function savePublicFolder(folderId) {
    const folder = state.publicFolders.find((item) => item.id === folderId);
    if (!folder || folder.saved || state.pendingFolderIds.has(folderId)) return;

    state.pendingFolderIds.add(folderId);
    renderApp();

    try {
      await saveFolder(folderId, state.viewerId);
      setState((currentState) => ({
        ...currentState,
        publicFolders: currentState.publicFolders.map((item) =>
          item.id === folderId ? { ...item, saved: true } : item,
        ),
        pendingFolderIds: new Set(
          [...currentState.pendingFolderIds].filter((pendingId) => pendingId !== folderId),
        ),
      }));
      showToast("Папка добавлена", "success");
    } catch (error) {
      console.error(error);
      setState((currentState) => ({
        ...currentState,
        pendingFolderIds: new Set(
          [...currentState.pendingFolderIds].filter((pendingId) => pendingId !== folderId),
        ),
      }));
      showToast("Не удалось добавить папку", "error");
    }
  }

  function openEditProfileOverlay() {
    if (!state.isOwner || !state.user) return;

    setState((currentState) => ({
      ...currentState,
      editProfileOverlay: {
        isOpen: true,
        displayName: currentState.user.displayName,
        username: currentState.user.username,
        avatarKey: currentState.user.avatarKey ?? defaultAvatarKey,
        avatarImage: currentState.user.avatarImage ?? "",
        confirmDelete: false,
      },
    }), { scope: "overlay" });
  }

  function closeEditProfileOverlay() {
    setState((currentState) => ({
      ...currentState,
      editProfileOverlay: { ...initialState.editProfileOverlay },
    }), { scope: "overlay" });
  }

  async function openSocialOverlay(kind) {
    if (!state.user) return;
    if (kind !== "following" && kind !== "followers") return;
    if (socialOverlayPendingKind === kind) return;

    const requestId = ++socialOverlayRequestId;
    socialOverlayPendingKind = kind;

    setState((currentState) => ({
      ...currentState,
      socialOverlay: {
        isOpen: true,
        kind,
        status: "loading",
        items: [],
      },
    }), { scope: "overlay" });

    try {
      const items = await fetchSocialOverlayUsers(kind);
      if (requestId !== socialOverlayRequestId) {
        return;
      }

      setState((currentState) => {
        if (!currentState.socialOverlay.isOpen || currentState.socialOverlay.kind !== kind) {
          return currentState;
        }

        return {
          ...currentState,
          user: currentState.user
            ? {
                ...currentState.user,
                [getSocialCountKey(kind)]: items.length,
              }
            : null,
          socialOverlay: {
            isOpen: true,
            kind,
            status: "ready",
            items,
          },
        };
      }, { scope: "overlay" });
    } catch (error) {
      if (requestId !== socialOverlayRequestId) {
        return;
      }

      setState((currentState) => ({
        ...currentState,
        socialOverlay: {
          isOpen: true,
          kind,
          status: "error",
          items: [],
        },
      }), { scope: "overlay" });
    } finally {
      if (requestId === socialOverlayRequestId) {
        socialOverlayPendingKind = "";
      }
    }
  }

  function closeSocialOverlay() {
    socialOverlayRequestId += 1;
    socialOverlayPendingKind = "";

    setState((currentState) => ({
      ...currentState,
      socialOverlay: { ...initialState.socialOverlay },
    }), { scope: "overlay" });
  }

  function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result ?? ""));
      reader.onerror = () => reject(new Error("Не удалось прочитать файл"));
      reader.readAsDataURL(file);
    });
  }

  function loadImageElement(src) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("Не удалось загрузить изображение"));
      image.src = src;
    });
  }

  async function prepareAvatarImage(file) {
    if (!file) {
      throw new Error("Выберите файл изображения");
    }

    if (!String(file.type || "").startsWith("image/")) {
      throw new Error("Поддерживаются только изображения");
    }

    if (file.size > AVATAR_UPLOAD_MAX_BYTES) {
      throw new Error("Файл слишком большой. Максимум 3 МБ");
    }

    const originalDataUrl = await readFileAsDataUrl(file);
    const image = await loadImageElement(originalDataUrl);
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");

    if (!context) {
      throw new Error("Не удалось подготовить изображение");
    }

    canvas.width = AVATAR_OUTPUT_SIZE;
    canvas.height = AVATAR_OUTPUT_SIZE;

    const sourceSize = Math.min(image.naturalWidth, image.naturalHeight);
    const sourceX = (image.naturalWidth - sourceSize) / 2;
    const sourceY = (image.naturalHeight - sourceSize) / 2;

    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(
      image,
      sourceX,
      sourceY,
      sourceSize,
      sourceSize,
      0,
      0,
      AVATAR_OUTPUT_SIZE,
      AVATAR_OUTPUT_SIZE,
    );

    return canvas.toDataURL("image/jpeg", 0.9);
  }

  function syncEditProfileAvatarUI() {
    if (!rootElement || !state.editProfileOverlay.isOpen) return;

    const preview = rootElement.querySelector(".profile-edit-avatar-preview");
    if (preview) {
      preview.innerHTML = renderUserAvatar({
        avatarKey: state.editProfileOverlay.avatarKey,
        avatarImage: state.editProfileOverlay.avatarImage,
        size: 82,
        className: "profile-edit-avatar-preview__visual",
        iconSize: 32,
      });
    }

    rootElement.querySelectorAll("[data-profile-avatar]").forEach((button) => {
      const isSelected =
        !state.editProfileOverlay.avatarImage &&
        button.dataset.profileAvatar === state.editProfileOverlay.avatarKey;
      button.classList.toggle("profile-avatar-option--selected", isSelected);
      button.setAttribute("aria-checked", isSelected ? "true" : "false");
    });

    const uploadLabel = rootElement.querySelector(".profile-avatar-upload");
    uploadLabel?.classList.toggle(
      "profile-avatar-upload--active",
      Boolean(state.editProfileOverlay.avatarImage),
    );

    const uploadStatus = rootElement.querySelector("[data-profile-avatar-status]");
    if (uploadStatus) {
      uploadStatus.textContent = state.editProfileOverlay.avatarImage
        ? "Фото загружено с устройства"
        : "PNG, JPG, WEBP или GIF до 3 МБ";
    }

    const resetButton = rootElement.querySelector(".profile-avatar-reset");
    if (state.editProfileOverlay.avatarImage) {
      if (!resetButton) {
        rootElement
          .querySelector(".profile-avatar-upload-row")
          ?.insertAdjacentHTML(
            "beforeend",
            `<button class="profile-avatar-reset" type="button" data-action="clear-custom-avatar">Убрать фото</button>`,
          );
      }
    } else {
      resetButton?.remove();
    }
  }

  function selectProfileAvatar(avatarKey) {
    if (!avatarPresets[avatarKey]) return;
    if (state.editProfileOverlay.avatarKey === avatarKey && !state.editProfileOverlay.avatarImage) return;

    state.editProfileOverlay.avatarKey = avatarKey;
    state.editProfileOverlay.avatarImage = "";
    syncEditProfileAvatarUI();
  }

  async function applyCustomAvatarFile(file) {
    const avatarImage = await prepareAvatarImage(file);
    state.editProfileOverlay.avatarImage = avatarImage;
    syncEditProfileAvatarUI();
  }

  function clearCustomAvatar() {
    if (!state.editProfileOverlay.avatarImage) return;
    state.editProfileOverlay.avatarImage = "";
    syncEditProfileAvatarUI();
  }

  function applyProfileUpdate(updatedUser) {
    persistCurrentUser(updatedUser);
    upsertUser(updatedUser);

    setState((currentState) => ({
      ...currentState,
      user: {
        ...currentState.user,
        ...updatedUser,
        profileUrl: getProfileUrl(updatedUser.username, true),
      },
      editProfileOverlay: { ...initialState.editProfileOverlay },
    }));

    syncProfileLocation(updatedUser, true);
  }

  function canFallbackToLocalProfileSave(error, hasToken) {
    if (!hasToken) return true;
    return [404, 405, 501].includes(error?.status);
  }

  async function saveProfile() {
    if (!state.isOwner || !state.user) return;

    const displayName = state.editProfileOverlay.displayName.trim();
    const username = state.editProfileOverlay.username.trim().replace(/^@+/, "");
    const avatarKey = avatarPresets[state.editProfileOverlay.avatarKey]
      ? state.editProfileOverlay.avatarKey
      : defaultAvatarKey;
    const avatarImage = state.editProfileOverlay.avatarImage || "";

    if (!displayName || !username) {
      showToast("Заполните имя и логин", "error");
      return;
    }

    const hasToken = Boolean(readAccessToken());
    let updatedUser = {
      ...state.user,
      displayName,
      username,
      avatarKey,
      avatarImage,
      profileUrl: getProfileUrl(username, true),
    };

    try {
      if (hasToken) {
        const responseData = await profileApi.updateProfile({
          displayName,
          username,
          avatarKey,
          avatarImage,
        });
        updatedUser = {
          ...updatedUser,
          ...normalizeProfileUser(responseData, updatedUser),
          avatarKey:
            responseData?.avatarKey ??
            responseData?.avatar_key ??
            updatedUser.avatarKey,
          avatarImage:
            responseData?.avatarImage ??
            responseData?.avatar_image ??
            updatedUser.avatarImage,
        };
      }

      applyProfileUpdate(updatedUser);
      showToast(hasToken ? "Профиль обновлен" : "Профиль сохранен локально", "success");
    } catch (error) {
      console.error(error);

      if (canFallbackToLocalProfileSave(error, hasToken)) {
        applyProfileUpdate(updatedUser);
        showToast("Профиль сохранен локально", "success");
        return;
      }

      showToast("Не удалось сохранить профиль", "error");
    }
  }

  function requestDeleteAccount() {
    setState((currentState) => ({
      ...currentState,
      editProfileOverlay: {
        ...currentState.editProfileOverlay,
        confirmDelete: true,
      },
    }), { scope: "overlay" });
  }

  function cancelDeleteAccount() {
    setState((currentState) => ({
      ...currentState,
      editProfileOverlay: {
        ...currentState.editProfileOverlay,
        confirmDelete: false,
      },
    }), { scope: "overlay" });
  }

  async function confirmDeleteAccount() {
    try {
      await profileApi.deleteAccount();
      localStorage.removeItem(CURRENT_USER_STORAGE_KEY);
      localStorage.removeItem(ACCESS_TOKEN_STORAGE_KEY);
      closeEditProfileOverlay();
      showToast("Удаление аккаунта будет завершено на backend", "success");
    } catch (error) {
      console.error(error);
      showToast("Не удалось удалить аккаунт", "error");
    }
  }

  function logoutProfile() {
    localStorage.removeItem(CURRENT_USER_STORAGE_KEY);
    localStorage.removeItem(ACCESS_TOKEN_STORAGE_KEY);
    window.location.replace(routes.home);
  }

  function openFolder(folderId) {
    const folder = state.publicFolders.find((item) => item.id === folderId);
    if (!folder?.pageUrl) return;
    navigateToPage(folder.pageUrl);
  }

  function handleRootClick(event) {
    const navButton = event.target.closest("[data-nav-url]");
    if (navButton) {
      navigateToPage(navButton.dataset.navUrl);
      return;
    }

    const avatarOption = event.target.closest("[data-profile-avatar]");
    if (avatarOption) {
      selectProfileAvatar(avatarOption.dataset.profileAvatar);
      return;
    }

    const actionButton = event.target.closest("[data-action]");
    if (actionButton) {
      const action = actionButton.dataset.action;
      const folderId = actionButton.dataset.id;

      if (action === "copy-profile-link") {
        copyProfileLink();
        return;
      }

      if (action === "copy-extension-code") {
        copyExtensionCode();
        return;
      }

      if (action === "copy-folder-link") {
        copyFolderLink(folderId);
        return;
      }

      if (action === "edit-profile") {
        openEditProfileOverlay();
        return;
      }

      if (action === "close-edit-profile") {
        closeEditProfileOverlay();
        return;
      }

      if (action === "open-social-overlay") {
        openSocialOverlay(actionButton.dataset.socialKind);
        return;
      }

      if (action === "close-social-overlay") {
        closeSocialOverlay();
        return;
      }

      if (action === "save-profile") {
        saveProfile();
        return;
      }

      if (action === "clear-custom-avatar") {
        clearCustomAvatar();
        return;
      }

      if (action === "request-delete-account") {
        requestDeleteAccount();
        return;
      }

      if (action === "cancel-delete-account") {
        cancelDeleteAccount();
        return;
      }

      if (action === "confirm-delete-account") {
        confirmDeleteAccount();
        return;
      }

      if (action === "logout-profile") {
        logoutProfile();
        return;
      }

      if (action === "save-folder") {
        savePublicFolder(folderId);
        return;
      }

      if (action === "toggle-follow") {
        toggleFollow();
      }
    }

    if (event.target.dataset.modalBackdrop === "edit-profile") {
      closeEditProfileOverlay();
      return;
    }

    if (event.target.dataset.modalBackdrop === "delete-account") {
      cancelDeleteAccount();
      return;
    }

    if (event.target.dataset.modalBackdrop === "social-profile-list") {
      closeSocialOverlay();
      return;
    }

    const folderCard = event.target.closest("[data-folder-card]");
    if (folderCard && !event.target.closest("button, a, input, textarea, select")) {
      openFolder(folderCard.dataset.folderCard);
    }
  }

  function handleRootInput(event) {
    const nameInput = event.target.closest("[data-profile-edit-name]");
    if (nameInput) {
      state.editProfileOverlay.displayName = nameInput.value;
      return;
    }

    const usernameInput = event.target.closest("[data-profile-edit-username]");
    if (usernameInput) {
      state.editProfileOverlay.username = usernameInput.value;
    }
  }

  async function handleRootChange(event) {
    const avatarInput = event.target.closest("[data-profile-avatar-input]");
    if (!avatarInput) return;

    const file = avatarInput.files?.[0];
    if (!file) return;

    try {
      await applyCustomAvatarFile(file);
    } catch (error) {
      console.error(error);
      showToast(error.message || "Не удалось загрузить изображение", "error");
    } finally {
      avatarInput.value = "";
    }
  }

  function handleRootKeydown(event) {
    if (event.key === "Escape" && state.editProfileOverlay.confirmDelete) {
      cancelDeleteAccount();
      return;
    }

    if (event.key === "Escape" && state.socialOverlay.isOpen) {
      closeSocialOverlay();
      return;
    }

    if (event.key === "Escape" && state.editProfileOverlay.isOpen) {
      closeEditProfileOverlay();
      return;
    }

    const folderCard = event.target.closest("[data-folder-card]");
    if (!folderCard || event.target !== folderCard) return;
    if (event.key !== "Enter" && event.key !== " ") return;

    event.preventDefault();
    openFolder(folderCard.dataset.folderCard);
  }

  function initProfilePage() {
    if (!ensureAuthenticatedPageAccess()) return;

    rootElement = getProfileRootElement();
    if (!rootElement) return;

    rootElement.addEventListener("click", handleRootClick);
    rootElement.addEventListener("keydown", handleRootKeydown);
    rootElement.addEventListener("input", handleRootInput);
    rootElement.addEventListener("change", handleRootChange);
    renderApp();
    loadProfileView();
  }

  initProfilePage();
})();
