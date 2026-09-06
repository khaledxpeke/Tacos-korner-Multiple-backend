import type { Request } from "express";
import type { Socket } from "socket.io";
import mongoose from "mongoose";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";
import { History } from "../models/history.model";
import { User } from "../models/user.model";
import { StatusHistory } from "../models/statusHistory.model";
import { admin } from "./firebase.service";
import { env } from "../config/environment";
import { errorMessage } from "../utils/helpers";
import { getHistoryIO } from "./history-io";
import type {
  FetchHistoriesData,
  HistoriesRtResult,
  StatusCountsResult,
  TranslateFn,
} from "../interfaces/history.interface";

dayjs.extend(utc);
dayjs.extend(timezone);

export const notifyWaiters = async (
  history: { restaurantId: mongoose.Types.ObjectId; name: string; commandNumber?: number },
  t: TranslateFn
) => {
  try {
    const { restaurantId } = history;
    const users = await User.find({
      fcmToken: { $ne: "" },
      restaurants: { $elemMatch: { restaurantId, notificationsEnabled: true } },
    });
    if (users.length === 0) {
      console.log(
        `No users with notifications enabled for restaurant ${restaurantId}`
      );
      return;
    }

    const tokens = users.map((user) => user.fcmToken);
    const payload = {
      notification: {
        title: t("history.new_order_title"),
        body: t("history.new_order_body", {
          name: history.name,
          commandNumber: history.commandNumber,
        }),
      },
    };

    for (const token of tokens) {
      try {
        await admin.messaging().send({
          ...payload,
          token: token as string,
        });
      } catch (error: unknown) {
        console.error(t("history.notification_token_error", { token }), error);
      }
    }
  } catch (error: unknown) {
    console.error(t("history.notification_send_error"), error);
  }
};

export const getHistoriesRT = async (socket: Socket, restaurantId?: string) => {
  try {
    socket.on("fetch-histories", async (data: FetchHistoriesData) => {
      try {
        const {
          page = 1,
          search = "",
          startDate,
          endDate,
          filter = "",
          status = "all",
        } = data;
        const limit = 30;
        const skip = (page - 1) * limit;
        const { restaurantId } = data;

        const matchQuery: Record<string, unknown> = {
          restaurantId: new mongoose.Types.ObjectId(restaurantId),
        };

        if (status && status !== "all") {
          matchQuery.status = status;
        }
        const currentDate = dayjs().tz("Europe/Paris").toDate();
        if (filter === "today") {
          const startOfDay = new Date(currentDate);
          startOfDay.setHours(0, 0, 0, 0);
          const endOfDay = new Date(currentDate);
          endOfDay.setHours(23, 59, 59, 999);

          matchQuery.boughtAt = { $gte: startOfDay, $lte: endOfDay };
        } else if (filter === "week") {
          const startOfWeek = new Date(currentDate);
          startOfWeek.setDate(currentDate.getDate() - currentDate.getDay());
          startOfWeek.setHours(0, 0, 0, 0);

          const endOfWeek = new Date(startOfWeek);
          endOfWeek.setDate(startOfWeek.getDate() + 6);
          endOfWeek.setHours(23, 59, 59, 999);

          matchQuery.boughtAt = { $gte: startOfWeek, $lte: endOfWeek };
        } else if (filter === "month") {
          const startOfMonth = new Date(
            currentDate.getFullYear(),
            currentDate.getMonth(),
            1
          );
          const endOfMonth = new Date(
            currentDate.getFullYear(),
            currentDate.getMonth() + 1,
            0
          );
          endOfMonth.setHours(23, 59, 59, 999);

          matchQuery.boughtAt = { $gte: startOfMonth, $lte: endOfMonth };
        } else {
          if (
            (startDate && startDate.trim() !== "") ||
            (endDate && endDate.trim() !== "")
          ) {
            matchQuery.$expr = { $and: [] };

            if (startDate && startDate.trim() !== "") {
              const start = new Date(startDate);
              start.setHours(0, 0, 0, 0);
              matchQuery.boughtAt = {
                ...(matchQuery.boughtAt as Record<string, unknown> | undefined),
                $gte: start,
              };
            }

            if (endDate && endDate.trim() !== "") {
              const end = new Date(endDate);
              end.setHours(23, 59, 59, 999);
              matchQuery.boughtAt = {
                ...(matchQuery.boughtAt as Record<string, unknown> | undefined),
                $lte: end,
              };
            }
          }
        }
        if (search && search.trim() !== "") {
          const searchRegex = new RegExp(search, "i");
          matchQuery.$or = [
            { name: { $regex: searchRegex } },
            { commandNumber: isNaN(parseInt(search)) ? -1 : parseInt(search) },
          ];
        }

        const aggregationPipeline = [
          { $match: matchQuery },
          {
            $lookup: {
              from: "settings",
              pipeline: [{ $limit: 1 }],
              as: "settingsData",
            },
          },
          {
            $unwind: {
              path: "$settingsData",
              preserveNullAndEmptyArrays: true,
            },
          },
          {
            $facet: {
              histories: [
                {
                  $addFields: {
                    totalHT: {
                      $round: [
                        {
                          $sum: {
                            $map: {
                              input: "$product",
                              as: "p",
                              in: {
                                $divide: [
                                  { $multiply: ["$$p.total", 100] },
                                  {
                                    $add: [
                                      { $ifNull: ["$$p.tva", "$tva"] },
                                      100,
                                    ],
                                  },
                                ],
                              },
                            },
                          },
                        },
                        2,
                      ],
                    },
                  },
                },
                {
                  $addFields: {
                    tvaAmount: {
                      $round: [{ $subtract: ["$total", "$totalHT"] }, 2],
                    },
                  },
                },
                {
                  $unwind: "$product",
                },
                {
                  $addFields: {
                    "product.plat._id": {
                      $toObjectId: "$product.plat._id",
                    },
                  },
                },
                {
                  $lookup: {
                    from: "products",
                    localField: "product.plat._id",
                    foreignField: "_id",
                    as: "productDetails",
                  },
                },
                {
                  $unwind: {
                    path: "$productDetails",
                    preserveNullAndEmptyArrays: true,
                  },
                },

                {
                  $lookup: {
                    from: "categories",
                    let: { categoryId: "$productDetails.category" },
                    pipeline: [
                      {
                        $match: {
                          $expr: { $eq: ["$_id", "$$categoryId"] },
                        },
                      },
                    ],
                    as: "categoryDetails",
                  },
                },
                {
                  $unwind: {
                    path: "$categoryDetails",
                    preserveNullAndEmptyArrays: true,
                  },
                },
                {
                  $lookup: {
                    from: "coupons",
                    let: { couponId: "$couponId" },
                    pipeline: [
                      { $match: { $expr: { $eq: ["$_id", "$$couponId"] } } },
                      { $project: { _id: 1, code: 1, couponType: 1 } },
                    ],
                    as: "couponDetails",
                  },
                },
                {
                  $unwind: {
                    path: "$couponDetails",
                    preserveNullAndEmptyArrays: true,
                  },
                },
                {
                  $group: {
                    _id: "$_id",
                    product: { $push: "$product" },
                    name: { $first: "$name" },
                    method: { $first: "$method.label" },
                    pack: { $first: "$pack.label" },
                    total: { $first: "$total" },
                    totalHT: { $first: "$totalHT" },
                    tvaAmount: { $first: "$tvaAmount" },
                    discountValue: { $first: "$discountValue" },
                    tva: { $first: "$tva" },
                    // tvaRate: { $first: "$tvaRate" },
                    boughtAt: { $first: "$boughtAt" },
                    currency: { $first: "$settingsData.defaultCurrency" },
                    commandNumber: { $first: "$commandNumber" },
                    status: { $first: "$status" },
                    coupon: { $first: "$couponDetails" },
                  },
                },
                { $sort: { boughtAt: -1 } },
                { $skip: skip },
                { $limit: limit },
              ],
            },
          },
        ];

        const statsQuery = { ...matchQuery };
        delete statsQuery.status;
        const result = await History.aggregate<HistoriesRtResult>(
          aggregationPipeline as mongoose.PipelineStage[]
        );
        const [{ histories }] = result;
        const counts = await History.aggregate<StatusCountsResult>([
          { $match: statsQuery },
          {
            $group: {
              _id: null,
              total: { $sum: 1 },
              enCours: {
                $sum: { $cond: [{ $eq: ["$status", "enCours"] }, 1, 0] },
              },
              terminee: {
                $sum: { $cond: [{ $eq: ["$status", "terminee"] }, 1, 0] },
              },
              annulee: {
                $sum: { $cond: [{ $eq: ["$status", "annulee"] }, 1, 0] },
              },
              echouee: {
                $sum: { $cond: [{ $eq: ["$status", "echouee"] }, 1, 0] },
              },
              enAttente: {
                $sum: { $cond: [{ $eq: ["$status", "enAttente"] }, 1, 0] },
              },
              enRetard: {
                $sum: { $cond: [{ $eq: ["$status", "enRetard"] }, 1, 0] },
              },
              remboursee: {
                $sum: { $cond: [{ $eq: ["$status", "remboursee"] }, 1, 0] },
              },
            },
          },
        ]);

        const stats = counts[0] || {};
        const total = await History.countDocuments(matchQuery);
        const restaurantTimezone = env.restaurantTimezone || "Europe/Paris";
        const formattedHistories = histories.map((history) => {
          // Format boughtAt date using moment-timezone
          const formattedBoughtAt = history.boughtAt
            ? dayjs(history.boughtAt)
                .tz(restaurantTimezone)
                .format("YYYY-MM-DD HH:mm:ss")
            : null;

          return {
            ...history,
            boughtAt: formattedBoughtAt,
          };
        });
        const response = {
          histories: formattedHistories,
          pagination: {
            currentPage: page,
            totalPages: Math.ceil(total / limit),
          },
          stats: {
            total: counts[0]?.total || 0,
            enCours: counts[0]?.enCours || 0,
            terminee: counts[0]?.terminee || 0,
            annulee: counts[0]?.annulee || 0,
            echouee: counts[0]?.echouee || 0,
            enAttente: counts[0]?.enAttente || 0,
            remboursee: counts[0]?.remboursee || 0,
            enRetard: counts[0]?.enRetard || 0,
          },
        };

        getHistoryIO()!.to(`restaurant-${restaurantId}`).emit("histories-update", response);
      } catch (error: unknown) {
        console.error("Error in fetch-histories:", error);
        socket.emit(
          "error",
          (socket.request as unknown as Request).t("history.fetch_histories_error", {
            error: errorMessage(error),
          })
        );
      }
    });
  } catch (error: unknown) {
    getHistoryIO()!.to(`restaurant`).emit("error", {
      message: "Failed to fetch histories",
      error: errorMessage(error),
    });
  }
};

let delayedOrderWorkerStarted = false;

export const startDelayedOrderWorker = () => {
  if (delayedOrderWorkerStarted) return;
  delayedOrderWorkerStarted = true;
  setInterval(() => {
    void checkAndUpdateDelayedOrders();
  }, 20 * 60 * 1000);
};

export const checkAndUpdateDelayedOrders = async (
  restaurantId?: string | null
) => {
  try {
    const twentyMinutesAgo = dayjs()
      .tz("Europe/Paris")
      .subtract(20, "minute")
      .toDate();

    const query: Record<string, unknown> = {
      status: "enCours",
      boughtAt: { $lt: twentyMinutesAgo },
    };
    if (restaurantId) {
      query.restaurantId = restaurantId;
    }

    const delayedOrders = await History.find(query);

    for (const order of delayedOrders) {
      await History.findOneAndUpdate(
        { _id: order._id, restaurantId: restaurantId ?? order.restaurantId },
        { status: "enRetard" },
        { new: true }
      );
      const statusHistory = new StatusHistory({
        historyId: order._id,
        status: "enRetard",
        updatedBy: "Système",
        updatedAt: dayjs().tz("Europe/Paris").toDate(),
      });

      await statusHistory.save();

      if (getHistoryIO()) {
        getHistoryIO()!.emit("status-update", {
          id: order._id,
          status: "enRetard",
          updatedAt: dayjs().tz("Europe/Paris").toDate(),
        });
      }
    }
  } catch (error: unknown) {
    console.error("Error checking delayed orders:", error);
  }
};
