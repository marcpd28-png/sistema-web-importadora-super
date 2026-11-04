"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { requireMessagingOwner } from "@/lib/auth";

export async function createTemplateAction() {
  await requireMessagingOwner();

  await prisma.messageTemplate.create({
    data: {
      name: `Bienvenida ${Math.floor(Math.random() * 1000)}`,
      content: "Hola, gracias por comunicarte con nosotros. ¿En qué podemos ayudarte hoy?",
      category: "General",
      isActive: true,
    }
  });
  revalidatePath("/admin/mensajes/plantillas");
}

export async function deleteTemplateAction(formData: FormData) {
  await requireMessagingOwner();

  const id = formData.get("id") as string;
  if (!id) return;
  await prisma.messageTemplate.delete({ where: { id } });
  revalidatePath("/admin/mensajes/plantillas");
}
