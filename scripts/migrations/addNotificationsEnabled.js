import User from "../../models/user.js"; // ✅ .js extension required
import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config();

if (!process.env.DATABASE_URL) {
    console.error('ERROR: DATABASE_URL not set.');
    process.exit(1);
  }

(async () => {
  try {
    await mongoose.connect(process.env.DATABASE_URL, {
      autoIndex: false
    });
    
    const result = await User.updateMany(
      { "restaurants.notificationsEnabled": { $exists: false } },
      { $set: { "restaurants.$[].notificationsEnabled": true } }
    );
    
    console.log(`✅ Migration complete! Updated ${result.modifiedCount} users`);
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log("Database connection closed");
  }
})();