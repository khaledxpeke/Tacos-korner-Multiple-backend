import { Schema, model, type HydratedDocument, type Types } from "mongoose";

export interface IVariation {
  name: string;
  restaurantId: Types.ObjectId;
}

export type VariationDocument = HydratedDocument<IVariation>;

const variationSchema = new Schema<IVariation>(
  {
    name: {
      type: String,
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

export const Variation = model<IVariation>("Variation", variationSchema);
export default Variation;
