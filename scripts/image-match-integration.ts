import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";

async function main() {
  const url = new URL(process.env.DATABASE_URL || "http://invalid");
  assert(process.argv.includes("--execute-local") && ["localhost", "127.0.0.1"].includes(url.hostname) && /^\/bc_goal_/.test(url.pathname), "Requires an isolated local bc_goal_* database");
  process.env.OPENAI_API_KEY = "";
  process.env.N8N_INTERNAL_API_KEY = randomUUID();
  const { prisma } = await import("../src/lib/prisma");
  const { POST } = await import("../src/app/api/internal/chat/router-v2/vision/route");
  const ids: string[] = [];
  const run = randomUUID();
  const base64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jT5sAAAAASUVORK5CYII=";
  const hash = createHash("sha256").update(Buffer.from(base64, "base64")).digest("hex");
  async function analyze() {
    const response = await POST(new Request("http://localhost/api/internal/chat/router-v2/vision", { method: "POST", headers: { "content-type": "application/json", "x-internal-api-key": process.env.N8N_INTERNAL_API_KEY! }, body: JSON.stringify({ imageUrl: `data:image/png;base64,${base64}`, customerMessage: "quiero este" }) }));
    assert.equal(response.status, 200); return response.json();
  }
  try {
    const p = await prisma.product.create({ data: { code: `PHOTO-${run}`, slug: `photo-${run}`, name: "Foto de prueba", imageUrl: "https://example.com/test.png", unitPrice: 10, stockUnits: 10, sourceImageContentHash: hash } });
    ids.push(p.id);
    const found = await analyze();
    assert.equal(found.analysis.model, "catalog-source-image-sha256"); assert.equal(found.visualHints.code, p.code);
    const duplicate = await prisma.product.create({ data: { code: `COPY-${run}`, slug: `copy-${run}`, name: "Otra variante con la misma foto", imageUrl: "https://example.com/test.png", unitPrice: 20, stockUnits: 10, sourceImageContentHash: hash } });
    ids.push(duplicate.id);
    assert.equal((await analyze()).visualHints, null, "shared photos do not prove which variant the customer wants");
    await prisma.product.update({ where: { id: duplicate.id }, data: { isVisible: false } });
    assert.equal((await analyze()).visualHints.code, p.code);
    await prisma.product.update({ where: { id: p.id }, data: { isVisible: false } });
    assert.equal((await analyze()).analysis.status, "NOT_CONFIGURED", "no hidden catalog data is returned when all matches are hidden");
    console.log("PASS: vision handler + PostgreSQL, unique exact photo without AI, duplicate ambiguity and live visibility changes");
  } finally {
    await prisma.product.deleteMany({ where: { id: { in: ids } } });
    await prisma.$disconnect();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
