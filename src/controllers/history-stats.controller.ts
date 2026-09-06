import type { Request, Response } from "express";
import mongoose from "mongoose";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";
import { History } from "../models/history.model";
import { Settings } from "../models/settings.model";
import { errorMessage } from "../utils/helpers";
import type {
  CurrentPeriodStats,
  PreviousPeriodStats,
  StatisticsQuery,
  StatusCountsAgg,
  TotalPlatStats,
} from "../interfaces/history.interface";

dayjs.extend(utc);
dayjs.extend(timezone);

export const getStatistics = async (req: Request, res: Response) => {
  try {
    const { restaurantId } = req;
    const { filter = "today", startDate, endDate } = req.query as StatisticsQuery;
    const currentDate = dayjs().tz("Europe/Paris").toDate();
    const matchQuery: Record<string, unknown> = {
      restaurantId: new mongoose.Types.ObjectId(restaurantId as string),
    };
    let revenueMatchQuery: Record<string, unknown> = {}; // For revenue calculations (date + status)
    let previousPeriodMatchQuery: Record<string, unknown> = {}; // For date filtering only
    let previousPeriodRevenueMatchQuery: Record<string, unknown> = {}; // For revenue calculations (date + status)
    const settings = await Settings.findOne({
      restaurantId: new mongoose.Types.ObjectId(restaurantId as string),
    });
    const methods = settings?.method ?? [];
    const packs = settings?.pack ?? [];
    const cardMethod =
      methods.find((m) => /carte|card|cb|bancaire/i.test(m.label || "")) ??
      methods[1];
    const cashMethod =
      methods.find((m) => /esp[eè]ce|cash/i.test(m.label || "")) ?? methods[0];
    const dinePack =
      packs.find((p) => /sur\s*place|dine/i.test(p.label || "")) ?? packs[0];
    const takeawayPack =
      packs.find((p) => /emporter|takeaway|take.?away/i.test(p.label || "")) ??
      packs[1];
    const cbMethodId = cardMethod?._id?.toString() ?? "";
    const especeMethodId = cashMethod?._id?.toString() ?? "";
    const surPlacePackId = dinePack?._id?.toString() ?? "";
    const emporterPackId = takeawayPack?._id?.toString() ?? "";

    const matchesIdOrLabel = (
      field: "method" | "pack",
      id: string,
      labelRegex: string
    ) => ({
      $or: [
        ...(id
          ? [
              { $eq: [{ $toString: `$${field}._id` }, id] },
              { $eq: [`$${field}._id`, id] },
            ]
          : []),
        {
          $regexMatch: {
            input: { $ifNull: [`$${field}.label`, ""] },
            regex: labelRegex,
            options: "i",
          },
        },
      ],
    });
    const isCard = matchesIdOrLabel("method", cbMethodId, "carte|card|cb|bancaire");
    const isCash = matchesIdOrLabel("method", especeMethodId, "esp[eè]ce|cash");
    const isDineIn = matchesIdOrLabel("pack", surPlacePackId, "sur\\s*place|dine");
    const isTakeaway = matchesIdOrLabel(
      "pack",
      emporterPackId,
      "emporter|takeaway|take.?away"
    );
    let groupByFormat = "%Y-%m";
    if (filter === "today") groupByFormat = "%Y-%m-%d %H:00";
    if (filter === "week") groupByFormat = "%Y-%U";
    if (filter === "month") groupByFormat = "%Y-%m-%d";
    if (filter === "year") groupByFormat = "%Y-%m";
    if (filter === "custom") {
      const start = new Date(startDate as string);
      const end = new Date(endDate as string);
      const diffInDays = (Number(end) - Number(start)) / (1000 * 60 * 60 * 24);

      if (diffInDays <= 1) groupByFormat = "%Y-%m-%d %H:00";
      else if (diffInDays <= 31) groupByFormat = "%Y-%m-%d";
      else if (diffInDays <= 365) groupByFormat = "%Y-%m";
      else groupByFormat = "%Y";
    }

    if (
      (startDate && startDate.trim() !== "") ||
      (endDate && endDate.trim() !== "")
    ) {
      matchQuery.boughtAt = {};

      if (startDate && startDate.trim() !== "") {
        const start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        matchQuery.boughtAt = {
          ...(matchQuery.boughtAt as Record<string, unknown>),
          $gte: start,
        };
      }

      if (endDate && endDate.trim() !== "") {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        matchQuery.boughtAt = {
          ...(matchQuery.boughtAt as Record<string, unknown>),
          $lte: end,
        };
      }
    } else if (filter === "today") {
      const startOfDay = new Date(currentDate);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(currentDate);
      endOfDay.setHours(23, 59, 59, 999);
      const startOfYesterday = new Date(startOfDay);
      startOfYesterday.setDate(startOfYesterday.getDate() - 1);
      const endOfYesterday = new Date(endOfDay);
      endOfYesterday.setDate(endOfYesterday.getDate() - 1);

      matchQuery.boughtAt = { $gte: startOfDay, $lte: endOfDay };
      previousPeriodMatchQuery.boughtAt = {
        $gte: startOfYesterday,
        $lte: endOfYesterday,
      };
    } else if (filter === "week") {
      const day = currentDate.getDay() || 7;
      const startOfWeek = new Date(currentDate);
      startOfWeek.setDate(currentDate.getDate() - day + 1);
      startOfWeek.setHours(0, 0, 0, 0);
      const endOfWeek = new Date(startOfWeek);
      endOfWeek.setDate(startOfWeek.getDate() + 6);
      endOfWeek.setHours(23, 59, 59, 999);
      const startOfPreviousWeek = new Date(startOfWeek);
      startOfPreviousWeek.setDate(startOfPreviousWeek.getDate() - 7);
      const endOfPreviousWeek = new Date(endOfWeek);
      endOfPreviousWeek.setDate(endOfPreviousWeek.getDate() - 7);

      matchQuery.boughtAt = { $gte: startOfWeek, $lte: endOfWeek };
      previousPeriodMatchQuery.boughtAt = {
        $gte: startOfPreviousWeek,
        $lte: endOfPreviousWeek,
      };
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
      const startOfPreviousMonth = new Date(
        currentDate.getFullYear(),
        currentDate.getMonth() - 1,
        1
      );
      const endOfPreviousMonth = new Date(
        currentDate.getFullYear(),
        currentDate.getMonth(),
        0
      );
      endOfPreviousMonth.setHours(23, 59, 59, 999);

      matchQuery.boughtAt = { $gte: startOfMonth, $lte: endOfMonth };
      previousPeriodMatchQuery.boughtAt = {
        $gte: startOfPreviousMonth,
        $lte: endOfPreviousMonth,
      };
    }

    revenueMatchQuery = {
      ...matchQuery,
      status: { $in: ["terminee", "enCours", "enRetard", "enAttente"] },
    };
    previousPeriodRevenueMatchQuery = {
      ...previousPeriodMatchQuery,
      status: { $in: ["terminee", "enCours", "enRetard", "enAttente"] },
    };

    const statusCounts = await History.aggregate<StatusCountsAgg>([
      { $match: matchQuery },
      {
        $group: {
          _id: null,
          totalOrders: { $sum: 1 },
          orderStatuses: { $push: "$status" },
        },
      },
      {
        $addFields: {
          statusCounts: {
            $reduce: {
              input: "$orderStatuses",
              initialValue: {
                enCours: 0,
                terminee: 0,
                annulee: 0,
                enRetard: 0,
                enAttente: 0,
                echouee: 0,
                remboursee: 0,
              },
              in: {
                $mergeObjects: [
                  "$$value",
                  {
                    $switch: {
                      branches: [
                        {
                          case: { $eq: ["$$this", "enCours"] },
                          then: { enCours: { $add: ["$$value.enCours", 1] } },
                        },
                        {
                          case: { $eq: ["$$this", "terminee"] },
                          then: { terminee: { $add: ["$$value.terminee", 1] } },
                        },
                        {
                          case: { $eq: ["$$this", "annulee"] },
                          then: { annulee: { $add: ["$$value.annulee", 1] } },
                        },
                        {
                          case: { $eq: ["$$this", "enRetard"] },
                          then: { enRetard: { $add: ["$$value.enRetard", 1] } },
                        },
                        {
                          case: { $eq: ["$$this", "echouee"] },
                          then: { echouee: { $add: ["$$value.echouee", 1] } },
                        },
                        {
                          case: { $eq: ["$$this", "enAttente"] },
                          then: {
                            enAttente: { $add: ["$$value.enAttente", 1] },
                          },
                        },
                        {
                          case: { $eq: ["$$this", "remboursee"] },
                          then: {
                            remboursee: { $add: ["$$value.remboursee", 1] },
                          },
                        },
                      ],
                      default: "$$value",
                    },
                  },
                ],
              },
            },
          },
        },
      },
      {
        $project: {
          _id: 0,
          totalOrders: 1,
          orderStatuses: "$statusCounts",
        },
      },
    ]);

    const currentPeriodStats = await History.aggregate<CurrentPeriodStats>([
      { $match: revenueMatchQuery }, // Only completed orders for revenue
      {
        $group: {
          _id: null,
          totalRevenue: { $sum: "$total" },
          completedOrders: { $sum: 1 }, // Count of completed orders
          especeTotal: {
            $sum: {
              $cond: [isCash, "$total", 0],
            },
          },
          cbTotal: {
            $sum: {
              $cond: [isCard, "$total", 0],
            },
          },
          especeCount: {
            $sum: {
              $cond: [isCash, 1, 0],
            },
          },
          cbCount: {
            $sum: {
              $cond: [isCard, 1, 0],
            },
          },
          surPlaceCount: {
            $sum: {
              $cond: [isDineIn, 1, 0],
            },
          },
          emporterCount: {
            $sum: {
              $cond: [isTakeaway, 1, 0],
            },
          },
          surPlaceTotal: {
            $sum: {
              $cond: [isDineIn, "$total", 0],
            },
          },
          emporterTotal: {
            $sum: {
              $cond: [isTakeaway, "$total", 0],
            },
          },
        },
      },
      {
        $project: {
          _id: 0,
          totalRevenue: { $round: ["$totalRevenue", 2] },
          completedOrders: 1,
          moyenRevenue: {
            $round: [{ $divide: ["$totalRevenue", "$completedOrders"] }, 2],
          },
          paymentMethodsTotalRevenue: {
            espece: { $round: ["$especeTotal", 2] },
            cb: { $round: ["$cbTotal", 2] },
            especeCount: "$especeCount",
            cbCount: "$cbCount",
          },
          deliveryTypes: {
            surPlaceCount: "$surPlaceCount",
            emporterCount: "$emporterCount",
            surPlace: { $round: ["$surPlaceTotal", 2] },
            emporter: { $round: ["$emporterTotal", 2] },
          },
        },
      },
    ]);
    const revenueOverTime = await History.aggregate([
      { $match: revenueMatchQuery },
      {
        $group: {
          _id: {
            date: {
              $dateToString: { format: groupByFormat, date: "$boughtAt" },
            },
          },
          totalRevenue: { $sum: "$total" },
        },
      },
      { $sort: { "_id.date": 1 } },
      {
        $project: {
          _id: 0,
          date: "$_id.date",
          totalRevenue: { $round: ["$totalRevenue", 2] },
        },
      },
    ]);
    const topProductsStats = await History.aggregate([
      { $match: revenueMatchQuery },
      { $unwind: "$product" },
      {
        $lookup: {
          from: "products",
          let: {
            productId: { $toObjectId: "$product.plat._id" },
            productName: "$product.plat.name",
            restaurantId: "$restaurantId",
          },
          pipeline: [
            {
              $match: {
                $expr: {
                  $or: [
                    { $eq: ["$_id", "$$productId"] },
                    {
                      $and: [
                        { $eq: ["$restaurantId", "$$restaurantId"] },
                        {
                          $eq: [
                            { $toLower: "$name" },
                            { $toLower: "$$productName" },
                          ],
                        },
                      ],
                    },
                  ],
                },
              },
            },
            {
              $addFields: {
                _matchPriority: {
                  $cond: [{ $eq: ["$_id", "$$productId"] }, 0, 1],
                },
              },
            },
            { $sort: { _matchPriority: 1 } },
            { $limit: 1 },
            {
              $lookup: {
                from: "media",
                localField: "image",
                foreignField: "_id",
                as: "imageMedia",
                pipeline: [{ $project: { url: 1 } }],
              },
            },
            {
              $project: {
                name: 1,
                image: {
                  $let: {
                    vars: {
                      mediaUrl: { $arrayElemAt: ["$imageMedia.url", 0] },
                    },
                    in: {
                      $cond: {
                        if: { $ne: ["$$mediaUrl", null] },
                        then: "$$mediaUrl",
                        else: {
                          $cond: {
                            if: { $eq: [{ $type: "$image" }, "string"] },
                            then: "$image",
                            else: null,
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          ],
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
        $group: {
          _id: {
            id: "$product.plat._id",
            name: "$product.plat.name",
            image: "$productDetails.image",
          },
          totalCount: { $sum: "$product.plat.count" },
          totalRevenue: {
            $sum: { $multiply: ["$product.plat.price", "$product.plat.count"] },
          },
        },
      },
      { $sort: { totalCount: -1 } },
      { $limit: 7 },
      {
        $project: {
          _id: "$_id.id",
          name: "$_id.name",
          image: "$_id.image",
          totalCount: 1,
          totalRevenue: { $round: ["$totalRevenue", 2] },
        },
      },
    ]);

    const totalPlatStats = await History.aggregate<TotalPlatStats>([
      { $match: { restaurantId: new mongoose.Types.ObjectId(restaurantId as string) } },
      { $unwind: "$product" },
      {
        $group: {
          _id: null,
          totalPlat: { $sum: "$product.plat.count" }, // Sum all product quantities
        },
      },
    ]);

    const previousPeriodStats = await History.aggregate<PreviousPeriodStats>([
      { $match: previousPeriodRevenueMatchQuery },
      {
        $group: {
          _id: null,
          totalRevenue: { $sum: "$total" },
        },
      },
    ]);

    const currentRevenue = currentPeriodStats[0]?.totalRevenue || 0;
    const previousRevenue = previousPeriodStats[0]?.totalRevenue || 0;
    const totalRevenueSum = currentRevenue + previousRevenue;
    let currentRevenuePercentage = 0;

    if (totalRevenueSum > 0) {
      currentRevenuePercentage = (currentRevenue / totalRevenueSum) * 100;
    }
    const roundedCurrentRevenuePercentage = Math.floor(
      currentRevenuePercentage
    );

    let revenueDifference = currentRevenue - previousRevenue;
    if (currentRevenue < previousRevenue) {
      revenueDifference = revenueDifference * -1;
    }

    let revenueChange = 0;
    if (previousRevenue > 0) {
      revenueChange =
        ((currentRevenue - previousRevenue) / previousRevenue) * 100;
    } else if (currentRevenue > 0) {
      revenueChange = 100;
    }

    if (revenueChange < 0) {
      revenueChange = revenueChange * -1;
    }

    let timeRangeLabel = filter;
    if (startDate || endDate) {
      timeRangeLabel = "custom";
      if (startDate && endDate) {
        timeRangeLabel = `${startDate} to ${endDate}`;
      } else if (startDate) {
        timeRangeLabel = `From ${startDate}`;
      } else if (endDate) {
        timeRangeLabel = `Until ${endDate}`;
      }
    }

    res.status(200).json({
      ...(currentPeriodStats[0] || {
        moyenRevenue: 0,
        totalRevenue: 0,
        paymentMethodsTotalRevenue: { espece: 0, cb: 0 },
        deliveryTypes: {
          surPlace: 0,
          emporter: 0,
          surPlaceCount: 0,
          emporterCount: 0,
        },
      }),
      totalOrders: statusCounts[0]?.totalOrders || 0,
      totalPlat: totalPlatStats[0]?.totalPlat || 0,
      orderStatuses: statusCounts[0]?.orderStatuses || {
        enCours: 0,
        terminee: 0,
        annulee: 0,
        enRetard: 0,
        enAttente: 0,
        echouee: 0,
        remboursee: 0,
      },
      revenueComparison: {
        currentRevenue: currentRevenue,
        previousRevenue: previousRevenue,
        difference: Math.round(revenueDifference * 100) / 100,
        percentageChange: Math.round(revenueChange * 100) / 100,
        currentRevenuePercentage: roundedCurrentRevenuePercentage,
        trend:
          currentRevenue > previousRevenue
            ? "increase"
            : currentRevenue < previousRevenue
            ? "decrease"
            : "stable",
      },
      revenueOverTime,
      topProducts: topProductsStats,
    });
  } catch (error: unknown) {
    console.error("Error fetching statistics:", error);
    res.status(500).json({
      success: false,
      message: req.t("history.statistics_error"),
      error: errorMessage(error),
    });
  }
};
