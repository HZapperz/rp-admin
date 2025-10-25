import { Injectable } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { Observable, from } from 'rxjs';

export interface GroomerWithStats {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone?: string;
  avatar_url?: string;
  created_at: string;
  total_bookings: number;
  completed_bookings: number;
  total_revenue: number;
  average_rating: number;
  completion_rate: number;
}

@Injectable({
  providedIn: 'root'
})
export class GroomerService {
  constructor(private supabase: SupabaseService) {}

  getAllGroomers(search?: string): Observable<GroomerWithStats[]> {
    return from(this.fetchGroomers(search));
  }

  private async fetchGroomers(search?: string): Promise<GroomerWithStats[]> {
    // Step 1: Get all groomers
    let query = this.supabase
      .from('users')
      .select('id, first_name, last_name, email, phone, avatar_url, created_at')
      .eq('role', 'GROOMER')
      .order('created_at', { ascending: false });

    if (search) {
      query = query.or(`first_name.ilike.%${search}%,last_name.ilike.%${search}%,email.ilike.%${search}%`);
    }

    const { data: groomers, error } = await query;

    if (error) {
      console.error('Error fetching groomers:', error);
      throw error;
    }

    if (!groomers || groomers.length === 0) {
      return [];
    }

    // Step 2: Batch fetch all bookings for these groomers
    const groomerIds = groomers.map(g => g.id);

    const { data: bookings } = await this.supabase
      .from('bookings')
      .select('groomer_id, status, total_amount')
      .in('groomer_id', groomerIds);

    // Step 3: Batch fetch all ratings for these groomers
    const { data: ratings } = await this.supabase
      .from('ratings')
      .select('groomer_id, experience_rating, recommendation_rating, quality_rating')
      .in('groomer_id', groomerIds);

    // Step 4: Create lookups by groomer_id
    const bookingsByGroomer: Record<string, any[]> = (bookings || []).reduce((acc, booking) => {
      if (!acc[booking.groomer_id]) {
        acc[booking.groomer_id] = [];
      }
      acc[booking.groomer_id].push(booking);
      return acc;
    }, {} as Record<string, any[]>);

    const ratingsByGroomer: Record<string, any[]> = (ratings || []).reduce((acc, rating) => {
      if (!acc[rating.groomer_id]) {
        acc[rating.groomer_id] = [];
      }
      acc[rating.groomer_id].push(rating);
      return acc;
    }, {} as Record<string, any[]>);

    // Step 5: Combine and calculate stats
    const groomersWithStats: GroomerWithStats[] = groomers.map(groomer => {
      const groomerBookings = bookingsByGroomer[groomer.id] || [];
      const groomerRatings = ratingsByGroomer[groomer.id] || [];

      const totalBookings = groomerBookings.length;
      const completedBookings = groomerBookings.filter(b => b.status === 'completed').length;
      const totalRevenue = groomerBookings
        .filter(b => b.status === 'completed')
        .reduce((sum, b) => sum + (b.total_amount || 0), 0);
      const completionRate = totalBookings > 0 ? (completedBookings / totalBookings) * 100 : 0;

      const averageRating = groomerRatings.length > 0
        ? groomerRatings.reduce((sum, r) => {
            const avg = (r.experience_rating + r.recommendation_rating + r.quality_rating) / 3;
            return sum + avg;
          }, 0) / groomerRatings.length
        : 0;

      return {
        ...groomer,
        total_bookings: totalBookings,
        completed_bookings: completedBookings,
        total_revenue: totalRevenue,
        average_rating: averageRating,
        completion_rate: completionRate
      };
    });

    return groomersWithStats;
  }

  async getGroomerById(id: string): Promise<GroomerWithStats | null> {
    // Fetch groomer
    const { data: groomer, error } = await this.supabase
      .from('users')
      .select('*')
      .eq('id', id)
      .eq('role', 'GROOMER')
      .single();

    if (error) {
      console.error('Error fetching groomer:', error);
      return null;
    }

    if (!groomer) return null;

    // Batch fetch bookings and ratings
    const [bookingsResult, ratingsResult] = await Promise.all([
      this.supabase
        .from('bookings')
        .select('status, total_amount')
        .eq('groomer_id', id),
      this.supabase
        .from('ratings')
        .select('experience_rating, recommendation_rating, quality_rating')
        .eq('groomer_id', id)
    ]);

    const bookings = bookingsResult.data || [];
    const ratings = ratingsResult.data || [];

    const totalBookings = bookings.length;
    const completedBookings = bookings.filter(b => b.status === 'completed').length;
    const totalRevenue = bookings
      .filter(b => b.status === 'completed')
      .reduce((sum, b) => sum + (b.total_amount || 0), 0);
    const completionRate = totalBookings > 0 ? (completedBookings / totalBookings) * 100 : 0;

    const averageRating = ratings.length > 0
      ? ratings.reduce((sum, r) => {
          const avg = (r.experience_rating + r.recommendation_rating + r.quality_rating) / 3;
          return sum + avg;
        }, 0) / ratings.length
      : 0;

    return {
      ...groomer,
      total_bookings: totalBookings,
      completed_bookings: completedBookings,
      total_revenue: totalRevenue,
      average_rating: averageRating,
      completion_rate: completionRate
    };
  }

  async getGroomerBookings(groomerId: string) {
    const { data, error } = await this.supabase
      .from('bookings')
      .select('*')
      .eq('groomer_id', groomerId)
      .order('scheduled_date', { ascending: false });

    if (error) {
      console.error('Error fetching groomer bookings:', error);
      return [];
    }

    return data;
  }

  async getAvailableGroomers(date?: string) {
    // For now, return all groomers
    // TODO: Filter by availability if date is provided
    const { data, error } = await this.supabase
      .from('users')
      .select('id, first_name, last_name, avatar_url')
      .eq('role', 'GROOMER');

    if (error) {
      console.error('Error fetching available groomers:', error);
      return [];
    }

    return data;
  }

  async getGroomerStats(): Promise<{
    total: number;
    active: number;
    averageRating: number;
  }> {
    // Step 1: Get all groomers
    const { data: groomers, error } = await this.supabase
      .from('users')
      .select('id')
      .eq('role', 'GROOMER');

    if (error) {
      console.error('Error fetching groomer stats:', error);
      return { total: 0, active: 0, averageRating: 0 };
    }

    const total = groomers.length;

    // Step 2: Get active groomers (those with bookings in last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const { data: recentBookings } = await this.supabase
      .from('bookings')
      .select('groomer_id')
      .gte('scheduled_date', thirtyDaysAgo.toISOString())
      .not('groomer_id', 'is', null);

    const activeGroomerIds = new Set(recentBookings?.map(b => b.groomer_id) || []);
    const active = activeGroomerIds.size;

    // Step 3: Get average rating across all groomers
    const { data: ratings } = await this.supabase
      .from('ratings')
      .select('experience_rating, recommendation_rating, quality_rating');

    const averageRating = ratings && ratings.length > 0
      ? ratings.reduce((sum, r) => {
          const avg = (r.experience_rating + r.recommendation_rating + r.quality_rating) / 3;
          return sum + avg;
        }, 0) / ratings.length
      : 0;

    return { total, active, averageRating };
  }
}
