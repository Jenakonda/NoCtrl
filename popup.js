(function () {
  "use strict";

  const Shared = window.NoCtrlShared;
  const DEFAULT_SETTINGS = Shared.DEFAULT_SETTINGS;

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
    siteBar: document.getElementById("siteBar"),
    siteStatus: document.getElementById("siteStatus"),
    siteHint: document.getElementById("siteHint"),
    logMoreBtn: document.getElementById("logMoreBtn"),
    siteDot: document.getElementById("siteDot"),
    siteHost: document.getElementById("siteHost"),
    siteToggleBtn: document.getElementById("siteToggleBtn"),
    fileNotice: document.getElementById("fileNotice"),
    popoutBtn: document.getElementById("popoutBtn"),
    recorderTrap: document.getElementById("recorderTrap"),
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
    selectionToggle: document.getElementById("selectionToggle"),
    blockedCount: document.getElementById("blockedCount"),
    clearLogBtn: document.getElementById("clearLogBtn"),
    blockedLog: document.getElementById("blockedLog"),
    logEmpty: document.getElementById("logEmpty")
  };

  const modPills = Array.from(document.querySelectorAll(".mod-pill"));

  let settings = Shared.cloneDefaults();
  let currentTabId = null;
  let currentHost = "";
  let currentProtocol = "";
  let isRecording = false;
  let pendingShortcut = null;
  let recordedMods = { ctrl: false, alt: false, shift: false, meta: false };
  let modifierFinalizeTimer = null;
  let statsTimer = null;

  function clearModifierFinalizeTimer() {
    if (modifierFinalizeTimer) {
      clearTimeout(modifierFinalizeTimer);
      modifierFinalizeTimer = null;
    }
  }

  function normalizeEventCode(e) {
    if (e.code) return e.code;
    if (
      e.key === "Enter" ||
      e.key === "\n" ||
      e.key === "\r" ||
      e.keyCode === 13 ||
      e.keyCode === 10 ||
      e.charCode === 10 ||
      e.which === 13 ||
      e.which === 10
    ) {
      return "Enter";
    }
    if (typeof e.key === "string" && e.key.length === 1) {
      const ch = e.key.toUpperCase();
      if (ch >= "A" && ch <= "Z") return "Key" + ch;
      if (ch >= "0" && ch <= "9") return "Digit" + ch;
    }
    return "";
  }

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
        els.recorderBtn.textContent = "Записати нову комбінацію";
        setHint("Натисніть кнопку запису або виберіть модифікатори й клавішу вручну.");
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
    clearModifierFinalizeTimer();
    isRecording = true;
    pendingShortcut = null;
    recordedMods = { ctrl: false, alt: false, shift: false, meta: false };
    syncManualBuilderFromShortcut(null);
    els.addShortcutBtn.disabled = true;
    els.recorderBtn.className = "recorder-btn recording";
    els.recorderBtn.textContent = "Натисніть комбінацію клавіш...";
    els.cancelRecordBtn.classList.remove("hidden");
    setHint("Натисніть модифікатор (напр. Ctrl) або комбінацію (напр. Ctrl+Enter)...");
    if (els.recorderTrap) {
      els.recorderTrap.value = "";
      els.recorderTrap.focus();
    } else {
      if (document.activeElement && document.activeElement !== els.recorderBtn && typeof document.activeElement.blur === "function") {
        document.activeElement.blur();
      }
      els.recorderBtn.focus();
    }
  }

  function exitRecordingMode(resetText = true) {
    clearModifierFinalizeTimer();
    isRecording = false;
    els.cancelRecordBtn.classList.add("hidden");
    els.recorderBtn.classList.remove("recording");
    if (els.recorderTrap) {
      els.recorderTrap.value = "";
      if (document.activeElement === els.recorderTrap && typeof els.recorderTrap.blur === "function") {
        els.recorderTrap.blur();
      }
    }
    if (resetText && !pendingShortcut) {
      els.recorderBtn.className = "recorder-btn";
      els.recorderBtn.textContent = "Записати нову комбінацію";
      els.addShortcutBtn.disabled = true;
      setHint("Натисніть кнопку запису або виберіть модифікатори й клавішу вручну.");
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

  function setSiteState(state, { status, host, hostTitle, button, buttonDisabled, hint }) {
    els.siteBar.dataset.state = state;
    els.siteDot.className = "site-dot " + state;
    els.siteStatus.textContent = status;
    els.siteHost.textContent = host;
    els.siteHost.title = hostTitle || host;
    els.siteToggleBtn.textContent = button;
    els.siteToggleBtn.disabled = buttonDisabled;
    els.siteHint.textContent = hint || "";
    els.siteHint.classList.toggle("hidden", !hint);
  }

  function renderSiteBar() {
    els.fileNotice.classList.add("hidden");

    if (currentProtocol === "file:") {
      setSiteState(settings.enabled ? "on" : "off", {
        status: settings.enabled ? "Захищено" : "Вимкнено глобально",
        host: "Локальний файл (file://)",
        button: "Недоступно для файлів",
        buttonDisabled: true
      });
      els.fileNotice.classList.remove("hidden");
      return;
    }

    if (!currentHost || (currentProtocol !== "http:" && currentProtocol !== "https:")) {
      setSiteState("unavailable", {
        status: "Недоступно",
        host: "Системна сторінка браузера",
        hostTitle: "Браузер обмежує скрипти на системних сторінках",
        button: "Недоступно",
        buttonDisabled: true
      });
      return;
    }

    if (!settings.enabled) {
      setSiteState("off", {
        status: "Вимкнено глобально",
        host: currentHost,
        button: "Увімкніть захист угорі",
        buttonDisabled: true
      });
    } else if (Shared.isHostDisabled(currentHost, settings.disabledHosts)) {
      setSiteState("paused", {
        status: "На паузі на",
        host: currentHost,
        button: "Увімкнути на сайті",
        buttonDisabled: false,
        hint: "Пауза діє на домен і всі його піддомени."
      });
    } else {
      setSiteState("on", {
        status: "Захищено на",
        host: currentHost,
        button: "Пауза на сайті",
        buttonDisabled: false
      });
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
      const enabled = shortcut.enabled !== false;
      const text = String(shortcut.label || shortcut.code || "");

      const li = document.createElement("li");
      li.className = "chip" + (enabled ? "" : " off");

      const toggleBtn = document.createElement("button");
      toggleBtn.type = "button";
      toggleBtn.className = "chip-label";
      toggleBtn.textContent = text;
      toggleBtn.setAttribute("aria-pressed", String(enabled));
      toggleBtn.title = enabled ? "Клацніть, щоб вимкнути комбінацію" : "Клацніть, щоб увімкнути комбінацію";
      toggleBtn.addEventListener("click", async () => {
        const updated = settings.shortcuts.map((s) =>
          s.id === shortcut.id ? { ...s, enabled: !enabled } : s
        );
        await saveSettings({ shortcuts: updated });
        renderShortcuts();
      });

      const deleteBtn = document.createElement("button");
      deleteBtn.type = "button";
      deleteBtn.className = "chip-x";
      deleteBtn.title = "Видалити";
      deleteBtn.setAttribute("aria-label", `Видалити ${text}`);
      deleteBtn.textContent = "×";
      deleteBtn.addEventListener("click", async () => {
        const updated = settings.shortcuts.filter((s) => s.id !== shortcut.id);
        await saveSettings({ shortcuts: updated });
        renderShortcuts();
      });

      li.appendChild(toggleBtn);
      li.appendChild(deleteBtn);
      els.shortcutsList.appendChild(li);
    }
  }

  function renderExtraToggles() {
    els.clipboardToggle.checked = Boolean(settings.protectClipboard);
    els.contextMenuToggle.checked = Boolean(settings.protectContextMenu);
    els.focusToggle.checked = Boolean(settings.protectFocus);
    els.selectionToggle.checked = Boolean(settings.protectSelection);
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

  const LOG_PREVIEW_COUNT = 3;
  let logExpanded = false;
  let lastStats = { count: 0, log: [] };

  function renderStats(stats) {
    lastStats = stats || { count: 0, log: [] };
    const count = lastStats.count || 0;
    const log = Array.isArray(lastStats.log) ? lastStats.log : [];

    els.blockedCount.textContent = String(count);
    els.blockedLog.textContent = "";

    if (log.length === 0) {
      els.blockedLog.classList.add("hidden");
      els.logMoreBtn.classList.add("hidden");
      els.logEmpty.classList.remove("hidden");
      return;
    }

    els.blockedLog.classList.remove("hidden");
    els.logEmpty.classList.add("hidden");

    const visible = logExpanded ? log : log.slice(0, LOG_PREVIEW_COUNT);
    for (const entry of visible) {
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

    const hasMore = log.length > LOG_PREVIEW_COUNT;
    els.logMoreBtn.classList.toggle("hidden", !hasMore);
    els.logMoreBtn.textContent = logExpanded ? "Згорнути" : `Показати всі (${log.length})`;
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
    let currentSelfTab = null;
    if (chrome.tabs?.getCurrent) {
      try {
        currentSelfTab = await chrome.tabs.getCurrent();
      } catch {
        currentSelfTab = null;
      }
    }

    if (currentSelfTab) {
      document.body.classList.add("is-tab");
      if (els.popoutBtn) els.popoutBtn.classList.add("hidden");
    }

    const [stored, tabs] = await Promise.all([
      chrome.storage.local.get(Shared.SETTING_KEYS),
      currentSelfTab
        ? chrome.tabs.query({ currentWindow: true })
        : chrome.tabs.query({ active: true, currentWindow: true })
    ]);

    settings = Shared.normalizeSettings(stored);

    const targetTab = currentSelfTab
      ? tabs
          .filter((t) => t.id !== currentSelfTab.id && !t.url?.startsWith("chrome-extension://"))
          .sort((a, b) => (b.lastAccessed || 0) - (a.lastAccessed || 0))[0] || tabs[0]
      : tabs[0];

    if (targetTab) {
      currentTabId = targetTab.id;
      if (targetTab.url) {
        try {
          const parsed = new URL(targetTab.url);
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

  function finalizeCapturedKey(rawCode, key, mods) {
    clearModifierFinalizeTimer();
    const candidate = buildShortcut({ ...mods, code: rawCode, key });
    lastRecordedAt = Date.now();
    exitRecordingMode(false);
    applyCandidateShortcut(candidate, { keepRecording: false });
  }

  if (els.popoutBtn) {
    els.popoutBtn.addEventListener("click", async () => {
      await chrome.tabs.create({ url: chrome.runtime.getURL("popup.html") });
      window.close();
    });
  }

  els.globalToggle.addEventListener("change", async () => {
    await saveSettings({ enabled: els.globalToggle.checked });
    renderGlobalState();
    renderSiteBar();
  });

  els.siteToggleBtn.addEventListener("click", async () => {
    if (!currentHost) return;
    // Вимкнення для example.com діє й на www.example.com, тому «увімкнути» прибирає всі покриваючі записи.
    const updated = Shared.isHostDisabled(currentHost, settings.disabledHosts)
      ? Shared.removeHost(settings.disabledHosts, currentHost)
      : Shared.addHost(settings.disabledHosts, currentHost);
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
      clearModifierFinalizeTimer();
      e.preventDefault();
      e.stopPropagation();
      if (e.stopImmediatePropagation) e.stopImmediatePropagation();

      const rawCode = normalizeEventCode(e);

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

      if (rawCode || (e.key && e.key !== "Process" && e.key !== "Unidentified")) {
        finalizeCapturedKey(rawCode, e.key, recordedMods);
      }
    },
    true
  );

  window.addEventListener(
    "keypress",
    (e) => {
      if (!isRecording) return;
      e.preventDefault();
      e.stopPropagation();
      if (e.stopImmediatePropagation) e.stopImmediatePropagation();

      const rawCode = normalizeEventCode(e);
      if (!rawCode || MODIFIER_CODES.has(rawCode)) return;

      const mods = {
        ctrl: Boolean(e.ctrlKey) || recordedMods.ctrl,
        alt: Boolean(e.altKey) || recordedMods.alt,
        shift: Boolean(e.shiftKey) || recordedMods.shift,
        meta: Boolean(e.metaKey) || recordedMods.meta
      };
      finalizeCapturedKey(rawCode, e.key, mods);
    },
    true
  );

  if (els.recorderTrap) {
    els.recorderTrap.addEventListener("beforeinput", (e) => {
      if (!isRecording) return;
      e.preventDefault();
      e.stopPropagation();

      const inputType = String(e.inputType || "");
      if (inputType === "insertLineBreak" || inputType === "insertParagraph") {
        finalizeCapturedKey("Enter", "Enter", recordedMods);
        return;
      }
      if (inputType === "insertText" && typeof e.data === "string" && e.data.length === 1) {
        const code = normalizeEventCode({ code: "", key: e.data });
        if (code) finalizeCapturedKey(code, e.data, recordedMods);
      }
    });

    els.recorderTrap.addEventListener("input", () => {
      if (!isRecording) return;
      const val = els.recorderTrap.value || "";
      els.recorderTrap.value = "";
      if (val.includes("\n") || val.includes("\r")) {
        finalizeCapturedKey("Enter", "Enter", recordedMods);
      } else if (val.length === 1) {
        const code = normalizeEventCode({ code: "", key: val });
        if (code) finalizeCapturedKey(code, val, recordedMods);
      }
    });
  }

  window.addEventListener(
    "keyup",
    (e) => {
      if (!isRecording) return;
      e.preventDefault();
      e.stopPropagation();
      if (e.stopImmediatePropagation) e.stopImmediatePropagation();

      const rawCode = normalizeEventCode(e);

      if (rawCode && !MODIFIER_CODES.has(rawCode)) {
        const mods = {
          ctrl: Boolean(e.ctrlKey) || recordedMods.ctrl,
          alt: Boolean(e.altKey) || recordedMods.alt,
          shift: Boolean(e.shiftKey) || recordedMods.shift,
          meta: Boolean(e.metaKey) || recordedMods.meta
        };
        finalizeCapturedKey(rawCode, e.key, mods);
        return;
      }

      if (MODIFIER_CODES.has(rawCode) && !e.ctrlKey && !e.altKey && !e.shiftKey && !e.metaKey && pendingShortcut) {
        const finalized = pendingShortcut;
        clearModifierFinalizeTimer();
        modifierFinalizeTimer = setTimeout(() => {
          modifierFinalizeTimer = null;
          if (!isRecording) return;
          lastRecordedAt = Date.now();
          exitRecordingMode(false);
          applyCandidateShortcut(finalized, { keepRecording: false });
        }, 150);
      }
    },
    true
  );

  els.addShortcutBtn.addEventListener("click", async () => {
    clearModifierFinalizeTimer();
    if (isRecording) exitRecordingMode(false);
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
    els.recorderBtn.textContent = "Записати нову комбінацію";
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

  els.selectionToggle.addEventListener("change", async () => {
    await saveSettings({ protectSelection: els.selectionToggle.checked });
  });

  els.logMoreBtn.addEventListener("click", () => {
    logExpanded = !logExpanded;
    renderStats(lastStats);
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
    clearModifierFinalizeTimer();
    if (statsTimer) clearInterval(statsTimer);
  });

  init();
})();
