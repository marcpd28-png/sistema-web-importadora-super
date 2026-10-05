import { cp, mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const source = path.dirname(require.resolve("pdfjs-dist/package.json"));
const { version } = require("pdfjs-dist/package.json");
const destination = path.join(process.cwd(), "public", "pdfjs", version);
await mkdir(destination, { recursive: true });
for (const name of ["cmaps", "standard_fonts", "wasm", "iccs", "LICENSE"]) {
  await cp(path.join(source, name), path.join(destination, name), { recursive: true });
}
await cp(path.join(source, "build/pdf.worker.min.mjs"), path.join(destination, "pdf.worker.min.mjs"));
