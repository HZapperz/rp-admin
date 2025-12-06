import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface PetBooking {
  pet_id: string;
  service_size: string;
  package_type: string;
  base_price: number;
  package_price: number;
  total_price: number;
  addons?: AddonBooking[];
  notes?: string;
}

export interface AddonBooking {
  name: string;
  price: number;
}

export interface PricingOverride {
  subtotal: number;
  discount_amount: number;
  discount_reason: string;
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
  pets: PetBooking[];
  address_id: string;
  notes?: string;
  pricing_override?: PricingOverride;
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
  addons: { name: string; price: number }[];
  pet_total: number;
}

@Injectable({
  providedIn: 'root'
})
export class AdminBookingService {
  private http = inject(HttpClient);
  private apiUrl = environment.apiUrl;

  /**
   * Create a booking on behalf of a client
   */
  createBooking(bookingData: AdminBookingRequest): Observable<any> {
    return this.http.post(`${this.apiUrl}/admin/bookings`, bookingData);
  }

  /**
   * Get all payment methods for a specific client
   */
  getClientPaymentMethods(clientId: string): Observable<PaymentMethod[]> {
    return this.http.get<PaymentMethod[]>(
      `${this.apiUrl}/admin/clients/${clientId}/payment-methods`
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
   * Calculate pricing for selected pets and services
   */
  calculatePricing(pets: PetBooking[]): PricingBreakdown {
    let subtotal = 0;
    const items: PricingItem[] = [];

    pets.forEach(pet => {
      const petTotal = pet.base_price + pet.package_price +
        (pet.addons?.reduce((sum, addon) => sum + addon.price, 0) || 0);

      subtotal += petTotal;

      items.push({
        pet_name: 'Pet', // You'll need to pass pet names from the component
        package: pet.package_type,
        base_price: pet.base_price,
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
}
