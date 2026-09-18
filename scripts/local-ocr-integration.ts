import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";

async function main() {
  const url = new URL(process.env.DATABASE_URL || "http://invalid");
  assert(process.argv.includes("--execute-local") && ["localhost", "127.0.0.1"].includes(url.hostname) && /^\/bc_goal_/.test(url.pathname), "Requires an isolated local bc_goal_* database");
  process.env.OPENAI_API_KEY = "";
  process.env.BC_LOCAL_IMAGE_OCR_ENABLED = "true";
  process.env.N8N_INTERNAL_API_KEY = randomUUID();
  const { prisma } = await import("../src/lib/prisma");
  const { POST } = await import("../src/app/api/internal/chat/router-v2/vision/route");
  const ids: string[] = [];
  function screenshot(lines: string[], format = "PNG") {
    const bytes = execFileSync("/usr/bin/python3", ["-c", `
import io,json,sys
from PIL import Image,ImageDraw,ImageFont
image=Image.new('RGB',(900,650),'white'); draw=ImageDraw.Draw(image)
font=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',42)
for i,line in enumerate(json.loads(sys.argv[1])): draw.text((40,40+i*100),line,font=font,fill='black')
image.save(sys.stdout.buffer,format=sys.argv[2])
`, JSON.stringify(lines), format]);
    return `data:image/${format === "PNG" ? "png" : "jpeg"};base64,${bytes.toString("base64")}`;
  }
  async function analyze(imageUrl: string) {
    const response = await POST(new Request("http://localhost/api/internal/chat/router-v2/vision", { method: "POST", headers: { "content-type": "application/json", "x-internal-api-key": process.env.N8N_INTERNAL_API_KEY! }, body: JSON.stringify({ imageUrl }) }));
    assert.equal(response.status, 200); return response.json();
  }
  try {
    for (const code of ["N1321", "A123"]) {
      const p = await prisma.product.create({ data: { code, slug: `ocr-${randomUUID()}`, name: "Producto OCR de prueba", imageUrl: "https://example.com/photo.jpg", unitPrice: 10, stockUnits: 10 } }); ids.push(p.id);
    }
    for (const format of ["PNG", "JPEG"]) {
      const result = await analyze(screenshot(["Publicacion de prueba", "CODIGO: N1321", "Consultar disponibilidad"], format));
      assert.equal(result.analysis.model, "local-tesseract-labeled-code", JSON.stringify(result));
      assert.equal(result.visualHints.code, "N1321");
    }
    for (const lines of [["CODIGO: N1321", "CODIGO: A123"], ["Producto N1321"], ["CODIGO: X99999"]]) {
      assert.equal((await analyze(screenshot(lines))).visualHints, null, JSON.stringify(lines));
    }
    await prisma.product.update({ where: { id: ids[0] }, data: { isVisible: false } });
    assert.equal((await analyze(screenshot(["CODIGO: N1321"]))).visualHints, null);
    assert.equal((await analyze("data:image/png;base64,iVBORw0KGgo=" )).visualHints, null);
    console.log("PASS: actual local Tesseract OCR + vision handler + PostgreSQL; PNG/JPEG labeled codes, multiple codes, unlabeled text, unknown/hidden products and malformed image; no AI provider");
  } finally {
    await prisma.product.deleteMany({ where: { id: { in: ids } } });
    await prisma.$disconnect();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
