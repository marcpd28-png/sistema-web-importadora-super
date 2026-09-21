export async function sendSimulatorRequest<T>(body: unknown, controller: AbortController, timeoutMs = 65000, request = fetch): Promise<T> {
  const timeout = setTimeout(() => controller.abort(new DOMException("Tiempo de espera agotado", "TimeoutError")), timeoutMs);
  try {
    const response = await request("/api/admin/conversations/simulate", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body), signal: controller.signal,
    });
    if (!response.headers.get("content-type")?.includes("application/json")) {
      throw new Error(`El servidor no respondió correctamente (${response.status}). Intenta una nueva sesión.`);
    }
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "No se pudo simular el mensaje.");
    return payload as T;
  } finally { clearTimeout(timeout); }
}
