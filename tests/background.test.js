"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { createBackgroundEnv, plain } = require("./harness");

const tick = () => new Promise((resolve) => setImmediate(resolve));

function send(env, message, sender = {}) {
  return new Promise((resolve) => {
    const keepOpen = env.handlers["runtime.onMessage"](message, sender, resolve);
    if (!keepOpen) resolve(undefined);
  });
}

test("service worker не ін'єктує скрипти при завантаженні й на onStartup", async () => {
  const env = createBackgroundEnv({ tabs: [{ id: 1, url: "https://a.com/" }] });
  await tick();
  assert.equal(env.calls.executeScript.length, 0, "при старті воркера");

  await env.handlers["runtime.onStartup"]();
  assert.equal(env.calls.executeScript.length, 0, "на onStartup");
});

test("onInstalled: записує налаштування за замовчуванням і ін'єктує shared.js + content.js", async () => {
  const env = createBackgroundEnv({
    tabs: [
      { id: 1, url: "https://a.com/" },
      { id: 2, url: "chrome://extensions" },
      { id: 3, url: "file:///C:/test.html" }
    ]
  });
  await env.handlers["runtime.onInstalled"]();

  assert.equal(env.store.protectSelection, false);
  assert.equal(env.store.shortcuts.length, 7);

  const targets = env.calls.executeScript.map((c) => c.target.tabId).sort();
  assert.deepEqual(targets, [1, 3], "chrome:// пропускається");
  for (const call of env.calls.executeScript) {
    assert.deepEqual(plain(call.files), ["shared.js", "content.js"]);
  }
});

test("onInstalled не перезаписує вже збережені налаштування", async () => {
  const env = createBackgroundEnv({ store: { enabled: false, shortcuts: [] } });
  await env.handlers["runtime.onInstalled"]();
  assert.equal(env.store.enabled, false);
  assert.deepEqual(plain(env.store.shortcuts), []);
  assert.equal(env.store.protectFocus, true, "відсутні ключі добиваються");
});

test("EVENT_BLOCKED збільшує лічильник, веде журнал і ставить бейдж", async () => {
  const env = createBackgroundEnv({ tabs: [{ id: 7, url: "https://a.com/" }] });
  const reply = await send(
    env,
    { type: "EVENT_BLOCKED", payload: { label: "Ctrl + C", eventType: "keydown" } },
    { tab: { id: 7, url: "https://a.com/" } }
  );
  assert.equal(reply.ok, true);
  assert.equal(reply.count, 1);

  const stats = await send(env, { type: "GET_TAB_STATS", tabId: 7 });
  assert.equal(stats.count, 1);
  assert.equal(stats.log[0].label, "Ctrl + C");

  const last = env.calls.badgeText.at(-1);
  assert.deepEqual(plain(last), { tabId: 7, text: "1" });
});

test("журнал обмежений 30 записами, найновіші першими", async () => {
  const env = createBackgroundEnv();
  const sender = { tab: { id: 1, url: "https://a.com/" } };
  for (let i = 0; i < 35; i++) {
    await send(env, { type: "EVENT_BLOCKED", payload: { label: `K${i}`, eventType: "keydown" } }, sender);
  }
  const stats = await send(env, { type: "GET_TAB_STATS", tabId: 1 });
  assert.equal(stats.count, 35);
  assert.equal(stats.log.length, 30);
  assert.equal(stats.log[0].label, "K34");
});

test("CLEAR_TAB_STATS скидає лічильник і бейдж", async () => {
  const env = createBackgroundEnv({ tabs: [{ id: 1, url: "https://a.com/" }] });
  const sender = { tab: { id: 1, url: "https://a.com/" } };
  await send(env, { type: "EVENT_BLOCKED", payload: { label: "X" } }, sender);
  await send(env, { type: "CLEAR_TAB_STATS", tabId: 1 });
  const stats = await send(env, { type: "GET_TAB_STATS", tabId: 1 });
  assert.equal(stats.count, 0);
  assert.equal(env.calls.badgeText.at(-1).text, "");
});

test("бейдж OFF для вимкненого сайту, включно з піддоменом", async () => {
  const env = createBackgroundEnv({ store: { disabledHosts: ["example.com"] } });
  await send(
    env,
    { type: "EVENT_BLOCKED", payload: { label: "X" } },
    { tab: { id: 1, url: "https://www.example.com/page" } }
  );
  assert.equal(env.calls.badgeText.at(-1).text, "OFF");
});

test("бейдж OFF при глобальному вимкненні", async () => {
  const env = createBackgroundEnv({ store: { enabled: false } });
  await send(env, { type: "EVENT_BLOCKED", payload: { label: "X" } }, { tab: { id: 1, url: "https://a.com/" } });
  assert.equal(env.calls.badgeText.at(-1).text, "OFF");
});

test("повідомлення без вкладки-відправника відхиляється", async () => {
  const env = createBackgroundEnv();
  const reply = await send(env, { type: "EVENT_BLOCKED", payload: {} }, {});
  assert.equal(reply.ok, false);
});
