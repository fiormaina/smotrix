(() => {
  const projectRootPath = String(window.MovieTrackerConfig?.projectRootPath ?? "/");
  const appBaseUrl = String(
    window.MovieTrackerConfig?.appBaseUrl ?? new URL(projectRootPath, window.location.origin).href,
  );
  const routePathByKey = Object.freeze({
    home: "index.html",
    watchHistory: "pages/watch-history.html",
    folders: "pages/folders.html",
    about: "pages/about.html",
    contacts: "pages/contacts.html",
    privacy: "privacy/",
    folderCreate: "pages/folder-create.html",
    folderDetail: "pages/folder-detail.html",
    movieDetail: "pages/movie-detail.html",
    profile: "pages/profile.html",
  });
  const routeAliasByFileName = Object.freeze({
    "watch_history_light_v3.html": "watchHistory",
  });
  const appPagePathByFileName = Object.freeze(
    Object.entries(routePathByKey).reduce((result, [routeKey, routePath]) => {
      const fileName = routePath.split("/").pop() ?? "";
      if (fileName) {
        result[fileName] = `${projectRootPath}${routePath}`;
      }
      return result;
    }, {
      ...Object.entries(routeAliasByFileName).reduce((result, [fileName, routeKey]) => {
        const routePath = routePathByKey[routeKey];
        if (routePath) {
          result[fileName] = `${projectRootPath}${routePath}`;
        }
        return result;
      }, {}),
    }),
  );

  function createRelativePath(pathname, params = {}) {
    const url = new URL(pathname, appBaseUrl);
    Object.entries(params).forEach(([key, value]) => {
      if (value === undefined || value === null || value === "") return;
      url.searchParams.set(key, value);
    });
    return `${url.pathname}${url.search}${url.hash}`;
  }

  function getNormalizedPathname(pathname) {
    const safePathname = String(pathname ?? "").trim();
    if (!safePathname) return "";

    const normalizedPathname = safePathname.split(/[?#]/, 1)[0];
    const filename = normalizedPathname.split("/").pop() ?? "";
    return appPagePathByFileName[filename] ?? normalizedPathname;
  }

  function isAppPathname(pathname) {
    const normalizedPathname = getNormalizedPathname(pathname);
    return Boolean(normalizedPathname && normalizedPathname.startsWith(projectRootPath));
  }

  function resolveAppUrl(value, fallbackPath = `${projectRootPath}index.html`, options = {}) {
    const fallbackRelativeUrl = createRelativePath(fallbackPath);
    const fallbackAbsoluteUrl = new URL(fallbackRelativeUrl, appBaseUrl);
    const shouldReturnAbsolute = options.absolute === true;

    if (typeof value !== "string" || !value.trim()) {
      return shouldReturnAbsolute
        ? fallbackAbsoluteUrl.href
        : `${fallbackAbsoluteUrl.pathname}${fallbackAbsoluteUrl.search}${fallbackAbsoluteUrl.hash}`;
    }

    try {
      const parsedUrl = new URL(value, window.location.href);
      const normalizedPathname = getNormalizedPathname(parsedUrl.pathname);

      if (isAppPathname(normalizedPathname)) {
        const normalizedUrl = new URL(normalizedPathname, appBaseUrl);
        normalizedUrl.search = parsedUrl.search;
        normalizedUrl.hash = parsedUrl.hash;

        return shouldReturnAbsolute
          ? normalizedUrl.href
          : `${normalizedUrl.pathname}${normalizedUrl.search}${normalizedUrl.hash}`;
      }

      return shouldReturnAbsolute
        ? parsedUrl.href
        : `${parsedUrl.pathname}${parsedUrl.search}${parsedUrl.hash}`;
    } catch (error) {
      return shouldReturnAbsolute
        ? fallbackAbsoluteUrl.href
        : `${fallbackAbsoluteUrl.pathname}${fallbackAbsoluteUrl.search}${fallbackAbsoluteUrl.hash}`;
    }
  }

  function buildRoutePath(routeKey, params = {}) {
    const routePath = routePathByKey[routeKey] ?? routePathByKey.home;
    return createRelativePath(`${projectRootPath}${routePath}`, params);
  }

  const routes = Object.freeze({
    home: buildRoutePath("home"),
    watchHistory: buildRoutePath("watchHistory"),
    folders: buildRoutePath("folders"),
    about: buildRoutePath("about"),
    contacts: buildRoutePath("contacts"),
    privacy: buildRoutePath("privacy"),
    folderCreate: buildRoutePath("folderCreate"),
    folderDetail: (params = {}) =>
      buildRoutePath("folderDetail", params),
    movieDetail: (params = {}) =>
      buildRoutePath("movieDetail", params),
    profile: (params = {}) =>
      buildRoutePath("profile", params),
    byKey: (routeKey, params = {}) => buildRoutePath(routeKey, params),
    resolveAppUrl,
  });

  window.MovieTrackerRoutes = routes;
})();
