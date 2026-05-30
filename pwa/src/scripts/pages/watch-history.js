(() => {
const {
  autoSizeTextarea,
  ensureAuthenticatedPageAccess,
  escapeHtml,
  navigateToPage,
  renderModalShell,
  renderToasts,
} = window.MovieTrackerUI;
const syncOverlayHost =
  window.MovieTrackerUI.syncOverlayHost ||
  ((host, markup) => {
    if (host) host.innerHTML = String(markup ?? "");
  });
const {
  createToastController,
  openContinueUrl,
  resolveContinueUrl,
} = window.MovieTrackerHelpers;
const { createPrimaryTabs, renderAppFooter, renderAppHeader } = window.MovieTrackerAppShell;
const {
  addItemToFolder,
  fetchOwnFolders,
  listFolderOptions,
} = window.MovieTrackerFolders;
const watchHistoryApi = window.MovieTrackerMediaApi;
const routes = window.MovieTrackerRoutes;
const OPEN_CREATE_MODAL_KEY = "movieTracker.openCreateFolderModal";
const PENDING_CREATE_SOURCE_KEY = "movieTracker.pendingCreateFolderSource";
const SECTION_ITEM_LIMIT = 8;
const SYSTEM_FOLDER_DEFINITIONS = Object.freeze({
  watching: {
    systemKeys: ["continue-watching", "continue_watching", "watching", "in-progress"],
    titles: ["Продолжить просмотр"],
  },
  completed: {
    systemKeys: ["completed", "viewed", "watched", "recently-viewed", "recently_viewed"],
    titles: ["Просмотрено", "Недавно просмотрено"],
  },
});

const manualStatuses = [
  { value: "planned", label: "Планирую смотреть" },
  { value: "watching", label: "Смотрю" },
  { value: "completed", label: "Просмотрено" },
];

const defaultManualForm = {
  type: "movie",
  title: "",
  status: "planned",
  season: "",
  episode: "",
  rating: "",
  comment: "",
};

const previewItems = Object.freeze([
  {
    id: "preview-series-severance",
    type: "series",
    title: "Разделение",
    meta: "Сериал · 2 сезон · 4 серия",
    status: "watching",
    badge: "48 мин осталось",
    progress: 72,
    rating: null,
    comment: "",
    continueUrl: "https://example.com/watch/severance-s2e4",
    updatedAt: "2026-05-25T14:20:00.000Z",
  },
  {
    id: "preview-movie-dune",
    type: "movie",
    title: "Дюна: Часть вторая",
    meta: "Фильм · 2024",
    status: "completed",
    badge: "",
    progress: 100,
    rating: 9,
    comment: "Сильный визуал и темп.",
    watchedAt: "2026-05-24T20:30:00.000Z",
    updatedAt: "2026-05-24T20:30:00.000Z",
  },
  {
    id: "preview-series-bear",
    type: "series",
    title: "Медведь",
    meta: "Сериал · 3 сезон",
    status: "completed",
    badge: "",
    progress: 100,
    rating: 8,
    comment: "",
    watchedAt: "2026-05-23T18:10:00.000Z",
    updatedAt: "2026-05-23T18:10:00.000Z",
  },
]);

const cardActions = {
  rate: {
    label: "Оценить",
    action: "rate",
    icon: `
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
        <path d="M9 2.3L10.93 6.21L15.25 6.84L12.13 9.88L12.87 14.18L9 12.14L5.13 14.18L5.87 9.88L2.75 6.84L7.07 6.21L9 2.3Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"></path>
      </svg>
    `,
  },
  "add-to-folder": {
    label: "Добавить в папку",
    action: "add-to-folder",
    icon: `
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
        <path d="M9 3V15M3 9H15" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"></path>
      </svg>
    `,
  },
  "mark-watched": {
    label: "Отметить как просмотренное",
    action: "mark-watched",
    icon: `
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
        <path d="M4 9.5L7.2 12.7L14 5.9" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"></path>
      </svg>
    `,
  },
};

const initialState = {
  tabs: createPrimaryTabs("history"),
  filters: [
    { label: "Все", value: "all", active: true },
    { label: "Фильмы", value: "movie", active: false },
    { label: "Сериалы", value: "series", active: false },
  ],
  query: "",
  activeFilter: "all",
  items: [],
  ratingOverlay: {
    isOpen: false,
    itemId: null,
    value: 0,
    comment: "",
    loading: false,
  },
  folderOverlay: {
    isOpen: false,
    itemId: null,
    selectedFolderId: "",
    loading: false,
    optionsLoading: false,
    options: [],
  },
  manualOverlay: {
    isOpen: false,
    form: { ...defaultManualForm },
    errors: {},
    loading: false,
  },
  loading: true,
  errorMessage: "",
  toasts: [],
  pendingActions: new Set(),
};

let state = structuredCloneWithSet(initialState);
let rootElement = null;
let folderOverlayRequestId = 0;
const showToast = createToastController((updater) => setState(updater, { scope: "overlay" }));

function reportFatalError(error) {
  const message = error instanceof Error ? error.stack || error.message : String(error);
  console.error(error);

  if (!rootElement) return;

  rootElement.innerHTML = `
    <section class="history-empty" style="padding: 32px; max-width: 960px; margin: 0 auto;" aria-live="assertive">
      <h2 class="history-empty__title">Ошибка рендера страницы</h2>
      <p class="history-empty__text">Не удалось отрисовать историю просмотра.</p>
      <pre style="white-space: pre-wrap; overflow-wrap: anywhere; text-align: left; font-size: 12px; line-height: 1.5; padding: 16px; border-radius: 16px; background: rgba(15, 23, 42, 0.06); color: #1f2937;">${escapeHtml(message)}</pre>
    </section>
  `;
}

function isPreviewMode() {
  try {
    const value = new URL(window.location.href).searchParams.get("preview");
    return ["1", "true", "yes", "on"].includes(String(value ?? "").trim().toLowerCase());
  } catch (error) {
    return false;
  }
}

function structuredCloneWithSet(value) {
  return {
    ...value,
    items: value.items.map((item) => ({ ...item })),
    tabs: value.tabs.map((tab) => ({ ...tab })),
    filters: value.filters.map((filter) => ({ ...filter })),
    ratingOverlay: { ...value.ratingOverlay },
    folderOverlay: {
      ...value.folderOverlay,
      options: value.folderOverlay.options.map((folder) => ({ ...folder })),
    },
    manualOverlay: {
      ...value.manualOverlay,
      form: { ...value.manualOverlay.form },
      errors: { ...value.manualOverlay.errors },
    },
    toasts: [...value.toasts],
    pendingActions: new Set(value.pendingActions ?? []),
  };
}

function setState(updater, options = {}) {
  state = typeof updater === "function" ? updater(state) : updater;
  try {
    renderApp(options.scope ?? "full");
  } catch (error) {
    reportFatalError(error);
    return;
  }

  if (options.autosizeTextarea) {
    requestAnimationFrame(autoSizeActiveTextarea);
  }
}

function getItemById(id) {
  const normalizedId = String(id ?? "");
  return state.items.find((item) => String(item.id) === normalizedId);
}

function getMovieDetailUrl(id) {
  return routes.movieDetail({ id });
}

function hasDisplayValue(value) {
  if (value === null || value === undefined) return false;
  if (typeof value === "number") return Number.isFinite(value) && value > 0;
  return String(value).trim().length > 0;
}

function normalizeMeta(value) {
  return String(value ?? "")
    .split("·")
    .map((part) => part.trim())
    .filter(Boolean)
    .join(" · ");
}

function normalizeHistoryItem(item = {}) {
  const numericRating = Number(item.userRating ?? item.rating);

  return {
    ...item,
    id: String(item.id ?? ""),
    folderId:
      item.folderId === null || item.folderId === undefined
        ? null
        : String(item.folderId),
    meta: normalizeMeta(item.meta),
    rating: Number.isFinite(numericRating) && numericRating > 0 ? numericRating : null,
  };
}

function openMovieDetail(id) {
  navigateToPage(getMovieDetailUrl(id));
}

function patchItemWithMovieDetail(id, detail) {
  if (!detail || typeof detail !== "object") return null;

  const currentItem = getItemById(id);
  if (!currentItem) return null;

  const nextItem = normalizeHistoryItem({
    ...currentItem,
    ...detail,
  });

  setState((currentState) => ({
    ...currentState,
    items: currentState.items.map((item) =>
      String(item.id) === String(id) ? nextItem : item,
    ),
  }));

  return nextItem;
}

function updateItemInState(id, patch) {
  const normalizedId = String(id ?? "");
  return {
    ...state,
    items: state.items.map((item) =>
      String(item.id) === normalizedId ? { ...item, ...patch } : item,
    ),
  };
}

function addPendingAction(key) {
  state.pendingActions.add(key);
}

function removePendingAction(key) {
  state.pendingActions.delete(key);
}

function getSections(items) {
  const watchingItems = items.filter((item) => item.status === "watching");
  const completedItems = items
    .filter((item) => item.status === "completed")
    .sort((a, b) => new Date(b.watchedAt ?? b.updatedAt) - new Date(a.watchedAt ?? a.updatedAt));

  return [
    { title: "Продолжить просмотр", items: watchingItems, folderKind: "watching" },
    { title: "Недавно просмотрено", items: completedItems, folderKind: "completed" },
  ].filter((section) => section.items.length > 0);
}

function normalizeFolderLookupValue(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-");
}

function matchesSystemFolder(folder, kind) {
  const definition = SYSTEM_FOLDER_DEFINITIONS[kind];
  if (!definition || !folder) return false;

  const normalizedSystemKey = normalizeFolderLookupValue(folder.systemKey ?? folder.system_key);
  const normalizedTitle = String(folder.title ?? "").trim().toLowerCase();

  return (
    (normalizedSystemKey && definition.systemKeys.includes(normalizedSystemKey)) ||
    definition.titles.some((title) => normalizedTitle === title.toLowerCase())
  );
}

function getItemType(item) {
  if (item?.type === "series" || item?.type === "movie") return item.type;
  if (String(item.id ?? "").startsWith("series-")) return "series";
  return "movie";
}

function getVisibleItems() {
  const normalizedQuery = state.query.trim().toLowerCase();

  return state.items.filter((item) => {
    const matchesFilter = state.activeFilter === "all" || getItemType(item) === state.activeFilter;
    const haystack = `${item.title} ${item.meta} ${item.badge}`.toLowerCase();
    const matchesQuery = !normalizedQuery || haystack.includes(normalizedQuery);
    return matchesFilter && matchesQuery;
  });
}

function getHistoryStats(items) {
  const watchingCount = items.filter((item) => item.status !== "completed").length;
  const completedCount = items.filter((item) => item.status === "completed").length;

  return { watchingCount, completedCount };
}

function getActionsForItem(item) {
  if (item.status === "completed") {
    return ["rate", "add-to-folder"];
  }

  return ["rate", "add-to-folder", "mark-watched"];
}

function renderFilters(filters) {
  return filters
    .map(
      (filter) => `
        <button class="history-toolbar__filter ${filter.active ? "history-toolbar__filter--active" : ""}" type="button" data-filter="${filter.value}">
          ${filter.label}
        </button>
      `,
    )
    .join("");
}

function renderRating(value) {
  if (!hasDisplayValue(value)) return "";

  return `
    <span class="watch-card__rating">
      <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor" aria-hidden="true">
        <polygon points="7,1 8.8,5 13,5.5 10,8.4 10.9,12.5 7,10.5 3.1,12.5 4,8.4 1,5.5 5.2,5"></polygon>
      </svg>
      ${value}
    </span>
  `;
}

function renderCardActions(item) {
  return getActionsForItem(item)
    .map((actionKey) => {
      const action = cardActions[actionKey];
      if (!action) return "";

      const pendingKey = `${item.id}:${action.action}`;
      const isLoading = state.pendingActions.has(pendingKey);

      return `
        <div class="watch-card__action">
          <span class="watch-card__tooltip">${action.label}</span>
          <button
            class="watch-card__icon-button ${isLoading ? "watch-card__icon-button--loading" : ""}"
            type="button"
            data-action="${action.action}"
            data-id="${item.id}"
            aria-label="${action.label}"
            ${isLoading ? "disabled" : ""}
          >
            ${action.icon}
          </button>
        </div>
      `;
    })
    .join("");
}

function renderCard(item) {
  const shouldShowBadge = item.status !== "completed" && item.badge;
  const shouldShowContinue = item.status !== "completed";
  const metaText = normalizeMeta(item.meta);
  const continueTarget = resolveContinueUrl(item);
  const continuePendingKey = `${item.id}:continue`;
  const isContinueLoading = state.pendingActions.has(continuePendingKey);
  const continueMarkup = !shouldShowContinue
    ? ""
    : continueTarget.ok
      ? `<a class="watch-card__continue" href="${escapeHtml(continueTarget.href)}" target="_blank" rel="noopener noreferrer">▶ Продолжить просмотр</a>`
      : `<button class="watch-card__continue" type="button" data-action="continue" data-id="${item.id}" ${isContinueLoading ? "disabled" : ""}>▶ ${isContinueLoading ? "Открываем..." : "Продолжить просмотр"}</button>`;

  return `
    <article
      class="watch-card"
      data-card-id="${item.id}"
      data-detail-url="${getMovieDetailUrl(item.id)}"
      role="link"
      tabindex="0"
      aria-label="Открыть страницу: ${item.title}"
    >
      <div class="watch-card__media">
        ${shouldShowBadge ? `<span class="watch-card__badge">${item.badge}</span>` : ""}
        <div class="watch-card__actions">
          ${renderCardActions(item)}
        </div>
        <div class="watch-card__poster" aria-hidden="true"></div>
        <div class="watch-card__progress">
          <div class="watch-card__progress-fill" style="width: ${item.progress}%"></div>
        </div>
      </div>
      <div class="watch-card__body">
        <h3 class="watch-card__title">${item.title}</h3>
        ${metaText ? `<p class="watch-card__meta">${metaText}</p>` : ""}
        <div class="watch-card__footer">
          ${renderRating(item.rating)}
          ${continueMarkup}
        </div>
      </div>
    </article>
  `;
}

function renderSections(sections) {
  return sections
    .map(
      (section) => {
        const visibleItems = section.items.slice(0, SECTION_ITEM_LIMIT);
        const showMoreButton = section.items.length > SECTION_ITEM_LIMIT;

        return `
        <section class="history-section">
          <div class="history-section__head">
            <h2 class="history-section__label">${section.title}</h2>
            ${showMoreButton
              ? `<button class="history-section__more" type="button" data-action="open-system-folder" data-folder-kind="${section.folderKind}">Посмотреть еще</button>`
              : ""}
          </div>
          <div class="history-grid">
            ${visibleItems.map(renderCard).join("")}
          </div>
        </section>
      `;
      },
    )
    .join("");
}

function renderEmptyHistoryState() {
  return `
    <section class="history-empty history-empty--plain" aria-live="polite">
      <h2 class="history-empty__title">Тут пока ничего нет</h2>
    </section>
  `;
}

function renderFilteredEmptyState() {
  return `
    <section class="history-empty" aria-live="polite">
      <div class="history-empty__icon" aria-hidden="true"></div>
      <h2 class="history-empty__title">Ничего не найдено</h2>
      <p class="history-empty__text">Попробуйте изменить поиск или фильтр.</p>
    </section>
  `;
}

function renderLoadingHistoryState() {
  return `
    <section class="history-empty" aria-live="polite">
      <div class="history-empty__icon" aria-hidden="true"></div>
      <h2 class="history-empty__title">Загружаем историю</h2>
      <p class="history-empty__text">Подтягиваем данные с сервера.</p>
    </section>
  `;
}

function renderHistoryErrorState() {
  return `
    <section class="history-empty" aria-live="polite">
      <div class="history-empty__icon" aria-hidden="true"></div>
      <h2 class="history-empty__title">Не удалось загрузить историю</h2>
      <p class="history-empty__text">${escapeHtml(state.errorMessage || "Проверьте подключение к backend и попробуйте снова.")}</p>
    </section>
  `;
}

function renderRatingOverlay(overlay) {
  if (!overlay.isOpen) return "";

  const stars = Array.from({ length: 10 }, (_, index) => {
    const value = index + 1;
    const isActive = value <= overlay.value;

    return `
      <button
        class="rating-picker__star ${isActive ? "rating-picker__star--active" : ""}"
        type="button"
        data-rating-value="${value}"
        aria-label="Оценка ${value}"
      >
        <svg width="28" height="28" viewBox="0 0 18 18" fill="currentColor" aria-hidden="true">
          <path d="M9 2.3L10.93 6.21L15.25 6.84L12.13 9.88L12.87 14.18L9 12.14L5.13 14.18L5.87 9.88L2.75 6.84L7.07 6.21L9 2.3Z"></path>
        </svg>
      </button>
    `;
  }).join("");

  const numbers = Array.from({ length: 10 }, (_, index) => {
    const value = index + 1;
    return `<span class="rating-picker__number ${value <= overlay.value ? "rating-picker__number--active" : ""}">${value}</span>`;
  }).join("");

  return renderModalShell(
    "Оценить",
    `
      <div class="rating-picker">
        <div class="rating-picker__stars">${stars}</div>
        <div class="rating-picker__numbers">${numbers}</div>
      </div>
      <textarea
        class="modal-card__textarea"
        data-rating-comment
        placeholder="Добавьте комментарий (необязательно)"
        maxlength="800"
      >${overlay.comment}</textarea>
    `,
    `
      <div class="modal-card__footer">
        <button class="modal-card__confirm" type="button" data-rating-confirm ${overlay.loading ? "disabled" : ""}>
          ${overlay.loading ? "Сохраняем..." : "Подтвердить"}
        </button>
      </div>
    `,
    "rating",
  );
}

function renderFolderOverlay(overlay) {
  if (!overlay.isOpen) return "";

  const folderOptions = overlay.options;

  if (overlay.optionsLoading && !folderOptions.length) {
    return renderModalShell(
      "Добавить в папку",
      `
        <div class="folder-placeholder">
          <p class="folder-placeholder__hint">Загружаем ваши папки...</p>
        </div>
      `,
      "",
      "folder",
    );
  }

  if (!folderOptions.length) {
    return renderModalShell(
      "Добавить в папку",
      `
        <div class="folder-placeholder">
          <p class="folder-placeholder__hint">У вас пока нет ни одной собственной папки. Сначала создайте папку, а потом вернитесь сюда.</p>
          <div class="modal-card__footer">
            <button class="modal-card__confirm" type="button" data-action="create-folder-from-overlay">Создать папку</button>
          </div>
        </div>
      `,
      "",
      "folder",
    );
  }

  const folders = folderOptions
    .map(
      (folder) => `
        <button
          class="folder-option ${folder.id === overlay.selectedFolderId ? "folder-option--active" : ""}"
          type="button"
          data-folder-id="${folder.id}"
        >
          <span class="folder-option__icon" aria-hidden="true"></span>
          <span>
            <strong>${folder.title}</strong>
            <small>${folder.description}</small>
          </span>
        </button>
      `,
    )
    .join("");

  return renderModalShell(
    "Добавить в папку",
    `
      <div class="folder-placeholder">
        <p class="folder-placeholder__hint">Выберите одну из своих папок. Если элемент уже есть в выбранной папке, дубликат не будет создан.</p>
        <div class="folder-options">
          ${folders}
        </div>
      </div>
    `,
    `
      <div class="modal-card__footer">
        <button class="modal-card__confirm" type="button" data-folder-confirm ${overlay.loading || overlay.optionsLoading ? "disabled" : ""}>
          ${overlay.loading ? "Сохраняем..." : "Подтвердить"}
        </button>
      </div>
    `,
    "folder",
  );
}

function renderFieldError(errors, fieldName) {
  return errors[fieldName] ? `<span class="manual-form__error">${errors[fieldName]}</span>` : "";
}

function renderManualRatingPicker(value) {
  const rating = Number(value) || 0;
  const stars = Array.from({ length: 10 }, (_, index) => {
    const starValue = index + 1;
    const isActive = starValue <= rating;

    return `
      <button
        class="rating-picker__star ${isActive ? "rating-picker__star--active" : ""}"
        type="button"
        data-manual-rating-value="${starValue}"
        aria-label="Оценка ${starValue}"
      >
        <svg width="28" height="28" viewBox="0 0 18 18" fill="currentColor" aria-hidden="true">
          <path d="M9 2.3L10.93 6.21L15.25 6.84L12.13 9.88L12.87 14.18L9 12.14L5.13 14.18L5.87 9.88L2.75 6.84L7.07 6.21L9 2.3Z"></path>
        </svg>
      </button>
    `;
  }).join("");

  const numbers = Array.from({ length: 10 }, (_, index) => {
    const numberValue = index + 1;
    return `<span class="rating-picker__number ${numberValue <= rating ? "rating-picker__number--active" : ""}">${numberValue}</span>`;
  }).join("");

  return `
    <div class="rating-picker manual-rating">
      <div class="rating-picker__stars">${stars}</div>
      <div class="rating-picker__numbers">${numbers}</div>
    </div>
  `;
}

function renderManualExtraFields(form, errors) {
  if (form.type === "series" && form.status === "watching") {
    return `
      <div class="manual-form__grid manual-form__grid--compact">
        <label class="manual-form__field">
          <span class="manual-form__label">Сезон</span>
          <input class="manual-form__input" type="number" min="0" inputmode="numeric" value="${form.season}" data-manual-field="season" />
          ${renderFieldError(errors, "season")}
        </label>
        <label class="manual-form__field">
          <span class="manual-form__label">Серия</span>
          <input class="manual-form__input" type="number" min="0" inputmode="numeric" value="${form.episode}" data-manual-field="episode" />
          ${renderFieldError(errors, "episode")}
        </label>
      </div>
    `;
  }

  if (form.status === "completed") {
    return `
      <section class="manual-form__section" aria-label="Оценка">
        <span class="manual-form__label">Оценка</span>
        ${renderManualRatingPicker(form.rating)}
        ${renderFieldError(errors, "rating")}
      </section>
      <label class="manual-form__field">
        <span class="manual-form__label">Заметки</span>
        <textarea class="modal-card__textarea manual-form__notes" data-manual-field="comment" placeholder="Добавьте заметки (необязательно)" maxlength="800">${form.comment}</textarea>
      </label>
    `;
  }

  return "";
}

function renderManualOverlay(overlay) {
  if (!overlay.isOpen) return "";

  const { form, errors } = overlay;
  const statuses = manualStatuses
    .map(
      (status) => `
        <button
          class="manual-form__chip ${form.status === status.value ? "manual-form__chip--active" : ""}"
          type="button"
          data-manual-status="${status.value}"
        >
          ${status.label}
        </button>
      `,
    )
    .join("");

  return renderModalShell(
    "Добавить вручную",
    `
      <form class="manual-form" data-manual-form novalidate>
        <section class="manual-form__section" aria-label="Тип контента">
          <span class="manual-form__label">Тип контента</span>
          <div class="manual-form__switch">
            <button class="manual-form__switch-button ${form.type === "movie" ? "manual-form__switch-button--active" : ""}" type="button" data-manual-type="movie">Фильм</button>
            <button class="manual-form__switch-button ${form.type === "series" ? "manual-form__switch-button--active" : ""}" type="button" data-manual-type="series">Сериал</button>
          </div>
          ${renderFieldError(errors, "type")}
        </section>

        <label class="manual-form__field">
          <span class="manual-form__label">Название <span aria-hidden="true">*</span></span>
          <input class="manual-form__input" type="text" value="${form.title}" placeholder="Введите название" data-manual-field="title" />
          ${renderFieldError(errors, "title")}
        </label>

        <section class="manual-form__section" aria-label="Статус">
          <span class="manual-form__label">Статус <span aria-hidden="true">*</span></span>
          <div class="manual-form__chips">
            ${statuses}
          </div>
          ${renderFieldError(errors, "status")}
        </section>

        <div class="manual-form__extra" data-manual-extra>
          ${renderManualExtraFields(form, errors)}
        </div>
      </form>
    `,
    `
      <div class="modal-card__footer modal-card__footer--split">
        <div class="manual-form__actions">
          <button class="modal-card__cancel" type="button" data-manual-cancel>Отмена</button>
          <button class="modal-card__confirm" type="button" data-manual-confirm ${overlay.loading ? "disabled" : ""}>
            ${overlay.loading ? "Добавляем..." : "Добавить"}
          </button>
        </div>
      </div>
    `,
    "manual",
  );
}

function renderOverlays() {
  return `${renderRatingOverlay(state.ratingOverlay)}${renderFolderOverlay(state.folderOverlay)}${renderManualOverlay(state.manualOverlay)}`;
}

function renderPageContent() {
  const stats = getHistoryStats(state.items);
  const visibleItems = getVisibleItems();
  const sections = getSections(visibleItems);
  const content = state.loading
    ? renderLoadingHistoryState()
    : state.errorMessage && !state.items.length
    ? renderHistoryErrorState()
    : state.items.length
    ? sections.length
      ? renderSections(sections)
      : renderFilteredEmptyState()
    : renderEmptyHistoryState();

  return `
    <section class="history-heading" aria-label="Обзор истории просмотра">
      <div>
        <h2 class="history-heading__title">История просмотра</h2>
        <p class="history-heading__text">Отслеживайте прогресс фильмов и сериалов, возвращайтесь к незавершенному просмотру и быстро переносите завершенные позиции в просмотренное.</p>
      </div>
      <div class="history-heading__stats" aria-label="Статистика истории просмотра">
        <span class="history-heading__stat"><strong>${stats.watchingCount}</strong> в процессе</span>
        <span class="history-heading__stat"><strong>${stats.completedCount}</strong> просмотрено</span>
      </div>
    </section>

    <section class="history-toolbar" aria-label="Поиск и фильтры">
      <div class="history-toolbar__search">
        <input class="history-toolbar__input" type="text" placeholder="Поиск по названию" value="${escapeHtml(state.query)}" data-history-search />
        <span class="history-toolbar__icon" aria-hidden="true">
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
            <circle cx="6.5" cy="6.5" r="5" stroke="currentColor" stroke-width="1.5"></circle>
            <path d="M10.5 10.5L14 14" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"></path>
          </svg>
        </span>
      </div>
      <button class="history-toolbar__add" type="button" data-action="open-manual">+ Добавить вручную</button>
      <div class="history-toolbar__filters">
        ${renderFilters(state.filters)}
      </div>
    </section>

    ${content}

    ${renderAppFooter()}
  `;
}

function renderPage() {
  return `
    <div class="history-page">
      <h1 class="sr-only">Страница истории просмотра Movie Tracker</h1>
      <div class="history-page__shell">
        ${renderAppHeader({ tabs: state.tabs })}

        <div class="history-page__content" data-history-content>
          ${renderPageContent()}
        </div>
      </div>
      <div data-history-toasts>${renderToasts(state.toasts)}</div>
      <div data-history-overlays>${renderOverlays()}</div>
    </div>
  `;
}

function renderApp(scope = "full") {
  if (!rootElement) return;

  if (scope === "full" || !rootElement.querySelector("[data-history-content]")) {
    rootElement.innerHTML = renderPage();
    return;
  }

  const contentHost = rootElement.querySelector("[data-history-content]");
  const toastsHost = rootElement.querySelector("[data-history-toasts]");
  const overlaysHost = rootElement.querySelector("[data-history-overlays]");

  if (scope === "content" && contentHost) {
    contentHost.innerHTML = renderPageContent();
  }

  if (toastsHost) {
    toastsHost.innerHTML = renderToasts(state.toasts);
  }

  if (overlaysHost) {
    syncOverlayHost(overlaysHost, renderOverlays());
  }
}

async function hydrateWatchHistory() {
  setState((currentState) => ({
    ...currentState,
    loading: true,
    errorMessage: "",
  }), { scope: "content" });

  if (isPreviewMode()) {
    setState((currentState) => ({
      ...currentState,
      items: previewItems.map((item) => normalizeHistoryItem(item)),
      loading: false,
      errorMessage: "",
    }), { scope: "content" });
    return;
  }

  try {
    const items = await watchHistoryApi.listWatchHistory();
    if (!Array.isArray(items)) {
      throw new Error("Backend вернул некорректные данные истории");
    }

    const normalizedItems = items.map((item) => normalizeHistoryItem(item));

    setState((currentState) => ({
      ...currentState,
      items: normalizedItems,
      loading: false,
      errorMessage: "",
    }), { scope: "content" });
  } catch (error) {
    console.error(error);
    setState((currentState) => ({
      ...currentState,
      items: [],
      loading: false,
      errorMessage: error.message || "Backend сейчас недоступен",
    }), { scope: "content" });
  }
}

async function continueWatching(id) {
  const item = getItemById(id);
  if (!item) return;

  const continueTarget = resolveContinueUrl(item);
  if (continueTarget.ok) {
    openContinueUrl(item);
    return;
  }

  showToast(continueTarget.message, "error");
  return;

  const pendingKey = `${id}:continue`;
  if (state.pendingActions.has(pendingKey)) return;

  addPendingAction(pendingKey);
  renderApp("content");

  try {
    const detail = await watchHistoryApi.getMovieDetail(id, item);
    const nextItem = patchItemWithMovieDetail(id, detail) ?? getItemById(id) ?? item;
    const nextTarget = resolveContinueUrl(nextItem);

    if (nextTarget.ok) {
      openContinueUrl(nextItem);
      return;
    }

    navigateToPage(getMovieDetailUrl(id));
  } catch (error) {
    console.error(error);
    navigateToPage(getMovieDetailUrl(id));
  } finally {
    removePendingAction(pendingKey);
    renderApp("content");
  }
}

async function markAsCompleted(id) {
  const previousItems = state.items.map((item) => ({ ...item }));
  const currentItem = getItemById(id);
  if (!currentItem) return;

  const now = new Date().toISOString();
  const pendingKey = `${id}:mark-watched`;

  addPendingAction(pendingKey);
  setState(updateItemInState(id, {
    status: "completed",
    progress: 100,
    badge: "",
    watchedAt: now,
    updatedAt: now,
  }));

  showToast("Перемещено в просмотренное", "success");

  try {
    await watchHistoryApi.updateWatchItem(id, {
      status: "completed",
      progress: 100,
      watchedAt: now,
      updatedAt: now,
    });
  } catch (error) {
    console.error(error);
    setState((currentState) => ({
      ...currentState,
      items: previousItems,
    }), { scope: "content" });
    showToast("Не удалось обновить данные", "error");
  } finally {
    removePendingAction(pendingKey);
    renderApp("content");
  }
}

function openRatingOverlay(id) {
  const item = getItemById(id);
  if (!item) return;

  setState((currentState) => ({
    ...currentState,
    ratingOverlay: {
      isOpen: true,
      itemId: id,
      value: item.rating || 0,
      comment: item.comment || "",
      loading: false,
    },
  }), { scope: "overlay", autosizeTextarea: true });
}

function closeRatingOverlay() {
  if (state.ratingOverlay.loading) return;

  setState((currentState) => ({
    ...currentState,
    ratingOverlay: { ...initialState.ratingOverlay },
  }), { scope: "overlay" });
}

async function confirmRating() {
  const { itemId, value, comment } = state.ratingOverlay;
  if (!itemId || !value || state.ratingOverlay.loading) return;

  const previousItems = state.items.map((item) => ({ ...item }));
  const now = new Date().toISOString();

  setState((currentState) => ({
    ...currentState,
    items: currentState.items.map((item) =>
      item.id === itemId ? { ...item, rating: value, comment, updatedAt: now } : item,
    ),
    ratingOverlay: { ...currentState.ratingOverlay, loading: true },
  }));

  try {
    await watchHistoryApi.updateWatchItem(itemId, {
      rating: value,
      comment,
      updatedAt: now,
    });

    setState((currentState) => ({
      ...currentState,
      ratingOverlay: { ...initialState.ratingOverlay },
    }));
    showToast("Оценка сохранена", "success");
  } catch (error) {
    console.error(error);
    setState((currentState) => ({
      ...currentState,
      items: previousItems,
      ratingOverlay: { ...currentState.ratingOverlay, loading: false },
    }));
    showToast("Не удалось обновить данные", "error");
  }
}

async function ensureFolderOptionsLoaded() {
  try {
    await fetchOwnFolders();
  } catch (error) {
    console.error(error);
  }

  return listFolderOptions().map((folder) => ({ ...folder }));
}

function areFolderOptionsEqual(currentOptions = [], nextOptions = []) {
  if (currentOptions.length !== nextOptions.length) return false;

  return currentOptions.every((folder, index) => {
    const nextFolder = nextOptions[index];
    if (!nextFolder) return false;

    return (
      String(folder.id) === String(nextFolder.id) &&
      String(folder.title ?? "") === String(nextFolder.title ?? "") &&
      String(folder.description ?? "") === String(nextFolder.description ?? "")
    );
  });
}

async function openFolderOverlay(id) {
  const item = getItemById(id);
  if (!item) return;
  const requestId = ++folderOverlayRequestId;
  const initialOptions = listFolderOptions().map((folder) => ({ ...folder }));
  const initialSelectedFolderId = item.folderId || initialOptions[0]?.id || "";

  if (!initialOptions.length) {
    const folderOptions = await ensureFolderOptionsLoaded();
    if (requestId !== folderOverlayRequestId) return;

    setState((currentState) => ({
      ...currentState,
      folderOverlay: {
        isOpen: true,
        itemId: id,
        selectedFolderId: item.folderId || folderOptions[0]?.id || "",
        loading: false,
        optionsLoading: false,
        options: folderOptions,
      },
    }), { scope: "overlay" });
    return;
  }

  setState((currentState) => ({
    ...currentState,
    folderOverlay: {
      isOpen: true,
      itemId: id,
      selectedFolderId: initialSelectedFolderId,
      loading: false,
      optionsLoading: false,
      options: initialOptions,
    },
  }), { scope: "overlay" });

  const folderOptions = await ensureFolderOptionsLoaded();
  if (requestId !== folderOverlayRequestId) return;

  setState((currentState) => {
    if (!currentState.folderOverlay.isOpen || currentState.folderOverlay.itemId !== id) {
      return currentState;
    }

    const nextSelectedFolderId = currentState.folderOverlay.selectedFolderId || item.folderId || folderOptions[0]?.id || "";
    const hasOptionsChanged = !areFolderOptionsEqual(currentState.folderOverlay.options, folderOptions);
    const hasSelectionChanged = currentState.folderOverlay.selectedFolderId !== nextSelectedFolderId;

    if (!hasOptionsChanged && !hasSelectionChanged) {
      return currentState;
    }

    return {
      ...currentState,
      folderOverlay: {
        ...currentState.folderOverlay,
        selectedFolderId: nextSelectedFolderId,
        options: folderOptions,
      },
    };
  }, { scope: "overlay" });
}

function closeFolderOverlay() {
  if (state.folderOverlay.loading) return;
  folderOverlayRequestId += 1;

  setState((currentState) => ({
    ...currentState,
    folderOverlay: { ...initialState.folderOverlay },
  }), { scope: "overlay" });
}

function openCreateFolderModal() {
  const sourceItem = state.folderOverlay.itemId ? getItemById(state.folderOverlay.itemId) : null;
  if (sourceItem) {
    window.sessionStorage.setItem(
      PENDING_CREATE_SOURCE_KEY,
      JSON.stringify({
        mediaId: sourceItem.id,
        title: sourceItem.title,
      }),
    );
  }
  window.sessionStorage.setItem(OPEN_CREATE_MODAL_KEY, "1");
  navigateToPage(routes.folders);
}

function updateFolderSelectionDom(selectedFolderId) {
  rootElement?.querySelectorAll("[data-folder-id]").forEach((button) => {
    button.classList.toggle("folder-option--active", button.dataset.folderId === selectedFolderId);
  });
}

async function confirmFolder() {
  const { itemId, selectedFolderId } = state.folderOverlay;
  if (!itemId || !selectedFolderId || state.folderOverlay.loading || state.folderOverlay.optionsLoading) return;

  setState((currentState) => ({
    ...currentState,
    folderOverlay: { ...currentState.folderOverlay, loading: true },
  }), { scope: "overlay" });

  try {
    const result = await addItemToFolder(selectedFolderId, itemId);

    setState((currentState) => ({
      ...currentState,
      items: currentState.items.map((item) =>
        item.id === itemId ? { ...item, folderId: selectedFolderId } : item,
      ),
      folderOverlay: { ...initialState.folderOverlay },
    }));
    showToast(result.status === "duplicate" ? "Элемент уже добавлен" : "Добавлено в папку", "success");
  } catch (error) {
    console.error(error);
    setState((currentState) => ({
      ...currentState,
      folderOverlay: { ...currentState.folderOverlay, loading: false },
    }), { scope: "overlay" });
    showToast(error.code === "access" ? "Ошибка доступа" : "Не удалось обновить данные", "error");
  }
}

async function openSystemFolder(kind) {
  try {
    const folders = await fetchOwnFolders();
    const folder = Array.isArray(folders)
      ? folders.find((item) => matchesSystemFolder(item, kind))
      : null;

    if (!folder?.pageUrl) {
      showToast("Системная папка пока недоступна", "error");
      return;
    }

    navigateToPage(folder.pageUrl);
  } catch (error) {
    console.error(error);
    showToast("Не удалось открыть папку", "error");
  }
}

function openManualOverlay() {
  setState((currentState) => ({
    ...currentState,
    manualOverlay: {
      isOpen: true,
      form: { ...defaultManualForm },
      errors: {},
      loading: false,
    },
  }), { scope: "overlay" });
}

function closeManualOverlay() {
  if (state.manualOverlay.loading) return;

  setState((currentState) => ({
    ...currentState,
    manualOverlay: { ...initialState.manualOverlay, form: { ...defaultManualForm }, errors: {} },
  }), { scope: "overlay" });
}

function updateManualFormDom() {
  if (!state.manualOverlay.isOpen) return;

  rootElement?.querySelectorAll("[data-manual-type]").forEach((button) => {
    button.classList.toggle("manual-form__switch-button--active", button.dataset.manualType === state.manualOverlay.form.type);
  });

  rootElement?.querySelectorAll("[data-manual-status]").forEach((button) => {
    button.classList.toggle("manual-form__chip--active", button.dataset.manualStatus === state.manualOverlay.form.status);
  });

  const extraFields = rootElement?.querySelector("[data-manual-extra]");
  if (extraFields) {
    extraFields.innerHTML = renderManualExtraFields(state.manualOverlay.form, state.manualOverlay.errors);
  }

  requestAnimationFrame(autoSizeManualTextarea);
}

function setManualFormPatch(patch, shouldRender = true) {
  const nextForm = { ...state.manualOverlay.form, ...patch };

  if (patch.type) {
    nextForm.season = "";
    nextForm.episode = "";
    nextForm.rating = "";
    nextForm.comment = "";
  }

  if (patch.status) {
    nextForm.season = "";
    nextForm.episode = "";
    nextForm.rating = "";
    nextForm.comment = "";
  }

  state.manualOverlay.form = nextForm;
  state.manualOverlay.errors = {};

  if (shouldRender) updateManualFormDom();
}

function parseOptionalNumber(value) {
  if (value === "" || value === null || value === undefined) return null;
  return Number(value);
}

function validateManualForm(form) {
  const errors = {};
  const season = parseOptionalNumber(form.season);
  const episode = parseOptionalNumber(form.episode);
  const rating = parseOptionalNumber(form.rating);

  if (!form.type) errors.type = "Выберите тип";
  if (!form.title.trim()) errors.title = "Введите название";
  if (!form.status) errors.status = "Выберите статус";
  if (season !== null && (!Number.isFinite(season) || season < 0)) errors.season = "Сезон должен быть 0 или больше";
  if (episode !== null && (!Number.isFinite(episode) || episode < 0)) errors.episode = "Серия должна быть 0 или больше";
  if (form.status === "completed" && (rating === null || !Number.isFinite(rating) || rating < 1 || rating > 10)) {
    errors.rating = "Выберите оценку от 1 до 10";
  }

  return errors;
}

function getManualPayload(form) {
  return {
    type: form.type,
    title: form.title.trim(),
    year: null,
    status: form.status,
    season: form.type === "series" && form.status === "watching" ? parseOptionalNumber(form.season) : null,
    episode: form.type === "series" && form.status === "watching" ? parseOptionalNumber(form.episode) : null,
    rating: form.status === "completed" ? parseOptionalNumber(form.rating) : null,
    comment: form.status === "completed" ? form.comment.trim() || null : null,
    folderId: null,
  };
}

async function confirmManualAdd() {
  if (state.manualOverlay.loading) return;

  const form = state.manualOverlay.form;
  const errors = validateManualForm(form);

  if (Object.keys(errors).length) {
    setState((currentState) => ({
      ...currentState,
      manualOverlay: {
        ...currentState.manualOverlay,
        errors,
      },
    }), { scope: "overlay" });
    return;
  }

  const payload = getManualPayload(form);
  setState((currentState) => ({
    ...currentState,
    manualOverlay: {
      ...currentState.manualOverlay,
      loading: true,
    },
  }), { scope: "overlay" });

  try {
    const createdItem = await watchHistoryApi.createWatchItem(payload);
    const now = createdItem.createdAt || new Date().toISOString();
    const typeLabel = payload.type === "series" ? "Сериал" : "Фильм";
    const badge = payload.type === "series" && payload.status === "watching" && payload.season !== null && payload.episode !== null
      ? `Сезон ${payload.season}, серия ${payload.episode}`
      : "";
    const nextItem = {
      id: createdItem.id,
      title: payload.title,
      status: payload.status,
      progress: payload.status === "completed" ? 100 : payload.status === "watching" ? 36 : 0,
      rating: payload.rating ?? 0,
      comment: payload.comment ?? "",
      folderId: payload.folderId,
      badge,
      meta: `${typeLabel} · Добавлено вручную`,
      updatedAt: now,
      watchedAt: payload.status === "completed" ? now : null,
    };

    setState((currentState) => ({
      ...currentState,
      items: [nextItem, ...currentState.items],
      manualOverlay: { ...initialState.manualOverlay, form: { ...defaultManualForm }, errors: {} },
    }));
    showToast("Добавлено вручную", "success");
  } catch (error) {
    console.error(error);
    setState((currentState) => ({
      ...currentState,
      manualOverlay: { ...currentState.manualOverlay, loading: false },
    }), { scope: "overlay" });
    showToast("Не удалось обновить данные", "error");
  }
}

function autoSizeActiveTextarea() {
  const textarea = rootElement?.querySelector("[data-rating-comment]");
  if (textarea) autoSizeTextarea(textarea);
}

function autoSizeManualTextarea() {
  const textarea = rootElement?.querySelector("[data-manual-field=\"comment\"]");
  if (textarea) autoSizeTextarea(textarea);
}

function updateRatingPickerDom(value) {
  rootElement?.querySelectorAll("[data-rating-value]").forEach((button) => {
    const ratingValue = Number(button.dataset.ratingValue);
    button.classList.toggle("rating-picker__star--active", ratingValue <= value);
  });

  rootElement?.querySelectorAll(".rating-picker__number").forEach((numberElement) => {
    const ratingValue = Number(numberElement.textContent);
    numberElement.classList.toggle("rating-picker__number--active", ratingValue <= value);
  });
}

function updateManualRatingPickerDom(value) {
  rootElement?.querySelectorAll("[data-manual-rating-value]").forEach((button) => {
    const ratingValue = Number(button.dataset.manualRatingValue);
    button.classList.toggle("rating-picker__star--active", ratingValue <= value);
  });

  rootElement?.querySelectorAll(".manual-rating .rating-picker__number").forEach((numberElement) => {
    const ratingValue = Number(numberElement.textContent);
    numberElement.classList.toggle("rating-picker__number--active", ratingValue <= value);
  });
}

function handleRootClick(event) {
  const navButton = event.target.closest("[data-nav-url]");
  if (navButton) {
    navigateToPage(navButton.dataset.navUrl);
    return;
  }

  const filterButton = event.target.closest("[data-filter]");
  if (filterButton) {
    const nextFilterValue = filterButton.dataset.filter;
    setState((currentState) => ({
      ...currentState,
      activeFilter: nextFilterValue,
      filters: currentState.filters.map((filter) => ({
        ...filter,
        active: filter.value === nextFilterValue,
      })),
    }), { scope: "content" });
    return;
  }

  const actionButton = event.target.closest("[data-action]");
  if (actionButton) {
    const id = actionButton.dataset.id;
    const action = actionButton.dataset.action;

    if (action === "open-manual") {
      openManualOverlay();
      return;
    }

    if (action === "continue") {
      continueWatching(id);
      return;
    }

    if (action === "mark-watched") {
      markAsCompleted(id);
      return;
    }

    if (action === "rate") {
      openRatingOverlay(id);
      return;
    }

    if (action === "add-to-folder") {
      openFolderOverlay(id);
      return;
    }

    if (action === "create-folder-from-overlay") {
      openCreateFolderModal();
      return;
    }

    if (action === "open-system-folder") {
      openSystemFolder(actionButton.dataset.folderKind);
      return;
    }
  }

  const detailCard = event.target.closest("[data-card-id]");
  if (detailCard && !event.target.closest("button, a, input, textarea, select")) {
    openMovieDetail(detailCard.dataset.cardId);
    return;
  }

  const ratingValueButton = event.target.closest("[data-rating-value]");
  if (ratingValueButton) {
    const value = Number(ratingValueButton.dataset.ratingValue);
    state.ratingOverlay.value = value;
    updateRatingPickerDom(value);
    return;
  }

  const folderButton = event.target.closest("[data-folder-id]");
  if (folderButton) {
    state.folderOverlay.selectedFolderId = folderButton.dataset.folderId;
    updateFolderSelectionDom(folderButton.dataset.folderId);
    return;
  }

  const manualTypeButton = event.target.closest("[data-manual-type]");
  if (manualTypeButton) {
    setManualFormPatch({ type: manualTypeButton.dataset.manualType });
    return;
  }

  const manualStatusButton = event.target.closest("[data-manual-status]");
  if (manualStatusButton) {
    setManualFormPatch({ status: manualStatusButton.dataset.manualStatus });
    return;
  }

  const manualRatingButton = event.target.closest("[data-manual-rating-value]");
  if (manualRatingButton) {
    const value = Number(manualRatingButton.dataset.manualRatingValue);
    state.manualOverlay.form.rating = String(value);
    state.manualOverlay.errors = {};
    updateManualRatingPickerDom(value);
    return;
  }

  if (event.target.closest("[data-rating-confirm]")) {
    confirmRating();
    return;
  }

  if (event.target.closest("[data-folder-confirm]")) {
    confirmFolder();
    return;
  }

  if (event.target.closest("[data-manual-confirm]")) {
    confirmManualAdd();
    return;
  }

  if (event.target.closest("[data-manual-cancel]")) {
    closeManualOverlay();
    return;
  }

  if (event.target.closest('[data-modal-close="rating"]')) {
    closeRatingOverlay();
    return;
  }

  if (event.target.closest('[data-modal-close="folder"]')) {
    closeFolderOverlay();
    return;
  }

  if (event.target.closest('[data-modal-close="manual"]')) {
    closeManualOverlay();
    return;
  }

  if (event.target.dataset.modalBackdrop === "rating") {
    closeRatingOverlay();
    return;
  }

  if (event.target.dataset.modalBackdrop === "folder") {
    closeFolderOverlay();
    return;
  }

  if (event.target.dataset.modalBackdrop === "manual") {
    closeManualOverlay();
  }
}

function handleRootKeydown(event) {
  const detailCard = event.target.closest("[data-card-id]");
  if (!detailCard || event.target !== detailCard) return;
  if (event.key !== "Enter" && event.key !== " ") return;

  event.preventDefault();
  openMovieDetail(detailCard.dataset.cardId);
}

function handleRootInput(event) {
  const historySearch = event.target.closest("[data-history-search]");
  if (historySearch) {
    state.query = historySearch.value;
    renderApp("content");
    const nextInput = rootElement?.querySelector("[data-history-search]");
    nextInput?.focus();
    const valueLength = nextInput?.value.length ?? 0;
    nextInput?.setSelectionRange(valueLength, valueLength);
    return;
  }

  const textarea = event.target.closest("[data-rating-comment]");
  if (textarea) {
    autoSizeTextarea(textarea);
    state.ratingOverlay.comment = textarea.value;
    return;
  }

  const manualInput = event.target.closest("[data-manual-field]");
  if (manualInput) {
    setManualFormPatch({ [manualInput.dataset.manualField]: manualInput.value }, false);
    if (manualInput.matches("textarea")) autoSizeTextarea(manualInput);
  }
}

function initWatchHistoryPage() {
  if (!ensureAuthenticatedPageAccess()) return;

  rootElement = document.querySelector("#watch-history-app");
  if (!rootElement) return;

  rootElement.addEventListener("click", handleRootClick);
  rootElement.addEventListener("keydown", handleRootKeydown);
  rootElement.addEventListener("input", handleRootInput);
  try {
    renderApp("full");
    hydrateWatchHistory();
  } catch (error) {
    reportFatalError(error);
  }
}

initWatchHistoryPage();
})();
