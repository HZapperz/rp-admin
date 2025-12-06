import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { SupabaseService } from './supabase.service';
import { Observable, from, map } from 'rxjs';
import { BookingWithDetails, BookingStatus, BookingFilters } from '../models/types';
import { environment } from '../../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class BookingService {
  private http = inject(HttpClient);

  constructor(private supabase: SupabaseService) {}

  getAllBookings(filters?: BookingFilters): Observable<BookingWithDetails[]> {
    return from(this.fetchBookings(filters));
  }

  private async fetchBookings(filters?: BookingFilters): Promise<BookingWithDetails[]> {
    // Step 1: Fetch base bookings
    let query = this.supabase
      .from('bookings')
      .select('*')
      .order('created_at', { ascending: false });

    // Apply filters
    if (filters?.status && filters.status.length > 0) {
      query = query.in('status', filters.status);
    }

    if (filters?.dateRange) {
      query = query
        .gte('scheduled_date', filters.dateRange.start)
        .lte('scheduled_date', filters.dateRange.end);
    }

    if (filters?.groomerId !== undefined) {
      // Support both filtering by specific groomer and unassigned bookings (null)
      if (filters.groomerId === null || filters.groomerId === '') {
        query = query.is('groomer_id', null);
      } else {
        query = query.eq('groomer_id', filters.groomerId);
      }
    }

    if (filters?.clientId) {
      query = query.eq('client_id', filters.clientId);
    }

    const { data: bookings, error } = await query;

    if (error) {
      console.error('Error fetching bookings:', error);
      throw error;
    }

    if (!bookings || bookings.length === 0) {
      return [];
    }

    // Step 2: Extract unique IDs (filter out null groomer_id for pending bookings)
    const groomerIds = [...new Set(bookings.map(b => b.groomer_id).filter(Boolean))];
    const clientIds = [...new Set(bookings.map(b => b.client_id).filter(Boolean))];
    const bookingIds = bookings.map(b => b.id);

    // Step 3: Batch fetch all related data in parallel
    const [groomersResult, clientsResult, bookingPetsResult] = await Promise.all([
      groomerIds.length > 0
        ? this.supabase
            .from('users')
            .select('id, first_name, last_name, avatar_url, phone, email')
            .in('id', groomerIds)
        : Promise.resolve({ data: [], error: null }),
      this.supabase
        .from('users')
        .select('id, first_name, last_name, avatar_url, phone, email')
        .in('id', clientIds),
      this.supabase
        .from('booking_pets')
        .select('*')
        .in('booking_id', bookingIds)
    ]);

    if (groomersResult.error) console.error('Error fetching groomers:', groomersResult.error);
    if (clientsResult.error) console.error('Error fetching clients:', clientsResult.error);
    if (bookingPetsResult.error) console.error('Error fetching booking pets:', bookingPetsResult.error);

    // Step 4: Fetch pets and addons
    const petIds = [...new Set((bookingPetsResult.data || []).map(bp => bp.pet_id).filter(Boolean))];
    const bookingPetIds = (bookingPetsResult.data || []).map(bp => bp.id);

    const [petsResult, addonsResult] = await Promise.all([
      petIds.length > 0
        ? this.supabase.from('pets').select('*').in('id', petIds)
        : Promise.resolve({ data: [], error: null }),
      bookingPetIds.length > 0
        ? this.supabase.from('booking_addons').select('*').in('booking_pet_id', bookingPetIds)
        : Promise.resolve({ data: [], error: null })
    ]);

    // Step 5: Create lookup objects for O(1) access
    const groomersLookup: Record<string, any> = (groomersResult.data || []).reduce((acc, g) => {
      acc[g.id] = g;
      return acc;
    }, {} as Record<string, any>);

    const clientsLookup: Record<string, any> = (clientsResult.data || []).reduce((acc, c) => {
      acc[c.id] = c;
      return acc;
    }, {} as Record<string, any>);

    const petsLookup: Record<string, any> = (petsResult.data || []).reduce((acc, p) => {
      acc[p.id] = p;
      return acc;
    }, {} as Record<string, any>);

    const addonsByBookingPetId: Record<string, any[]> = (addonsResult.data || []).reduce((acc, addon) => {
      if (!acc[addon.booking_pet_id]) {
        acc[addon.booking_pet_id] = [];
      }
      acc[addon.booking_pet_id].push(addon);
      return acc;
    }, {} as Record<string, any[]>);

    const bookingPetsByBookingId: Record<string, any[]> = (bookingPetsResult.data || []).reduce((acc, bp) => {
      if (!acc[bp.booking_id]) {
        acc[bp.booking_id] = [];
      }
      acc[bp.booking_id].push({
        ...bp,
        pet: petsLookup[bp.pet_id],
        addons: addonsByBookingPetId[bp.id] || []
      });
      return acc;
    }, {} as Record<string, any[]>);

    // Step 6: Combine and return enriched data
    const bookingsWithDetails: BookingWithDetails[] = bookings.map(booking => ({
      ...booking,
      groomer: groomersLookup[booking.groomer_id] || undefined,
      client: clientsLookup[booking.client_id] || undefined,
      pets: bookingPetsByBookingId[booking.id] || []
    }));

    return bookingsWithDetails;
  }

  async getBookingById(id: string): Promise<BookingWithDetails | null> {
    console.log('getBookingById called for:', id);

    // Fetch single booking
    const { data: booking, error } = await this.supabase
      .from('bookings')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      console.error('Error fetching booking:', error);
      return null;
    }

    if (!booking) {
      console.warn('No booking found for id:', id);
      return null;
    }

    console.log('Booking fetched, now fetching related data...', { bookingId: booking.id });

    // Batch fetch related data (groomer might be null for pending bookings)
    const [groomerResult, clientResult, bookingPetsResult] = await Promise.all([
      booking.groomer_id
        ? this.supabase
            .from('users')
            .select('id, first_name, last_name, avatar_url, phone, email')
            .eq('id', booking.groomer_id)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      this.supabase
        .from('users')
        .select('id, first_name, last_name, avatar_url, phone, email')
        .eq('id', booking.client_id)
        .single(),
      this.supabase
        .from('booking_pets')
        .select('*')
        .eq('booking_id', booking.id)
    ]);

    console.log('Booking pets fetched:', {
      count: bookingPetsResult.data?.length || 0,
      hasError: !!bookingPetsResult.error,
      error: bookingPetsResult.error
    });

    if (bookingPetsResult.error) {
      console.error('Error fetching booking_pets:', bookingPetsResult.error);
    }

    // Fetch pets and addons for this booking
    const bookingPetIds = (bookingPetsResult.data || []).map(bp => bp.id);
    const petIds = [...new Set((bookingPetsResult.data || []).map(bp => bp.pet_id).filter(Boolean))];

    console.log('Pet IDs to fetch:', { petIds, bookingPetIds });

    const [petsResult, addonsResult] = await Promise.all([
      petIds.length > 0
        ? this.supabase.from('pets').select('*').in('id', petIds)
        : Promise.resolve({ data: [], error: null }),
      bookingPetIds.length > 0
        ? this.supabase.from('booking_addons').select('*').in('booking_pet_id', bookingPetIds)
        : Promise.resolve({ data: [], error: null })
    ]);

    console.log('Pets fetched:', {
      count: petsResult.data?.length || 0,
      hasError: !!petsResult.error
    });

    // Create lookups
    const petsLookup: Record<string, any> = (petsResult.data || []).reduce((acc, p) => {
      acc[p.id] = p;
      return acc;
    }, {} as Record<string, any>);

    const addonsByBookingPetId: Record<string, any[]> = (addonsResult.data || []).reduce((acc, addon) => {
      if (!acc[addon.booking_pet_id]) {
        acc[addon.booking_pet_id] = [];
      }
      acc[addon.booking_pet_id].push(addon);
      return acc;
    }, {} as Record<string, any[]>);

    const petsWithDetails = (bookingPetsResult.data || []).map(bp => ({
      ...bp,
      pet: petsLookup[bp.pet_id],
      addons: addonsByBookingPetId[bp.id] || []
    }));

    console.log('Final pets with details:', {
      count: petsWithDetails.length,
      pets: petsWithDetails
    });

    return {
      ...booking,
      groomer: groomerResult.data || undefined,
      client: clientResult.data || undefined,
      pets: petsWithDetails
    };
  }

  async approveBooking(bookingId: string, groomerId: string, scheduledDate: string, timeSlotStart: string, timeSlotEnd: string): Promise<boolean> {
    try {
      console.log('Attempting to approve booking...', {
        bookingId,
        groomerId,
        scheduledDate,
        timeSlotStart,
        timeSlotEnd,
        currentUser: this.supabase.session?.user?.id
      });

      // Update booking with groomer assignment, date, time slots, and confirm status
      const { data, error } = await this.supabase
        .from('bookings')
        .update({
          groomer_id: groomerId,
          scheduled_date: scheduledDate,
          scheduled_time_start: timeSlotStart,
          scheduled_time_end: timeSlotEnd,
          status: 'confirmed',
          updated_at: new Date().toISOString()
        })
        .eq('id', bookingId)
        .select();

      if (error) {
        console.error('Error approving booking:', {
          error,
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code
        });
        return false;
      }

      console.log('Booking approved successfully', { data });
      return true;
    } catch (error) {
      console.error('Exception while approving booking:', error);
      return false;
    }
  }

  async rejectBooking(bookingId: string, reason?: string): Promise<boolean> {
    const { error } = await this.supabase
      .from('bookings')
      .update({
        status: 'cancelled',
        cancellation_reason: reason || 'Rejected by admin',
        cancelled_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', bookingId);

    if (error) {
      console.error('Error rejecting booking:', error);
      return false;
    }

    return true;
  }

  async assignGroomer(bookingId: string, groomerId: string): Promise<boolean> {
    const { error } = await this.supabase
      .from('bookings')
      .update({
        groomer_id: groomerId,
        updated_at: new Date().toISOString()
      })
      .eq('id', bookingId);

    if (error) {
      console.error('Error assigning groomer:', error);
      return false;
    }

    return true;
  }

  async updateBookingStatus(bookingId: string, status: BookingStatus): Promise<boolean> {
    const { error } = await this.supabase
      .from('bookings')
      .update({
        status,
        updated_at: new Date().toISOString()
      })
      .eq('id', bookingId);

    if (error) {
      console.error('Error updating booking status:', error);
      return false;
    }

    return true;
  }

  async changeBookingTime(
    bookingId: string,
    newDate: string,
    newTimeStart: string,
    newTimeEnd: string
  ): Promise<{ success: boolean; oldValues?: { scheduled_date: string; scheduled_time_start: string; scheduled_time_end: string } }> {
    try {
      // 1. Fetch current booking to get old values (for email notification)
      const { data: currentBooking, error: fetchError } = await this.supabase
        .from('bookings')
        .select('scheduled_date, scheduled_time_start, scheduled_time_end')
        .eq('id', bookingId)
        .single();

      if (fetchError || !currentBooking) {
        console.error('Error fetching current booking:', fetchError);
        return { success: false };
      }

      const oldValues = {
        scheduled_date: currentBooking.scheduled_date,
        scheduled_time_start: currentBooking.scheduled_time_start,
        scheduled_time_end: currentBooking.scheduled_time_end
      };

      // 2. Update booking with new date/time
      const { error: updateError } = await this.supabase
        .from('bookings')
        .update({
          scheduled_date: newDate,
          scheduled_time_start: newTimeStart,
          scheduled_time_end: newTimeEnd,
          updated_at: new Date().toISOString()
        })
        .eq('id', bookingId);

      if (updateError) {
        console.error('Error updating booking time:', updateError);
        return { success: false };
      }

      return { success: true, oldValues };
    } catch (error) {
      console.error('Exception while changing booking time:', error);
      return { success: false };
    }
  }

  async getBookingStats(): Promise<{
    total: number;
    pending: number;
    confirmed: number;
    completed: number;
    cancelled: number;
  }> {
    const { data, error } = await this.supabase
      .from('bookings')
      .select('status');

    if (error) {
      console.error('Error fetching booking stats:', error);
      return { total: 0, pending: 0, confirmed: 0, completed: 0, cancelled: 0 };
    }

    const stats = {
      total: data.length,
      pending: data.filter(b => b.status === 'pending').length,
      confirmed: data.filter(b => b.status === 'confirmed').length,
      completed: data.filter(b => b.status === 'completed').length,
      cancelled: data.filter(b => b.status === 'cancelled').length
    };

    return stats;
  }
}
