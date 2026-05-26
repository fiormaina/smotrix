import { cleanWatchTitle } from '../shared/watch-title.js';

function matchesHostname(hostname) {
  const h = String(hostname || '').toLowerCase();
  return h === 'hd.kinopoisk.ru' || h.endsWith('.hd.kinopoisk.ru');
}

/** /film/<uuid>/ */
function parseFilmIdFromPath(pathname) {
  const m = String(pathname || '').match(/\/film\/([^/?#]+)/i);
  return m ? m[1] : null;
}

function parseQueryInt(params, key) {
  const v = params.get(key);
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function isRootLandingPage({ pathname, contentId }) {
  const normalizedPath = String(pathname || '').replace(/\/+$/, '') || '/';
  return normalizedPath === '/' && !contentId;
}

export const platform = {
  id: 'kinopoisk',

  matches({ hostname }) {
    return matchesHostname(hostname);
  },

  async getMeta() {
    const url = window.location.href;
    const pathname = window.location.pathname;
    const params = new URLSearchParams(window.location.search);

    const filmId = parseFilmIdFromPath(pathname);
    const playingContentId = params.get('playingContentId') || null;

    let season = parseQueryInt(params, 'season');
    let episode = parseQueryInt(params, 'episode');

    const hasEpisodeContext = season != null && episode != null;
    const type = hasEpisodeContext ? 'series' : 'movie';

    const title = cleanWatchTitle(document.title);

    const contentId = playingContentId || filmId;
    if (isRootLandingPage({ pathname, contentId })) {
      return null;
    }

    return {
      url,
      title,
      type,
      contentId,
      season: type === 'series' ? season : null,
      episode: type === 'series' ? episode : null,
    };
  },
};
