import type { CookieOptions } from "express";
import { env } from "../config/environment";

/**
 * Dashboard auth is an httpOnly cookie. `Secure` + `SameSite=None` is required
 * for HTTPS (and for cross-site dashboards), but browsers drop `Secure`
 * cookies on plain `http://` VPS-IP deploys, which then looks like login
 * succeeded while every later request is 401 token_missing.
 */
export const authCookieOptions = (maxAgeMs?: number): CookieOptions => {
  const secure = (env.baseUrl || "").startsWith("https://");
  return {
    httpOnly: true,
    secure,
    sameSite: secure ? "none" : "lax",
    path: "/",
    ...(maxAgeMs != null ? { maxAge: maxAgeMs } : {}),
  };
};
