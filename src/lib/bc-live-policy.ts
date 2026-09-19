export function isBcLiveContact(contact: { externalId?: string | null; phoneNormalized?: string | null }) {
  if (process.env.BC_LIVE_PILOT_ENABLED !== "true" || contact.externalId?.startsWith("SIMULATOR:")) return false;
  const allowed = (process.env.BC_LIVE_PILOT_PHONES ?? "").split(",").map(s => s.trim()).filter(s => /^\d{10,15}$/.test(s));
  return Boolean(contact.phoneNormalized && allowed.includes(contact.phoneNormalized));
}
