"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { ROOT, read } = require("./harness");

const manifest = JSON.parse(read("manifest.json"));

test("manifest: усі згадані файли існують", () => {
  const files = new Set([
    manifest.background.service_worker,
    manifest.action.default_popup,
    ...Object.values(manifest.action.default_icon),
    ...Object.values(manifest.icons),
    ...manifest.content_scripts.flatMap((c) => c.js)
  ]);
  for (const f of files) {
    assert.ok(fs.existsSync(path.join(ROOT, f)), `відсутній файл ${f}`);
  }
});

test("manifest: shared.js підключається перед content.js", () => {
  const js = manifest.content_scripts[0].js;
  assert.ok(js.indexOf("shared.js") >= 0 && js.indexOf("shared.js") < js.indexOf("content.js"));
});

test("manifest: MV3, content script на document_start у всіх фреймах", () => {
  assert.equal(manifest.manifest_version, 3);
  const cs = manifest.content_scripts[0];
  assert.equal(cs.run_at, "document_start");
  assert.equal(cs.all_frames, true);
});

test("popup.html: shared.js підключено перед popup.js", () => {
  const html = read("popup.html");
  const shared = html.indexOf('src="shared.js"');
  const popup = html.indexOf('src="popup.js"');
  assert.ok(shared >= 0 && popup > shared);
});

test("popup.js: усі getElementById мають відповідні id у popup.html", () => {
  const html = read("popup.html");
  const js = read("popup.js");
  const ids = [...js.matchAll(/getElementById\("([^"]+)"\)/g)].map((m) => m[1]);
  assert.ok(ids.length > 20);
  for (const id of ids) {
    assert.ok(html.includes(`id="${id}"`), `у popup.html немає id="${id}"`);
  }
});

test("синтаксис усіх скриптів коректний", () => {
  for (const f of ["shared.js", "content.js", "background.js", "popup.js"]) {
    assert.doesNotThrow(() => new vm.Script(read(f), { filename: f }), f);
  }
});

test("дефолти більше не дублюються поза shared.js", () => {
  for (const f of ["content.js", "background.js", "popup.js"]) {
    assert.ok(!/id:\s*"ctrl\+c"/.test(read(f)), `${f} містить копію DEFAULT_SETTINGS`);
  }
});
