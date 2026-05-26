/**
 * VIJU (viju.ru): метаданные из URL и document.title.
 * Сериал: season-N/ep-M в пути; фильм: /movies/slug/player/
 */

import { cleanWatchTitle } from '../shared/watch-title.js';

function matchesHostname(hostname) {
  const h = String(hostname || '').toLowerCase();
  return h === 'viju.ru' || h.endsWith('.viju.ru');
}

/** /series/robinzon-kruzo/season-1/ep-1/player/ → { season, episode } */
function parseSeasonEpisodeFromPath(pathname) {
  const m = String(pathname || '').match(/\/season-(\d+)\/ep-(\d+)\//i);
  if (!m) return { season: null, episode: null };
  return { season: Number(m[1]), episode: Number(m[2]) };
}

/** slug из /movies/foo/player/ или /series/foo/... */
function parseContentSlug(pathname) {
  const p = String(pathname || '');
  let m = p.match(/\/movies\/([^/]+)\//);
  if (m) return m[1];
  m = p.match(/\/series\/([^/]+)\//);
  if (m) return m[1];
  return null;
}

export const platform = {
  id: 'viju',

  matches({ hostname }) {
    return matchesHostname(hostname);
  },

  async getMeta() {
    const url = window.location.href;
    const pathname = window.location.pathname;
    const rawTitle = document.title;

    const { season, episode } = parseSeasonEpisodeFromPath(pathname);
    const isSeriesPath =
      pathname.includes('/series/') || (season != null && episode != null);
    const type = isSeriesPath ? 'series' : 'movie';

    const title = cleanWatchTitle(rawTitle);
    const contentId = parseContentSlug(pathname);

    return {
      url,
      title,
      type,
      contentId,
      season: isSeriesPath ? season : null,
      episode: isSeriesPath ? episode : null,
    };
  },
};
