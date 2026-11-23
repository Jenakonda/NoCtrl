"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { createContentEnv, plain } = require("./harness");

const ctrl = { ctrlKey: true };

test("Ctrl+C: подія зупиняється, preventDefault не викликається, сповіщення надсилається", () => {
  const env = createContentEnv();
  const e = env.fire("keydown", { ...ctrl, code: "KeyC", key: "c" });
  assert.equal(e.stopped, true);
  assert.equal(e.propagationStopped, true);
  assert.equal(e.prevented, false);
  assert.equal(env.messages.length, 1);
  assert.equal(env.messages[0].type, "EVENT_BLOCKED");
  assert.equal(env.messages[0].payload.label, "Ctrl + C");
});

test("українська розкладка: зіставлення за code, а не key", () => {
  const env = createContentEnv();
  const e = env.fire("keydown", { ...ctrl, code: "KeyC", key: "с" });
  assert.equal(e.stopped, true);
});

test("клавіша без збігу проходить до сторінки", () => {
  const env = createContentEnv();
  assert.equal(env.fire("keydown", { code: "KeyQ", key: "q" }).stopped, false);
  assert.equal(env.fire("keydown", { ...ctrl, code: "KeyQ", key: "q" }).stopped, false);
  assert.equal(env.fire("keydown", { ctrlKey: true, shiftKey: true, code: "KeyC" }).stopped, false, "зайвий модифікатор");
  assert.equal(env.messages.length, 0);
});

test("F12 блокується без модифікаторів", () => {
  const env = createContentEnv();
  assert.equal(env.fire("keydown", { code: "F12", key: "F12" }).stopped, true);
});

test("автоповтор (repeat) блокується, але не дублює сповіщення", () => {
  const env = createContentEnv();
  env.fire("keydown", { ...ctrl, code: "KeyC" });
  const again = env.fire("keydown", { ...ctrl, code: "KeyC", repeat: true });
  assert.equal(again.stopped, true);
  assert.equal(env.messages.length, 1);
});

test("keypress і keyup заблокованої комбінації теж зупиняються", () => {
  const env = createContentEnv();
  env.fire("keydown", { ...ctrl, code: "KeyC" });
  assert.equal(env.fire("keypress", { code: "KeyC" }).stopped, true);
  assert.equal(env.fire("keyup", { code: "KeyC" }).stopped, true);
  // після keyup стан очищено
  assert.equal(env.fire("keypress", { code: "KeyC" }).stopped, false);
});

test("недовірені (синтетичні) події не чіпаються", () => {
  const env = createContentEnv();
  const e = env.fire("keydown", { ...ctrl, code: "KeyC", isTrusted: false });
  assert.equal(e.stopped, false);
  assert.equal(env.messages.length, 0);
});

test("вимкнена комбінація не блокується", () => {
  const shortcuts = plain(createContentEnv().settings.shortcuts).map((s) =>
    s.id === "ctrl+c" ? { ...s, enabled: false } : s
  );
  const env = createContentEnv({ store: { shortcuts } });
  assert.equal(env.fire("keydown", { ...ctrl, code: "KeyC" }).stopped, false);
  assert.equal(env.fire("keydown", { ...ctrl, code: "KeyV" }).stopped, true);
});

test("порожній список комбінацій зі сховища нічого не блокує", () => {
  const env = createContentEnv({ store: { shortcuts: [] } });
  assert.equal(env.fire("keydown", { ...ctrl, code: "KeyC" }).stopped, false);
});

test("Ctrl+Enter: збіг за code, key і \\n", () => {
  const shortcuts = [{ id: "ctrl+enter", ctrl: true, alt: false, shift: false, meta: false, code: "Enter", label: "Ctrl + Enter", enabled: true }];
  const env = createContentEnv({ store: { shortcuts } });
  assert.equal(env.fire("keydown", { ...ctrl, code: "Enter", key: "Enter" }).stopped, true);
  assert.equal(env.fire("keydown", { ...ctrl, code: "NumpadEnter", key: "Enter" }).stopped, true);
  assert.equal(env.fire("keydown", { ...ctrl, code: "", key: "\n", keyCode: 10 }).stopped, true);
  assert.equal(env.fire("keydown", { code: "Enter", key: "Enter" }).stopped, false, "без Ctrl");
});

test("комбінація лише з модифікатором (Ctrl)", () => {
  const shortcuts = [{ id: "ctrl", ctrl: true, alt: false, shift: false, meta: false, code: "", label: "Ctrl", enabled: true }];
  const env = createContentEnv({ store: { shortcuts } });
  assert.equal(env.fire("keydown", { ctrlKey: true, code: "ControlLeft", key: "Control" }).stopped, true);
  assert.equal(env.fire("keydown", { code: "KeyA", key: "a" }).stopped, false);
});

test("глобальне вимкнення знімає захист", () => {
  const env = createContentEnv({ store: { enabled: false } });
  assert.equal(env.fire("keydown", { ...ctrl, code: "KeyC" }).stopped, false);
  assert.equal(env.fire("copy").stopped, false);
});

test("сайт у disabledHosts не захищається, включно з піддоменами", () => {
  const exact = createContentEnv({ hostname: "example.com", store: { disabledHosts: ["example.com"] } });
  assert.equal(exact.fire("keydown", { ...ctrl, code: "KeyC" }).stopped, false);

  const sub = createContentEnv({ hostname: "www.example.com", store: { disabledHosts: ["example.com"] } });
  assert.equal(sub.fire("keydown", { ...ctrl, code: "KeyC" }).stopped, false);

  const other = createContentEnv({ hostname: "notexample.com", store: { disabledHosts: ["example.com"] } });
  assert.equal(other.fire("keydown", { ...ctrl, code: "KeyC" }).stopped, true);
});

test("буфер обміну: copy/cut/paste зупиняються, перемикач їх пропускає", () => {
  const on = createContentEnv();
  for (const type of ["copy", "cut", "paste"]) {
    const e = on.fire(type);
    assert.equal(e.stopped, true, type);
    assert.equal(e.prevented, false, type);
  }
  assert.equal(on.fire("selectstart").stopped, true);
  assert.equal(on.fire("beforeinput", { inputType: "insertFromPaste" }).stopped, true);
  assert.equal(on.fire("beforeinput", { inputType: "insertText" }).stopped, false);

  const off = createContentEnv({ store: { protectClipboard: false } });
  for (const type of ["copy", "cut", "paste", "selectstart"]) {
    assert.equal(off.fire(type).stopped, false, type);
  }
});

test("контекстне меню та права кнопка миші", () => {
  const on = createContentEnv();
  assert.equal(on.fire("contextmenu").stopped, true);
  assert.equal(on.fire("mousedown", { button: 2 }).stopped, true);
  assert.equal(on.fire("mouseup", { button: 2 }).stopped, true);
  assert.equal(on.fire("mousedown", { button: 0 }).stopped, false, "ліва кнопка не чіпається");

  const off = createContentEnv({ store: { protectContextMenu: false } });
  assert.equal(off.fire("contextmenu").stopped, false);
  assert.equal(off.fire("mousedown", { button: 2 }).stopped, false);
});

test("фокус: події вікна й документа блокуються", () => {
  const env = createContentEnv();
  assert.equal(env.fire("blur", { target: env.win }).stopped, true);
  assert.equal(env.fire("focus", { target: env.win }).stopped, true);
  assert.equal(env.fire("visibilitychange", { target: env.sandbox.document }, { onDocument: true }).stopped, true);
  assert.equal(env.fire("mouseleave", { target: env.documentElement }).stopped, true);
  assert.equal(env.fire("mouseleave", { target: env.body }).stopped, true);
});

test("фокус: події окремих елементів НЕ блокуються (поля вводу, hover-меню)", () => {
  const env = createContentEnv();
  const input = { tagName: "INPUT" };
  const div = { tagName: "DIV" };
  assert.equal(env.fire("focus", { target: input }).stopped, false);
  assert.equal(env.fire("focusin", { target: input }).stopped, false);
  assert.equal(env.fire("blur", { target: input }).stopped, false);
  assert.equal(env.fire("focusout", { target: input }).stopped, false);
  assert.equal(env.fire("mouseenter", { target: div }).stopped, false);
  assert.equal(env.fire("mouseleave", { target: div }).stopped, false);
});

test("фокус: перемикач protectFocus=false пропускає і події вікна", () => {
  const env = createContentEnv({ store: { protectFocus: false } });
  assert.equal(env.fire("blur", { target: env.win }).stopped, false);
});

test("selectionchange: за замовчуванням проходить, з protectSelection — блокується", () => {
  const def = createContentEnv();
  assert.equal(def.fire("selectionchange").stopped, false);

  const on = createContentEnv({ store: { protectSelection: true } });
  assert.equal(on.fire("selectionchange").stopped, true);
});

test("selectionchange одразу після заблокованої клавіші (Ctrl+A) приховується", () => {
  const env = createContentEnv();
  env.fire("keydown", { ...ctrl, code: "KeyA" });
  assert.equal(env.fire("selectionchange").stopped, true);
});

test("зміни у storage застосовуються на льоту", () => {
  const env = createContentEnv();
  assert.equal(env.fire("keydown", { ...ctrl, code: "KeyC" }).stopped, true);

  env.emitStorageChange({ enabled: { newValue: false } });
  assert.equal(env.fire("keydown", { ...ctrl, code: "KeyC" }).stopped, false);

  env.emitStorageChange({ enabled: { newValue: true }, protectSelection: { newValue: true } });
  assert.equal(env.fire("keydown", { ...ctrl, code: "KeyC" }).stopped, true);
  assert.equal(env.fire("selectionchange").stopped, true);

  env.emitStorageChange({ disabledHosts: { newValue: ["example.com"] } });
  assert.equal(env.fire("keydown", { ...ctrl, code: "KeyC" }).stopped, false);

  // видалення ключа не скидає інші налаштування
  env.emitStorageChange({ disabledHosts: { oldValue: ["example.com"] } });
  assert.equal(env.fire("keydown", { ...ctrl, code: "KeyC" }).stopped, false);
});

test("повторне підключення content.js не дублює слухачі", () => {
  const env = createContentEnv();
  const before = env.listeners.window.length + env.listeners.document.length;
  env.reload();
  assert.equal(env.listeners.window.length + env.listeners.document.length, before);
});
