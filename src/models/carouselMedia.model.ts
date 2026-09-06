import { Schema, model, type HydratedDocument, type Types } from "mongoose";

export interface ICarouselMedia {
  mediaType: "image" | "video";
  fileUrl: Types.ObjectId | null;
  duration?: number;
  order?: number;
  isActive: boolean;
  restaurantId: Types.ObjectId;
}

export type CarouselMediaDocument = HydratedDocument<ICarouselMedia>;

const carouselMediaSchema = new Schema<ICarouselMedia>(
  {
    mediaType: {
      type: String,
      enum: ["image", "video"],
      required: true,
    },
    fileUrl: {
      type: Schema.Types.ObjectId,
      ref: "Media",
      default: null,
    },
    duration: {
      type: Number,
      default: 5,
      required: function (this: ICarouselMedia) {
        return this.mediaType === "image";
      },
    },
    order: {
      type: Number,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    restaurantId: {
      type: Schema.Types.ObjectId,
      ref: "Restaurant",
      required: true,
    },
  },
  { timestamps: true }
);

export const CarouselMedia = model<ICarouselMedia>("CarouselMedia", carouselMediaSchema);
export default CarouselMedia;
