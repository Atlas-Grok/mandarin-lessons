/**
 * E-ink reading mode: persistence, URL override, toggle UI, pinyin NFC.
 * Browser: MandarinEink. Node/tests: module.exports.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.MandarinEink = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var STORAGE_KEY = "mandarin-eink-mode";
  var EINK_CLASS = "eink-mode";

  function parseEinkParam(search) {
    var raw = new URLSearchParams(search == null ? "" : search).get("eink");
    if (raw === "1" || raw === "true") return true;
    if (raw === "0" || raw === "false") return false;
    return null;
  }

  function readStored() {
    try {
      return localStorage.getItem(STORAGE_KEY) === "1";
    } catch (e) {
      return false;
    }
  }

  /**
   * @param {string} [search] location.search
   * @param {boolean|undefined} stored optional stored value (for tests)
   */
  function resolveEnabled(search, stored) {
    var fromUrl = parseEinkParam(search);
    if (fromUrl !== null) return fromUrl;
    if (stored !== undefined) return !!stored;
    return readStored();
  }

  function writeStored(enabled) {
    try {
      localStorage.setItem(STORAGE_KEY, enabled ? "1" : "0");
    } catch (e) { /* private mode */ }
  }

  function applyToRoot(enabled, root) {
    root = root || (typeof document !== "undefined" ? document.documentElement : null);
    if (!root || !root.classList) return;
    root.classList.toggle(EINK_CLASS, !!enabled);
    if (typeof document !== "undefined") {
      try {
        document.dispatchEvent(new CustomEvent("mandarin-eink-change", { detail: { enabled: !!enabled } }));
      } catch (e) { /* old browsers */ }
    }
  }

  function normalizeNfc(s) {
    if (s == null) return "";
    return String(s).normalize("NFC");
  }

  function syncFromUrl(search) {
    var fromUrl = parseEinkParam(search);
    if (fromUrl !== null) writeStored(fromUrl);
    return resolveEnabled(search);
  }

  function bindToggleInput(input, getPeer) {
    if (!input || input.__einkBound) return;
    input.__einkBound = true;
    input.addEventListener("change", function () {
      var on = !!input.checked;
      writeStored(on);
      applyToRoot(on);
      input.setAttribute("aria-checked", on ? "true" : "false");
      var peer = getPeer ? getPeer() : null;
      if (peer && peer !== input) {
        peer.checked = on;
        peer.setAttribute("aria-checked", on ? "true" : "false");
      }
    });
  }

  function init(opts) {
    opts = opts || {};
    var enabled = syncFromUrl(
      opts.search != null ? opts.search : (typeof location !== "undefined" ? location.search : "")
    );
    applyToRoot(enabled);
    if (typeof document === "undefined") return enabled;
    var main = opts.toggleEl || document.getElementById("eink-toggle");
    var lock = document.getElementById("eink-toggle-lock");
    [main, lock].forEach(function (input) {
      if (!input) return;
      input.checked = enabled;
      input.setAttribute("aria-checked", enabled ? "true" : "false");
    });
    bindToggleInput(main, function () { return lock; });
    bindToggleInput(lock, function () { return main; });
    return enabled;
  }

  return {
    STORAGE_KEY: STORAGE_KEY,
    EINK_CLASS: EINK_CLASS,
    parseEinkParam: parseEinkParam,
    resolveEnabled: resolveEnabled,
    readStored: readStored,
    writeStored: writeStored,
    applyToRoot: applyToRoot,
    normalizeNfc: normalizeNfc,
    syncFromUrl: syncFromUrl,
    init: init
  };
});