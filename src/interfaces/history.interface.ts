import type mongoose from "mongoose";

export interface FailedPrintJob {
  orderId: mongoose.Types.ObjectId | string;
  commandNumber?: number;
  restaurantId: mongoose.Types.ObjectId | string;
  attempts: number;
  nextRetry: Date;
  error: string;
  createdAt: Date;
}

export interface PrintAddon {
  name?: string;
  price?: number | string;
  count?: number;
}

export interface PrintExtra {
  name?: string;
  price?: number | string;
  count?: number;
}

export interface PrintProduct {
  plat: {
    _id?: string;
    name: string;
    count?: number;
    price?: number;
    category?: unknown;
  };
  variation?: {
    name?: string;
    price?: number | string;
  } | null;
  addons?: PrintAddon[];
  extras?: PrintExtra[];
  tva?: number;
  total?: number;
}

export interface PrintOrder {
  _id?: mongoose.Types.ObjectId | string;
  restaurantId?: mongoose.Types.ObjectId | string;
  tva?: number;
  total: number;
  currency?: string;
  product: PrintProduct[];
  commandNumber?: number;
  pack: { label: string };
  name: string;
  boughtAt: Date | string;
  method: { label: string };
  discountValue?: number;
  couponId?: { couponType?: string } | null;
}

export interface PrintRestaurant {
  name: string;
  address: string;
}

export interface PrintSettings {
  tva?: number;
  qrCode?: string;
  printMode?: boolean;
}

export interface PrintJobData {
  restaurantId: unknown;
  orderId: unknown;
  commandNumber?: number;
  customerName: string;
  source: string;
  createdAt: Date | string;
  items: PrintProduct[];
  total: number;
  pack: unknown;
  method: unknown;
  printXml: string;
}

export interface AddonGroup {
  name: string;
  price: number;
  count: number;
}

export interface ExtraGroup {
  name: string;
  price: number;
  count: number;
}

export interface HistoryProductInput {
  tva?: number;
  plat: {
    _id: string;
    name: string;
    count?: number;
    price?: number;
    category?: unknown;
  };
  variation?: {
    name?: string;
    price?: number | string;
  } | null;
  total?: number;
  addons: Array<{ name: string; price?: number; count?: number }>;
  extras: Array<{ name: string; price?: number; count?: number }>;
}

export interface AddHistoryBody {
  products: HistoryProductInput[];
  pack: string;
  name: string;
  method: string;
  total: number;
  currency?: string;
  commandNumber: string | number;
  discountValue?: number;
  couponId?: string | null;
}

export interface HistoryListQuery {
  page?: string | number;
  limit?: string | number;
  search?: string;
  filter?: string;
  status?: string;
  packId?: string;
  methodId?: string;
  startDate?: string;
  endDate?: string;
}

export interface HistoryListFilter {
  restaurantId?: string | null;
  $or?: Array<Record<string, unknown>>;
  status?: string;
  "pack._id"?: string;
  "method._id"?: string;
  boughtAt?: { $gte?: Date; $lte?: Date };
}

export interface FetchHistoriesData {
  page?: number;
  search?: string;
  startDate?: string;
  endDate?: string;
  filter?: string;
  status?: string;
  restaurantId?: string;
}

export interface StatisticsQuery {
  filter?: string;
  startDate?: string;
  endDate?: string;
}

export interface PopulatedLogo {
  url?: string;
}

export interface RestaurantWithLogo {
  name: string;
  address: string;
  logo?: PopulatedLogo | null;
}

export interface PdfOrderData {
  restaurantId?: mongoose.Types.ObjectId | string;
  name: string;
  commandNumber?: number;
  boughtAt: Date | string;
  product: PrintProduct[];
  total: number;
  currency?: string;
  pack: { label: string };
  method: { label: string };
}

export interface HistoriesRtResult {
  histories: Array<Record<string, unknown> & { boughtAt?: Date | string }>;
}

export interface StatusCountsResult {
  total?: number;
  enCours?: number;
  terminee?: number;
  annulee?: number;
  echouee?: number;
  enAttente?: number;
  enRetard?: number;
  remboursee?: number;
}

export interface CurrentPeriodStats {
  totalRevenue?: number;
  completedOrders?: number;
  moyenRevenue?: number;
  paymentMethodsTotalRevenue?: {
    espece?: number;
    cb?: number;
    especeCount?: number;
    cbCount?: number;
  };
  deliveryTypes?: {
    surPlaceCount?: number;
    emporterCount?: number;
    surPlace?: number;
    emporter?: number;
  };
}

export interface StatusCountsAgg {
  totalOrders?: number;
  orderStatuses?: Record<string, number>;
}

export interface TotalPlatStats {
  totalPlat?: number;
}

export interface PreviousPeriodStats {
  totalRevenue?: number;
}

export interface PrintStatsAgg {
  totalOrders: number;
  printedSuccessfully: number;
  printFailed: number;
  printRetryExhausted: number;
  printPending: number;
}

export type TranslateFn = (key: string, options?: Record<string, unknown>) => string;
