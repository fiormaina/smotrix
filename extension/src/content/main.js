import { log, warn } from './logger.js';
import { getPlatformForLocation } from './platform-manager.js';
import { startVideoTracker } from './video-tracker.js';
import { buildPayload } from './payload-builder.js';

const ACTIVE_NOTICE_ID = 'movie-tracker-active-notice';
const ACTIVE_NOTICE_TEXT =
  'Расширение "Смотрикс" активно: просмотры на этом сайте будут добавляться автоматически.';
const SYNC_PROGRESS_MESSAGE_TYPE = 'movie-tracker:sync-watch-progress';
const NOTICE_FONT_FAMILY = '"Segoe UI Variable", "Segoe UI", Arial, sans-serif';

function isExtensionContextInvalidatedError(error) {
  const message = String(error?.message || error || '').toLowerCase();
  return message.includes('extension context invalidated');
}

function shouldEmit(progress, reason) {
  if (reason === 'ended') return true;
  if (reason === 'pause') return true;

  // Reduce spam: emit roughly every 30 seconds of playback.
  const t = Math.floor(progress.currentTime);
  return reason === 'timeupdate' && t > 0 && t % 30 === 0;
}

function isSupportedTrackingPlatform(platform) {
  return Boolean(platform?.id && platform.id !== 'generic');
}

function showActiveNotice() {
  if (document.getElementById(ACTIVE_NOTICE_ID)) return;

  const host = document.body || document.documentElement;
  if (!host) {
    requestAnimationFrame(showActiveNotice);
    return;
  }

  const toast = document.createElement('div');
  toast.id = ACTIVE_NOTICE_ID;
  toast.textContent = ACTIVE_NOTICE_TEXT;
  toast.setAttribute('role', 'status');
  toast.setAttribute('aria-live', 'polite');
  toast.style.position = 'fixed';
  toast.style.right = '20px';
  toast.style.bottom = '20px';
  toast.style.maxWidth = '360px';
  toast.style.padding = '14px 16px';
  toast.style.borderRadius = '16px';
  toast.style.background = 'rgba(19, 25, 36, 0.92)';
  toast.style.color = '#fff';
  toast.style.fontFamily = NOTICE_FONT_FAMILY;
  toast.style.fontSize = '14px';
  toast.style.lineHeight = '1.45';
  toast.style.boxShadow = '0 18px 48px rgba(0, 0, 0, 0.28)';
  toast.style.zIndex = '2147483647';
  toast.style.opacity = '0';
  toast.style.transform = 'translateY(12px)';
  toast.style.transition = 'opacity 180ms ease, transform 180ms ease';

  host.appendChild(toast);

  requestAnimationFrame(() => {
    toast.style.opacity = '1';
    toast.style.transform = 'translateY(0)';
  });

  window.setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(8px)';
    window.setTimeout(() => toast.remove(), 220);
  }, 3600);
}

async function run() {
  let isContextInvalidated = false;
  let stopTracking = () => {};

  const stopTrackingSafely = () => {
    if (typeof stopTracking !== 'function') return;

    try {
      stopTracking();
    } catch {
      // ignore cleanup errors during extension reloads
    }
  };

  const handleExtensionContextInvalidated = () => {
    if (isContextInvalidated) return true;

    isContextInvalidated = true;
    stopTrackingSafely();
    return true;
  };

  const platform = getPlatformForLocation(window.location);
  if (typeof platform.init === 'function') {
    await platform.init();
  }

  if (isSupportedTrackingPlatform(platform)) {
    showActiveNotice();
  }

  stopTracking = startVideoTracker({
    onProgress: async ({ reason, progress }) => {
      if (isContextInvalidated) return;
      if (!shouldEmit(progress, reason)) return;
      if (!isSupportedTrackingPlatform(platform)) return;

      try {
        const meta = await platform.getMeta();
        if (!meta || !meta.title || !meta.url) {
          log('skip sync: meta is incomplete', {
            platform: platform.id,
            hasMeta: Boolean(meta),
            title: meta?.title || null,
            url: meta?.url || null,
          });
          return;
        }

        const payload = buildPayload({
          platformId: platform.id,
          meta,
          progress,
        });

        log('payload', payload);

        if (globalThis.chrome?.runtime?.sendMessage) {
          const syncResult = await chrome.runtime.sendMessage({
            type: SYNC_PROGRESS_MESSAGE_TYPE,
            payload,
          }).catch((error) => {
            if (isExtensionContextInvalidatedError(error)) {
              handleExtensionContextInvalidated();
              return null;
            }

            warn('sync message failed', error);
            return null;
          });

          if (syncResult?.skipped) {
            log('watch sync skipped', syncResult);
          } else if (syncResult && syncResult.ok === false) {
            warn('watch sync failed', syncResult);
          } else if (syncResult?.ok) {
            log('watch sync success', {
              itemId: syncResult.itemId ?? null,
              recreated: Boolean(syncResult.recreated),
            });
          }
        }
      } catch (e) {
        if (isExtensionContextInvalidatedError(e)) {
          handleExtensionContextInvalidated();
          return;
        }

        warn('failed to sync watch progress', e);
      }
    },
  });
}

run().catch((e) => {
  if (isExtensionContextInvalidatedError(e)) {
    return;
  }

  warn('init error', e);
});
