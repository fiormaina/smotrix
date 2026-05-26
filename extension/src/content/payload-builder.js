function clamp01(n) {
  if (!Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

export function buildPayload({ platformId, meta, progress }) {
  const nowIso = new Date().toISOString();

  return {
    schemaVersion: 1,
    timestamp: nowIso,
    platform: platformId,
    url: meta.url,
    type: meta.type, // 'movie' | 'series'
    title: meta.title,
    contentId: meta.contentId ?? null,
    season: meta.season ?? null,
    episode: meta.episode ?? null,
    progress: {
      currentTime: progress.currentTime,
      duration: progress.duration,
      percent: clamp01(progress.percent),
      paused: progress.paused,
      ended: progress.ended,
    },
  };
}