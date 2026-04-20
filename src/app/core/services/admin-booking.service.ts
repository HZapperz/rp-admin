import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { SupabaseService } from './supabase.service';

export interface PetBooking {
  pet_id: string;
  service_size: string;
  package_type: string;
  base_price: number;
  package_price: number;
  total_price: number;
  addons?: AddonBooking[];
  notes?: string;
  // Phase 2 breed coat-type surcharge
  breed_id?: string;
  coat_category?: 'POODLE_DOODLE' | 'DOUBLE_COAT' | 'LONG_COAT_SPANIEL' | 'WIRE_COAT' | 'STANDARD';
  breed_premium_amount?: number;
}

export interface AddonBooking {
  name: string;
  price: number;
}

export interface PricingOverride {
  subtotal: number;
  discount_amount: number;
  discount_reason: string;
  credits_applied?: number;
  tax_amount: number;
  total: number;
}

export interface AdminBookingRequest {
  client_id: string;
  groomer_id: string;
  payment_type: 'pay_on_completion' | 'use_saved_card' | 'cash_on_service';
  payment_method_id?: string;
  scheduled_date: string;
  assigned_time_slot: string;
  scheduled_time_start: string;  // "HH:MM:SS" format
  scheduled_time_end: string;    // "HH:MM:SS" format
  shift_preference: string;      // "morning" or "afternoon"
  pets: PetBooking[];
  address_id: string;
  notes?: string;
  pricing_override?: PricingOverride;
  credits_applied?: number;
}

export interface PaymentMethod {
  id: string;
  user_id: string;
  stripe_customer_id: string;
  stripe_payment_method_id: string;
  brand: string;
  last4: string;
  exp_month: number;
  exp_year: number;
  is_default: boolean;
  created_at: string;
}

export interface TimeSlot {
  slot: string;
  start: string;
  end: string;
  available: boolean;
}

export interface PricingBreakdown {
  subtotal: number;
  tax: number;
  total: number;
  items: PricingItem[];
}

export interface PricingItem {
  pet_name: string;
  package: string;
  base_price: number;
  breed_premium?: number;
  addons: { name: string; price: number }[];
  pet_total: number;
}

@Injectable({
  providedIn: 'root'
})
export class AdminBookingService {
  private http = inject(HttpClient);
  private supabase = inject(SupabaseService);
  private apiUrl = environment.apiUrl;

  /**
   * Get authentication headers for API requests
   */
  private getAuthHeaders(): Record<string, string> {
    const session = this.supabase.session;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (session?.access_token) {
      headers['Authorization'] = `Bearer ${session.access_token}`;
    }
    return headers;
  }

  /**
   * Get Royal Rewards credit balance for a client (bypasses RLS via service client)
   */
  getClientCredits(clientId: string): Observable<{ balance: number; lifetime_earned: number; lifetime_spent: number }> {
    return this.http.get<{ balance: number; lifetime_earned: number; lifetime_spent: number }>(
      `${this.apiUrl}/api/admin/clients/${clientId}/credits`,
      { headers: this.getAuthHeaders() }
    );
  }

  /**
   * Create a booking on behalf of a client
   */
  createBooking(bookingData: AdminBookingRequest): Observable<any> {
    return this.http.post(
      `${this.apiUrl}/api/admin/bookings`,
      bookingData,
      { headers: this.getAuthHeaders() }
    );
  }

  /**
   * Get all payment methods for a specific client
   */
  getClientPaymentMethods(clientId: string): Observable<PaymentMethod[]> {
    return this.http.get<PaymentMethod[]>(
      `${this.apiUrl}/api/admin/clients/${clientId}/payment-methods`,
      { headers: this.getAuthHeaders() }
    );
  }

  /**
   * Get available time slots for a groomer on a specific date
   * This is a placeholder - you'll need to implement the actual logic
   */
  getAvailableTimeSlots(groomerId: string, date: string): Observable<TimeSlot[]> {
    // For now, return all time slots
    // In production, this should check groomer's existing bookings
    const timeSlots: TimeSlot[] = [
      { slot: '8:30-9:45', start: '08:30', end: '09:45', available: true },
      { slot: '9:45-11:00', start: '09:45', end: '11:00', available: true },
      { slot: '11:00-12:15', start: '11:00', end: '12:15', available: true },
      { slot: '1:00-2:15', start: '13:00', end: '14:15', available: true },
      { slot: '2:15-3:30', start: '14:15', end: '15:30', available: true },
      { slot: '3:30-4:45', start: '15:30', end: '16:45', available: true },
    ];

    // TODO: Implement actual availability checking
    // return this.http.get<TimeSlot[]>(`${this.apiUrl}/admin/groomers/${groomerId}/availability?date=${date}`);

    return new Observable(observer => {
      observer.next(timeSlots);
      observer.complete();
    });
  }

  /**
   * Calculate pricing for selected pets and services (Phase 2: includes breed surcharge)
   */
  calculatePricing(pets: PetBooking[]): PricingBreakdown {
    let subtotal = 0;
    const items: PricingItem[] = [];

    pets.forEach(pet => {
      const addonTotal = pet.addons?.reduce((sum, addon) => sum + addon.price, 0) || 0;
      const breedPremium = Number(pet.breed_premium_amount) || 0;
      const petTotal = pet.base_price + pet.package_price + breedPremium + addonTotal;

      subtotal += petTotal;

      items.push({
        pet_name: 'Pet', // You'll need to pass pet names from the component
        package: pet.package_type,
        base_price: pet.base_price,
        breed_premium: breedPremium,
        addons: pet.addons || [],
        pet_total: petTotal
      });
    });

    const tax = subtotal * 0.0825; // 8.25% Texas sales tax
    const total = subtotal + tax;

    return {
      subtotal,
      tax,
      total,
      items
    };
  }

  /**
   * Fetch the canonical breed list (Phase 2) — consumed by the booking wizard,
   * pet editor, and admin breeds editor.
   */
  getBreeds(): Observable<Array<{
    id: string;
    name: string;
    coat_category: 'POODLE_DOODLE' | 'DOUBLE_COAT' | 'LONG_COAT_SPANIEL' | 'WIRE_COAT' | 'STANDARD';
    typical_size?: 'small' | 'medium' | 'large' | 'xl';
    aliases?: string[];
    is_active?: boolean;
    display_order?: number;
  }>> {
    return new Observable(observer => {
      this.supabase.client
        .from('breeds')
        .select('id, name, coat_category, typical_size, aliases, is_active, display_order')
        .eq('is_active', true)
        .order('display_order')
        .order('name')
        .then(({ data, error }) => {
          if (error) {
            observer.error(error);
          } else {
            observer.next(data || []);
            observer.complete();
          }
        });
    });
  }

  /**
   * Fetch the breed coat upcharge matrix (Phase 2) — 48 rows.
   */
  getBreedPremiums(): Observable<Array<{
    id: string;
    coat_category: 'POODLE_DOODLE' | 'DOUBLE_COAT' | 'LONG_COAT_SPANIEL' | 'WIRE_COAT';
    size: 'small' | 'medium' | 'large' | 'xl';
    package_type: 'basic' | 'premium' | 'deluxe';
    upcharge_amount: number;
  }>> {
    return new Observable(observer => {
      this.supabase.client
        .from('breed_premiums')
        .select('id, coat_category, size, package_type, upcharge_amount')
        .order('coat_category')
        .order('size')
        .order('package_type')
        .then(({ data, error }) => {
          if (error) {
            observer.error(error);
          } else {
            observer.next(data || []);
            observer.complete();
          }
        });
    });
  }

  /**
   * Lookup a single upcharge amount. Returns 0 for STANDARD / unknown.
   */
  getBreedPremiumAmount(
    premiums: Array<{ coat_category: string; size: string; package_type: string; upcharge_amount: number }> | null | undefined,
    coatCategory: string | null | undefined,
    size: string | null | undefined,
    packageType: string | null | undefined
  ): number {
    if (!premiums || !coatCategory || coatCategory === 'STANDARD' || !size || !packageType) {
      return 0;
    }
    const hit = premiums.find(p =>
      p.coat_category === coatCategory &&
      p.size === size &&
      p.package_type === packageType
    );
    return hit ? Number(hit.upcharge_amount) : 0;
  }
}
