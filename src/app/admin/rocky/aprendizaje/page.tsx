import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

async function reviewFeedback(form: FormData) {
  "use server";
  await requireAdmin();
  const id = String(form.get("id") || "");
  const status = String(form.get("status") || "");
  if (!id || !["APPROVED_FOR_EVALUATION", "REJECTED"].includes(status)) throw new Error("Revisión inválida");
  await prisma.rockyFeedback.updateMany({ where: { id, status: "AI_FEEDBACK" }, data: { status } });
  revalidatePath("/admin/rocky/aprendizaje");
}

export default async function RockyLearningPage() {
  await requireAdmin();
  const feedback = await prisma.rockyFeedback.findMany({ where: { status: "AI_FEEDBACK" }, orderBy: { createdAt: "asc" }, take: 50,
    include: { run: { select: { triggerMessageId: true, result: true } } } });
  const messages = await prisma.chatMessage.findMany({ where: { id: { in: feedback.map(row => row.run.triggerMessageId) } }, select: { id: true, content: true } });
  const questions = new Map(messages.map(row => [row.id, row.content]));
  const approved = await prisma.rockyFeedback.count({ where: { status: "APPROVED_FOR_EVALUATION" } });
  return <section className="panel">
    <h1>Mejorar las respuestas de Rocky</h1>
    <p>Revisa las correcciones guardadas desde «Corregir sugerencia» en el simulador. Aprueba solo respuestas correctas y respaldadas por información de la tienda.</p>
    <p>Aprobar conserva el ejemplo para evaluación. No entrena el modelo ni publica respuestas automáticamente. Precios, stock y políticas deben verificarse antes de reutilizar un ejemplo.</p>
    <p>{approved} ejemplos aprobados para evaluación. Mostrando hasta 50 correcciones pendientes.</p>
    <a href="/admin/mensajes/simulador">Volver al simulador</a>
    {!feedback.length && <p>No hay correcciones pendientes de revisión.</p>}
    {feedback.map(row => {
      const result = row.run.result as { reply?: string } | null;
      return <article key={row.id} className="panel" style={{ marginTop: 20 }}>
        <h2>Corrección del {row.createdAt.toLocaleDateString("es-PE", { timeZone: "America/Lima" })}</h2>
        <h3>Mensaje del cliente</h3><p style={{ whiteSpace: "pre-wrap" }}>{questions.get(row.run.triggerMessageId) || "Mensaje no disponible"}</p>
        <h3>Respuesta de Rocky</h3><p style={{ whiteSpace: "pre-wrap" }}>{result?.reply || "Respuesta no disponible"}</p>
        <h3>Respuesta corregida</h3><p style={{ whiteSpace: "pre-wrap" }}>{row.humanResponse}</p>
        <form action={reviewFeedback}>
          <input type="hidden" name="id" value={row.id} />
          <button className="btn btn-primary" name="status" value="APPROVED_FOR_EVALUATION">Aprobar para evaluación</button>{" "}
          <button className="btn btn-outline" name="status" value="REJECTED">Descartar ejemplo</button>
        </form>
      </article>;
    })}
  </section>;
}
