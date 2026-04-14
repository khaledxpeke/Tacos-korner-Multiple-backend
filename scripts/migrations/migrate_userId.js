const path = require("path");
const mongoose = require("mongoose");
require("dotenv").config({
  path: path.resolve(__dirname, "../../.env"),
});

const User = require("../../models/user");

async function migrateUserIds() {
  if (!process.env.DATABASE_URL) {
    console.error("ERROR: DATABASE_URL not set.");
    process.exit(1);
  }

  await mongoose.connect(process.env.DATABASE_URL, {
    autoIndex: false,
  });

  const users = await User.find({
    $or: [{ userId: { $exists: false } }, { userId: null }],
  });
  let updatedCount = 0;

  const maxUserIdUser = await User.findOne({ userId: { $exists: true, $ne: null } }).sort({
    userId: -1,
  });
  let nextUserId =
    maxUserIdUser && maxUserIdUser.userId != null ? maxUserIdUser.userId + 1 : 1;

  for (const user of users) {
    user.userId = nextUserId;
    await user.save();
    console.log(`Updated user: ${user.email} with userId: ${user.userId}`);
    nextUserId++;
    updatedCount++;
  }

  const maxUser = await User.findOne({ userId: { $exists: true, $ne: null } }).sort({
    userId: -1,
  });
  if (maxUser && maxUser.userId != null) {
    await mongoose.connection.db.collection("counters").updateOne(
      { id: "userId", reference_value: null },
      { $set: { seq: maxUser.userId } },
      { upsert: true }
    );
  }

  console.log(`Migration complete. Updated ${updatedCount} users.`);
  await mongoose.disconnect();
}

migrateUserIds().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
