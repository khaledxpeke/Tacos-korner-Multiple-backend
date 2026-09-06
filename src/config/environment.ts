import dotenv from "dotenv";

dotenv.config();

function required(name: keyof NodeJS.ProcessEnv): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function optional(name: keyof NodeJS.ProcessEnv, fallback = ""): string {
  return process.env[name] || fallback;
}

export const env = {
  port: required("PORT"),
  databaseUrl: required("DATABASE_URL"),
  jwtSecret: required("JWT_SECRET"),
  encryptionKey: optional("ENCRYPTION_KEY"),
  emailHost: optional("EMAIL_HOST"),
  emailPort: optional("EMAIL_PORT", "587"),
  emailUser: optional("EMAIL_USER"),
  emailPassword: optional("EMAIL_PASSWORD"),
  emailSender: optional("EMAIL_SENDER"),
  emailName: optional("EMAIL_NAME", "Restaurant"),
  restaurantTimezone: optional("RESTAURANT_TIMEZONE", "Europe/Paris"),
  mediaServerUrl: optional("MEDIA_SERVER_URL", "http://localhost:4000"),
  carouselUrl: optional("CAROUSEL_URL"),
  printerServerUrl: optional("PRINTER_SERVER_URL", "http://localhost:3301"),
  baseUrl: optional("BASE_URL"),
  marketPayClientId: optional("MARKETPAY_CLIENT_ID"),
  marketPayMerchantId: optional("MARKETPAY_MERCHANT_ID"),
  marketPayDebug: process.env.MARKETPAY_DEBUG === "true",
};

export type Env = typeof env;
