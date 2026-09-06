export interface JoinRestaurantPayload {
  restaurantId: string;
}

export interface FetchHistoriesPayload {
  restaurantId: string;
  page?: number;
  search?: string;
  startDate?: string;
  endDate?: string;
  filter?: string;
  status?: string;
}

export interface StatusUpdatePayload {
  id: unknown;
  status: string;
  updatedAt?: Date | string;
  updatedBy?: string;
}

export interface PrintEventPayload {
  orderId: unknown;
  commandNumber?: number;
  message: string;
  error?: string;
}

export interface ServerToClientEvents {
  "new-history": (history: unknown) => void;
  "histories-update": (payload: unknown) => void;
  "status-update": (payload: StatusUpdatePayload) => void;
  "settings-updated": (settings: unknown) => void;
  print_success: (payload: PrintEventPayload) => void;
  print_skipped: (payload: PrintEventPayload) => void;
  print_failed: (payload: PrintEventPayload) => void;
  print_retry_exhausted: (payload: PrintEventPayload) => void;
  error: (payload: string | { message: string; error?: string }) => void;
}

export interface ClientToServerEvents {
  "join-restaurant": (data: JoinRestaurantPayload) => void;
  "fetch-histories": (data: FetchHistoriesPayload) => void;
  disconnect: () => void;
}

export interface InterServerEvents {
  ping: () => void;
}

export interface SocketData {
  restaurantId?: string;
}
