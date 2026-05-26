import { cleanWatchTitle } from '../shared/watch-title.js';

function matchesHostname(hostname) {
  const h = String(hostname || '').toLowerCase();
  return h === 'kion.ru' || h.endsWith('.kion.ru');
}

/** /video/slug или /video/slug/sezon-N/seriya-M */
function parseVideoPath(pathname) {
  const m = String(pathname || '').match(
    /\/video\/([^/?#]+)(?:\/sezon-(\d+)\/seriya-(\d+))?/i
  );
  if (!m) return { slug: null, season: null, episode: null };
  return {
    slug: m[1],
    season: m[2] != null ? Number(m[2]) : null,
    episode: m[3] != null ? Number(m[3]) : null,
  };
}

export const platform = {
  id: 'kion',

  matches({ hostname }) {
    return matchesHostname(hostname);
  },

  async getMeta() {
    const url = window.location.href;
    const { slug, season, episode } = parseVideoPath(window.location.pathname);
    const hasEpisode = season != null && episode != null;
    const type = hasEpisode ? 'series' : 'movie';

    return {
      url,
      title: cleanWatchTitle(document.title),
      type,
      contentId: slug,
      season: hasEpisode ? season : null,
      episode: hasEpisode ? episode : null,
    };
  },
};
