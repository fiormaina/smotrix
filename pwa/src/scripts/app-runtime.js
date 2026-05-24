/*
 * Movie Tracker shared runtime bundle.
 * Rebuild with: ./scripts/build-app-runtime.ps1
 * Source files:
 * - src/scripts/core/config.js
 * - src/scripts/core/api-client.js
 * - src/scripts/core/routes.js
 * - src/scripts/core/common-ui.js
 * - src/scripts/utils/helpers.js
 * - src/scripts/components/app-shell.js
 * - src/scripts/components/feedback.js
 * - src/scripts/components/folder-card.js
 */
(() => {
  const API_BASE_URL_STORAGE_KEY = "movieTracker.apiBaseUrl";
  const ACCESS_TOKEN_STORAGE_KEY = "movieTracker.accessToken";
  const CURRENT_USER_STORAGE_KEY = "movieTracker.currentUser";
  const APP_STATE_TRANSFER_HASH_KEY = "movieTrackerState";
  const LOCAL_API_BASE_URL = "http://127.0.0.1:8000";
  const LOCAL_API_PORT = "8000";
  const currentUrl = new URL(window.location.href);
  const currentPath = window.location.pathname;
  const pagesMarker = "/pages/";

  function normalizeUrl(value) {
    return String(value ?? "").trim().replace(/\/+$/, "");
  }

  function isLoopbackHostname(hostname) {
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
  }

  function isPrivateIpv4Hostname(hostname) {
    const match = String(hostname).match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
    if (!match) return false;

    const octets = match.slice(1).map((value) => Number(value));
    if (octets.some((value) => Number.isNaN(value) || value < 0 || value > 255)) {
      return false;
    }

    return (
      octets[0] === 10 ||
      (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) ||
      (octets[0] === 192 && octets[1] === 168)
    );
  }

  function resolveDefaultApiBaseUrl() {
    const { protocol, hostname } = window.location;

    if (isLoopbackHostname(hostname)) {
      return LOCAL_API_BASE_URL;
    }

    if (protocol === "http:" && isPrivateIpv4Hostname(hostname)) {
      return `http://${hostname}:${LOCAL_API_PORT}`;
    }

    return LOCAL_API_BASE_URL;
  }

  function normalizeAppBaseUrl(value) {
    const trimmedValue = String(value ?? "").trim();
    if (!trimmedValue) return "";

    try {
      const normalizedUrl = new URL(trimmedValue, window.location.href);
      normalizedUrl.pathname = normalizedUrl.pathname.replace(/\/?$/, "/");
      normalizedUrl.search = "";
      normalizedUrl.hash = "";
      return normalizedUrl.href;
    } catch (error) {
      return "";
    }
  }

  function getProjectRootPath(pathname) {
    const safePathname = String(pathname ?? "");
    return safePathname.includes(pagesMarker)
      ? `${safePathname.slice(0, safePathname.indexOf(pagesMarker) + 1)}`
      : safePathname.replace(/[^/]*$/, "");
  }

  function resolveCurrentAppBaseUrl() {
    return normalizeAppBaseUrl(new URL(getProjectRootPath(currentPath), window.location.origin).href);
  }

  function readStoredApiBaseUrl() {
    try {
      return normalizeUrl(window.localStorage.getItem(API_BASE_URL_STORAGE_KEY));
    } catch (error) {
      return "";
    }
  }

  function persistApiBaseUrl(value) {
    try {
      if (value) {
        window.localStorage.setItem(API_BASE_URL_STORAGE_KEY, value);
      } else {
        window.localStorage.removeItem(API_BASE_URL_STORAGE_KEY);
      }
    } catch (error) {
      return;
    }
  }

  function persistTransferredState(state) {
    if (!state || typeof state !== "object") return;

    try {
      if (typeof state.apiBaseUrl === "string" && normalizeUrl(state.apiBaseUrl)) {
        window.localStorage.setItem(API_BASE_URL_STORAGE_KEY, normalizeUrl(state.apiBaseUrl));
      }

      if (typeof state.accessToken === "string" && state.accessToken.trim()) {
        window.localStorage.setItem(ACCESS_TOKEN_STORAGE_KEY, state.accessToken.trim());
      }

      if (state.currentUser && typeof state.currentUser === "object") {
        window.localStorage.setItem(CURRENT_USER_STORAGE_KEY, JSON.stringify(state.currentUser));
      }
    } catch (error) {
      console.warn(error);
    }
  }

  function decodeBase64UrlUtf8(value) {
    const normalizedBase64 = String(value ?? "").replace(/-/g, "+").replace(/_/g, "/");
    const paddedBase64 = normalizedBase64.padEnd(
      normalizedBase64.length + ((4 - (normalizedBase64.length % 4)) % 4),
      "=",
    );
    const binary = window.atob(paddedBase64);
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  }

  function consumeTransferredState() {
    const hashValue = currentUrl.hash.startsWith("#") ? currentUrl.hash.slice(1) : currentUrl.hash;
    if (!hashValue) return;

    const hashParams = new URLSearchParams(hashValue);
    const encodedState = hashParams.get(APP_STATE_TRANSFER_HASH_KEY);
    if (!encodedState) return;

    try {
      const decodedJson = decodeBase64UrlUtf8(encodedState);
      const parsedState = JSON.parse(decodedJson);
      persistTransferredState(parsedState);
    } catch (error) {
      console.warn(error);
    }

    hashParams.delete(APP_STATE_TRANSFER_HASH_KEY);
    const nextHash = hashParams.toString();
    currentUrl.hash = nextHash ? `#${nextHash}` : "";
    window.history.replaceState({}, "", `${currentUrl.pathname}${currentUrl.search}${currentUrl.hash}`);
  }

  function resolveAppBaseUrl() {
    const metaValue = normalizeAppBaseUrl(
      document.querySelector('meta[name="movie-tracker-app-base-url"]')?.content,
    );
    if (metaValue) {
      return metaValue;
    }

    const globalValue = normalizeAppBaseUrl(window.__MOVIE_TRACKER_CONFIG__?.appBaseUrl);
    if (globalValue) {
      return globalValue;
    }

    return resolveCurrentAppBaseUrl();
  }

  consumeTransferredState();

  function resolveApiBaseUrl() {
    const queryValue = normalizeUrl(currentUrl.searchParams.get("apiBaseUrl"));

    if (queryValue) {
      persistApiBaseUrl(queryValue);
      currentUrl.searchParams.delete("apiBaseUrl");
      window.history.replaceState({}, "", `${currentUrl.pathname}${currentUrl.search}${currentUrl.hash}`);
      return queryValue;
    }

    const globalValue = normalizeUrl(window.__MOVIE_TRACKER_CONFIG__?.apiBaseUrl);
    if (globalValue) {
      return globalValue;
    }

    const storedValue = readStoredApiBaseUrl();
    if (storedValue) {
      return storedValue;
    }

    return resolveDefaultApiBaseUrl();
  }

  const appBaseUrl = resolveAppBaseUrl();
  const projectRootPath = getProjectRootPath(new URL(appBaseUrl).pathname) || getProjectRootPath(currentPath);

  window.MovieTrackerConfig = Object.freeze({
    apiBaseUrl: resolveApiBaseUrl(),
    apiBaseUrlStorageKey: API_BASE_URL_STORAGE_KEY,
    appBaseUrl,
    appStateTransferHashKey: APP_STATE_TRANSFER_HASH_KEY,
    projectRootPath,
  });
})();


(() => {
  const API_BASE_URL = String(window.MovieTrackerConfig?.apiBaseUrl ?? "").replace(/\/+$/, "");
  const API_V1_BASE_URL = `${API_BASE_URL}/api/v1`;
  const ACCESS_TOKEN_STORAGE_KEY = "movieTracker.accessToken";
  const unavailableNamespaces = new Set();

  function readAccessToken() {
    try {
      return window.localStorage.getItem(ACCESS_TOKEN_STORAGE_KEY);
    } catch (error) {
      return "";
    }
  }

  function buildUrl(path, query = {}) {
    const normalizedPath = /^https?:\/\//i.test(path)
      ? path
      : `${API_V1_BASE_URL}${String(path).startsWith("/") ? path : `/${path}`}`;
    const url = new URL(normalizedPath, window.location.origin);

    Object.entries(query ?? {}).forEach(([key, value]) => {
      if (value === "" || value === null || value === undefined) return;
      url.searchParams.set(key, String(value));
    });

    return url.href;
  }

  function createApiError(message, extras = {}) {
    const error = new Error(message);
    return Object.assign(error, extras);
  }

  function markNamespaceUnavailable(namespace = "") {
    if (!namespace) return;
    unavailableNamespaces.add(namespace);
  }

  function isNamespaceUnavailable(namespace = "") {
    return Boolean(namespace) && unavailableNamespaces.has(namespace);
  }

  function shouldFallbackToLocal(error) {
    return Boolean(
      error?.code === "namespace_unavailable" ||
      error?.status === 404 ||
      error?.status === 405 ||
      error?.status === 501 ||
      error?.code === "network_error" ||
      error instanceof TypeError ||
      error?.message === "Failed to fetch",
    );
  }

  async function request(path, options = {}, settings = {}) {
    const namespace = settings.namespace ?? "default";

    if (settings.skipUnavailable !== false && isNamespaceUnavailable(namespace)) {
      throw createApiError("API namespace unavailable", {
        code: "namespace_unavailable",
        namespace,
        status: 404,
        unavailable: true,
      });
    }

    const headers = {
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.headers ?? {}),
    };
    const token = readAccessToken();

    if (token && !headers.Authorization) {
      headers.Authorization = `Bearer ${token}`;
    }

    let response;
    try {
      response = await fetch(buildUrl(path, settings.query), {
        ...options,
        headers,
      });
    } catch (error) {
      throw createApiError(error?.message || "Network request failed", {
        code: "network_error",
        namespace,
        cause: error,
      });
    }

    let data = null;
    if (response.status !== 204) {
      const contentType = response.headers.get("content-type") || "";

      if (contentType.includes("application/json")) {
        try {
          data = await response.json();
        } catch (error) {
          data = null;
        }
      } else {
        try {
          const text = await response.text();
          data = text ? { message: text } : null;
        } catch (error) {
          data = null;
        }
      }
    }

    if (!response.ok) {
      const detail = data?.detail;
      const message = detail && typeof detail === "object"
        ? detail.message ?? data?.message ?? "Request failed"
        : detail ?? data?.message ?? "Request failed";
      const error = createApiError(message, {
        status: response.status,
        data,
        namespace,
      });

      if (response.status === 404 || response.status === 405 || response.status === 501) {
        error.code = "namespace_unavailable";
        error.unavailable = true;
        markNamespaceUnavailable(namespace);
      }

      throw error;
    }

    return data;
  }

  async function withLocalFallback(remoteWork, fallbackWork) {
    try {
      return await remoteWork();
    } catch (error) {
      if (!shouldFallbackToLocal(error)) {
        throw error;
      }

      return fallbackWork(error);
    }
  }

  window.MovieTrackerApiClient = Object.freeze({
    apiBaseUrl: API_BASE_URL,
    apiV1BaseUrl: API_V1_BASE_URL,
    buildUrl,
    createApiError,
    isNamespaceUnavailable,
    readAccessToken,
    request,
    shouldFallbackToLocal,
    withLocalFallback,
  });
})();


(() => {
  const projectRootPath = String(window.MovieTrackerConfig?.projectRootPath ?? "/");
  const appBaseUrl = String(
    window.MovieTrackerConfig?.appBaseUrl ?? new URL(projectRootPath, window.location.origin).href,
  );
  const routePathByKey = Object.freeze({
    home: "index.html",
    watchHistory: "pages/watch-history.html",
    folders: "pages/folders.html",
    about: "pages/about.html",
    contacts: "pages/contacts.html",
    folderCreate: "pages/folder-create.html",
    folderDetail: "pages/folder-detail.html",
    movieDetail: "pages/movie-detail.html",
    profile: "pages/profile.html",
  });
  const routeAliasByFileName = Object.freeze({
    "watch_history_light_v3.html": "watchHistory",
  });
  const appPagePathByFileName = Object.freeze(
    Object.entries(routePathByKey).reduce((result, [routeKey, routePath]) => {
      const fileName = routePath.split("/").pop() ?? "";
      if (fileName) {
        result[fileName] = `${projectRootPath}${routePath}`;
      }
      return result;
    }, {
      ...Object.entries(routeAliasByFileName).reduce((result, [fileName, routeKey]) => {
        const routePath = routePathByKey[routeKey];
        if (routePath) {
          result[fileName] = `${projectRootPath}${routePath}`;
        }
        return result;
      }, {}),
    }),
  );

  function createRelativePath(pathname, params = {}) {
    const url = new URL(pathname, appBaseUrl);
    Object.entries(params).forEach(([key, value]) => {
      if (value === undefined || value === null || value === "") return;
      url.searchParams.set(key, value);
    });
    return `${url.pathname}${url.search}${url.hash}`;
  }

  function getNormalizedPathname(pathname) {
    const safePathname = String(pathname ?? "").trim();
    if (!safePathname) return "";

    const normalizedPathname = safePathname.split(/[?#]/, 1)[0];
    const filename = normalizedPathname.split("/").pop() ?? "";
    return appPagePathByFileName[filename] ?? normalizedPathname;
  }

  function isAppPathname(pathname) {
    const normalizedPathname = getNormalizedPathname(pathname);
    return Boolean(normalizedPathname && normalizedPathname.startsWith(projectRootPath));
  }

  function resolveAppUrl(value, fallbackPath = `${projectRootPath}index.html`, options = {}) {
    const fallbackRelativeUrl = createRelativePath(fallbackPath);
    const fallbackAbsoluteUrl = new URL(fallbackRelativeUrl, appBaseUrl);
    const shouldReturnAbsolute = options.absolute === true;

    if (typeof value !== "string" || !value.trim()) {
      return shouldReturnAbsolute
        ? fallbackAbsoluteUrl.href
        : `${fallbackAbsoluteUrl.pathname}${fallbackAbsoluteUrl.search}${fallbackAbsoluteUrl.hash}`;
    }

    try {
      const parsedUrl = new URL(value, window.location.href);
      const normalizedPathname = getNormalizedPathname(parsedUrl.pathname);

      if (isAppPathname(normalizedPathname)) {
        const normalizedUrl = new URL(normalizedPathname, appBaseUrl);
        normalizedUrl.search = parsedUrl.search;
        normalizedUrl.hash = parsedUrl.hash;

        return shouldReturnAbsolute
          ? normalizedUrl.href
          : `${normalizedUrl.pathname}${normalizedUrl.search}${normalizedUrl.hash}`;
      }

      return shouldReturnAbsolute
        ? parsedUrl.href
        : `${parsedUrl.pathname}${parsedUrl.search}${parsedUrl.hash}`;
    } catch (error) {
      return shouldReturnAbsolute
        ? fallbackAbsoluteUrl.href
        : `${fallbackAbsoluteUrl.pathname}${fallbackAbsoluteUrl.search}${fallbackAbsoluteUrl.hash}`;
    }
  }

  function buildRoutePath(routeKey, params = {}) {
    const routePath = routePathByKey[routeKey] ?? routePathByKey.home;
    return createRelativePath(`${projectRootPath}${routePath}`, params);
  }

  const routes = Object.freeze({
    home: buildRoutePath("home"),
    watchHistory: buildRoutePath("watchHistory"),
    folders: buildRoutePath("folders"),
    about: buildRoutePath("about"),
    contacts: buildRoutePath("contacts"),
    folderCreate: buildRoutePath("folderCreate"),
    folderDetail: (params = {}) =>
      buildRoutePath("folderDetail", params),
    movieDetail: (params = {}) =>
      buildRoutePath("movieDetail", params),
    profile: (params = {}) =>
      buildRoutePath("profile", params),
    byKey: (routeKey, params = {}) => buildRoutePath(routeKey, params),
    resolveAppUrl,
  });

  window.MovieTrackerRoutes = routes;
})();


(() => {
  const routes = window.MovieTrackerRoutes;
  const ACCESS_TOKEN_STORAGE_KEY = "movieTracker.accessToken";
  const CURRENT_USER_STORAGE_KEY = "movieTracker.currentUser";
  const GUEST_AUTH_MODAL_TYPE = "guest-auth";
  const GUEST_AUTH_HOST_ATTRIBUTE = "data-guest-auth-host";

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
  }

  function renderTabs(tabs) {
    return tabs
      .map((tab) => {
        const activeClass = tab.active ? "history-page__tab--active" : "";
        const staticClass = tab.static ? "history-page__tab--static" : "";
        const navAttribute = tab.url ? `data-nav-url="${escapeHtml(tab.url)}"` : "";

        return `
          <button
            class="history-page__tab ${activeClass} ${staticClass}"
            type="button"
            ${navAttribute}
          >
            ${escapeHtml(tab.label)}
          </button>
        `;
      })
      .join("");
  }

  function renderToasts(toasts) {
    return `
      <div class="toast-stack" aria-live="polite" aria-atomic="true">
        ${toasts
          .map(
            (toast) => `
              <div class="toast toast--${escapeHtml(toast.type)}">
                ${escapeHtml(toast.message)}
              </div>
            `,
          )
          .join("")}
      </div>
    `;
  }

  function renderModalShell(title, body, footer, modalType) {
    const safeTitle = escapeHtml(title);
    const safeModalType = escapeHtml(modalType);
    const bodyMarkup = body ? `<div class="modal-card__body">${body}</div>` : "";

    return `
      <div class="modal-backdrop" data-modal-backdrop="${safeModalType}">
        <section class="modal-card" role="dialog" aria-modal="true" aria-label="${safeTitle}">
          <button class="modal-card__close" type="button" data-modal-close="${safeModalType}" aria-label="Закрыть">
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
              <path d="M4.5 4.5L13.5 13.5M13.5 4.5L4.5 13.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"></path>
            </svg>
          </button>
          <h2 class="modal-card__title">${safeTitle}</h2>
          ${bodyMarkup}
          ${footer}
        </section>
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

  function isPublicProfilePreviewUrl(url = window.location.href) {
    const parsedUrl = new URL(url, window.location.href);
    const profileTarget = String(parsedUrl.searchParams.get("user") ?? "")
      .trim()
      .replace(/^@+/, "");

    return (
      parsedUrl.pathname.endsWith("/profile.html") &&
      Boolean(profileTarget) &&
      profileTarget.toLowerCase() !== "me"
    );
  }

  function isSharedFolderPreviewUrl(url = window.location.href) {
    const parsedUrl = new URL(url, window.location.href);
    return (
      parsedUrl.pathname.endsWith("/folder-detail.html") &&
      Boolean(String(parsedUrl.searchParams.get("share") ?? "").trim())
    );
  }

  function isGuestPreviewMode(url = window.location.href) {
    return (
      !hasAuthenticatedSession() &&
      (isPublicProfilePreviewUrl(url) || isSharedFolderPreviewUrl(url))
    );
  }

  function getGuestPreviewSubject(url = window.location.href) {
    return isPublicProfilePreviewUrl(url) ? "профиль" : "папку";
  }

  function buildAuthPageUrl(authType = "login", redirectUrl = window.location.href) {
    const targetUrl = new URL(routes.home, window.location.href);
    targetUrl.searchParams.set("auth", authType === "register" ? "register" : "login");
    targetUrl.searchParams.set("redirect", redirectUrl);
    return targetUrl.href;
  }

  function renderGuestAuthModal() {
    const subject = getGuestPreviewSubject();

    return renderModalShell(
      "Войдите или зарегистрируйтесь",
      `
        <p>
          Гостю доступен только просмотр открытого ${escapeHtml(subject)}. Чтобы перейти дальше или нажать на действия, войдите в аккаунт.
        </p>
      `,
      `
        <div class="modal-card__footer">
          <button class="modal-card__cancel" type="button" data-guest-auth-intent="register">Зарегистрироваться</button>
          <button class="modal-card__confirm" type="button" data-guest-auth-intent="login">Войти</button>
        </div>
      `,
      GUEST_AUTH_MODAL_TYPE,
    );
  }

  function getGuestAuthHost() {
    let host = document.querySelector(`[${GUEST_AUTH_HOST_ATTRIBUTE}]`);
    if (host) return host;

    host = document.createElement("div");
    host.setAttribute(GUEST_AUTH_HOST_ATTRIBUTE, "");
    document.body.append(host);
    return host;
  }

  function isGuestAuthModalOpen() {
    return Boolean(document.querySelector(`[data-modal-backdrop="${GUEST_AUTH_MODAL_TYPE}"]`));
  }

  function closeGuestAuthModal() {
    document.querySelector(`[${GUEST_AUTH_HOST_ATTRIBUTE}]`)?.replaceChildren();
    document.body.classList.remove("modal-open");
  }

  function openGuestAuthModal() {
    if (!isGuestPreviewMode()) return false;

    getGuestAuthHost().innerHTML = renderGuestAuthModal();
    document.body.classList.add("modal-open");
    return true;
  }

  function isGuestAuthModalTarget(target) {
    return target instanceof Element && Boolean(target.closest(`[${GUEST_AUTH_HOST_ATTRIBUTE}]`));
  }

  function shouldInterceptGuestAction(target) {
    if (!(target instanceof Element) || !isGuestPreviewMode() || isGuestAuthModalTarget(target)) {
      return false;
    }

    if (!target.closest("main[id$='-app']")) {
      return false;
    }

    return Boolean(
      target.closest(
        "[data-nav-url], [data-action], [data-folder-card], [data-card-id], button, a[href], [role='button'], [role='link']",
      ),
    );
  }

  async function writeClipboardText(text) {
    if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(text);
        return;
      } catch (error) {
        console.warn(error);
      }
    }

    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.top = "-9999px";
    document.body.append(textarea);
    textarea.select();

    const isCopied = document.execCommand("copy");
    textarea.remove();

    if (!isCopied) {
      throw new Error("Clipboard copy failed");
    }
  }

  function autoSizeTextarea(textarea, maxHeight = 180) {
    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, maxHeight)}px`;
    textarea.style.overflowY = textarea.scrollHeight > maxHeight ? "auto" : "hidden";
  }

  const pageScriptCache = new Map();
  let navigationToken = 0;

  function getCurrentAppRoot() {
    return document.querySelector("main[id$='-app']");
  }

  function getPageContent(root) {
    return root?.querySelector(".history-page__content");
  }

  function getRouteKind(url) {
    const pathname = new URL(url, window.location.href).pathname;
    if (pathname.endsWith("/folders.html")) return "folders";
    if (pathname.endsWith("/profile.html")) return "profile";
    if (pathname.endsWith("/movie-detail.html")) return "detail";
    if (pathname.endsWith("/about.html") || pathname.endsWith("/contacts.html")) return "info";
    return "history";
  }

  function renderSkeletonBlock(className = "") {
    return `<span class="skeleton-block ${className}" aria-hidden="true"></span>`;
  }

  function renderNavigationSkeleton(url) {
    const routeKind = getRouteKind(url);

    if (routeKind === "detail") {
      return `
        <div class="page-skeleton page-skeleton--detail" aria-hidden="true">
          ${renderSkeletonBlock("page-skeleton__back")}
          <div class="page-skeleton__detail-card">
            ${renderSkeletonBlock("page-skeleton__poster")}
            <div class="page-skeleton__detail-main">
              ${renderSkeletonBlock("page-skeleton__title")}
              ${renderSkeletonBlock("page-skeleton__line")}
              ${renderSkeletonBlock("page-skeleton__line page-skeleton__line--wide")}
              ${renderSkeletonBlock("page-skeleton__button")}
            </div>
            ${renderSkeletonBlock("page-skeleton__aside")}
          </div>
        </div>
      `;
    }

    if (routeKind === "profile") {
      return `
        <div class="page-skeleton" aria-hidden="true">
          <div class="page-skeleton__hero">
            ${renderSkeletonBlock("page-skeleton__avatar")}
            <div>
              ${renderSkeletonBlock("page-skeleton__title")}
              ${renderSkeletonBlock("page-skeleton__line")}
            </div>
          </div>
          <div class="page-skeleton__grid page-skeleton__grid--three">
            ${renderSkeletonBlock("page-skeleton__card")}
            ${renderSkeletonBlock("page-skeleton__card")}
            ${renderSkeletonBlock("page-skeleton__card")}
          </div>
        </div>
      `;
    }

    if (routeKind === "info") {
      return `
        <div class="page-skeleton" aria-hidden="true">
          <div class="page-skeleton__heading">
            <div>
              ${renderSkeletonBlock("page-skeleton__title")}
              ${renderSkeletonBlock("page-skeleton__line")}
            </div>
            ${renderSkeletonBlock("page-skeleton__stat")}
          </div>
          <div class="page-skeleton__grid page-skeleton__grid--three">
            ${renderSkeletonBlock("page-skeleton__card")}
            ${renderSkeletonBlock("page-skeleton__card")}
            ${renderSkeletonBlock("page-skeleton__card")}
          </div>
        </div>
      `;
    }

    return `
      <div class="page-skeleton" aria-hidden="true">
        <div class="page-skeleton__heading">
          <div>
            ${renderSkeletonBlock("page-skeleton__title")}
            ${renderSkeletonBlock("page-skeleton__line")}
          </div>
          ${renderSkeletonBlock("page-skeleton__stat")}
        </div>
        <div class="page-skeleton__toolbar">
          ${renderSkeletonBlock("page-skeleton__search")}
          ${renderSkeletonBlock("page-skeleton__button")}
          ${renderSkeletonBlock("page-skeleton__filter")}
        </div>
        <div class="page-skeleton__grid">
          ${renderSkeletonBlock("page-skeleton__card")}
          ${renderSkeletonBlock("page-skeleton__card")}
          ${renderSkeletonBlock("page-skeleton__card")}
        </div>
      </div>
    `;
  }

  function ensureStylesLoaded(nextDocument) {
    nextDocument.querySelectorAll('link[rel="stylesheet"]').forEach((link) => {
      const href = link.getAttribute("href");
      if (!href) return;

      const absoluteHref = new URL(href, window.location.href).href;
      const isLoaded = [...document.querySelectorAll('link[rel="stylesheet"]')].some(
        (currentLink) => currentLink.href === absoluteHref,
      );

      if (isLoaded) return;

      const nextLink = document.createElement("link");
      nextLink.rel = "stylesheet";
      nextLink.href = absoluteHref;
      document.head.append(nextLink);
    });
  }

  async function runPageScript(src) {
    let code = pageScriptCache.get(src);

    if (!code) {
      const response = await fetch(src, { cache: "no-cache" });
      if (!response.ok) throw new Error(`Script load failed: ${response.status}`);
      code = await response.text();
      pageScriptCache.set(src, code);
    }

    const runScript = new Function(`${code}\n//# sourceURL=${src}`);
    runScript();
  }

  async function loadPageScripts(nextDocument, targetUrl) {
    const scripts = [...nextDocument.querySelectorAll("script[src]")]
      .map((script) => script.getAttribute("src"))
      .filter((src) => src && !src.includes("common-ui.js") && !src.includes("app-runtime.js"));

    for (const src of scripts) {
      await runPageScript(new URL(src, targetUrl).href);
    }
  }

  function copyAttributes(target, source) {
    [...target.attributes].forEach((attribute) => {
      if (attribute.name !== "class") target.removeAttribute(attribute.name);
    });

    [...source.attributes].forEach((attribute) => {
      if (attribute.name !== "class") target.setAttribute(attribute.name, attribute.value);
    });
  }

  function setMobileMenuState(header, isOpen) {
    if (!header) return;

    const toggleButton = header.querySelector("[data-menu-toggle]");
    const mobileMenu = header.querySelector("[data-mobile-menu]");
    if (!toggleButton || !mobileMenu) return;

    toggleButton.setAttribute("aria-expanded", isOpen ? "true" : "false");
    mobileMenu.hidden = !isOpen;
    mobileMenu.classList.toggle("history-page__mobile-menu--open", isOpen);
    header.classList.toggle("history-page__navbar--menu-open", isOpen);
  }

  function closeAllMobileMenus(scope = document) {
    scope.querySelectorAll(".history-page__navbar").forEach((header) => {
      setMobileMenuState(header, false);
    });
  }

  function updatePersistentHeader(currentHeader, nextHeader) {
    if (!currentHeader || !nextHeader) return;

    const currentTabs = currentHeader.querySelector(".history-page__tabs");
    const nextTabs = nextHeader.querySelector(".history-page__tabs");
    if (currentTabs && nextTabs) {
      currentTabs.innerHTML = nextTabs.innerHTML;
    }

    const currentAvatar = currentHeader.querySelector(".history-page__avatar");
    const nextAvatar = nextHeader.querySelector(".history-page__avatar");
    if (currentAvatar && nextAvatar) {
      currentAvatar.className = nextAvatar.className;
      currentAvatar.innerHTML = nextAvatar.innerHTML;
      copyAttributes(currentAvatar, nextAvatar);
    }

    const currentMobileMenuShell = currentHeader.querySelector(".history-page__mobile-menu-shell");
    const nextMobileMenuShell = nextHeader.querySelector(".history-page__mobile-menu-shell");
    if (currentMobileMenuShell && nextMobileMenuShell) {
      currentMobileMenuShell.innerHTML = nextMobileMenuShell.innerHTML;
    }

    setMobileMenuState(currentHeader, false);
  }

  function prepareCurrentContentForNavigation(currentRoot, targetUrl) {
    const content = getPageContent(currentRoot);
    if (!content) return () => {};

    const currentHeight = Math.max(content.getBoundingClientRect().height, 420);
    content.style.minHeight = `${currentHeight}px`;
    content.classList.add("page-transition-exit");

    const skeletonTimer = window.setTimeout(() => {
      if (!content.isConnected) return;
      content.classList.add("history-page__content--loading");
      content.insertAdjacentHTML("beforeend", renderNavigationSkeleton(targetUrl));
    }, 120);

    return () => {
      window.clearTimeout(skeletonTimer);
      content.classList.remove("page-transition-exit", "history-page__content--loading");
      content.querySelector(".page-skeleton")?.remove();
      content.style.minHeight = "";
    };
  }

  function prepareNextContentForEntry(nextContent, minHeight) {
    if (!nextContent) return;

    nextContent.style.minHeight = `${Math.max(minHeight, 420)}px`;
    nextContent.classList.add("page-transition-enter");

    window.requestAnimationFrame(() => {
      nextContent.classList.add("page-transition-enter-active");
    });

    window.setTimeout(() => {
      nextContent.classList.remove("page-transition-enter", "page-transition-enter-active");
      nextContent.style.minHeight = "";
    }, 260);
  }

  function resetStagingRoot(stagingRoot) {
    stagingRoot.style.position = "";
    stagingRoot.style.left = "";
    stagingRoot.style.top = "";
    stagingRoot.style.width = "";
    stagingRoot.removeAttribute("aria-hidden");
  }

  async function navigateToPage(url, options = {}) {
    const targetUrl = new URL(url, window.location.href);
    const currentUrl = new URL(window.location.href);

    if (targetUrl.href === currentUrl.href && !options.force) return;

    closeGuestAuthModal();

    const currentRoot = getCurrentAppRoot();
    if (!currentRoot) {
      window.location.href = targetUrl.href;
      return;
    }

    const token = ++navigationToken;
    const currentContent = getPageContent(currentRoot);
    const currentContentHeight = currentContent?.getBoundingClientRect().height ?? 420;
    const cleanupLoadingState = prepareCurrentContentForNavigation(currentRoot, targetUrl.href);

    try {
      const response = await fetch(targetUrl.href, { cache: "no-cache" });
      if (!response.ok) throw new Error(`Navigation failed: ${response.status}`);

      const html = await response.text();
      const nextDocument = new DOMParser().parseFromString(html, "text/html");
      const nextRoot = nextDocument.querySelector("main[id$='-app']");

      if (!nextRoot) {
        window.location.href = targetUrl.href;
        return;
      }

      ensureStylesLoaded(nextDocument);

      const stagingRoot = nextRoot.cloneNode(true);
      stagingRoot.style.position = "absolute";
      stagingRoot.style.left = "-100000px";
      stagingRoot.style.top = "0";
      stagingRoot.style.width = `${currentRoot.getBoundingClientRect().width || window.innerWidth}px`;
      stagingRoot.setAttribute("aria-hidden", "true");
      currentRoot.insertAdjacentElement("afterend", stagingRoot);

      if (!options.fromPopState) {
        window.history.pushState({ softNav: true }, "", targetUrl.href);
      }

      await loadPageScripts(nextDocument, targetUrl.href);

      if (token !== navigationToken) {
        stagingRoot.remove();
        cleanupLoadingState();
        return;
      }

      const currentHeader = currentRoot.querySelector(".history-page__navbar");
      const nextHeader = stagingRoot.querySelector(".history-page__navbar");
      updatePersistentHeader(currentHeader, nextHeader);

      if (currentHeader && nextHeader) {
        const headerPlaceholder = currentHeader.cloneNode(true);
        headerPlaceholder.style.visibility = "hidden";
        currentHeader.replaceWith(headerPlaceholder);
        nextHeader.replaceWith(currentHeader);
      }

      const nextContent = getPageContent(stagingRoot);
      prepareNextContentForEntry(nextContent, currentContentHeight);

      document.title = nextDocument.title || document.title;
      resetStagingRoot(stagingRoot);
      currentRoot.replaceWith(stagingRoot);

      window.scrollTo({ top: 0, behavior: "auto" });
    } catch (error) {
      cleanupLoadingState();
      console.error(error);
      window.location.href = targetUrl.href;
    }
  }

  function setActiveNavButton(navButton) {
    const header = navButton.closest(".history-page__navbar");
    if (!header) return;

    header.querySelectorAll(".history-page__tab").forEach((button) => {
      button.classList.remove("history-page__tab--active", "history-page__tab--static");
    });
    header.querySelector(".history-page__avatar")?.classList.remove("history-page__avatar--active");

    if (navButton.classList.contains("history-page__tab")) {
      navButton.classList.add("history-page__tab--active", "history-page__tab--static");
    }

    if (navButton.classList.contains("history-page__avatar")) {
      navButton.classList.add("history-page__avatar--active");
    }
  }

  function handleGuestPreviewClick(event) {
    const target = event.target;
    if (!(target instanceof Element)) return;

    const authIntentButton = target.closest("[data-guest-auth-intent]");
    if (authIntentButton) {
      event.preventDefault();
      event.stopImmediatePropagation();
      window.location.href = buildAuthPageUrl(authIntentButton.dataset.guestAuthIntent);
      return;
    }

    if (
      target.closest(`[data-modal-close="${GUEST_AUTH_MODAL_TYPE}"]`) ||
      target.dataset.modalBackdrop === GUEST_AUTH_MODAL_TYPE
    ) {
      event.preventDefault();
      event.stopImmediatePropagation();
      closeGuestAuthModal();
      return;
    }

    if (!shouldInterceptGuestAction(target)) return;

    event.preventDefault();
    event.stopImmediatePropagation();
    closeAllMobileMenus();
    openGuestAuthModal();
  }

  function handleGuestPreviewKeydown(event) {
    if (event.key === "Escape" && isGuestAuthModalOpen()) {
      event.preventDefault();
      event.stopImmediatePropagation();
      closeGuestAuthModal();
      return;
    }

    if (event.key !== "Enter" && event.key !== " ") return;
    if (!shouldInterceptGuestAction(event.target)) return;

    event.preventDefault();
    event.stopImmediatePropagation();
    closeAllMobileMenus();
    openGuestAuthModal();
  }

  function handleDocumentNavigation(event) {
    if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

    const navButton = event.target.closest("[data-nav-url]");
    if (!navButton) return;

    event.preventDefault();
    event.stopPropagation();
    closeAllMobileMenus();
    setActiveNavButton(navButton);
    navigateToPage(navButton.dataset.navUrl);
  }

  function handleHeaderMenuClick(event) {
    const toggleButton = event.target.closest("[data-menu-toggle]");
    if (toggleButton) {
      event.preventDefault();
      event.stopPropagation();
      const header = toggleButton.closest(".history-page__navbar");
      const shouldOpen = toggleButton.getAttribute("aria-expanded") !== "true";
      closeAllMobileMenus();
      setMobileMenuState(header, shouldOpen);
      return;
    }

    const closeButton = event.target.closest("[data-menu-close]");
    if (closeButton) {
      event.preventDefault();
      event.stopPropagation();
      setMobileMenuState(closeButton.closest(".history-page__navbar"), false);
    }
  }

  document.addEventListener("click", handleGuestPreviewClick, true);
  document.addEventListener("click", handleDocumentNavigation, true);
  document.addEventListener("click", handleHeaderMenuClick, true);
  document.addEventListener("keydown", handleGuestPreviewKeydown, true);

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeAllMobileMenus();
    }
  });

  window.addEventListener("popstate", () => {
    navigateToPage(window.location.href, { fromPopState: true, force: true });
  });

  window.MovieTrackerUI = {
    autoSizeTextarea,
    escapeHtml,
    hasAuthenticatedSession,
    isGuestPreviewMode,
    closeGuestAuthModal,
    navigateToPage,
    openGuestAuthModal,
    renderModalShell,
    renderTabs,
    renderToasts,
    writeClipboardText,
  };
})();


(() => {
  function pluralizeRu(count, forms) {
    const safeCount = Math.abs(Number(count) || 0);
    const lastDigit = safeCount % 10;
    const lastTwoDigits = safeCount % 100;

    if (lastTwoDigits >= 11 && lastTwoDigits <= 14) return forms.many;
    if (lastDigit === 1) return forms.one;
    if (lastDigit >= 2 && lastDigit <= 4) return forms.few;
    return forms.many;
  }

  function createToastController(setState, selectToasts = (state) => state.toasts) {
    let toastId = 0;

    return function showToast(message, type = "success", duration = 3200) {
      const id = `toast-${++toastId}`;

      setState((currentState) => ({
        ...currentState,
        toasts: [...selectToasts(currentState), { id, message, type }],
      }));

      window.setTimeout(() => {
        setState((currentState) => ({
          ...currentState,
          toasts: selectToasts(currentState).filter((toast) => toast.id !== id),
        }));
      }, duration);
    };
  }

  function getContinueUrl(item) {
    if (!item || typeof item !== "object") return "";

    const candidateKeys = [
      "continueUrl",
      "continue_url",
      "watchUrl",
      "watch_url",
      "sourceUrl",
      "source_url",
      "url",
    ];

    for (const key of candidateKeys) {
      const value = item[key];
      if (typeof value === "string" && value.trim()) {
        return value.trim();
      }
    }

    return "";
  }

  function resolveContinueUrl(item) {
    const continueUrl = getContinueUrl(item);
    if (!continueUrl) {
      return {
        ok: false,
        reason: "missing",
        message: "Ссылка на просмотр недоступна. Обновите запись или запустите просмотр снова.",
      };
    }

    try {
      const resolvedUrl = new URL(continueUrl, window.location.href);
      if (!["http:", "https:"].includes(resolvedUrl.protocol)) {
        return {
          ok: false,
          reason: "invalid",
          message: "Не удалось открыть ссылку на просмотр. Проверьте запись и попробуйте снова.",
        };
      }

      return {
        ok: true,
        href: resolvedUrl.href,
      };
    } catch (error) {
      return {
        ok: false,
        reason: "invalid",
        message: "Не удалось открыть ссылку на просмотр. Проверьте запись и попробуйте снова.",
      };
    }
  }

  function openContinueUrl(item) {
    const continueTarget = resolveContinueUrl(item);
    if (!continueTarget.ok) return continueTarget;

    const openedWindow = typeof window.open === "function"
      ? window.open(continueTarget.href, "_blank", "noopener,noreferrer")
      : null;

    if (!openedWindow) {
      window.location.assign(continueTarget.href);
    }

    return continueTarget;
  }

  window.MovieTrackerHelpers = {
    createToastController,
    getContinueUrl,
    openContinueUrl,
    pluralizeRu,
    resolveContinueUrl,
  };
})();


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

  function renderMobileMenu(tabs, supportTabs, profileUrl, profileActive, headerUser) {
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
              ${renderTabs(tabs)}
              <div class="history-page__mobile-menu-group" aria-label="Информация о проекте">
                <span class="history-page__mobile-menu-label">О сервисе</span>
                ${renderTabs(supportTabs)}
              </div>
              <button
                class="history-page__mobile-profile ${profileActive ? "history-page__mobile-profile--active" : ""}"
                type="button"
                data-nav-url="${profileUrl}"
                aria-label="Открыть профиль"
              >
                ${renderUserAvatar({
                  avatarKey: headerUser.avatarKey,
                  avatarImage: headerUser.avatarImage,
                  size: 42,
                  className: "history-page__mobile-profile-visual",
                  iconSize: 18,
                })}
                <span>Профиль</span>
              </button>
            </nav>
          </section>
        </div>
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

  function isPublicProfilePreviewUrl(url = window.location.href) {
    const parsedUrl = new URL(url, window.location.href);
    const profileTarget = String(parsedUrl.searchParams.get("user") ?? "")
      .trim()
      .replace(/^@+/, "");

    return (
      parsedUrl.pathname.endsWith("/profile.html") &&
      Boolean(profileTarget) &&
      profileTarget.toLowerCase() !== "me"
    );
  }

  function isSharedFolderPreviewUrl(url = window.location.href) {
    const parsedUrl = new URL(url, window.location.href);
    return (
      parsedUrl.pathname.endsWith("/folder-detail.html") &&
      Boolean(String(parsedUrl.searchParams.get("share") ?? "").trim())
    );
  }

  function isGuestPreviewMode(url = window.location.href) {
    return (
      !hasAuthenticatedSession() &&
      (isPublicProfilePreviewUrl(url) || isSharedFolderPreviewUrl(url))
    );
  }

  function getGuestPreviewSubject(url = window.location.href) {
    return isPublicProfilePreviewUrl(url) ? "профиль" : "папку";
  }

  function buildAuthPageUrl(authType = "login", redirectUrl = window.location.href) {
    const targetUrl = new URL(routes.home, window.location.href);
    targetUrl.searchParams.set("auth", authType === "register" ? "register" : "login");
    targetUrl.searchParams.set("redirect", redirectUrl);
    return targetUrl.href;
  }

  function renderGuestAuthModal() {
    const subject = getGuestPreviewSubject();

    return renderModalShell(
      "Войдите или зарегистрируйтесь",
      `
        <p>
          Гостю доступен только просмотр открытого ${escapeHtml(subject)}. Чтобы перейти дальше или нажать на действия, войдите в аккаунт.
        </p>
      `,
      `
        <div class="modal-card__footer">
          <button class="modal-card__cancel" type="button" data-guest-auth-intent="register">Зарегистрироваться</button>
          <button class="modal-card__confirm" type="button" data-guest-auth-intent="login">Войти</button>
        </div>
      `,
      GUEST_AUTH_MODAL_TYPE,
    );
  }

  function getGuestAuthHost() {
    let host = document.querySelector(`[${GUEST_AUTH_HOST_ATTRIBUTE}]`);
    if (host) return host;

    host = document.createElement("div");
    host.setAttribute(GUEST_AUTH_HOST_ATTRIBUTE, "");
    document.body.append(host);
    return host;
  }

  function isGuestAuthModalOpen() {
    return Boolean(document.querySelector(`[data-modal-backdrop="${GUEST_AUTH_MODAL_TYPE}"]`));
  }

  function closeGuestAuthModal() {
    document.querySelector(`[${GUEST_AUTH_HOST_ATTRIBUTE}]`)?.replaceChildren();
    document.body.classList.remove("modal-open");
  }

  function openGuestAuthModal() {
    if (!isGuestPreviewMode()) return false;

    getGuestAuthHost().innerHTML = renderGuestAuthModal();
    document.body.classList.add("modal-open");
    return true;
  }

  function isGuestAuthModalTarget(target) {
    return target instanceof Element && Boolean(target.closest(`[${GUEST_AUTH_HOST_ATTRIBUTE}]`));
  }

  function shouldInterceptGuestAction(target) {
    if (!(target instanceof Element) || !isGuestPreviewMode() || isGuestAuthModalTarget(target)) {
      return false;
    }

    if (!target.closest("main[id$='-app']")) {
      return false;
    }

    return Boolean(
      target.closest(
        "[data-nav-url], [data-action], [data-folder-card], [data-card-id], button, a[href], [role='button'], [role='link']",
      ),
    );
  }

  function syncElementAttributes(target, source) {
    target.getAttributeNames().forEach((name) => {
      if (!source.hasAttribute(name)) {
        target.removeAttribute(name);
      }
    });

    source.getAttributeNames().forEach((name) => {
      target.setAttribute(name, source.getAttribute(name) ?? "");
    });
  }

  function getOverlayNodeKey(node, index) {
    return node.getAttribute("data-modal-backdrop") || `overlay-${index}`;
  }

  function syncOverlayHost(host, markup) {
    if (!host) return;

    const nextMarkup = String(markup ?? "").trim();
    if (!nextMarkup) {
      host.replaceChildren();
      return;
    }

    if (!host.children.length) {
      host.innerHTML = nextMarkup;
      return;
    }

    const template = document.createElement("template");
    template.innerHTML = nextMarkup;
    const nextNodes = Array.from(template.content.children);
    const currentByKey = new Map(
      Array.from(host.children).map((node, index) => [getOverlayNodeKey(node, index), node]),
    );

    const orderedNodes = nextNodes.map((nextNode, index) => {
      const key = getOverlayNodeKey(nextNode, index);
      const currentNode = currentByKey.get(key);
      if (!currentNode) {
        return nextNode;
      }

      currentByKey.delete(key);
      syncElementAttributes(currentNode, nextNode);

      const currentCard = currentNode.querySelector(".modal-card");
      const nextCard = nextNode.querySelector(".modal-card");
      if (!currentCard || !nextCard) {
        currentNode.innerHTML = nextNode.innerHTML;
        return currentNode;
      }

      syncElementAttributes(currentCard, nextCard);
      currentCard.innerHTML = nextCard.innerHTML;
      return currentNode;
    });

    currentByKey.forEach((node) => node.remove());
    host.replaceChildren(...orderedNodes);
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
        ${renderMobileMenu(tabs, supportTabs, profileUrl, profileActive, headerUser)}
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


(() => {
  const { escapeHtml } = window.MovieTrackerUI;

  function renderEmptyMessage(className, title, text) {
    return `
      <section class="${className}" aria-live="polite">
        <strong>${escapeHtml(title)}</strong>
        ${escapeHtml(text)}
      </section>
    `;
  }

  function renderPageState({
    className,
    title,
    text,
    actionLabel = "",
    action = "",
    actionUrl = "",
    buttonClass = "profile-button profile-button--primary",
  }) {
    const actionMarkup = actionLabel
      ? actionUrl
        ? `<button class="${buttonClass}" type="button" data-nav-url="${escapeHtml(actionUrl)}">${escapeHtml(actionLabel)}</button>`
        : `<button class="${buttonClass}" type="button" data-action="${escapeHtml(action)}">${escapeHtml(actionLabel)}</button>`
      : "";

    return `
      <section class="${className}" aria-live="polite">
        <strong>${escapeHtml(title)}</strong>
        <p>${escapeHtml(text)}</p>
        ${actionMarkup}
      </section>
    `;
  }

  window.MovieTrackerFeedback = {
    renderEmptyMessage,
    renderPageState,
  };
})();


(() => {
  const { escapeHtml } = window.MovieTrackerUI;

  function renderOwnerBlock(folder) {
    if (folder.isOwner || !String(folder.ownerName ?? "").trim()) return "";

    return `
      <div class="folder-card__owner">
        <span class="folder-card__avatar" aria-hidden="true">
          <svg width="14" height="14" viewBox="0 0 20 20" fill="none">
            <circle cx="10" cy="7" r="4" fill="currentColor"></circle>
            <path d="M2 18c0-4 3.6-7 8-7s8 3 8 7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"></path>
          </svg>
        </span>
        <span>${escapeHtml(folder.ownerName)}</span>
      </div>
    `;
  }

  function renderLibraryFolderCard(folder, options = {}) {
    const copyTooltip = "Копировать ссылку";
    const deleteTooltip = folder.isOwner ? "Удалить" : "Удалить из сохраненных";
    const countText = options.countText ?? "";
    const canRemoveFolder = !folder.isOwner || folder.canDelete !== false;
    const deleteActionMarkup = canRemoveFolder
      ? `
            <div class="folder-card__action">
              <span class="folder-card__tooltip">${deleteTooltip}</span>
              <button class="folder-card__icon-button folder-card__icon-button--danger" type="button" data-action="delete-folder" data-id="${folder.id}" aria-label="${deleteTooltip}">
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
                  <path d="M4.2 5.6H13.8" stroke="currentColor" stroke-width="1.55" stroke-linecap="round"></path>
                  <path d="M7.2 3.8H10.8M6 5.6L6.45 14.1C6.49 14.73 7 15.2 7.63 15.2H10.37C11 15.2 11.51 14.73 11.55 14.1L12 5.6" stroke="currentColor" stroke-width="1.55" stroke-linecap="round" stroke-linejoin="round"></path>
                </svg>
              </button>
            </div>
          `
      : "";

    return `
      <article
        class="folder-card"
        tabindex="0"
        role="link"
        data-folder-card="${folder.id}"
        aria-label="Открыть папку ${escapeHtml(folder.title)}"
      >
        <div class="folder-card__top">
          <div class="folder-card__posters" aria-hidden="true">
            <span class="folder-card__poster"></span>
            <span class="folder-card__poster"></span>
            <span class="folder-card__poster"></span>
            <span class="folder-card__poster"></span>
          </div>
          <div class="folder-card__actions">
            <div class="folder-card__action">
              <span class="folder-card__tooltip">${copyTooltip}</span>
              <button class="folder-card__icon-button" type="button" data-action="copy-link" data-id="${folder.id}" aria-label="${copyTooltip}">
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
                  <path d="M7.4 10.6C6.25 9.45 6.25 7.6 7.4 6.45L9.65 4.2C10.8 3.05 12.65 3.05 13.8 4.2C14.95 5.35 14.95 7.2 13.8 8.35L12.78 9.37" stroke="currentColor" stroke-width="1.55" stroke-linecap="round"></path>
                  <path d="M10.6 7.4C11.75 8.55 11.75 10.4 10.6 11.55L8.35 13.8C7.2 14.95 5.35 14.95 4.2 13.8C3.05 12.65 3.05 10.8 4.2 9.65L5.22 8.63" stroke="currentColor" stroke-width="1.55" stroke-linecap="round"></path>
                </svg>
              </button>
            </div>
            ${deleteActionMarkup}
          </div>
        </div>
        <div class="folder-card__body">
          ${renderOwnerBlock(folder)}
          <h3 class="folder-card__title">${escapeHtml(folder.title)}</h3>
          <p class="folder-card__count">${countText}</p>
        </div>
      </article>
    `;
  }

  function renderProfileFolderCard(folder, actionMarkup = "") {
    const countText = folder.countText ?? escapeHtml(String(folder.count));

    return `
      <article
        class="folder-card profile-public-card"
        tabindex="0"
        role="link"
        data-folder-card="${escapeHtml(folder.id)}"
        aria-label="Открыть папку ${escapeHtml(folder.title)}"
      >
        <div class="folder-card__top">
          <div class="profile-public-card__preview" aria-hidden="true">
            ${folder.posters
              .map(
                ([start, end]) => `
                  <span class="profile-public-card__poster" style="--poster-start: ${start}; --poster-end: ${end}"></span>
                `,
              )
              .join("")}
          </div>
          <div class="folder-card__actions">
            <div class="folder-card__action">
              <span class="folder-card__tooltip">Копировать ссылку</span>
              <button class="folder-card__icon-button" type="button" data-action="copy-folder-link" data-id="${escapeHtml(folder.id)}" aria-label="Копировать ссылку">
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
                  <path d="M7.4 10.6C6.25 9.45 6.25 7.6 7.4 6.45L9.65 4.2C10.8 3.05 12.65 3.05 13.8 4.2C14.95 5.35 14.95 7.2 13.8 8.35L12.78 9.37" stroke="currentColor" stroke-width="1.55" stroke-linecap="round"></path>
                  <path d="M10.6 7.4C11.75 8.55 11.75 10.4 10.6 11.55L8.35 13.8C7.2 14.95 5.35 14.95 4.2 13.8C3.05 12.65 3.05 10.8 4.2 9.65L5.22 8.63" stroke="currentColor" stroke-width="1.55" stroke-linecap="round"></path>
                </svg>
              </button>
            </div>
          </div>
        </div>
        <div class="folder-card__body">
          <h3 class="folder-card__title">${escapeHtml(folder.title)}</h3>
          <p class="profile-public-card__count">${countText}</p>
          ${actionMarkup ? `<div class="profile-public-card__actions">${actionMarkup}</div>` : ""}
        </div>
      </article>
    `;
  }

  window.MovieTrackerFolderCard = {
    renderLibraryFolderCard,
    renderProfileFolderCard,
  };
})();

