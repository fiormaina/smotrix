import { cleanWatchTitle } from '../shared/watch-title.js';

const AMEDIATEKA_BRIDGE_MESSAGE_TYPE = 'movie-tracker:amediateka-watch-context';
const AMEDIATEKA_BRIDGE_SCRIPT_ID = 'movie-tracker-amediateka-bridge';
const AMEDIATEKA_BRIDGE_SCRIPT_PATH = 'src/page/amediateka-watch-context-bridge.js';

let isBridgeListenerInstalled = false;
let bridgeLoadPromise = null;
let latestWatchContextMeta = null;
const GENERIC_TITLES = new Set([
  'Фильмы онлайн',
  'Сериалы онлайн',
  'Смотреть онлайн',
  'Amediateka',
]);

function isGenericAmediatekaTitle(title) {
  const t = String(title || '').trim();
  if (!t) return true;
  if (GENERIC_TITLES.has(t)) return true;

  const x = t.toLowerCase();
  if (x.includes('amediateka')) return true;
  if (x.includes('лучшие фильмы')) return true;
  if (x.includes('лучшие сериалы')) return true;
  if (x.includes('фильмы онлайн')) return true;
  if (x.includes('сериалы онлайн')) return true;
  if (x.startsWith('смотреть ')) return true;

  return false;
}

function matchesHostname(hostname) {
  const h = String(hostname || '').toLowerCase();
  return h === 'amediateka.ru' || h.endsWith('.amediateka.ru');
}

function parseWatchPath(pathname) {
  const m = String(pathname || '').match(/^\/watch\/((movies|series)_(\d+)_[^/?#]+)/i);
  if (!m) {
    return { type: 'movie', contentId: null, numericId: null };
  }

  return {
    type: m[2] === 'series' ? 'series' : 'movie',
    contentId: m[1],
    numericId: m[3] || null,
  };
}

function readAmediatekaTitle() {
  const selectors = [
    'h1',
    '[class*="player"] [class*="title"]',
    '[class*="watch"] [class*="title"]',
    '[class*="hero"] h1',
    '[class*="content"] h1',
  ];

  for (const selector of selectors) {
    const text = document.querySelector(selector)?.textContent;
    const title = cleanWatchTitle(String(text || '').trim());
    if (title && !isGenericAmediatekaTitle(title)) {
      return title;
    }
  }

  return '';
}

function parseBridgeMeta(eventData) {
  const payload = eventData?.payload;
  if (!payload || typeof payload !== 'object') return null;

  const season = Number(payload.season);
  const episode = Number(payload.episode);
  if (!Number.isFinite(season) || !Number.isFinite(episode)) return null;

  return {
    season,
    episode,
    contentId: payload.contentId != null ? String(payload.contentId) : null,
    requestUrl: String(payload.requestUrl || ''),
    pageUrl: String(payload.pageUrl || ''),
  };
}

function installBridgeListener() {
  if (isBridgeListenerInstalled) return;
  isBridgeListenerInstalled = true;

  window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    if (event.data?.type !== AMEDIATEKA_BRIDGE_MESSAGE_TYPE) return;

    const meta = parseBridgeMeta(event.data);
    if (meta) {
      latestWatchContextMeta = meta;
    }
  });
}

function installBridge() {
  installBridgeListener();

  if (bridgeLoadPromise) return bridgeLoadPromise;

  const existing = document.getElementById(AMEDIATEKA_BRIDGE_SCRIPT_ID);
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
      script.id = AMEDIATEKA_BRIDGE_SCRIPT_ID;
      script.src = runtime.getURL(AMEDIATEKA_BRIDGE_SCRIPT_PATH);
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

function pickSeriesMeta() {
  if (!latestWatchContextMeta) return null;

  const samePage =
    !latestWatchContextMeta.pageUrl || latestWatchContextMeta.pageUrl === window.location.href;
  return samePage ? latestWatchContextMeta : null;
}

function shouldSkipGenericPageTitle({ title, contentId, explicitContentId }) {
  if (title) return false;
  if (explicitContentId) return false;
  return !contentId;
}

export const platform = {
  id: 'amediateka',

  matches({ hostname }) {
    return matchesHostname(hostname);
  },

  async init() {
    await installBridge();
  },

  async getMeta() {
    installBridge();

    const url = window.location.href;
    const watchContextMeta = pickSeriesMeta();
    const { type: pathType, contentId: explicitContentId } = parseWatchPath(window.location.pathname);
    const title = readAmediatekaTitle();
    const contentId = explicitContentId || watchContextMeta?.contentId || null;
    const type = watchContextMeta ? 'series' : pathType;

    if (
      shouldSkipGenericPageTitle({
        title,
        contentId,
        explicitContentId,
      })
    ) {
      return null;
    }

    return {
      url,
      title,
      type,
      contentId,
      season: type === 'series' ? watchContextMeta?.season ?? null : null,
      episode: type === 'series' ? watchContextMeta?.episode ?? null : null,
    };
  },
};
