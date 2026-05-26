/**
 * Общая очистка document.title для онлайн-кинотеатров.
 * Срезает хвосты с метаданными и промо-текстом, не трогая запятые внутри названия:
 * хвосты матчатся только с конца строки ($) или по фиксированным шаблонам.
 */

function normalizeSpaces(s) {
  return String(s || '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** NFKC + типичные «невидимые» варианты пробелов/скобок из document.title */
function normalizeTitleUnicode(s) {
  let t = String(s || '');
  if (typeof t.normalize === 'function') {
    t = t.normalize('NFKC');
  }
  return t
    .replace(/\u00A0/g, ' ')
    .replace(/[\u2000-\u200A\u202F\u205F\u3000]/g, ' ')
    .replace(/[\u200E\u200F\uFEFF]/g, '');
}

/** « — смотреть онлайн … — Кинопоиск » и варианты с тире */
function stripKinopoiskTrailer(t) {
  return t.replace(
    /\s*[—–-]\s*смотреть онлайн в хорошем качестве\s*[—–-]\s*Кинопоиск\s*$/i,
    ''
  );
}

/** VIJU: « (фильм|сериал, …) смотреть онлайн … » */
function stripVijuTrailer(t) {
  return t.replace(
    /\s*\((?:фильм|сериал),\s*\d{4}(?:\s*,\s*\d+\s*сезон)?\)\s*смотреть онлайн.*$/i,
    ''
  );
}

/**
 * PREMIER.ONE: «(2026, фильм) смотреть в хорошем качестве онлайн на сайте PREMIER.ONE»
 * и SEO: «Смотреть сериал|мультфильм|шоу …», хвост «N сезон M серия … PREMIER.ONE».
 */
function stripPremierTitle(t) {
  t = t.replace(
    /\s*\((19|20)\d{2},\s*(?:фильм|мультфильм|сериал)\)\s*смотреть в хорошем качестве онлайн на сайте PREMIER\.ONE\s*$/giu,
    ''
  );
  t = t.replace(
    /\s+\d+\s+сезон\s+\d+\s+серия\s+в хорошем качестве онлайн на сайте PREMIER\.ONE\s*$/giu,
    ''
  );
  t = t.replace(
    /^Смотреть\s+(?:сериал|мультфильм|мультсериал|шоу)\s+/giu,
    ''
  );
  return t;
}

/** KION: «Название Сезон N | Серия M» в конце title */
function stripKionTitle(t) {
  return t.replace(/\s+сезон\s+\d+\s*\|\s*серия\s+\d+\s*$/giu, '');
}

/**
 * Wink: «Плеер фильм … (2026) смотреть видео онлайн»,
 * «Плеер сериал … серия N (сезон M, YYYY) смотреть … Wink».
 */
function stripWinkTitle(t) {
  t = t.replace(/^Плеер\s+сериал\s+/giu, '');
  t = t.replace(
    /\s+серия\s+\d+\s*\(\s*сезон\s+\d+\s*,\s*(19|20)\d{2}\)\s*смотреть онлайн в хорошем качестве в онлайн-сервисе Wink\s*$/giu,
    ''
  );
  t = t.replace(/^Плеер\s+фильм\s+/giu, '');
  t = t.replace(/\s*\((19|20)\d{2}\)\s*смотреть видео онлайн\s*$/giu, '');
  return t;
}

/**
 * IVI:
 * «Фильм Название (2025) смотреть онлайн в хорошем HD качестве»
 * «Мультфильм Название (1955) смотреть онлайн бесплатно в хорошем HD качестве»
 * «Шоу Название 25 сезон 3 серия смотреть онлайн бесплатно в хорошем HD качестве»
 * «Сериал Название смотреть онлайн все серии подряд в хорошем HD качестве»
 */
function stripIviTitle(t) {
  t = t.replace(/^(?:Фильм|Сериал|Шоу|Мультфильм)\s+/iu, '');
  t = t.replace(
    /\s+\d+\s+сезон\s+\d+\s+серия\s+смотреть онлайн(?: бесплатно)? в хорошем HD качестве\s*$/iu,
    ''
  );
  t = t.replace(
    /\s*смотреть онлайн все серии подряд(?: бесплатно)? в хорошем HD качестве\s*$/iu,
    ''
  );
  t = t.replace(
    /\s*\((19|20)\d{2}\)\s*смотреть онлайн(?: бесплатно)? в хорошем HD качестве\s*$/iu,
    ''
  );
  return t;
}

/**
 * Amediateka:
 * «Фильм Название (2004) смотреть онлайн в хорошем качестве»
 * «Сериал Название (2026) смотреть онлайн»
 */
function stripAmediatekaTitle(t) {
  t = t.replace(/^(?:Фильм|Сериал)\s+/iu, '');
  t = t.replace(
    /\s*\((19|20)\d{2}\)\s*смотреть онлайн(?: в хорошем качестве)?\s*$/iu,
    ''
  );
  return t;
}

/**
 * Хвост «, 2025, США» / «, 2018, Великобритания» только в самом конце строки
 * (год + запятая + страна до конца).
 */
function stripTrailingYearCountry(t) {
  return t.replace(/,\s*(19|20)\d{2}\s*,\s*.+$/u, '');
}

/**
 * Хвост «(сериал / мультсериал, …)» в конце title.
 * Не полагаемся на точное совпадение регэкспа с document.title: там бывают другие пробелы/Unicode.
 * Снимаем самую последнюю пару скобок без вложенных «( )», если внутри — метка сериала Кинопоиска.
 */
function looksLikeKinopoiskSeriesParenInner(inner) {
  const x = String(inner || '').toLowerCase();
  if (!x.includes('сериал')) return false;
  if (!x.includes('сезон') && !x.includes('серии') && !x.includes('серия')) return false;
  return true;
}

function stripKinopoiskSeriesParen(t) {
  let s = t;
  for (let i = 0; i < 3; i += 1) {
    const m = s.match(/^(.*)\s*\(([^()]*)\)\s*$/su);
    if (!m) break;
    if (!looksLikeKinopoiskSeriesParenInner(m[2])) break;
    s = m[1].trimEnd();
  }
  return s;
}

/** Оставшийся хвост «, 2018» / «, 2016-2017» после скобок */
function stripTrailingYearOnly(t) {
  return t.replace(/,\s*(19|20)\d{2}(?:\s*[-–—]\s*(19|20)\d{2})?\s*$/u, '');
}

/** Обрезка по « | сайт » / « • … » в конце (частый SEO-хвост) */
function stripTrailingSitePipe(t) {
  return t.replace(/\s*[|•·]\s*.+$/, '').trim();
}

/**
 * @param {string} raw
 * @returns {string}
 */
export function cleanWatchTitle(raw) {
  let t = normalizeSpaces(normalizeTitleUnicode(raw));

  t = stripKinopoiskTrailer(t);
  t = stripVijuTrailer(t);
  t = stripKinopoiskTrailer(t);
  t = stripPremierTitle(t);

  // Сначала «, 2025, США» и «, 2018» в конце: у сериалов КП после скобок идёт год
  // «…(сериал, …), 2018», иначе stripKinopoiskSeriesParen не видит строку, оканчивающуюся на «)».
  t = stripTrailingYearCountry(t);
  t = stripTrailingYearOnly(t);
  t = stripKinopoiskSeriesParen(t);
  t = stripTrailingYearOnly(t);

  t = stripKionTitle(t);
  t = stripAmediatekaTitle(t);
  t = stripIviTitle(t);
  t = stripWinkTitle(t);
  t = stripTrailingSitePipe(t);
  return normalizeSpaces(t);
}
