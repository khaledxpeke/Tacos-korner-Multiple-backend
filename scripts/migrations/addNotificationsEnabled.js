const User = require("../../models/user");

async function migrate() {
  await User.updateMany(
    { "restaurants.notificationsEnabled": { $exists: false } },
    { $set: { "restaurants.$[].notificationsEnabled": true } }
  );
  console.log("Migration complete: Added notificationsEnabled to all restaurants");
}

migrate().catch(console.error);