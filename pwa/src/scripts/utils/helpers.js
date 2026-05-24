(() => {
  function pluralizeRu(count, forms) {
    const safeCount = Math.abs(Number(count) || 0);
    const lastDigit = safeCount % 10;
    const lastTwoDigits = safeCount % 100;

    if (lastTwoDigits >= 11 && lastTwoDigits <= 14) return forms.many;
    if (lastDigit === 1) return forms.one;
    if (lastDigit >= 2 && lastDigit <= 4) return forms.few;
    return forms.many;
  }

  function createToastController(setState, selectToasts = (state) => state.toasts) {
    let toastId = 0;

    return function showToast(message, type = "success", duration = 3200) {
      const id = `toast-${++toastId}`;

      setState((currentState) => ({
        ...currentState,
        toasts: [...selectToasts(currentState), { id, message, type }],
      }));

      window.setTimeout(() => {
        setState((currentState) => ({
          ...currentState,
          toasts: selectToasts(currentState).filter((toast) => toast.id !== id),
        }));
      }, duration);
    };
  }

  function getContinueUrl(item) {
    if (!item || typeof item !== "object") return "";

    const candidateKeys = [
      "continueUrl",
      "continue_url",
      "watchUrl",
      "watch_url",
      "sourceUrl",
      "source_url",
      "url",
    ];

    for (const key of candidateKeys) {
      const value = item[key];
      if (typeof value === "string" && value.trim()) {
        return value.trim();
      }
    }

    return "";
  }

  function resolveContinueUrl(item) {
    const continueUrl = getContinueUrl(item);
    if (!continueUrl) {
      return {
        ok: false,
        reason: "missing",
        message: "Ссылка на просмотр недоступна. Обновите запись или запустите просмотр снова.",
      };
    }

    try {
      const resolvedUrl = new URL(continueUrl, window.location.href);
      if (!["http:", "https:"].includes(resolvedUrl.protocol)) {
        return {
          ok: false,
          reason: "invalid",
          message: "Не удалось открыть ссылку на просмотр. Проверьте запись и попробуйте снова.",
        };
      }

      return {
        ok: true,
        href: resolvedUrl.href,
      };
    } catch (error) {
      return {
        ok: false,
        reason: "invalid",
        message: "Не удалось открыть ссылку на просмотр. Проверьте запись и попробуйте снова.",
      };
    }
  }

  function openContinueUrl(item) {
    const continueTarget = resolveContinueUrl(item);
    if (!continueTarget.ok) return continueTarget;

    const openedWindow = typeof window.open === "function"
      ? window.open(continueTarget.href, "_blank", "noopener,noreferrer")
      : null;

    if (!openedWindow) {
      window.location.assign(continueTarget.href);
    }

    return continueTarget;
  }

  window.MovieTrackerHelpers = {
    createToastController,
    getContinueUrl,
    openContinueUrl,
    pluralizeRu,
    resolveContinueUrl,
  };
})();
