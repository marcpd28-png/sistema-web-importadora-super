import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const VERSION = "v1";
const IV_LENGTH = 12;

function getEncryptionKey() {
  const rawKey = process.env.META_TOKEN_ENCRYPTION_KEY?.trim() ?? "";

  if (!/^[0-9a-fA-F]{64}$/.test(rawKey)) {
    throw new Error("META_TOKEN_ENCRYPTION_KEY debe tener exactamente 64 caracteres hexadecimales.");
  }

  return Buffer.from(rawKey, "hex");
}

export function encryptWhatsappToken(token: string) {
  if (!token.trim()) {
    throw new Error("No se puede cifrar un token vacío.");
  }

  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv("aes-256-gcm", getEncryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return [VERSION, iv.toString("base64"), authTag.toString("base64"), ciphertext.toString("base64")].join(":");
}

export function decryptWhatsappToken(payload: string) {
  const [version, ivEncoded, authTagEncoded, ciphertextEncoded] = payload.split(":");

  if (version !== VERSION || !ivEncoded || !authTagEncoded || !ciphertextEncoded) {
    throw new Error("El token cifrado tiene un formato no válido.");
  }

  const iv = Buffer.from(ivEncoded, "base64");
  const authTag = Buffer.from(authTagEncoded, "base64");
  const ciphertext = Buffer.from(ciphertextEncoded, "base64");

  if (iv.length !== IV_LENGTH || authTag.length !== 16 || ciphertext.length === 0) {
    throw new Error("El token cifrado tiene una estructura no válida.");
  }

  const decipher = createDecipheriv("aes-256-gcm", getEncryptionKey(), iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}
