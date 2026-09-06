import type { Request, Response } from "express";
import { env } from "../config/environment";
import { USER_ROLES } from "../enum/constants";
import { User } from "../models/user.model";
import { errorMessage } from "../utils/helpers";

async function findUserByMarketPayToken(token: string) {
  const userDoc = await User.findOne({ marketPayToken: token });

  if (!userDoc) {
    throw new Error("Market Pay Token does not match any active user.");
  }

  return userDoc;
}

export const handleSSOPermission = async (req: Request, res: Response) => {
  const userToken = req.header("X-Auth-Token");
  const { operation, operationMetadata } = req.body as {
    operation?: string;
    operationMetadata?: { ClientID?: string };
  };

  if (!userToken || !operationMetadata || !operationMetadata.ClientID) {
    return res.status(400).json({ success: false, message: "Missing required SSO data." });
  }

  const clientIdFromRequest = operationMetadata.ClientID;

  if (env.marketPayDebug) {
    console.log("SSO Request - Operation:", operation);
    console.log("SSO Request - Operation Metadata:", operationMetadata);
  }

  if (
    !clientIdFromRequest ||
    clientIdFromRequest.trim().toLowerCase() !==
      String(env.marketPayClientId || "").trim().toLowerCase()
  ) {
    console.error("SSO Request - Invalid ClientID:", clientIdFromRequest);
    return res.status(401).json({ success: false, message: "Unauthorized: Invalid Client ID." });
  }

  let user;
  try {
    user = await findUserByMarketPayToken(userToken);

    if (operation === "refund" && user.role !== USER_ROLES.ADMIN) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized for Refund operation.",
      });
    }
  } catch (error) {
    console.error("Market Pay SSO Auth Failed:", errorMessage(error));
    return res.status(401).json({
      success: false,
      message: "Unauthorized: Invalid or expired User Token.",
    });
  }

  if (user.userId == null) {
    console.error("Market Pay SSO: user missing numeric userId", user._id?.toString());
    return res.status(503).json({
      success: false,
      message:
        "User numeric id not configured. Run scripts/migrations/migrate_userId.js on the database.",
    });
  }

  const merchantIdNum = parseInt(String(env.marketPayMerchantId), 10);
  if (Number.isNaN(merchantIdNum)) {
    console.error("MARKETPAY_MERCHANT_ID is not a valid integer");
    return res.status(500).json({
      success: false,
      message: "Server configuration error.",
    });
  }

  return res.status(200).json({
    merchantId: merchantIdNum,
    userId: user.userId,
  });
};
