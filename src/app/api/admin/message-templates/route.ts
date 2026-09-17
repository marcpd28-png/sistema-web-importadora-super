import { getSession } from "@/lib/auth";
import { listMessageTemplates, saveMessageTemplate } from "@/lib/message-templates-service";
import { templateErrorResponse } from "@/lib/message-templates-http";

export async function GET(request: Request) {
  const session = await getSession();
  if (session?.role !== "ADMIN" || session.requirePasswordChange) return Response.json({ error: "No autorizado." }, { status: 401 });
  try {
    return Response.json({ items: await listMessageTemplates(new URL(request.url).searchParams.get("active") === "true") }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return templateErrorResponse(error); }
}

export async function POST(request: Request) {
  const session = await getSession();
  if (session?.role !== "ADMIN" || session.requirePasswordChange) return Response.json({ error: "No autorizado." }, { status: 401 });
  try {
    const template = await saveMessageTemplate(await request.json());
    return Response.json({ id: template.id }, { status: 201 });
  } catch (error) { return templateErrorResponse(error); }
}
