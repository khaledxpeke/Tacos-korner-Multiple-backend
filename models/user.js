const mongoose = require("mongoose");
const UserSchema = new mongoose.Schema({
    email: {
        type: String,
        unique: true,
        required: true,
      },
      role: {
        type: String,
        enum: ["admin", "manager", "waiter","client"],
        required: true,
      },
      password: {
        type: String,
        required: true,
      },
      fullName: {
        type: String,
        required: true,
      },
      fcmToken: { type: String },
      restaurants: [{
        restaurantId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Restaurant"
        },
        role: {
            type: String,
            enum: ["admin", "manager", "waiter"],
            default: "waiter"
        }
    }]

});

const User = mongoose.model("User", UserSchema);
module.exports = User;
