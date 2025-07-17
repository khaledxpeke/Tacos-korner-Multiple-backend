const nodemailer = require("nodemailer");
const hbs = require("nodemailer-express-handlebars");
const path = require("path");
const Settings = require("../models/settings");
const { decrypt } = require("./crypto");

const createTransporter = async (restaurantId) => {
  let settings;
  if (restaurantId) {
    // Fetch the specific settings for the restaurant
    settings = await Settings.findOne({ restaurantId });
  }

  // Fallback to environment variables if no specific settings are found
  const host = settings?.host || process.env.EMAIL_HOST;
  const port = settings?.port || process.env.EMAIL_PORT;
  const user = settings?.emailUser || process.env.EMAIL_USER;
  const encryptedPass = settings?.emailPass || process.env.EMAIL_PASSWORD;

  if (!host || !port || !user || !encryptedPass) {
    console.error(`Email settings are not fully configured for restaurant ${restaurantId}.`);
    // Return a dummy transporter that will fail, preventing crashes
    return {
      sendMail: () => Promise.reject(new Error("Email service is not configured for this restaurant.")),
    };
  }

  // Decrypt the password only when needed
  const pass = decrypt(encryptedPass);

  let transporter = nodemailer.createTransport({
    host,
    port,
    secure: port == 465, // true for 465, false for other ports
    auth: {
      user,
      pass,
    },
  });

  transporter.use(
    "compile",
    hbs({
      viewEngine: {
        extname: ".handlebars",
        layoutsDir: path.join(__dirname, "../template"),
        defaultLayout: "index",
      },
      viewPath: path.join(__dirname, "../"),
    })
  );

  return transporter;
};

// We will no longer export a single transporter, but the function to create one.
// The calling function (e.g., in historyController) will be responsible for creating it.
module.exports = createTransporter;
