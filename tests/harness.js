"use strict";
/**
 * Мінімальне оточення для запуску content.js / background.js у Node без браузера.
 * Слухачі записуються, а події подаються в них напряму як прості об'єкти
 * (справжній Event.isTrusted у Node підробити не можна).
 */
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.join(__dirname, "..");
const read = (name) => fs.readFileSync(path.join(ROOT, name), "utf8");

const SHARED_SRC = read("shared.js");
const CONTENT_SRC = read("content.js");
const BACKGROUND_SRC = read("background.js");

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

function loadShared() {
  const sandbox = {};
  vm.createContext(sandbox);
  vm.runInContext(SHARED_SRC, sandbox);
  return sandbox.NoCtrlShared;
}

function createContentEnv({ hostname = "example.com", store = {} } = {}) {
  const listeners = { window: [], document: [] };
  const messages = [];
  const storageListeners = [];

  const sandbox = {};
  sandbox.window = sandbox;
  sandbox.top = sandbox;
  sandbox.parent = sandbox;
  sandbox.location = { hostname, href: `https://${hostname}/` };
  sandbox.addEventListener = (type, fn, capture) => listeners.window.push({ type, fn, capture });

  const body = { tagName: "BODY" };
  const documentElement = { tagName: "HTML" };
  sandbox.document = {
    referrer: "",
    body,
    documentElement,
    addEventListener: (type, fn, capture) => listeners.document.push({ type, fn, capture }),
    querySelectorAll: () => [],
    observe: () => {}
  };
  sandbox.MutationObserver = class {
    observe() {}
  };
  sandbox.chrome = {
    runtime: {
      lastError: undefined,
      sendMessage: (msg) => {
        messages.push(msg);
        return Promise.resolve({ ok: true });
      }
    },
    storage: {
      local: { get: (_keys, cb) => cb({ ...store }) },
      onChanged: { addListener: (fn) => storageListeners.push(fn) }
    }
  };

  vm.createContext(sandbox);
  const run = () => {
    vm.runInContext(SHARED_SRC, sandbox);
    vm.runInContext(CONTENT_SRC, sandbox);
  };
  run();

  // Усередині vm `window` — глобальний проксі контексту, а не сам об'єкт sandbox.
  const win = vm.runInContext("window", sandbox);

  /** Подає подію у слухачі window, а далі — document (як при capture-розповсюдженні). */
  function fire(type, props = {}, { onDocument = false } = {}) {
    const event = {
      type,
      isTrusted: true,
      stopped: false,
      propagationStopped: false,
      prevented: false,
      ctrlKey: false,
      altKey: false,
      shiftKey: false,
      metaKey: false,
      repeat: false,
      code: "",
      key: "",
      target: win,
      currentTarget: win,
      stopImmediatePropagation() {
        this.stopped = true;
      },
      stopPropagation() {
        this.propagationStopped = true;
      },
      preventDefault() {
        this.prevented = true;
      },
      ...props
    };
    const order = onDocument ? ["document"] : ["window", "document"];
    for (const where of order) {
      for (const l of listeners[where]) {
        if (l.type !== type) continue;
        l.fn(event);
        if (event.stopped) return event;
      }
    }
    return event;
  }

  return {
    sandbox,
    win,
    listeners,
    messages,
    body,
    documentElement,
    fire,
    reload: run,
    get settings() {
      return sandbox.window.__noctrlSettings;
    },
    emitStorageChange(changes) {
      for (const fn of storageListeners) fn(changes, "local");
    }
  };
}

function createBackgroundEnv({ store = {}, tabs = [] } = {}) {
  const calls = { executeScript: [], badgeText: [], badgeColor: [] };
  const handlers = {};
  const addListener = (name) => ({ addListener: (fn) => (handlers[name] = fn) });
  const session = {};

  const sandbox = {
    console,
    URL,
    importScripts: (file) => vm.runInContext(read(file), sandbox)
  };
  sandbox.chrome = {
    storage: {
      local: {
        get: async (keys) => {
          const out = {};
          for (const k of [].concat(keys)) if (k in store) out[k] = store[k];
          return out;
        },
        set: async (obj) => Object.assign(store, obj)
      },
      session: {
        get: async (key) => (key in session ? { [key]: session[key] } : {}),
        set: async (obj) => Object.assign(session, obj)
      },
      onChanged: addListener("storage.onChanged")
    },
    tabs: {
      query: async () => tabs,
      get: async (id) => tabs.find((t) => t.id === id),
      onUpdated: addListener("tabs.onUpdated"),
      onActivated: addListener("tabs.onActivated"),
      onRemoved: addListener("tabs.onRemoved")
    },
    scripting: {
      executeScript: async (details) => {
        calls.executeScript.push(details);
      }
    },
    action: {
      setBadgeText: async (d) => calls.badgeText.push(d),
      setBadgeBackgroundColor: async (d) => calls.badgeColor.push(d),
      setBadgeTextColor: async () => {}
    },
    runtime: {
      onInstalled: addListener("runtime.onInstalled"),
      onStartup: addListener("runtime.onStartup"),
      onMessage: addListener("runtime.onMessage")
    }
  };

  vm.createContext(sandbox);
  vm.runInContext(BACKGROUND_SRC, sandbox);
  return { sandbox, handlers, calls, store, session };
}

module.exports = { ROOT, read, plain, loadShared, createContentEnv, createBackgroundEnv };
