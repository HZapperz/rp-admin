import { Injectable } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { Observable, from } from 'rxjs';

export interface ClientWithStats {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone?: string;
  avatar_url?: string;
  created_at: string;
  total_bookings: number;
  total_spent: number;
  last_booking_date?: string;
}

@Injectable({
  providedIn: 'root'
})
export class ClientService {
  constructor(private supabase: SupabaseService) {}

  getAllClients(search?: string): Observable<ClientWithStats[]> {
    return from(this.fetchClients(search));
  }

  private async fetchClients(search?: string): Promise<ClientWithStats[]> {
    // Step 1: Get all clients
    let query = this.supabase
      .from('users')
      .select('id, first_name, last_name, email, phone, avatar_url, created_at')
      .eq('role', 'CLIENT')
      .order('created_at', { ascending: false });

    if (search) {
      query = query.or(`first_name.ilike.%${search}%,last_name.ilike.%${search}%,email.ilike.%${search}%`);
    }

    const { data: clients, error } = await query;

    if (error) {
      console.error('Error fetching clients:', error);
      throw error;
    }

    if (!clients || clients.length === 0) {
      return [];
    }

    // Step 2: Batch fetch all bookings for these clients
    const clientIds = clients.map(c => c.id);

    const { data: bookings } = await this.supabase
      .from('bookings')
      .select('client_id, total_amount, scheduled_date, status')
      .in('client_id', clientIds)
      .eq('status', 'completed');

    // Step 3: Create lookup by client_id
    const bookingsByClient: Record<string, any[]> = (bookings || []).reduce((acc, booking) => {
      if (!acc[booking.client_id]) {
        acc[booking.client_id] = [];
      }
      acc[booking.client_id].push(booking);
      return acc;
    }, {} as Record<string, any[]>);

    // Step 4: Combine and calculate stats
    const clientsWithStats: ClientWithStats[] = clients.map(client => {
      const clientBookings = bookingsByClient[client.id] || [];

      const totalBookings = clientBookings.length;
      const totalSpent = clientBookings.reduce((sum, b) => sum + (b.total_amount || 0), 0);
      const lastBookingDate = clientBookings.length > 0
        ? clientBookings.sort((a, b) => new Date(b.scheduled_date).getTime() - new Date(a.scheduled_date).getTime())[0].scheduled_date
        : undefined;

      return {
        ...client,
        total_bookings: totalBookings,
        total_spent: totalSpent,
        last_booking_date: lastBookingDate
      };
    });

    return clientsWithStats;
  }

  async getClientById(id: string): Promise<ClientWithStats | null> {
    // Fetch client
    const { data: client, error } = await this.supabase
      .from('users')
      .select('*')
      .eq('id', id)
      .eq('role', 'CLIENT')
      .single();

    if (error) {
      console.error('Error fetching client:', error);
      return null;
    }

    if (!client) return null;

    // Get booking stats
    const { data: bookings } = await this.supabase
      .from('bookings')
      .select('total_amount, scheduled_date')
      .eq('client_id', id)
      .eq('status', 'completed');

    const totalBookings = bookings?.length || 0;
    const totalSpent = bookings?.reduce((sum, b) => sum + (b.total_amount || 0), 0) || 0;
    const lastBookingDate = bookings && bookings.length > 0
      ? bookings.sort((a, b) => new Date(b.scheduled_date).getTime() - new Date(a.scheduled_date).getTime())[0].scheduled_date
      : undefined;

    return {
      ...client,
      total_bookings: totalBookings,
      total_spent: totalSpent,
      last_booking_date: lastBookingDate
    };
  }

  async getClientBookings(clientId: string) {
    const { data, error } = await this.supabase
      .from('bookings')
      .select('*')
      .eq('client_id', clientId)
      .order('scheduled_date', { ascending: false });

    if (error) {
      console.error('Error fetching client bookings:', error);
      return [];
    }

    return data;
  }

  async blockClient(clientId: string): Promise<boolean> {
    const { error } = await this.supabase
      .from('users')
      .update({
        blocked_at: new Date().toISOString()
      })
      .eq('id', clientId);

    if (error) {
      console.error('Error blocking client:', error);
      return false;
    }

    return true;
  }

  async unblockClient(clientId: string): Promise<boolean> {
    const { error } = await this.supabase
      .from('users')
      .update({
        blocked_at: null
      })
      .eq('id', clientId);

    if (error) {
      console.error('Error unblocking client:', error);
      return false;
    }

    return true;
  }

  async getClientStats(): Promise<{
    total: number;
    active: number;
    blocked: number;
  }> {
    const { data, error } = await this.supabase
      .from('users')
      .select('blocked_at')
      .eq('role', 'CLIENT');

    if (error) {
      console.error('Error fetching client stats:', error);
      return { total: 0, active: 0, blocked: 0 };
    }

    const total = data.length;
    const blocked = data.filter(c => c.blocked_at !== null).length;
    const active = total - blocked;

    return { total, active, blocked };
  }
}
