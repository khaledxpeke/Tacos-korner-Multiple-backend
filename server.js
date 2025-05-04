const express = require("express");
const app = express();
const connectDB = require("./db/db");
const cookieParser = require("cookie-parser");
const cors = require("cors");
const { roleAuth } = require("./middleware/auth");
const path = require("path");
const socketIo = require("socket.io");
const { setIO, getHistoriesRT } = require("./controllers/historyController");
const http = require("http");
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
});
setIO(io);
io.engine.on("connection_error", (err) => {
  console.log("Connection error:", err);
});
io.on("connection", (socket) => {
  console.log(`New client connected: ${socket.id}`);
  socket.on("join-restaurant", (restaurantId) => {
    socket.join(`restaurant-${restaurantId}`);
    console.log(`Socket ${socket.id} joined restaurant ${restaurantId}`);
  });
  // Test event every 5 seconds
  socket.on("disconnect", () => {
    console.log(`Client disconnected: ${socket.id}`);
  });

  getHistoriesRT(socket);
});
app.use(
  cors({
    origin: "*",
    credentials: true,
    exposedHeaders: ["Content-Type", "Authorization"],
  })
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
connectDB();

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
app.use("/api/media", require("./routes/mediaRoutes"));
app.use("/api/restaurant", require("./routes/restaurantRoutes"));
app.use("/api/uploads", express.static(path.join(__dirname, "uploads")));
app.use(
  "/api/uploads/carousel",
  express.static(path.join(__dirname, "uploads", "carousel"))
);
app.get("/adminRoute", roleAuth("admin"), (req, res) => {
  res.send("Authenticated Route for Admin");
});
app.get("/managerRoute", roleAuth("manager"), (req, res) => {
  res.send("Authenticated Route for Manager");
});
app.get("/waiterRoute", roleAuth(["waiter"]), (req, res) => {
  res.send("Authenticated Route for waiter");
});
app.get("/clientRoute", roleAuth("client"), (req, res) => {
  res.send("Authenticated Route for Client");
});
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.get("/logout", (req, res) => {
  res.cookie("jwt", "", { maxAge: "1" });
  res.redirect("/");
});
server.listen(PORT, () => {
  console.log(`Server is listening on port ${PORT}`);
});
