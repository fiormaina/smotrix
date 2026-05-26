(() => {
  if (window.__movieTrackerAmediatekaBridgeInstalled) return;
  window.__movieTrackerAmediatekaBridgeInstalled = true;

  const MESSAGE_TYPE = 'movie-tracker:amediateka-watch-context';
  const WATCH_CONTEXT_PATH = '/watch_context/';

  const parseContentIdFromUrl = (requestUrl) => {
    const match = String(requestUrl || '').match(/\/watch_context\/(\d+)\/context\//i);
    return match ? match[1] : null;
  };

  const parsePlayContext = (value) => {
    const text = String(value || '');
    const match = text.match(/(\d+)\s*сезон\s*,\s*(\d+)\s*серия/i);
    if (!match) return null;

    return {
      season: Number(match[1]),
      episode: Number(match[2]),
    };
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

    const parsed = parsePlayContext(data.playContext);
    if (!parsed) return null;

    return {
      ...parsed,
      contentId: null,
      pageUrl: window.location.href,
      playContext: String(data.playContext || ''),
    };
  };

  const emit = (requestUrl, raw) => {
    if (typeof requestUrl !== 'string' || !requestUrl.includes(WATCH_CONTEXT_PATH)) return;

    const payload = extractPayload(raw);
    if (!payload) return;

    try {
      const payloadWithRequest = {
        ...payload,
        contentId: payload.contentId || parseContentIdFromUrl(requestUrl),
        requestUrl,
      };

      window.postMessage(
        {
          type: MESSAGE_TYPE,
          payload: payloadWithRequest,
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
      if (!url || !url.includes(WATCH_CONTEXT_PATH)) return;

      let raw = null;
      try {
        raw =
          this.responseType === '' || this.responseType === 'text'
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

        if (url && url.includes(WATCH_CONTEXT_PATH)) {
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
