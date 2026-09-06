import type { NextFunction, Request, Response } from "express";

interface HttpError extends Error {
  status?: number;
}

export const notFoundMiddleware = (req: Request, res: Response, _next: NextFunction) => {
  res.status(404).json({ success: false, message: req.t("errors.not_found") });
};

export const errorMiddleware = (
  err: HttpError,
  req: Request,
  res: Response,
  _next: NextFunction
) => {
  console.error(err);
  const status = err.status || 500;
  const key =
    status === 401
      ? "errors.unauthorized"
      : status === 403
        ? "errors.forbidden"
        : status === 404
          ? "errors.not_found"
          : "errors.unknown";
  res.status(status).json({ success: false, message: req.t(key) });
};
