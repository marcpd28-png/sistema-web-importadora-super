/**
 * Reads an API response only when the server explicitly identifies it as JSON.
 * This prevents an HTML login page, proxy error, or 404 document from leaking a
 * low-level `Unexpected token '<'` parsing error into the interface.
 */
export async function readJsonResponse<T>(response: Response): Promise<T> {
  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  const body = await response.text();
  const isJson = contentType.includes("application/json") || contentType.includes("+json");

  if (!isJson) {
    const status = response.status ? ` (HTTP ${response.status})` : "";
    throw new Error(
      `El servidor devolvió una respuesta inesperada${status}. Recarga la página e inténtalo nuevamente.`,
    );
  }

  try {
    return JSON.parse(body) as T;
  } catch {
    throw new Error("El servidor devolvió datos no válidos. Recarga la página e inténtalo nuevamente.");
  }
}
