
// Ensure runtime public path for webpack/vite assets under subpath.
(function () {
  var base = "/project-management";
  if (typeof window !== "undefined") {
    window.__MIXINARY_BASE_PATH__ = base;
  }
  if (typeof __webpack_public_path__ !== "undefined") {
    // eslint-disable-next-line no-undef
    __webpack_public_path__ = base + "/";
  }
})();
