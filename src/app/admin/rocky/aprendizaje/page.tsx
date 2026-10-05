import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export default async function LearningPage() {
  await requireAdmin();
  const [current, historical] = await Promise.all([
    prisma.chatMessage.findMany({ where: { status: "review_feedback", conversation: { contact: { externalId: { startsWith: "SIMULATOR:" } } } }, orderBy: { createdAt: "desc" }, take: 100 }),
    prisma.$queryRaw<Array<{ id: string; humanResponse: string | null; status: string; createdAt: Date }>>`SELECT id, "humanResponse", status, "createdAt" FROM "RockyFeedback" ORDER BY "createdAt" DESC LIMIT 100`,
  ]);
  return <section className="panel stack-md">
    <p className="eyebrow">Evaluación supervisada</p><h1>Correcciones de Rocky</h1>
    <p>Conservamos las correcciones actuales y el historial anterior. Son material de revisión: no activan modelos antiguos ni modifican automáticamente precios, stock o reglas.</p>
    <Link className="button button-primary" href="/admin/mensajes/evaluacion-rocky">Evaluar con el motor actual</Link>
    <h2>Correcciones actuales</h2>
    {!current.length && <p>Aún no hay correcciones guardadas con el motor actual.</p>}
    {current.map(row => <article key={row.id} className="panel"><time>{row.createdAt.toLocaleString("es-PE", { hour12: true, timeZone: "America/Lima" })}</time><p style={{ whiteSpace: "pre-wrap" }}>{row.content}</p></article>)}
    <h2>Archivo histórico</h2>
    {historical.map(row => <article key={row.id} className="panel"><time>{row.createdAt.toLocaleString("es-PE", { hour12: true, timeZone: "America/Lima" })}</time><p>{row.status}</p><p style={{ whiteSpace: "pre-wrap" }}>{row.humanResponse}</p></article>)}
  </section>;
}
