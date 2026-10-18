import crypto from "crypto";
import { env } from "../config/environment";

const RECEIPT_TTL_SECONDS = 7 * 24 * 60 * 60;

function apiOrigin(): string {
  const raw = (env.baseUrl || env.mediaServerUrl || "").replace(/\/+$/, "");
  if (!raw) return "";
  return /\/api$/i.test(raw) ? raw.slice(0, -4) : raw;
}

function sign(historyId: string, restaurantId: string, exp: number, secret: string) {
  return crypto
    .createHmac("sha256", secret)
    .update(`${historyId}.${restaurantId}.${exp}`)
    .digest("hex");
}

export function buildReceiptUrl(historyId: string, restaurantId: string): string {
  const origin = apiOrigin();
  const secret = env.receiptLinkSecret;
  if (!origin || !secret) return "";
  const exp = Math.floor(Date.now() / 1000) + RECEIPT_TTL_SECONDS;
  const sig = sign(historyId, restaurantId, exp, secret);
  return `${origin}/api/history/${historyId}/receipt.pdf?sig=${sig}&exp=${exp}`;
}

export function receiptSignatureMatches(
  historyId: string,
  restaurantId: string,
  exp: number,
  sig: string
): boolean {
  const secret = env.receiptLinkSecret;
  if (!secret || !sig) return false;
  const expected = sign(historyId, restaurantId, exp, secret);
  const left = Buffer.from(expected);
  const right = Buffer.from(sig);
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}
