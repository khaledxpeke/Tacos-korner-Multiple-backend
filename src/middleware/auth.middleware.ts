import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/environment";
import { User } from "../models/user.model";
import { USER_ROLES, APP_TYPES } from "../enum/constants";
import type { JwtPayload } from "../interfaces/auth.interface";

export const roleAuth = (expectedRoles: string | readonly string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const authHeader = req.headers["authorization"];
    const token = authHeader && authHeader.split(" ")[1];
    if (token == null) {
      return res.status(401).json({ message: req.t("errors.token_missing") });
    }
    jwt.verify(token, env.jwtSecret, (err, user) => {
      if (err) {
        return res.status(403).json({ message: req.t("errors.token_invalid") });
      }

      const decoded = user as JwtPayload;
      if (!expectedRoles.includes(decoded.user.role)) {
        return res.status(403).json({ message: req.t("errors.forbidden") });
      }
      req.user = decoded;
      next();
    });
  };
};

export const restaurantAuth = () => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const restaurantIdParam = req.params.restaurantId;
      const restaurantIdFromInput =
        (Array.isArray(restaurantIdParam) ? restaurantIdParam[0] : restaurantIdParam) ||
        (req.headers["restaurant-id"] as string | undefined);
      const appType = req.headers["app-type"];
      const authorizationHeader = req.headers["authorization"];
      const token = authorizationHeader && authorizationHeader.split(" ")[1];

      if (req.path === "/register") {
        if (appType === APP_TYPES.MOBILE || appType === APP_TYPES.BORNE) {
          req.restaurantId = null;
          return next();
        } else if (
          appType === APP_TYPES.DASHBOARD ||
          appType === APP_TYPES.CASHIER ||
          appType === APP_TYPES.DELIVERY ||
          appType === APP_TYPES.KITCHEN
        ) {
          if (!token) {
            if (!restaurantIdFromInput) {
              return res.status(400).json({
                message: req.t("restaurant.register.restaurant_id_required_initial", {
                  appType,
                }),
              });
            }
            req.restaurantId = restaurantIdFromInput;
            return next();
          }
        } else {
          if (!token && restaurantIdFromInput) {
            req.restaurantId = restaurantIdFromInput;
            return next();
          } else if (!token && !restaurantIdFromInput) {
            return res.status(400).json({
              message: req.t("restaurant.register.incomplete_info"),
            });
          }
        }
      }

      if (req.path === "/stream") {
        req.restaurantId = restaurantIdFromInput || null;
        return next();
      }

      if (!token) {
        return res.status(401).json({ message: req.t("errors.token_missing") });
      }

      jwt.verify(token, env.jwtSecret, async (err, decodedToken) => {
        if (err) {
          return res.status(403).json({ message: req.t("errors.token_invalid") });
        }

        const decoded = decodedToken as JwtPayload;
        req.user = decoded;

        const userDoc = await User.findById(decoded.user._id);
        if (!userDoc) {
          return res.status(404).json({ message: req.t("errors.user_not_found") });
        }

        if (req.path === "/register") {
          if (!restaurantIdFromInput) {
            return res.status(400).json({
              message: req.t("restaurant.register.restaurant_id_required_existing"),
            });
          }
        }

        if (decoded.user.role === USER_ROLES.ADMIN) {
          if (!restaurantIdFromInput) {
            return res.status(400).json({
              message: req.t("errors.restaurant_id_required"),
            });
          }
          req.restaurantId = restaurantIdFromInput;
          return next();
        }

        if (decoded.user.role === USER_ROLES.CLIENT) {
          req.restaurantId = restaurantIdFromInput;
          return next();
        }

        if (!restaurantIdFromInput) {
          return res.status(400).json({
            message: req.t("errors.restaurant_id_required_for_role", {
              role: decoded.user.role,
            }),
          });
        }

        const hasAccess =
          userDoc.restaurants &&
          userDoc.restaurants.some(
            (r) => r.restaurantId && r.restaurantId.toString() === restaurantIdFromInput
          );

        if (!hasAccess) {
          return res.status(403).json({
            message: req.t("errors.not_authorized_for_restaurant"),
          });
        }

        req.restaurantId = restaurantIdFromInput;
        next();
      });
    } catch (error) {
      console.error("Restaurant auth error:", error);
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ message: req.t("restaurant.auth_error"), error: message });
    }
  };
};
