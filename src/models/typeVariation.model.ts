import { Schema, model, type HydratedDocument, type Types } from "mongoose";

export interface ITypeVariation {
  name: string;
  label: string;
  description: string;
  variations: Types.ObjectId[];
  restaurantId: Types.ObjectId;
}

export type TypeVariationDocument = HydratedDocument<ITypeVariation>;

const typeVariationSchema = new Schema<ITypeVariation>(
  {
    name: {
      type: String,
      required: true,
    },
    label: {
      type: String,
      required: true,
    },
    description: {
      type: String,
      required: true,
    },
    variations: [
      {
        type: Schema.Types.ObjectId,
        ref: "Variation",
      },
    ],
    restaurantId: {
      type: Schema.Types.ObjectId,
      ref: "Restaurant",
      required: true,
    },
  },
  { timestamps: true }
);

export const TypeVariation = model<ITypeVariation>("TypeVariation", typeVariationSchema);
export default TypeVariation;
