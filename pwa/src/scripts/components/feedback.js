(() => {
  const { escapeHtml } = window.MovieTrackerUI;

  function renderEmptyMessage(className, title, text) {
    return `
      <section class="${className}" aria-live="polite">
        <strong>${escapeHtml(title)}</strong>
        ${escapeHtml(text)}
      </section>
    `;
  }

  function renderPageState({
    className,
    title,
    text,
    actionLabel = "",
    action = "",
    actionUrl = "",
    buttonClass = "profile-button profile-button--primary",
  }) {
    const actionMarkup = actionLabel
      ? actionUrl
        ? `<button class="${buttonClass}" type="button" data-nav-url="${escapeHtml(actionUrl)}">${escapeHtml(actionLabel)}</button>`
        : `<button class="${buttonClass}" type="button" data-action="${escapeHtml(action)}">${escapeHtml(actionLabel)}</button>`
      : "";

    return `
      <section class="${className}" aria-live="polite">
        <strong>${escapeHtml(title)}</strong>
        <p>${escapeHtml(text)}</p>
        ${actionMarkup}
      </section>
    `;
  }

  window.MovieTrackerFeedback = {
    renderEmptyMessage,
    renderPageState,
  };
})();
