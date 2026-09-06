import { Schema, model, type HydratedDocument, type Types } from "mongoose";

export interface ICategory {
  name: string;
  image: Types.ObjectId | null;
  position: number;
  createdBy: Types.ObjectId;
  restaurantId: Types.ObjectId;
}

export type CategoryDocument = HydratedDocument<ICategory>;

const categorySchema = new Schema<ICategory>(
  {
    name: {
      type: String,
      required: true,
    },
    image: {
      type: Schema.Types.ObjectId,
      ref: "Media",
      default: null,
    },
    position: {
      type: Number,
      default: 0,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    restaurantId: {
      type: Schema.Types.ObjectId,
      ref: "Restaurant",
      required: true,
    },
  },
  { timestamps: true }
);

categorySchema.virtual("products", {
  ref: "Product",
  localField: "_id",
  foreignField: "categories",
});

categorySchema.set("toObject", { virtuals: true });
categorySchema.set("toJSON", { virtuals: true });

export const Category = model<ICategory>("Category", categorySchema);
export default Category;
