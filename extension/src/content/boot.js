(() => {
  const runtime = globalThis.chrome?.runtime;
  if (!runtime?.getURL) {
    return;
  }

  import(runtime.getURL('src/content/main.js')).catch((error) => {
    // eslint-disable-next-line no-console
    console.warn('[movie-tracker] failed to load content module', error);
  });
})();
