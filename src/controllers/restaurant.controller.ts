import type { Request, Response } from "express";
import fs from "fs/promises";
import mongoose from "mongoose";
import { env } from "../config/environment";
import { USER_ROLES } from "../enum/constants";
import localUpload from "../middleware/localMulter";
import { Restaurant } from "../models/restaurant.model";
import { User } from "../models/user.model";
import { Settings } from "../models/settings.model";
import { Category } from "../models/category.model";
import { Product } from "../models/product.model";
import { Media } from "../models/media.model";
import { History } from "../models/history.model";
import { Ingrediant } from "../models/ingrediant.model";
import { Variation } from "../models/variation.model";
import { TypeVariation } from "../models/typeVariation.model";
import { Type } from "../models/type.model";
import { Desert } from "../models/desert.model";
import { Extra } from "../models/extra.model";
import { Drink } from "../models/drink.model";
import { CarouselMedia } from "../models/carouselMedia.model";
import { forwardToMediaBackend } from "../services/media.service";
import { errorMessage } from "../utils/helpers";
import type { ISettings } from "../models/settings.model";

interface AggregatedRestaurant {
  _id: mongoose.Types.ObjectId;
  name: string;
  description?: string;
  active: boolean;
  createdAt?: Date;
  address: string;
  logo?: string | null;
  banner?: string | null;
}

interface MobileRestaurantObject {
  logo?: { url: string } | string | null;
  settings?: {
    banner?: { url: string } | string | null;
  } | null;
}

interface UserAssignment {
  userId: string;
  role: string;
}

export const createRestaurant = async (req: Request, res: Response) => {
  const upload = localUpload.single("logo");
  upload(req, res, async (err: unknown) => {
    if (err) {
      return res
        .status(400)
        .json({ message: "Image upload failed", error: errorMessage(err) });
    }
    let tempFilePath: string | null = null;
    try {
      const { name, description, address } = req.body as {
        name?: string;
        description?: string;
        address?: string;
      };
      if (!name || !description || !address) {
        return res.status(400).json({
          message: req.t("restaurant.fields_required"),
        });
      }

      const restaurant = new Restaurant({
        name,
        description,
        address,
        logo: null,
      });

      await restaurant.save();

      if (req.file) {
        tempFilePath = req.file.path;
        const mediaResponse = await forwardToMediaBackend({
          filePath: tempFilePath,
          restaurantId: restaurant._id.toString(),
          type: "logo",
          originalname: req.file.originalname,
        });

        const mediaDoc = new Media({
          filename: req.file.originalname,
          url: mediaResponse.url as string,
          mimeType: mediaResponse.mimeType || req.file.mimetype,
          size: mediaResponse.size || req.file.size,
          hash: mediaResponse.hash,
          uploadedBy: req.user?.user?._id,
          targetType: "Restaurant",
          targetId: restaurant._id,
          type: "logo",
          restaurantId: restaurant._id.toString(),
          scope: "restaurant",
        });
        await mediaDoc.save();

        restaurant.logo = mediaDoc._id;
        await restaurant.save();

        try {
          await fs.unlink(tempFilePath);
        } catch (cleanupErr) {
          console.error("Error deleting temp file:", cleanupErr);
        }
        tempFilePath = null;
      }
      const settings = new Settings({
        restaurantId: restaurant._id,
        tva: 10,
        method: [
          {
            _id: new mongoose.Types.ObjectId(),
            label: "Carte bancaire",
            isActive: true,
          },
          {
            _id: new mongoose.Types.ObjectId(),
            label: "Espèce",
            isActive: true,
          },
        ],
        defaultCurrency: "€",
        maxExtras: 5,
        maxDessert: 5,
        maxDrink: 5,
        pack: [
          {
            _id: new mongoose.Types.ObjectId(),
            label: "Sur Place",
            isActive: true,
          },
          {
            _id: new mongoose.Types.ObjectId(),
            label: "À emporter",
            isActive: true,
          },
        ],
        carouselDuration: 5,
        carouselTiming: 120,
        qrCode: "https://www.google.com",
        host: env.emailHost || "smtp.example.com",
        port: env.emailPort || 587,
        emailUser: env.emailUser || "",
        emailPass: env.emailPassword || "",
        emailSender: env.emailSender || "",
        emailName: env.emailName || "Restaurant",
        printerServerUrl: env.printerServerUrl || "",
      } as unknown as ISettings);
      await settings.save();
      restaurant.settings = settings._id;
      await restaurant.save();

      await User.findByIdAndUpdate(req.user!.user._id, {
        $push: {
          restaurants: {
            restaurantId: restaurant._id,
            role: USER_ROLES.ADMIN,
          },
        },
      });

      res.status(201).json({
        restaurant,
        message: req.t("restaurant.created"),
      });
    } catch (error) {
      if (req.file) {
        try {
          await fs.access(req.file.path);
          await fs.unlink(req.file.path);
        } catch (cleanupErr) {
          console.error("Error deleting temp file:", cleanupErr);
        }
      }
      const errObj = error as { response?: { data?: unknown }; message?: string };
      console.error("❌ Error:", errObj.response?.data || errObj.message);
      res.status(500).json({ message: errorMessage(error) });
    }
  });
};

export const getRestaurants = async (req: Request, res: Response) => {
  try {
    let matchStage: Record<string, unknown> = {};
    if (
      req.user!.user.role !== USER_ROLES.ADMIN &&
      req.user!.user.role !== USER_ROLES.CLIENT
    ) {
      const user = await User.findById(req.user!.user._id);
      if (!user!.restaurants || user!.restaurants.length === 0) {
        return res.status(200).json([]);
      }
      const restaurantIds = user!.restaurants.map((r) => r.restaurantId);
      matchStage = { _id: { $in: restaurantIds } };
    }

    const restaurants = await Restaurant.aggregate<AggregatedRestaurant>([
      { $match: matchStage },

      {
        $lookup: {
          from: "media",
          localField: "logo",
          foreignField: "_id",
          as: "logoMedia",
        },
      },

      {
        $lookup: {
          from: "settings",
          localField: "settings",
          foreignField: "_id",
          as: "settingsData",
        },
      },
      { $unwind: { path: "$settingsData", preserveNullAndEmptyArrays: true } },

      {
        $lookup: {
          from: "media",
          localField: "settingsData.banner",
          foreignField: "_id",
          as: "bannerMedia",
        },
      },

      {
        $project: {
          _id: 1,
          name: 1,
          description: 1,
          active: 1,
          createdAt: 1,
          address: 1,
          logo: { $arrayElemAt: ["$logoMedia.url", 0] },
          banner: { $arrayElemAt: ["$bannerMedia.url", 0] },
        },
      },
    ]);
    const normalized = restaurants.map((r) => ({
      ...r,
      logo: r.logo?.replace(/\\/g, "/") || null,
      banner: r.banner?.replace(/\\/g, "/") || null,
    }));

    res.status(200).json(normalized);
  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({ message: req.t("errors.unknown") });
  }
};

export const getMobileRestaurants = async (req: Request, res: Response) => {
  try {
    let restaurants;

    if (
      req.user!.user.role === USER_ROLES.ADMIN ||
      req.user!.user.role === USER_ROLES.CLIENT
    ) {
      restaurants = await Restaurant.find({ active: true })
        .select("name description active createdAt address logo settings")
        .populate({
          path: "logo",
          select: "url",
        })
        .populate({
          path: "settings",
          populate: {
            path: "banner",
            select: "url",
          },
        });
    } else {
      const user = await User.findById(req.user!.user._id);

      if (!user!.restaurants || user!.restaurants.length === 0) {
        return res.status(200).json([]);
      }

      const restaurantIds = user!.restaurants.map((r) => r.restaurantId);
      restaurants = await Restaurant.find({
        _id: { $in: restaurantIds },
        active: true,
      })
        .select("name description active createdAt address logo settings")
        .populate({
          path: "logo",
          select: "url",
        })
        .populate({
          path: "settings",
          populate: {
            path: "banner",
            select: "url",
          },
        });
    }
    const transformedRestaurants = restaurants.map((restaurant) => {
      const restaurantObj = restaurant.toObject() as MobileRestaurantObject;

      if (restaurantObj.logo && typeof restaurantObj.logo === "object") {
        restaurantObj.logo = restaurantObj.logo.url.replace(/\\/g, "/") || null;
      }

      if (restaurantObj.settings && restaurantObj.settings.banner) {
        if (typeof restaurantObj.settings.banner === "object") {
          restaurantObj.settings.banner =
            (restaurantObj.settings.banner as { url: string }).url.replace(/\\/g, "/") ||
            null;
        }
      }

      return restaurantObj;
    });

    res.status(200).json(transformedRestaurants);
  } catch (error) {
    res.status(500).json({ message: req.t("errors.unknown") });
  }
};

export const getRestaurantById = async (req: Request, res: Response) => {
  try {
    const restaurant = await Restaurant.findById(req.params.restaurantId).populate(
      "settings"
    );

    if (!restaurant) {
      return res.status(404).json({ message: req.t("restaurant.not_found") });
    }

    res.status(200).json(restaurant);
  } catch (error) {
    res.status(500).json({ message: errorMessage(error) });
  }
};

export const updateRestaurant = async (req: Request, res: Response) => {
  const upload = localUpload.single("logo");
  upload(req, res, async (err: unknown) => {
    if (err) {
      return res.status(400).json({
        message: req.t("errors.image_upload_failed"),
        error: errorMessage(err),
      });
    }
    let tempFilePath: string | null = null;
    try {
      const { name, description, active, address } = req.body as {
        name?: string;
        description?: string;
        active?: boolean;
        address?: string;
      };
      const existedRestaurant = await Restaurant.findById(req.params.restaurantId);
      if (!existedRestaurant) {
        return res.status(404).json({ message: req.t("restaurant.not_found") });
      }

      if (req.file) {
        tempFilePath = req.file.path;
        const oldMediaId = existedRestaurant.logo;

        const mediaResponse = await forwardToMediaBackend({
          filePath: tempFilePath,
          restaurantId: existedRestaurant._id.toString(),
          type: "logo",
          originalname: req.file.originalname,
        });

        const mediaDoc = new Media({
          filename: mediaResponse.filename || req.file.originalname,
          url: mediaResponse.url as string,
          mimeType: mediaResponse.mimeType || req.file.mimetype,
          size: mediaResponse.size || req.file.size,
          hash: mediaResponse.hash,
          uploadedBy: req.user?.user?._id,
          targetType: "Restaurant",
          targetId: existedRestaurant._id,
          type: "logo",
          restaurantId: existedRestaurant._id.toString(),
          scope: "restaurant",
        });
        await mediaDoc.save();

        if (oldMediaId) {
          await Media.findOneAndDelete({
            _id: oldMediaId,
            targetType: "Restaurant",
            targetId: existedRestaurant._id,
            type: "logo",
          });
        }

        existedRestaurant.logo = mediaDoc._id;

        try {
          await fs.unlink(tempFilePath);
        } catch (cleanupErr) {
          console.error("Error deleting temp file:", cleanupErr);
        }
        tempFilePath = null;
      }

      if (name) existedRestaurant.name = name;
      if (address) existedRestaurant.address = address;
      if (description !== undefined) existedRestaurant.description = description;
      if (active !== undefined) existedRestaurant.active = active;

      await existedRestaurant.save();

      res.status(200).json({
        existedRestaurant,
        message: req.t("restaurant.updated"),
      });
    } catch (error) {
      if (tempFilePath) {
        try {
          await fs.unlink(tempFilePath);
        } catch {}
      }
      console.error("❌ Update restaurant error:", errorMessage(error));
      res.status(500).json({ message: req.t("errors.unknown") });
    }
  });
};

export const deleteRestaurant = async (req: Request, res: Response) => {
  try {
    const restaurant = await Restaurant.findById(req.params.restaurantId);
    if (!restaurant) {
      return res.status(404).json({ message: req.t("restaurant.not_found") });
    }

    await User.updateMany(
      { "restaurants.restaurantId": req.params.restaurantId },
      {
        $pull: {
          restaurants: { restaurantId: req.params.restaurantId },
        },
      }
    );
    await Promise.all([
      Product.deleteMany({ restaurantId: restaurant._id }),
      History.deleteMany({ restaurantId: restaurant._id }),
      Category.deleteMany({ restaurantId: restaurant._id }),
      Ingrediant.deleteMany({ restaurantId: restaurant._id }),
      Variation.deleteMany({ restaurantId: restaurant._id }),
      TypeVariation.deleteMany({ restaurantId: restaurant._id }),
      Type.deleteMany({ restaurantId: restaurant._id }),
      Desert.deleteMany({ restaurantId: restaurant._id }),
      Drink.deleteMany({ restaurantId: restaurant._id }),
      Extra.deleteMany({ restaurantId: restaurant._id }),
      CarouselMedia.deleteMany({ restaurantId: restaurant._id }),
      Settings.findByIdAndDelete(restaurant.settings),
      Restaurant.findByIdAndDelete(req.params.restaurantId),
    ]);

    res.status(200).json({ message: req.t("restaurant.deleted") });
  } catch (error) {
    console.error("Error deleting restaurant:", error);
    res.status(500).json({ message: req.t("errors.unknown") });
  }
};

export const assignUserToRestaurant = async (req: Request, res: Response) => {
  try {
    const { restaurantId } = req.params;
    let usersToProcess: UserAssignment[] = [];

    // Check if restaurant exists
    const restaurant = await Restaurant.findById(restaurantId);
    if (!restaurant) {
      return res.status(404).json({ message: req.t("restaurant.not_found") });
    }

    const body = req.body as {
      users?: UserAssignment[];
      userId?: string;
      role?: string;
    };

    // Handle both single user and multiple users
    if (body.users && Array.isArray(body.users)) {
      // Multiple users in an array
      usersToProcess = body.users;
    } else if (body.userId) {
      // Single user as direct properties
      usersToProcess = [
        {
          userId: body.userId,
          role: body.role as string,
        },
      ];
    } else {
      return res.status(400).json({
        message: req.t("restaurant.invalid_request"),
      });
    }

    // Track results
    const results: {
      successful: Array<{
        userId: string;
        name?: string;
        role?: string;
        message: string;
      }>;
      failed: Array<{
        userId: string;
        name?: string;
        message: string;
      }>;
    } = {
      successful: [],
      failed: [],
    };

    // Process each user
    for (const { userId, role } of usersToProcess) {
      try {
        // Check if user exists
        const user = await User.findById(userId);
        if (!user) {
          results.failed.push({
            userId,
            message: req.t("restaurant.user_not_found"),
          });
          continue;
        }

        // Handle role-specific logic
        if (role === USER_ROLES.WAITER) {
          // For waiters, check if they're already assigned to any restaurant
          if (user.restaurants && user.restaurants.length > 0) {
            // If the waiter is already assigned to this restaurant, just update the role
            if (
              user.restaurants.length === 1 &&
              user.restaurants[0]!.restaurantId!.toString() === restaurantId
            ) {
              await User.updateOne(
                {
                  _id: userId,
                  "restaurants.restaurantId": restaurantId,
                },
                {
                  $set: { "restaurants.$.role": role },
                }
              );
              results.successful.push({
                userId,
                name: user.fullName,
                message: req.t("restaurant.role_updated"),
              });
              continue;
            }

            // If waiter is assigned elsewhere, add to failed results
            results.failed.push({
              userId,
              name: user.fullName,
              message: req.t("restaurant.waiter_single_restaurant"),
            });
            continue;
          }

          // If not assigned anywhere, assign to this restaurant
          await User.findByIdAndUpdate(userId, {
            $set: { restaurants: [{ restaurantId, role }] },
          });
        } else if (role === USER_ROLES.MANAGER) {
          // Managers can be assigned to multiple restaurants
          // Check if already assigned to this restaurant
          const hasRestaurant =
            user.restaurants &&
            user.restaurants.some((r) => r.restaurantId!.toString() === restaurantId);

          if (hasRestaurant) {
            // Update role if already assigned
            await User.updateOne(
              {
                _id: userId,
                "restaurants.restaurantId": restaurantId,
              },
              {
                $set: { "restaurants.$.role": role },
              }
            );
          } else {
            // Add restaurant to user's list
            await User.findByIdAndUpdate(userId, {
              $push: {
                restaurants: {
                  restaurantId,
                  role,
                },
              },
            });
          }
        } else if (role === USER_ROLES.ADMIN) {
          // Admins have access to all restaurants by default
          // We can add this specific restaurant to their list for clarity
          const hasRestaurant =
            user.restaurants &&
            user.restaurants.some((r) => r.restaurantId!.toString() === restaurantId);

          if (!hasRestaurant) {
            await User.findByIdAndUpdate(userId, {
              $push: {
                restaurants: {
                  restaurantId,
                  role: USER_ROLES.ADMIN,
                },
              },
            });
          }
        } else if (role === USER_ROLES.CLIENT) {
          // Clients don't need restaurant assignments
          results.failed.push({
            userId,
            name: user.fullName,
            message: req.t("restaurant.client_no_assignment"),
          });
          continue;
        }

        // If we got here, the assignment was successful
        results.successful.push({
          userId,
          name: user.fullName,
          role,
          message: req.t("restaurant.user_assigned"),
        });
      } catch (error) {
        results.failed.push({
          userId,
          message: errorMessage(error),
        });
      }
    }

    // Return appropriate response based on number of users processed
    if (usersToProcess.length === 1) {
      // For single user case
      if (results.successful.length === 1) {
        return res.status(200).json({
          message: req.t("restaurant.user_assigned"),
          user: results.successful[0],
        });
      } else {
        return res.status(400).json({
          message: results.failed[0]!.message,
          details: results.failed[0],
        });
      }
    } else {
      // For multiple users case
      return res.status(200).json({
        message: req.t("restaurant.assignment_results", {
          successful: results.successful.length,
          failed: results.failed.length,
        }),
        results,
      });
    }
  } catch (error) {
    res.status(500).json({ message: req.t("errors.unknown") });
  }
};

export const removeUserFromRestaurant = async (req: Request, res: Response) => {
  try {
    const { userId } = req.body as { userId?: string };
    const { restaurantId } = req.params;

    // Check if user exists
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: req.t("restaurant.user_not_found") });
    }

    // Check if user is assigned to this restaurant
    const hasRestaurant = user.restaurants.some(
      (r) => r.restaurantId!.toString() === restaurantId
    );

    if (!hasRestaurant) {
      return res.status(404).json({
        message: req.t("restaurant.user_not_assigned"),
      });
    }

    // Remove this restaurant from user's assignments
    await User.findByIdAndUpdate(userId, {
      $pull: {
        restaurants: { restaurantId },
      },
    });

    res.status(200).json({ message: req.t("restaurant.user_removed") });
  } catch (error) {
    res.status(500).json({ message: req.t("errors.unknown") });
  }
};
