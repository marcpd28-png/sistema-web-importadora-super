import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { saveMessageTemplate } from "@/lib/message-templates-service";
import { templateErrorResponse } from "@/lib/message-templates-http";

type Context = { params: Promise<{ id: string }> };

export async function PUT(request: Request, { params }: Context) {
  const session = await getSession();
  if (session?.role !== "ADMIN" || session.requirePasswordChange) return Response.json({ error: "No autorizado." }, { status: 401 });
  try {
    const { id } = await params;
    await saveMessageTemplate(await request.json(), id);
    return Response.json({ ok: true });
  } catch (error) { return templateErrorResponse(error); }
}

export async function DELETE(_request: Request, { params }: Context) {
  const session = await getSession();
  if (session?.role !== "ADMIN" || session.requirePasswordChange) return Response.json({ error: "No autorizado." }, { status: 401 });
  try {
    const { id } = await params;
    await prisma.messageTemplate.delete({ where: { id } });
    return Response.json({ ok: true });
  } catch (error) { return templateErrorResponse(error); }
}
