const express = require("express");
const app = express();
const connectDB = require("./db/db");
const cookieParser = require("cookie-parser");
const cors = require("cors");
const { roleAuth } = require("./middleware/auth");
const path = require("path");
const socketIo = require("socket.io");
const i18next = require("i18next");
const i18nextMiddleware = require("i18next-http-middleware");
const FsBackend = require("i18next-fs-backend");
const { setIO, getHistoriesRT } = require("./controllers/historyController");
const settingsController = require("./controllers/settingsController");
const http = require("http");
const { USER_ROLES } = require("./enum/constants");
const PORT = process.env.PORT;
app.timeout = 300000;
const server = http.createServer(app);

const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
  pingTimeout: 60000,
  transports: ["websocket", "polling"],
  allowUpgrades: true,
  perMessageDeflate: {
    threshold: 2048,
  },
  path: "/socket.io/",
});
setIO(io);
io.engine.on("connection_error", (err) => {
  console.log("Connection error:", err);
});
settingsController.setIO(io);
io.on("connection", (socket) => {
  console.log(`New client connected: ${socket.id}`);

  // Test event every 5 seconds
  socket.on("disconnect", () => {
    console.log(`Client disconnected: ${socket.id}`);
  });
  socket.on("join-restaurant", (data) => {
    const { restaurantId } = data;
    socket.join(`restaurant-${restaurantId}`);
    console.log(`Socket ${socket.id} joined restaurant ${restaurantId}`);
    getHistoriesRT(socket, restaurantId);

    // const mockReq = { restaurantId }; // Define mockReq here
    // settingsController.getSettingsRT(socket, mockReq);
  });

  // socket.on("get-settings-rt", (data) => {
  //   // Assume data contains restaurantId and other req-like info
  //   const mockReq = { restaurantId: data.restaurantId }; // Mock req object
  //   settingsController.getSettingsRT(socket, mockReq);
  // });

  socket.on("disconnect", () => {
    console.log(`Client disconnected: ${socket.id}`);
  });
});
app.use(
  cors({
    origin: "*",
    credentials: true,
    exposedHeaders: ["Content-Type", "Authorization"],
  })
);

app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));
connectDB();

i18next
  .use(FsBackend)
  .use(i18nextMiddleware.LanguageDetector)
  .init({
    fallbackLng: "fr",
    preload: ["en", "fr", "ar"],
    ns: ["translation"],
    defaultNS: "translation",
    backend: { loadPath: path.join(__dirname, "translations/{{lng}}.json") },
    detection: {
      order: ["querystring", "cookie"],
      lookupQuerystring: "lng",
    },
    initImmediate: false,
    keySeparator: false,
  });

app.use(i18nextMiddleware.handle(i18next));

app.use((req, res, next) => {
  res.locals.t = req.t.bind(req);
  res.locals.lang = req.language;
  next();
});

// server = app.listen(PORT, function () {
//   console.log(`Server is listening on port ${PORT}`);
// });

app.use(cookieParser());
app.use("/api/auth", require("./routes/userRoutes"));
app.use("/api/product", require("./routes/productRoutes"));
app.use("/api/category", require("./routes/categoryRoutes"));
app.use("/api/desert", require("./routes/desertRoutes"));
app.use("/api/ingrediant", require("./routes/ingrediantRoutes"));
app.use("/api/type", require("./routes/typeRoutes"));
app.use("/api/extra", require("./routes/extraRoutes"));
app.use("/api/history", require("./routes/historyRoutes"));
app.use("/api/statusHistory", require("./routes/statusHistoryRoutes"));
app.use("/api/drink", require("./routes/drinkRoutes"));
app.use("/api/settings", require("./routes/settingsRoutes"));
app.use("/api/variation", require("./routes/variationRoutes"));
app.use("/api/typeVariation", require("./routes/typeVariationRoutes"));
app.use("/api/carousel", require("./routes/carouselMediaRoutes"));
app.use("/api/restaurant", require("./routes/restaurantRoutes"));
app.use("/api/coupon", require("./routes/couponRoutes"));
app.use("/api/database", require("./routes/databaseExporterRoutes"));
app.use("/api/images", require("./routes/generateImageHashesRoutes"));
app.use("/api/uploads", express.static(path.join(__dirname, "uploads")));
app.use(
  "/api/uploads/carousel",
  express.static(path.join(__dirname, "uploads", "carousel"))
);
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
app.set("views", path.join(__dirname, "views"));
app.get("/logout", (req, res) => {
  res.cookie("jwt", "", { maxAge: "1" });
  res.redirect("/");
});
// 404 handler for unmatched routes
app.use((req, res, next) => {
  res.status(404).json({ success: false, message: req.t("errors.not_found") });
});
/**
 * Global error handler with i18n
 */
app.use((err, req, res, next) => {
  console.error(err);
  const status = err.status || 500;
  const key =
    status === 401
      ? "errors.unauthorized"
      : status === 403
      ? "errors.forbidden"
      : status === 404
      ? "errors.not_found"
      : "errors.unknown";
  res.status(status).json({ success: false, message: req.t(key) });
});

server.listen(PORT, () => {
  console.log(`Server is listening on port ${PORT}`);
});
