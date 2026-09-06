import express, { Application } from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import path from "path";
import { paths } from "./config/paths";
import { initI18n, i18nMiddleware } from "./config/i18n";
import { setupSwagger } from "./config/swagger";
import { roleAuth } from "./middleware/auth.middleware";
import { notFoundMiddleware, errorMiddleware } from "./middleware/error.middleware";
import { USER_ROLES } from "./enum/constants";
import authRoutes from "./routes/auth.routes";
import productRoutes from "./routes/product.routes";
import categoryRoutes from "./routes/category.routes";
import desertRoutes from "./routes/desert.routes";
import ingrediantRoutes from "./routes/ingrediant.routes";
import typeRoutes from "./routes/type.routes";
import extraRoutes from "./routes/extra.routes";
import historyRoutes from "./routes/history.routes";
import statusHistoryRoutes from "./routes/statusHistory.routes";
import drinkRoutes from "./routes/drink.routes";
import settingsRoutes from "./routes/settings.routes";
import variationRoutes from "./routes/variation.routes";
import typeVariationRoutes from "./routes/typeVariation.routes";
import carouselMediaRoutes from "./routes/carouselMedia.routes";
import restaurantRoutes from "./routes/restaurant.routes";
import couponRoutes from "./routes/coupon.routes";
import mediaRoutes from "./routes/media.routes";
import currencyRoutes from "./routes/currency.routes";
import allergyRoutes from "./routes/allergy.routes";
import databaseExporterRoutes from "./routes/databaseExporter.routes";
import generateImageHashesRoutes from "./routes/generateImageHashes.routes";
import marketPayRoutes from "./routes/marketPay.routes";

export const createApp = (): Application => {
  const app = express();
  (app as unknown as { timeout: number }).timeout = 300000;

  app.use(
    cors({
      origin: "*",
      credentials: true,
      exposedHeaders: ["Content-Type", "Authorization"],
    })
  );

  app.use(express.json({ limit: "2mb" }));
  app.use(express.urlencoded({ extended: true }));

  initI18n();
  app.use(i18nMiddleware());

  app.use((req, res, next) => {
    res.locals.t = req.t.bind(req);
    res.locals.lang = req.language;
    next();
  });

  app.use(cookieParser());
  setupSwagger(app);

  app.use("/api/auth", authRoutes);
  app.use("/api/product", productRoutes);
  app.use("/api/category", categoryRoutes);
  app.use("/api/desert", desertRoutes);
  app.use("/api/ingrediant", ingrediantRoutes);
  app.use("/api/type", typeRoutes);
  app.use("/api/extra", extraRoutes);
  app.use("/api/history", historyRoutes);
  app.use("/api/statusHistory", statusHistoryRoutes);
  app.use("/api/drink", drinkRoutes);
  app.use("/api/settings", settingsRoutes);
  app.use("/api/variation", variationRoutes);
  app.use("/api/typeVariation", typeVariationRoutes);
  app.use("/api/carousel", carouselMediaRoutes);
  app.use("/api/restaurant", restaurantRoutes);
  app.use("/api/coupon", couponRoutes);
  app.use("/api/media", mediaRoutes);
  app.use("/api/currency", currencyRoutes);
  app.use("/api/allergy", allergyRoutes);
  app.use("/api/database", databaseExporterRoutes);
  app.use("/api/images", generateImageHashesRoutes);
  app.use("/api/payment", marketPayRoutes);
  app.use("/api/uploads", express.static(paths.uploads));
  app.use("/api/uploads/carousel", express.static(path.join(paths.uploads, "carousel")));

  app.get("/adminRoute", roleAuth([USER_ROLES.ADMIN]), (req, res) => {
    res.send(req.t("routes.authenticated.admin"));
  });
  app.get("/managerRoute", roleAuth([USER_ROLES.MANAGER]), (req, res) => {
    res.send(req.t("routes.authenticated.manager"));
  });
  app.get("/waiterRoute", roleAuth([USER_ROLES.WAITER]), (req, res) => {
    res.send(req.t("routes.authenticated.waiter"));
  });
  app.get("/clientRoute", roleAuth([USER_ROLES.CLIENT]), (req, res) => {
    res.send(req.t("routes.authenticated.client"));
  });

  app.get("/welcome", (req, res) => {
    res.json({ lang: req.language, message: req.t("welcome") });
  });

  app.set("view engine", "ejs");
  app.set("views", paths.views);
  app.get("/logout", (req, res) => {
    res.cookie("jwt", "", { maxAge: 1 });
    res.redirect("/");
  });

  app.use(notFoundMiddleware);
  app.use(errorMiddleware);

  return app;
};
