import "server-only";

import nodemailer from "nodemailer";
import { buildComplaintResponseText } from "@/lib/complaints";

type ComplaintEmailResult = {
  ok: boolean;
  message: string;
};

function getComplaintSmtpConfig() {
  const host = process.env.SMTP_HOST?.trim();
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASS?.trim();
  const port = Number(process.env.SMTP_PORT ?? "587");
  const secure = String(process.env.SMTP_SECURE ?? "false") === "true";
  const from = process.env.SMTP_FROM?.trim() || (user ? `Importaciones Super <${user}>` : null);
  const enabled = Boolean(host && user && pass && Number.isFinite(port) && from);

  return {
    enabled,
    host,
    user,
    pass,
    port,
    secure,
    from,
  };
}

export async function sendComplaintResponseEmail(input: {
  contact: {
    customerName: string;
    customerEmail: string | null;
    customerPhone: string | null;
    claimCode: string;
  };
  responseText: string;
  subject: string;
}): Promise<ComplaintEmailResult> {
  const config = getComplaintSmtpConfig();

  if (!config.enabled || !input.contact.customerEmail) {
    return {
      ok: false,
      message: !input.contact.customerEmail
        ? "El reclamo no tiene correo registrado."
        : "SMTP no configurado.",
    };
  }

  const from = config.from;

  if (!from) {
    return {
      ok: false,
      message: "SMTP no configurado.",
    };
  }

  const transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: {
      user: config.user,
      pass: config.pass,
    },
  });

  const html = [
    `<p>Hola ${input.contact.customerName},</p>`,
    `<p>Hemos registrado una respuesta para tu reclamo <strong>${input.contact.claimCode}</strong> sobre <strong>${input.subject}</strong>.</p>`,
    `<p>${input.responseText.trim().replace(/\n/g, "<br />")}</p>`,
    "<p>Saludos,<br />Importaciones Super</p>",
  ].join("");

  await transporter.sendMail({
    from,
    to: input.contact.customerEmail,
    subject: `Respuesta Libro de Reclamaciones ${input.contact.claimCode}`,
    text: buildComplaintResponseText({
      sheetNumber: input.contact.claimCode,
      customerName: input.contact.customerName,
      type: "reclamo",
      reason: input.subject,
      responseText: input.responseText,
    }),
    html,
  });

  return {
    ok: true,
    message: `Correo enviado a ${input.contact.customerEmail}.`,
  };
}
