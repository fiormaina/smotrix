(() => {
  const API_BASE_URL_STORAGE_KEY = "movieTracker.apiBaseUrl";
  const DEFAULT_API_BASE_URL = "http://127.0.0.1:8000";
  const DEFAULT_API_PORT = "8000";
  const POLL_INTERVAL_MS = 45000;
  const listeners = new Set();

  let refreshTimeoutId = 0;
  let state = {
    apiBaseUrl: resolveApiBaseUrl(),
    backendReachable: null,
    checkedAt: null,
    mode: navigator.onLine ? "checking" : "offline",
    navigatorOnline: navigator.onLine,
  };

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
      return DEFAULT_API_BASE_URL;
    }

    if (protocol === "http:" && isPrivateIpv4Hostname(hostname)) {
      return `http://${hostname}:${DEFAULT_API_PORT}`;
    }

    return DEFAULT_API_BASE_URL;
  }

  function readQueryApiBaseUrl() {
    try {
      const currentUrl = new URL(window.location.href);
      return normalizeUrl(currentUrl.searchParams.get("apiBaseUrl"));
    } catch (error) {
      return "";
    }
  }

  function resolveApiBaseUrl() {
    const queryValue = readQueryApiBaseUrl();
    if (queryValue) {
      try {
        window.localStorage.setItem(API_BASE_URL_STORAGE_KEY, queryValue);
      } catch (error) {
        console.warn(error);
      }
      return queryValue;
    }

    const configValue = normalizeUrl(window.MovieTrackerConfig?.apiBaseUrl);
    if (configValue) {
      return configValue;
    }

    try {
      const storedValue = normalizeUrl(window.localStorage.getItem(API_BASE_URL_STORAGE_KEY));
      return storedValue || resolveDefaultApiBaseUrl();
    } catch (error) {
      return resolveDefaultApiBaseUrl();
    }
  }

  function getState() {
    return { ...state };
  }

  function emit() {
    const snapshot = getState();
    listeners.forEach((listener) => {
      try {
        listener(snapshot);
      } catch (error) {
        console.error(error);
      }
    });
  }

  function setState(patch) {
    state = {
      ...state,
      ...patch,
      mode: resolveMode({
        ...state,
        ...patch,
      }),
    };
    emit();
  }

  function resolveMode(nextState) {
    if (!nextState.navigatorOnline) return "offline";
    if (nextState.backendReachable === false) return "degraded";
    if (nextState.backendReachable === true) return "online";
    return "checking";
  }

  function scheduleRefresh() {
    window.clearTimeout(refreshTimeoutId);
    refreshTimeoutId = window.setTimeout(() => {
      refresh();
    }, POLL_INTERVAL_MS);
  }

  async function refresh() {
    const apiBaseUrl = resolveApiBaseUrl();

    if (!navigator.onLine) {
      setState({
        apiBaseUrl,
        backendReachable: false,
        checkedAt: new Date().toISOString(),
        navigatorOnline: false,
      });
      scheduleRefresh();
      return getState();
    }

    setState({
      apiBaseUrl,
      navigatorOnline: true,
    });

    const controller = new AbortController();
    const abortTimeoutId = window.setTimeout(() => controller.abort(), 4000);

    try {
      const response = await fetch(`${apiBaseUrl}/health`, {
        cache: "no-store",
        signal: controller.signal,
      });

      setState({
        apiBaseUrl,
        backendReachable: response.ok,
        checkedAt: new Date().toISOString(),
        navigatorOnline: true,
      });
    } catch (error) {
      setState({
        apiBaseUrl,
        backendReachable: false,
        checkedAt: new Date().toISOString(),
        navigatorOnline: navigator.onLine,
      });
    } finally {
      window.clearTimeout(abortTimeoutId);
      scheduleRefresh();
    }

    return getState();
  }

  function subscribe(listener, options = {}) {
    if (typeof listener !== "function") {
      return () => undefined;
    }

    listeners.add(listener);

    if (options.emitImmediately !== false) {
      listener(getState());
    }

    return () => {
      listeners.delete(listener);
    };
  }

  window.addEventListener("online", () => {
    refresh();
  });

  window.addEventListener("offline", () => {
    refresh();
  });

  window.addEventListener("pageshow", () => {
    refresh();
  });

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      refresh();
    }
  });

  scheduleRefresh();
  refresh();

  window.MovieTrackerNetwork = Object.freeze({
    getState,
    refresh,
    subscribe,
  });
})();
