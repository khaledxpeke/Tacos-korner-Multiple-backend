const mongoose = require("mongoose");
const { USER_ROLES } = require("../enum/constants");
const UserSchema = new mongoose.Schema({
    email: {
        type: String,
        unique: true,
        required: true,
      },
      role: {
        type: String,
        enum: Object.values(USER_ROLES),
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
      isBlocked: {
        type: Boolean,
        default: false,
      },
      fcmToken: { type: String },
      restaurants: [{
        restaurantId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Restaurant"
        },
        role: {
            type: String,
            enum: Object.values(USER_ROLES),
            default: USER_ROLES.WAITER
        }
    }]

}, { timestamps: true });

const User = mongoose.model("User", UserSchema);
module.exports = User;
