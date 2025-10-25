import { Injectable } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { KPIData, RevenueData, GroomerPerformance } from '../models/types';

@Injectable({
  providedIn: 'root'
})
export class AnalyticsService {
  constructor(private supabase: SupabaseService) {}

  async getDashboardKPIs(): Promise<KPIData> {
    const today = new Date();
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);

    // Get bookings for current month
    const { data: bookings } = await this.supabase
      .from('bookings')
      .select('status, total_amount, groomer_id')
      .gte('scheduled_date', startOfMonth.toISOString())
      .lte('scheduled_date', endOfMonth.toISOString());

    const totalBookings = bookings?.length || 0;
    const completedBookings = bookings?.filter(b => b.status === 'completed') || [];
    const totalRevenue = completedBookings.reduce((sum, b) => sum + (b.total_amount || 0), 0);

    // Get active groomers (those with bookings this month)
    const groomerIds = new Set(bookings?.filter(b => b.groomer_id).map(b => b.groomer_id) || []);
    const activeGroomers = groomerIds.size;

    // Get average rating (average of all three rating types)
    const { data: ratings } = await this.supabase
      .from('ratings')
      .select('experience_rating, recommendation_rating, quality_rating')
      .gte('created_at', startOfMonth.toISOString());

    const averageRating = ratings && ratings.length > 0
      ? ratings.reduce((sum, r) => {
          const avg = (r.experience_rating + r.recommendation_rating + r.quality_rating) / 3;
          return sum + avg;
        }, 0) / ratings.length
      : 0;

    // Calculate completion rate
    const completionRate = totalBookings > 0
      ? (completedBookings.length / totalBookings) * 100
      : 0;

    return {
      totalBookings,
      totalRevenue,
      activeGroomers,
      averageRating,
      completionRate,
      period: {
        start: startOfMonth.toISOString(),
        end: endOfMonth.toISOString()
      }
    };
  }

  async getRevenueData(days: number = 30): Promise<RevenueData[]> {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const { data: bookings } = await this.supabase
      .from('bookings')
      .select('scheduled_date, total_amount, status')
      .eq('status', 'completed')
      .gte('scheduled_date', startDate.toISOString())
      .lte('scheduled_date', endDate.toISOString())
      .order('scheduled_date');

    if (!bookings) return [];

    // Group by date
    const revenueByDate = new Map<string, { revenue: number; bookings: number }>();

    bookings.forEach(booking => {
      const date = booking.scheduled_date.split('T')[0];
      const existing = revenueByDate.get(date) || { revenue: 0, bookings: 0 };
      revenueByDate.set(date, {
        revenue: existing.revenue + (booking.total_amount || 0),
        bookings: existing.bookings + 1
      });
    });

    return Array.from(revenueByDate.entries()).map(([date, data]) => ({
      date,
      revenue: data.revenue,
      bookings: data.bookings
    }));
  }

  async getGroomerPerformance(): Promise<GroomerPerformance[]> {
    // Step 1: Get all groomers
    const { data: groomers } = await this.supabase
      .from('users')
      .select('id, first_name, last_name')
      .eq('role', 'GROOMER');

    if (!groomers || groomers.length === 0) return [];

    const groomerIds = groomers.map(g => g.id);

    // Step 2: Batch fetch all bookings for these groomers
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

    // Step 5: Calculate performance for each groomer
    const performance = groomers.map(groomer => {
      const groomerBookings = bookingsByGroomer[groomer.id] || [];
      const groomerRatings = ratingsByGroomer[groomer.id] || [];

      const totalBookings = groomerBookings.length;
      const completedBookings = groomerBookings.filter(b => b.status === 'completed');
      const totalRevenue = completedBookings.reduce((sum, b) => sum + (b.total_amount || 0), 0);
      const completionRate = totalBookings > 0 ? (completedBookings.length / totalBookings) * 100 : 0;

      const averageRating = groomerRatings.length > 0
        ? groomerRatings.reduce((sum, r) => {
            const avg = (r.experience_rating + r.recommendation_rating + r.quality_rating) / 3;
            return sum + avg;
          }, 0) / groomerRatings.length
        : 0;

      return {
        groomer_id: groomer.id,
        groomer_name: `${groomer.first_name} ${groomer.last_name}`,
        total_bookings: totalBookings,
        total_revenue: totalRevenue,
        average_rating: averageRating,
        completion_rate: completionRate
      };
    });

    return performance.sort((a, b) => b.total_revenue - a.total_revenue);
  }

  async getBookingTrends(months: number = 6): Promise<{ month: string; bookings: number }[]> {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() - months);

    const { data: bookings } = await this.supabase
      .from('bookings')
      .select('scheduled_date')
      .gte('scheduled_date', startDate.toISOString())
      .lte('scheduled_date', endDate.toISOString());

    if (!bookings) return [];

    // Group by month
    const bookingsByMonth = new Map<string, number>();

    bookings.forEach(booking => {
      const date = new Date(booking.scheduled_date);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      bookingsByMonth.set(monthKey, (bookingsByMonth.get(monthKey) || 0) + 1);
    });

    return Array.from(bookingsByMonth.entries())
      .map(([month, bookings]) => ({ month, bookings }))
      .sort((a, b) => a.month.localeCompare(b.month));
  }
}
