import type { Request, Response } from "express";
import { StatusHistory } from "../models/statusHistory.model";

export const getStatusHistory = async (req: Request, res: Response) => {
  try {
    const { historyId } = req.params;
    const { restaurantId } = req;

    const statusHistory = await StatusHistory.find({ historyId, restaurantId }).sort({
      updatedAt: -1,
    });

    res.status(200).json(statusHistory);
  } catch (error) {
    console.error(req.t("status_history.fetch_error"), error);
    res.status(500).json({ error: req.t("errors.unknown") });
  }
};
