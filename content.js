(function () {
  "use strict";

  if (window.__noctrlLoaded) return;
  window.__noctrlLoaded = true;

  const Shared = globalThis.NoCtrlShared;
  if (!Shared) return;

  // До завантаження збережених налаштувань діють значення за замовчуванням (захист увімкнено):
  // подія, що прийшла в перші мілісекунди життя сторінки, не має дійти до скриптів сайту.
  const settings = Shared.cloneDefaults();

  window.__noctrlSettings = settings;

  const activeBlockedCodes = new Set();
  let lastBlockedKeyTime = 0;

  function applyStoredSettings(stored) {
    if (!stored || typeof stored !== "object") return;
    Object.assign(settings, Shared.normalizeSettings({ ...settings, ...stored }));
  }

  try {
    if (window.top && window.top !== window && window.top.__noctrlSettings) {
      applyStoredSettings(window.top.__noctrlSettings);
    } else if (window.parent && window.parent !== window && window.parent.__noctrlSettings) {
      applyStoredSettings(window.parent.__noctrlSettings);
    }
  } catch {
    // Cross-origin frame
  }

  function loadSettings() {
    try {
      chrome.storage.local.get(Shared.SETTING_KEYS, (result) => {
        if (chrome.runtime.lastError) return;
        applyStoredSettings(result);
      });
    } catch {
      // Ignore if extension context is unavailable
    }
  }

  try {
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== "local") return;
      const patch = {};
      for (const key of Shared.SETTING_KEYS) {
        if (changes[key] && changes[key].newValue !== undefined) patch[key] = changes[key].newValue;
      }
      applyStoredSettings(patch);
    });
  } catch {
    // Ignore if storage API is unavailable
  }

  loadSettings();

  function getCurrentHost() {
    if (location.hostname) return location.hostname;
    try {
      if (window.top && window.top.location && window.top.location.hostname) {
        return window.top.location.hostname;
      }
    } catch {
      // Cross-origin frame
    }
    if (document.referrer) {
      try {
        return new URL(document.referrer).hostname;
      } catch {
        return "";
      }
    }
    return "";
  }

  function isActiveForCurrentHost() {
    if (!settings.enabled) return false;
    return !Shared.isHostDisabled(getCurrentHost(), settings.disabledHosts);
  }

  function notifyBlocked(label, eventType) {
    try {
      const result = chrome.runtime.sendMessage({
        type: "EVENT_BLOCKED",
        payload: {
          label,
          eventType,
          url: location.href
        }
      });
      if (result && typeof result.catch === "function") {
        result.catch(() => {});
      }
    } catch {
      // Extension context may be invalidated after extension reload
    }
  }

  const MODIFIER_CODES = new Set([
    "ControlLeft",
    "ControlRight",
    "ShiftLeft",
    "ShiftRight",
    "AltLeft",
    "AltRight",
    "MetaLeft",
    "MetaRight"
  ]);

  function isModifierCode(code) {
    return Boolean(code && MODIFIER_CODES.has(code));
  }

  function findMatchedShortcut(event) {
    const shortcuts = settings.shortcuts;
    if (!Array.isArray(shortcuts) || shortcuts.length === 0) return null;

    const ctrl = Boolean(event.ctrlKey);
    const alt = Boolean(event.altKey);
    const shift = Boolean(event.shiftKey);
    const meta = Boolean(event.metaKey);

    const modKeyPressed = isModifierCode(event.code);
    const effCtrl = ctrl || event.code === "ControlLeft" || event.code === "ControlRight";
    const effAlt = alt || event.code === "AltLeft" || event.code === "AltRight";
    const effShift = shift || event.code === "ShiftLeft" || event.code === "ShiftRight";
    const effMeta = meta || event.code === "MetaLeft" || event.code === "MetaRight";

    for (let i = 0; i < shortcuts.length; i++) {
      const s = shortcuts[i];
      if (!s || s.enabled === false) continue;

      if (!s.code && !s.key) {
        if (
          modKeyPressed &&
          Boolean(s.ctrl) === effCtrl &&
          Boolean(s.alt) === effAlt &&
          Boolean(s.shift) === effShift &&
          Boolean(s.meta) === effMeta
        ) {
          return s;
        }
        continue;
      }

      if (
        Boolean(s.ctrl) !== ctrl ||
        Boolean(s.alt) !== alt ||
        Boolean(s.shift) !== shift ||
        Boolean(s.meta) !== meta
      ) {
        continue;
      }

      if (s.code === "Enter" || s.code === "NumpadEnter") {
        if (
          event.code === "Enter" ||
          event.code === "NumpadEnter" ||
          event.key === "Enter" ||
          event.key === "\n" ||
          event.key === "\r" ||
          event.keyCode === 13 ||
          event.keyCode === 10
        ) {
          return s;
        }
      }

      if (s.code && event.code === s.code) {
        return s;
      }

      if (!s.code && s.key && typeof event.key === "string" && event.key.toLowerCase() === s.key.toLowerCase()) {
        return s;
      }
    }
    return null;
  }

  const handledEvents = new WeakSet();
  const hookedTargets = new WeakSet();
  const hookedWindowDocs = new WeakMap();
  const hookedIframes = new WeakSet();

  const BLOCKED_CLIPBOARD_INPUT_TYPES = new Set([
    "insertFromPaste",
    "insertFromPasteAsQuotation",
    "deleteByCut"
  ]);

  function handleKeyDown(event) {
    if (event.isTrusted === false || !isActiveForCurrentHost()) return;

    const match = findMatchedShortcut(event);
    if (!match) return;

    if (event.code) {
      activeBlockedCodes.add(event.code);
    }
    lastBlockedKeyTime = Date.now();

    event.stopImmediatePropagation();
    event.stopPropagation();

    if (!handledEvents.has(event)) {
      handledEvents.add(event);
      if (!event.repeat) {
        notifyBlocked(match.label || event.code || event.key, "keydown");
      }
    }
  }

  function handleKeyPress(event) {
    if (event.isTrusted === false || !isActiveForCurrentHost()) return;

    if ((event.code && activeBlockedCodes.has(event.code)) || findMatchedShortcut(event)) {
      event.stopImmediatePropagation();
      event.stopPropagation();
    }
  }

  function handleKeyUp(event) {
    const wasBlocked = Boolean(event.code && activeBlockedCodes.has(event.code));
    if (wasBlocked) {
      activeBlockedCodes.delete(event.code);
    }

    if (event.isTrusted === false || !isActiveForCurrentHost()) return;

    if (wasBlocked || findMatchedShortcut(event)) {
      lastBlockedKeyTime = Date.now();
      event.stopImmediatePropagation();
      event.stopPropagation();
    }
  }

  function handleClipboard(event) {
    if (event.isTrusted === false || !isActiveForCurrentHost() || !settings.protectClipboard) return;

    event.stopImmediatePropagation();
    event.stopPropagation();

    if (!handledEvents.has(event)) {
      handledEvents.add(event);
      notifyBlocked(event.type.toUpperCase(), "clipboard");
    }
  }

  function handleBeforeInput(event) {
    if (event.isTrusted === false || !isActiveForCurrentHost()) return;

    const inputType = String(event.inputType || "");
    const isClipboardInput = settings.protectClipboard && BLOCKED_CLIPBOARD_INPUT_TYPES.has(inputType);
    const isKeyInput = activeBlockedCodes.size > 0;

    if (!isClipboardInput && !isKeyInput) return;

    event.stopImmediatePropagation();
    event.stopPropagation();
  }

  function handleSelectStart(event) {
    if (event.isTrusted === false || !isActiveForCurrentHost() || !settings.protectClipboard) return;

    event.stopImmediatePropagation();
    event.stopPropagation();
  }

  function handleContextMenu(event) {
    if (event.isTrusted === false || !isActiveForCurrentHost() || !settings.protectContextMenu) return;

    event.stopImmediatePropagation();
    event.stopPropagation();

    if (!handledEvents.has(event)) {
      handledEvents.add(event);
      notifyBlocked("Context Menu (ПКМ)", "contextmenu");
    }
  }

  function handleRightMouseButton(event) {
    if (event.isTrusted === false || !isActiveForCurrentHost() || !settings.protectContextMenu) return;
    if (event.button !== 2) return;

    event.stopImmediatePropagation();
    event.stopPropagation();
  }

  function handleSelectionChange(event) {
    if (event.isTrusted === false || !isActiveForCurrentHost()) return;

    if (settings.protectSelection || activeBlockedCodes.size > 0 || Date.now() - lastBlockedKeyTime < 200) {
      event.stopImmediatePropagation();
      event.stopPropagation();
    }
  }

  /**
   * Подія стосується сторінки/вікна загалом, а не окремого елемента.
   * Фокус, blur і mouseenter/mouseleave окремих елементів потрібні самим сайтам
   * (поля вводу, редактори, hover-меню), тому їх не чіпаємо.
   */
  function isPageLevelTarget(target) {
    if (!target) return true;
    if (target === window || target === document) return true;
    return target === document.documentElement || target === document.body;
  }

  function handleFocusLoss(event) {
    if (event.type === "blur" && (!event.target || event.target === event.currentTarget)) {
      activeBlockedCodes.clear();
    }

    if (event.isTrusted === false || !isActiveForCurrentHost() || !settings.protectFocus) return;
    if (!isPageLevelTarget(event.target)) return;

    event.stopImmediatePropagation();
    event.stopPropagation();
  }

  function handleFrameInteraction(event) {
    const target = event.target;
    if (target && target.tagName === "IFRAME") {
      hookIframe(target);
    }
  }

  function attachListenersToTarget(target, isWindow, associatedDoc) {
    if (!target || typeof target.addEventListener !== "function") return;

    if (isWindow) {
      const docRef = associatedDoc || target.document || null;
      if (docRef) {
        if (hookedWindowDocs.get(target) === docRef) return;
        hookedWindowDocs.set(target, docRef);
      } else {
        if (hookedTargets.has(target)) return;
        hookedTargets.add(target);
      }
    } else {
      if (hookedTargets.has(target)) return;
      hookedTargets.add(target);
    }

    target.addEventListener("keydown", handleKeyDown, true);
    target.addEventListener("keypress", handleKeyPress, true);
    target.addEventListener("keyup", handleKeyUp, true);

    target.addEventListener("copy", handleClipboard, true);
    target.addEventListener("cut", handleClipboard, true);
    target.addEventListener("paste", handleClipboard, true);
    target.addEventListener("beforeinput", handleBeforeInput, true);
    target.addEventListener("input", handleBeforeInput, true);
    target.addEventListener("selectstart", handleSelectStart, true);

    target.addEventListener("contextmenu", handleContextMenu, true);
    target.addEventListener("mousedown", handleRightMouseButton, true);
    target.addEventListener("mouseup", handleRightMouseButton, true);
    target.addEventListener("auxclick", handleRightMouseButton, true);

    if (!isWindow) {
      target.addEventListener("focusin", handleFrameInteraction, true);
      target.addEventListener("pointerdown", handleFrameInteraction, true);
      target.addEventListener("mouseover", handleFrameInteraction, true);
    }

    target.addEventListener("selectionchange", handleSelectionChange, true);
    target.addEventListener("blur", handleFocusLoss, true);
    target.addEventListener("focusout", handleFocusLoss, true);
    target.addEventListener("focus", handleFocusLoss, true);
    target.addEventListener("focusin", handleFocusLoss, true);
    target.addEventListener("visibilitychange", handleFocusLoss, true);
    target.addEventListener("mouseleave", handleFocusLoss, true);
    target.addEventListener("mouseenter", handleFocusLoss, true);
  }

  function scanDocumentIframes(doc) {
    if (!doc || typeof doc.querySelectorAll !== "function") return;
    const frames = doc.querySelectorAll("iframe");
    for (let i = 0; i < frames.length; i++) {
      hookIframe(frames[i]);
    }
  }

  function hookIframe(iframe) {
    if (!iframe) return;
    if (!hookedIframes.has(iframe) && typeof iframe.addEventListener === "function") {
      hookedIframes.add(iframe);
      iframe.addEventListener("load", () => hookIframe(iframe), true);
    }

    try {
      const childWin = iframe.contentWindow;
      const childDoc = iframe.contentDocument;
      if (childWin) {
        childWin.__noctrlSettings = settings;
        if (!childWin.__noctrlLoaded) {
          attachListenersToTarget(childWin, true, childDoc);
        }
      }
      if (childDoc) {
        attachListenersToTarget(childDoc, false);
        scanDocumentIframes(childDoc);
      }
    } catch {
      // Cross-origin or sandboxed iframe: handled by Chrome's all_frames + match_origin_as_fallback
    }
  }

  attachListenersToTarget(window, true, typeof document !== "undefined" ? document : null);
  if (typeof document !== "undefined") {
    attachListenersToTarget(document, false);
    scanDocumentIframes(document);

    if (typeof MutationObserver === "function" && typeof document.addEventListener === "function") {
      const observer = new MutationObserver((mutations) => {
        for (let i = 0; i < mutations.length; i++) {
          const added = mutations[i].addedNodes;
          for (let j = 0; j < added.length; j++) {
            const node = added[j];
            if (!node || node.nodeType !== 1) continue;
            if (node.tagName === "IFRAME") {
              hookIframe(node);
            } else if (typeof node.querySelectorAll === "function") {
              const nested = node.querySelectorAll("iframe");
              for (let k = 0; k < nested.length; k++) {
                hookIframe(nested[k]);
              }
            }
          }
        }
      });
      try {
        observer.observe(document, { childList: true, subtree: true });
      } catch {
        // Ignore if document is not observable yet
      }
    }
  }
})();
