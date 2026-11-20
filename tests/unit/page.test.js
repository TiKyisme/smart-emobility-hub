// Static checks of the browser entry point: every module parses and every DOM hook exists.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../", import.meta.url));
const read = (path) => readFileSync(join(root, path), "utf8");

function jsFiles(directory) {
  return readdirSync(join(root, directory), { withFileTypes: true }).flatMap((entry) => {
    const path = `${directory}/${entry.name}`;
    if (entry.isDirectory()) return jsFiles(path);
    return entry.name.endsWith(".js") ? [path] : [];
  });
}

test("node --check passes for every JavaScript module in src/", () => {
  const files = jsFiles("src");
  assert.ok(files.length >= 13, `found ${files.length} modules`);
  for (const file of files) {
    const run = spawnSync(process.execPath, ["--check", join(root, file)], { encoding: "utf8" });
    assert.equal(run.status, 0, `${file}: ${run.stderr}`);
  }
});

test("index.html loads the ES module entry point and has unique element ids", () => {
  const html = read("index.html");
  assert.match(html, /<script type="module" src="\.\/src\/main\.js"><\/script>/);
  assert.match(html, /<link rel="stylesheet" href="\.\/src\/styles\.css" \/>/);
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
  assert.equal(new Set(ids).size, ids.length, "duplicate id in index.html");
});

test("every element id used by main.js and render.js exists in index.html", () => {
  const html = read("index.html");
  const ids = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]));
  const used = new Set();
  for (const file of ["src/main.js", "src/ui/render.js"]) {
    const source = read(file);
    for (const match of source.matchAll(/"#([\w-]+)"/g)) used.add(match[1]);
    for (const match of source.matchAll(/(?:setOptions|numberInput|selectedValue|isChecked)\(\s*"([\w-]+)"/g)) used.add(match[1]);
  }
  assert.ok(used.size >= 35, `found ${used.size} ids`);
  for (const id of used) assert.ok(ids.has(id), `#${id} is used by the scripts but missing from index.html`);
});
