import type { UserRole } from "../enum/constants";

export interface AuthenticatedRestaurant {
  restaurantId: string;
  name?: string;
  logo?: string;
  currency?: string;
  role?: UserRole;
  notificationsEnabled?: boolean;
}

export interface AuthenticatedUser {
  _id: string;
  email: string;
  fullName?: string;
  role: UserRole;
  fcmToken?: string;
  restaurants?: AuthenticatedRestaurant[];
  isBlocked?: boolean;
  updatedAt?: Date | string;
}

export interface JwtPayload {
  user: AuthenticatedUser;
}

export interface RegisterJwtPayload {
  id: string;
  email: string;
}
