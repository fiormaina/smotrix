import { BINDING_STORAGE_KEY, readApiBaseUrl } from '../shared/extension-config.js';

const IVI_NEXT_API_PATH = 'api2.ivi.ru/mobileapi/videofromcompilation/next/v7';
const SYNC_PROGRESS_MESSAGE_TYPE = 'movie-tracker:sync-watch-progress';
const WATCH_SYNC_STATE_STORAGE_KEY = 'movieTrackerWatchSyncState';
const DEBUG_PREFIX = '[movie-tracker:bg]';
const TRACKING_TAB_URL_PATTERNS = [
  'https://amediateka.ru/*',
  'https://*.amediateka.ru/*',
  'https://ivi.ru/*',
  'https://*.ivi.ru/*',
  'https://hd.kinopoisk.ru/*',
  'https://*.hd.kinopoisk.ru/*',
  'https://kion.ru/*',
  'https://*.kion.ru/*',
  'https://premier.one/*',
  'https://*.premier.one/*',
  'https://viju.ru/*',
  'https://*.viju.ru/*',
  'https://wink.ru/*',
  'https://*.wink.ru/*',
];

function debugLog(...args) {
  // eslint-disable-next-line no-console
  console.log(DEBUG_PREFIX, ...args);
}

function debugWarn(...args) {
  // eslint-disable-next-line no-console
  console.warn(DEBUG_PREFIX, ...args);
}

function storageGet(keys) {
  return new Promise((resolve) => {
    chrome.storage.local.get(keys, (result) => resolve(result ?? {}));
  });
}

function storageSet(value) {
  return new Promise((resolve) => {
    chrome.storage.local.set(value, () => resolve());
  });
}

function queryTabs(queryInfo) {
  return new Promise((resolve, reject) => {
    chrome.tabs.query(queryInfo, (tabs) => {
      const error = chrome.runtime.lastError;
      if (error) {
        reject(new Error(error.message));
        return;
      }

      resolve(Array.isArray(tabs) ? tabs : []);
    });
  });
}

function reloadTab(tabId) {
  return new Promise((resolve, reject) => {
    chrome.tabs.reload(tabId, () => {
      const error = chrome.runtime.lastError;
      if (error) {
        reject(new Error(error.message));
        return;
      }

      resolve();
    });
  });
}

function clampPercent(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) return 0;
  if (numeric > 100) return 100;
  return Math.round(numeric);
}

function toPositiveInt(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? Math.round(numeric) : null;
}

function buildContentKey(payload) {
  const contentIdentity =
    payload?.contentId ??
    payload?.url ??
    `${payload?.title || ''}:${payload?.type || ''}:${payload?.season ?? ''}:${payload?.episode ?? ''}`;

  return [
    String(payload?.platform || 'unknown'),
    String(payload?.type || 'movie'),
    String(contentIdentity || ''),
    String(payload?.season ?? ''),
    String(payload?.episode ?? ''),
    String(payload?.title || ''),
  ].join('::');
}

function buildStateKey(binding, payload) {
  return `${binding?.userId ?? 'unknown'}::${buildContentKey(payload)}`;
}

function deriveStatus(payload) {
  const percent = Number(payload?.progress?.percent || 0);
  if (payload?.progress?.ended || percent >= 0.98) return 'completed';
  if (Number(payload?.progress?.currentTime || 0) > 0) return 'watching';
  return 'planned';
}

function buildCreatePayload(payload) {
  return {
    type: payload?.type === 'series' ? 'series' : 'movie',
    title: String(payload?.title || '').trim(),
    url: String(payload?.url || '').trim() || null,
    year: null,
    status: deriveStatus(payload),
    season: toPositiveInt(payload?.season),
    episode: toPositiveInt(payload?.episode),
    rating: null,
    comment: null,
    folderId: null,
  };
}

function buildPatchPayload(payload) {
  const status = deriveStatus(payload);
  const progress = clampPercent(Number(payload?.progress?.percent || 0) * 100);
  const patch = {
    status,
    progress,
    url: String(payload?.url || '').trim() || null,
    type: payload?.type === 'series' ? 'series' : 'movie',
    season: toPositiveInt(payload?.season),
    episode: toPositiveInt(payload?.episode),
    updatedAt: new Date().toISOString(),
    folderId: null,
  };

  if (status === 'completed') {
    patch.watchedAt = new Date().toISOString();
  }

  return patch;
}

async function fetchText(url) {
  const response = await fetch(url, {
    method: 'GET',
    credentials: 'include',
  });

  const text = await response.text();
  return {
    ok: response.ok,
    status: response.status,
    text,
  };
}

async function requestBackend(path, { method = 'GET', body, accessToken }) {
  const apiBaseUrl = await readApiBaseUrl();
  debugLog('request backend', {
    method,
    url: `${apiBaseUrl}/api/v1${path}`,
    hasAccessToken: Boolean(accessToken),
    body: body ? JSON.parse(body) : null,
  });

  const response = await fetch(`${apiBaseUrl}/api/v1${path}`, {
    method,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body,
  });

  const contentType = response.headers.get('content-type') || '';
  let data = null;

  if (contentType.includes('application/json')) {
    try {
      data = await response.json();
    } catch {
      data = null;
    }
  } else {
    try {
      const text = await response.text();
      data = text ? { message: text } : null;
    } catch {
      data = null;
    }
  }

  if (!response.ok) {
    const error = new Error(data?.detail?.message || data?.message || 'Backend request failed');
    error.status = response.status;
    error.data = data;
    debugWarn('backend request failed', {
      method,
      path,
      status: response.status,
      data,
    });
    throw error;
  }

  debugLog('backend response', {
    method,
    path,
    status: response.status,
    data,
  });
  return data;
}

async function getBinding() {
  const result = await storageGet([BINDING_STORAGE_KEY]);
  return result[BINDING_STORAGE_KEY] ?? null;
}

async function getWatchSyncState() {
  const result = await storageGet([WATCH_SYNC_STATE_STORAGE_KEY]);
  return result[WATCH_SYNC_STATE_STORAGE_KEY] ?? {};
}

async function setWatchSyncState(state) {
  await storageSet({ [WATCH_SYNC_STATE_STORAGE_KEY]: state });
}

async function reloadTrackingTabsAfterExtensionUpdate() {
  if (!chrome.tabs?.query || !chrome.tabs?.reload) {
    return;
  }

  try {
    const tabs = await queryTabs({ url: TRACKING_TAB_URL_PATTERNS });
    await Promise.allSettled(
      tabs
        .map((tab) => tab?.id)
        .filter((tabId) => Number.isInteger(tabId))
        .map((tabId) => reloadTab(tabId))
    );
  } catch (error) {
    debugWarn('failed to reload tracking tabs after extension update', error);
  }
}

async function createWatchItem(binding, payload) {
  const created = await requestBackend('/watch-history', {
    method: 'POST',
    body: JSON.stringify(buildCreatePayload(payload)),
    accessToken: binding.accessToken,
  });

  return created?.item ?? null;
}

async function patchWatchItem(binding, itemId, payload) {
  const updated = await requestBackend(`/watch-history/${encodeURIComponent(itemId)}`, {
    method: 'PATCH',
    body: JSON.stringify(buildPatchPayload(payload)),
    accessToken: binding.accessToken,
  });

  return updated?.item ?? null;
}

async function syncWatchProgress(payload) {
  const binding = await getBinding();
  if (!binding?.accessToken) {
    debugWarn('watch sync skipped: binding is missing', {
      hasBinding: Boolean(binding),
      bindingKeys: binding ? Object.keys(binding) : [],
    });
    return { ok: false, skipped: true, reason: 'not_bound' };
  }

  if (!payload?.title) {
    debugWarn('watch sync skipped: missing title', payload);
    return { ok: false, skipped: true, reason: 'missing_title' };
  }

  const state = await getWatchSyncState();
  const stateKey = buildStateKey(binding, payload);
  const currentState = state[stateKey] ?? null;
  const patchPayload = buildPatchPayload(payload);

  if (
    currentState?.itemId &&
    currentState.lastStatus === patchPayload.status &&
    currentState.lastProgress === patchPayload.progress
  ) {
    debugLog('watch sync skipped: unchanged progress', {
      itemId: currentState.itemId,
      stateKey,
      status: patchPayload.status,
      progress: patchPayload.progress,
    });
    return { ok: true, skipped: true, itemId: currentState.itemId };
  }

  let itemId = currentState?.itemId ?? null;

  try {
    debugLog('watch sync started', {
      stateKey,
      itemId,
      payload,
      patchPayload,
    });

    if (!itemId) {
      const createdItem = await createWatchItem(binding, payload);
      itemId = createdItem?.id ?? null;
      if (!itemId) {
        throw new Error('Watch item was created without id');
      }
    }

    const updatedItem = await patchWatchItem(binding, itemId, payload);
    state[stateKey] = {
      itemId,
      lastStatus: patchPayload.status,
      lastProgress: patchPayload.progress,
      lastSyncedAt: new Date().toISOString(),
      title: String(payload.title || ''),
      season: payload.season ?? null,
      episode: payload.episode ?? null,
      type: payload.type || 'movie',
    };
    await setWatchSyncState(state);

    return {
      ok: true,
      itemId,
      item: updatedItem,
    };
  } catch (error) {
    debugWarn('watch sync failed', {
      stateKey,
      itemId,
      error: error?.message || String(error),
      status: error?.status || 0,
      data: error?.data || null,
    });
    if (itemId && (error?.status === 400 || error?.status === 404)) {
      delete state[stateKey];
      await setWatchSyncState(state);

      const createdItem = await createWatchItem(binding, payload);
      const recreatedItemId = createdItem?.id ?? null;
      if (!recreatedItemId) {
        throw error;
      }

      const updatedItem = await patchWatchItem(binding, recreatedItemId, payload);
      state[stateKey] = {
        itemId: recreatedItemId,
        lastStatus: patchPayload.status,
        lastProgress: patchPayload.progress,
        lastSyncedAt: new Date().toISOString(),
        title: String(payload.title || ''),
        season: payload.season ?? null,
        episode: payload.episode ?? null,
        type: payload.type || 'movie',
      };
      await setWatchSyncState(state);

      return {
        ok: true,
        itemId: recreatedItemId,
        item: updatedItem,
        recreated: true,
      };
    }

    throw error;
  }
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  debugLog('message received', {
    type: message?.type || null,
    hasPayload: Boolean(message?.payload),
  });

  if (message?.type === 'movie-tracker:ivi-fetch-next') {
    const url = String(message.url || '');
    if (!url.includes(IVI_NEXT_API_PATH)) {
      sendResponse({ ok: false, text: null, status: 0 });
      return false;
    }

    fetchText(url)
      .then((result) => sendResponse(result))
      .catch(() => sendResponse({ ok: false, text: null, status: 0 }));

    return true;
  }

  if (message?.type === SYNC_PROGRESS_MESSAGE_TYPE) {
    syncWatchProgress(message.payload)
      .then((result) => sendResponse(result))
      .catch((error) => {
        debugWarn('sendResponse sync failure', {
          error: error?.message || 'Sync failed',
          status: error?.status || 0,
          data: error?.data || null,
        });
        sendResponse({
          ok: false,
          error: error?.message || 'Sync failed',
          status: error?.status || 0,
        });
      });

    return true;
  }

  return false;
});

chrome.runtime.onInstalled.addListener((details) => {
  if (details?.reason !== 'install' && details?.reason !== 'update') {
    return;
  }

  reloadTrackingTabsAfterExtensionUpdate();
});
