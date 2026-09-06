import { Schema, model, type HydratedDocument, type Types } from "mongoose";

export interface IAllergy {
  name: string;
  icon: Types.ObjectId | null;
}

export type AllergyDocument = HydratedDocument<IAllergy>;

const AllergySchema = new Schema<IAllergy>(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    icon: {
      type: Schema.Types.ObjectId,
      ref: "Media",
      default: null,
    },
  },
  { timestamps: true }
);

export const Allergy = model<IAllergy>("Allergy", AllergySchema);
export default Allergy;
