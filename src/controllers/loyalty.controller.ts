import type { Request, Response } from "express";
import {
  getLoyaltyLedger,
  getLoyaltyProfile,
  getLoyaltyRules,
  linkLoyaltySession,
  loginLoyalty,
  lookupLoyaltyCode,
  openLoyaltySession,
  readLoyaltySession,
  signupLoyalty,
} from "../services/loyalty.service";

const fail = (
  res: Response,
  req: Request,
  result: { status: number; messageKey: string }
) => res.status(result.status).json({ message: req.t(result.messageKey) });

export const signup = async (req: Request, res: Response) => {
  try {
    const { fullName, email, phone, country, password } = req.body as {
      fullName?: string;
      email?: string;
      phone?: string;
      country?: string;
      password?: string;
    };
    const result = await signupLoyalty({
      fullName: fullName || "",
      email: email || "",
      phone: phone || "",
      country: country || "",
      password: password || "",
    });
    if (!result.ok) return fail(res, req, result);
    res.status(201).json({ token: result.token, account: result.account });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: req.t("loyalty.signup_failed") });
  }
};

export const login = async (req: Request, res: Response) => {
  try {
    const { email, phone, country, password } = req.body as {
      email?: string;
      phone?: string;
      country?: string;
      password?: string;
    };
    const result = await loginLoyalty({
      email,
      phone,
      country,
      password: password || "",
    });
    if (!result.ok) return fail(res, req, result);
    res.status(200).json({ token: result.token, account: result.account });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: req.t("loyalty.signup_failed") });
  }
};

export const me = async (req: Request, res: Response) => {
  const profile = await getLoyaltyProfile(String(req.user?.user?._id || ""));
  if (!profile) return res.status(404).json({ message: req.t("loyalty.account_not_found") });
  res.status(200).json({ account: profile });
};

export const ledger = async (req: Request, res: Response) => {
  const page = Number(Array.isArray(req.query.page) ? req.query.page[0] : req.query.page);
  const limit = Number(Array.isArray(req.query.limit) ? req.query.limit[0] : req.query.limit);
  const result = await getLoyaltyLedger(
    String(req.user?.user?._id || ""),
    page,
    limit
  );
  res.status(200).json(result);
};

export const createSession = async (req: Request, res: Response) => {
  if (!req.restaurantId) {
    return res.status(400).json({ message: req.t("loyalty.restaurant_required") });
  }
  const session = await openLoyaltySession(String(req.restaurantId));
  const rules = await getLoyaltyRules(String(req.restaurantId));
  res.status(201).json({ ...session, rules });
};

export const getSession = async (req: Request, res: Response) => {
  if (!req.restaurantId) {
    return res.status(400).json({ message: req.t("loyalty.restaurant_required") });
  }
  const token = String(req.params.token || "");
  const result = await readLoyaltySession(token, String(req.restaurantId));
  if (!result.ok) return fail(res, req, result);
  const rules = await getLoyaltyRules(String(req.restaurantId));
  res.status(200).json({
    linked: result.linked,
    expired: result.expired,
    expiresAt: result.expiresAt,
    customer: result.customer,
    rules,
  });
};

export const linkSession = async (req: Request, res: Response) => {
  const userId = String(req.user?.user?._id || "");
  const token = String(req.params.token || "");
  const result = await linkLoyaltySession(token, userId);
  if (!result.ok) return fail(res, req, result);
  res.status(200).json({ linked: true, customer: result.customer });
};

export const lookupCode = async (req: Request, res: Response) => {
  const { code } = req.body as { code?: string };
  const result = await lookupLoyaltyCode(code || "");
  if (!result.ok) return fail(res, req, result);
  const rules = req.restaurantId ? await getLoyaltyRules(String(req.restaurantId)) : undefined;
  res.status(200).json({ customer: result.customer, rules });
};
