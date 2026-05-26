import { cleanWatchTitle } from '../shared/watch-title.js';

function parseSeasonEpisodeFromText(text) {
  const sE = String(text || '');

  // s01e02 / S1E2 / s1 e2
  let m = sE.match(/s\s*(\d{1,3})\s*e\s*(\d{1,3})/i);
  if (m) return { season: Number(m[1]), episode: Number(m[2]) };

  // "1 сезон 2 серия" (very rough)
  m = sE.match(/(\d{1,3})\s*сезон.*?(\d{1,3})\s*сер/i);
  if (m) return { season: Number(m[1]), episode: Number(m[2]) };

  return { season: null, episode: null };
}

function guessType({ url, title, season, episode }) {
  const u = String(url || '').toLowerCase();
  const t = String(title || '').toLowerCase();

  if (season != null || episode != null) return 'series';
  if (u.includes('/series') || u.includes('/tv') || u.includes('season') || u.includes('episode')) return 'series';
  if (t.includes('сезон') || t.includes('серия') || t.includes('season') || t.includes('episode')) return 'series';
  return 'movie';
}

export const platform = {
  id: 'generic',

  matches() {
    return true;
  },

  async getMeta() {
    const url = window.location.href;
    const title = cleanWatchTitle(document.title);
    const se = parseSeasonEpisodeFromText(`${url} ${title}`);

    return {
      url,
      title,
      type: guessType({ url, title, season: se.season, episode: se.episode }),
      contentId: null,
      season: se.season,
      episode: se.episode,
    };
  },
};

