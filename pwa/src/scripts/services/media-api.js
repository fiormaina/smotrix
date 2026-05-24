(() => {
  const apiClient = window.MovieTrackerApiClient;

  function cloneWatchItems(items = []) {
    return items.map((item) => normalizeWatchItem(item));
  }

  function normalizeGenres(genres) {
    return Array.isArray(genres)
      ? genres.map((genre) => String(genre ?? "").trim()).filter(Boolean)
      : [];
  }

  function normalizeMeta(value) {
    return String(value ?? "")
      .split("·")
      .map((part) => part.trim())
      .filter(Boolean)
      .join(" · ");
  }

  function normalizeRatingValue(value) {
    if (value === null || value === undefined) return null;

    if (typeof value === "string") {
      const trimmedValue = value.trim();
      if (!trimmedValue) return null;

      const numericStringValue = Number(trimmedValue);
      if (Number.isFinite(numericStringValue)) {
        return numericStringValue > 0 ? numericStringValue : null;
      }

      return trimmedValue;
    }

    const numericValue = Number(value);
    return Number.isFinite(numericValue) && numericValue > 0 ? numericValue : null;
  }

  function normalizeWatchItem(item = {}) {
    return {
      ...item,
      meta: normalizeMeta(item.meta),
      rating: normalizeRatingValue(item.rating),
    };
  }

  function cloneMovie(movie) {
    if (!movie || typeof movie !== "object") return movie;

    const normalizedUserRating = normalizeRatingValue(movie.userRating ?? movie.rating);

    return {
      ...movie,
      id: movie.id === null || movie.id === undefined ? movie.id : String(movie.id),
      folderId:
        movie.folderId === null || movie.folderId === undefined
          ? null
          : String(movie.folderId),
      genres: normalizeGenres(movie.genres),
      imdbRating: normalizeRatingValue(movie.imdbRating),
      userRating: normalizedUserRating,
    };
  }

  function unwrapEntity(data, fallbackValue) {
    if (Array.isArray(data?.items)) return data.items;
    if (Array.isArray(data?.results)) return data.results;
    if (data?.item) return data.item;
    if (data?.movie) return data.movie;
    if (data?.history) return data.history;
    return data ?? fallbackValue;
  }

  const mediaApi = {
    async listWatchHistory() {
      const data = await apiClient.request("/watch-history", { method: "GET" }, { namespace: "watch-history" });
      const items = unwrapEntity(data, []);
      return Array.isArray(items) ? cloneWatchItems(items) : [];
    },

    async createWatchItem(payload) {
      const data = await apiClient.request("/watch-history", {
        method: "POST",
        body: JSON.stringify(payload),
      }, { namespace: "watch-history" });
      return normalizeWatchItem(unwrapEntity(data, null));
    },

    async updateWatchItem(id, patch) {
      const data = await apiClient.request(`/watch-history/${encodeURIComponent(id)}`, {
        method: "PATCH",
        body: JSON.stringify(patch),
      }, { namespace: "watch-history" });
      return normalizeWatchItem(unwrapEntity(data, null));
    },

    async getMovieDetail(id, fallbackMovie = null) {
      const data = await apiClient.request(`/media/${encodeURIComponent(id)}`, { method: "GET" }, { namespace: "media" });
      return cloneMovie(unwrapEntity(data, fallbackMovie));
    },

    async updateMovie(id, patch) {
      const data = await apiClient.request(`/media/${encodeURIComponent(id)}`, {
        method: "PATCH",
        body: JSON.stringify(patch),
      }, { namespace: "media" });
      return unwrapEntity(data, null);
    },
  };

  window.MovieTrackerMediaApi = Object.freeze(mediaApi);
})();
