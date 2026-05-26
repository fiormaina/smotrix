import { cleanWatchTitle } from '../shared/watch-title.js';

const IVI_BRIDGE_MESSAGE_TYPE = 'movie-tracker:ivi-next-meta';
const IVI_BRIDGE_SCRIPT_ID = 'movie-tracker-ivi-bridge';
const IVI_BRIDGE_SCRIPT_PATH = 'src/page/ivi-fetch-bridge.js';

let isBridgeListenerInstalled = false;
let bridgeLoadPromise = null;
let latestNextMeta = null;

function matchesHostname(hostname) {
  const h = String(hostname || '').toLowerCase();
  return h === 'ivi.ru' || h.endsWith('.ivi.ru');
}

function toPositiveInt(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function parseWatchPath(pathname) {
  const m = String(pathname || '').match(/^\/watch\/([^/?#]+)(?:\/([^/?#]+))?/i);
  if (!m) return { slug: null, episodeId: null };

  return {
    slug: m[1] || null,
    episodeId: /^\d+$/.test(m[2] || '') ? m[2] : null,
  };
}

function inferType({ rawTitle, episodeId }) {
  if (episodeId) return 'series';

  const t = String(rawTitle || '').toLowerCase();
  if (t.includes('все серии подряд')) return 'series';
  if (/\d+\s*сезон\s+\d+\s*серия/u.test(t)) return 'series';
  if (t.startsWith('сериал ')) return 'series';
  if (t.startsWith('шоу ')) return 'series';
  return 'movie';
}

function parseSeasonEpisodeFromTitle(rawTitle) {
  const t = String(rawTitle || '');
  const m = t.match(/(\d{1,3})\s+сезон\s+(\d{1,3})\s+серия/iu);
  if (!m) return { season: null, episode: null };

  return {
    season: Number(m[1]),
    episode: Number(m[2]),
  };
}

function readIviTitle() {
  const heading = document.querySelector('h1')?.textContent;
  return cleanWatchTitle(String(heading || document.title || '').trim());
}

function parseBridgeMeta(eventData) {
  const payload = eventData?.payload;
  if (!payload || typeof payload !== 'object') return null;

  const season = toPositiveInt(payload.season);
  const nextEpisode = toPositiveInt(payload.nextEpisode ?? payload.episode);
  if (season == null || nextEpisode == null) return null;

  return {
    season,
    nextEpisode,
    requestUrl: String(payload.requestUrl || ''),
    responseContentId:
      payload.responseContentId != null ? String(payload.responseContentId) : null,
    pageUrl: String(payload.pageUrl || ''),
  };
}

function installBridgeListener() {
  if (isBridgeListenerInstalled) return;
  isBridgeListenerInstalled = true;

  window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    if (event.data?.type !== IVI_BRIDGE_MESSAGE_TYPE) return;

    const meta = parseBridgeMeta(event.data);
    if (meta) {
      latestNextMeta = meta;
    }
  });
}

function installBridge() {
  installBridgeListener();

  if (bridgeLoadPromise) return bridgeLoadPromise;

  const existing = document.getElementById(IVI_BRIDGE_SCRIPT_ID);
  if (existing) {
    bridgeLoadPromise = Promise.resolve();
    return bridgeLoadPromise;
  }

  const runtime = globalThis.chrome?.runtime;
  if (!runtime?.getURL) {
    bridgeLoadPromise = Promise.resolve();
    return bridgeLoadPromise;
  }

  bridgeLoadPromise = new Promise((resolve) => {
    const append = () => {
      const parent = document.head || document.documentElement || document.body;
      if (!parent) {
        setTimeout(append, 0);
        return;
      }

      const script = document.createElement('script');
      script.id = IVI_BRIDGE_SCRIPT_ID;
      script.src = runtime.getURL(IVI_BRIDGE_SCRIPT_PATH);
      script.onload = () => {
        script.remove();
        resolve();
      };
      script.onerror = () => {
        script.remove();
        resolve();
      };

      parent.appendChild(script);
    };

    append();
  });

  return bridgeLoadPromise;
}

function deriveCurrentSeriesMeta({ titleMeta, nextMeta }) {
  if (titleMeta?.season != null || titleMeta?.episode != null) {
    return {
      season: titleMeta?.season ?? null,
      episode: titleMeta?.episode ?? null,
    };
  }

  if (!nextMeta) {
    return { season: null, episode: null };
  }

  const samePage = !nextMeta.pageUrl || nextMeta.pageUrl === window.location.href;
  if (!samePage) {
    return { season: null, episode: null };
  }

  if (nextMeta.season != null && nextMeta.nextEpisode > 1) {
    return {
      season: nextMeta.season,
      episode: nextMeta.nextEpisode - 1,
    };
  }

  return { season: null, episode: null };
}

function deriveContentId({ slug, episodeId }) {
  if (episodeId) return episodeId;
  return slug;
}

export const platform = {
  id: 'ivi',

  matches({ hostname }) {
    return matchesHostname(hostname);
  },

  async init() {
    await installBridge();
  },

  async getMeta() {
    installBridge();

    const url = window.location.href;
    const rawTitle = document.title;
    const { slug, episodeId } = parseWatchPath(window.location.pathname);
    const titleMeta = parseSeasonEpisodeFromTitle(rawTitle);
    const type = inferType({ rawTitle, episodeId });
    const nextMeta = type === 'series' ? latestNextMeta : null;

    const currentSeriesMeta =
      type === 'series'
        ? deriveCurrentSeriesMeta({ titleMeta, nextMeta })
        : null;

    return {
      url,
      title: readIviTitle(),
      type,
      contentId: deriveContentId({ slug, episodeId }),
      season: type === 'series' ? currentSeriesMeta?.season ?? null : null,
      episode: type === 'series' ? currentSeriesMeta?.episode ?? null : null,
    };
  },
};
