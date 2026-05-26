import { BINDING_STORAGE_KEY as STORAGE_KEY, readApiBaseUrl } from '../src/shared/extension-config.js';

const USE_MOCK_BINDING = false;
const EXTENSION_CODE_PATTERN = /^MT-[A-Z0-9]{4}-[A-Z0-9]{4}$/;
const POPUP_TITLE_UNBOUND = 'Подключение расширения';
const POPUP_TITLE_BOUND = 'Просмотры отслеживаются';

const elements = {
  popupTitle: document.getElementById('popup-title'),
  statusBanner: document.getElementById('status-banner'),
  viewUnbound: document.getElementById('view-unbound'),
  viewBound: document.getElementById('view-bound'),
  bindForm: document.getElementById('bind-form'),
  codeInput: document.getElementById('code-input'),
  connectButton: document.getElementById('connect-button'),
  errorText: document.getElementById('error-text'),
  profileName: document.getElementById('profile-name'),
  profileEmail: document.getElementById('profile-email'),
  connectedAt: document.getElementById('connected-at'),
  avatar: document.getElementById('avatar'),
  openPlatformButton: document.getElementById('open-platform-button'),
  disconnectButton: document.getElementById('disconnect-button'),
  platformLinkUnbound: document.getElementById('platform-link-unbound'),
};

function storageGet(key) {
  return new Promise((resolve) => {
    chrome.storage.local.get([key], (result) => resolve(result[key] ?? null));
  });
}

function storageSet(value) {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [STORAGE_KEY]: value }, () => resolve());
  });
}

function storageRemove() {
  return new Promise((resolve) => {
    chrome.storage.local.remove(STORAGE_KEY, () => resolve());
  });
}

function formatDate(value) {
  if (!value) return '';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  return new Intl.DateTimeFormat('ru-RU', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function setHidden(element, hidden) {
  element.classList.toggle('hidden', hidden);
}

function setBanner(message, kind = 'loading') {
  if (!message) {
    elements.statusBanner.textContent = '';
    elements.statusBanner.className = 'status-banner hidden';
    return;
  }

  elements.statusBanner.textContent = message;
  elements.statusBanner.className = `status-banner ${kind}`;
}

function setError(message = '') {
  elements.errorText.textContent = message;
  setHidden(elements.errorText, !message);
}

function setLoadingState(isLoading) {
  elements.connectButton.disabled = isLoading;
  elements.codeInput.disabled = isLoading;
  elements.disconnectButton.disabled = isLoading;
  elements.openPlatformButton.disabled = isLoading;
}

function normalizeHttpUrl(value) {
  if (typeof value !== 'string') return '';

  const trimmed = value.trim();
  if (!trimmed) return '';

  try {
    const parsed = new URL(trimmed);
    if (!/^https?:$/i.test(parsed.protocol)) return '';
    return parsed.href;
  } catch {
    return '';
  }
}

async function resolvePlatformUrl(binding = null) {
  const profileUrl = normalizeHttpUrl(binding?.profileUrl);
  if (profileUrl) {
    return profileUrl;
  }

  return normalizeHttpUrl(await readApiBaseUrl());
}

async function setPlatformLinks(binding = null) {
  const platformUrl = await resolvePlatformUrl(binding);
  elements.platformLinkUnbound.href = platformUrl || '#';
}

function setPopupTitle(title) {
  const safeTitle = String(title || POPUP_TITLE_UNBOUND).trim() || POPUP_TITLE_UNBOUND;
  if (elements.popupTitle) {
    elements.popupTitle.textContent = safeTitle;
  }
  document.title = safeTitle;
}

async function openPlatform(event) {
  event?.preventDefault();
  const binding = await storageGet(STORAGE_KEY);
  const platformUrl = await resolvePlatformUrl(binding);
  if (!platformUrl) {
    return;
  }

  if (chrome.tabs?.create) {
    chrome.tabs.create({ url: platformUrl });
    return;
  }

  window.open(platformUrl, '_blank', 'noopener,noreferrer');
}

function initialsFromName(name, email) {
  const source = String(name || email || 'MT').trim();
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }
  return source.slice(0, 2).toUpperCase();
}

function normalizeExtensionCode(code) {
  return String(code || '').trim().toUpperCase();
}

function isStoredBindingValid(binding) {
  if (!binding || typeof binding !== 'object') return false;
  if (!binding.accessToken || typeof binding.accessToken !== 'string') return false;
  if (!binding.name || typeof binding.name !== 'string') return false;
  if (!binding.extensionCode || !EXTENSION_CODE_PATTERN.test(binding.extensionCode)) return false;
  return true;
}

function buildBindingFromAuthResponse(payload) {
  const user = payload?.user;
  if (!user || typeof user !== 'object') {
    throw new Error('Сервер вернул неполные данные пользователя');
  }

  const name = user.display_name || user.displayName || user.login || user.email || '';
  const extensionCode = normalizeExtensionCode(user.extension_code || user.extensionCode);
  const connectedAt = payload?.connectedAt || user.created_at || user.createdAt || new Date().toISOString();

  return {
    accessToken: payload.access_token || payload.accessToken || '',
    tokenType: payload.token_type || payload.tokenType || 'bearer',
    userId: user.id ?? null,
    name,
    email: user.email || '',
    login: user.login || '',
    extensionCode,
    profileUrl: user.profile_url || user.profileUrl || '',
    avatarKey: user.avatar_key || user.avatarKey || '',
    avatarImage: user.avatar_image || user.avatarImage || '',
    connectedAt,
  };
}

async function readJsonSafely(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function renderUnbound() {
  setPopupTitle(POPUP_TITLE_UNBOUND);
  setHidden(elements.viewUnbound, false);
  setHidden(elements.viewBound, true);
  setLoadingState(false);
}

function renderBound(binding) {
  setPopupTitle(POPUP_TITLE_BOUND);
  setHidden(elements.viewUnbound, true);
  setHidden(elements.viewBound, false);

  elements.profileName.textContent = binding.name || 'Подключённый аккаунт';
  elements.profileEmail.textContent = binding.email || '';
  elements.connectedAt.textContent = binding.connectedAt
    ? `Привязано: ${formatDate(binding.connectedAt)}`
    : 'Аккаунт успешно подключён';
  elements.avatar.textContent = initialsFromName(binding.name, binding.email);
}

async function bindWithMock(code) {
  const normalized = normalizeExtensionCode(code);
  if (!normalized || normalized.length < 4) {
    const error = new Error('Введите корректный код привязки.');
    error.code = 'invalid_code';
    throw error;
  }

  if (normalized === 'SERVER') {
    const error = new Error('Сервер недоступен');
    error.code = 'server_unavailable';
    throw error;
  }

  if (normalized === 'ERROR') {
    const error = new Error('Не удалось подключить');
    error.code = 'bind_failed';
    throw error;
  }

  return {
    name: 'Demo User',
    email: 'demo.user@example.com',
    connectedAt: new Date().toISOString(),
    code: normalized,
  };
}

async function bindWithServer(code) {
  const apiBaseUrl = await readApiBaseUrl();
  const normalizedCode = normalizeExtensionCode(code);
  if (!EXTENSION_CODE_PATTERN.test(normalizedCode)) {
    const error = new Error('Введите код в формате MT-XXXX-XXXX.');
    error.code = 'invalid_code';
    throw error;
  }

  const response = await fetch(`${apiBaseUrl}/api/v1/auth/extension-login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ extension_code: normalizedCode }),
  });

  const payload = await readJsonSafely(response);

  if (response.status === 400 || response.status === 401 || response.status === 404 || response.status === 422) {
    const error = new Error(payload?.detail?.message || 'Не удалось подключить');
    error.code = 'bind_failed';
    throw error;
  }

  if (!response.ok) {
    const error = new Error('Сервер недоступен');
    error.code = 'server_unavailable';
    throw error;
  }

  return buildBindingFromAuthResponse(payload);
}

async function bindAccount(code) {
  if (USE_MOCK_BINDING) {
    return bindWithMock(code);
  }

  return bindWithServer(code);
}

async function handleSubmit(event) {
  event.preventDefault();

  const code = elements.codeInput.value.trim();
  setError('');
  setBanner('Проверка кода…', 'loading');
  setLoadingState(true);

  try {
    const binding = await bindAccount(code);
    await storageSet(binding);
    setBanner('');
    renderBound(binding);
  } catch (error) {
    const message =
      error?.code === 'server_unavailable'
        ? 'Сервер недоступен'
        : error?.message || 'Не удалось подключить';

    setBanner(message, 'error');
    setError(message);
    renderUnbound();
  } finally {
    setLoadingState(false);
  }
}

async function handleDisconnect() {
  setBanner('');
  setError('');
  await storageRemove();
  elements.codeInput.value = '';
  renderUnbound();
}

async function bootstrap() {
  setBanner('');
  setError('');

  const binding = await storageGet(STORAGE_KEY);
  if (isStoredBindingValid(binding)) {
    await setPlatformLinks(binding);
    renderBound(binding);
    return;
  }

  if (binding) {
    await storageRemove();
  }

  await setPlatformLinks();
  renderUnbound();
}

elements.bindForm.addEventListener('submit', handleSubmit);
elements.openPlatformButton.addEventListener('click', openPlatform);
elements.platformLinkUnbound.addEventListener('click', openPlatform);
elements.disconnectButton.addEventListener('click', handleDisconnect);

bootstrap().catch(() => {
  setBanner('Не удалось загрузить состояние расширения', 'error');
  renderUnbound();
});
