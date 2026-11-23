(function () {
  "use strict";

  const DEFAULT_SETTINGS = {
    enabled: true,
    disabledHosts: [],
    protectClipboard: true,
    protectContextMenu: true,
    protectFocus: true,
    shortcuts: [
      { id: "ctrl+c", ctrl: true, alt: false, shift: false, meta: false, code: "KeyC", label: "Ctrl + C", enabled: true },
      { id: "ctrl+v", ctrl: true, alt: false, shift: false, meta: false, code: "KeyV", label: "Ctrl + V", enabled: true },
      { id: "ctrl+x", ctrl: true, alt: false, shift: false, meta: false, code: "KeyX", label: "Ctrl + X", enabled: true },
      { id: "ctrl+a", ctrl: true, alt: false, shift: false, meta: false, code: "KeyA", label: "Ctrl + A", enabled: true },
      { id: "ctrl+f", ctrl: true, alt: false, shift: false, meta: false, code: "KeyF", label: "Ctrl + F", enabled: true },
      { id: "ctrl+shift+i", ctrl: true, alt: false, shift: true, meta: false, code: "KeyI", label: "Ctrl + Shift + I", enabled: true },
      { id: "f12", ctrl: false, alt: false, shift: false, meta: false, code: "F12", label: "F12", enabled: true }
    ]
  };

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

  const CODE_LABELS = {
    Space: "Space",
    Escape: "Esc",
    Enter: "Enter",
    NumpadEnter: "Num Enter",
    Tab: "Tab",
    Backspace: "Backspace",
    Delete: "Delete",
    Insert: "Insert",
    Home: "Home",
    End: "End",
    PageUp: "PgUp",
    PageDown: "PgDn",
    ArrowUp: "↑",
    ArrowDown: "↓",
    ArrowLeft: "←",
    ArrowRight: "→",
    Backquote: "`",
    Minus: "-",
    Equal: "=",
    BracketLeft: "[",
    BracketRight: "]",
    Backslash: "\\",
    Semicolon: ";",
    Quote: "'",
    Comma: ",",
    Period: ".",
    Slash: "/",
    PrintScreen: "PrtSc",
    ContextMenu: "Menu",
    CapsLock: "CapsLock",
    Pause: "Pause"
  };

  const els = {
    globalToggle: document.getElementById("globalToggle"),
    globalBadge: document.getElementById("globalBadge"),
    siteDot: document.getElementById("siteDot"),
    siteHost: document.getElementById("siteHost"),
    siteToggleBtn: document.getElementById("siteToggleBtn"),
    fileNotice: document.getElementById("fileNotice"),
    recorderBtn: document.getElementById("recorderBtn"),
    cancelRecordBtn: document.getElementById("cancelRecordBtn"),
    addShortcutBtn: document.getElementById("addShortcutBtn"),
    manualBuilder: document.getElementById("manualBuilder"),
    manualKeySelect: document.getElementById("manualKeySelect"),
    recorderHint: document.getElementById("recorderHint"),
    shortcutCount: document.getElementById("shortcutCount"),
    resetDefaultsBtn: document.getElementById("resetDefaultsBtn"),
    clearAllBtn: document.getElementById("clearAllBtn"),
    shortcutsList: document.getElementById("shortcutsList"),
    shortcutsEmpty: document.getElementById("shortcutsEmpty"),
    clipboardToggle: document.getElementById("clipboardToggle"),
    contextMenuToggle: document.getElementById("contextMenuToggle"),
    focusToggle: document.getElementById("focusToggle"),
    blockedCount: document.getElementById("blockedCount"),
    clearLogBtn: document.getElementById("clearLogBtn"),
    blockedLog: document.getElementById("blockedLog"),
    logEmpty: document.getElementById("logEmpty")
  };

  const modPills = Array.from(document.querySelectorAll(".mod-pill"));

  let settings = structuredClone(DEFAULT_SETTINGS);
  let currentTabId = null;
  let currentHost = "";
  let currentProtocol = "";
  let isRecording = false;
  let pendingShortcut = null;
  let recordedMods = { ctrl: false, alt: false, shift: false, meta: false };
  let statsTimer = null;

  function populateManualKeySelect() {
    const groups = [
      {
        label: "Літери",
        codes: Array.from({ length: 26 }, (_, i) => "Key" + String.fromCharCode(65 + i))
      },
      {
        label: "Цифри",
        codes: Array.from({ length: 10 }, (_, i) => "Digit" + i)
      },
      {
        label: "Функціональні",
        codes: Array.from({ length: 12 }, (_, i) => "F" + (i + 1))
      },
      {
        label: "Інші клавіші",
        codes: [
          "Escape", "Space", "Enter", "NumpadEnter", "Tab", "Backspace", "Delete", "Insert",
          "Home", "End", "PageUp", "PageDown",
          "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight",
          "Backquote", "Minus", "Equal", "BracketLeft", "BracketRight",
          "Backslash", "Semicolon", "Quote", "Comma", "Period", "Slash",
          "PrintScreen", "ContextMenu", "CapsLock", "Pause"
        ]
      }
    ];

    for (const group of groups) {
      const optgroup = document.createElement("optgroup");
      optgroup.label = group.label;
      for (const code of group.codes) {
        const option = document.createElement("option");
        option.value = code;
        option.textContent = formatCodeName(code, "");
        optgroup.appendChild(option);
      }
      els.manualKeySelect.appendChild(optgroup);
    }
  }

  function formatCodeName(code, key) {
    if (code) {
      if (code.startsWith("Key") && code.length === 4) {
        return code.slice(3);
      }
      if (code.startsWith("Digit") && code.length === 6) {
        return code.slice(5);
      }
      if (code.startsWith("Numpad") && code.length === 7) {
        return "Num " + code.slice(6);
      }
      if (CODE_LABELS[code]) {
        return CODE_LABELS[code];
      }
      return code;
    }
    if (key) {
      return key.length === 1 ? key.toUpperCase() : key;
    }
    return "Key";
  }

  function buildShortcut({ ctrl, alt, shift, meta, code, key = "" }) {
    const hasCtrl = Boolean(ctrl);
    const hasAlt = Boolean(alt);
    const hasShift = Boolean(shift);
    const hasMeta = Boolean(meta);
    const cleanCode = code && !MODIFIER_CODES.has(code) ? code : "";

    if (!cleanCode && !hasCtrl && !hasAlt && !hasShift && !hasMeta) {
      return null;
    }

    const idParts = [];
    const labelParts = [];

    if (hasCtrl) {
      idParts.push("ctrl");
      labelParts.push("Ctrl");
    }
    if (hasAlt) {
      idParts.push("alt");
      labelParts.push("Alt");
    }
    if (hasShift) {
      idParts.push("shift");
      labelParts.push("Shift");
    }
    if (hasMeta) {
      idParts.push("meta");
      labelParts.push("Win");
    }

    if (cleanCode) {
      idParts.push(cleanCode.toLowerCase());
      labelParts.push(formatCodeName(cleanCode, key));
    }

    return {
      id: idParts.join("+"),
      ctrl: hasCtrl,
      alt: hasAlt,
      shift: hasShift,
      meta: hasMeta,
      code: cleanCode,
      label: labelParts.join(" + "),
      enabled: true
    };
  }

  function isSameShortcut(a, b) {
    return (
      Boolean(a.ctrl) === Boolean(b.ctrl) &&
      Boolean(a.alt) === Boolean(b.alt) &&
      Boolean(a.shift) === Boolean(b.shift) &&
      Boolean(a.meta) === Boolean(b.meta) &&
      (a.code || "") === (b.code || "")
    );
  }

  function setHint(text, type = "") {
    els.recorderHint.textContent = text;
    els.recorderHint.className = "hint" + (type ? " " + type : "");
  }

  function syncManualBuilderFromShortcut(shortcut) {
    for (const pill of modPills) {
      const mod = pill.dataset.mod;
      const active = Boolean(shortcut && shortcut[mod]);
      pill.classList.toggle("active", active);
    }

    const code = shortcut?.code || "";
    if (code) {
      const hasOption = Array.from(els.manualKeySelect.options).some((opt) => opt.value === code);
      if (!hasOption) {
        const extraOpt = document.createElement("option");
        extraOpt.value = code;
        extraOpt.textContent = formatCodeName(code, "");
        els.manualKeySelect.appendChild(extraOpt);
      }
    }
    els.manualKeySelect.value = code;
  }

  function readManualBuilderMods() {
    const mods = { ctrl: false, alt: false, shift: false, meta: false };
    for (const pill of modPills) {
      mods[pill.dataset.mod] = pill.classList.contains("active");
    }
    return mods;
  }

  function applyCandidateShortcut(candidate, { keepRecording = false } = {}) {
    pendingShortcut = candidate;
    syncManualBuilderFromShortcut(candidate);

    if (!candidate) {
      els.addShortcutBtn.disabled = true;
      if (!keepRecording) {
        els.recorderBtn.className = "recorder-btn";
        els.recorderBtn.textContent = "Натисніть, щоб записати...";
        setHint("Натисніть кнопку вище для запису або оберіть модифікатори й клавішу вручну.");
      }
      return;
    }

    if (keepRecording) {
      els.recorderBtn.className = "recorder-btn recording";
      els.recorderBtn.textContent = `${candidate.label} (або натисніть клавішу...)`;
    } else {
      els.recorderBtn.className = "recorder-btn captured";
      els.recorderBtn.textContent = candidate.label;
    }

    const duplicate = settings.shortcuts.some((s) => isSameShortcut(s, candidate));
    if (duplicate) {
      els.addShortcutBtn.disabled = true;
      setHint(`Комбінація «${candidate.label}» вже є у списку.`, "error");
    } else {
      els.addShortcutBtn.disabled = false;
      setHint(`Готово: ${candidate.label}. Натисніть «Додати».`, "success");
    }
  }

  function enterRecordingMode() {
    isRecording = true;
    pendingShortcut = null;
    recordedMods = { ctrl: false, alt: false, shift: false, meta: false };
    syncManualBuilderFromShortcut(null);
    els.addShortcutBtn.disabled = true;
    els.recorderBtn.className = "recorder-btn recording";
    els.recorderBtn.textContent = "Натисніть комбінацію клавіш...";
    els.cancelRecordBtn.classList.remove("hidden");
    setHint("Натисніть модифікатор (напр. Ctrl) або комбінацію (напр. Ctrl+M)...");
    if (document.activeElement && document.activeElement !== els.recorderBtn && typeof document.activeElement.blur === "function") {
      document.activeElement.blur();
    }
    els.recorderBtn.focus();
  }

  function exitRecordingMode(resetText = true) {
    isRecording = false;
    els.cancelRecordBtn.classList.add("hidden");
    els.recorderBtn.classList.remove("recording");
    if (resetText && !pendingShortcut) {
      els.recorderBtn.className = "recorder-btn";
      els.recorderBtn.textContent = "Натисніть, щоб записати...";
      els.addShortcutBtn.disabled = true;
      setHint("Натисніть кнопку вище для запису або оберіть модифікатори й клавішу вручну.");
    }
  }

  async function saveSettings(partial) {
    settings = { ...settings, ...partial };
    await chrome.storage.local.set(partial);
  }

  function renderGlobalState() {
    const on = Boolean(settings.enabled);
    els.globalToggle.checked = on;
    els.globalBadge.textContent = on ? "Активний" : "Вимкнено";
    els.globalBadge.className = "status-pill " + (on ? "status-on" : "status-off");
  }

  function renderSiteBar() {
    els.fileNotice.classList.add("hidden");

    if (currentProtocol === "file:") {
      els.siteHost.textContent = "Локальний файл (file://)";
      els.siteHost.title = "Локальний файл";
      els.siteDot.className = "site-dot" + (settings.enabled ? "" : " paused");
      els.siteToggleBtn.disabled = true;
      els.siteToggleBtn.className = "btn-site";
      els.siteToggleBtn.textContent = "Локально";
      els.fileNotice.classList.remove("hidden");
      return;
    }

    if (!currentHost || (currentProtocol !== "http:" && currentProtocol !== "https:")) {
      els.siteHost.textContent = "Системна сторінка браузера";
      els.siteHost.title = "Браузер обмежує скрипти на системних сторінках";
      els.siteDot.className = "site-dot unavailable";
      els.siteToggleBtn.disabled = true;
      els.siteToggleBtn.className = "btn-site";
      els.siteToggleBtn.textContent = "Недоступно";
      return;
    }

    els.siteHost.textContent = currentHost;
    els.siteHost.title = currentHost;

    const isHostDisabled = settings.disabledHosts.includes(currentHost);
    const activeHere = settings.enabled && !isHostDisabled;

    els.siteToggleBtn.disabled = !settings.enabled;
    if (!settings.enabled) {
      els.siteDot.className = "site-dot paused";
      els.siteToggleBtn.className = "btn-site paused";
      els.siteToggleBtn.textContent = "Глобально вимк.";
    } else if (activeHere) {
      els.siteDot.className = "site-dot";
      els.siteToggleBtn.className = "btn-site";
      els.siteToggleBtn.textContent = "Увімк. на сайті";
    } else {
      els.siteDot.className = "site-dot paused";
      els.siteToggleBtn.className = "btn-site paused";
      els.siteToggleBtn.textContent = "Вимк. на сайті";
    }
  }

  function renderShortcuts() {
    const list = Array.isArray(settings.shortcuts) ? settings.shortcuts : [];
    els.shortcutCount.textContent = String(list.length);
    els.shortcutsList.textContent = "";

    if (list.length === 0) {
      els.shortcutsList.classList.add("hidden");
      els.shortcutsEmpty.classList.remove("hidden");
      return;
    }

    els.shortcutsList.classList.remove("hidden");
    els.shortcutsEmpty.classList.add("hidden");

    for (const shortcut of list) {
      const li = document.createElement("li");
      li.className = "shortcut-item" + (shortcut.enabled === false ? " disabled" : "");

      const keycaps = document.createElement("div");
      keycaps.className = "keycaps";
      const parts = String(shortcut.label || shortcut.code || "").split(" + ");
      parts.forEach((part, idx) => {
        if (idx > 0) {
          const plus = document.createElement("span");
          plus.className = "keycap-plus";
          plus.textContent = "+";
          keycaps.appendChild(plus);
        }
        const kbd = document.createElement("kbd");
        kbd.className = "keycap";
        kbd.textContent = part;
        keycaps.appendChild(kbd);
      });

      const controls = document.createElement("div");
      controls.className = "shortcut-controls";

      const switchLabel = document.createElement("label");
      switchLabel.className = "switch switch-sm";
      switchLabel.title = shortcut.enabled === false ? "Увімкнути комбінацію" : "Вимкнути комбінацію";

      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = shortcut.enabled !== false;
      checkbox.addEventListener("change", async () => {
        const updated = settings.shortcuts.map((s) =>
          s.id === shortcut.id ? { ...s, enabled: checkbox.checked } : s
        );
        await saveSettings({ shortcuts: updated });
        renderShortcuts();
      });

      const slider = document.createElement("span");
      slider.className = "slider";
      switchLabel.appendChild(checkbox);
      switchLabel.appendChild(slider);

      const deleteBtn = document.createElement("button");
      deleteBtn.type = "button";
      deleteBtn.className = "btn-delete";
      deleteBtn.title = "Видалити";
      deleteBtn.textContent = "×";
      deleteBtn.addEventListener("click", async () => {
        const updated = settings.shortcuts.filter((s) => s.id !== shortcut.id);
        await saveSettings({ shortcuts: updated });
        renderShortcuts();
      });

      controls.appendChild(switchLabel);
      controls.appendChild(deleteBtn);

      li.appendChild(keycaps);
      li.appendChild(controls);
      els.shortcutsList.appendChild(li);
    }
  }

  function renderExtraToggles() {
    els.clipboardToggle.checked = Boolean(settings.protectClipboard);
    els.contextMenuToggle.checked = Boolean(settings.protectContextMenu);
    els.focusToggle.checked = Boolean(settings.protectFocus);
  }

  function formatTime(ts) {
    try {
      return new Date(ts).toLocaleTimeString("uk-UA", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit"
      });
    } catch {
      return "";
    }
  }

  function renderStats(stats) {
    const count = stats?.count || 0;
    const log = Array.isArray(stats?.log) ? stats.log : [];

    els.blockedCount.textContent = String(count);
    els.blockedLog.textContent = "";

    if (log.length === 0) {
      els.blockedLog.classList.add("hidden");
      els.logEmpty.classList.remove("hidden");
      return;
    }

    els.blockedLog.classList.remove("hidden");
    els.logEmpty.classList.add("hidden");

    for (const entry of log) {
      const li = document.createElement("li");
      li.className = "log-item";

      const left = document.createElement("div");
      left.className = "log-left";

      const label = document.createElement("span");
      label.className = "log-label";
      label.textContent = entry.label;

      const type = document.createElement("span");
      type.className = "log-type";
      type.textContent = entry.type;

      left.appendChild(label);
      left.appendChild(type);

      const time = document.createElement("span");
      time.className = "log-time";
      time.textContent = formatTime(entry.time);

      li.appendChild(left);
      li.appendChild(time);
      els.blockedLog.appendChild(li);
    }
  }

  async function refreshTabStats() {
    if (typeof currentTabId !== "number" || currentTabId < 0) {
      renderStats({ count: 0, log: [] });
      return;
    }
    try {
      const stats = await chrome.runtime.sendMessage({
        type: "GET_TAB_STATS",
        tabId: currentTabId
      });
      renderStats(stats);
    } catch {
      renderStats({ count: 0, log: [] });
    }
  }

  async function init() {
    const [stored, tabs] = await Promise.all([
      chrome.storage.local.get(Object.keys(DEFAULT_SETTINGS)),
      chrome.tabs.query({ active: true, currentWindow: true })
    ]);

    settings = {
      enabled: typeof stored.enabled === "boolean" ? stored.enabled : DEFAULT_SETTINGS.enabled,
      disabledHosts: Array.isArray(stored.disabledHosts) ? stored.disabledHosts : [...DEFAULT_SETTINGS.disabledHosts],
      protectClipboard: typeof stored.protectClipboard === "boolean" ? stored.protectClipboard : DEFAULT_SETTINGS.protectClipboard,
      protectContextMenu: typeof stored.protectContextMenu === "boolean" ? stored.protectContextMenu : DEFAULT_SETTINGS.protectContextMenu,
      protectFocus: typeof stored.protectFocus === "boolean" ? stored.protectFocus : DEFAULT_SETTINGS.protectFocus,
      shortcuts: Array.isArray(stored.shortcuts) ? stored.shortcuts : structuredClone(DEFAULT_SETTINGS.shortcuts)
    };

    const activeTab = tabs[0];
    if (activeTab) {
      currentTabId = activeTab.id;
      if (activeTab.url) {
        try {
          const parsed = new URL(activeTab.url);
          currentProtocol = parsed.protocol;
          currentHost = parsed.hostname;
        } catch {
          currentProtocol = "";
          currentHost = "";
        }
      }
    }

    populateManualKeySelect();
    renderGlobalState();
    renderSiteBar();
    renderShortcuts();
    renderExtraToggles();
    await refreshTabStats();

    statsTimer = setInterval(refreshTabStats, 800);
  }

  let lastRecordedAt = 0;

  els.globalToggle.addEventListener("change", async () => {
    await saveSettings({ enabled: els.globalToggle.checked });
    renderGlobalState();
    renderSiteBar();
  });

  els.siteToggleBtn.addEventListener("click", async () => {
    if (!currentHost) return;
    const exists = settings.disabledHosts.includes(currentHost);
    const updated = exists
      ? settings.disabledHosts.filter((h) => h !== currentHost)
      : [...settings.disabledHosts, currentHost];
    await saveSettings({ disabledHosts: updated });
    renderSiteBar();
  });

  els.recorderBtn.addEventListener("click", () => {
    if (Date.now() - lastRecordedAt < 250) return;
    if (isRecording) {
      pendingShortcut = null;
      syncManualBuilderFromShortcut(null);
      exitRecordingMode(true);
    } else {
      enterRecordingMode();
    }
  });

  els.cancelRecordBtn.addEventListener("click", () => {
    pendingShortcut = null;
    syncManualBuilderFromShortcut(null);
    exitRecordingMode(true);
  });

  for (const pill of modPills) {
    pill.addEventListener("click", () => {
      if (isRecording) {
        exitRecordingMode(false);
      }
      pill.classList.toggle("active");
      const mods = readManualBuilderMods();
      const candidate = buildShortcut({ ...mods, code: els.manualKeySelect.value });
      applyCandidateShortcut(candidate, { keepRecording: false });
    });
  }

  els.manualKeySelect.addEventListener("change", () => {
    if (isRecording) {
      exitRecordingMode(false);
    }
    const mods = readManualBuilderMods();
    const candidate = buildShortcut({ ...mods, code: els.manualKeySelect.value });
    applyCandidateShortcut(candidate, { keepRecording: false });
  });

  window.addEventListener(
    "keydown",
    (e) => {
      if (!isRecording) return;
      e.preventDefault();
      e.stopPropagation();
      if (e.stopImmediatePropagation) e.stopImmediatePropagation();

      const rawCode = e.code || (e.key === "Enter" ? "Enter" : "");

      recordedMods = {
        ctrl: Boolean(e.ctrlKey) || rawCode === "ControlLeft" || rawCode === "ControlRight",
        alt: Boolean(e.altKey) || rawCode === "AltLeft" || rawCode === "AltRight",
        shift: Boolean(e.shiftKey) || rawCode === "ShiftLeft" || rawCode === "ShiftRight",
        meta: Boolean(e.metaKey) || rawCode === "MetaLeft" || rawCode === "MetaRight"
      };

      if (MODIFIER_CODES.has(rawCode)) {
        const modCandidate = buildShortcut({ ...recordedMods, code: "" });
        applyCandidateShortcut(modCandidate, { keepRecording: true });
        return;
      }

      const candidate = buildShortcut({ ...recordedMods, code: rawCode, key: e.key });
      lastRecordedAt = Date.now();
      exitRecordingMode(false);
      applyCandidateShortcut(candidate, { keepRecording: false });
    },
    true
  );

  window.addEventListener(
    "keyup",
    (e) => {
      if (!isRecording) return;
      e.preventDefault();
      e.stopPropagation();
      if (e.stopImmediatePropagation) e.stopImmediatePropagation();

      const rawCode = e.code || (e.key === "Enter" ? "Enter" : "");

      if (!MODIFIER_CODES.has(rawCode)) {
        const mods = {
          ctrl: Boolean(e.ctrlKey) || recordedMods.ctrl,
          alt: Boolean(e.altKey) || recordedMods.alt,
          shift: Boolean(e.shiftKey) || recordedMods.shift,
          meta: Boolean(e.metaKey) || recordedMods.meta
        };
        const fallbackCandidate = buildShortcut({ ...mods, code: rawCode, key: e.key });
        lastRecordedAt = Date.now();
        exitRecordingMode(false);
        applyCandidateShortcut(fallbackCandidate, { keepRecording: false });
        return;
      }

      if (!e.ctrlKey && !e.altKey && !e.shiftKey && !e.metaKey && pendingShortcut) {
        const finalized = pendingShortcut;
        lastRecordedAt = Date.now();
        exitRecordingMode(false);
        applyCandidateShortcut(finalized, { keepRecording: false });
      }
    },
    true
  );

  els.addShortcutBtn.addEventListener("click", async () => {
    if (!pendingShortcut) return;
    if (settings.shortcuts.some((s) => isSameShortcut(s, pendingShortcut))) {
      setHint(`Комбінація «${pendingShortcut.label}» вже є у списку.`, "error");
      els.addShortcutBtn.disabled = true;
      return;
    }

    const addedLabel = pendingShortcut.label;
    const updated = [...settings.shortcuts, pendingShortcut];
    pendingShortcut = null;

    syncManualBuilderFromShortcut(null);
    els.recorderBtn.className = "recorder-btn";
    els.recorderBtn.textContent = "Натисніть, щоб записати...";
    els.addShortcutBtn.disabled = true;

    await saveSettings({ shortcuts: updated });
    renderShortcuts();
    setHint(`Додано «${addedLabel}» до списку захисту.`, "success");
  });

  els.resetDefaultsBtn.addEventListener("click", async () => {
    const defaults = structuredClone(DEFAULT_SETTINGS.shortcuts);
    await saveSettings({ shortcuts: defaults });
    renderShortcuts();
    setHint("Відновлено стандартний набір комбінацій.", "success");
  });

  els.clearAllBtn.addEventListener("click", async () => {
    await saveSettings({ shortcuts: [] });
    renderShortcuts();
    setHint("Усі комбінації видалено.");
  });

  els.clipboardToggle.addEventListener("change", async () => {
    await saveSettings({ protectClipboard: els.clipboardToggle.checked });
  });

  els.contextMenuToggle.addEventListener("change", async () => {
    await saveSettings({ protectContextMenu: els.contextMenuToggle.checked });
  });

  els.focusToggle.addEventListener("change", async () => {
    await saveSettings({ protectFocus: els.focusToggle.checked });
  });

  els.clearLogBtn.addEventListener("click", async () => {
    if (typeof currentTabId !== "number" || currentTabId < 0) return;
    try {
      await chrome.runtime.sendMessage({
        type: "CLEAR_TAB_STATS",
        tabId: currentTabId
      });
    } catch {
      // Ignore messaging error
    }
    renderStats({ count: 0, log: [] });
  });

  window.addEventListener("unload", () => {
    if (statsTimer) clearInterval(statsTimer);
  });

  init();
})();
