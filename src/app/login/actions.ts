"use server";

import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { createSession } from "@/lib/auth";
import { parseLoginForm } from "@/lib/validation";

export async function loginAction(formData: FormData) {
  const { email, password } = parseLoginForm(formData);
  const normalizedEmail = email.trim().toLowerCase();

  const user = await prisma.user.findUnique({
    where: { email: normalizedEmail },
  });

  if (!user || user.role !== "ADMIN" || !(await bcrypt.compare(password, user.passwordHash))) {
    redirect("/login?error=Credenciales%20inválidas");
  }

  await createSession({
    userId: user.id,
    email: user.email,
    name: user.name,
    role: "ADMIN",
    requirePasswordChange: user.requirePasswordChange,
  });

  redirect("/admin");
}
