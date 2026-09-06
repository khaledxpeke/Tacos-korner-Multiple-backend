import type { Request, Response } from "express";
import type { Server } from "socket.io";
import fs from "fs";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";
import { History } from "../models/history.model";
import { Coupon } from "../models/coupon.model";
import { Settings } from "../models/settings.model";
import { StatusHistory } from "../models/statusHistory.model";
import { Restaurant } from "../models/restaurant.model";
import { createTransporter } from "../services/mail.service";
import { env } from "../config/environment";
import { errorMessage, findActiveSettingOption } from "../utils/helpers";
import { setHistoryIO, getHistoryIO } from "../services/history-io";
import { startPrintRetryWorker, triggerAutoPrint } from "../services/print.service";
import { generatePDF } from "../services/history-pdf.service";
import {
  notifyWaiters,
  startDelayedOrderWorker,
} from "../services/history-realtime";
import type {
  AddHistoryBody,
  HistoryListQuery,
  PdfOrderData,
  RestaurantWithLogo,
} from "../interfaces/history.interface";

export { getHistoriesRT } from "../services/history-realtime";
export { getStatistics } from "./history-stats.controller";
export {
  getLatestPrintJob,
  manualPrint,
  getFailedPrints,
  retryPrint,
  retryAllFailedPrints,
  getPrintStats,
} from "./history-print.controller";

dayjs.extend(utc);
dayjs.extend(timezone);

export const setIO = (socketIO: Server) => {
  setHistoryIO(socketIO);
  startPrintRetryWorker();
  startDelayedOrderWorker();
};


export const addHistory = async (req: Request, res: Response) => {
  const {
    products,
    pack,
    name,
    method,
    total,
    currency,
    commandNumber,
    discountValue,
    couponId,
  } = req.body as AddHistoryBody;
  const { restaurantId } = req;
  try {
    const restaurant = await Restaurant.findById(restaurantId);
    if (!restaurant) {
      return res.status(404).json({ message: req.t("restaurant.not_found") });
    }

    let settings = restaurant.settings
      ? await Settings.findById(restaurant.settings)
      : null;
    if (!settings) {
      settings = await Settings.findOne({ restaurantId });
    }
    if (!settings) {
      return res.status(404).json({ message: req.t("settings.param_not_found") });
    }

    const now = dayjs().tz("Europe/Paris").format();
    const packExists = findActiveSettingOption(settings.pack, pack);
    const methodExists = findActiveSettingOption(settings.method, method);
    if (!packExists) {
      return res
        .status(404)
        .json({ message: req.t("history.delivery_mode_not_found") });
    }
    if (!methodExists) {
      return res
        .status(404)
        .json({ message: req.t("history.payment_method_not_found") });
    }
    const tva = settings?.tva || 0;
    const orderCurrency = settings.defaultCurrency || currency || "";
    const history = await new History({
      product: products.map((product) => {
        const productTva =
          product.tva && product.tva > 0 ? product.tva : settings?.tva || 0;
        const categoryId = product.plat.category;
        return {
          plat: {
            _id: product.plat._id,
            name: product.plat.name,
            count: product.plat.count,
            price: product.plat.price,
            category: categoryId,
          },
          variation: product.variation
            ? {
                ...product.variation,
                price: Number(product.variation.price).toFixed(2),
              }
            : null,
          total: product.total,
          addons: product.addons.map((addon) => ({
            name: addon.name,
            price: addon.price,
            count: addon.count,
          })),
          extras: product.extras.map((extra) => ({
            name: extra.name,
            price: extra.price,
            count: extra.count,
          })),
          tva: productTva,
        };
      }),
      name,
      currency: orderCurrency,
      tva,
      discountValue: discountValue || 0,
      couponId: couponId || null,
      status: "enCours",
      logo: restaurant!.logo as unknown as string,
      method: {
        _id: methodExists._id,
        label: methodExists.label,
      },
      pack: {
        _id: packExists._id,
        label: packExists.label,
      },
      total: total,
      boughtAt: now,
      commandNumber: parseInt(String(commandNumber), 10),
      restaurantId,
    });
    history
      .save()
      .then(async (result) => {
        const statusHistory = new StatusHistory({
          historyId: result._id,
          status: "enCours",
          updatedBy: "Système",
          updatedAt: now,
          restaurantId,
        });

        await statusHistory.save();

        const coupon = await Coupon.findById(couponId);
        if (coupon) {
          coupon.usageCount += 1;
          if (coupon.usageCount >= coupon.limit) {
            coupon.isActive = false;
          }
          await coupon.save();
        }

        const response = {
          ...result.toObject(),
          pack: result.pack.label,
          method: result.method.label,
        };
        if (getHistoryIO()) {
          getHistoryIO()!.emit("status-update", {
            id: result._id,
            status: "enCours",
            updatedAt: now,
          });
          getHistoryIO()!.to(`restaurant-${restaurantId}`).emit("new-history", response);
          await notifyWaiters(history, req.t.bind(req));
        }

        // 🚀 AUTO-PRINT: Trigger printing immediately after order is saved (non-blocking)
        setImmediate(() => triggerAutoPrint(result._id));

        setTimeout(async () => {
          const order = await History.findOne({
            _id: result._id,
            restaurantId,
          });
          if (order && order.status === "enCours") {
            const updatedOrder = await History.findOneAndUpdate(
              { _id: order._id, restaurantId },
              { status: "enRetard" },
              { new: true }
            );

            if (getHistoryIO()) {
              getHistoryIO()!.emit("status-update", {
                id: order._id,
                status: "enRetard",
                updatedAt: now,
              });
            }
          }
        }, 20 * 60 * 1000);
        res.status(201).json(response);
      })
      .catch((err: unknown) => {
        console.error(req.t("history.save_error_log"), err);
        res.status(500).json({
          message: req.t("history.save_error"),
          error: err,
        });
      });
  } catch (error: unknown) {
    console.error(req.t("history.save_error_log"), error);
    res.status(500).json({ error: req.t("history.internal_server_error") });
  }
};

export const getHistory = async (req: Request, res: Response) => {
  try {
    const { restaurantId } = req;
    const {
      page = 1,
      limit = 10,
      search = "",
      filter = "all",
      status,
      packId,
      methodId,
      startDate,
      endDate,
    } = req.query as HistoryListQuery;
    const skip = (Number(page) - 1) * parseInt(String(limit));
    const query: Record<string, unknown> = { restaurantId };

    if (search && String(search).trim() !== "") {
      const searchRegex = new RegExp(String(search).trim(), "i");
      query.$or = [
        { name: { $regex: searchRegex } },
        { commandNumber: isNaN(parseInt(String(search), 10)) ? -1 : parseInt(String(search), 10) },
      ];
    }
    if (status) {
      query.status = status;
    }

    const asIdOrLabel = (field: "pack" | "method", value: unknown) => {
      const id = String(value || "").trim();
      if (!id) return;
      query.$and = [
        ...((query.$and as Array<Record<string, unknown>>) || []),
        {
          $or: [
            { [`${field}._id`]: id },
            { [`${field}.label`]: id },
          ],
        },
      ];
    };
    asIdOrLabel("pack", packId);
    asIdOrLabel("method", methodId);

    const now = dayjs().tz("Europe/Paris");
    if (filter === "today") {
      query.boughtAt = {
        $gte: now.startOf("day").toDate(),
        $lte: now.endOf("day").toDate(),
      };
    } else if (filter === "week") {
      const monday =
        now.day() === 0 ? now.subtract(6, "day") : now.subtract(now.day() - 1, "day");
      query.boughtAt = {
        $gte: monday.startOf("day").toDate(),
        $lte: monday.add(6, "day").endOf("day").toDate(),
      };
    } else if (filter === "month") {
      query.boughtAt = {
        $gte: now.startOf("month").toDate(),
        $lte: now.endOf("month").toDate(),
      };
    } else if (filter === "custom" && (startDate || endDate)) {
      const boughtAt: { $gte?: Date; $lte?: Date } = {};
      if (startDate) {
        boughtAt.$gte = dayjs(startDate as string).tz("Europe/Paris").startOf("day").toDate();
      }
      if (endDate) {
        boughtAt.$lte = dayjs(endDate as string).tz("Europe/Paris").endOf("day").toDate();
      }
      query.boughtAt = boughtAt;
    }
    const restaurantSettings = await Settings.findOne({ restaurantId }).select(
      "defaultCurrency"
    );
    const histories = await History.find(query)
      .sort({ boughtAt: -1 })
      .skip(skip)
      .limit(parseInt(String(limit)))
      .populate({
        path: "product",
        populate: [
          {
            path: "plat.category",
            select: "name",
          },
        ],
      })
      .populate({
        path: "couponId",
        select: "couponType",
      })
      .lean();

    const historiesWithTva = histories.map((history) => {
      const globalTva = history.tva || 0;

      // const couponType = history.couponId
      //   ? await Coupon.findById(history.couponId).then((coupon) => (coupon ? coupon.type : null))
      //   : null;

      // if (Array.isArray(history.product) && history.product.length > 0) {
      //   history.product.forEach((p) => {
      //     const productTotal = Number(p.total) || 0;
      //     const productTva = p.tva && p.tva > 0 ? p.tva : globalTva;

      //     // Calculate HT (price without tax) for this product
      //     const productHT = (100 * productTotal) / (100 + productTva);
      //     const productTVA = productTotal - productHT;

      //     totalHT += productHT;
      //     totalTVA += productTVA;
      //   });
      // } else {
      //   // fallback (no detailed product list)
      //   totalHT = (100 * history.total) / (100 + globalTva);
      //   totalTVA = history.total - totalHT;
      // }
      const formattedBoughtAt = history.boughtAt
        ? dayjs(history.boughtAt)
            .tz("Europe/Paris")
            .format("YYYY-MM-DD HH:mm:ss")
        : null;

      const { totalHT, tvaAmount } = history.product?.reduce(
        (acc, p) => {
          const productTotal = Number(p.total) || 0;
          const productTva = p.tva && p.tva > 0 ? p.tva : globalTva;

          const productHT = (100 * productTotal) / (100 + productTva);
          const productTVA = productTotal - productHT;

          acc.totalHT += productHT;
          acc.tvaAmount += productTVA;

          return acc;
        },
        { totalHT: 0, tvaAmount: 0 }
      ) || { totalHT: 0, tvaAmount: 0 };

      return {
        ...history,
        currency: history.currency || restaurantSettings?.defaultCurrency || "",
        tvaAmount: parseFloat(tvaAmount.toFixed(2)),
        totalHT: parseFloat(totalHT.toFixed(2)),
        boughtAt: formattedBoughtAt,
      };
    });

    const totalHistories = await History.countDocuments({
      restaurantId,
      ...query,
    });

    res.status(200).json({
      histories: historiesWithTva,
      pagination: {
        currentPage: parseInt(String(page)),
        totalPages: Math.ceil(totalHistories / Number(limit)),
        totalRecords: totalHistories,
      },
    });
  } catch (error: unknown) {
    console.error(req.t("history.fetch_error_log"), error);
    res.status(500).json({
      message: req.t("history.fetch_error"),
      error: errorMessage(error),
    });
  }
};

export const getLast10Orders = async (req: Request, res: Response) => {
  try {
    const { restaurantId } = req;
    const orders = await History.find({ restaurantId })
      .sort({ boughtAt: -1 })
      .limit(10)
      .populate("product.plat._id");

    res.status(200).json(orders);
  } catch (error: unknown) {
    res.status(500).json({
      message: req.t("history.last10orders_error", { error: errorMessage(error) }),
    });
    throw error;
  }
};

export const addEmail = async (req: Request, res: Response) => {
  const { email, commandNumber } = req.body as {
    email: string;
    commandNumber: string | number;
  };
  const { restaurantId } = req;
  try {
    const history = await History.findOne({
      commandNumber: commandNumber,
      restaurantId,
    }).sort({
      boughtAt: -1,
    });
    if (!history) {
      return res
        .status(404)
        .json({ message: req.t("history.order_not_found") });
    }
    const formattedDate = dayjs(history.boughtAt)
      .tz(env.restaurantTimezone || "Europe/Paris")
      .format("D MMMM YYYY HH:mm");
    const restaurant = (await Restaurant.findById(restaurantId).populate({
      path: "logo",
      select: "url",
    })) as RestaurantWithLogo | null;
    const settings = await Settings.findOne({ restaurantId });
    const tva = settings?.tva || 0;
    const totalHt = (100 * history.total) / (100 + tva);
    // const tvaAmount = history.total - totalHt;
    const orderDate = dayjs(history.boughtAt).tz("Europe/Paris").startOf("day");
    const today = dayjs().tz("Europe/Paris").startOf("day");
    let totalHT = 0;
    let totalTVA = 0;
    history.product.forEach((product) => {
      const productTotal = Number(product.total) || 0;
      const productTva = product.tva && product.tva > 0 ? product.tva : tva;

      const productHT = (100 * productTotal) / (100 + productTva);
      const productTVA = productTotal - productHT;

      totalHT += productHT;
      totalTVA += productTVA;
    });
    if (orderDate < today) {
      return res.status(400).json({
        message: req.t("history.email_past_order_error"),
      });
    }
    // TODO: Legacy behavior preserved during TS migration.
    let logoUrl: string;
    logoUrl = `${env.mediaServerUrl}/${(restaurant!.logo?.url as string).replace(
      /\\/g,
      "/"
    )}`;
    const pdfPath = await generatePDF(history as unknown as PdfOrderData);
    const transporter = await createTransporter(restaurantId);
    const mailOptions = {
      from: `${settings!.emailName} <${settings!.emailSender}>`,
      to: email,
      subject: "Ticket de commande",
      text: "",
      template: "/template/index",
      attachments: [
        {
          filename: `order-${history.commandNumber}.pdf`,
          path: pdfPath,
        },
      ],
      context: {
        apiUrl: env.baseUrl,
        commandNumber: commandNumber,
        logo: logoUrl,
        isEmail: true,
        name: history.name,
        boughtAt: formattedDate,
        products: history.product.map((product) => {
          return {
            platName: product.plat.name,
            price: (product.plat.price as number).toFixed(2),
            currency: history.currency,
            count: product.plat.count,
            variation: product.variation
              ? {
                  ...product.variation,
                  price: Number(product.variation.price).toFixed(2),
                }
              : null,
            addons: product.addons.map((addon) => {
              return {
                name: addon.name,
                count: addon.count,
                price: (addon.price as number).toFixed(2),
                currency: history.currency,
              };
            }),
            extras: product.extras.map((extra) => {
              return {
                name: extra.name,
                count: extra.count,
                price: (extra.price as number).toFixed(2),
                currency: history.currency,
              };
            }),
          };
        }),
        total: history.total.toFixed(2),
        totalHt: totalHT.toFixed(2),
        tvaAmount: totalTVA.toFixed(2),
        tva: tva,
        pack: history.pack.label,
        method: history.method.label,
        currency: history.currency,
        restaurantId: restaurantId,
      },
    };
    await transporter.sendMail(mailOptions);
    fs.unlinkSync(pdfPath);
    res.status(200).json({ message: req.t("history.email_sent_success") });
  } catch (error: unknown) {
    console.error(req.t("history.save_error_log"), error);
    res.status(500).json({ error: req.t("history.internal_server_error") });
  }
};

export const getCommandNumber = async (req: Request, res: Response) => {
  const currentDate = dayjs().tz("Europe/Paris").startOf("day").toDate();
  currentDate.setHours(0, 0, 0, 0);
  const { restaurantId } = req;

  try {
    const lastCommand = await History.findOne({ restaurantId }).sort({
      boughtAt: -1,
    });

    const currentDate = dayjs().tz("Europe/Paris").startOf("day").toDate();

    if (lastCommand) {
      const lastCommandDate = dayjs(lastCommand.boughtAt)
        .tz("Europe/Paris")
        .startOf("day")
        .toDate();

      // Compare dates
      if (currentDate.getTime() > lastCommandDate.getTime()) {
        // New day - reset to 1
        return res.status(200).json(1);
      } else {
        // Same day - increment
        return res.status(200).json((lastCommand.commandNumber as number) + 1);
      }
    }

    // No previous commands
    return res.status(200).json(1);
  } catch (error: unknown) {
    console.error(req.t("history.command_number_error_log"), error);
    res.status(500).json({ error: req.t("history.internal_server_error") });
  }
};

export const updateStatus = async (req: Request, res: Response) => {
  const { id } = req.params as { id: string };
  const { status } = req.body as { status: string };
  const { restaurantId } = req;
  const { fullName } = req.user!.user;
  try {
    const history = await History.findOneAndUpdate(
      { _id: id, restaurantId },
      { status },
      { new: true }
    );
    if (!history) {
      return res
        .status(404)
        .json({ message: req.t("history.history_not_found") });
    }
    const statusHistory = new StatusHistory({
      historyId: id,
      status,
      updatedBy: fullName,
      updatedAt: dayjs().tz("Europe/Paris").toDate(),
      restaurantId,
    });

    await statusHistory.save();
    getHistoryIO()!.emit("status-update", {
      id,
      status,
      updatedBy: fullName,
      updatedAt: dayjs().tz("Europe/Paris").toDate(),
    });
    res.status(200).json(history);
  } catch (error: unknown) {
    console.error(req.t("history.status_update_error_log"), error);
    res.status(500).json({ error: req.t("history.internal_server_error") });
  }
};
