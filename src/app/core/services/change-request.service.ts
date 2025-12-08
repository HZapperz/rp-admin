import { Injectable, inject } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { BehaviorSubject, Observable, from, map } from 'rxjs';

export interface ChangeRequest {
  id: string;
  booking_id: string;
  client_id: string;
  original_date: string;
  original_time_start: string;
  original_time_end: string;
  requested_date: string;
  requested_time_start: string;
  requested_time_end: string;
  reason: string;
  status: 'pending' | 'approved' | 'rejected';
  admin_response?: string;
  reviewed_by?: string;
  reviewed_at?: string;
  created_at: string;
  updated_at: string;
  // Joined data
  booking?: {
    id: string;
    address: string;
    city: string;
    state: string;
  };
  client?: {
    id: string;
    first_name: string;
    last_name: string;
    email: string;
    phone?: string;
  };
  pets?: Array<{
    name: string;
    breed?: string;
  }>;
}

export interface ChangeRequestAction {
  requestId: string;
  action: 'approve' | 'reject';
  adminResponse?: string;
}

@Injectable({
  providedIn: 'root'
})
export class ChangeRequestService {
  private supabase = inject(SupabaseService);

  private pendingCountSubject = new BehaviorSubject<number>(0);
  pendingCount$ = this.pendingCountSubject.asObservable();

  constructor() {
    this.loadPendingCount();
  }

  /**
   * Load the count of pending change requests
   */
  async loadPendingCount(): Promise<void> {
    try {
      const { count, error } = await this.supabase.client
        .from('booking_change_requests')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'pending');

      if (!error && count !== null) {
        this.pendingCountSubject.next(count);
      }
    } catch (err) {
      console.error('Error loading pending count:', err);
    }
  }

  /**
   * Get all change requests with optional status filter
   */
  async getChangeRequests(status?: 'pending' | 'approved' | 'rejected'): Promise<ChangeRequest[]> {
    try {
      let query = this.supabase.client
        .from('booking_change_requests')
        .select(`
          *,
          booking:bookings(id, address, city, state),
          client:users!booking_change_requests_client_id_fkey(id, first_name, last_name, email, phone)
        `)
        .order('created_at', { ascending: false });

      if (status) {
        query = query.eq('status', status);
      }

      const { data, error } = await query;

      if (error) {
        console.error('Error fetching change requests:', error);
        return [];
      }

      // Fetch pets for each booking
      const requestsWithPets = await Promise.all(
        (data || []).map(async (request: any) => {
          const { data: bookingPets } = await this.supabase.client
            .from('booking_pets')
            .select('pets(name, breed)')
            .eq('booking_id', request.booking_id);

          return {
            ...request,
            pets: bookingPets?.map((bp: any) => bp.pets) || []
          };
        })
      );

      return requestsWithPets as ChangeRequest[];
    } catch (err) {
      console.error('Error in getChangeRequests:', err);
      return [];
    }
  }

  /**
   * Get a single change request by ID
   */
  async getChangeRequestById(id: string): Promise<ChangeRequest | null> {
    try {
      const { data, error } = await this.supabase.client
        .from('booking_change_requests')
        .select(`
          *,
          booking:bookings(id, address, city, state),
          client:users!booking_change_requests_client_id_fkey(id, first_name, last_name, email, phone)
        `)
        .eq('id', id)
        .single();

      if (error || !data) {
        console.error('Error fetching change request:', error);
        return null;
      }

      // Fetch pets
      const { data: bookingPets } = await this.supabase.client
        .from('booking_pets')
        .select('pets(name, breed)')
        .eq('booking_id', data.booking_id);

      return {
        ...data,
        pets: bookingPets?.map((bp: any) => bp.pets) || []
      } as ChangeRequest;
    } catch (err) {
      console.error('Error in getChangeRequestById:', err);
      return null;
    }
  }

  /**
   * Get pending change request for a specific booking
   */
  async getPendingRequestForBooking(bookingId: string): Promise<ChangeRequest | null> {
    try {
      const { data, error } = await this.supabase.client
        .from('booking_change_requests')
        .select('*')
        .eq('booking_id', bookingId)
        .eq('status', 'pending')
        .maybeSingle();

      if (error) {
        console.error('Error fetching pending request:', error);
        return null;
      }

      return data as ChangeRequest | null;
    } catch (err) {
      console.error('Error in getPendingRequestForBooking:', err);
      return null;
    }
  }

  /**
   * Approve a change request
   */
  async approveRequest(requestId: string, adminId: string): Promise<boolean> {
    try {
      // Get the request details first
      const { data: request, error: fetchError } = await this.supabase.client
        .from('booking_change_requests')
        .select('*')
        .eq('id', requestId)
        .single();

      if (fetchError || !request) {
        console.error('Error fetching request:', fetchError);
        return false;
      }

      // Update the booking with the new date/time
      const { error: bookingError } = await this.supabase.client
        .from('bookings')
        .update({
          scheduled_date: request.requested_date,
          scheduled_time_start: request.requested_time_start,
          scheduled_time_end: request.requested_time_end,
        })
        .eq('id', request.booking_id);

      if (bookingError) {
        console.error('Error updating booking:', bookingError);
        return false;
      }

      // Update the change request status
      const { error: updateError } = await this.supabase.client
        .from('booking_change_requests')
        .update({
          status: 'approved',
          reviewed_by: adminId,
          reviewed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', requestId);

      if (updateError) {
        console.error('Error updating request:', updateError);
        return false;
      }

      // Refresh pending count
      this.loadPendingCount();

      return true;
    } catch (err) {
      console.error('Error in approveRequest:', err);
      return false;
    }
  }

  /**
   * Reject a change request
   */
  async rejectRequest(requestId: string, adminId: string, reason?: string): Promise<boolean> {
    try {
      const { error } = await this.supabase.client
        .from('booking_change_requests')
        .update({
          status: 'rejected',
          admin_response: reason || 'Request declined by admin',
          reviewed_by: adminId,
          reviewed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', requestId);

      if (error) {
        console.error('Error rejecting request:', error);
        return false;
      }

      // Refresh pending count
      this.loadPendingCount();

      return true;
    } catch (err) {
      console.error('Error in rejectRequest:', err);
      return false;
    }
  }
}
