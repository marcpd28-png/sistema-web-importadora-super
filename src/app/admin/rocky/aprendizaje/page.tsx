import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { intents } from "@/lib/rocky/contracts";
import { PLANNING_APPROVAL } from "@/lib/rocky/reviewed-examples";

export const dynamic = "force-dynamic";

async function reviewIntent(form: FormData) {
  "use server";
  await requireAdmin();
  const id = String(form.get("id") || "");
  const intent = String(form.get("intent") || "");
  if (!id || !intents.some(value => value === intent)) throw new Error("Intención inválida");
  await prisma.rockyFeedback.updateMany({ where: { id, status: "APPROVED_FOR_EVALUATION", outcome: null }, data: { status: PLANNING_APPROVAL, outcome: `PLANNER:${intent}` } });
  revalidatePath("/admin/rocky/aprendizaje");
}

async function revokeIntent(form: FormData) {
  "use server";
  await requireAdmin();
  const id = String(form.get("id") || "");
  if (!id) throw new Error("Ejemplo inválido");
  await prisma.rockyFeedback.updateMany({ where: { id, status: PLANNING_APPROVAL }, data: { status: "APPROVED_FOR_EVALUATION", outcome: null } });
  revalidatePath("/admin/rocky/aprendizaje");
}

async function reviewFeedback(form: FormData) {
  "use server";
  await requireAdmin();
  const id = String(form.get("id") || "");
  const status = String(form.get("status") || "");
  if (!id || !["APPROVED_FOR_EVALUATION", "REJECTED"].includes(status)) throw new Error("Revisión inválida");
  await prisma.rockyFeedback.updateMany({ where: { id, status: status === "REJECTED" ? { in: ["AI_FEEDBACK", "APPROVED_FOR_EVALUATION"] } : "AI_FEEDBACK" }, data: { status } });
  revalidatePath("/admin/rocky/aprendizaje");
}

export default async function RockyLearningPage() {
  await requireAdmin();
  const feedback = await prisma.rockyFeedback.findMany({ where: { status: "AI_FEEDBACK" }, orderBy: { createdAt: "asc" }, take: 50,
    include: { run: { select: { triggerMessageId: true, result: true } } } });
  const messages = await prisma.chatMessage.findMany({ where: { id: { in: feedback.map(row => row.run.triggerMessageId) } }, select: { id: true, content: true } });
  const questions = new Map(messages.map(row => [row.id, row.content]));
  const approved = await prisma.rockyFeedback.count({ where: { status: "APPROVED_FOR_EVALUATION" } });
  const reviewed = await prisma.rockyFeedback.findMany({ where: { status: { in: ["APPROVED_FOR_EVALUATION", PLANNING_APPROVAL] } }, orderBy: { createdAt: "desc" }, take: 50,
    select: { id: true, status: true, outcome: true, run: { select: { triggerMessageId: true } } } });
  const reviewedMessages = await prisma.chatMessage.findMany({ where: { id: { in: reviewed.map(row => row.run.triggerMessageId) } }, select: { id: true, content: true } });
  const reviewedQuestions = new Map(reviewedMessages.map(row => [row.id, row.content]));
  return <section className="panel">
    <h1>Mejorar las respuestas de Rocky</h1>
    <p>Revisa las correcciones guardadas desde «Corregir sugerencia» en el simulador. Aprueba solo respuestas correctas y respaldadas por información de la tienda.</p>
    <p>Aprobar conserva el ejemplo para evaluación. Después puedes indicar qué consulta representa para ayudar a Rocky a entender preguntas parecidas. La respuesta corregida no se copia ni se usa como fuente de precios, stock o políticas.</p>
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
    <h2>Ejemplos para entender preguntas</h2>
    <p>Activa solo preguntas que se entiendan por sí solas, sin datos personales ni instrucciones para el sistema. Selecciona la intención correcta; no se deduce de la respuesta anterior. Puedes retirar un ejemplo en cualquier momento.</p>
    <p>Se muestran los 50 ejemplos revisados más recientes.</p>
    {reviewed.map(row => <article key={row.id} className="panel" style={{ marginTop: 20 }}>
      <p style={{ whiteSpace: "pre-wrap" }}>{reviewedQuestions.get(row.run.triggerMessageId) || "Mensaje no disponible"}</p>
      {row.status === PLANNING_APPROVAL ? <form action={revokeIntent}>
        <input type="hidden" name="id" value={row.id} />
        <p>Activo: {row.outcome?.replace("PLANNER:", "")}</p>
        <button className="btn btn-outline">Retirar del modelo</button>
      </form> : row.outcome !== null ? <p>Este ejemplo conserva un resultado comercial y permanece reservado para evaluación.</p> : <form action={reviewIntent}>
        <input type="hidden" name="id" value={row.id} />
        <label>Intención correcta <select name="intent" defaultValue="" required>
          <option value="" disabled>Selecciona la intención</option>
          {intents.map(intent => <option key={intent} value={intent}>{intent}</option>)}
        </select></label>{" "}
        <button className="btn btn-primary">Activar ejemplo de intención</button>
      </form>}
    </article>)}
  </section>;
}
