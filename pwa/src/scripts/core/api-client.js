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
