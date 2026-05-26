import { log, warn } from './logger.js';

function isFinitePositive(n) {
  return Number.isFinite(n) && n > 0;
}

function readProgress(video) {
  const currentTime = Number(video.currentTime) || 0;
  const duration = Number(video.duration) || 0;
  const percent = isFinitePositive(duration) ? currentTime / duration : 0;

  return {
    currentTime,
    duration,
    percent,
    paused: Boolean(video.paused),
    ended: Boolean(video.ended),
  };
}

function pickMainVideo(videos) {
  if (!videos.length) return null;

  // Prefer the longest known duration (most likely the actual player).
  let best = videos[0];
  let bestDuration = Number(best.duration) || 0;

  for (const v of videos) {
    const d = Number(v.duration) || 0;
    if (d > bestDuration) {
      best = v;
      bestDuration = d;
    }
  }

  return best;
}

export function startVideoTracker({ onProgress }) {
  if (typeof onProgress !== 'function') {
    throw new Error('startVideoTracker: onProgress must be a function');
  }

  let attachedVideo = null;
  let stopFns = [];

  function detach() {
    for (const fn of stopFns) fn();
    stopFns = [];
    attachedVideo = null;
  }

  function attach(video) {
    if (!video || video === attachedVideo) return;

    detach();
    attachedVideo = video;

    log('video attached', { src: video.currentSrc || video.src || null });

    const emit = (reason) => {
      try {
        onProgress({ reason, progress: readProgress(video), video });
      } catch (e) {
        warn('onProgress error', e);
      }
    };

    const onTimeUpdate = () => emit('timeupdate');
    const onPause = () => emit('pause');
    const onPlay = () => emit('play');
    const onEnded = () => emit('ended');
    const onLoaded = () => emit('loadedmetadata');

    video.addEventListener('timeupdate', onTimeUpdate);
    video.addEventListener('pause', onPause);
    video.addEventListener('play', onPlay);
    video.addEventListener('ended', onEnded);
    video.addEventListener('loadedmetadata', onLoaded);

    stopFns.push(() => video.removeEventListener('timeupdate', onTimeUpdate));
    stopFns.push(() => video.removeEventListener('pause', onPause));
    stopFns.push(() => video.removeEventListener('play', onPlay));
    stopFns.push(() => video.removeEventListener('ended', onEnded));
    stopFns.push(() => video.removeEventListener('loadedmetadata', onLoaded));

    emit('attach');
  }

  function rescan() {
    const videos = Array.from(document.querySelectorAll('video'));
    const best = pickMainVideo(videos);
    if (best) attach(best);
  }

  const mo = new MutationObserver(() => {
    // Many sites re-render players; keep it simple and resilient.
    rescan();
  });

  const startObserving = () => {
    const root = document.documentElement;
    if (!root) return false;

    mo.observe(root, { childList: true, subtree: true });
    rescan();
    return true;
  };

  if (!startObserving()) {
    const onReady = () => {
      if (!startObserving()) return;
      document.removeEventListener('readystatechange', onReady);
    };

    document.addEventListener('readystatechange', onReady);
  }

  return () => {
    mo.disconnect();
    detach();
  };
}
