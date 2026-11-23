/**
 * Спільний код для content script, service worker і popup.
 * Підключається першим: <script src="shared.js">, importScripts("shared.js")
 * або перед content.js у manifest.json.
 */
(function (root) {
  "use strict";

  const DEFAULT_SETTINGS = Object.freeze({
    enabled: true,
    disabledHosts: [],
    protectClipboard: true,
    protectContextMenu: true,
    // Події втрати фокусу на рівні сторінки: window/document blur, focus, visibilitychange, mouseleave.
    protectFocus: true,
    // selectionchange (ламає rich-text редактори, тому вимкнено за замовчуванням).
    protectSelection: false,
    shortcuts: [
      { id: "ctrl+c", ctrl: true, alt: false, shift: false, meta: false, code: "KeyC", label: "Ctrl + C", enabled: true },
      { id: "ctrl+v", ctrl: true, alt: false, shift: false, meta: false, code: "KeyV", label: "Ctrl + V", enabled: true },
      { id: "ctrl+x", ctrl: true, alt: false, shift: false, meta: false, code: "KeyX", label: "Ctrl + X", enabled: true },
      { id: "ctrl+a", ctrl: true, alt: false, shift: false, meta: false, code: "KeyA", label: "Ctrl + A", enabled: true },
      { id: "ctrl+f", ctrl: true, alt: false, shift: false, meta: false, code: "KeyF", label: "Ctrl + F", enabled: true },
      { id: "ctrl+shift+i", ctrl: true, alt: false, shift: true, meta: false, code: "KeyI", label: "Ctrl + Shift + I", enabled: true },
      { id: "f12", ctrl: false, alt: false, shift: false, meta: false, code: "F12", label: "F12", enabled: true }
    ]
  });

  const BOOLEAN_KEYS = ["enabled", "protectClipboard", "protectContextMenu", "protectFocus", "protectSelection"];
  const SETTING_KEYS = Object.keys(DEFAULT_SETTINGS);

  function cloneDefaults() {
    return {
      ...DEFAULT_SETTINGS,
      disabledHosts: [],
      shortcuts: DEFAULT_SETTINGS.shortcuts.map((s) => ({ ...s }))
    };
  }

  /** Приводить дані зі сховища до повного коректного об'єкта налаштувань. */
  function normalizeSettings(stored) {
    const result = cloneDefaults();
    if (!stored || typeof stored !== "object") return result;
    for (const key of BOOLEAN_KEYS) {
      if (typeof stored[key] === "boolean") result[key] = stored[key];
    }
    if (Array.isArray(stored.disabledHosts)) {
      result.disabledHosts = stored.disabledHosts.filter((h) => typeof h === "string" && h);
    }
    if (Array.isArray(stored.shortcuts)) {
      result.shortcuts = stored.shortcuts;
    }
    return result;
  }

  function normalizeHost(host) {
    return String(host || "").trim().toLowerCase().replace(/\.$/, "");
  }

  /** true, якщо `host` дорівнює `entry` або є його піддоменом (www.example.com ⊂ example.com). */
  function hostMatchesEntry(host, entry) {
    const h = normalizeHost(host);
    const e = normalizeHost(entry);
    if (!h || !e) return false;
    return h === e || h.endsWith("." + e);
  }

  function isHostDisabled(host, disabledHosts) {
    if (!Array.isArray(disabledHosts)) return false;
    return disabledHosts.some((entry) => hostMatchesEntry(host, entry));
  }

  /** Список без записів, що покривають `host`. */
  function removeHost(disabledHosts, host) {
    return (Array.isArray(disabledHosts) ? disabledHosts : []).filter((entry) => !hostMatchesEntry(host, entry));
  }

  /** Список із доданим `host` (без дублікатів). */
  function addHost(disabledHosts, host) {
    const list = Array.isArray(disabledHosts) ? disabledHosts : [];
    const h = normalizeHost(host);
    if (!h || isHostDisabled(h, list)) return list.slice();
    return [...list, h];
  }

  root.NoCtrlShared = Object.freeze({
    DEFAULT_SETTINGS,
    SETTING_KEYS,
    cloneDefaults,
    normalizeSettings,
    normalizeHost,
    hostMatchesEntry,
    isHostDisabled,
    removeHost,
    addHost
  });
})(typeof globalThis !== "undefined" ? globalThis : self);
