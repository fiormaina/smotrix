(() => {
  const { ensureAuthenticatedPageAccess, escapeHtml, navigateToPage, renderToasts } = window.MovieTrackerUI;
  const { createToastController } = window.MovieTrackerHelpers;
  const { createPrimaryTabs, renderAppHeader, renderBackLink } = window.MovieTrackerAppShell;
  const { createFolder, getFolderLimits, getFolderPageUrl } = window.MovieTrackerFolders;
  const routes = window.MovieTrackerRoutes;
  const PENDING_TOAST_KEY = "movieTracker.pendingFolderToast";

  const limits = getFolderLimits();
  const initialState = {
    tabs: createPrimaryTabs("folders"),
    form: {
      title: "",
      description: "",
    },
    errors: {},
    loading: false,
    toasts: [],
  };

  let state = cloneState(initialState);
  let rootElement = null;
  const showToast = createToastController(setState);

  function cloneState(value) {
    return {
      ...value,
      tabs: value.tabs.map((tab) => ({ ...tab })),
      form: { ...value.form },
      errors: { ...value.errors },
      toasts: [...value.toasts],
    };
  }

  function setState(updater) {
    state = typeof updater === "function" ? updater(state) : updater;
    renderApp();
  }

  function canSubmit() {
    return !state.loading && state.form.title.trim().length > 0;
  }

  function renderFieldError(fieldName) {
    const message = state.errors[fieldName];
    return message ? `<span class="folder-create__error">${escapeHtml(message)}</span>` : "";
  }

  function renderCreateForm() {
    return `
      <section class="folder-create__panel">
        <span class="folder-create__eyebrow">Новая папка</span>
        <h1 class="folder-create__title">Создать папку</h1>

        <form class="folder-create__form" novalidate>
          <label class="folder-create__field">
            <span class="folder-create__label">Название</span>
            <input
              class="folder-create__input ${state.errors.title ? "folder-create__input--error" : ""}"
              type="text"
              value="${escapeHtml(state.form.title)}"
              maxlength="${limits.titleMaxLength}"
              placeholder="Название"
              data-field="title"
              ${state.loading ? "disabled" : ""}
            />
            ${renderFieldError("title")}
          </label>

          <label class="folder-create__field">
            <span class="folder-create__label">Описание</span>
            <textarea
              class="folder-create__textarea ${state.errors.description ? "folder-create__textarea--error" : ""}"
              maxlength="${limits.descriptionMaxLength}"
              placeholder="Описание"
              data-field="description"
              ${state.loading ? "disabled" : ""}
            >${escapeHtml(state.form.description)}</textarea>
            ${renderFieldError("description")}
          </label>

          <div class="folder-create__actions">
            <button class="profile-button" type="button" data-action="cancel" ${state.loading ? "disabled" : ""}>Отмена</button>
            <button class="profile-button profile-button--primary" type="button" data-action="submit" ${canSubmit() ? "" : "disabled"}>
              ${state.loading ? "Создаем..." : "Создать"}
            </button>
          </div>
        </form>
      </section>
    `;
  }

  function renderPage() {
    return `
      <div class="history-page folder-create-page">
        <h1 class="sr-only">Создание папки Movie Tracker</h1>
        <div class="history-page__shell">
          ${renderAppHeader({ tabs: state.tabs })}

          <div class="history-page__content">
            <section class="folder-create">
              ${renderBackLink("folder-create__back", "Папки", routes.folders)}
              <div class="folder-create__layout">
                ${renderCreateForm()}
              </div>
            </section>
          </div>
        </div>
        ${renderToasts(state.toasts)}
      </div>
    `;
  }

  function renderApp() {
    if (!rootElement) return;
    rootElement.innerHTML = renderPage();
  }

  function syncFormDom(fieldName = "") {
    const submitButton = rootElement?.querySelector('[data-action="submit"]');
    if (submitButton) {
      submitButton.disabled = !canSubmit();
    }

    if (!fieldName) return;

    const field = rootElement?.querySelector(`[data-field="${fieldName}"]`);
    if (!field) return;

    field.classList.remove("folder-create__input--error", "folder-create__textarea--error");
    field.closest(".folder-create__field")?.querySelector(".folder-create__error")?.remove();
  }

  function updateField(fieldName, value) {
    state.form[fieldName] = value;
    delete state.errors[fieldName];
  }

  async function handleSubmit() {
    if (state.loading) return;

    setState((currentState) => ({
      ...currentState,
      loading: true,
      errors: {},
    }));

    try {
      const folder = await createFolder({
        ...state.form,
        visibility: "private",
      });

      window.sessionStorage.setItem(
        PENDING_TOAST_KEY,
        JSON.stringify({ message: "Папка создана", type: "success" }),
      );
      navigateToPage(getFolderPageUrl(folder.id));
    } catch (error) {
      console.error(error);
      if (error.code === "validation") {
        setState((currentState) => ({
          ...currentState,
          loading: false,
          errors: { ...(error.errors ?? {}) },
        }));
        return;
      }

      setState((currentState) => ({
        ...currentState,
        loading: false,
      }));
      showToast("Ошибка загрузки", "error");
    }
  }

  function handleRootClick(event) {
    const navButton = event.target.closest("[data-nav-url]");
    if (navButton) {
      navigateToPage(navButton.dataset.navUrl);
      return;
    }

    const actionButton = event.target.closest("[data-action]");
    if (!actionButton) return;

    const action = actionButton.dataset.action;

    if (action === "submit") {
      handleSubmit();
      return;
    }

    if (action === "cancel") {
      navigateToPage(routes.folders);
      return;
    }
  }

  function handleRootInput(event) {
    const field = event.target.closest("[data-field]");
    if (!field) return;

    updateField(field.dataset.field, field.value);
    syncFormDom(field.dataset.field);
  }

  function initFolderCreatePage() {
    if (!ensureAuthenticatedPageAccess()) return;

    rootElement = document.querySelector("#folder-create-app");
    if (!rootElement) return;

    rootElement.addEventListener("click", handleRootClick);
    rootElement.addEventListener("input", handleRootInput);
    renderApp();
  }

  initFolderCreatePage();
})();
