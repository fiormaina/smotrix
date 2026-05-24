(() => {
  const apiClient = window.MovieTrackerApiClient;
  const routes = window.MovieTrackerRoutes;
  const resolveAppUrl = routes.resolveAppUrl;
  const STORAGE_KEY = "movieTracker.foldersState.v2";
  const CURRENT_USER_STORAGE_KEY = "movieTracker.currentUser";
  const DEFAULT_AVATAR_KEY = "violet";
  const STORE_DELAY = 360;
  const STORE_SHOULD_FAIL = false;
  const TITLE_MAX_LENGTH = 80;
  const DESCRIPTION_MAX_LENGTH = 320;
  const fallbackCurrentUser = Object.freeze({
    id: "user-2026",
    displayName: "Алексей Смирнов",
    username: "kinowatcher",
    extensionCode: "MT-ALEX-2026",
    avatarKey: DEFAULT_AVATAR_KEY,
    followingCount: 0,
    followersCount: 0,
  });

  function normalizeCountValue(value, fallbackValue = 0) {
    const normalizedValue = Number(value);
    return Number.isFinite(normalizedValue) ? normalizedValue : fallbackValue;
  }

  function readStoredCurrentUser() {
    try {
      const rawValue = window.localStorage.getItem(CURRENT_USER_STORAGE_KEY);
      return rawValue ? JSON.parse(rawValue) : null;
    } catch (error) {
      console.warn(error);
      return null;
    }
  }

  function normalizeCurrentUser(source = {}) {
    const safeSource = source && typeof source === "object" ? source : {};
    const username = safeSource.username ?? safeSource.login ?? fallbackCurrentUser.username;

    return {
      id: safeSource.id ?? fallbackCurrentUser.id,
      displayName:
        safeSource.displayName ??
        safeSource.display_name ??
        safeSource.name ??
        fallbackCurrentUser.displayName,
      username,
      extensionCode:
        safeSource.extensionCode ??
        safeSource.extension_code ??
        fallbackCurrentUser.extensionCode,
      followingCount: normalizeCountValue(
        safeSource.followingCount ?? safeSource.following_count,
        fallbackCurrentUser.followingCount,
      ),
      followersCount: normalizeCountValue(
        safeSource.followersCount ?? safeSource.followers_count,
        fallbackCurrentUser.followersCount,
      ),
      avatarKey:
        safeSource.avatarKey ??
        safeSource.avatar_key ??
        fallbackCurrentUser.avatarKey,
      avatarImage:
        safeSource.avatarImage ??
        safeSource.avatar_image ??
        safeSource.avatarUrl ??
        "",
    };
  }

  const currentUser = Object.freeze(normalizeCurrentUser(readStoredCurrentUser()));

  function resolveRemoteCollection(data, fallbackValue) {
    if (Array.isArray(data?.items)) return data.items;
    if (Array.isArray(data?.folders)) return data.folders;
    if (Array.isArray(data?.results)) return data.results;
    if (Array.isArray(data)) return data;
    return fallbackValue;
  }

  function resolveRemoteEntity(data, fallbackValue) {
    return data?.folder ?? data?.user ?? data?.profile ?? data?.item ?? data ?? fallbackValue;
  }

  function withBackendFallback(remoteWork) {
    if (!apiClient) {
      return Promise.reject(new Error("Backend API не настроен"));
    }

    return Promise.resolve().then(() => remoteWork());
  }

  let remoteFolderOptions = [];

  const defaultUsers = Object.freeze({
    [currentUser.id]: currentUser,
    "anna-2026": {
      id: "anna-2026",
      displayName: "Анна Левина",
      username: "anna",
      extensionCode: "MT-ANNA-2026",
      avatarKey: "rose",
    },
    "maxim-2026": {
      id: "maxim-2026",
      displayName: "Максим Орлов",
      username: "maxim",
      extensionCode: "MT-MAX-2026",
      avatarKey: "ocean",
    },
  });

  const defaultFollowingByUserId = Object.freeze({
    [currentUser.id]: ["anna-2026"],
    "anna-2026": [currentUser.id],
    "maxim-2026": [],
  });

  function createInitialFollowingMap() {
    return Object.fromEntries(
      Object.entries(defaultFollowingByUserId).map(([userId, followedIds]) => [
        userId,
        [...new Set(followedIds.filter((followedId) => followedId && followedId !== userId))],
      ]),
    );
  }

  const defaultMediaCatalog = Object.freeze([
    {
      id: "series-1",
      title: "Название сериала 1",
      year: 2022,
      type: "series",
      typeLabel: "Сериал",
      watchStatus: "watching",
      watchStatusLabel: "Смотрю",
      userRating: 4,
      meta: "Фантастика · 45 мин/эп",
    },
    {
      id: "movie-2",
      title: "Название фильма 2",
      year: 2014,
      type: "movie",
      typeLabel: "Фильм",
      watchStatus: "watching",
      watchStatusLabel: "Смотрю",
      userRating: 4,
      meta: "Фантастика · 169 мин",
    },
    {
      id: "series-3",
      title: "Название сериала 3",
      year: 2022,
      type: "series",
      typeLabel: "Сериал",
      watchStatus: "watching",
      watchStatusLabel: "Смотрю",
      userRating: 4,
      meta: "Драма · 58 мин/эп",
    },
    {
      id: "series-4",
      title: "Название сериала 4",
      year: 2021,
      type: "series",
      typeLabel: "Сериал",
      watchStatus: "completed",
      watchStatusLabel: "Просмотрено",
      userRating: 5,
      meta: "Триллер · 50 мин/эп",
    },
    {
      id: "movie-5",
      title: "Название фильма 5",
      year: 2019,
      type: "movie",
      typeLabel: "Фильм",
      watchStatus: "completed",
      watchStatusLabel: "Просмотрено",
      userRating: 4,
      meta: "Детектив · 130 мин",
    },
    {
      id: "series-6",
      title: "Название сериала 6",
      year: 2020,
      type: "series",
      typeLabel: "Сериал",
      watchStatus: "completed",
      watchStatusLabel: "Просмотрено",
      userRating: 5,
      meta: "Криминал · 42 мин/эп",
    },
    {
      id: "series-7",
      title: "Название сериала 7",
      year: 2023,
      type: "series",
      typeLabel: "Сериал",
      watchStatus: "watching",
      watchStatusLabel: "Смотрю",
      userRating: 0,
      meta: "Приключения · 47 мин/эп",
    },
    {
      id: "movie-8",
      title: "Название фильма 8",
      year: 2020,
      type: "movie",
      typeLabel: "Фильм",
      watchStatus: "watching",
      watchStatusLabel: "Смотрю",
      userRating: 0,
      meta: "Фэнтези · 126 мин",
    },
    {
      id: "series-9",
      title: "Название сериала 9",
      year: 2024,
      type: "series",
      typeLabel: "Сериал",
      watchStatus: "watching",
      watchStatusLabel: "Смотрю",
      userRating: 0,
      meta: "Комедия · 32 мин/эп",
    },
    {
      id: "movie-10",
      title: "Название фильма 10",
      year: 2021,
      type: "movie",
      typeLabel: "Фильм",
      watchStatus: "watching",
      watchStatusLabel: "Смотрю",
      userRating: 0,
      meta: "Драма · 118 мин",
    },
  ]);

  function toItem(mediaId, addedAt) {
    return {
      mediaId,
      addedAt,
    };
  }

  function createInitialState() {
    return {
      version: 2,
      users: { ...defaultUsers },
      followingByUserId: createInitialFollowingMap(),
      mediaCatalog: defaultMediaCatalog.map((item) => ({ ...item })),
      folders: [
        {
          id: "favorites",
          ownerId: currentUser.id,
          title: "Избранное",
          description: "Фильмы и сериалы, к которым хочется вернуться в любой момент.",
          visibility: "private",
          publicSlug: null,
          createdAt: "2026-04-10T09:30:00.000Z",
          updatedAt: "2026-04-24T18:15:00.000Z",
          savedBy: [],
          items: [
            toItem("movie-2", "2026-04-10T09:30:00.000Z"),
            toItem("series-4", "2026-04-16T20:30:00.000Z"),
            toItem("movie-5", "2026-04-17T20:30:00.000Z"),
            toItem("series-6", "2026-04-18T20:30:00.000Z"),
          ],
        },
        {
          id: "weekend",
          ownerId: currentUser.id,
          title: "На выходные",
          description: "Легкий список на вечер пятницы и ленивое воскресенье.",
          visibility: "private",
          publicSlug: null,
          createdAt: "2026-04-11T11:00:00.000Z",
          updatedAt: "2026-04-25T14:10:00.000Z",
          savedBy: [],
          items: [
            toItem("series-1", "2026-04-20T12:00:00.000Z"),
            toItem("series-3", "2026-04-21T09:20:00.000Z"),
            toItem("series-7", "2026-04-22T10:40:00.000Z"),
          ],
        },
        {
          id: "detectives",
          ownerId: currentUser.id,
          title: "Детективы",
          description: "Подборка напряженных историй, которыми удобно делиться по ссылке.",
          visibility: "public",
          publicSlug: "folder-detectives",
          createdAt: "2026-04-12T08:40:00.000Z",
          updatedAt: "2026-04-26T09:35:00.000Z",
          savedBy: [],
          items: [
            toItem("movie-5", "2026-04-18T18:10:00.000Z"),
            toItem("series-4", "2026-04-18T18:14:00.000Z"),
            toItem("series-6", "2026-04-18T18:22:00.000Z"),
          ],
        },
        {
          id: "ideas",
          ownerId: currentUser.id,
          title: "Идеи",
          description: "",
          visibility: "private",
          publicSlug: null,
          createdAt: "2026-04-14T13:20:00.000Z",
          updatedAt: "2026-04-14T13:20:00.000Z",
          savedBy: [],
          items: [],
        },
        {
          id: "friends",
          ownerId: "anna-2026",
          title: "Для друзей",
          description: "Публичная подборка Анны. Если сохранить ее себе, она останется связанной с оригиналом.",
          visibility: "public",
          publicSlug: "anna-friends-list",
          createdAt: "2026-04-08T18:20:00.000Z",
          updatedAt: "2026-04-23T17:45:00.000Z",
          savedBy: [currentUser.id],
          items: [
            toItem("series-1", "2026-04-08T18:20:00.000Z"),
            toItem("movie-8", "2026-04-09T11:10:00.000Z"),
            toItem("series-9", "2026-04-10T16:15:00.000Z"),
          ],
        },
        {
          id: "series",
          ownerId: "maxim-2026",
          title: "Сериалы",
          description: "Максим собирает тут свежие сериалы и регулярно обновляет порядок.",
          visibility: "public",
          publicSlug: "maxim-series-list",
          createdAt: "2026-04-06T07:55:00.000Z",
          updatedAt: "2026-04-22T12:25:00.000Z",
          savedBy: [currentUser.id],
          items: [
            toItem("series-3", "2026-04-06T07:55:00.000Z"),
            toItem("series-7", "2026-04-11T07:20:00.000Z"),
            toItem("series-9", "2026-04-14T20:05:00.000Z"),
            toItem("series-4", "2026-04-21T21:35:00.000Z"),
          ],
        },
      ],
      tombstones: [],
    };
  }

  function cloneState(state) {
    return {
      ...state,
      users: { ...(state.users ?? {}) },
      followingByUserId: Object.fromEntries(
        Object.entries(state.followingByUserId ?? {}).map(([userId, followedIds]) => [
          userId,
          [...(followedIds ?? [])],
        ]),
      ),
      mediaCatalog: (state.mediaCatalog ?? []).map((item) => ({ ...item })),
      folders: (state.folders ?? []).map((folder) => ({
        ...folder,
        savedBy: [...(folder.savedBy ?? [])],
        items: (folder.items ?? []).map((item) => ({ ...item })),
      })),
      tombstones: (state.tombstones ?? []).map((item) => ({ ...item })),
    };
  }

  function readState() {
    try {
      const rawValue = window.localStorage.getItem(STORAGE_KEY);
      if (!rawValue) return createInitialState();
      const parsed = JSON.parse(rawValue);
      if (!parsed || typeof parsed !== "object") return createInitialState();
      const nextState = cloneState(parsed);
      nextState.users = {
        ...defaultUsers,
        ...(nextState.users ?? {}),
        [currentUser.id]: {
          ...(defaultUsers[currentUser.id] ?? {}),
          ...(nextState.users?.[currentUser.id] ?? {}),
          ...currentUser,
        },
      };
      nextState.users = Object.fromEntries(
        Object.entries(nextState.users).map(([userId, user]) => [
          userId,
          normalizeCurrentUser({ ...user, id: userId }),
        ]),
      );
      nextState.followingByUserId = normalizeFollowingMap(nextState.followingByUserId, nextState.users);
      nextState.mediaCatalog = nextState.mediaCatalog.length
        ? nextState.mediaCatalog
        : defaultMediaCatalog.map((item) => ({ ...item }));
      nextState.folders = nextState.folders ?? [];
      nextState.folders.forEach((folder) => {
        ensureFolderShareSlug(nextState, folder);
      });
      nextState.tombstones = nextState.tombstones ?? [];
      return nextState;
    } catch (error) {
      console.warn(error);
      return createInitialState();
    }
  }

  function writeState(state) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function ensureState() {
    const state = readState();
    state.folders.forEach((folder) => {
      ensureFolderShareSlug(state, folder);
    });
    writeState(state);
    return state;
  }

  function simulateAsync(work) {
    return new Promise((resolve, reject) => {
      window.setTimeout(() => {
        try {
          if (STORE_SHOULD_FAIL) throw new Error("Mock folders error");
          resolve(work());
        } catch (error) {
          reject(error);
        }
      }, STORE_DELAY);
    });
  }

  function getUser(userId) {
    const state = readState();
    return state.users[userId] ?? currentUser;
  }

  function normalizeFollowingMap(followingByUserId, users) {
    const source = followingByUserId && typeof followingByUserId === "object"
      ? followingByUserId
      : createInitialFollowingMap();
    const normalizedEntries = Object.keys(users).map((userId) => {
      const rawIds = Array.isArray(source[userId]) ? source[userId] : [];
      const followedIds = [...new Set(rawIds.filter((followedId) => followedId && followedId !== userId))];
      return [userId, followedIds];
    });

    return Object.fromEntries(normalizedEntries);
  }

  function createId(prefix) {
    return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  }

  function slugify(value) {
    return String(value)
      .trim()
      .toLowerCase()
      .replace(/[^a-zа-я0-9]+/gi, "-")
      .replace(/^-+|-+$/g, "")
      .replace(/-{2,}/g, "-")
      .slice(0, 48);
  }

  function ensureUniqueSlug(state, baseSlug, folderId = "") {
    const initialSlug = baseSlug || `folder-${Date.now().toString(36)}`;
    let slug = initialSlug;
    let counter = 1;

    while (
      state.folders.some((folder) => folder.id !== folderId && folder.publicSlug === slug) ||
      state.tombstones.some((item) => item.publicSlug === slug)
    ) {
      slug = `${initialSlug}-${counter++}`;
    }

    return slug;
  }

  function createPublicSlug(state, title, folderId = "") {
    return ensureUniqueSlug(state, slugify(title) || `folder-${Date.now().toString(36)}`, folderId);
  }

  function ensureFolderShareSlug(state, folder) {
    if (folder.publicSlug) return folder.publicSlug;

    folder.publicSlug = createPublicSlug(state, folder.title, folder.id);
    return folder.publicSlug;
  }

  function getMediaMap(state) {
    return new Map((state.mediaCatalog ?? []).map((item) => [item.id, { ...item }]));
  }

  function formatDate(isoValue) {
    return new Intl.DateTimeFormat("ru-RU", {
      day: "numeric",
      month: "long",
      year: "numeric",
    }).format(new Date(isoValue));
  }

  function getFolderPublicUrl(folder) {
    const publicSlug = folder.publicSlug || slugify(folder.title) || folder.id;
    return resolveAppUrl(routes.folderDetail({ share: publicSlug }), routes.folderDetail({ share: publicSlug }), {
      absolute: true,
    });
  }

  function getFolderPageUrl(folderId) {
    return resolveAppUrl(routes.folderDetail({ id: folderId }), routes.folderDetail({ id: folderId }));
  }

  function getProfileUrl(username, absolute = false) {
    const normalizedUsername = String(username ?? "").trim().replace(/^@+/, "");
    const relativeUrl = normalizedUsername
      ? routes.profile({ user: normalizedUsername })
      : routes.profile();

    return resolveAppUrl(relativeUrl, routes.profile(), { absolute });
  }

  function getCreateFolderUrl() {
    return routes.folderCreate;
  }

  function toIdString(value) {
    return value === null || value === undefined ? "" : String(value);
  }

  function readRemoteFolderOwnerUsername(folder) {
    const rawValue =
      folder.ownerUsername ??
      folder.owner_username ??
      folder.owner?.username ??
      folder.owner?.login ??
      "";

    return String(rawValue).trim().replace(/^@+/, "");
  }

  function readRemoteFolderPublicSlug(folder) {
    return toIdString(folder.publicSlug ?? folder.public_slug).trim();
  }

  function buildCanonicalFolderPageUrl(folder, normalizedId) {
    const rawPageUrl = typeof folder.pageUrl === "string" ? folder.pageUrl.trim() : "";
    return normalizedId
      ? getFolderPageUrl(normalizedId)
      : resolveAppUrl(rawPageUrl, routes.folderDetail());
  }

  function buildCanonicalFolderPublicUrl(folder, fallbackPageUrl) {
    const publicSlug = readRemoteFolderPublicSlug(folder);
    if (publicSlug) {
      return getFolderPublicUrl({
        id: toIdString(folder.id),
        title: folder.title,
        publicSlug,
      });
    }

    const rawPublicUrl = typeof folder.publicUrl === "string" ? folder.publicUrl.trim() : "";
    return resolveAppUrl(rawPublicUrl, fallbackPageUrl, { absolute: true });
  }

  function normalizeRemoteFolderSummary(folder, viewerId = currentUser.id) {
    if (!folder || typeof folder !== "object") return null;

    const normalizedId = toIdString(folder.id);
    if (!normalizedId) return null;

    const access = String(folder.access ?? "private");
    const isOwner = folder.isOwner ?? access !== "shared";
    const ownerUsername = readRemoteFolderOwnerUsername(folder) || currentUser.username;
    const normalizedPageUrl = buildCanonicalFolderPageUrl(folder, normalizedId);
    const normalizedPublicUrl = buildCanonicalFolderPublicUrl(
      { ...folder, id: normalizedId },
      normalizedPageUrl,
    );
    const ownerName =
      typeof folder.ownerName === "string" && folder.ownerName.trim()
        ? folder.ownerName.trim()
        : isOwner
          ? currentUser.displayName
          : "";

    return {
      ...folder,
      id: normalizedId,
      owner: folder.owner ? { ...folder.owner } : currentUser,
      ownerName,
      ownerUsername: ownerUsername,
      ownerProfileUrl:
        resolveAppUrl(
          folder.ownerProfileUrl,
          getProfileUrl(ownerUsername),
        ),
      itemsCount: Number(folder.itemsCount ?? 0),
      access,
      isOwner,
      isSaved: folder.isSaved ?? access === "shared",
      isPublic: Boolean(folder.isPublic ?? folder.publicSlug ?? access === "shared"),
      isAccessible: folder.isAccessible ?? true,
      publicUrl: normalizedPublicUrl,
      pageUrl: normalizedPageUrl,
      updatedAtLabel: folder.updatedAt
        ? formatDate(folder.updatedAt)
        : folder.updatedAtLabel ?? "",
      empty: Number(folder.itemsCount ?? 0) === 0,
    };
  }

  function normalizeRemoteFolderItem(item, index = 0) {
    if (!item || typeof item !== "object") return null;

    const addedAt = item.addedAt ?? item.added_at ?? "";
    let addedAtLabel = item.addedAtLabel ?? item.added_at_label ?? "";
    if (!addedAtLabel && addedAt) {
      try {
        addedAtLabel = formatDate(addedAt);
      } catch (error) {
        addedAtLabel = "";
      }
    }

    return {
      ...item,
      id: toIdString(item.id ?? item.mediaId ?? item.media_id),
      addedAt,
      addedAtLabel,
      index,
    };
  }

  function normalizeRemoteFolderDetail(folder, viewerId = currentUser.id) {
    const summary = normalizeRemoteFolderSummary(folder, viewerId);
    if (!summary) return null;

    const role = String(folder.role ?? "").trim() || (
      summary.isOwner
        ? "owner"
        : summary.isSaved
          ? "saved"
          : "public"
    );

    return {
      ...folder,
      ...summary,
      role,
      canEdit: role === "owner",
      canSave: role === "public",
      canRemoveSaved: role === "saved",
      linkedNotice:
        role === "saved"
          ? "Эта папка сохранена по ссылке к оригиналу. Все обновления владельца отразятся здесь автоматически."
          : role === "public"
            ? "Если сохранить папку себе, она останется связанной с оригиналом и будет обновляться вместе с ним."
            : "",
      items: Array.isArray(folder.items)
        ? folder.items.map((item, index) => normalizeRemoteFolderItem(item, index)).filter(Boolean)
        : [],
    };
  }

  function rememberRemoteFolderOptions(folders = []) {
    remoteFolderOptions = folders
      .filter((folder) => folder && !folder.isSystem && folder.isOwner)
      .map((folder) => ({
        id: folder.id,
        title: folder.title,
        description:
          folder.description ||
          (folder.isPublic
            ? "Публичная папка с общей ссылкой"
            : "Личная папка для собственных подборок"),
        isPublic: folder.isPublic,
        itemsCount: folder.itemsCount,
      }));
  }

  function enrichFolderSummary(folder, state, viewerId = currentUser.id) {
    const owner = state.users[folder.ownerId] ?? currentUser;
    const isOwner = folder.ownerId === viewerId;
    const isSaved = !isOwner && folder.savedBy.includes(viewerId);
    const itemsCount = folder.items.length;
    const access = isOwner ? "private" : "shared";
    const isAccessible = true;

    return {
      ...folder,
      owner,
      ownerName: owner.displayName,
      ownerUsername: owner.username,
      ownerProfileUrl: getProfileUrl(owner.username),
      itemsCount,
      access,
      isOwner,
      isSaved,
      isPublic: folder.visibility === "public",
      isAccessible,
      publicUrl: getFolderPublicUrl(folder),
      pageUrl: getFolderPageUrl(folder.id),
      updatedAtLabel: formatDate(folder.updatedAt),
      empty: itemsCount === 0,
    };
  }

  function sortByUpdatedDate(items) {
    return [...items].sort((left, right) => new Date(right.updatedAt) - new Date(left.updatedAt));
  }

  function listLibraryFolders(viewerId = currentUser.id) {
    const state = readState();
    return sortByUpdatedDate(
      state.folders
        .filter((folder) => folder.ownerId === viewerId || folder.savedBy.includes(viewerId))
        .map((folder) => enrichFolderSummary(folder, state, viewerId)),
    );
  }

  function listOwnFolders(viewerId = currentUser.id) {
    const state = readState();
    return sortByUpdatedDate(
      state.folders
        .filter((folder) => folder.ownerId === viewerId)
        .map((folder) => enrichFolderSummary(folder, state, viewerId)),
    );
  }

  function listPublicFolders() {
    const state = readState();
    return sortByUpdatedDate(
      state.folders
        .filter((folder) => folder.visibility === "public")
        .map((folder) => enrichFolderSummary(folder, state, currentUser.id)),
    );
  }

  function listPublicFoldersByOwner(ownerId, viewerId = currentUser.id) {
    const state = readState();
    return sortByUpdatedDate(
      state.folders
        .filter((folder) => folder.ownerId === ownerId && folder.visibility === "public")
        .map((folder) => enrichFolderSummary(folder, state, viewerId)),
    );
  }

  function resolveUserId(state, target = "", fallbackUserId = currentUser.id) {
    const normalizedTarget = String(target ?? "").trim().replace(/^@+/, "").toLowerCase();
    if (!normalizedTarget || normalizedTarget === "me") return fallbackUserId;

    if (state.users[normalizedTarget]) {
      return normalizedTarget;
    }

    const matchedUser = Object.values(state.users).find((user) => {
      const username = String(user.username ?? "").trim().toLowerCase();
      return username === normalizedTarget;
    });

    return matchedUser?.id ?? "";
  }

  function getFollowingIds(state, userId) {
    return [...(state.followingByUserId?.[userId] ?? [])];
  }

  function getFollowersCount(state, userId) {
    return Object.values(state.followingByUserId ?? {}).reduce(
      (count, followedIds) => count + (followedIds.includes(userId) ? 1 : 0),
      0,
    );
  }

  function enrichUserProfile(user, state, viewerId = currentUser.id) {
    const followingIds = getFollowingIds(state, user.id);
    const publicFoldersCount = state.folders.filter(
      (folder) => folder.ownerId === user.id && folder.visibility === "public",
    ).length;
    const publicItemsCount = state.folders
      .filter((folder) => folder.ownerId === user.id && folder.visibility === "public")
      .reduce((count, folder) => count + folder.items.length, 0);

    return {
      ...user,
      profileUrl: getProfileUrl(user.username, true),
      isOwner: user.id === viewerId,
      isFollowing: getFollowingIds(state, viewerId).includes(user.id),
      followingCount: followingIds.length,
      followersCount: getFollowersCount(state, user.id),
      publicFoldersCount,
      publicItemsCount,
    };
  }

  function getProfileView({ userId = "", username = "", viewerId = currentUser.id } = {}) {
    const state = readState();
    const resolvedUserId = resolveUserId(state, userId || username, viewerId);
    const user = state.users[resolvedUserId];

    if (!user) {
      return { status: "missing" };
    }

    return {
      status: "ok",
      user: enrichUserProfile(user, state, viewerId),
      publicFolders: listPublicFoldersByOwner(user.id, viewerId),
    };
  }

  function getFolderRole(folder, viewerId) {
    if (folder.ownerId === viewerId) return "owner";
    if (folder.savedBy.includes(viewerId)) return "saved";
    return "public";
  }

  function enrichFolderDetail(folder, state, viewerId = currentUser.id) {
    const summary = enrichFolderSummary(folder, state, viewerId);
    const role = getFolderRole(folder, viewerId);
    const mediaMap = getMediaMap(state);
    const items = folder.items
      .map((folderItem, index) => {
        const media = mediaMap.get(folderItem.mediaId);
        if (!media) return null;
        return {
          ...media,
          addedAt: folderItem.addedAt,
          addedAtLabel: formatDate(folderItem.addedAt),
          index,
        };
      })
      .filter(Boolean);

    return {
      ...summary,
      role,
      canEdit: role === "owner",
      canSave: role === "public",
      canRemoveSaved: role === "saved",
      linkedNotice:
        role === "saved"
          ? "Эта папка сохранена по ссылке к оригиналу. Все обновления владельца отразятся здесь автоматически."
          : role === "public"
            ? "Если сохранить папку себе, она останется связанной с оригиналом и будет обновляться вместе с ним."
            : "",
      items,
    };
  }

  function findFolderById(state, folderId) {
    return state.folders.find((folder) => folder.id === folderId) ?? null;
  }

  function findFolderBySlug(state, publicSlug) {
    return state.folders.find((folder) => folder.publicSlug === publicSlug) ?? null;
  }

  function getFolderView({ folderId = "", publicSlug = "", viewerId = currentUser.id } = {}) {
    const state = readState();

    if (folderId) {
      const folder = findFolderById(state, folderId);
      if (!folder) {
        return { status: "missing" };
      }

      if (folder.ownerId === viewerId) {
        return {
          status: "ok",
          folder: enrichFolderDetail(folder, state, viewerId),
        };
      }

      const hasAccess = folder.savedBy.includes(viewerId) || folder.visibility === "public";

      if (!hasAccess) {
        return { status: "forbidden" };
      }

      return {
        status: "ok",
        folder: enrichFolderDetail(folder, state, viewerId),
      };
    }

    if (publicSlug) {
      const folder = findFolderBySlug(state, publicSlug);
      if (folder) {
        return {
          status: "ok",
          folder: enrichFolderDetail(folder, state, viewerId),
        };
      }

      const tombstone = state.tombstones.find((item) => item.publicSlug === publicSlug);
      if (!tombstone) {
        return { status: "unavailable" };
      }

      return {
        status: tombstone.reason === "owner_deleted" ? "owner-deleted" : "deleted",
        tombstone: { ...tombstone },
      };
    }

    return { status: "missing" };
  }

  function validateFolderPayload(payload, state, folderId = "", viewerId = currentUser.id) {
    const title = String(payload.title ?? "").trim();
    const description = String(payload.description ?? "").trim();
    const visibility = String(payload.visibility ?? "");
    const errors = {};

    if (!title) {
      errors.title = "Введите название папки";
    } else if (title.length > TITLE_MAX_LENGTH) {
      errors.title = `Название должно быть не длиннее ${TITLE_MAX_LENGTH} символов`;
    }

    if (description.length > DESCRIPTION_MAX_LENGTH) {
      errors.description = `Описание должно быть не длиннее ${DESCRIPTION_MAX_LENGTH} символов`;
    }

    if (visibility !== "private" && visibility !== "public") {
      errors.visibility = "Выберите тип папки";
    }

    const duplicate = state.folders.find(
      (folder) =>
        folder.id !== folderId &&
        folder.ownerId === viewerId &&
        folder.title.trim().toLowerCase() === title.toLowerCase(),
    );

    if (duplicate) {
      errors.title = "Папка с таким названием уже существует";
    }

    return {
      errors,
      value: {
        title,
        description,
        visibility,
      },
    };
  }

  function createValidationError(errors) {
    const error = new Error("Validation error");
    error.code = "validation";
    error.errors = errors;
    return error;
  }

  function createAccessError(message = "Недостаточно прав") {
    const error = new Error(message);
    error.code = "access";
    return error;
  }

  function touchFolder(folder) {
    folder.updatedAt = new Date().toISOString();
  }

  function createFolder(payload, viewerId = currentUser.id) {
    return simulateAsync(() => {
      const state = readState();
      const validation = validateFolderPayload(payload, state, "", viewerId);
      if (Object.keys(validation.errors).length) {
        throw createValidationError(validation.errors);
      }

      const folder = {
        id: createId("folder"),
        ownerId: viewerId,
        title: validation.value.title,
        description: validation.value.description,
        visibility: validation.value.visibility,
        publicSlug: createPublicSlug(state, validation.value.title),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        savedBy: [],
        items: [],
      };

      state.folders.unshift(folder);
      writeState(state);

      return enrichFolderDetail(folder, state, viewerId);
    });
  }

  function updateFolder(folderId, patch, viewerId = currentUser.id) {
    return simulateAsync(() => {
      const state = readState();
      const folder = findFolderById(state, folderId);
      if (!folder) throw new Error("Папка не найдена");
      if (folder.ownerId !== viewerId) throw createAccessError("Редактирование недоступно");

      const validation = validateFolderPayload(
        {
          title: patch.title ?? folder.title,
          description: patch.description ?? folder.description,
          visibility: patch.visibility ?? folder.visibility,
        },
        state,
        folderId,
        viewerId,
      );

      if (Object.keys(validation.errors).length) {
        throw createValidationError(validation.errors);
      }

      folder.title = validation.value.title;
      folder.description = validation.value.description;
      folder.visibility = validation.value.visibility;
      ensureFolderShareSlug(state, folder);

      touchFolder(folder);
      writeState(state);

      return enrichFolderDetail(folder, state, viewerId);
    });
  }

  function deleteFolder(folderId, viewerId = currentUser.id) {
    return simulateAsync(() => {
      const state = readState();
      const folderIndex = state.folders.findIndex((folder) => folder.id === folderId);
      if (folderIndex === -1) throw new Error("Папка не найдена");

      const folder = state.folders[folderIndex];
      if (folder.ownerId !== viewerId) throw createAccessError("Удаление оригинала недоступно");

      if (folder.publicSlug) {
        state.tombstones.unshift({
          publicSlug: folder.publicSlug,
          title: folder.title,
          ownerId: folder.ownerId,
          ownerName: (state.users[folder.ownerId] ?? currentUser).displayName,
          deletedAt: new Date().toISOString(),
          reason: "owner_deleted",
        });
      }

      state.folders.splice(folderIndex, 1);
      writeState(state);
      return { ok: true };
    });
  }

  function saveFolder(folderId, viewerId = currentUser.id) {
    return simulateAsync(() => {
      const state = readState();
      const folder = findFolderById(state, folderId);
      if (!folder) throw new Error("Папка недоступна");
      if (folder.ownerId === viewerId) throw createAccessError("Нельзя сохранять свою папку");

      if (folder.savedBy.includes(viewerId)) {
        return {
          status: "already-saved",
          folder: enrichFolderDetail(folder, state, viewerId),
        };
      }

      folder.savedBy.push(viewerId);
      touchFolder(folder);
      writeState(state);

      return {
        status: "saved",
        folder: enrichFolderDetail(folder, state, viewerId),
      };
    });
  }

  function unsaveFolder(folderId, viewerId = currentUser.id) {
    return simulateAsync(() => {
      const state = readState();
      const folder = findFolderById(state, folderId);
      if (!folder) throw new Error("Папка недоступна");
      if (folder.ownerId === viewerId) throw createAccessError("Для своей папки используйте удаление");

      folder.savedBy = folder.savedBy.filter((id) => id !== viewerId);
      touchFolder(folder);
      writeState(state);

      return {
        status: "removed",
        folderId,
      };
    });
  }

  function searchMedia(query = "") {
    const state = readState();
    const normalizedQuery = String(query).trim().toLowerCase();

    if (!normalizedQuery) return state.mediaCatalog.map((item) => ({ ...item }));

    return state.mediaCatalog.filter((item) => {
      const haystack = `${item.title} ${item.typeLabel} ${item.meta}`.toLowerCase();
      return haystack.includes(normalizedQuery);
    });
  }

  function getRecentMedia(limit = 5) {
    const state = readState();
    const safeLimit = Math.max(0, Number(limit) || 0);

    return [...state.mediaCatalog]
      .slice(-safeLimit)
      .reverse()
      .map((item) => ({ ...item }));
  }

  function getMediaItem(mediaId) {
    const state = readState();
    const media = state.mediaCatalog.find((item) => item.id === mediaId);
    return media ? { ...media } : null;
  }

  function addItemToFolder(folderId, mediaId, viewerId = currentUser.id) {
    return simulateAsync(() => {
      const state = readState();
      const folder = findFolderById(state, folderId);
      if (!folder) throw new Error("Папка не найдена");
      if (folder.ownerId !== viewerId) throw createAccessError("Изменение содержимого недоступно");

      const media = state.mediaCatalog.find((item) => item.id === mediaId);
      if (!media) throw new Error("Элемент не найден");

      const exists = folder.items.some((item) => item.mediaId === mediaId);
      if (exists) {
        return {
          status: "duplicate",
          folder: enrichFolderDetail(folder, state, viewerId),
        };
      }

      folder.items.push({
        mediaId,
        addedAt: new Date().toISOString(),
      });
      touchFolder(folder);
      writeState(state);

      return {
        status: "added",
        folder: enrichFolderDetail(folder, state, viewerId),
      };
    });
  }

  function removeItemFromFolder(folderId, mediaId, viewerId = currentUser.id) {
    return simulateAsync(() => {
      const state = readState();
      const folder = findFolderById(state, folderId);
      if (!folder) throw new Error("Папка не найдена");
      if (folder.ownerId !== viewerId) throw createAccessError("Изменение содержимого недоступно");

      folder.items = folder.items.filter((item) => item.mediaId !== mediaId);
      touchFolder(folder);
      writeState(state);

      return enrichFolderDetail(folder, state, viewerId);
    });
  }

  function moveItem(folderId, mediaId, direction, viewerId = currentUser.id) {
    return simulateAsync(() => {
      const state = readState();
      const folder = findFolderById(state, folderId);
      if (!folder) throw new Error("Папка не найдена");
      if (folder.ownerId !== viewerId) throw createAccessError("Изменение порядка недоступно");

      const currentIndex = folder.items.findIndex((item) => item.mediaId === mediaId);
      if (currentIndex === -1) throw new Error("Элемент не найден");

      const targetIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
      if (targetIndex < 0 || targetIndex >= folder.items.length) {
        return enrichFolderDetail(folder, state, viewerId);
      }

      const [movedItem] = folder.items.splice(currentIndex, 1);
      folder.items.splice(targetIndex, 0, movedItem);
      touchFolder(folder);
      writeState(state);

      return enrichFolderDetail(folder, state, viewerId);
    });
  }

  function listFolderOptions(viewerId = currentUser.id) {
    if (remoteFolderOptions.length) {
      return remoteFolderOptions.map((folder) => ({ ...folder }));
    }
    return [];
  }

  function getFolderLimits() {
    return {
      titleMaxLength: TITLE_MAX_LENGTH,
      descriptionMaxLength: DESCRIPTION_MAX_LENGTH,
    };
  }

  function followUser(targetUserId, viewerId = currentUser.id) {
    return simulateAsync(() => {
      const state = readState();
      const targetUser = state.users[targetUserId];
      if (!targetUser) throw new Error("Пользователь не найден");
      if (targetUserId === viewerId) throw createAccessError("Нельзя подписаться на себя");

      state.followingByUserId = normalizeFollowingMap(state.followingByUserId, state.users);
      const followedIds = new Set(state.followingByUserId[viewerId] ?? []);
      followedIds.add(targetUserId);
      state.followingByUserId[viewerId] = [...followedIds];
      writeState(state);

      return {
        status: "following",
        user: enrichUserProfile(targetUser, state, viewerId),
      };
    });
  }

  function unfollowUser(targetUserId, viewerId = currentUser.id) {
    return simulateAsync(() => {
      const state = readState();
      const targetUser = state.users[targetUserId];
      if (!targetUser) throw new Error("Пользователь не найден");
      if (targetUserId === viewerId) throw createAccessError("Нельзя отписаться от себя");

      state.followingByUserId = normalizeFollowingMap(state.followingByUserId, state.users);
      state.followingByUserId[viewerId] = (state.followingByUserId[viewerId] ?? []).filter(
        (followedId) => followedId !== targetUserId,
      );
      writeState(state);

      return {
        status: "not-following",
        user: enrichUserProfile(targetUser, state, viewerId),
      };
    });
  }

  function upsertUser(user) {
    const normalizedUser = normalizeCurrentUser(user);
    const state = readState();

    state.users[normalizedUser.id] = {
      ...(state.users[normalizedUser.id] ?? {}),
      ...normalizedUser,
    };
    state.followingByUserId = normalizeFollowingMap(state.followingByUserId, state.users);
    writeState(state);

    return {
      ...state.users[normalizedUser.id],
      profileUrl: getProfileUrl(state.users[normalizedUser.id].username, true),
    };
  }

  function fetchLibraryFolders(viewerId = currentUser.id) {
    return withBackendFallback(async () => {
      const data = await apiClient.request("/folders/library", { method: "GET" }, {
        namespace: "folders",
        query: { viewerId },
      });
      const remoteFolders = resolveRemoteCollection(data, [])
        .map((folder) => normalizeRemoteFolderSummary(folder, viewerId))
        .filter(Boolean);
      rememberRemoteFolderOptions(remoteFolders);
      return remoteFolders;
    });
  }

  function fetchOwnFolders(viewerId = currentUser.id) {
    return withBackendFallback(async () => {
      const data = await apiClient.request("/folders/own", { method: "GET" }, {
        namespace: "folders",
        query: { viewerId },
      });
      const remoteFolders = resolveRemoteCollection(data, [])
        .map((folder) => normalizeRemoteFolderSummary(folder, viewerId))
        .filter(Boolean);
      rememberRemoteFolderOptions(remoteFolders);
      return remoteFolders;
    });
  }

  function fetchPublicFoldersByOwner(ownerId, viewerId = currentUser.id) {
    return withBackendFallback(async () => {
      const data = await apiClient.request("/folders/public", { method: "GET" }, {
        namespace: "folders",
        query: { ownerId, viewerId },
      });
      return resolveRemoteCollection(data, [])
        .map((folder) => normalizeRemoteFolderSummary(folder, viewerId))
        .filter(Boolean);
    });
  }

  function fetchProfileView({ userId = "", username = "", viewerId = currentUser.id } = {}) {
    return withBackendFallback(async () => {
      const data = await apiClient.request("/profiles/view", { method: "GET" }, {
        namespace: "profiles",
        query: { userId, username, viewerId },
      });
      if (data?.status) {
        if (data.status !== "ok") return data;

        const remoteFolders = resolveRemoteCollection(
          data.publicFolders ?? data.folders,
          [],
        )
          .map((folder) => normalizeRemoteFolderSummary(folder, viewerId))
          .filter(Boolean);

        return {
          ...data,
          publicFolders: remoteFolders,
        };
      }

      if (data?.user || data?.profile || data?.id) {
        const remoteFolders = resolveRemoteCollection(
          data.publicFolders ?? data.folders,
          [],
        )
          .map((folder) => normalizeRemoteFolderSummary(folder, viewerId))
          .filter(Boolean);

        return {
          status: "ok",
          user: data.user ?? data.profile ?? data,
          publicFolders: remoteFolders,
        };
      }

      return {
        status: "missing",
        user: null,
        publicFolders: [],
      };
    });
  }

  function fetchFolderView({ folderId = "", publicSlug = "", viewerId = currentUser.id } = {}) {
    return withBackendFallback(async () => {
      const data = await apiClient.request("/folders/view", { method: "GET" }, {
        namespace: "folders",
        query: { folderId, publicSlug, viewerId },
      });
      if (data?.status) {
        if (data.status !== "ok") return data;

        const normalizedFolder = normalizeRemoteFolderDetail(data.folder ?? data, viewerId);
        if (!normalizedFolder) throw new Error("Не удалось прочитать папку");

        return {
          ...data,
          folder: normalizedFolder,
        };
      }

      if (data?.folder || data?.id || data?.role) {
        const normalizedFolder = normalizeRemoteFolderDetail(data.folder ?? data, viewerId);
        if (!normalizedFolder) throw new Error("Не удалось прочитать папку");

        return {
          status: "ok",
          folder: normalizedFolder,
        };
      }

      return {
        status: "missing",
        folder: null,
      };
    });
  }

  function fetchRecentMedia(limit = 5) {
    return withBackendFallback(async () => {
      const data = await apiClient.request("/media/recent", { method: "GET" }, {
        namespace: "media",
        query: { limit },
      });
      return resolveRemoteCollection(data, []);
    });
  }

  function fetchMediaItem(mediaId) {
    return withBackendFallback(async () => {
      const data = await apiClient.request(`/media/${encodeURIComponent(mediaId)}`, { method: "GET" }, {
        namespace: "media",
      });
      return resolveRemoteEntity(data, null);
    });
  }

  function searchMediaRemote(query = "") {
    return withBackendFallback(async () => {
      const data = await apiClient.request("/media/search", { method: "GET" }, {
        namespace: "media",
        query: { q: query },
      });
      return resolveRemoteCollection(data, []);
    });
  }

  function createFolderWithBackend(payload, viewerId = currentUser.id) {
    const state = readState();
    const validation = validateFolderPayload(payload, state, "", viewerId);
    if (Object.keys(validation.errors).length) {
      return Promise.reject(createValidationError(validation.errors));
    }

    return withBackendFallback(async () => {
      const data = await apiClient.request("/folders", {
        method: "POST",
        body: JSON.stringify({ ...validation.value, viewerId }),
      }, { namespace: "folders" });
      return resolveRemoteEntity(data, null);
    });
  }

  function updateFolderWithBackend(folderId, patch, viewerId = currentUser.id) {
    const state = readState();
    const folder = findFolderById(state, folderId);

    const validation = validateFolderPayload(
      {
        title: patch.title ?? folder?.title ?? "",
        description: patch.description ?? folder?.description ?? "",
        visibility: patch.visibility ?? folder?.visibility ?? "private",
      },
      state,
      folderId,
      viewerId,
    );

    if (Object.keys(validation.errors).length) {
      return Promise.reject(createValidationError(validation.errors));
    }

    return withBackendFallback(async () => {
      const data = await apiClient.request(`/folders/${encodeURIComponent(folderId)}`, {
        method: "PATCH",
        body: JSON.stringify({
          ...patch,
          title: validation.value.title,
          description: validation.value.description,
          visibility: validation.value.visibility,
          viewerId,
        }),
      }, { namespace: "folders" });
      const remoteFolder = resolveRemoteEntity(data, null);
      return normalizeRemoteFolderDetail(remoteFolder, viewerId) ?? remoteFolder;
    });
  }

  function deleteFolderWithBackend(folderId, viewerId = currentUser.id) {
    return withBackendFallback(async () => {
      const data = await apiClient.request(`/folders/${encodeURIComponent(folderId)}`, {
        method: "DELETE",
      }, {
        namespace: "folders",
        query: { viewerId },
      });
      return resolveRemoteEntity(data, null) ?? { ok: true };
    });
  }

  function saveFolderWithBackend(folderId, viewerId = currentUser.id) {
    return withBackendFallback(async () => {
      const data = await apiClient.request(`/folders/${encodeURIComponent(folderId)}/save`, {
        method: "POST",
        body: JSON.stringify({ viewerId }),
      }, { namespace: "folders" });
      if (data?.status) return data;
      if (data?.folder || data?.id) {
        return {
          status: "saved",
          folder: data.folder ?? data,
        };
      }
      return { status: "saved", folderId };
    });
  }

  function unsaveFolderWithBackend(folderId, viewerId = currentUser.id) {
    return withBackendFallback(async () => {
      const data = await apiClient.request(`/folders/${encodeURIComponent(folderId)}/save`, {
        method: "DELETE",
      }, {
        namespace: "folders",
        query: { viewerId },
      });
      if (data?.status) return data;
      return data ?? { status: "removed", folderId };
    });
  }

  function addItemToFolderWithBackend(folderId, mediaId, viewerId = currentUser.id) {
    return withBackendFallback(async () => {
      const data = await apiClient.request(`/folders/${encodeURIComponent(folderId)}/items`, {
        method: "POST",
        body: JSON.stringify({ mediaId, viewerId }),
      }, { namespace: "folders" });
      if (data?.status) return data;
      if (data?.folder || data?.id) {
        return {
          status: "added",
          folder: data.folder ?? data,
        };
      }
      return { status: "added", folderId, mediaId };
    });
  }

  function removeItemFromFolderWithBackend(folderId, mediaId, viewerId = currentUser.id) {
    return withBackendFallback(async () => {
      const data = await apiClient.request(`/folders/${encodeURIComponent(folderId)}/items/${encodeURIComponent(mediaId)}`, {
        method: "DELETE",
      }, {
        namespace: "folders",
        query: { viewerId },
      });
      return resolveRemoteEntity(data, null) ?? { ok: true };
    });
  }

  function followUserWithBackend(targetUserId, viewerId = currentUser.id) {
    return withBackendFallback(async () => {
      const data = await apiClient.request(`/profiles/${encodeURIComponent(targetUserId)}/follow`, {
        method: "POST",
        body: JSON.stringify({ viewerId }),
      }, { namespace: "profiles" });
      if (data?.status) return data;
      if (data?.user || data?.id) {
        return {
          status: "following",
          user: data.user ?? data,
        };
      }
      return { status: "following", userId: targetUserId };
    });
  }

  function unfollowUserWithBackend(targetUserId, viewerId = currentUser.id) {
    return withBackendFallback(async () => {
      const data = await apiClient.request(`/profiles/${encodeURIComponent(targetUserId)}/follow`, {
        method: "DELETE",
      }, {
        namespace: "profiles",
        query: { viewerId },
      });
      if (data?.status) return data;
      if (data?.user || data?.id) {
        return {
          status: "not-following",
          user: data.user ?? data,
        };
      }
      return { status: "not-following", userId: targetUserId };
    });
  }

  ensureState();

  window.MovieTrackerFolders = {
    currentUser,
    createFolder: createFolderWithBackend,
    deleteFolder: deleteFolderWithBackend,
    fetchFolderView,
    fetchLibraryFolders,
    fetchMediaItem,
    fetchOwnFolders,
    fetchProfileView,
    fetchPublicFoldersByOwner,
    fetchRecentMedia,
    followUser: followUserWithBackend,
    formatDate,
    getCreateFolderUrl,
    getFolderLimits,
    getFolderPageUrl,
    getProfileUrl,
    getProfileView,
    getFolderPublicUrl,
    getFolderView,
    getUser,
    listPublicFoldersByOwner,
    listFolderOptions,
    listLibraryFolders,
    listOwnFolders,
    listPublicFolders,
    moveItem,
    readState,
    removeItemFromFolder: removeItemFromFolderWithBackend,
    saveFolder: saveFolderWithBackend,
    searchMedia,
    searchMediaRemote,
    getRecentMedia,
    getMediaItem,
    unfollowUser: unfollowUserWithBackend,
    unsaveFolder: unsaveFolderWithBackend,
    upsertUser,
    updateFolder: updateFolderWithBackend,
    addItemToFolder: addItemToFolderWithBackend,
  };
})();
