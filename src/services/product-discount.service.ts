import moment from "moment-timezone";
import { env } from "../config/environment";
import type { DiscountableProduct, DiscountInfo } from "../interfaces/product.interface";

const RESTAURANT_TIMEZONE = env.restaurantTimezone;

export const calculateDiscountInfo = (product: DiscountableProduct): DiscountInfo => {
  const now = moment().tz(RESTAURANT_TIMEZONE);
  let hasActiveDiscount = false;
  let currentPrice = product.price;
  let originalPrice = product.originalPrice || product.price;
  let discountAmount = 0;

  if (product.discountValue! > 0) {
    const isAfterStart =
      !product.discountStartDate ||
      now.isAfter(moment(product.discountStartDate).tz(RESTAURANT_TIMEZONE));
    const isBeforeEnd =
      !product.discountEndDate ||
      now.isBefore(moment(product.discountEndDate).tz(RESTAURANT_TIMEZONE));

    if (isAfterStart && isBeforeEnd) {
      hasActiveDiscount = true;
      discountAmount = Math.min(product.discountValue!, originalPrice);
      currentPrice = originalPrice - discountAmount;
    }
  }

  return {
    price: Math.round(currentPrice * 100) / 100,
    originalPrice: hasActiveDiscount ? originalPrice : null,
    hasDiscount: hasActiveDiscount,
    discountValue: hasActiveDiscount ? product.discountValue! : null,
    discountAmount: hasActiveDiscount
      ? Math.round(discountAmount * 100) / 100
      : 0,
    discountActive: hasActiveDiscount,
    isUsingFormulePrice: false,
  };
};

export const getFinalPrice = (
  product: DiscountableProduct,
  useFormulePrice = false
): DiscountInfo => {
  if (useFormulePrice && product.formulePrice! > 0) {
    return {
      price: product.formulePrice!,
      originalPrice: null,
      hasDiscount: false,
      discountValue: null,
      discountAmount: 0,
      discountActive: false,
      isUsingFormulePrice: true,
    };
  }

  return calculateDiscountInfo(product);
};

export const addTimezoneZ = (dateString: string | null | undefined): string | null => {
  if (!dateString) return null;
  // If only YYYY-MM-DD, add time and Z
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
    return dateString + "T00:00:00Z";
  }
  // If ends with Z or has timezone, return as is
  if (
    dateString.includes("T") &&
    (dateString.includes("Z") ||
      dateString.includes("+") ||
      dateString.match(/-\d{2}:\d{2}$/))
  ) {
    return dateString;
  }
  // If only date with Z (e.g., 2025-08-01Z), fix to ISO
  if (/^\d{4}-\d{2}-\d{2}Z$/.test(dateString)) {
    return dateString.replace("Z", "T00:00:00Z");
  }
  return dateString;
};
