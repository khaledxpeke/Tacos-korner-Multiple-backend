import mongoose, { Schema, model, type HydratedDocument, type Types } from "mongoose";
import AutoIncrementFactory from "mongoose-sequence";
import { USER_ROLES, type UserRole } from "../enum/constants";

export interface IUserRestaurant {
  restaurantId?: Types.ObjectId;
  role: UserRole;
  notificationsEnabled: boolean;
}

export interface IUser {
  email: string;
  role: UserRole;
  password: string;
  fullName: string;
  isBlocked: boolean;
  fcmToken?: string;
  userId?: number;
  marketPayToken?: string;
  restaurants: IUserRestaurant[];
}

export type UserDocument = HydratedDocument<IUser>;

const UserSchema = new Schema<IUser>(
  {
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
    userId: { type: Number, unique: true, sparse: true },
    marketPayToken: { type: String },
    restaurants: [
      {
        restaurantId: {
          type: Schema.Types.ObjectId,
          ref: "Restaurant",
        },
        role: {
          type: String,
          enum: Object.values(USER_ROLES),
          default: USER_ROLES.WAITER,
        },
        notificationsEnabled: { type: Boolean, default: true },
      },
    ],
  },
  { timestamps: true }
);

const AutoIncrement = AutoIncrementFactory(mongoose);
UserSchema.plugin(AutoIncrement, { inc_field: "userId" });

export const User = model<IUser>("User", UserSchema);
export default User;
