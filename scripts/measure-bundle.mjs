import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { brotliCompressSync, gzipSync } from "node:zlib";

const root = join(process.cwd(), ".next", "static", "chunks");
const files = await walk(root);
const rows = [];

for (const file of files.filter((path) => path.endsWith(".js"))) {
  const contents = await readFile(file);
  rows.push({
    file: relative(root, file),
    rawBytes: contents.byteLength,
    gzipBytes: gzipSync(contents).byteLength,
    brotliBytes: brotliCompressSync(contents).byteLength,
  });
}

const totals = rows.reduce(
  (sum, row) => ({
    rawBytes: sum.rawBytes + row.rawBytes,
    gzipBytes: sum.gzipBytes + row.gzipBytes,
    brotliBytes: sum.brotliBytes + row.brotliBytes,
  }),
  { rawBytes: 0, gzipBytes: 0, brotliBytes: 0 },
);

console.log(JSON.stringify({ scope: ".next/static/chunks/**/*.js", totals, files: rows }, null, 2));

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  return (await Promise.all(entries.map((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
  }))).flat();
}
