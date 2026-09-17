import type { NextFunction, Request, Response } from "express";
import type { FilterQuery, Types } from "mongoose";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { env } from "../config/environment";
import { USER_ROLES, APP_TYPES, type UserRole } from "../enum/constants";
import { User, type IUser, type IUserRestaurant, type UserDocument } from "../models/user.model";
import { errorMessage } from "../utils/helpers";
import { authCookieOptions } from "../utils/authCookie";
import {
  isUserIdDuplicateError,
  syncUserIdSequence,
} from "../utils/userIdSequence";

// fcmToken is an internal push-notification device token — it has no
// reason to reach the browser, so strip it before a user object goes into
// any client-facing response (login, /me).
const toClientSafeUser = <T extends { fcmToken?: unknown }>(user: T) => {
  const { fcmToken: _fcmToken, ...safeUser } = user;
  return safeUser;
};

interface NewUserPayload {
  email: string;
  password: string;
  fullName: string;
  isBlocked: boolean;
  role: UserRole;
  restaurants?: IUserRestaurant[];
}

const respondWithCreatedUser = (
  req: Request,
  res: Response,
  createdUser: UserDocument
) => {
  const keepExistingSession = Boolean(req.user?.user || req.cookies?.jwt);
  const isDashboard = req.headers["app-type"] === APP_TYPES.DASHBOARD;

  if (keepExistingSession) {
    return res.status(201).json({
      user: createdUser,
      userId: createdUser.userId,
      message: req.t("user.created_successfully"),
    });
  }

  const maxAge = 8 * 60 * 60;
  const token = jwt.sign(
    {
      user: {
        _id: createdUser._id,
        email: createdUser.email,
        fullName: createdUser.fullName,
        role: createdUser.role,
        restaurants: createdUser.restaurants || [],
        isBlocked: createdUser.isBlocked,
      },
    },
    env.jwtSecret,
    { expiresIn: maxAge }
  );
  res.cookie("jwt", token, authCookieOptions(maxAge * 1000));
  res.status(201).json({
    user: createdUser,
    userId: createdUser.userId,
    ...(isDashboard ? {} : { token }),
  });
};

const createUserDocument = async (payload: NewUserPayload) => {
  try {
    return await User.create(payload);
  } catch (error) {
    if (!isUserIdDuplicateError(error)) {
      throw error;
    }
    await syncUserIdSequence();
    return await User.create(payload);
  }
};

interface PopulatedRestaurantRef {
  _id: Types.ObjectId;
  name: string;
  logo?: { url?: string } | null;
  settings?: { defaultCurrency?: string } | null;
}

interface PopulatedUserRestaurant {
  restaurantId: PopulatedRestaurantRef | null;
  role: UserRole;
  notificationsEnabled: boolean;
}

type LoginUserDoc = Omit<UserDocument, "restaurants"> & {
  restaurants: PopulatedUserRestaurant[];
  updatedAt?: Date;
};

type UserWithNamedRestaurants = Omit<UserDocument, "restaurants"> & {
  restaurants: Array<{
    restaurantId: { _id: Types.ObjectId; name: string };
    notificationsEnabled: boolean;
  }>;
};

export const register = async (req: Request, res: Response, _next: NextFunction) => {
  const { email, password, fullName, role: roleFromBody } = req.body as {
    email: string;
    password: string;
    fullName: string;
    role?: string;
  };
  const { restaurantId } = req;

  const userExists = await User.findOne({ email });
  if (userExists) {
    return res.status(400).json({ message: req.t("user.already_exists") });
  }

  let determinedUserRole: UserRole;
  let determinedRestaurantRoleForStaff: UserRole | undefined;

  const allowedStaffRoles: UserRole[] = [USER_ROLES.MANAGER, USER_ROLES.WAITER];

  if (restaurantId) {
    if (roleFromBody && allowedStaffRoles.includes(roleFromBody as UserRole)) {
      determinedUserRole = roleFromBody as UserRole;
      determinedRestaurantRoleForStaff = roleFromBody as UserRole;
    } else if (roleFromBody) {
      return res.status(400).json({
        message: req.t("user.invalid_staff_role", {
          role: roleFromBody,
          validRoles: allowedStaffRoles.join(", "),
        }),
      });
    } else {
      determinedUserRole = USER_ROLES.WAITER;
      determinedRestaurantRoleForStaff = USER_ROLES.WAITER;
    }
  } else if (req.user?.user?.role === USER_ROLES.ADMIN && roleFromBody) {
    if (!allowedStaffRoles.includes(roleFromBody as UserRole)) {
      return res.status(400).json({
        message: req.t("user.invalid_staff_role", {
          role: roleFromBody,
          validRoles: allowedStaffRoles.join(", "),
        }),
      });
    }
    determinedUserRole = roleFromBody as UserRole;
  } else {
    determinedUserRole = USER_ROLES.CLIENT;
  }

  try {
    bcrypt.hash(password, 10).then(async (hash) => {
      const newUser: NewUserPayload = {
        email,
        password: hash,
        fullName,
        isBlocked: false,
        role: determinedUserRole,
      };

      if (restaurantId) {
        newUser.restaurants = [
          {
            restaurantId: restaurantId,
            role: determinedRestaurantRoleForStaff,
          } as unknown as IUserRestaurant,
        ];
      }

      await createUserDocument(newUser)
        .then((createdUser) => respondWithCreatedUser(req, res, createdUser))
        .catch((error: unknown) =>
          res.status(400).json({
            message: req.t("user.creation_error"),
            error: errorMessage(error),
          })
        );
    });
  } catch (error) {
    res.status(400).json({
      message: req.t("user.password_hash_error"),
      error: errorMessage(error),
    });
  }
};

export const createUser = async (req: Request, res: Response, _next: NextFunction) => {
  const { email, password, fullName, role } = req.body as {
    email: string;
    password: string;
    fullName: string;
    role?: string;
  };
  const userExists = await User.findOne({ email });
  const allowedStaffRoles: UserRole[] = [USER_ROLES.MANAGER, USER_ROLES.WAITER];
  if (userExists) {
    return res.status(400).json({ message: req.t("user.already_exists") });
  }

  if (role && !allowedStaffRoles.includes(role as UserRole)) {
    return res.status(400).json({
      message: req.t("user.invalid_staff_role", {
        role: role,
        validRoles: allowedStaffRoles.join(", "),
      }),
    });
  }
  try {
    bcrypt.hash(password, 10).then(async (hash) => {
      const newUser: NewUserPayload = {
        email,
        password: hash,
        fullName,
        isBlocked: false,
        role: role as UserRole,
      };
      await createUserDocument(newUser)
        .then((createdUser) => respondWithCreatedUser(req, res, createdUser))
        .catch((error: unknown) =>
          res.status(400).json({
            message: req.t("user.creation_error"),
            error: errorMessage(error),
          })
        );
    });
  } catch (error) {
    res.status(400).json({
      message: req.t("user.password_hash_error"),
      error: errorMessage(error),
    });
  }
};

export const login = async (req: Request, res: Response, _next: NextFunction) => {
  const { email, password, fcmToken, appType: bodyAppType } = req.body as {
    email?: string;
    password?: string;
    fcmToken?: string;
    appType?: string;
  };
  const headerAppType = req.headers["app-type"];
  const appType = headerAppType || bodyAppType;

  if (!email || !password) {
    return res.status(400).json({
      message: req.t("user.invalid_credentials"),
    });
  }
  try {
    const user = (await User.findOne({ email }).populate({
      path: "restaurants.restaurantId",
      select: "name logo settings",
      populate: [
        {
          path: "settings",
          select: "defaultCurrency",
        },
        {
          path: "logo",
          select: "url",
        },
      ],
    })) as LoginUserDoc | null;
    if (!user) {
      res.status(401).json({
        message: req.t("user.not_found"),
        error: req.t("user.not_found"),
      });
    } else {
      const appTypeRoles: Record<string, UserRole[]> = {
        [APP_TYPES.MOBILE]: [
          USER_ROLES.ADMIN,
          USER_ROLES.MANAGER,
          USER_ROLES.WAITER,
          USER_ROLES.CLIENT,
        ],
        [APP_TYPES.BORNE]: [USER_ROLES.MANAGER, USER_ROLES.ADMIN, USER_ROLES.WAITER],
        [APP_TYPES.CASHIER]: [USER_ROLES.ADMIN, USER_ROLES.MANAGER, USER_ROLES.WAITER],
        [APP_TYPES.DASHBOARD]: [USER_ROLES.ADMIN, USER_ROLES.MANAGER],
        // delivery: [...], // add later
        // kitchen: [...], // add later
      };

      if (appType) {
        const allowedRoles = appTypeRoles[String(appType)];
        if (!allowedRoles) {
          return res.status(400).json({
            message: req.t("user.invalid_app_type"),
          });
        }
        if (!allowedRoles.includes(user.role)) {
          return res.status(403).json({
            message: req.t("user.unauthorized_for_app", { appType }),
          });
        }
      }
      if (user.isBlocked) {
        return res.status(403).json({
          message: req.t("user.account_blocked"),
          error: "Compte bloqué",
        });
      }
      // if (user.restaurants.length < 1 && user.role != USER_ROLES.ADMIN) {
      //   return res
      //     .status(400)
      //     .json({ message: req.t("user.not_assigned_to_any_restaurants") });
      // }
      bcrypt.compare(password, user.password).then(async function (result) {
        if (result) {
          if (fcmToken) {
            user.fcmToken = fcmToken;
            // await user.save();
          }
          let marketPayTokenToSend: string | null = null;
          const staffRoles: UserRole[] = [
            USER_ROLES.MANAGER,
            USER_ROLES.WAITER,
            USER_ROLES.ADMIN,
          ];
          const isStaffUser = staffRoles.includes(user.role);

          if (isStaffUser) {
            const newMarketPayToken = crypto.randomBytes(32).toString("hex");

            user.marketPayToken = newMarketPayToken;
            marketPayTokenToSend = newMarketPayToken;
          }

          await user.save();
          let maxAge = 8 * 60 * 60 * 60;
          if (user.role == USER_ROLES.WAITER) {
            maxAge = 30 * 24 * 60 * 60;
          }
          const restaurantsWithLogo = user.restaurants
            .filter((r) => r.restaurantId !== null)
            .map((r) => ({
              restaurantId: r.restaurantId!._id,
              name: r.restaurantId!.name,
              logo: r.restaurantId!.logo?.url?.replace(/\\/g, "/"),
              currency: r.restaurantId!.settings?.defaultCurrency,
              role: r.role,
              notificationsEnabled: r.notificationsEnabled,
            }));

          const tokenPayload = {
            user: {
              _id: user._id,
              email: user.email,
              fullName: user.fullName,
              role: user.role,
              fcmToken: user.fcmToken,
              restaurants: restaurantsWithLogo,
              isBlocked: user.isBlocked,
              updatedAt: user.updatedAt,
            },
          };
          const token = jwt.sign(tokenPayload, env.jwtSecret, {
            expiresIn: maxAge, // 8hrs in sec
          });
          res.cookie("jwt", token, authCookieOptions(maxAge * 1000));

          // The dashboard relies solely on the httpOnly cookie above and
          // never needs the raw token; other app types (mobile, kiosk,
          // cashier, ...) still authenticate with a bearer token, so keep
          // returning it for them.
          const isDashboard = appType === APP_TYPES.DASHBOARD;
          res.status(201).json({
            ...(isDashboard
              ? { user: toClientSafeUser(tokenPayload.user) }
              : { token: token }),
            userId: user.userId,
            marketPayToken: marketPayTokenToSend,
          });
        } else {
          res.status(400).json({ message: req.t("user.invalid_credentials") });
        }
      });
    }
  } catch (error) {
    res.status(400).json({
      message: req.t("user.login_error"),
      error: errorMessage(error),
    });
  }
};

export const getUsers = async (req: Request, res: Response, _next: NextFunction) => {
  try {
    const { restaurantId } = req;
    const users = await User.find({
      restaurants: { $elemMatch: { restaurantId } },
    })
      .select("-password")
      .sort({ createdAt: -1 });

    res.status(200).json(users);
  } catch (error) {
    res.status(400).json({
      message: req.t("user.get_users_error"),
      error: errorMessage(error),
    });
  }
};

export const getAllUsers = async (req: Request, res: Response, _next: NextFunction) => {
  try {
    const users = await User.find()
      .select("-password -restaurants -createdAt -updatedAt -fcmToken -__v")
      .sort({ createdAt: -1 });
    if (!users) {
      return res.status(404).json({ message: req.t("user.not_found") });
    }
    res.status(200).json(users);
  } catch (error) {
    res.status(400).json({
      message: req.t("user.get_users_error"),
      error: errorMessage(error),
    });
  }
};

export const getAssignableUsers = async (req: Request, res: Response, _next: NextFunction) => {
  try {
    const { restaurantId } = req;
    const { search, role } = req.query as { search?: string; role?: string };
    const loggedInUserRole = req.user!.user.role;

    const query: FilterQuery<IUser> = {
      "restaurants.restaurantId": { $ne: restaurantId },
      role: { $nin: [USER_ROLES.ADMIN, USER_ROLES.CLIENT] },
    };

    if (loggedInUserRole === USER_ROLES.MANAGER) {
      query.role = {
        $nin: [USER_ROLES.ADMIN, USER_ROLES.CLIENT, USER_ROLES.MANAGER],
      };
    }
    if (role) {
      query["role"] = role;
    }

    if (search) {
      query["$or"] = [
        { fullName: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
      ];
    }

    const users = await User.find(query).select("-password");

    res.status(200).json(users);
  } catch (error) {
    res.status(400).json({
      message: req.t("user.get_users_error"),
      error: errorMessage(error),
    });
  }
};

export const assignUserToRestaurant = async (
  req: Request,
  res: Response,
  _next: NextFunction
) => {
  try {
    const { userId } = req.params;
    const { restaurantId } = req;
    const { role } = req.body as { role?: string };

    const allowedAssignRoles: UserRole[] = [USER_ROLES.MANAGER, USER_ROLES.WAITER];
    if (!allowedAssignRoles.includes(role as UserRole)) {
      return res.status(400).json({
        message: req.t("user.invalid_role"),
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: req.t("user.not_found") });
    }

    user.restaurants.push({ restaurantId, role } as unknown as IUserRestaurant);
    await user.save();

    res.status(200).json({
      message: req.t("user.assigned_successfully"),
      user,
    });
  } catch (error) {
    console.error("Error in assignUserToRestaurant:", error);
    res.status(500).json({
      message: req.t("user.assignment_error"),
      error: errorMessage(error),
    });
  }
};

export const unassignUserFromRestaurant = async (
  req: Request,
  res: Response,
  _next: NextFunction
) => {
  try {
    const { userId } = req.params;
    const { restaurantId } = req;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: req.t("user.not_found") });
    }

    user.restaurants = user.restaurants.filter(
      (r) => r.restaurantId!.toString() !== restaurantId
    );
    await user.save();

    res.status(200).json({
      message: req.t("user.unassigned_successfully"),
      user,
    });
  } catch (error) {
    console.error("Error in unassignUserFromRestaurant:", error);
    res.status(500).json({
      message: req.t("user.unassignment_error"),
      error: errorMessage(error),
    });
  }
};

export const getUserbyId = async (req: Request, res: Response, _next: NextFunction) => {
  const userId = req.user!.user._id;
  // const { restaurantId } = req;
  if (!userId) {
    res.status(400).json({ message: req.t("user.id_not_found") });
  } else {
    const user = await User.findById(
      userId
      // restaurants: { $elemMatch: { restaurantId } },
    ).select("-password");
    if (!user) {
      return res.status(404).json({ message: req.t("user.not_found") });
    }

    res.status(200).json(user);
  }
};

const findUserForMutation = (userId: string, restaurantId?: string | null) =>
  restaurantId
    ? User.findOne({
        _id: userId,
        restaurants: { $elemMatch: { restaurantId } },
      })
    : User.findById(userId);

export const updateUser = async (req: Request, res: Response, _next: NextFunction) => {
  try {
    const { userId } = req.params;
    const { restaurantId } = req;
    const user = await findUserForMutation(userId, restaurantId);
    if (!user) {
      return res.status(404).json({ message: req.t("user.not_found") });
    }
    const { fullName, email, role } = req.body as {
      fullName?: string;
      email?: string;
      role?: string;
    };
    const loggedInUserId = req.user?.user?._id?.toString();
    user.fullName = fullName || user.fullName;
    user.email = email || user.email;

    if (
      role &&
      loggedInUserId &&
      loggedInUserId === userId.toString() &&
      role !== user.role
    ) {
      return res.status(403).json({
        message: req.t("user.cannot_change_own_role"),
      });
    }

    if (role) {
      const allowedUpdateRoles: UserRole[] = [USER_ROLES.MANAGER, USER_ROLES.WAITER];
      if (allowedUpdateRoles.includes(role as UserRole)) {
        user.role = role as UserRole;
        if (restaurantId && user.restaurants && user.restaurants.length > 0) {
          const restaurantIndexOfUser = user.restaurants.findIndex(
            (r) => r.restaurantId!.toString() === restaurantId
          );
          if (restaurantIndexOfUser !== -1) {
            user.restaurants[restaurantIndexOfUser]!.role = role as UserRole;
          }
        }
      } else {
        return res.status(400).json({
          message: req.t("user.invalid_update_role", {
            validRoles: allowedUpdateRoles.join(", "),
          }),
        });
      }
    }
    const savedUser = await user.save();
    return res
      .status(200)
      .json({ message: req.t("user.updated_successfully"), savedUser });
  } catch (error) {
    console.error("Erreur dans updateUser:", error);
    return res
      .status(500)
      .json({ message: req.t("user.update_error"), error: errorMessage(error) });
  }
};

export const blockUser = async (req: Request, res: Response, _next: NextFunction) => {
  try {
    const { userId } = req.params;
    const userRole = req.user!.user.role;
    const { restaurantId } = req;
    const user = await findUserForMutation(userId, restaurantId).select("-password");
    if (!user) {
      return res.status(404).json({ message: req.t("user.not_found") });
    }
    if (userRole == USER_ROLES.MANAGER) {
      const user = await findUserForMutation(userId, restaurantId).select("-password");
      if (user!.role === USER_ROLES.MANAGER) {
        return res.status(403).json({
          message: req.t("user.cannot_block_admin_manager"),
        });
      }
    }
    user.isBlocked = !user.isBlocked;
    await user.save();
    return res.status(200).json({
      message: req.t("user.blocked_successfully", {
        action: user.isBlocked ? "bloqué" : "débloqué",
      }),
    });
  } catch (error) {
    console.error("Error in blockUser:", error);
    return res
      .status(500)
      .json({ message: req.t("user.block_error"), error: errorMessage(error) });
  }
};

export const deleteUser = async (req: Request, res: Response, _next: NextFunction) => {
  try {
    const { userId } = req.params;
    const { restaurantId } = req;
    const deletedUser = restaurantId
      ? await User.findOneAndDelete({
          _id: userId,
          restaurants: { $elemMatch: { restaurantId } },
        })
      : await User.findByIdAndDelete(userId);

    if (!deletedUser) {
      return res.status(404).json({ message: req.t("user.not_found") });
    }

    return res
      .status(200)
      .json({ message: req.t("user.deleted_successfully") });
  } catch (error) {
    console.error("Erreur dans deleteUser:", error);
    return res
      .status(500)
      .json({ message: req.t("user.delete_error"), error: errorMessage(error) });
  }
};

export const logout = async (req: Request, res: Response) => {
  const userId = req.user!.user._id;
  const user = await User.findById(userId);
  user!.fcmToken = "";
  await user!.save();
  res.clearCookie("jwt", authCookieOptions());
  res.status(200).json({ message: req.t("user.token_updated") });
};

// Tells the caller who they are, based solely on the verified token
// (cookie or bearer header) — the dashboard uses this to restore a session
// on page load, since it can't read the httpOnly cookie itself to decode it.
export const me = async (req: Request, res: Response) => {
  res.status(200).json({ user: toClientSafeUser(req.user!.user) });
};

export const getUserRestaurants = async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const user = (await User.findById(userId)
      .populate("restaurants.restaurantId", "name")
      .select("fullName restaurants")) as UserWithNamedRestaurants | null;

    if (!user) {
      return res.status(404).json({ message: req.t("user.not_found") });
    }

    const restaurants = user.restaurants.map((r) => ({
      restaurantId: r.restaurantId._id,
      name: r.restaurantId.name,
      notificationsEnabled: r.notificationsEnabled,
    }));

    res.json(restaurants);
  } catch (error) {
    res.status(500).json({
      message: req.t("user.get_restaurants_error"),
      error: errorMessage(error),
    });
  }
};

export const updateUserRestaurantNotifications = async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const { restaurantIds } = req.body as { restaurantIds?: Array<{ toString(): string }> };
    const loggedInUserRole = req.user!.user.role;
    const loggedInUserId = req.user!.user._id;

    if (!Array.isArray(restaurantIds) || restaurantIds.length === 0) {
      return res.status(400).json({
        message: req.t("user.invalid_restaurant_ids"),
      });
    }

    if (
      loggedInUserRole !== USER_ROLES.ADMIN &&
      userId !== loggedInUserId.toString()
    ) {
      return res.status(403).json({ message: req.t("user.permission_denied") });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: req.t("user.not_found") });
    }

    const results: {
      success: Array<{ restaurantId: unknown; notificationsEnabled: boolean }>;
      failed: Array<{ restaurantId: unknown; message: string }>;
      notFound: Array<{ restaurantId: unknown; message: string }>;
    } = {
      success: [],
      failed: [],
      notFound: [],
    };

    for (const restaurantId of restaurantIds) {
      const restaurant = user.restaurants.find(
        (r) => r.restaurantId?.toString() === restaurantId.toString()
      );

      if (!restaurant) {
        results.notFound.push({
          restaurantId,
          message: req.t("user.not_assigned_to_restaurant"),
        });
        continue;
      }

      try {
        restaurant.notificationsEnabled = !restaurant.notificationsEnabled;
        results.success.push({
          restaurantId,
          notificationsEnabled: restaurant.notificationsEnabled,
        });
      } catch (error) {
        results.failed.push({
          restaurantId,
          message: errorMessage(error),
        });
      }
    }

    await user.save();

    res.json({
      message: req.t("user.notifications_updated_successfully"),
    });
  } catch (error) {
    res.status(500).json({
      message: req.t("user.notifications_update_error"),
      error: errorMessage(error),
    });
  }
};
