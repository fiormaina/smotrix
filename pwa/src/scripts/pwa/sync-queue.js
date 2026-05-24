(() => {
  const STORAGE_KEY = "movieTracker.syncQueue.v1";
  const handlers = new Map();

  function readQueue() {
    try {
      const rawValue = window.localStorage.getItem(STORAGE_KEY);
      const parsedValue = rawValue ? JSON.parse(rawValue) : [];
      return Array.isArray(parsedValue) ? parsedValue : [];
    } catch (error) {
      console.warn(error);
      return [];
    }
  }

  function writeQueue(queue) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
    emitChange(queue);
  }

  function emitChange(queue = readQueue()) {
    window.dispatchEvent(
      new CustomEvent("movie-tracker:sync-queue-change", {
        detail: {
          pendingCount: queue.length,
          queue,
        },
      }),
    );
  }

  function createQueueItem(operation = {}) {
    return {
      id: operation.id ?? `sync-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      type: String(operation.type ?? "").trim(),
      payload: operation.payload ?? {},
      createdAt: operation.createdAt ?? new Date().toISOString(),
      attempts: Number(operation.attempts ?? 0),
      lastError: operation.lastError ?? "",
    };
  }

  function list() {
    return readQueue().map((item) => ({ ...item, payload: { ...(item.payload ?? {}) } }));
  }

  function enqueue(operation) {
    const queueItem = createQueueItem(operation);
    if (!queueItem.type) {
      throw new Error("Queue item type is required");
    }

    const queue = readQueue();
    queue.push(queueItem);
    writeQueue(queue);
    return queueItem;
  }

  function clear() {
    writeQueue([]);
  }

  function registerHandler(type, handler) {
    const normalizedType = String(type ?? "").trim();
    if (!normalizedType || typeof handler !== "function") return;
    handlers.set(normalizedType, handler);
  }

  async function flush() {
    const networkState = window.MovieTrackerNetwork?.getState?.();
    if (networkState?.mode && networkState.mode !== "online") {
      return {
        flushed: 0,
        skipped: list().length,
      };
    }

    const queue = readQueue();
    if (!queue.length) {
      return {
        flushed: 0,
        skipped: 0,
      };
    }

    const nextQueue = [];
    let flushed = 0;

    for (const queueItem of queue) {
      const handler = handlers.get(queueItem.type);
      if (!handler) {
        nextQueue.push(queueItem);
        continue;
      }

      try {
        await handler({
          ...queueItem,
          payload: { ...(queueItem.payload ?? {}) },
        });
        flushed += 1;
      } catch (error) {
        nextQueue.push({
          ...queueItem,
          attempts: Number(queueItem.attempts ?? 0) + 1,
          lastError: error?.message ?? "Sync failed",
        });
      }
    }

    writeQueue(nextQueue);

    return {
      flushed,
      skipped: nextQueue.length,
    };
  }

  if (window.MovieTrackerNetwork?.subscribe) {
    window.MovieTrackerNetwork.subscribe((networkState) => {
      if (networkState.mode === "online") {
        flush().catch((error) => console.error(error));
      }
    }, { emitImmediately: false });
  }

  window.MovieTrackerSyncQueue = Object.freeze({
    clear,
    enqueue,
    flush,
    list,
    registerHandler,
  });
})();
