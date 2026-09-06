export type { IProduct, ProductDocument } from "../models/product.model";

export interface DiscountableProduct {
  price: number;
  originalPrice?: number | null;
  discountValue?: number;
  discountStartDate?: Date | string | null;
  discountEndDate?: Date | string | null;
  formulePrice?: number;
}

export interface DiscountInfo {
  price: number;
  originalPrice: number | null;
  hasDiscount: boolean;
  discountValue: number | null;
  discountAmount: number;
  discountActive: boolean;
  isUsingFormulePrice: boolean;
}

export interface MediaRef {
  url?: string;
}
