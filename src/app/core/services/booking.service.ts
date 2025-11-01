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
            .select('id, first_name, last_name, avatar_url')
            .in('id', groomerIds)
        : Promise.resolve({ data: [], error: null }),
      this.supabase
        .from('users')
        .select('id, first_name, last_name, avatar_url')
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

    if (!booking) return null;

    // Batch fetch related data (groomer might be null for pending bookings)
    const [groomerResult, clientResult, bookingPetsResult] = await Promise.all([
      booking.groomer_id
        ? this.supabase
            .from('users')
            .select('id, first_name, last_name, avatar_url, phone')
            .eq('id', booking.groomer_id)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      this.supabase
        .from('users')
        .select('id, first_name, last_name, avatar_url, phone')
        .eq('id', booking.client_id)
        .single(),
      this.supabase
        .from('booking_pets')
        .select('*')
        .eq('booking_id', booking.id)
    ]);

    // Fetch pets and addons for this booking
    const bookingPetIds = (bookingPetsResult.data || []).map(bp => bp.id);
    const petIds = [...new Set((bookingPetsResult.data || []).map(bp => bp.pet_id).filter(Boolean))];

    const [petsResult, addonsResult] = await Promise.all([
      petIds.length > 0
        ? this.supabase.from('pets').select('*').in('id', petIds)
        : Promise.resolve({ data: [], error: null }),
      bookingPetIds.length > 0
        ? this.supabase.from('booking_addons').select('*').in('booking_pet_id', bookingPetIds)
        : Promise.resolve({ data: [], error: null })
    ]);

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

    return {
      ...booking,
      groomer: groomerResult.data || undefined,
      client: clientResult.data || undefined,
      pets: petsWithDetails
    };
  }

  async approveBooking(bookingId: string, groomerId: string, timeSlotStart: string, timeSlotEnd: string): Promise<boolean> {
    try {
      // Get the current Supabase session token for authentication
      const session = this.supabase.session;
      if (!session) {
        console.error('No active session');
        return false;
      }

      // Call Next.js API endpoint which handles database update AND email notification
      const response = await fetch(`${environment.apiUrl}/api/admin/bookings/${bookingId}/assign-groomer`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          groomerId,
          timeSlotStart,
          timeSlotEnd
        }),
        credentials: 'include'
      });

      if (!response.ok) {
        const error = await response.json();
        console.error('Error approving booking:', error);
        return false;
      }

      const result = await response.json();
      console.log('Booking approved successfully:', result);
      return true;
    } catch (error) {
      console.error('Error approving booking:', error);
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
