importScripts("shared.js");

const MAX_LOG_ENTRIES = 30;
const SESSION_KEY = "noctrl_tab_stats";

/** @type {Map<number, { count: number, log: Array<{ label: string, type: string, time: number }> }>} */
const tabStats = new Map();
let hydratePromise = null;

function getHostname(url) {
  if (!url) return "";
  try {
    const parsed = new URL(url);
    return parsed.hostname || "";
  } catch {
    return "";
  }
}

async function getSettings() {
  const stored = await chrome.storage.local.get(NoCtrlShared.SETTING_KEYS);
  return NoCtrlShared.normalizeSettings(stored);
}

async function ensureHydrated() {
  if (hydratePromise) return hydratePromise;
  hydratePromise = (async () => {
    if (!chrome.storage?.session) return;
    try {
      const data = await chrome.storage.session.get(SESSION_KEY);
      const raw = data?.[SESSION_KEY];
      if (raw && typeof raw === "object") {
        for (const [idStr, entry] of Object.entries(raw)) {
          const id = Number(idStr);
          if (Number.isInteger(id) && entry && typeof entry.count === "number" && Array.isArray(entry.log)) {
            if (!tabStats.has(id)) {
              tabStats.set(id, { count: entry.count, log: entry.log });
            }
          }
        }
      }
    } catch {
      // Ignore session storage errors
    }
  })();
  return hydratePromise;
}

async function persistTabStats() {
  if (!chrome.storage?.session) return;
  try {
    const serialized = {};
    for (const [tabId, stats] of tabStats.entries()) {
      serialized[String(tabId)] = stats;
    }
    await chrome.storage.session.set({ [SESSION_KEY]: serialized });
  } catch {
    // Ignore session storage quota or lifecycle errors
  }
}

function getOrCreateStats(tabId) {
  let entry = tabStats.get(tabId);
  if (!entry) {
    entry = { count: 0, log: [] };
    tabStats.set(tabId, entry);
  }
  return entry;
}

async function updateBadgeForTab(tabId, tabUrl) {
  if (typeof tabId !== "number" || tabId < 0) return;
  await ensureHydrated();

  try {
    const settings = await getSettings();
    const host = getHostname(tabUrl);
    const isDisabled = !settings.enabled || NoCtrlShared.isHostDisabled(host, settings.disabledHosts);

    if (isDisabled) {
      await chrome.action.setBadgeText({ tabId, text: "OFF" });
      await chrome.action.setBadgeBackgroundColor({ tabId, color: "#6b7280" });
    } else {
      const stats = tabStats.get(tabId);
      const count = stats ? stats.count : 0;
      await chrome.action.setBadgeText({ tabId, text: count > 0 ? String(count) : "" });
      await chrome.action.setBadgeBackgroundColor({ tabId, color: "#ef4444" });
    }

    if (chrome.action.setBadgeTextColor) {
      await chrome.action.setBadgeTextColor({ tabId, color: "#ffffff" });
    }
  } catch {
    // Tab may have been closed
  }
}

async function refreshAllTabBadges() {
  try {
    const tabs = await chrome.tabs.query({});
    await Promise.all(tabs.map((tab) => updateBadgeForTab(tab.id, tab.url)));
  } catch {
    // Ignore query errors
  }
}

async function ensureDefaultSettings() {
  const existing = await chrome.storage.local.get(NoCtrlShared.SETTING_KEYS);
  const defaults = NoCtrlShared.cloneDefaults();
  const toSet = {};
  for (const key of NoCtrlShared.SETTING_KEYS) {
    if (existing[key] === undefined) {
      toSet[key] = defaults[key];
    }
  }
  if (Object.keys(toSet).length > 0) {
    await chrome.storage.local.set(toSet);
  }
}

function isInjectableUrl(url) {
  if (!url || typeof url !== "string") return false;
  return /^(https?|file):\/\//i.test(url);
}

async function injectIntoExistingTabs() {
  if (!chrome.scripting?.executeScript) return;
  try {
    const tabs = await chrome.tabs.query({});
    await Promise.all(
      tabs.map(async (tab) => {
        if (typeof tab.id !== "number" || tab.id < 0) return;
        if (!isInjectableUrl(tab.url)) return;
        try {
          await chrome.scripting.executeScript({
            target: { tabId: tab.id, allFrames: true },
            files: ["shared.js", "content.js"],
            injectImmediately: true
          });
        } catch {
          // Ignore tabs/frames that forbid script injection (e.g. Web Store or discarded tabs)
        }
      })
    );
  } catch {
    // Ignore tab query errors
  }
}

chrome.runtime.onInstalled.addListener(async () => {
  await ensureDefaultSettings();
  await injectIntoExistingTabs();
  await refreshAllTabBadges();
});

// Content script підключається браузером сам, тому ін'єкція в наявні вкладки потрібна лише
// після встановлення/оновлення (див. onInstalled), а не при кожному пробудженні service worker.
chrome.runtime.onStartup.addListener(async () => {
  await ensureDefaultSettings();
  await refreshAllTabBadges();
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local") return;
  if (changes.enabled || changes.disabledHosts) {
    refreshAllTabBadges();
  }
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status === "loading") {
    await ensureHydrated();
    tabStats.set(tabId, { count: 0, log: [] });
    await persistTabStats();
    await updateBadgeForTab(tabId, changeInfo.url || tab.url);
  }
});

chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  try {
    const tab = await chrome.tabs.get(tabId);
    await updateBadgeForTab(tabId, tab.url);
  } catch {
    // Ignore if tab no longer exists
  }
});

chrome.tabs.onRemoved.addListener(async (tabId) => {
  await ensureHydrated();
  if (tabStats.delete(tabId)) {
    await persistTabStats();
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || typeof message !== "object") return false;

  if (message.type === "EVENT_BLOCKED") {
    const tabId = sender.tab?.id;
    if (typeof tabId !== "number" || tabId < 0) {
      sendResponse({ ok: false });
      return false;
    }

    (async () => {
      await ensureHydrated();
      const stats = getOrCreateStats(tabId);
      const payload = message.payload || {};
      stats.count += 1;
      stats.log.unshift({
        label: String(payload.label || "Shortcut"),
        type: String(payload.eventType || "keydown"),
        time: Date.now()
      });
      if (stats.log.length > MAX_LOG_ENTRIES) {
        stats.log.length = MAX_LOG_ENTRIES;
      }

      await persistTabStats();
      await updateBadgeForTab(tabId, sender.tab?.url || payload.url);
      sendResponse({ ok: true, count: stats.count });
    })();
    return true;
  }

  if (message.type === "GET_TAB_STATS") {
    const tabId = message.tabId;
    (async () => {
      await ensureHydrated();
      const stats = typeof tabId === "number" ? tabStats.get(tabId) : null;
      sendResponse(stats ? { count: stats.count, log: stats.log } : { count: 0, log: [] });
    })();
    return true;
  }

  if (message.type === "CLEAR_TAB_STATS") {
    const tabId = message.tabId;
    (async () => {
      await ensureHydrated();
      if (typeof tabId === "number" && tabId >= 0) {
        tabStats.set(tabId, { count: 0, log: [] });
        await persistTabStats();
        let tabUrl = "";
        try {
          const tab = await chrome.tabs.get(tabId);
          tabUrl = tab?.url || "";
        } catch {
          // Ignore missing tab
        }
        await updateBadgeForTab(tabId, tabUrl);
      }
      sendResponse({ ok: true });
    })();
    return true;
  }

  return false;
});
