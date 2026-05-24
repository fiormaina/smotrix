(() => {
  const { escapeHtml } = window.MovieTrackerUI;

  function renderOwnerBlock(folder) {
    if (folder.isOwner || !String(folder.ownerName ?? "").trim()) return "";

    return `
      <div class="folder-card__owner">
        <span class="folder-card__avatar" aria-hidden="true">
          <svg width="14" height="14" viewBox="0 0 20 20" fill="none">
            <circle cx="10" cy="7" r="4" fill="currentColor"></circle>
            <path d="M2 18c0-4 3.6-7 8-7s8 3 8 7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"></path>
          </svg>
        </span>
        <span>${escapeHtml(folder.ownerName)}</span>
      </div>
    `;
  }

  function renderLibraryFolderCard(folder, options = {}) {
    const copyTooltip = "Копировать ссылку";
    const deleteTooltip = folder.isOwner ? "Удалить" : "Удалить из сохраненных";
    const countText = options.countText ?? "";
    const canRemoveFolder = !folder.isOwner || folder.canDelete !== false;
    const deleteActionMarkup = canRemoveFolder
      ? `
            <div class="folder-card__action">
              <span class="folder-card__tooltip">${deleteTooltip}</span>
              <button class="folder-card__icon-button folder-card__icon-button--danger" type="button" data-action="delete-folder" data-id="${folder.id}" aria-label="${deleteTooltip}">
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
                  <path d="M4.2 5.6H13.8" stroke="currentColor" stroke-width="1.55" stroke-linecap="round"></path>
                  <path d="M7.2 3.8H10.8M6 5.6L6.45 14.1C6.49 14.73 7 15.2 7.63 15.2H10.37C11 15.2 11.51 14.73 11.55 14.1L12 5.6" stroke="currentColor" stroke-width="1.55" stroke-linecap="round" stroke-linejoin="round"></path>
                </svg>
              </button>
            </div>
          `
      : "";

    return `
      <article
        class="folder-card"
        tabindex="0"
        role="link"
        data-folder-card="${folder.id}"
        aria-label="Открыть папку ${escapeHtml(folder.title)}"
      >
        <div class="folder-card__top">
          <div class="folder-card__posters" aria-hidden="true">
            <span class="folder-card__poster"></span>
            <span class="folder-card__poster"></span>
            <span class="folder-card__poster"></span>
            <span class="folder-card__poster"></span>
          </div>
          <div class="folder-card__actions">
            <div class="folder-card__action">
              <span class="folder-card__tooltip">${copyTooltip}</span>
              <button class="folder-card__icon-button" type="button" data-action="copy-link" data-id="${folder.id}" aria-label="${copyTooltip}">
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
                  <path d="M7.4 10.6C6.25 9.45 6.25 7.6 7.4 6.45L9.65 4.2C10.8 3.05 12.65 3.05 13.8 4.2C14.95 5.35 14.95 7.2 13.8 8.35L12.78 9.37" stroke="currentColor" stroke-width="1.55" stroke-linecap="round"></path>
                  <path d="M10.6 7.4C11.75 8.55 11.75 10.4 10.6 11.55L8.35 13.8C7.2 14.95 5.35 14.95 4.2 13.8C3.05 12.65 3.05 10.8 4.2 9.65L5.22 8.63" stroke="currentColor" stroke-width="1.55" stroke-linecap="round"></path>
                </svg>
              </button>
            </div>
            ${deleteActionMarkup}
          </div>
        </div>
        <div class="folder-card__body">
          ${renderOwnerBlock(folder)}
          <h3 class="folder-card__title">${escapeHtml(folder.title)}</h3>
          <p class="folder-card__count">${countText}</p>
        </div>
      </article>
    `;
  }

  function renderProfileFolderCard(folder, actionMarkup = "") {
    const countText = folder.countText ?? escapeHtml(String(folder.count));

    return `
      <article
        class="folder-card profile-public-card"
        tabindex="0"
        role="link"
        data-folder-card="${escapeHtml(folder.id)}"
        aria-label="Открыть папку ${escapeHtml(folder.title)}"
      >
        <div class="folder-card__top">
          <div class="profile-public-card__preview" aria-hidden="true">
            ${folder.posters
              .map(
                ([start, end]) => `
                  <span class="profile-public-card__poster" style="--poster-start: ${start}; --poster-end: ${end}"></span>
                `,
              )
              .join("")}
          </div>
          <div class="folder-card__actions">
            <div class="folder-card__action">
              <span class="folder-card__tooltip">Копировать ссылку</span>
              <button class="folder-card__icon-button" type="button" data-action="copy-folder-link" data-id="${escapeHtml(folder.id)}" aria-label="Копировать ссылку">
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
                  <path d="M7.4 10.6C6.25 9.45 6.25 7.6 7.4 6.45L9.65 4.2C10.8 3.05 12.65 3.05 13.8 4.2C14.95 5.35 14.95 7.2 13.8 8.35L12.78 9.37" stroke="currentColor" stroke-width="1.55" stroke-linecap="round"></path>
                  <path d="M10.6 7.4C11.75 8.55 11.75 10.4 10.6 11.55L8.35 13.8C7.2 14.95 5.35 14.95 4.2 13.8C3.05 12.65 3.05 10.8 4.2 9.65L5.22 8.63" stroke="currentColor" stroke-width="1.55" stroke-linecap="round"></path>
                </svg>
              </button>
            </div>
          </div>
        </div>
        <div class="folder-card__body">
          <h3 class="folder-card__title">${escapeHtml(folder.title)}</h3>
          <p class="profile-public-card__count">${countText}</p>
          ${actionMarkup ? `<div class="profile-public-card__actions">${actionMarkup}</div>` : ""}
        </div>
      </article>
    `;
  }

  window.MovieTrackerFolderCard = {
    renderLibraryFolderCard,
    renderProfileFolderCard,
  };
})();
