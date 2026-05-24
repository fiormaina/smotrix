const routes = window.MovieTrackerRoutes;
const landingContent = {
  title: "Смотри. Запоминай. Возвращайся.",
  description:
    "Создай свою коллекцию фильмов и сериалов, отслеживай прогресс и всегда знай, где остановился.",
  actions: [
    { label: "Зарегистрироваться", href: "#register", action: "register" },
    { label: "Войти", href: "#login", action: "login" },
  ],
  footerLinks: [
    { label: "О проекте", href: routes.about },
    { label: "Контакты", href: routes.contacts },
  ],
  footerYear: "2026",
};

const API_BASE_URL = String(window.MovieTrackerConfig?.apiBaseUrl ?? "").replace(/\/+$/, "");
const API_V1_BASE_URL = `${API_BASE_URL}/api/v1`;
const REGISTER_ENDPOINT = `${API_V1_BASE_URL}/auth/register`;
const LOGIN_ENDPOINT = `${API_V1_BASE_URL}/auth/login`;
const CURRENT_USER_STORAGE_KEY = "movieTracker.currentUser";
const ACCESS_TOKEN_STORAGE_KEY = "movieTracker.accessToken";
const APP_STATE_TRANSFER_HASH_KEY = String(window.MovieTrackerConfig?.appStateTransferHashKey ?? "movieTrackerState");
const DEFAULT_DISPLAY_NAME = "Пользователь";
const DEFAULT_AVATAR_KEY = "violet";
const AUTH_TEMPORARY_ERROR_MESSAGE = "произошла ошибка, скоро все заработает";

const authModalContent = {
  register: {
    title: "Регистрация",
    description: "Создай аккаунт по адресу почты, чтобы сохранять фильмы и прогресс.",
    submitLabel: "Зарегистрироваться",
    switchText: "Уже есть аккаунт?",
    switchLabel: "Войти",
    switchTarget: "login",
    fields: [
      {
        id: "register-email",
        label: "Почта",
        name: "email",
        type: "email",
        autocomplete: "email",
        placeholder: "name@example.com",
      },
      {
        id: "register-login",
        label: "Логин",
        name: "login",
        type: "text",
        autocomplete: "username",
        placeholder: "test",
        minLength: 3,
      },
      {
        id: "register-password",
        label: "Пароль",
        name: "password",
        type: "password",
        autocomplete: "new-password",
        placeholder: "Минимум 8 символов",
        minLength: 8,
      },
    ],
  },
  login: {
    title: "Вход",
    description: "Войди по адресу почты или логину.",
    submitLabel: "Войти",
    switchText: "Нет аккаунта?",
    switchLabel: "Зарегистрироваться",
    switchTarget: "register",
    fields: [
      {
        id: "login-identifier",
        label: "Почта или логин",
        name: "identifier",
        type: "text",
        autocomplete: "username",
        placeholder: "name@example.com или login",
      },
      {
        id: "login-password",
        label: "Пароль",
        name: "password",
        type: "password",
        autocomplete: "current-password",
        placeholder: "Твой пароль",
      },
    ],
  },
};

let activeModal = null;
let lastFocusedElement = null;
let isAuthSubmitting = false;
let pendingAuthRedirectTarget = "";

class AuthRequestError extends Error {
  constructor(message, field = null) {
    super(message);
    this.name = "AuthRequestError";
    this.field = field;
  }
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function renderActions(actions) {
  return actions
    .map(
      (action) => `
        <a class="button" href="${action.href}" data-action="${action.action}">
          ${action.label}
        </a>
      `,
    )
    .join("");
}

function renderAuthField(field) {
  const minLengthAttribute = field.minLength ? ` minlength="${field.minLength}"` : "";
  const errorId = `${field.id}-error`;

  return `
    <label class="auth-modal__field" for="${escapeHtml(field.id)}">
      <span class="auth-modal__label">${escapeHtml(field.label)}</span>
      <input
        class="auth-modal__input"
        id="${escapeHtml(field.id)}"
        name="${escapeHtml(field.name)}"
        type="${escapeHtml(field.type)}"
        autocomplete="${escapeHtml(field.autocomplete)}"
        placeholder="${escapeHtml(field.placeholder)}"
        aria-describedby="${escapeHtml(errorId)}"
        aria-invalid="false"
        required
        ${minLengthAttribute}
      />
      <span class="auth-modal__error" id="${escapeHtml(errorId)}" data-auth-error="${escapeHtml(field.name)}"></span>
    </label>
  `;
}

function renderAuthModal(type) {
  const modal = authModalContent[type];
  if (!modal) return "";

  return `
    <div class="auth-modal" data-auth-modal="${escapeHtml(type)}">
      <div class="auth-modal__backdrop" data-auth-close></div>
      <section
        class="auth-modal__dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="${escapeHtml(type)}-modal-title"
      >
        <button class="auth-modal__close" type="button" data-auth-close aria-label="Закрыть">
          <span aria-hidden="true"></span>
        </button>
        <div class="auth-modal__header">
          <h2 class="auth-modal__title" id="${escapeHtml(type)}-modal-title">${escapeHtml(modal.title)}</h2>
          <p class="auth-modal__description">${escapeHtml(modal.description)}</p>
        </div>
        <form class="auth-modal__form" data-auth-form="${escapeHtml(type)}" novalidate>
          ${modal.fields.map(renderAuthField).join("")}
          <p class="auth-modal__form-error" data-auth-form-error></p>
          <button class="auth-modal__submit" type="submit" data-submit-state="inactive" disabled>${escapeHtml(modal.submitLabel)}</button>
        </form>
        <p class="auth-modal__switch">
          ${escapeHtml(modal.switchText)}
          <button class="auth-modal__switch-button" type="button" data-auth-switch="${escapeHtml(modal.switchTarget)}">
            ${escapeHtml(modal.switchLabel)}
          </button>
        </p>
      </section>
    </div>
  `;
}

function renderFooter(links, year) {
  const linksMarkup = links
    .map((link) => `<a class="footer__link" href="${escapeHtml(link.href)}">${escapeHtml(link.label)}</a>`)
    .join("");

  return `
    <div class="footer__line" aria-hidden="true"></div>
    <div class="footer__links">
      ${linksMarkup}
    </div>
    <p class="footer__year">${year}</p>
  `;
}

function renderLanding(data) {
  return `
    <section class="landing">
      <div class="landing__overlay">
        <div class="landing__brand" role="img" aria-label="Мотрикс"></div>
        <main class="hero">
          <section class="hero-card" aria-label="Главный экран">
            <h1 class="hero-card__title">${data.title}</h1>
            <p class="hero-card__description">${data.description}</p>
            <div class="hero-card__actions">
              ${renderActions(data.actions)}
            </div>
          </section>
        </main>
        <footer class="footer">
          ${renderFooter(data.footerLinks, data.footerYear)}
        </footer>
      </div>
    </section>
  `;
}

function closeAuthModal() {
  const modal = document.querySelector("[data-auth-modal]");
  if (!modal) return;

  modal.remove();
  activeModal = null;
  document.body.classList.remove("modal-open");

  if (lastFocusedElement instanceof HTMLElement) {
    lastFocusedElement.focus();
  }
}

function focusModal(modal) {
  const firstInput = modal.querySelector("input");
  const closeButton = modal.querySelector("[data-auth-close]");
  const focusTarget = firstInput || closeButton;

  if (focusTarget instanceof HTMLElement) {
    focusTarget.focus();
  }
}

function openAuthModal(type) {
  if (!authModalContent[type]) return;

  closeAuthModal();
  activeModal = type;
  lastFocusedElement = document.activeElement;
  document.body.insertAdjacentHTML("beforeend", renderAuthModal(type));
  document.body.classList.add("modal-open");
  isAuthSubmitting = false;

  const modal = document.querySelector(`[data-auth-modal="${type}"]`);
  if (!modal) return;

  const form = modal.querySelector("[data-auth-form]");
  if (form) refreshAuthSubmitState(form);
  focusModal(modal);
}

function setAuthFormError(form, message) {
  const error = form.querySelector("[data-auth-form-error]");
  if (error) {
    error.textContent = message;
  }
}

function getAuthFieldConfig(form, input) {
  const modal = authModalContent[form.dataset.authForm];
  return modal?.fields.find((field) => field.name === input.name);
}

function getAuthFieldError(input, field) {
  const value = input.value.trim();

  if (!value) {
    return "Заполни это поле.";
  }

  if (field.type === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
    return "Укажи корректный адрес почты.";
  }

  if (field.minLength && value.length < field.minLength) {
    return `Минимум ${field.minLength} символов.`;
  }

  return "";
}

function setAuthFieldError(input, message) {
  const field = input.closest(".auth-modal__field");
  const error = field?.querySelector(`[data-auth-error="${input.name}"]`);
  const hasError = Boolean(message);

  input.classList.toggle("auth-modal__input--invalid", hasError);
  input.setAttribute("aria-invalid", hasError ? "true" : "false");

  if (field) {
    field.classList.toggle("auth-modal__field--invalid", hasError);
  }

  if (error) {
    error.textContent = message;
  }
}

function validateAuthInput(input) {
  const form = input.closest("[data-auth-form]");
  if (!form) return true;

  const field = getAuthFieldConfig(form, input);
  if (!field) return true;

  const message = getAuthFieldError(input, field);
  setAuthFieldError(input, message);

  return !message;
}

function validateAuthForm(form) {
  const inputs = [...form.querySelectorAll("input")];
  let invalidInput = null;

  inputs.forEach((input) => {
    const isValid = validateAuthInput(input);
    if (!isValid && !invalidInput) {
      invalidInput = input;
    }
  });

  if (invalidInput) {
    invalidInput.focus();
    return false;
  }

  return true;
}

function isAuthFormReady(form) {
  const inputs = [...form.querySelectorAll("input")];

  return inputs.every((input) => {
    const field = getAuthFieldConfig(form, input);
    return !field || !getAuthFieldError(input, field);
  });
}

function getRegisterPayload(formData) {
  return {
    email: String(formData.email ?? "").trim(),
    login: String(formData.login ?? "").trim(),
    password: String(formData.password ?? ""),
  };
}

function getLoginFromEmail(email) {
  return email.split("@")[0] || "user";
}

function normalizeAuthUser(responseData, fallbackIdentifier) {
  const source = responseData?.user ?? responseData ?? {};
  const login = source.login ?? source.username ?? getLoginFromEmail(fallbackIdentifier);

  return {
    id: source.id ?? source.userId ?? `user-${Date.now()}`,
    email: source.email ?? fallbackIdentifier,
    login,
    username: login,
    displayName: source.displayName ?? source.display_name ?? source.name ?? DEFAULT_DISPLAY_NAME,
    followingCount: source.followingCount ?? 0,
    followersCount: source.followersCount ?? 0,
    extensionCode: source.extensionCode ?? source.extension_code ?? "MT-USER-2026",
    avatarKey: source.avatarKey ?? source.avatar_key ?? DEFAULT_AVATAR_KEY,
    avatarImage: source.avatarImage ?? source.avatar_image ?? source.avatarUrl ?? "",
    profileUrl: routes.resolveAppUrl(
      source.profileUrl ?? source.profile_url,
      routes.profile({ user: login }),
      { absolute: true },
    ),
  };
}

function saveCurrentUser(user) {
  localStorage.setItem(CURRENT_USER_STORAGE_KEY, JSON.stringify(user));
}

function buildRouteUrlWithApiBase(targetPath) {
  const routeUrl = new URL(routes.resolveAppUrl(targetPath, targetPath, { absolute: true }));
  if (API_BASE_URL) {
    routeUrl.searchParams.set("apiBaseUrl", API_BASE_URL);
  }
  return routeUrl;
}

function encodeBase64UrlUtf8(value) {
  const bytes = new TextEncoder().encode(String(value));
  let binary = "";
  const chunkSize = 32768;

  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }

  return window.btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function encodeAppStateTransfer(state) {
  return encodeBase64UrlUtf8(JSON.stringify(state));
}

function buildPostAuthRedirectUrl(targetPath, user) {
  const redirectUrl = buildRouteUrlWithApiBase(targetPath);
  const currentAppOrigin = window.location.origin;

  if (redirectUrl.origin === currentAppOrigin) {
    return redirectUrl.href;
  }

  const accessToken = String(localStorage.getItem(ACCESS_TOKEN_STORAGE_KEY) ?? "").trim();
  const transferredState = {
    apiBaseUrl: API_BASE_URL,
    currentUser: user,
  };

  if (accessToken) {
    transferredState.accessToken = accessToken;
  }

  const hashParams = new URLSearchParams(redirectUrl.hash.startsWith("#") ? redirectUrl.hash.slice(1) : redirectUrl.hash);
  hashParams.set(APP_STATE_TRANSFER_HASH_KEY, encodeAppStateTransfer(transferredState));
  redirectUrl.hash = hashParams.toString();

  return redirectUrl.href;
}

function sanitizeRedirectTarget(value) {
  const trimmedValue = String(value ?? "").trim();
  if (!trimmedValue) return "";

  try {
    return routes.resolveAppUrl(trimmedValue, routes.watchHistory, { absolute: true });
  } catch (error) {
    return "";
  }
}

function consumeAuthRequest() {
  const currentUrl = new URL(window.location.href);
  const type = String(currentUrl.searchParams.get("auth") ?? "").trim();
  const redirectTarget = sanitizeRedirectTarget(currentUrl.searchParams.get("redirect"));

  if (!authModalContent[type]) {
    return null;
  }

  currentUrl.searchParams.delete("auth");
  currentUrl.searchParams.delete("redirect");
  window.history.replaceState({}, "", `${currentUrl.pathname}${currentUrl.search}${currentUrl.hash}`);

  return {
    type,
    redirectTarget,
  };
}

function hasAuthenticatedSession() {
  try {
    return Boolean(
      String(localStorage.getItem(ACCESS_TOKEN_STORAGE_KEY) ?? "").trim() &&
      String(localStorage.getItem(CURRENT_USER_STORAGE_KEY) ?? "").trim(),
    );
  } catch (error) {
    console.warn(error);
    return false;
  }
}

async function sendAuthRequest(endpoint, payload) {
  const response = await fetch(endpoint, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  let data = null;
  try {
    data = await response.json();
  } catch (error) {
    data = null;
  }

  if (!response.ok) {
    if (response.status >= 500) {
      throw new AuthRequestError(AUTH_TEMPORARY_ERROR_MESSAGE);
    }

    const detail = data?.detail;
    if (detail && typeof detail === "object" && detail.message) {
      throw new AuthRequestError(detail.message, detail.field);
    }

    throw new AuthRequestError(
      detail ?? data?.message ?? data?.error ?? "Не удалось выполнить действие. Попробуй еще раз.",
    );
  }

  return data;
}

function getAuthErrorMessage(error) {
  if (error instanceof TypeError || error.message === "Failed to fetch") {
    return AUTH_TEMPORARY_ERROR_MESSAGE;
  }

  if (
    error?.name === "InvalidCharacterError" ||
    /invalid\s*character/i.test(String(error?.message ?? ""))
  ) {
    return "Не удалось завершить вход из-за внутренней ошибки приложения. Обнови страницу и попробуй еще раз.";
  }

  return error.message || AUTH_TEMPORARY_ERROR_MESSAGE;
}

function setAuthRequestError(form, error) {
  const message = getAuthErrorMessage(error);
  const input = error.field ? form.querySelector(`[name="${CSS.escape(error.field)}"]`) : null;

  if (input) {
    setAuthFieldError(input, message);
    input.focus();
    return;
  }

  setAuthFormError(form, message);
}

function refreshAuthSubmitState(form) {
  const submitButton = form.querySelector(".auth-modal__submit");
  if (!submitButton) return;

  const type = form.dataset.authForm;
  const content = authModalContent[type];
  const isReady = isAuthFormReady(form);
  const submitState = isAuthSubmitting ? "submitting" : isReady ? "ready" : "inactive";

  submitButton.disabled = isAuthSubmitting || !isReady;
  submitButton.dataset.submitState = submitState;
  submitButton.textContent = isAuthSubmitting ? "Отправляем..." : content.submitLabel;
}

async function handleAuthSubmit(event) {
  const form = event.target.closest("[data-auth-form]");
  if (!form) return;

  event.preventDefault();
  if (isAuthSubmitting) return;

  setAuthFormError(form, "");
  if (!validateAuthForm(form)) return;

  const formData = Object.fromEntries(new FormData(form));
  const type = form.dataset.authForm;
  const safeFormData = { ...formData, password: formData.password ? "[hidden]" : "" };

  isAuthSubmitting = true;
  refreshAuthSubmitState(form);

  try {
    console.info("[Movie Tracker auth]", type, safeFormData);
    const payload = type === "register"
      ? getRegisterPayload(formData)
      : {
          identifier: String(formData.identifier ?? "").trim(),
          password: String(formData.password ?? ""),
        };
    const endpoint = type === "register" ? REGISTER_ENDPOINT : LOGIN_ENDPOINT;
    const responseData = await sendAuthRequest(endpoint, payload);
    const fallbackIdentifier = payload.email ?? payload.identifier;

    if (responseData?.access_token) {
      localStorage.setItem(ACCESS_TOKEN_STORAGE_KEY, responseData.access_token);
    }

    const normalizedUser = normalizeAuthUser(responseData, fallbackIdentifier);
    saveCurrentUser(normalizedUser);
    const redirectTarget = pendingAuthRedirectTarget || (type === "register" ? routes.profile() : routes.watchHistory);
    window.location.href = buildPostAuthRedirectUrl(redirectTarget, normalizedUser);
  } catch (error) {
    console.error(error);
    setAuthRequestError(form, error);
    isAuthSubmitting = false;
    refreshAuthSubmitState(form);
  }
}

function handleAuthInput(event) {
  const input = event.target.closest(".auth-modal__input");
  if (!input) return;

  const form = input.closest("[data-auth-form]");

  if (input.classList.contains("auth-modal__input--invalid")) {
    validateAuthInput(input);
  }

  if (form) {
    refreshAuthSubmitState(form);
  }
}

function handleAuthFocusOut(event) {
  const input = event.target.closest(".auth-modal__input");
  if (!input || !input.value.trim()) return;
  validateAuthInput(input);

  const form = input.closest("[data-auth-form]");
  if (form) {
    refreshAuthSubmitState(form);
  }
}

function handleAuthModalClick(event) {
  const closeButton = event.target.closest("[data-auth-close]");
  if (closeButton) {
    closeAuthModal();
    return;
  }

  const switchButton = event.target.closest("[data-auth-switch]");
  if (switchButton) {
    openAuthModal(switchButton.dataset.authSwitch);
  }
}

function handleAuthModalKeydown(event) {
  if (!activeModal || event.key !== "Escape") return;
  closeAuthModal();
}

function attachAuthActions(root) {
  root.querySelectorAll("[data-action]").forEach((element) => {
    element.addEventListener("click", (event) => {
      event.preventDefault();
      openAuthModal(element.dataset.action);
    });
  });

  document.addEventListener("click", handleAuthModalClick);
  document.addEventListener("input", handleAuthInput);
  document.addEventListener("focusout", handleAuthFocusOut);
  document.addEventListener("submit", handleAuthSubmit);
  document.addEventListener("keydown", handleAuthModalKeydown);
}

function initApp() {
  const root = document.querySelector("#app");
  if (!root) return;

  const authRequest = consumeAuthRequest();
  root.innerHTML = renderLanding(landingContent);
  attachAuthActions(root);

  if (!authRequest) return;

  pendingAuthRedirectTarget = authRequest.redirectTarget;
  if (pendingAuthRedirectTarget && hasAuthenticatedSession()) {
    window.location.href = pendingAuthRedirectTarget;
    return;
  }

  openAuthModal(authRequest.type);
}

initApp();

