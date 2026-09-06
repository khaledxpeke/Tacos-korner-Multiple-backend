export const USER_ROLES = {
  ADMIN: "admin",
  MANAGER: "manager",
  WAITER: "waiter",
  CLIENT: "client",
} as const;

export type UserRole = (typeof USER_ROLES)[keyof typeof USER_ROLES];

export const APP_TYPES = {
  MOBILE: "mobile",
  BORNE: "borne",
  DASHBOARD: "dashboard",
  CASHIER: "cashier",
  DELIVERY: "delivery",
  KITCHEN: "kitchen",
} as const;

export type AppType = (typeof APP_TYPES)[keyof typeof APP_TYPES];
