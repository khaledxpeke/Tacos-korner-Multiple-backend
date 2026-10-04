import crypto from "crypto";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import { env } from "../config/environment";
import { USER_ROLES } from "../enum/constants";
import { Settings } from "../models/settings.model";
import { User } from "../models/user.model";
import {
  LoyaltyAccount,
  LoyaltyLedger,
  LoyaltySession,
  type LoyaltyAccountDocument,
} from "../models/loyalty.model";
import { composePhone } from "../utils/phoneCountries";

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const SESSION_TTL_MS = 2 * 60 * 1000;
const CUSTOMER_TOKEN_SECONDS = 30 * 24 * 60 * 60;

const isStrongPassword = (password: string) =>
  password.length >= 8 &&
  /\p{Lu}/u.test(password) &&
  /\d/.test(password) &&
  /[^\p{L}\p{N}]/u.test(password);

const normalizeEmail = (input: string): string | null => {
  const email = String(input || "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  return email;
};

const randomCode = (): string => {
  const bytes = crypto.randomBytes(8);
  return Array.from(bytes, (byte) => CODE_ALPHABET[byte % CODE_ALPHABET.length]).join("");
};

const signCustomerToken = (user: {
  _id: mongoose.Types.ObjectId;
  email: string;
  fullName: string;
}) =>
  jwt.sign(
    {
      user: {
        _id: user._id,
        email: user.email,
        fullName: user.fullName,
        role: USER_ROLES.CLIENT,
        restaurants: [],
        isBlocked: false,
      },
    },
    env.jwtSecret,
    { expiresIn: CUSTOMER_TOKEN_SECONDS }
  );

export const publicAccount = (
  account: LoyaltyAccountDocument,
  fullName: string,
  email: string
) => ({
  userId: String(account.userId),
  fullName,
  email,
  phone: account.phone,
  code: account.code,
  balance: account.balance,
});

export const signupLoyalty = async (input: {
  fullName: string;
  email: string;
  phone: string;
  country: string;
  password: string;
}) => {
  const fullName = input.fullName.trim();
  const email = normalizeEmail(input.email);
  const phone = composePhone(input.country, input.phone);
  if (fullName.length < 2) return { ok: false as const, status: 400, messageKey: "loyalty.name_required" };
  if (!email) return { ok: false as const, status: 400, messageKey: "loyalty.email_invalid" };
  if (!phone) return { ok: false as const, status: 400, messageKey: "loyalty.phone_invalid" };
  if (!isStrongPassword(input.password)) {
    return { ok: false as const, status: 400, messageKey: "loyalty.password_short" };
  }

  const existingPhone = await LoyaltyAccount.findOne({ phone });
  if (existingPhone) return { ok: false as const, status: 409, messageKey: "loyalty.phone_taken" };
  const existingEmail = await User.findOne({ email });
  if (existingEmail) return { ok: false as const, status: 409, messageKey: "loyalty.email_taken" };

  const hash = await bcrypt.hash(input.password, 10);
  let user;
  try {
    user = await User.create({
      email,
      role: USER_ROLES.CLIENT,
      password: hash,
      fullName,
      isBlocked: false,
      restaurants: [],
    });
  } catch (error: unknown) {
    if ((error as { code?: number }).code === 11000) {
      return { ok: false as const, status: 409, messageKey: "loyalty.email_taken" };
    }
    throw error;
  }

  let account: LoyaltyAccountDocument | null = null;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      account = await LoyaltyAccount.create({
        userId: user._id,
        phone,
        code: randomCode(),
        balance: 0,
      });
      break;
    } catch (error: unknown) {
      const duplicate = (error as { code?: number }).code === 11000;
      if (!duplicate || attempt === 4) {
        await User.deleteOne({ _id: user._id });
        if (duplicate) return { ok: false as const, status: 409, messageKey: "loyalty.phone_taken" };
        throw error;
      }
    }
  }

  if (!account) {
    await User.deleteOne({ _id: user._id });
    return { ok: false as const, status: 500, messageKey: "loyalty.signup_failed" };
  }

  return {
    ok: true as const,
    token: signCustomerToken(user),
    account: publicAccount(account, fullName, email),
  };
};

export const loginLoyalty = async (input: {
  email?: string;
  phone?: string;
  country?: string;
  password: string;
}) => {
  if (!input.password) {
    return { ok: false as const, status: 400, messageKey: "loyalty.invalid_credentials" };
  }

  let user;
  let account: LoyaltyAccountDocument | null;
  if (input.phone) {
    const phone = composePhone(input.country || "", input.phone);
    if (!phone) return { ok: false as const, status: 400, messageKey: "loyalty.phone_invalid" };
    account = await LoyaltyAccount.findOne({ phone });
    if (!account) return { ok: false as const, status: 401, messageKey: "loyalty.invalid_credentials" };
    user = await User.findById(account.userId);
  } else {
    const email = normalizeEmail(input.email || "");
    if (!email) return { ok: false as const, status: 400, messageKey: "loyalty.invalid_credentials" };
    user = await User.findOne({ email });
    account = user ? await LoyaltyAccount.findOne({ userId: user._id }) : null;
  }
  if (!user || user.role !== USER_ROLES.CLIENT || !account) {
    return { ok: false as const, status: 401, messageKey: "loyalty.invalid_credentials" };
  }
  if (user.isBlocked) return { ok: false as const, status: 403, messageKey: "loyalty.account_blocked" };
  const matches = await bcrypt.compare(input.password, user.password);
  if (!matches) return { ok: false as const, status: 401, messageKey: "loyalty.invalid_credentials" };
  return {
    ok: true as const,
    token: signCustomerToken(user),
    account: publicAccount(account, user.fullName, user.email),
  };
};

export const getLoyaltyProfile = async (userId: string) => {
  if (!mongoose.Types.ObjectId.isValid(userId)) return null;
  const account = await LoyaltyAccount.findOne({ userId });
  if (!account) return null;
  const user = await User.findById(userId);
  if (!user) return null;
  return publicAccount(account, user.fullName, user.email);
};

export const getLoyaltyLedger = async (userId: string) => {
  if (!mongoose.Types.ObjectId.isValid(userId)) return [];
  const rows = await LoyaltyLedger.find({ userId }).sort("-createdAt").limit(50).lean();
  return rows.map((row) => {
    const entry = row as typeof row & { _id: unknown; createdAt?: Date };
    return {
      id: String(entry._id),
      type: entry.type,
      points: entry.points,
      balanceAfter: entry.balanceAfter,
      historyId: String(entry.historyId),
      restaurantId: String(entry.restaurantId),
      createdAt: entry.createdAt,
    };
  });
};

export const openLoyaltySession = async (restaurantId: string) => {
  const token = crypto.randomBytes(16).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await LoyaltySession.create({ token, restaurantId, userId: null, expiresAt });
  return {
    token,
    url: `${env.loyaltyWebUrl}/link?session=${token}`,
    expiresAt,
  };
};

export const readLoyaltySession = async (token: string, restaurantId: string) => {
  const session = await LoyaltySession.findOne({ token, restaurantId });
  if (!session) return { ok: false as const, status: 404, messageKey: "loyalty.session_not_found" };
  const expired = session.expiresAt.getTime() <= Date.now();
  if (!session.userId) {
    return { ok: true as const, linked: false, expired, expiresAt: session.expiresAt, customer: null };
  }
  const account = await LoyaltyAccount.findOne({ userId: session.userId });
  const user = await User.findById(session.userId);
  if (!account || !user) {
    return { ok: true as const, linked: false, expired, expiresAt: session.expiresAt, customer: null };
  }
  return {
    ok: true as const,
    linked: true,
    expired,
    expiresAt: session.expiresAt,
    customer: publicAccount(account, user.fullName, user.email),
  };
};

export const linkLoyaltySession = async (token: string, userId: string) => {
  const session = await LoyaltySession.findOne({ token });
  if (!session) return { ok: false as const, status: 404, messageKey: "loyalty.session_not_found" };
  if (session.expiresAt.getTime() <= Date.now()) {
    return { ok: false as const, status: 410, messageKey: "loyalty.session_expired" };
  }
  if (session.userId && String(session.userId) !== userId) {
    return { ok: false as const, status: 409, messageKey: "loyalty.session_taken" };
  }
  session.userId = new mongoose.Types.ObjectId(userId);
  await session.save();
  const profile = await getLoyaltyProfile(userId);
  return { ok: true as const, customer: profile };
};

export const lookupLoyaltyCode = async (codeInput: string) => {
  const code = String(codeInput || "")
    .trim()
    .toUpperCase();
  if (!/^[A-Z0-9]{8}$/.test(code)) {
    return { ok: false as const, status: 400, messageKey: "loyalty.code_invalid" };
  }
  const account = await LoyaltyAccount.findOne({ code });
  if (!account) return { ok: false as const, status: 404, messageKey: "loyalty.code_not_found" };
  const user = await User.findById(account.userId);
  if (!user || user.isBlocked) {
    return { ok: false as const, status: 404, messageKey: "loyalty.code_not_found" };
  }
  return { ok: true as const, customer: publicAccount(account, user.fullName, user.email) };
};

export const loyaltyRates = (settings?: {
  loyaltyEarnPoints?: number | null;
  loyaltyRedeemPoints?: number | null;
  loyaltyMaxPercent?: number | null;
} | null) => {
  const earn = Number(settings?.loyaltyEarnPoints);
  const redeem = Number(settings?.loyaltyRedeemPoints);
  const maxPercent = Number(settings?.loyaltyMaxPercent);
  return {
    earnPoints: Number.isInteger(earn) && earn >= 1 ? earn : 1,
    redeemPoints: Number.isInteger(redeem) && redeem >= 1 ? redeem : 100,
    maxPercent: Number.isInteger(maxPercent) && maxPercent >= 1 && maxPercent <= 100 ? maxPercent : 50,
  };
};

export const getLoyaltyRules = async (restaurantId: string) => {
  const settings = await Settings.findOne({ restaurantId }).select(
    "loyaltyEarnPoints loyaltyRedeemPoints loyaltyMaxPercent"
  );
  return loyaltyRates(settings);
};

/** Points spent automatically. Below [redeemPoints] nothing is spent.
 * Otherwise every point is spent, up to [maxPercent] of [amountDue]. */
export const cashbackPoints = (
  balance: number,
  amountDue: number,
  redeemPoints: number,
  maxPercent: number
) => {
  if (!Number.isInteger(balance) || balance < redeemPoints) return 0;
  const dueCents = Math.round(amountDue * 100);
  if (dueCents <= 0) return 0;
  const percent = maxPercent >= 1 && maxPercent <= 100 ? maxPercent : 50;
  const cap = Math.floor((dueCents * percent * redeemPoints) / 10000);
  const byDue = Math.floor((dueCents * redeemPoints) / 100);
  const maxPoints = Math.min(cap, byDue);
  if (maxPoints < 1) return 0;
  return Math.min(balance, maxPoints);
};

export type LoyaltyPreview =
  | {
      ok: true;
      userId: string;
      pointsRedeemed: number;
      pointsEarned: number;
      loyaltyDiscount: number;
      paidTotal: number;
    }
  | { ok: false; status: number; messageKey: string };

export const previewLoyalty = async (input: {
  loyaltyUserId: string;
  amountDue: number;
  earnPoints: number;
  redeemPoints: number;
  maxPercent: number;
}): Promise<LoyaltyPreview> => {
  if (!mongoose.Types.ObjectId.isValid(input.loyaltyUserId)) {
    return { ok: false, status: 400, messageKey: "loyalty.account_not_found" };
  }
  if (!Number.isFinite(input.amountDue) || input.amountDue < 0) {
    return { ok: false, status: 400, messageKey: "loyalty.points_invalid" };
  }
  const account = await LoyaltyAccount.findOne({ userId: input.loyaltyUserId });
  if (!account) return { ok: false, status: 400, messageKey: "loyalty.account_not_found" };
  const pointsRedeemed = cashbackPoints(
    account.balance,
    input.amountDue,
    input.redeemPoints,
    input.maxPercent
  );
  const dueCents = Math.round(input.amountDue * 100);
  const discountCents = Math.round((pointsRedeemed * 100) / input.redeemPoints);
  const paidCents = Math.max(0, dueCents - discountCents);
  return {
    ok: true,
    userId: String(account.userId),
    pointsRedeemed,
    pointsEarned: Math.floor(paidCents / 100) * input.earnPoints,
    loyaltyDiscount: discountCents / 100,
    paidTotal: paidCents / 100,
  };
};

export const commitLoyalty = async (input: {
  userId: string;
  pointsRedeemed: number;
  pointsEarned: number;
  historyId: mongoose.Types.ObjectId;
  restaurantId: string;
}): Promise<boolean> => {
  const account = await LoyaltyAccount.findOneAndUpdate(
    { userId: input.userId, balance: { $gte: input.pointsRedeemed } },
    { $inc: { balance: input.pointsEarned - input.pointsRedeemed } },
    { new: true }
  );
  if (!account) return false;

  const balanceAfterEarn = account.balance;
  const balanceAfterRedeem = account.balance - input.pointsEarned;
  const rows = [];
  if (input.pointsRedeemed > 0) {
    rows.push({
      userId: account.userId,
      restaurantId: input.restaurantId,
      historyId: input.historyId,
      type: "redeem" as const,
      points: -input.pointsRedeemed,
      balanceAfter: balanceAfterRedeem,
    });
  }
  if (input.pointsEarned > 0) {
    rows.push({
      userId: account.userId,
      restaurantId: input.restaurantId,
      historyId: input.historyId,
      type: "earn" as const,
      points: input.pointsEarned,
      balanceAfter: balanceAfterEarn,
    });
  }
  if (rows.length > 0) await LoyaltyLedger.insertMany(rows);
  return true;
};
