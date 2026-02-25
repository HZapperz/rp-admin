// Core User Types
export type UserRole = 'ADMIN' | 'GROOMER' | 'CLIENT';

export interface User {
  id: string;
  role: UserRole;
  name: string;
  phone: string;
  address?: string;
  blockedAt?: string;
  email?: string;
  createdAt: string;
  updatedAt: string;
}

// Pet Types
export type PetSize = 'small' | 'medium' | 'large' | 'xl';

export interface Pet {
  id: string;
  user_id: string;
  name: string;
  breed?: string;
  age?: string;
  size_category?: PetSize;
  special_notes?: string;
  photo_url?: string;
  rabies_certificate_url?: string;
  created_at: string;
  updated_at: string;
  // Health & Behavior fields
  date_of_birth?: string;
  has_allergies?: boolean;
  allergy_details?: string;
  has_skin_conditions?: boolean;
  skin_condition_details?: string;
  is_friendly?: boolean;
  blow_dryer_reaction?: 'calm' | 'nervous' | 'fearful' | 'unknown';
  water_reaction?: 'calm' | 'nervous' | 'fearful' | 'unknown';
  has_behavioral_issues?: boolean;
  behavioral_issue_details?: string;
  additional_notes?: string;
  rabies_vaccination_date?: string;
  rabies_expiration_date?: string;
}

// Service Types
export interface GroomerService {
  id: string;
  groomer_id: string;
  name: string;
  description: string;
  price_small: number;
  price_medium: number;
  price_large: number;
  price_xl: number;
  duration_minutes: number;
  image_url?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// Booking Types
export type BookingStatus =
  | 'pending'
  | 'confirmed'
  | 'in_progress'
  | 'completed'
  | 'cancelled';

export interface Booking {
  id: string;
  client_id: string;
  groomer_id: string | null;
  service_id: string | null;
  status: BookingStatus;
  scheduled_date: string;
  scheduled_time_start: string;
  scheduled_time_end: string;
  total_amount: number;
  service_fee: number;
  processing_fee: number;
  rush_service: boolean;
  rush_fee: number;
  address: string;
  city: string;
  state: string;
  zip_code: string;
  notes?: string;
  cancellation_reason?: string;
  cancelled_at?: string;
  completed_at?: string;
  created_at: string;
  updated_at: string;
  payment_intent_id?: string;
  payment_status?: string;
  stripe_charge_id?: string;
  amount_paid?: number;
  currency?: string;
  payment_created_at?: string;
  before_photos?: string[];
  after_photos?: string[];
  // Hard-coded service fields (used when service_id is null)
  service_name?: string;
  service_description?: string;
  service_duration?: number;
  // Pricing breakdown fields
  original_subtotal?: number;
  discount_amount?: number;
  credits_applied?: number;
  authorized_amount?: number;
  subtotal_before_tax?: number;
  tax_amount?: number;
  tax_rate?: number;
  // Time preference fields
  shift_preference?: 'morning' | 'afternoon' | 'evening';
  time_preferences?: Array<{ id: string; label: string; start_time: string; end_time: string }> | null;
  assigned_time_slot?: string;
  // Additional fields from database
  distance_miles?: number;
  tip_amount?: number;
  payment_authorized_at?: string;
  payment_captured_at?: string;
  payment_method_type?: string;
  payment_method_last4?: string;
  groomer_notes?: string;
  actual_start_time?: string;
  actual_end_time?: string;
  payment_link_url?: string;
  payment_link_sent_at?: string;
  stripe_customer_id?: string;
  payment_method_id?: string;
  approval_email_sent?: boolean;
  approval_email_sent_at?: string;
  tip_payment_intent_id?: string;
  tip_charged_at?: string;
}

export interface BookingPet {
  id: string;
  booking_id: string;
  pet_id: string;
  service_size: PetSize;
  package_type: 'basic' | 'premium' | 'deluxe';
  base_price: number;
  package_price: number;
  total_price: number;
  notes?: string;
  created_at: string;
  before_photo_url?: string;
  after_photo_url?: string;
}

export interface BookingAddon {
  id: string;
  booking_pet_id: string;
  addon_name: string;
  addon_price: number;
  created_at: string;
}

// Extended Booking with relationships
export interface BookingWithDetails extends Booking {
  service?: GroomerService;
  groomer?: {
    id: string;
    first_name: string;
    last_name: string;
    avatar_url?: string;
    phone?: string;
    email?: string;
  };
  client?: {
    id: string;
    first_name: string;
    last_name: string;
    avatar_url?: string;
    phone?: string;
    email?: string;
  };
  pets?: Array<
    BookingPet & {
      pet?: Pet;
      addons?: BookingAddon[];
    }
  >;
}

// Complaint Types
export type ComplaintStatus = 'pending' | 'in_progress' | 'resolved' | 'closed';

export interface Complaint {
  id: string;
  booking_id: string;
  client_id: string;
  groomer_id?: string;
  subject: string;
  description: string;
  status: ComplaintStatus;
  priority: 'low' | 'medium' | 'high';
  resolution_notes?: string;
  resolved_at?: string;
  resolved_by?: string;
  created_at: string;
  updated_at: string;
}

// Promotion Types
export type PromotionType = 'first_time' | 'general';

export interface Promotion {
  id: string;
  title: string;
  description?: string;
  discount_percentage: number;
  valid_from: string;
  valid_until: string;
  is_active: boolean;
  max_uses?: number;
  current_uses: number;
  promotion_type: PromotionType;
  created_at: string;
  updated_at: string;
}

export interface CreatePromotionDto {
  title: string;
  description?: string;
  discount_percentage: number;
  valid_from: string;
  valid_until: string;
  is_active?: boolean;
  max_uses?: number;
  promotion_type: PromotionType;
}

export interface UpdatePromotionDto {
  title?: string;
  description?: string;
  discount_percentage?: number;
  valid_from?: string;
  valid_until?: string;
  is_active?: boolean;
  max_uses?: number;
}

// Rating Types
export interface Rating {
  id: string;
  booking_id: string;
  client_id: string;
  groomer_id: string;
  experience_rating: number;
  recommendation_rating: number;
  quality_rating: number;
  comment?: string;
  created_at: string;
}

// KPI Types for Admin Dashboard
export interface KPIData {
  totalBookings: number;
  totalRevenue: number;
  activeGroomers: number;
  averageRating: number;
  completionRate: number;
  revenueGrowth?: number;
  bookingGrowth?: number;
  period: {
    start: string;
    end: string;
  };
}

// Analytics Types
export interface RevenueData {
  date: string;
  revenue: number;
  bookings: number;
}

export interface GroomerPerformance {
  groomer_id: string;
  groomer_name: string;
  total_bookings: number;
  total_revenue: number;
  average_rating: number;
  completion_rate: number;
}

// Time Slot Types
export interface TimeSlot {
  id: string;
  groomer_id: string;
  date: string;
  start_time: string;
  end_time: string;
  is_available: boolean;
  is_blocked: boolean;
  block_reason?: string;
  created_at: string;
  updated_at: string;
}

// Address Types
export type AddressType = 'home' | 'work' | 'other';

export interface Address {
  id: string;
  user_id: string;
  name: string;
  building: string;
  apartment?: string;
  floor?: string;
  street: string;
  additional_info?: string;
  address_type: AddressType;
  is_default: boolean;
  created_at: string;
  updated_at: string;
  // Geocoding fields for territory mapping
  latitude?: number;
  longitude?: number;
  city?: string;
  state?: string;
  zip_code?: string;
}

// Service Area Types
export interface ServiceAreaZipCode {
  id: string;
  zip_code: string;
  city: string;
  state: string;
  is_active: boolean;
  notes?: string;
  created_at: string;
  updated_at: string;
}

// Auth Types
export interface AuthUser {
  id: string;
  role: UserRole;
  name: string;
  email: string;
  phone?: string;
}

// API Response Types
export interface ApiResponse<T> {
  data: T;
  error?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
}

// Filter Types
export interface BookingFilters {
  status?: BookingStatus[];
  dateRange?: {
    start: string;
    end: string;
  };
  groomerId?: string;
  clientId?: string;
}

export interface UserFilters {
  role?: UserRole[];
  blocked?: boolean;
  search?: string;
}

// Payroll Types
export type PayoutStatus = 'unpaid' | 'paid';

export interface GroomerPayout {
  id: string;
  groomer_id: string;
  period_start: string;
  period_end: string;
  total_amount: number;
  total_tax: number;
  total_pre_tax: number;
  total_tips: number;
  commission_rate: number;
  total_commission_earnings: number;
  total_payout: number;
  booking_count: number;
  status: PayoutStatus;
  paid_amount?: number;
  paid_at?: string;
  paid_by?: string;
  payment_method?: string;
  payment_reference?: string;
  notes?: string;
  created_at: string;
  updated_at?: string;
}

export interface GroomDetailPet {
  pet_id: string;
  pet_name: string;
  breed?: string;
  package_type: string;
  total_price: number;
  addons: Array<{ addon_name: string; addon_price: number }>;
}

export interface GroomDetail {
  booking_id: string;
  scheduled_date: string;
  client: { id: string; first_name: string; last_name: string };
  pets: GroomDetailPet[];
  total_amount: number;
  tax_amount: number;
  pre_tax_amount: number;
  tip_amount: number;
  commission_rate: number;
  groomer_cut: number;
  payment_status: string;
}

export interface PayPeriodTotals {
  total_amount: number;
  tax_amount: number;
  pre_tax_total: number;
  tips: number;
  commission_earnings: number;
  total_payout: number;
  booking_count: number;
}

export interface WeekData {
  week_start: string;
  week_end: string;
  week_label: string;
  totals: {
    pre_tax_total: number;
    tips: number;
    total_payout: number;
    booking_count: number;
    commission_earnings: number;  // groomer's cut for the week
    hourly_pay: number;           // placeholder (0 for now)
    misc_adjustments: number;     // placeholder (0 for now)
  };
  grooms: GroomDetail[];
  is_expanded: boolean;
}

export interface PayPeriodData {
  period_start: string;
  period_end: string;
  period_label: string;
  totals: PayPeriodTotals;
  payout?: GroomerPayout;
  weeks: WeekData[];
}

export interface AvailablePayrollMonth {
  year: number;
  month: number;
  label: string;
  booking_count: number;
}

// Rebooking Types
export type RebookingType = 'schedule' | 'callback';
export type RebookingStatus = 'pending' | 'contacted' | 'booked' | 'declined' | 'no_answer';

export interface Rebooking {
  id: string;
  booking_id: string;
  client_id: string;
  groomer_id: string;
  type: RebookingType;
  preferred_date?: string;
  preferred_time_slot?: 'morning' | 'afternoon' | 'evening';
  callback_weeks?: number;
  callback_date?: string;
  groomer_notes?: string;
  status: RebookingStatus;
  admin_notes?: string;
  new_booking_id?: string;
  contacted_at?: string;
  created_at: string;
  updated_at: string;
}

export interface RebookingWithDetails extends Rebooking {
  client?: {
    id: string;
    first_name: string;
    last_name: string;
    phone?: string;
    email?: string;
  };
  groomer?: {
    id: string;
    first_name: string;
    last_name: string;
  };
  booking?: {
    id: string;
    scheduled_date: string;
  };
  pets?: Array<{ name: string }>;
}

// Territory Intelligence Types
export interface TerritoryCustomer {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  zip_code: string;
  latitude: number;
  longitude: number;
  lifetime_value: number;
  total_bookings: number;
  last_booking_date?: string;
  next_booking_date?: string;
  status: 'active' | 'warm_lead' | 'at_risk' | 'vip';
  address: string;
  city: string;
  state: string;
}

export interface ZipCodeMetrics {
  zip_code: string;
  city: string;
  state: string;
  customer_count: number;
  total_revenue: number;
  booking_count: number;
  avg_ltv: number;
  latitude: number;
  longitude: number;
}

export interface TerritoryFilters {
  status?: ('active' | 'warm_lead' | 'at_risk' | 'vip')[];
  service_tiers?: string[];
  date_range?: { start: string; end: string };
  frequency?: string[];
  min_ltv?: number;
  max_ltv?: number;
}

export interface TerritoryMetrics {
  total_customers: number;
  total_revenue: number;
  avg_bookings_per_customer: number;
  top_zip_codes: ZipCodeMetrics[];
  period_comparison: {
    customers_change_percent: number;
    revenue_change_percent: number;
  };
}
