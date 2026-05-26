import { cleanWatchTitle } from '../shared/watch-title.js';

function matchesHostname(hostname) {
  const h = String(hostname || '').toLowerCase();
  return h === 'wink.ru' || h.endsWith('.wink.ru');
}

function stripYearSuffix(slug) {
  return String(slug || '').replace(/-year-\d{4}$/i, '');
}

/**
 * /movies/slug-year-2026/player или
 * /episodes/name-sezon-N-seriya-M-year-2026/player
 */
function parseWinkPath(pathname) {
  const p = String(pathname || '');
  const ep = p.match(
    /\/episodes\/(.+)-sezon-(\d+)-seriya-(\d+)(?:-year-\d+)?\/player/i
  );
  if (ep) {
    return {
      contentId: stripYearSuffix(ep[1]),
      season: Number(ep[2]),
      episode: Number(ep[3]),
    };
  }
  const mv = p.match(/\/movies\/([^/]+)\/player/i);
  if (mv) {
    return {
      contentId: stripYearSuffix(mv[1]),
      season: null,
      episode: null,
    };
  }
  return { contentId: null, season: null, episode: null };
}

export const platform = {
  id: 'wink',

  matches({ hostname }) {
    return matchesHostname(hostname);
  },

  async getMeta() {
    const url = window.location.href;
    const { contentId, season, episode } = parseWinkPath(window.location.pathname);
    const hasEpisode = season != null && episode != null;
    const type = hasEpisode ? 'series' : 'movie';

    return {
      url,
      title: cleanWatchTitle(document.title),
      type,
      contentId,
      season: hasEpisode ? season : null,
      episode: hasEpisode ? episode : null,
    };
  },
};
