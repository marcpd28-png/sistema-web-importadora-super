export function hasSubscribedMetaApp(payload: unknown, appId: string | undefined): boolean {
  if (!appId?.trim() || !payload || typeof payload !== "object") return false;
  const data = (payload as { data?: unknown }).data;
  if (!Array.isArray(data)) return false;
  return data.some((entry: unknown) => {
    if (!entry || typeof entry !== "object") return false;
    const nested = (entry as { whatsapp_business_api_data?: { id?: unknown } }).whatsapp_business_api_data;
    return nested?.id === appId.trim();
  });
}
