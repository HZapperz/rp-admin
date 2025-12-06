import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, from } from 'rxjs';
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
  private supabase = inject(SupabaseService);

  /**
   * Create a booking on behalf of a client using Supabase
   */
  async createBooking(bookingData: AdminBookingRequest): Promise<any> {
    try {
      // First, get the address details
      const { data: address, error: addressError } = await this.supabase
        .from('addresses')
        .select('*')
        .eq('id', bookingData.address_id)
        .single();

      if (addressError || !address) {
        throw new Error(`Address not found: ${addressError?.message || 'Unknown error'}`);
      }

      // Parse time slot to extract start and end times
      // Format: "09:00 AM" or "8:30-9:45"
      const timeSlot = bookingData.assigned_time_slot;
      let timeStart = '09:00';
      let timeEnd = '10:00';

      if (timeSlot.includes('-')) {
        // Format: "8:30-9:45"
        const [start, end] = timeSlot.split('-');
        timeStart = this.convertTo24Hour(start.trim());
        timeEnd = this.convertTo24Hour(end.trim());
      } else {
        // Format: "09:00 AM" - assume 1 hour duration
        timeStart = this.convertTo24Hour(timeSlot);
        const [hours, minutes] = timeStart.split(':').map(Number);
        const endTime = new Date();
        endTime.setHours(hours, minutes + 60, 0, 0);
        timeEnd = `${String(endTime.getHours()).padStart(2, '0')}:${String(endTime.getMinutes()).padStart(2, '0')}`;
      }

      // Calculate total amount from pets
      const totalAmount = bookingData.pets.reduce((sum, pet) => sum + pet.total_price, 0);
      const finalAmount = bookingData.pricing_override?.total || totalAmount;
      const discountAmount = bookingData.pricing_override?.discount_amount || 0;

      // Create the booking
      const { data: booking, error: bookingError } = await this.supabase
        .from('bookings')
        .insert({
          client_id: bookingData.client_id,
          groomer_id: bookingData.groomer_id,
          status: 'confirmed', // Admin-created bookings are confirmed
          scheduled_date: bookingData.scheduled_date,
          scheduled_time_start: timeStart,
          scheduled_time_end: timeEnd,
          assigned_time_slot: bookingData.assigned_time_slot,
          total_amount: finalAmount,
          original_subtotal: totalAmount,
          discount_amount: discountAmount,
          subtotal_before_tax: totalAmount - discountAmount,
          address: `${address.building} ${address.street}`.trim(),
          city: address.city || 'Dallas',
          state: address.state || 'TX',
          zip_code: address.zip_code || '75201',
          payment_method_id: bookingData.payment_method_id || null,
          notes: bookingData.notes || null
        })
        .select()
        .single();

      if (bookingError) {
        throw new Error(`Failed to create booking: ${bookingError.message}`);
      }

      // Create booking_pets entries
      const bookingPets = bookingData.pets.map(pet => ({
        booking_id: booking.id,
        pet_id: pet.pet_id,
        service_size: pet.service_size,
        package_type: pet.package_type,
        base_price: pet.base_price,
        package_price: pet.package_price,
        total_price: pet.total_price,
        notes: pet.notes || null
      }));

      const { data: insertedPets, error: petsError } = await this.supabase
        .from('booking_pets')
        .insert(bookingPets)
        .select();

      if (petsError) {
        throw new Error(`Failed to create booking pets: ${petsError.message}`);
      }

      // Create booking_addons entries
      const addonsToInsert: any[] = [];
      bookingData.pets.forEach((pet, petIndex) => {
        if (pet.addons && pet.addons.length > 0) {
          pet.addons.forEach(addon => {
            addonsToInsert.push({
              booking_pet_id: insertedPets[petIndex].id,
              addon_name: addon.name,
              addon_price: addon.price
            });
          });
        }
      });

      if (addonsToInsert.length > 0) {
        const { error: addonsError } = await this.supabase
          .from('booking_addons')
          .insert(addonsToInsert);

        if (addonsError) {
          throw new Error(`Failed to create booking addons: ${addonsError.message}`);
        }
      }

      return booking;
    } catch (error: any) {
      console.error('Error creating booking:', error);
      throw error;
    }
  }

  /**
   * Convert 12-hour time format to 24-hour format
   */
  private convertTo24Hour(timeStr: string): string {
    // Remove AM/PM and trim
    const cleaned = timeStr.trim().toUpperCase();
    
    // Check if already in 24-hour format (contains : and no AM/PM)
    if (cleaned.includes(':') && !cleaned.includes('AM') && !cleaned.includes('PM')) {
      return cleaned;
    }

    // Parse 12-hour format
    const match = cleaned.match(/(\d{1,2}):?(\d{2})?\s*(AM|PM)?/i);
    if (!match) {
      return '09:00'; // Default fallback
    }

    let hours = parseInt(match[1]);
    const minutes = match[2] ? parseInt(match[2]) : 0;
    const period = match[3]?.toUpperCase() || 'AM';

    if (period === 'PM' && hours !== 12) {
      hours += 12;
    } else if (period === 'AM' && hours === 12) {
      hours = 0;
    }

    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
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
