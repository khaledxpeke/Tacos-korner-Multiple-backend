import crypto from "crypto";
import { env } from "../config/environment";

const algorithm = "aes-256-cbc";
const secretKey = env.encryptionKey;
const iv = crypto.randomBytes(16);

export const encrypt = (text: string): string => {
  if (!secretKey || secretKey.length !== 32) {
    throw new Error("ENCRYPTION_KEY must be a 32-byte key.");
  }
  const cipher = crypto.createCipheriv(algorithm, Buffer.from(secretKey), iv);
  const encrypted = Buffer.concat([cipher.update(text), cipher.final()]);
  return `${iv.toString("hex")}:${encrypted.toString("hex")}`;
};

export const decrypt = (hash: string): string => {
  if (!secretKey || secretKey.length !== 32) {
    throw new Error("ENCRYPTION_KEY must be a 32-byte key.");
  }
  const [ivHex, encryptedHex] = hash.split(":");
  if (!ivHex || !encryptedHex) {
    return hash;
  }
  const iv = Buffer.from(ivHex, "hex");
  const encryptedText = Buffer.from(encryptedHex, "hex");
  const decipher = crypto.createDecipheriv(algorithm, Buffer.from(secretKey), iv);
  const decrypted = Buffer.concat([decipher.update(encryptedText), decipher.final()]);
  return decrypted.toString();
};
