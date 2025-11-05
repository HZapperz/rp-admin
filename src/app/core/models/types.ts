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
  authorized_amount?: number;
  subtotal_before_tax?: number;
  tax_amount?: number;
  tax_rate?: number;
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
