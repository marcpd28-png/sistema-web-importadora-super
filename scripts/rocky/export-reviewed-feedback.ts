import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { prisma } from "../../src/lib/prisma";
import { redactSensitiveText } from "../../src/lib/rocky/guardrails";

const output = process.argv.find(arg => arg.startsWith("--output="))?.slice(9);
if (!output) throw new Error("Indica --output=.cache/rocky-feedback-revisado.json; archivo privado para revisión, no entrenamiento automático.");
const clean = (text: string) => redactSensitiveText(text)
  .replace(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi, "[correo]")
  .replace(/\b\d{7,}\b/g, "[dato numérico personal]");

async function main() {
  const rows = await prisma.rockyFeedback.findMany({ where: { status: "APPROVED_FOR_EVALUATION" },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    include: { run: { select: { conversationId: true, triggerMessageId: true } } } });
  const messages = await prisma.chatMessage.findMany({ where: { id: { in: rows.map(row => row.run.triggerMessageId) } }, select: { id: true, content: true } });
  const inputs = new Map(messages.map(message => [message.id, message.content]));
  const examples = rows.filter(row => inputs.has(row.run.triggerMessageId)).map(row => ({
    id: createHash("sha256").update(row.id).digest("hex").slice(0, 20),
    // Keep every example from one conversation in the same partition.
    partition: parseInt(createHash("sha256").update(row.run.conversationId).digest("hex").slice(0, 8), 16) % 5 === 0 ? "validation" : "development",
    input: clean(inputs.get(row.run.triggerMessageId)!), expectedAnswer: clean(row.humanResponse),
    privacyReviewRequired: true,
  }));
  await mkdir(path.dirname(output!), { recursive: true });
  await writeFile(output!, JSON.stringify({ version: 1, purpose: "manual-evaluation", note: "Revisar nombres, direcciones y otros datos personales antes de compartir. No memorizar precios ni stock. Mantener validación separada de desarrollo.", examples }, null, 2), { flag: "wx", mode: 0o600 });
  console.log(JSON.stringify({ exported: examples.length, development: examples.filter(e => e.partition === "development").length, validation: examples.filter(e => e.partition === "validation").length, output }));
}
main().catch(error => { console.error(error instanceof Error ? error.message : "Exportación fallida"); process.exitCode = 1; }).finally(() => prisma.$disconnect());
