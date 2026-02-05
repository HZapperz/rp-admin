import { Injectable } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { Observable, from } from 'rxjs';
import { RebookingWithDetails, RebookingStatus } from '../models/types';

@Injectable({
  providedIn: 'root'
})
export class RebookingService {
  constructor(private supabase: SupabaseService) {}

  getAllRebookings(statusFilter?: RebookingStatus): Observable<RebookingWithDetails[]> {
    return from(this.fetchRebookings(statusFilter));
  }

  private async fetchRebookings(statusFilter?: RebookingStatus): Promise<RebookingWithDetails[]> {
    let query = this.supabase
      .from('rebookings')
      .select('*')
      .order('created_at', { ascending: false });

    if (statusFilter) {
      query = query.eq('status', statusFilter);
    }

    const { data: rebookings, error } = await query;

    if (error) {
      console.error('Error fetching rebookings:', error);
      throw error;
    }

    if (!rebookings || rebookings.length === 0) {
      return [];
    }

    // Get unique IDs
    const clientIds = [...new Set(rebookings.map(r => r.client_id).filter(Boolean))];
    const groomerIds = [...new Set(rebookings.map(r => r.groomer_id).filter(Boolean))];
    const bookingIds = [...new Set(rebookings.map(r => r.booking_id).filter(Boolean))];

    // Batch fetch related data
    const [clientsResult, groomersResult, bookingsResult] = await Promise.all([
      clientIds.length > 0
        ? this.supabase
            .from('users')
            .select('id, first_name, last_name, phone, email')
            .in('id', clientIds)
        : Promise.resolve({ data: [], error: null }),
      groomerIds.length > 0
        ? this.supabase
            .from('users')
            .select('id, first_name, last_name')
            .in('id', groomerIds)
        : Promise.resolve({ data: [], error: null }),
      bookingIds.length > 0
        ? this.supabase
            .from('bookings')
            .select('id, scheduled_date')
            .in('id', bookingIds)
        : Promise.resolve({ data: [], error: null })
    ]);

    // Fetch booking pets for pet names
    const bookingPetsResult = await this.supabase
      .from('booking_pets')
      .select('booking_id, pet:pets(name)')
      .in('booking_id', bookingIds);

    // Create lookups
    const clientsLookup: Record<string, any> = (clientsResult.data || []).reduce((acc, c) => {
      acc[c.id] = c;
      return acc;
    }, {} as Record<string, any>);

    const groomersLookup: Record<string, any> = (groomersResult.data || []).reduce((acc, g) => {
      acc[g.id] = g;
      return acc;
    }, {} as Record<string, any>);

    const bookingsLookup: Record<string, any> = (bookingsResult.data || []).reduce((acc, b) => {
      acc[b.id] = b;
      return acc;
    }, {} as Record<string, any>);

    const petsByBookingId: Record<string, any[]> = (bookingPetsResult.data || []).reduce((acc, bp: any) => {
      if (!acc[bp.booking_id]) {
        acc[bp.booking_id] = [];
      }
      const pet = bp.pet as { name: string } | null;
      if (pet?.name) {
        acc[bp.booking_id].push({ name: pet.name });
      }
      return acc;
    }, {} as Record<string, any[]>);

    // Combine data
    const rebookingsWithDetails: RebookingWithDetails[] = rebookings.map(rebooking => ({
      ...rebooking,
      client: clientsLookup[rebooking.client_id],
      groomer: groomersLookup[rebooking.groomer_id],
      booking: bookingsLookup[rebooking.booking_id],
      pets: petsByBookingId[rebooking.booking_id] || []
    }));

    // Sort: pending first, then by date
    rebookingsWithDetails.sort((a, b) => {
      const statusPriority: Record<string, number> = {
        pending: 0,
        contacted: 1,
        no_answer: 2,
        booked: 3,
        declined: 4
      };

      const aPriority = statusPriority[a.status] ?? 5;
      const bPriority = statusPriority[b.status] ?? 5;

      if (aPriority !== bPriority) {
        return aPriority - bPriority;
      }

      const aDate = a.type === 'schedule' ? a.preferred_date : a.callback_date;
      const bDate = b.type === 'schedule' ? b.preferred_date : b.callback_date;

      if (aDate && bDate) {
        return new Date(aDate).getTime() - new Date(bDate).getTime();
      }

      return 0;
    });

    return rebookingsWithDetails;
  }

  async updateRebookingStatus(
    id: string,
    status: RebookingStatus,
    adminNotes?: string
  ): Promise<boolean> {
    const updateData: Record<string, any> = { status };

    if (status === 'contacted') {
      updateData['contacted_at'] = new Date().toISOString();
    }

    if (adminNotes !== undefined) {
      updateData['admin_notes'] = adminNotes;
    }

    const { error } = await this.supabase
      .from('rebookings')
      .update(updateData)
      .eq('id', id);

    if (error) {
      console.error('Error updating rebooking:', error);
      return false;
    }

    return true;
  }

  async saveAdminNotes(id: string, adminNotes: string): Promise<boolean> {
    const { error } = await this.supabase
      .from('rebookings')
      .update({ admin_notes: adminNotes })
      .eq('id', id);

    if (error) {
      console.error('Error saving admin notes:', error);
      return false;
    }

    return true;
  }
}
