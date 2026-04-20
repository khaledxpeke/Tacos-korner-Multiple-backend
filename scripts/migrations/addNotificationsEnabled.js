const path = require("path");
const mongoose = require("mongoose");
require("dotenv").config({
  path: path.resolve(__dirname, "../../.env"),
});

const User = require("../../models/user");

(async () => {
  if (!process.env.DATABASE_URL) {
    console.error("ERROR: DATABASE_URL not set.");
    process.exit(1);
  }

  try {
    await mongoose.connect(process.env.DATABASE_URL, {
      autoIndex: false,
    });

    const result = await User.updateMany(
      { "restaurants.notificationsEnabled": { $exists: false } },
      { $set: { "restaurants.$[].notificationsEnabled": true } }
    );

    console.log(`✅ Migration complete! Updated ${result.modifiedCount} users`);
  } catch (error) {
    console.error("❌ Migration failed:", error);
    process.exit(1);
  } finally {
    if (mongoose.connection.readyState === 1) {
      await mongoose.disconnect();
    }
    console.log("Database connection closed");
  }
})();
