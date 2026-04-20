#!/usr/bin/env node
/**
 * pnpm new:plugin <id>
 *
 * Copies plugins/template/ to plugins/<id>/ and rewrites the id in:
 *   - main.js (comments mentioning "template")
 *   - manifest.json ("id", "name")
 *   - package.json ("name")
 *   - README.md (one-liner)
 *
 * Refuses to overwrite an existing directory.
 */
import { cp, readFile, readdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, "..");

const rawId = process.argv[2];
if (!rawId) {
  console.error("usage: pnpm new:plugin <id>");
  console.error('id must match /^[a-z][a-z0-9_-]{1,31}$/ (e.g., "my-plugin")');
  process.exit(1);
}
if (!/^[a-z][a-z0-9_-]{1,31}$/.test(rawId)) {
  console.error(`invalid id "${rawId}". must match /^[a-z][a-z0-9_-]{1,31}$/`);
  process.exit(1);
}

const src = join(repo, "plugins", "template");
const dest = join(repo, "plugins", rawId);
if (existsSync(dest)) {
  console.error(`plugins/${rawId}/ already exists. pick another id.`);
  process.exit(1);
}

await cp(src, dest, { recursive: true });

// Rewrite text files. Anything binary will be left alone.
const textFiles = ["main.js", "manifest.json", "package.json", "README.md"];
for (const name of textFiles) {
  const p = join(dest, name);
  if (!existsSync(p)) continue;
  let content = await readFile(p, "utf8");
  content = content
    .replaceAll("@atlas-plugin/template", `@atlas-plugin/${rawId}`)
    .replaceAll('"id": "template"', `"id": "${rawId}"`)
    .replaceAll('"name": "Template Plugin"', `"name": "${titleCase(rawId)}"`)
    .replaceAll("vault:plugins/template", `vault:plugins/${rawId}`)
    .replaceAll("Template Plugin", titleCase(rawId))
    .replaceAll("template", rawId);
  await writeFile(p, content, "utf8");
}

console.log(`created plugins/${rawId}/`);
console.log(`next: edit plugins/${rawId}/main.js, restart \`pnpm tauri:dev\`, try /${rawId}.hello`);

function titleCase(id) {
  return id
    .split(/[-_]/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}
