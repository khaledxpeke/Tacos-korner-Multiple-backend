/**
 * Diagnose topProducts image resolution against current DATABASE_URL.
 * Usage: node scripts/migrations/diagnoseTopProducts.js
 */
const mongoose = require("mongoose");
const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../../.env") });
const History = require("../../models/History");

async function main() {
  await mongoose.connect(process.env.DATABASE_URL);

  const sample = await History.aggregate([
    { $unwind: "$product" },
    {
      $group: {
        _id: "$product.plat._id",
        name: { $first: "$product.plat.name" },
        count: { $sum: 1 },
      },
    },
    { $sort: { count: -1 } },
    { $limit: 5 },
  ]);

  console.log("Top history product IDs:\n");
  for (const row of sample) {
    const id = row._id;
    let productFound = false;
    let mediaUrl = null;
    let productName = null;

    if (mongoose.Types.ObjectId.isValid(id)) {
      const prod = await mongoose.connection.db.collection("products").findOne(
        { _id: new mongoose.Types.ObjectId(id) },
        { projection: { name: 1, image: 1 } }
      );
      productFound = !!prod;
      productName = prod?.name;
      if (prod?.image) {
        const media = await mongoose.connection.db.collection("media").findOne(
          { _id: prod.image },
          { projection: { url: 1 } }
        );
        mediaUrl = media?.url || "NO MEDIA DOC";
      }
    }

    console.log({
      historyId: id,
      historyName: row.name,
      productFound,
      productName,
      mediaUrl,
    });
  }

  const agg = await History.aggregate([
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
      },
    },
  ]);

  console.log("\ntopProducts aggregation result:\n");
  console.log(JSON.stringify(agg, null, 2));

  console.log("\nName-based product match for stale history IDs:\n");
  for (const row of agg.slice(0, 5)) {
    const matches = await mongoose.connection.db
      .collection("products")
      .find({ name: new RegExp(`^${row.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") })
      .project({ name: 1, image: 1 })
      .toArray();
    console.log(row.name, "->", matches.length, "product(s)", matches[0]?._id?.toString());
  }

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
