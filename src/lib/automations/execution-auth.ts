import { createHmac, timingSafeEqual } from "node:crypto";

function secret() {
  const value = process.env.AUTOMATIONS_EXECUTION_SECRET?.trim();
  if (!value || value.length < 32) throw new Error("Configura AUTOMATIONS_EXECUTION_SECRET con al menos 32 caracteres.");
  return value;
}

export function signExecution(executionId: string, versionId: string, expiresAt = Date.now() + 300_000) {
  const signature = createHmac("sha256", secret()).update(`${executionId}:${versionId}:${expiresAt}`).digest("hex");
  return { executionId, versionId, expiresAt, signature };
}

export function verifyExecution(input: { executionId: string; versionId: string; expiresAt: number; signature: string }) {
  if (input.expiresAt < Date.now() || input.expiresAt > Date.now() + 310_000 || !/^[a-f0-9]{64}$/.test(input.signature)) return false;
  try {
    const expected = signExecution(input.executionId, input.versionId, input.expiresAt).signature;
    return timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(input.signature, "hex"));
  } catch { return false; }
}
