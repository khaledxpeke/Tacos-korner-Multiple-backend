declare namespace NodeJS {
  interface ProcessEnv {
    PORT?: string;
    DATABASE_URL?: string;
    JWT_SECRET?: string;
    ENCRYPTION_KEY?: string;
    EMAIL_HOST?: string;
    EMAIL_PORT?: string;
    EMAIL_USER?: string;
    EMAIL_PASSWORD?: string;
    EMAIL_SENDER?: string;
    EMAIL_NAME?: string;
    RESTAURANT_TIMEZONE?: string;
    MEDIA_SERVER_URL?: string;
    CAROUSEL_URL?: string;
    PRINTER_SERVER_URL?: string;
    BASE_URL?: string;
    MARKETPAY_CLIENT_ID?: string;
    MARKETPAY_MERCHANT_ID?: string;
    MARKETPAY_DEBUG?: string;
    NODE_ENV?: string;
  }
}

export {};
