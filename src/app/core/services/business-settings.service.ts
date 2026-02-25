import { Injectable } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { Observable, from, map, catchError, of } from 'rxjs';

// Type definitions
export interface BusinessSettings {
  id: string;
  business_name: string;
  timezone: string;
  default_booking_window_days: number;
  allow_same_day_booking: boolean;
  min_advance_booking_hours: number;
  created_at: string;
  updated_at: string;
}

export interface OperatingDay {
  id: string;
  day_of_week: number; // 0 = Sunday, 6 = Saturday
  is_open: boolean;
  created_at: string;
  updated_at: string;
}

export interface OperatingHours {
  id: string;
  day_of_week: number;
  opens_at: string; // HH:MM:SS format
  closes_at: string;
  break_start: string | null;
  break_end: string | null;
  created_at: string;
  updated_at: string;
}

export interface Holiday {
  id: string;
  date: string; // YYYY-MM-DD format
  name: string;
  is_recurring: boolean;
  description: string | null;
  created_at: string;
  updated_at: string;
}

export interface SpecialHours {
  id: string;
  date: string; // YYYY-MM-DD format
  opens_at: string | null;
  closes_at: string | null;
  is_closed: boolean;
  reason: string | null;
  created_at: string;
  updated_at: string;
}

export interface BookingConflict {
  id: string;
  booking_date: string;
  booking_time: string;
  client_name: string;
  groomer_name: string;
  status: string;
}

export interface BookingTimeSlot {
  id: string;
  label: string;
  display_time: string;
  start_time: string; // HH:MM:SS format
  end_time: string;
  is_active: boolean;
  is_client_visible: boolean;
  days_of_week: number[] | null; // null = all days, otherwise array of 0-6
  sort_order: number;
  created_at: string;
  updated_at: string;
}

@Injectable({
  providedIn: 'root'
})
export class BusinessSettingsService {
  constructor(private supabase: SupabaseService) {}

  // =======================
  // BUSINESS SETTINGS
  // =======================

  getBusinessSettings(): Observable<BusinessSettings | null> {
    return from(
      this.supabase.from('business_settings')
        .select('*')
        .limit(1)
        .single()
    ).pipe(
      map(response => response.data),
      catchError(error => {
        console.error('Error fetching business settings:', error);
        return of(null);
      })
    );
  }

  updateBusinessSettings(settings: Partial<BusinessSettings>): Observable<boolean> {
    return from(
      this.supabase.from('business_settings')
        .update(settings)
        .eq('id', settings.id!)
    ).pipe(
      map(response => !response.error),
      catchError(error => {
        console.error('Error updating business settings:', error);
        return of(false);
      })
    );
  }

  // =======================
  // OPERATING DAYS
  // =======================

  getOperatingDays(): Observable<OperatingDay[]> {
    return from(
      this.supabase.from('operating_days')
        .select('*')
        .order('day_of_week', { ascending: true })
    ).pipe(
      map(response => response.data || []),
      catchError(error => {
        console.error('Error fetching operating days:', error);
        return of([]);
      })
    );
  }

  updateOperatingDay(dayOfWeek: number, isOpen: boolean): Observable<boolean> {
    return from(
      this.supabase.from('operating_days')
        .update({ is_open: isOpen })
        .eq('day_of_week', dayOfWeek)
    ).pipe(
      map(response => !response.error),
      catchError(error => {
        console.error('Error updating operating day:', error);
        return of(false);
      })
    );
  }

  bulkUpdateOperatingDays(updates: { day_of_week: number; is_open: boolean }[]): Observable<boolean> {
    const promises = updates.map(update =>
      this.supabase.from('operating_days')
        .update({ is_open: update.is_open })
        .eq('day_of_week', update.day_of_week)
    );

    return from(Promise.all(promises)).pipe(
      map(responses => responses.every(r => !r.error)),
      catchError(error => {
        console.error('Error bulk updating operating days:', error);
        return of(false);
      })
    );
  }

  // =======================
  // OPERATING HOURS
  // =======================

  getOperatingHours(): Observable<OperatingHours[]> {
    return from(
      this.supabase.from('operating_hours')
        .select('*')
        .order('day_of_week', { ascending: true })
    ).pipe(
      map(response => response.data || []),
      catchError(error => {
        console.error('Error fetching operating hours:', error);
        return of([]);
      })
    );
  }

  updateOperatingHours(dayOfWeek: number, hours: {
    opens_at: string;
    closes_at: string;
    break_start?: string | null;
    break_end?: string | null;
  }): Observable<boolean> {
    return from(
      this.supabase.from('operating_hours')
        .upsert({
          day_of_week: dayOfWeek,
          ...hours
        })
    ).pipe(
      map(response => !response.error),
      catchError(error => {
        console.error('Error updating operating hours:', error);
        return of(false);
      })
    );
  }

  // =======================
  // HOLIDAYS
  // =======================

  getHolidays(year?: number): Observable<Holiday[]> {
    let query = this.supabase.from('holidays')
      .select('*')
      .order('date', { ascending: true });

    if (year) {
      const startDate = `${year}-01-01`;
      const endDate = `${year}-12-31`;
      query = query.gte('date', startDate).lte('date', endDate);
    }

    return from(query).pipe(
      map(response => response.data || []),
      catchError(error => {
        console.error('Error fetching holidays:', error);
        return of([]);
      })
    );
  }

  addHoliday(holiday: Omit<Holiday, 'id' | 'created_at' | 'updated_at'>): Observable<boolean> {
    return from(
      this.supabase.from('holidays')
        .insert(holiday)
    ).pipe(
      map(response => !response.error),
      catchError(error => {
        console.error('Error adding holiday:', error);
        return of(false);
      })
    );
  }

  deleteHoliday(id: string): Observable<boolean> {
    return from(
      this.supabase.from('holidays')
        .delete()
        .eq('id', id)
    ).pipe(
      map(response => !response.error),
      catchError(error => {
        console.error('Error deleting holiday:', error);
        return of(false);
      })
    );
  }

  // =======================
  // SPECIAL HOURS
  // =======================

  getSpecialHours(startDate?: string, endDate?: string): Observable<SpecialHours[]> {
    let query = this.supabase.from('special_hours')
      .select('*')
      .order('date', { ascending: true });

    if (startDate) {
      query = query.gte('date', startDate);
    }
    if (endDate) {
      query = query.lte('date', endDate);
    }

    return from(query).pipe(
      map(response => response.data || []),
      catchError(error => {
        console.error('Error fetching special hours:', error);
        return of([]);
      })
    );
  }

  addSpecialHours(specialHours: Omit<SpecialHours, 'id' | 'created_at' | 'updated_at'>): Observable<boolean> {
    return from(
      this.supabase.from('special_hours')
        .insert(specialHours)
    ).pipe(
      map(response => !response.error),
      catchError(error => {
        console.error('Error adding special hours:', error);
        return of(false);
      })
    );
  }

  deleteSpecialHours(id: string): Observable<boolean> {
    return from(
      this.supabase.from('special_hours')
        .delete()
        .eq('id', id)
    ).pipe(
      map(response => !response.error),
      catchError(error => {
        console.error('Error deleting special hours:', error);
        return of(false);
      })
    );
  }

  // =======================
  // BOOKING TIME SLOTS
  // =======================

  /**
   * Get all booking time slots
   */
  getBookingTimeSlots(): Observable<BookingTimeSlot[]> {
    return from(
      this.supabase.from('booking_time_slots')
        .select('*')
        .order('sort_order', { ascending: true })
    ).pipe(
      map(response => response.data || []),
      catchError(error => {
        console.error('Error fetching booking time slots:', error);
        return of([]);
      })
    );
  }

  /**
   * Create a new booking time slot
   */
  createBookingTimeSlot(slot: Omit<BookingTimeSlot, 'id' | 'created_at' | 'updated_at'>): Observable<boolean> {
    return from(
      this.supabase.from('booking_time_slots')
        .insert(slot)
    ).pipe(
      map(response => !response.error),
      catchError(error => {
        console.error('Error creating booking time slot:', error);
        return of(false);
      })
    );
  }

  /**
   * Update a booking time slot
   */
  updateBookingTimeSlot(id: string, updates: Partial<BookingTimeSlot>): Observable<boolean> {
    return from(
      this.supabase.from('booking_time_slots')
        .update(updates)
        .eq('id', id)
    ).pipe(
      map(response => !response.error),
      catchError(error => {
        console.error('Error updating booking time slot:', error);
        return of(false);
      })
    );
  }

  /**
   * Delete a booking time slot
   */
  deleteBookingTimeSlot(id: string): Observable<boolean> {
    return from(
      this.supabase.from('booking_time_slots')
        .delete()
        .eq('id', id)
    ).pipe(
      map(response => !response.error),
      catchError(error => {
        console.error('Error deleting booking time slot:', error);
        return of(false);
      })
    );
  }

  /**
   * Reorder booking time slots
   */
  updateBookingTimeSlotsOrder(slots: Array<{id: string, sort_order: number}>): Observable<boolean> {
    // Execute updates in parallel
    const updates = slots.map(slot =>
      this.supabase.from('booking_time_slots')
        .update({ sort_order: slot.sort_order })
        .eq('id', slot.id)
    );

    return from(Promise.all(updates)).pipe(
      map(responses => responses.every(r => !r.error)),
      catchError(error => {
        console.error('Error reordering booking time slots:', error);
        return of(false);
      })
    );
  }

  // =======================
  // BOOKING CONFLICTS
  // =======================

  /**
   * Check for booking conflicts when changing operating days/hours
   * Returns bookings that would be affected by the change
   */
  checkBookingConflicts(closedDays: number[]): Observable<BookingConflict[]> {
    // Build the date ranges for closed days
    // We need to check upcoming bookings (from today forward)
    const today = new Date().toISOString().split('T')[0];

    return from(
      this.supabase.from('bookings')
        .select(`
          id,
          booking_date,
          booking_time,
          status,
          client:users!bookings_client_id_fkey(first_name, last_name),
          groomer:users!bookings_groomer_id_fkey(first_name, last_name)
        `)
        .gte('booking_date', today)
        .in('status', ['PENDING', 'CONFIRMED', 'IN_PROGRESS'])
    ).pipe(
      map(response => {
        if (!response.data) return [];

        // Filter bookings that fall on closed days
        return response.data
          .filter((booking: any) => {
            const bookingDate = new Date(booking.booking_date);
            const dayOfWeek = bookingDate.getDay();
            return closedDays.includes(dayOfWeek);
          })
          .map((booking: any) => {
            // Handle both single object and array responses from Supabase
            const client = Array.isArray(booking.client) ? booking.client[0] : booking.client;
            const groomer = Array.isArray(booking.groomer) ? booking.groomer[0] : booking.groomer;

            return {
              id: booking.id,
              booking_date: booking.booking_date,
              booking_time: booking.booking_time,
              client_name: client
                ? `${client.first_name || ''} ${client.last_name || ''}`.trim()
                : 'Unknown',
              groomer_name: groomer
                ? `${groomer.first_name || ''} ${groomer.last_name || ''}`.trim()
                : 'Unassigned',
              status: booking.status
            };
          });
      }),
      catchError(error => {
        console.error('Error checking booking conflicts:', error);
        return of([]);
      })
    );
  }

  /**
   * Cancel affected bookings when days are closed
   */
  cancelAffectedBookings(bookingIds: string[], reason: string): Observable<boolean> {
    return from(
      this.supabase.from('bookings')
        .update({
          status: 'CANCELLED',
          cancellation_reason: reason,
          cancelled_at: new Date().toISOString()
        })
        .in('id', bookingIds)
    ).pipe(
      map(response => !response.error),
      catchError(error => {
        console.error('Error cancelling bookings:', error);
        return of(false);
      })
    );
  }

  // =======================
  // HELPER METHODS
  // =======================

  /**
   * Get day name from day number
   */
  getDayName(dayOfWeek: number): string {
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    return days[dayOfWeek] || '';
  }

  /**
   * Format time string (HH:MM:SS) to display format (HH:MM AM/PM)
   */
  formatTime(timeString: string): string {
    if (!timeString) return '';
    const [hours, minutes] = timeString.split(':');
    const hour = parseInt(hours, 10);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour % 12 || 12;
    return `${displayHour}:${minutes} ${ampm}`;
  }

  /**
   * Validate that operating hours are valid
   */
  validateOperatingHours(hours: {
    opens_at: string;
    closes_at: string;
    break_start?: string | null;
    break_end?: string | null;
  }): { valid: boolean; error?: string } {
    const opens = hours.opens_at;
    const closes = hours.closes_at;
    const breakStart = hours.break_start;
    const breakEnd = hours.break_end;

    if (opens >= closes) {
      return { valid: false, error: 'Opening time must be before closing time' };
    }

    if (breakStart && breakEnd) {
      if (breakStart >= breakEnd) {
        return { valid: false, error: 'Break start must be before break end' };
      }
      if (breakStart <= opens || breakEnd >= closes) {
        return { valid: false, error: 'Break times must be within operating hours' };
      }
    }

    if ((breakStart && !breakEnd) || (!breakStart && breakEnd)) {
      return { valid: false, error: 'Both break start and end times are required' };
    }

    return { valid: true };
  }
}
