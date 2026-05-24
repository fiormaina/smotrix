(() => {
const {
  autoSizeTextarea,
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
const { createToastController, resolveContinueUrl } = window.MovieTrackerHelpers;
const {
  createPrimaryTabs,
  renderAppHeader,
  renderBackLink,
} = window.MovieTrackerAppShell;
const {
  addItemToFolder,
  fetchOwnFolders,
  listFolderOptions,
} = window.MovieTrackerFolders;
const movieDetailApi = window.MovieTrackerMediaApi;
const routes = window.MovieTrackerRoutes;
const OPEN_CREATE_MODAL_KEY = "movieTracker.openCreateFolderModal";
const PENDING_CREATE_SOURCE_KEY = "movieTracker.pendingCreateFolderSource";

const initialMovie = {
  id: "movie-detail-1",
  title: "Название фильма",
  genres: ["Триллер", "Комедия", "Драма"],
  year: "2024",
  duration: "57 минут",
  type: "Фильм",
  imdbRating: 6.5,
  userRating: 0,
  progress: 64,
  folderId: null,
  watched: false,
  comment: "",
  description:
    "После случайной встречи в ночном городе герои оказываются втянуты в историю, где смешное быстро становится тревожным, а привычные решения больше не работают. Фильм держит спокойный ритм, но постепенно собирает напряжение вокруг выбора, который каждому придется сделать самому.",
};

const movieDetailsById = {
  "series-1": {
    title: "Название сериала 1",
    genres: ["Фантастика", "Драма"],
    year: "2022",
    duration: "45 мин/эп",
    type: "Сериал",
    imdbRating: 7.4,
    userRating: 4,
    progress: 72,
    description:
      "Сериал разворачивает историю вокруг команды, которая пытается разобраться с последствиями странного открытия. В центре не только фантастическая интрига, но и отношения героев, которым приходится выбирать между личным спокойствием и общей ответственностью.",
  },
  "movie-2": {
    title: "Название фильма 2",
    genres: ["Фантастика"],
    year: "2014",
    duration: "169 мин",
    type: "Фильм",
    imdbRating: 8.1,
    userRating: 4,
    progress: 72,
    description:
      "Большое фантастическое путешествие с камерной человеческой историей внутри. Герой движется вперед через риск, потери и надежду, а фильм держит баланс между зрелищем и тихими эмоциональными решениями.",
  },
  "series-3": {
    title: "Название сериала 3",
    genres: ["Драма"],
    year: "2022",
    duration: "58 мин/эп",
    type: "Сериал",
    imdbRating: 7.2,
    userRating: 4,
    progress: 30,
  },
  "series-7": {
    title: "Название сериала 7",
    genres: ["Приключения"],
    year: "2023",
    duration: "47 мин/эп",
    type: "Сериал",
    imdbRating: 6.9,
    progress: 48,
  },
  "movie-8": {
    title: "Название фильма 8",
    genres: ["Фэнтези"],
    year: "2020",
    duration: "126 мин",
    type: "Фильм",
    imdbRating: 7.1,
    progress: 61,
  },
  "series-9": {
    title: "Название сериала 9",
    genres: ["Комедия"],
    year: "2024",
    duration: "32 мин/эп",
    type: "Сериал",
    imdbRating: 6.8,
    progress: 24,
  },
  "movie-10": {
    title: "Название фильма 10",
    genres: ["Драма"],
    year: "2021",
    duration: "118 мин",
    type: "Фильм",
    imdbRating: 7,
    progress: 88,
  },
  "series-4": {
    title: "Название сериала 4",
    genres: ["Триллер"],
    year: "2021",
    duration: "50 мин/эп",
    type: "Сериал",
    imdbRating: 7.6,
    userRating: 5,
    progress: 100,
    watched: true,
  },
  "movie-5": {
    title: "Название фильма 5",
    genres: ["Детектив"],
    year: "2019",
    duration: "130 мин",
    type: "Фильм",
    imdbRating: 7.3,
    userRating: 4,
    progress: 100,
    watched: true,
  },
  "series-6": {
    title: "Название сериала 6",
    genres: ["Криминал"],
    year: "2020",
    duration: "42 мин/эп",
    type: "Сериал",
    imdbRating: 8,
    userRating: 5,
    progress: 100,
    watched: true,
  },
};

function getInitialMovieFromUrl() {
  const movieId = new URLSearchParams(window.location.search).get("id");
  const movie = {
    ...initialMovie,
    ...(movieDetailsById[movieId] ?? {}),
  };

  return {
    ...movie,
    id: movieId || movie.id,
    genres: normalizeGenres(movie.genres),
  };
}

const initialState = {
  movie: getInitialMovieFromUrl(),
  tabs: createPrimaryTabs("history"),
  ratingOverlay: {
    isOpen: false,
    value: 0,
    comment: "",
    loading: false,
  },
  folderOverlay: {
    isOpen: false,
    selectedFolderId: "",
    loading: false,
    optionsLoading: false,
    options: [],
  },
  toasts: [],
};

let state = cloneState(initialState);
let rootElement = null;
let folderOverlayRequestId = 0;
const showToast = createToastController(setState);

function cloneState(value) {
  return {
    ...value,
    movie: { ...value.movie, genres: normalizeGenres(value.movie.genres) },
    tabs: value.tabs.map((tab) => ({ ...tab })),
    ratingOverlay: { ...value.ratingOverlay },
    folderOverlay: {
      ...value.folderOverlay,
      options: value.folderOverlay.options.map((folder) => ({ ...folder })),
    },
    toasts: [...value.toasts],
  };
}

function normalizeGenres(genres) {
  return Array.isArray(genres)
    ? genres.map((genre) => String(genre ?? "").trim()).filter(Boolean)
    : [];
}

function hasDisplayValue(value) {
  if (value === null || value === undefined) return false;
  if (typeof value === "number") return Number.isFinite(value) && value > 0;
  return String(value).trim().length > 0;
}

function setState(updater, options = {}) {
  state = typeof updater === "function" ? updater(state) : updater;
  renderApp(options.scope ?? "content");

  if (options.autosizeTextarea) {
    requestAnimationFrame(autoSizeActiveTextarea);
  }
}

function renderCommentSection(movie) {
  const commentText = String(movie.comment ?? "").trim();

  if (!commentText) {
    return `
      <section class="movie-detail__comments" aria-label="Комментарии">
        <h2 class="movie-detail__comments-title">Комментарии</h2>
        <p class="movie-detail__comments-empty">Комментариев пока нет</p>
      </section>
    `;
  }

  const commentMarkup = escapeHtml(commentText).replaceAll("\n", "<br />");

  return `
    <section class="movie-detail__comments" aria-label="Комментарии">
      <h2 class="movie-detail__comments-title">Комментарии</h2>
      <p class="movie-detail__description">${commentMarkup}</p>
    </section>
  `;
}

function renderMovieDetail(movie) {
  const genres = normalizeGenres(movie.genres);
  const facts = [movie.type, movie.year, movie.duration].filter(hasDisplayValue);
  const folderButtonLabel = movie.folderId ? "В папке" : "Добавить в папку";
  const watchedButtonLabel = movie.watched ? "Просмотрено" : "Отметить просмотренным";
  const ratingLabel = movie.userRating ? `Ваша оценка: ${movie.userRating}` : "Оценить";
  const continueTarget = resolveContinueUrl(movie);
  const continueMarkup = continueTarget.ok
    ? `
            <a class="movie-detail__continue" href="${escapeHtml(continueTarget.href)}" target="_blank" rel="noopener noreferrer">
              <svg width="16" height="16" viewBox="0 0 18 18" fill="currentColor" aria-hidden="true">
                <path d="M5.5 3.8V14.2L14 9L5.5 3.8Z"></path>
              </svg>
              Продолжить просмотр
            </a>
          `
    : `
            <button class="movie-detail__continue" type="button" data-action="continue">
              <svg width="16" height="16" viewBox="0 0 18 18" fill="currentColor" aria-hidden="true">
                <path d="M5.5 3.8V14.2L14 9L5.5 3.8Z"></path>
              </svg>
              Продолжить просмотр
            </button>
          `;
  const genresMarkup = genres.length
    ? `
          <div class="movie-detail__genres">
            ${genres.map((genre) => `<span class="movie-detail__chip">${genre}</span>`).join("")}
          </div>
        `
    : "";
  const factsMarkup = facts.length
    ? `
          <ul class="movie-detail__facts" aria-label="Информация о фильме">
            ${facts.map((fact) => `<li class="movie-detail__fact">${fact}</li>`).join("")}
          </ul>
        `
    : "";
  const ratingValueMarkup = hasDisplayValue(movie.imdbRating)
    ? `
            <div class="movie-detail__rating-top">
              <span class="movie-detail__rating-label">Рейтинг</span>
            </div>
            <div class="movie-detail__rating-value">
              <span class="movie-detail__rating-number">${String(movie.imdbRating).trim()}</span>
              <span class="movie-detail__imdb">imdb</span>
            </div>
          `
    : "";
  const ratingMarkup = `
        <aside class="movie-detail__aside" aria-label="Оценка">
          <section class="movie-detail__rating-card">
            ${ratingValueMarkup}
            <button class="movie-detail__rate" type="button" data-action="rate">
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
                <path d="M9 2.3L10.93 6.21L15.25 6.84L12.13 9.88L12.87 14.18L9 12.14L5.13 14.18L5.87 9.88L2.75 6.84L7.07 6.21L9 2.3Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"></path>
              </svg>
              ${ratingLabel}
            </button>
          </section>
        </aside>
      `;

  return `
    <section class="movie-detail" aria-label="Карточка фильма">
      ${renderBackLink("movie-detail__back", "История просмотра", routes.watchHistory)}

      <article class="movie-detail__card">
        <div class="movie-detail__poster-wrap">
          <div class="movie-detail__poster" aria-label="Постер фильма">
            <div class="movie-detail__poster-mark" aria-hidden="true"></div>
            <div class="movie-detail__progress">
              <div class="movie-detail__progress-text">
                <span>Прогресс</span>
                <strong>${movie.watched ? "100%" : `${movie.progress}%`}</strong>
              </div>
              <div class="movie-detail__progress-track">
                <div class="movie-detail__progress-fill" style="width: ${movie.watched ? 100 : movie.progress}%"></div>
              </div>
            </div>
          </div>
        </div>

        <div class="movie-detail__main">
          <h1 class="movie-detail__title">${movie.title}</h1>
          ${genresMarkup}
          ${factsMarkup}

          <p class="movie-detail__description">${movie.description}</p>

          <div class="movie-detail__actions">
            ${continueMarkup}
            <div class="movie-detail__quick-actions">
              <button class="movie-detail__icon-button ${movie.folderId ? "movie-detail__icon-button--active" : ""}" type="button" data-action="add-to-folder" aria-label="${folderButtonLabel}" title="${folderButtonLabel}">
                <svg width="20" height="20" viewBox="0 0 18 18" fill="none" aria-hidden="true">
                  <path d="M2.8 5.2H7L8.35 6.7H15.2V13.7C15.2 14.42 14.62 15 13.9 15H4.1C3.38 15 2.8 14.42 2.8 13.7V5.2Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"></path>
                  <path d="M2.8 5.2V4.1C2.8 3.38 3.38 2.8 4.1 2.8H6.4L7.9 4.4H13.4C14.12 4.4 14.7 4.98 14.7 5.7V6.7" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"></path>
                </svg>
              </button>
              <button class="movie-detail__icon-button ${movie.watched ? "movie-detail__icon-button--active movie-detail__icon-button--success" : ""}" type="button" data-action="mark-watched" aria-label="${watchedButtonLabel}" title="${watchedButtonLabel}">
                <svg width="20" height="20" viewBox="0 0 18 18" fill="none" aria-hidden="true">
                  <path d="M4 9.5L7.2 12.7L14 5.9" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"></path>
                </svg>
              </button>
            </div>
          </div>
        </div>

        ${ratingMarkup}

        ${renderCommentSection(movie)}
      </article>
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
          <p class="folder-placeholder__hint">Сначала создайте хотя бы одну собственную папку, а потом вернитесь к этому фильму.</p>
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
        <p class="folder-placeholder__hint">Выберите одну из своих папок. Если этот элемент уже есть внутри, повторно он добавлен не будет.</p>
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

function renderOverlays() {
  return `${renderRatingOverlay(state.ratingOverlay)}${renderFolderOverlay(state.folderOverlay)}`;
}

function renderPage() {
  return `
    <div class="history-page movie-detail-page">
      <div class="history-page__shell">
        ${renderAppHeader({ tabs: state.tabs })}

        <div class="history-page__content" data-movie-detail-content>
          ${renderMovieDetail(state.movie)}
        </div>
      </div>
      <div data-movie-detail-toasts>${renderToasts(state.toasts)}</div>
      <div data-movie-detail-overlays>${renderOverlays()}</div>
    </div>
  `;
}

function renderApp(scope = "full") {
  if (!rootElement) return;

  if (scope === "full" || !rootElement.querySelector("[data-movie-detail-content]")) {
    rootElement.innerHTML = renderPage();
    return;
  }

  const contentHost = rootElement.querySelector("[data-movie-detail-content]");
  const toastsHost = rootElement.querySelector("[data-movie-detail-toasts]");
  const overlaysHost = rootElement.querySelector("[data-movie-detail-overlays]");

  if (contentHost) {
    contentHost.innerHTML = renderMovieDetail(state.movie);
  }

  if (toastsHost) {
    toastsHost.innerHTML = renderToasts(state.toasts);
  }

  if (overlaysHost) {
    syncOverlayHost(overlaysHost, renderOverlays());
  }
}

async function hydrateMovieDetail() {
  try {
    const movie = await movieDetailApi.getMovieDetail(state.movie.id, state.movie);
    if (!movie || typeof movie !== "object") return;

    setState((currentState) => ({
      ...currentState,
      movie: {
        ...currentState.movie,
        ...movie,
        genres: movie.genres !== undefined ? normalizeGenres(movie.genres) : normalizeGenres(currentState.movie.genres),
      },
    }));
  } catch (error) {
    console.error(error);
  }
}

function openRatingOverlay() {
  setState((currentState) => ({
    ...currentState,
    ratingOverlay: {
      isOpen: true,
      value: currentState.movie.userRating || 0,
      comment: currentState.movie.comment || "",
      loading: false,
    },
  }), { autosizeTextarea: true });
}

function closeRatingOverlay() {
  if (state.ratingOverlay.loading) return;

  setState((currentState) => ({
    ...currentState,
    ratingOverlay: { ...initialState.ratingOverlay },
  }));
}

async function confirmRating() {
  const { value, comment } = state.ratingOverlay;
  if (!value || state.ratingOverlay.loading) return;

  const previousMovie = { ...state.movie, genres: [...state.movie.genres] };

  setState((currentState) => ({
    ...currentState,
    movie: {
      ...currentState.movie,
      userRating: value,
      comment,
    },
    ratingOverlay: { ...currentState.ratingOverlay, loading: true },
  }));

  try {
    await movieDetailApi.updateMovie(state.movie.id, {
      userRating: value,
      comment,
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
      movie: previousMovie,
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

async function openFolderOverlay() {
  const requestId = ++folderOverlayRequestId;
  const initialOptions = listFolderOptions().map((folder) => ({ ...folder }));
  const initialSelectedFolderId = state.movie.folderId || initialOptions[0]?.id || "";

  if (!initialOptions.length) {
    const folderOptions = await ensureFolderOptionsLoaded();
    if (requestId !== folderOverlayRequestId) return;

    setState((currentState) => ({
      ...currentState,
      folderOverlay: {
        isOpen: true,
        selectedFolderId: currentState.movie.folderId || folderOptions[0]?.id || "",
        loading: false,
        optionsLoading: false,
        options: folderOptions,
      },
    }));
    return;
  }

  setState((currentState) => ({
    ...currentState,
    folderOverlay: {
      isOpen: true,
      selectedFolderId: initialSelectedFolderId,
      loading: false,
      optionsLoading: false,
      options: initialOptions,
    },
  }));

  const folderOptions = await ensureFolderOptionsLoaded();
  if (requestId !== folderOverlayRequestId) return;

  setState((currentState) => {
    if (!currentState.folderOverlay.isOpen) {
      return currentState;
    }

    const nextSelectedFolderId =
      currentState.folderOverlay.selectedFolderId || currentState.movie.folderId || folderOptions[0]?.id || "";
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
  });
}

function closeFolderOverlay() {
  if (state.folderOverlay.loading) return;
  folderOverlayRequestId += 1;

  setState((currentState) => ({
    ...currentState,
    folderOverlay: { ...initialState.folderOverlay },
  }));
}

function openCreateFolderModal() {
  window.sessionStorage.setItem(
    PENDING_CREATE_SOURCE_KEY,
    JSON.stringify({
      mediaId: state.movie.id,
      title: state.movie.title,
    }),
  );
  window.sessionStorage.setItem(OPEN_CREATE_MODAL_KEY, "1");
  navigateToPage(routes.folders);
}

function updateFolderSelectionDom(selectedFolderId) {
  rootElement?.querySelectorAll("[data-folder-id]").forEach((button) => {
    button.classList.toggle("folder-option--active", button.dataset.folderId === selectedFolderId);
  });
}

async function confirmFolder() {
  if (state.folderOverlay.loading || state.folderOverlay.optionsLoading || !state.folderOverlay.selectedFolderId) return;

  const { selectedFolderId } = state.folderOverlay;

  setState((currentState) => ({
    ...currentState,
    folderOverlay: { ...currentState.folderOverlay, loading: true },
  }));

  try {
    const result = await addItemToFolder(selectedFolderId, state.movie.id);

    setState((currentState) => ({
      ...currentState,
      movie: {
        ...currentState.movie,
        folderId: selectedFolderId,
      },
      folderOverlay: { ...initialState.folderOverlay },
    }));
    showToast(result.status === "duplicate" ? "Элемент уже добавлен" : "Добавлено в папку", "success");
  } catch (error) {
    console.error(error);
    setState((currentState) => ({
      ...currentState,
      folderOverlay: { ...currentState.folderOverlay, loading: false },
    }));
    showToast(error.code === "access" ? "Ошибка доступа" : "Не удалось обновить данные", "error");
  }
}

async function markWatched() {
  const previousMovie = { ...state.movie, genres: [...state.movie.genres] };

  setState((currentState) => ({
    ...currentState,
    movie: {
      ...currentState.movie,
      watched: true,
      progress: 100,
    },
  }));
  showToast("Отмечено как просмотренное", "success");

  try {
    await movieDetailApi.updateMovie(state.movie.id, {
      watched: true,
      progress: 100,
    });
  } catch (error) {
    console.error(error);
    setState((currentState) => ({
      ...currentState,
      movie: previousMovie,
    }));
    showToast("Не удалось обновить данные", "error");
  }
}

function continueWatching() {
  const continueTarget = resolveContinueUrl(state.movie);
  if (!continueTarget.ok) {
    showToast(continueTarget.message, "error");
  }
}

function autoSizeActiveTextarea() {
  const textarea = rootElement?.querySelector("[data-rating-comment]");
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

function handleRootClick(event) {
  const navButton = event.target.closest("[data-nav-url]");
  if (navButton) {
    navigateToPage(navButton.dataset.navUrl);
    return;
  }

  const actionButton = event.target.closest("[data-action]");
  if (actionButton) {
    const action = actionButton.dataset.action;

    if (action === "continue") {
      continueWatching();
      return;
    }

    if (action === "rate") {
      openRatingOverlay();
      return;
    }

    if (action === "add-to-folder") {
      openFolderOverlay();
      return;
    }

    if (action === "create-folder-from-overlay") {
      openCreateFolderModal();
      return;
    }

    if (action === "mark-watched") {
      markWatched();
      return;
    }
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

  if (event.target.closest("[data-rating-confirm]")) {
    confirmRating();
    return;
  }

  if (event.target.closest("[data-folder-confirm]")) {
    confirmFolder();
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

  if (event.target.dataset.modalBackdrop === "rating") {
    closeRatingOverlay();
    return;
  }

  if (event.target.dataset.modalBackdrop === "folder") {
    closeFolderOverlay();
  }
}

function handleRootInput(event) {
  const textarea = event.target.closest("[data-rating-comment]");
  if (!textarea) return;

  autoSizeTextarea(textarea);
  state.ratingOverlay.comment = textarea.value;
}

function initMovieDetailPage() {
  rootElement = document.querySelector("#movie-detail-app");
  if (!rootElement) return;

  rootElement.addEventListener("click", handleRootClick);
  rootElement.addEventListener("input", handleRootInput);
  renderApp();
  hydrateMovieDetail();
}

initMovieDetailPage();
})();
