import type { Request, Response } from "express";

export function ok(
  req: Request,
  res: Response,
  key = "common.ok",
  data: Record<string, unknown> = {}
): Response {
  return res.json({ success: true, message: req.t(key), data });
}

export function created(
  req: Request,
  res: Response,
  key = "common.created",
  data: Record<string, unknown> = {}
): Response {
  return res.status(201).json({ success: true, message: req.t(key), data });
}

export function fail(
  req: Request,
  res: Response,
  status = 400,
  key = "errors.unknown",
  extra: Record<string, unknown> = {}
): Response {
  return res.status(status).json({ success: false, message: req.t(key), ...extra });
}
