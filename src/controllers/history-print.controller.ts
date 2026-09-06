import type { Request, Response } from "express";
import mongoose from "mongoose";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";
import { History } from "../models/history.model";
import {
  getFailedPrintQueue,
  removeFailedPrintJob,
  removeFailedPrintJobsByRestaurant,
  triggerAutoPrint,
} from "../services/print.service";
import type { PrintStatsAgg } from "../interfaces/history.interface";

dayjs.extend(utc);
dayjs.extend(timezone);

export const getLatestPrintJob = async (req: Request, res: Response) => {
  try {
    const { restaurantId } = req;
    // Ici, on considère qu'une commande prête à être imprimée est en status "enCours"
    // Vous pouvez ajuster la condition selon votre logique (ex: "pending")
    const printJob = await History.findOne({
      status: "enCours",
      restaurantId,
    }).sort({
      boughtAt: 1,
    });

    if (!printJob) {
      return res.status(204).send(req.t("history.no_pending_print_job"));
    }

    // Marquer la commande comme "enAttente" (inProgress) pour éviter de l'imprimer à nouveau
    printJob.status = "enAttente";
    await printJob.save();

    res.status(200).json(printJob);
  } catch (error: unknown) {
    console.error(req.t("history.latest_print_job_error_log"), error);
    res.status(500).json({ message: req.t("history.internal_server_error") });
  }
};

// 🖨️ Manual print endpoint for cashiers
export const manualPrint = async (req: Request, res: Response) => {
  const { id } = req.params as { id: string };
  const { restaurantId } = req;

  try {
    const order = await History.findOne({ _id: id, restaurantId });

    if (!order) {
      return res
        .status(404)
        .json({ message: req.t("history.order_not_found") });
    }

    // Immediate response to cashier
    res.status(200).json({
      success: true,
      message: req.t("history.manual_print_request_sent"),
      orderId: id,
      commandNumber: order.commandNumber,
    });

    // Trigger print (non-blocking)
    setImmediate(() => triggerAutoPrint(id));
  } catch (error: unknown) {
    console.error(req.t("history.manual_print_error_log"), error);
    res.status(500).json({ error: req.t("history.internal_server_error") });
  }
};

// 📊 Get failed prints for admin dashboard
export const getFailedPrints = async (req: Request, res: Response) => {
  const { restaurantId } = req;

  try {
    // Get orders with failed print status
    const failedOrders = await History.find({
      restaurantId,
      printStatus: { $in: ["failed", "retry_exhausted"] },
    })
      .sort({ lastPrintAttempt: -1 })
      .limit(20);

    // Get in-memory queue status
    const queuedJobs = getFailedPrintQueue()
      .filter((job) => job.restaurantId.toString() === restaurantId)
      .map((job) => ({
        orderId: job.orderId,
        commandNumber: job.commandNumber,
        attempts: job.attempts,
        nextRetry: job.nextRetry,
        error: job.error,
        createdAt: job.createdAt,
      }));

    res.status(200).json({
      failedOrders: failedOrders.map((order) => ({
        _id: order._id,
        commandNumber: order.commandNumber,
        name: order.name,
        total: order.total,
        boughtAt: order.boughtAt,
        printStatus: order.printStatus,
        printError: order.printError,
        lastPrintAttempt: order.lastPrintAttempt,
      })),
      queuedRetries: queuedJobs,
      totalFailed: failedOrders.length,
      totalQueued: queuedJobs.length,
      message: req.t("history.failed_prints_success"),
    });
  } catch (error: unknown) {
    console.error(req.t("history.failed_prints_error_log"), error);
    res.status(500).json({ error: req.t("history.internal_server_error") });
  }
};

// 🔄 Retry specific print job
export const retryPrint = async (req: Request, res: Response) => {
  const { id } = req.params as { id: string };
  const { restaurantId } = req;

  try {
    const order = await History.findOne({ _id: id, restaurantId });

    if (!order) {
      return res
        .status(404)
        .json({ message: req.t("history.order_not_found") });
    }

    // Reset print status
    // TODO: Legacy behavior preserved during TS migration.
    await History.findByIdAndUpdate(id, {
      printStatus: "pending",
      printError: null,
      lastPrintAttempt: dayjs().tz("Europe/Paris").toDate(),
    });

    // Remove from failed queue if exists
    removeFailedPrintJob(id);

    // Immediate response
    res.status(200).json({
      success: true,
      message: req.t("history.print_retried"),
      orderId: id,
      commandNumber: order.commandNumber,
    });

    // Trigger print
    setImmediate(() => triggerAutoPrint(id));
  } catch (error: unknown) {
    console.error(req.t("history.retry_print_error_log"), error);
    res.status(500).json({ error: req.t("history.internal_server_error") });
  }
};

// 🔄 Retry all failed prints
export const retryAllFailedPrints = async (req: Request, res: Response) => {
  const { restaurantId } = req;

  try {
    const failedOrders = await History.find({
      restaurantId,
      printStatus: { $in: ["failed", "retry_exhausted"] },
    });

    // Reset all failed orders
    // TODO: Legacy behavior preserved during TS migration.
    await History.updateMany(
      {
        restaurantId,
        printStatus: { $in: ["failed", "retry_exhausted"] },
      },
      {
        printStatus: "pending",
        printError: null,
        lastPrintAttempt: dayjs().tz("Europe/Paris").toDate(),
      }
    );

    // Clear failed queue for this restaurant
    removeFailedPrintJobsByRestaurant(restaurantId as string);

    // Immediate response
    res.status(200).json({
      success: true,
      message: req.t("history.all_prints_retried", {
        count: failedOrders.length,
      }),
      retriedCount: failedOrders.length,
    });

    // Trigger prints for all failed orders
    failedOrders.forEach((order) => {
      setImmediate(() => triggerAutoPrint(order._id));
    });
  } catch (error: unknown) {
    console.error(req.t("history.retry_all_failed_prints_error_log"), error);
    res.status(500).json({ error: req.t("history.internal_server_error") });
  }
};

// 📈 Get print statistics
export const getPrintStats = async (req: Request, res: Response) => {
  const { restaurantId } = req;

  try {
    const today = dayjs().tz("Europe/Paris").startOf("day").toDate();

    const stats = await History.aggregate<PrintStatsAgg>([
      {
        $match: {
          restaurantId: new mongoose.Types.ObjectId(restaurantId as string),
          boughtAt: { $gte: today },
        },
      },
      {
        $group: {
          _id: null,
          totalOrders: { $sum: 1 },
          printedSuccessfully: {
            $sum: { $cond: [{ $eq: ["$printStatus", "printed"] }, 1, 0] },
          },
          printFailed: {
            $sum: { $cond: [{ $eq: ["$printStatus", "failed"] }, 1, 0] },
          },
          printRetryExhausted: {
            $sum: {
              $cond: [{ $eq: ["$printStatus", "retry_exhausted"] }, 1, 0],
            },
          },
          printPending: {
            $sum: { $cond: [{ $eq: ["$printStatus", "pending"] }, 1, 0] },
          },
        },
      },
    ]);

    const result = stats[0] || {
      totalOrders: 0,
      printedSuccessfully: 0,
      printFailed: 0,
      printRetryExhausted: 0,
      printPending: 0,
    };

    // Calculate success rate
    const successRate =
      result.totalOrders > 0
        ? Math.round((result.printedSuccessfully / result.totalOrders) * 100)
        : 0;

    res.status(200).json({
      ...result,
      successRate,
      // TODO: Legacy behavior preserved during TS migration.
      activeRetries: getFailedPrintQueue().filter(
        (job) =>
          (
            job as unknown as {
              order: { restaurantId: { toString: () => string } };
            }
          ).order.restaurantId.toString() === restaurantId
      ).length,
      message: req.t("history.print_stats_success"),
    });
  } catch (error: unknown) {
    console.error(req.t("history.print_stats_error_log"), error);
    res.status(500).json({ error: req.t("history.internal_server_error") });
  }
};
