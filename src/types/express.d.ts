import type { JwtPayload } from "../interfaces/auth.interface";

declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
      restaurantId?: string | null;
      uploadTarget?: string;
      t: (key: string, options?: Record<string, unknown>) => string;
      language: string;
    }
  }
}

export {};
