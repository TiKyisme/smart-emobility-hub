// Static checks of the browser entry point: every module parses, every DOM hook exists,
// navigation matches the pages, and the stylesheet keeps square corners.
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
  assert.ok(files.length >= 17, `found ${files.length} modules`);
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

test("every element id used by the scripts exists in index.html or is created by a view", () => {
  const html = read("index.html");
  const scripts = jsFiles("src").filter((file) => file === "src/main.js" || file.startsWith("src/ui/")).map(read);
  const known = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]));
  for (const source of scripts) for (const match of source.matchAll(/\bid="([\w-]+)"/g)) known.add(match[1]);
  const used = new Set();
  for (const source of scripts) for (const match of source.matchAll(/"#([\w-]+)"/g)) used.add(match[1]);
  assert.ok(used.size >= 40, `found ${used.size} ids`);
  for (const id of used) assert.ok(known.has(id), `#${id} is used by the scripts but never defined`);
});

test("every navigation link has a page section and every section is reachable", () => {
  const html = read("index.html");
  const links = [...html.matchAll(/class="nav-link" href="#(\w+)" data-page="(\w+)"/g)];
  const sections = [...html.matchAll(/<section id="page-(\w+)" class="page" data-page="(\w+)"/g)].map((match) => match[2]);
  assert.deepEqual(links.map((match) => match[1]), links.map((match) => match[2]), "href and data-page agree");
  assert.deepEqual(links.map((match) => match[2]).sort(), [...sections].sort());
  const renderer = read("src/ui/render.js");
  for (const page of sections) assert.match(renderer, new RegExp(`\\b${page}: \\{ portal:`), `render.js handles ${page}`);
});

test("owner requirement: boxes have square corners (no rounded border-radius)", () => {
  const css = read("src/styles.css");
  const radii = [...css.matchAll(/border-radius\s*:\s*([^;}\n]+)/g)].map((match) => match[1].trim());
  assert.deepEqual([...new Set(radii)], ["0"]);
});
