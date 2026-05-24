// Detect the base path for deployments under a sub-path (e.g. HA ingress).
//
// `<base href="./">` in index.html causes document.baseURI to resolve to the
// directory of the document, regardless of which SPA route the server sent
// index.html for. So new URL('.', document.baseURI) always gives us the real
// mount point, even on hard-reload at /prefix/chores.
//
// In dev (Vite) and plain localhost:3000, this returns ''.
// Under HA ingress at /api/hassio_ingress/<token>/, this returns that prefix.
function detectBasePath(): string {
  const base = new URL(".", document.baseURI).pathname;
  // Strip trailing slash; keep '' for root.
  return base.endsWith("/") ? base.slice(0, -1) : base;
}

export const basePath: string = detectBasePath();
