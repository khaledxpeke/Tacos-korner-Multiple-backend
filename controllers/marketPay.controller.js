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

  if (clientIdFromRequest !== MARKETPAY_CLIENT_ID) {
    console.error("SSO Request - Invalid ClientID:", clientIdFromRequest);
    return res
      .status(401)
      .json({ success: false, message: "Unauthorized: Invalid Client ID." });
  }

  let userIdFromAuth;
  let userRoleFromAuth;
  try {
    const user = await findUserByMarketPayToken(userToken);

    userIdFromAuth = user._id.toString();
    userRoleFromAuth = user.role;

    if (operation === "refund" && userRoleFromAuth !== USER_ROLES.ADMIN) {
      return res
        .status(401)
        .json({
          success: false,
          message: "Unauthorized for Refund operation.",
        });
    }
  } catch (error) {
    console.error("Market Pay SSO Auth Failed:", error.message);
    return res
      .status(401)
      .json({
        success: false,
        message: "Unauthorized: Invalid or expired User Token.",
      });
  }

  const successResponse = {
    merchantId: MARKETPAY_MERCHANT_ID,
    userId: String(userIdFromAuth),
  };

  return res.status(200).json(successResponse);
};
