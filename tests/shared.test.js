"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { loadShared, plain } = require("./harness");

const S = loadShared();

test("normalizeSettings: порожні дані дають повні значення за замовчуванням", () => {
  const s = S.normalizeSettings(undefined);
  assert.equal(s.enabled, true);
  assert.equal(s.protectClipboard, true);
  assert.equal(s.protectContextMenu, true);
  assert.equal(s.protectFocus, true);
  assert.equal(s.protectSelection, false);
  assert.equal(s.shortcuts.length, 7);
  assert.deepEqual(plain(s.disabledHosts), []);
});

test("normalizeSettings: некоректні типи ігноруються", () => {
  const s = S.normalizeSettings({
    enabled: "yes",
    disabledHosts: ["a.com", 5, "", null],
    protectFocus: false,
    shortcuts: "nope"
  });
  assert.equal(s.enabled, true);
  assert.equal(s.protectFocus, false);
  assert.deepEqual(plain(s.disabledHosts), ["a.com"]);
  assert.equal(s.shortcuts.length, 7);
});

test("normalizeSettings: порожній список комбінацій зберігається", () => {
  assert.deepEqual(plain(S.normalizeSettings({ shortcuts: [] }).shortcuts), []);
});

test("cloneDefaults повертає незалежні копії", () => {
  const a = S.cloneDefaults();
  const b = S.cloneDefaults();
  a.shortcuts[0].enabled = false;
  a.disabledHosts.push("x.com");
  assert.equal(b.shortcuts[0].enabled, true);
  assert.equal(b.disabledHosts.length, 0);
  assert.equal(S.DEFAULT_SETTINGS.shortcuts[0].enabled, true);
});

test("hostMatchesEntry: точний збіг і піддомени", () => {
  assert.equal(S.hostMatchesEntry("example.com", "example.com"), true);
  assert.equal(S.hostMatchesEntry("www.example.com", "example.com"), true);
  assert.equal(S.hostMatchesEntry("a.b.example.com", "example.com"), true);
  assert.equal(S.hostMatchesEntry("EXAMPLE.com.", "example.COM"), true);
});

test("hostMatchesEntry: схожі, але чужі домени не збігаються", () => {
  assert.equal(S.hostMatchesEntry("notexample.com", "example.com"), false);
  assert.equal(S.hostMatchesEntry("example.com.evil.io", "example.com"), false);
  assert.equal(S.hostMatchesEntry("example.com", "www.example.com"), false);
  assert.equal(S.hostMatchesEntry("", "example.com"), false);
  assert.equal(S.hostMatchesEntry("example.com", ""), false);
});

test("addHost / removeHost / isHostDisabled", () => {
  let list = S.addHost([], "Example.com");
  assert.deepEqual(plain(list), ["example.com"]);
  assert.deepEqual(plain(S.addHost(list, "www.example.com")), ["example.com"], "піддомен уже покритий");
  assert.equal(S.isHostDisabled("www.example.com", list), true);
  assert.equal(S.isHostDisabled("other.com", list), false);

  list = S.addHost(list, "other.com");
  list = S.removeHost(list, "www.example.com");
  assert.deepEqual(plain(list), ["other.com"], "прибираються записи, що покривають хост");
});

test("isHostDisabled не падає на не-масиві", () => {
  assert.equal(S.isHostDisabled("a.com", undefined), false);
});
