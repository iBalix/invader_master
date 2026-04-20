/**
 * Types alignes sur le schema Supabase (migration 018) et l'API publique
 * /public/tables/* du backend.
 */

export interface ScreensaverFeatured {
  id: string;
  position: number;
  title: string;
  subtitle: string | null;
  image_url: string;
  lottie_url: string | null;
  active: boolean;
}

export interface HomeFeatured {
  id: string;
  position: number;
  title: string;
  subtitle: string | null;
  image_url: string | null;
  cta_label: string | null;
  cta_target: string | null;
  active: boolean;
}

export interface LiveEventState {
  id?: number;
  is_live: boolean;
  event_type?: string | null;
  event_label?: string | null;
  redirect_url?: string | null;
  started_at?: string | null;
  ended_at?: string | null;
}

export interface UpcomingEvent {
  id: string | number;
  title?: string;
  name?: string;
  subtitle?: string | null;
  description?: string | null;
  date: string;
  active?: boolean;
  cta_redirect_url?: string | null;
  image_url?: string | null;
}

export interface TableDevice {
  id: string;
  hostname: string;
  table_number: string;
  role: 'master' | 'slave';
  display_name?: string | null;
  last_seen_at?: string | null;
}

export interface TableStateResponse {
  status: 'success';
  device: TableDevice | null;
  liveEvent: LiveEventState;
  screensaverFeatured: ScreensaverFeatured[];
  homeFeatured: HomeFeatured[];
  nextEvent: UpcomingEvent | null;
}

export interface TableHomeResponse {
  status: 'success';
  featured: HomeFeatured[];
  liveEvent: LiveEventState;
  nextEvent: UpcomingEvent | null;
}

export interface PricedItem {
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  appliedPrice: number;
  happyHourApplied: boolean;
  subtotal: number;
}

export interface PricedCart {
  status: 'success';
  items: PricedItem[];
  subtotal: number;
  happyHourDiscount: number;
  couponDiscount: number;
  total: number;
  coupon:
    | {
        id: string;
        code: string;
        discount_type: 'percentage' | 'amount';
        discount_value: number;
      }
    | null;
  couponError: string | null;
  happyHourActive: boolean;
}

export interface CreatedOrder {
  id: string;
  orderNumber?: string | number;
  status: 'received' | 'preparing' | 'served' | 'paid' | 'cancelled' | string;
  paymentMethod: 'card' | 'cash';
  subtotal: number;
  happyHourDiscount: number;
  couponDiscount: number;
  total: number;
  createdAt: string;
}
