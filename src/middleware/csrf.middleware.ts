import type { NextFunction, Request, Response } from "express";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

// Cookie-based auth means the browser attaches the `jwt` cookie to any
// request to this API, same-site or not — unlike a bearer token, which a
// hostile page can't make the browser send on its own. A state-changing
// request that relies on the cookie must therefore prove it was made by
// our own frontend's JS: a plain cross-site <form> submission can't set a
// custom header, and any request that does set one forces the browser to
// run a CORS preflight first, which the origin allow-list in app.ts then
// gets a chance to reject. Bearer-token clients (mobile, kiosk, ...) never
// send the cookie, so they're unaffected and skip this check entirely.
export const csrfProtection = (req: Request, res: Response, next: NextFunction) => {
  if (SAFE_METHODS.has(req.method)) return next();
  if (!req.cookies?.jwt) return next();
  if (req.headers["x-requested-with"] !== "XMLHttpRequest") {
    return res.status(403).json({ message: req.t("errors.forbidden") });
  }
  next();
};
