import { SocialInboxError } from "./social-inbox";

export type MessengerControlState = {
  owner: "store" | "meta" | "other" | "unknown";
  expiresAt?: number;
  botEnabled: boolean;
  mode: "manual" | "bot" | "meta" | "unmanaged";
  resumeAt: number | null;
  resumeTarget: "meta" | "bot" | null;
  error: string | null;
  metaAiAvailable: boolean;
  ownerVerified?: boolean;
};

export async function messengerControl(id: string, change?: { action: "manual" | "bot" | "meta"; minutes: number; actor: string; resumeTarget?: "meta" | "bot" }): Promise<MessengerControlState> {
  if (!/^\d{1,25}$/.test(id)) throw new SocialInboxError("Conversación no válida.", 400);
  const token = process.env.MESSENGER_CONTROL_TOKEN;
  if (!token) throw new SocialInboxError("El control manual de Messenger necesita configuración.", 503);
  let response: Response;
  try {
    response = await fetch(`http://127.0.0.1:19120/conversations/${id}`, {
      method: change ? "POST" : "GET", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: change ? JSON.stringify(change) : undefined, cache: "no-store", signal: AbortSignal.timeout(90000),
    });
  } catch { throw new SocialInboxError("No se pudo confirmar el control de Messenger. Actualiza su estado antes de repetirlo.", 503); }
  const body = await response.json();
  if (!response.ok) throw new SocialInboxError(body.error || "No se pudo cambiar el control de Messenger.", response.status);
  return body as MessengerControlState;
}
