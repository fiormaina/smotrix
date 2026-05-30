(() => {
  const routes = window.MovieTrackerRoutes;
  const { hasAuthenticatedSession } = window.MovieTrackerUI;
  const {
    createPrimaryTabs,
    renderAppFooter,
    renderAppHeader,
    renderBackLink,
  } = window.MovieTrackerAppShell;

  function createSupportTabs(activeSection = "") {
    if (typeof window.MovieTrackerAppShell.createSupportTabs === "function") {
      return window.MovieTrackerAppShell.createSupportTabs(activeSection);
    }

    return [
      {
        label: "О проекте",
        active: activeSection === "about",
        static: activeSection === "about",
        url: activeSection === "about" ? "" : routes.about,
      },
      {
        label: "Контакты",
        active: activeSection === "contacts",
        static: activeSection === "contacts",
        url: activeSection === "contacts" ? "" : routes.contacts,
      },
    ];
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
  }

  function getDisplaySiteUrl() {
    return String(window.MovieTrackerConfig?.appBaseUrl ?? window.location.origin).replace(/\/+$/, "");
  }

  function getPrivacyUrl() {
    return new URL(routes.privacy, window.location.origin).href;
  }

  function renderPageContent() {
    const siteUrl = getDisplaySiteUrl();
    const privacyUrl = getPrivacyUrl();

    return `
      <div class="info-page__content-stack">
        ${renderBackLink("info-page__back", "На главную", routes.home)}
        <section class="info-page__section" aria-label="Текст политики обработки персональных данных">
          <article class="info-card">
            <h3 class="info-card__title">Политика обработки персональных данных</h3>
            <div class="info-card__text">
              <p>Настоящая Политика определяет порядок обработки персональных данных пользователей платформы «Смотрикс», размещённого по адресу: <a class="info-card__link" href="${escapeHtml(siteUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(siteUrl)}</a>.</p>
              <p>Оператором персональных данных является Фомина Ирина Александровна. Связаться с Оператором можно по электронной почте: <a class="info-card__link" href="mailto:fomina.irina.tver@gmail.com">fomina.irina.tver@gmail.com</a>.</p>

              <div>
                <h4 class="info-card__section-title">1. Какие данные обрабатываются</h4>
                <p>Оператор может обрабатывать следующие данные пользователей: адрес электронной почты; данные профиля пользователя; пользовательские данные: история просмотров, оценки, комментарии, папки, подписки и сохранённые подборки; данные из браузерного расширения: название медиаконтента, сезон и серия, прогресс просмотра, ссылка на страницу просмотра.</p>
                <p>Браузерное расширение используется только для определения просматриваемого медиаконтента на поддерживаемых видеосервисах и передачи этих данных в аккаунт пользователя.</p>
              </div>

              <div>
                <h4 class="info-card__section-title">2. Цели обработки данных</h4>
                <p>Персональные данные обрабатываются для регистрации и авторизации пользователя; предоставления доступа к функциям веб-приложения; сохранения истории просмотров и прогресса просмотра; отображения пользовательских папок, оценок, комментариев и подборок; обеспечения работы браузерного расширения.</p>
              </div>

              <div>
                <h4 class="info-card__section-title">3. Правовые основания обработки</h4>
                <p>Обработка персональных данных осуществляется на основании согласия пользователя, а также в соответствии с Федеральным законом № 152-ФЗ «О персональных данных» и Федеральным законом № 149-ФЗ «Об информации, информационных технологиях и о защите информации».</p>
              </div>

              <div>
                <h4 class="info-card__section-title">4. Порядок обработки и хранения данных</h4>
                <p>Оператор осуществляет сбор, запись, систематизацию, хранение, использование, удаление и уничтожение персональных данных.</p>
                <p>Персональные данные хранятся не дольше, чем это необходимо для достижения целей обработки, либо до отзыва согласия пользователем.</p>
                <p>Оператор принимает необходимые организационные и технические меры для защиты персональных данных от неправомерного доступа, изменения, распространения или уничтожения.</p>
              </div>

              <div>
                <h4 class="info-card__section-title">5. Передача данных третьим лицам</h4>
                <p>Персональные данные не передаются третьим лицам, за исключением случаев, предусмотренных законодательством Российской Федерации, либо случаев, когда такая передача необходима для работы используемых технических сервисов.</p>
                <p>Сторонние сервисы, используемые для размещения сайта, хранения данных или получения информации о медиаконтенте, обрабатывают данные в соответствии со своими правилами и политиками конфиденциальности.</p>
              </div>

              <div>
                <h4 class="info-card__section-title">6. Права пользователя</h4>
                <p>Пользователь имеет право:</p>
                <ol class="info-card__list">
                  <li>получать информацию об обработке своих персональных данных;</li>
                  <li>требовать уточнения, блокирования или удаления персональных данных;</li>
                  <li>отозвать согласие на обработку персональных данных;</li>
                  <li>направить требование о прекращении обработки персональных данных.</li>
                </ol>
                <p>Для реализации этих прав пользователь может обратиться к Оператору по электронной почте: <a class="info-card__link" href="mailto:fomina.irina.tver@gmail.com">fomina.irina.tver@gmail.com</a>.</p>
              </div>

              <div>
                <h4 class="info-card__section-title">7. Заключительные положения</h4>
                <p>Актуальная версия Политики размещается по адресу: <a class="info-card__link" href="${escapeHtml(privacyUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(privacyUrl)}</a>.</p>
                <p>Оператор вправе изменять настоящую Политику. Новая редакция вступает в силу с момента её размещения на сайте.</p>
              </div>
            </div>
          </article>
        </section>

        ${renderAppFooter("2026")}
      </div>
    `;
  }

  function renderPage() {
    const hasSession = hasAuthenticatedSession();

    return `
      <div class="history-page info-page info-page--privacy">
        <h1 class="sr-only">Политика обработки персональных данных Смотрикс</h1>
        <div class="history-page__shell">
          ${hasSession ? renderAppHeader({
            tabs: createPrimaryTabs(),
            supportTabs: createSupportTabs(),
          }) : ""}
          <div class="history-page__content">
            ${renderPageContent()}
          </div>
        </div>
      </div>
    `;
  }

  function initPrivacyPage() {
    const rootElement = document.querySelector("#privacy-app");
    if (!rootElement) return;
    rootElement.innerHTML = renderPage();
  }

  initPrivacyPage();
})();
