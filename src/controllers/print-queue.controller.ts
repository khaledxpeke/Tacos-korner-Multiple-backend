import type { Request, Response } from "express";
import { env } from "../config/environment";

async function callPrinter(path: string, init: RequestInit = {}) {
  const response = await fetch(`${env.printerServerUrl}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
    signal: AbortSignal.timeout(5000),
  });
  const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  return { ok: response.ok, status: response.status, data };
}

function queuePath(restaurantId: string, jobId?: string) {
  const base = `/api/printer/queue/${encodeURIComponent(restaurantId)}`;
  return jobId ? `${base}/${encodeURIComponent(jobId)}` : base;
}

export const getPrintQueue = async (req: Request, res: Response) => {
  const restaurantId = req.restaurantId ? String(req.restaurantId) : "";
  if (!restaurantId) {
    return res.status(400).json({ message: req.t("restaurant.not_found") });
  }
  try {
    const result = await callPrinter(queuePath(restaurantId));
    if (!result.ok) {
      return res.status(502).json({ message: req.t("printer.queue_unavailable") });
    }
    return res.status(200).json(result.data);
  } catch (error: unknown) {
    console.error(req.t("printer.queue_error_log"), error);
    return res.status(502).json({ message: req.t("printer.queue_unavailable") });
  }
};

export const updatePrintQueueJob = async (req: Request, res: Response) => {
  const restaurantId = req.restaurantId ? String(req.restaurantId) : "";
  const { jobId } = req.params as { jobId: string };
  if (!restaurantId) {
    return res.status(400).json({ message: req.t("restaurant.not_found") });
  }
  try {
    const result = await callPrinter(queuePath(restaurantId, jobId), {
      method: "PATCH",
      body: JSON.stringify({ disabled: req.body?.disabled === true }),
    });
    if (result.status === 404) {
      return res.status(404).json({ message: req.t("printer.job_not_found") });
    }
    if (!result.ok) {
      return res.status(502).json({ message: req.t("printer.queue_unavailable") });
    }
    return res.status(200).json(result.data);
  } catch (error: unknown) {
    console.error(req.t("printer.queue_error_log"), error);
    return res.status(502).json({ message: req.t("printer.queue_unavailable") });
  }
};

export const deletePrintQueueJob = async (req: Request, res: Response) => {
  const restaurantId = req.restaurantId ? String(req.restaurantId) : "";
  const { jobId } = req.params as { jobId: string };
  if (!restaurantId) {
    return res.status(400).json({ message: req.t("restaurant.not_found") });
  }
  try {
    const result = await callPrinter(queuePath(restaurantId, jobId), {
      method: "DELETE",
    });
    if (result.status === 404) {
      return res.status(404).json({ message: req.t("printer.job_not_found") });
    }
    if (!result.ok) {
      return res.status(502).json({ message: req.t("printer.queue_unavailable") });
    }
    return res.status(200).json(result.data);
  } catch (error: unknown) {
    console.error(req.t("printer.queue_error_log"), error);
    return res.status(502).json({ message: req.t("printer.queue_unavailable") });
  }
};
