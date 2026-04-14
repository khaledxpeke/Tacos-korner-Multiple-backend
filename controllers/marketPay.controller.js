const MARKETPAY_CLIENT_ID = process.env.MARKETPAY_CLIENT_ID;
const MARKETPAY_MERCHANT_ID = process.env.MARKETPAY_MERCHANT_ID;
const { USER_ROLES } = require("../enum/constants");
const User = require("../models/user");

async function findUserByMarketPayToken(token) {
  const userDoc = await User.findOne({ marketPayToken: token });

  if (!userDoc) {
    throw new Error("Market Pay Token does not match any active user.");
  }

  return userDoc;
}

exports.handleSSOPermission = async (req, res) => {
  const userToken = req.header("X-Auth-Token");
  const { operation, operationMetadata } = req.body;

  if (!userToken || !operationMetadata || !operationMetadata.ClientID) {
    return res
      .status(400)
      .json({ success: false, message: "Missing required SSO data." });
  }

  const clientIdFromRequest = operationMetadata.ClientID;

  if (process.env.MARKETPAY_DEBUG === "true") {
    console.log("SSO Request - Operation:", operation);
    console.log("SSO Request - Operation Metadata:", operationMetadata);
  }

  if (
    !clientIdFromRequest ||
    clientIdFromRequest.trim().toLowerCase() !==
      String(MARKETPAY_CLIENT_ID || "").trim().toLowerCase()
  ) {
    console.error("SSO Request - Invalid ClientID:", clientIdFromRequest);
    return res
      .status(401)
      .json({ success: false, message: "Unauthorized: Invalid Client ID." });
  }

  let user;
  let userRoleFromAuth;
  try {
    user = await findUserByMarketPayToken(userToken);

    userRoleFromAuth = user.role;

    if (operation === "refund" && userRoleFromAuth !== USER_ROLES.ADMIN) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized for Refund operation.",
      });
    }
  } catch (error) {
    console.error("Market Pay SSO Auth Failed:", error.message);
    return res.status(401).json({
      success: false,
      message: "Unauthorized: Invalid or expired User Token.",
    });
  }

  if (user.userId == null) {
    console.error(
      "Market Pay SSO: user missing numeric userId",
      user._id?.toString()
    );
    return res.status(503).json({
      success: false,
      message:
        "User numeric id not configured. Run scripts/migrations/migrate_userId.js on the database.",
    });
  }

  const merchantIdNum = parseInt(String(MARKETPAY_MERCHANT_ID), 10);
  if (Number.isNaN(merchantIdNum)) {
    console.error("MARKETPAY_MERCHANT_ID is not a valid integer");
    return res.status(500).json({
      success: false,
      message: "Server configuration error.",
    });
  }

  const successResponse = {
    merchantId: merchantIdNum,
    userId: user.userId,
  };

  return res.status(200).json(successResponse);
};
