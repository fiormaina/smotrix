(() => {
  if (window.__movieTrackerIviBridgeInstalled) return;
  window.__movieTrackerIviBridgeInstalled = true;

  const MESSAGE_TYPE = 'movie-tracker:ivi-next-meta';
  const NEXT_API_PATH = 'videofromcompilation/next';

  const toPositiveInt = (value) => {
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? n : null;
  };

  const extractPayload = (raw) => {
    if (!raw) return null;

    let data = raw;
    if (typeof data === 'string') {
      try {
        data = JSON.parse(data);
      } catch {
        return null;
      }
    }

    if (!data || typeof data !== 'object') return null;

    const result = data.result && typeof data.result === 'object' ? data.result : data;
    const season = toPositiveInt(result.season);
    const nextEpisode = toPositiveInt(result.episode);
    if (season == null || nextEpisode == null) return null;

    return {
      season,
      nextEpisode,
      responseContentId: result.id != null ? String(result.id) : null,
      pageUrl: window.location.href,
    };
  };

  const emit = (requestUrl, raw) => {
    if (typeof requestUrl !== 'string' || !requestUrl.includes(NEXT_API_PATH)) return;

    const payload = extractPayload(raw);
    if (!payload) return;

    try {
      window.postMessage(
        {
          type: MESSAGE_TYPE,
          payload: {
            ...payload,
            requestUrl,
          },
        },
        '*'
      );
    } catch {}
  };

  const originalOpen = XMLHttpRequest.prototype.open;
  const originalSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    this.__movieTrackerUrl = typeof url === 'string' ? url : String(url || '');
    return originalOpen.call(this, method, url, ...rest);
  };

  XMLHttpRequest.prototype.send = function (...args) {
    this.addEventListener('load', function () {
      const url = this.__movieTrackerUrl;
      if (!url || !url.includes(NEXT_API_PATH)) return;

      let raw = null;
      try {
        raw = this.responseType === '' || this.responseType === 'text'
          ? this.responseText
          : this.response;
      } catch {
        raw = null;
      }

      emit(url, raw);
    });

    return originalSend.apply(this, args);
  };

  const originalFetch = window.fetch;
  if (typeof originalFetch === 'function') {
    window.fetch = async function (...args) {
      const response = await originalFetch.apply(this, args);

      try {
        const url =
          typeof args[0] === 'string'
            ? args[0]
            : args[0] && typeof args[0].url === 'string'
              ? args[0].url
              : response.url;

        if (url && url.includes(NEXT_API_PATH)) {
          response
            .clone()
            .text()
            .then((raw) => emit(url, raw))
            .catch(() => {});
        }
      } catch {}

      return response;
    };
  }
})();
