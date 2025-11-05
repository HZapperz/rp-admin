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
  commission_rate?: number;
  created_at: string;
  total_bookings: number;
  completed_bookings: number;
  total_revenue: number;
  average_rating: number;
  completion_rate: number;
  // New stats with Stripe fee breakdown
  stats?: {
    totalBookings: number;
    completedBookings: number;
    completionRate: number;
    totalGrossRevenue: number;
    totalStripeFees: number;
    totalNetRevenue: number;
    totalGroomerEarnings: number;
    totalServiceCommission: number;
    totalTips: number;
    averageRating: number | null;
    reviewCount: number;
  };
}

export interface CommissionHistory {
  id: string;
  groomer_id: string;
  old_rate: number;
  new_rate: number;
  changed_by: string;
  notes?: string;
  created_at: string;
  admin?: {
    first_name: string;
    last_name: string;
    email: string;
  };
}

export interface GroomerEarningsDetail {
  groomer: {
    id: string;
    name: string;
    email: string;
    commissionRate: number;
  };
  summary: {
    totalEarnings: number;
    totalServiceCommission: number;
    totalTips: number;
    totalStripeFees: number;
    totalGrossRevenue: number;
    totalNetRevenue: number;
    totalBookings: number;
    pendingPayout: number;
    paidOut: number;
  };
  earnings: any[];
}

@Injectable({
  providedIn: 'root'
})
export class GroomerService {
  constructor(
    private supabase: SupabaseService
  ) {}

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

  // Commission management methods using Supabase directly

  /**
   * Get all groomers with complete stats including commission rates and fees
   */
  getAllGroomersWithCommission(): Observable<GroomerWithStats[]> {
    return from(this.fetchGroomersWithCommission());
  }

  private async fetchGroomersWithCommission(): Promise<GroomerWithStats[]> {
    // Step 1: Get all groomers with commission rates
    const { data: groomers, error } = await this.supabase
      .from('users')
      .select('id, first_name, last_name, email, phone, avatar_url, commission_rate, created_at')
      .eq('role', 'GROOMER')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching groomers:', error);
      throw error;
    }

    if (!groomers || groomers.length === 0) {
      return [];
    }

    const groomerIds = groomers.map(g => g.id);

    // Step 2: Batch fetch all bookings with payment details
    const { data: bookings } = await this.supabase
      .from('bookings')
      .select('groomer_id, status, total_amount, service_fee, processing_fee, payment_status')
      .in('groomer_id', groomerIds);

    // Step 3: Batch fetch all ratings
    const { data: ratings } = await this.supabase
      .from('ratings')
      .select('groomer_id, experience_rating, recommendation_rating, quality_rating')
      .in('groomer_id', groomerIds);

    // Step 4: Group data by groomer
    const bookingsByGroomer: Record<string, any[]> = (bookings || []).reduce((acc, booking) => {
      if (!acc[booking.groomer_id]) acc[booking.groomer_id] = [];
      acc[booking.groomer_id].push(booking);
      return acc;
    }, {} as Record<string, any[]>);

    const ratingsByGroomer: Record<string, any[]> = (ratings || []).reduce((acc, rating) => {
      if (!acc[rating.groomer_id]) acc[rating.groomer_id] = [];
      acc[rating.groomer_id].push(rating);
      return acc;
    }, {} as Record<string, any[]>);

    // Step 5: Calculate stats with commission breakdown
    return groomers.map(groomer => {
      const groomerBookings = bookingsByGroomer[groomer.id] || [];
      const groomerRatings = ratingsByGroomer[groomer.id] || [];

      const completedBookings = groomerBookings.filter(b => b.status === 'completed');
      const totalBookings = groomerBookings.length;
      const completedCount = completedBookings.length;
      const completionRate = totalBookings > 0 ? (completedCount / totalBookings) * 100 : 0;

      // Calculate financial metrics
      const totalGrossRevenue = completedBookings.reduce((sum, b) => sum + (b.total_amount || 0), 0);
      const totalStripeFees = completedBookings.reduce((sum, b) => sum + (b.processing_fee || 0), 0);
      const totalServiceCommission = completedBookings.reduce((sum, b) => sum + (b.service_fee || 0), 0);
      const totalNetRevenue = totalGrossRevenue - totalStripeFees;

      // Calculate groomer earnings (net revenue - service commission)
      const commissionRate = groomer.commission_rate || 0.70; // Default 70% to groomer
      const totalGroomerEarnings = totalNetRevenue * commissionRate;

      // Calculate ratings
      const averageRating = groomerRatings.length > 0
        ? groomerRatings.reduce((sum, r) => {
            return sum + ((r.experience_rating + r.recommendation_rating + r.quality_rating) / 3);
          }, 0) / groomerRatings.length
        : 0;

      return {
        ...groomer,
        total_bookings: totalBookings,
        completed_bookings: completedCount,
        total_revenue: totalGrossRevenue,
        average_rating: averageRating,
        completion_rate: completionRate,
        stats: {
          totalBookings,
          completedBookings: completedCount,
          completionRate,
          totalGrossRevenue,
          totalStripeFees,
          totalNetRevenue,
          totalGroomerEarnings,
          totalServiceCommission,
          totalTips: 0, // TODO: Add tips support if tips table exists
          averageRating: averageRating > 0 ? averageRating : null,
          reviewCount: groomerRatings.length
        }
      };
    });
  }

  /**
   * Get detailed earnings for a specific groomer
   */
  getGroomerEarnings(groomerId: string): Observable<GroomerEarningsDetail> {
    return from(this.fetchGroomerEarnings(groomerId));
  }

  private async fetchGroomerEarnings(groomerId: string): Promise<GroomerEarningsDetail> {
    // Fetch groomer details
    const { data: groomer, error: groomerError } = await this.supabase
      .from('users')
      .select('id, first_name, last_name, email, commission_rate')
      .eq('id', groomerId)
      .eq('role', 'GROOMER')
      .single();

    if (groomerError || !groomer) {
      throw new Error('Groomer not found');
    }

    // Fetch all completed bookings with payment details
    const { data: bookings, error: bookingsError } = await this.supabase
      .from('bookings')
      .select('id, total_amount, service_fee, processing_fee, scheduled_date, payment_status, status')
      .eq('groomer_id', groomerId)
      .eq('status', 'completed');

    if (bookingsError) {
      throw bookingsError;
    }

    const completedBookings = bookings || [];
    const commissionRate = groomer.commission_rate || 0.70;

    // Calculate totals
    const totalGrossRevenue = completedBookings.reduce((sum, b) => sum + (b.total_amount || 0), 0);
    const totalStripeFees = completedBookings.reduce((sum, b) => sum + (b.processing_fee || 0), 0);
    const totalServiceCommission = completedBookings.reduce((sum, b) => sum + (b.service_fee || 0), 0);
    const totalNetRevenue = totalGrossRevenue - totalStripeFees;
    const totalEarnings = totalNetRevenue * commissionRate;

    return {
      groomer: {
        id: groomer.id,
        name: `${groomer.first_name} ${groomer.last_name}`,
        email: groomer.email,
        commissionRate
      },
      summary: {
        totalEarnings,
        totalServiceCommission,
        totalTips: 0, // TODO: Add tips support
        totalStripeFees,
        totalGrossRevenue,
        totalNetRevenue,
        totalBookings: completedBookings.length,
        pendingPayout: totalEarnings, // TODO: Implement payout tracking
        paidOut: 0 // TODO: Implement payout tracking
      },
      earnings: completedBookings.map(b => ({
        bookingId: b.id,
        date: b.scheduled_date,
        grossAmount: b.total_amount,
        stripeFee: b.processing_fee,
        netAmount: (b.total_amount || 0) - (b.processing_fee || 0),
        groomerEarning: ((b.total_amount || 0) - (b.processing_fee || 0)) * commissionRate,
        serviceCommission: b.service_fee
      }))
    };
  }

  /**
   * Update groomer's commission rate
   */
  updateGroomerCommission(groomerId: string, commissionRate: number, notes?: string): Observable<any> {
    return from(this.updateCommission(groomerId, commissionRate, notes));
  }

  private async updateCommission(groomerId: string, commissionRate: number, notes?: string): Promise<any> {
    console.log('Starting commission update:', { groomerId, commissionRate, notes });

    try {
      // Get old rate BEFORE updating
      const { data: groomer, error: fetchError } = await this.supabase
        .from('users')
        .select('commission_rate')
        .eq('id', groomerId)
        .single();

      if (fetchError) {
        console.error('Error fetching current commission rate:', fetchError);
        throw new Error(`Failed to fetch current rate: ${fetchError.message}`);
      }

      const oldRate = groomer?.commission_rate || 0;
      console.log('Current commission rate:', oldRate);

      // Update commission rate in users table
      const { data: updateData, error: updateError } = await this.supabase
        .from('users')
        .update({ commission_rate: commissionRate })
        .eq('id', groomerId)
        .select();

      if (updateError) {
        console.error('Commission rate update failed:', updateError);
        console.error('Update error details:', JSON.stringify(updateError, null, 2));

        // Provide helpful error messages
        if (updateError.message?.includes('permission') || updateError.message?.includes('policy')) {
          throw new Error('Permission denied. Admin user may lack UPDATE permissions on users table. Check RLS policies.');
        } else if (updateError.message?.includes('lock') || updateError.message?.includes('LockManager')) {
          throw new Error('Auth session lock conflict. Please close other admin tabs and try again.');
        } else {
          throw new Error(`Database update failed: ${updateError.message}`);
        }
      }

      console.log('Commission rate updated successfully:', updateData);

      // Try to log history if commission_history table exists
      try {
        // Get current user ID from auth
        const { data: { user }, error: authError } = await this.supabase.auth.getUser();

        if (authError) {
          console.warn('Failed to get current user for history logging:', authError);
        }

        const changedBy = user?.id || 'admin';
        console.log('Logging to commission_history:', { groomer_id: groomerId, old_rate: oldRate, new_rate: commissionRate, changed_by: changedBy });

        // Attempt to insert into commission_history table
        const { error: historyError } = await this.supabase
          .from('commission_history')
          .insert({
            groomer_id: groomerId,
            old_rate: oldRate,
            new_rate: commissionRate,
            notes,
            changed_by: changedBy
          });

        if (historyError) {
          console.warn('Commission history logging failed:', historyError);
        } else {
          console.log('Commission history logged successfully');
        }
      } catch (historyError) {
        // Silently fail if commission_history table doesn't exist
        console.warn('Commission history logging exception:', historyError);
      }

      return { success: true, message: 'Commission rate updated successfully' };
    } catch (error: any) {
      console.error('Commission update failed with exception:', error);
      throw error;
    }
  }

  /**
   * Get commission rate change history for a groomer
   */
  getCommissionHistory(groomerId: string): Observable<{ groomer: any; history: CommissionHistory[] }> {
    return from(this.fetchCommissionHistory(groomerId));
  }

  private async fetchCommissionHistory(groomerId: string): Promise<{ groomer: any; history: CommissionHistory[] }> {
    // Fetch groomer details
    const { data: groomer, error: groomerError } = await this.supabase
      .from('users')
      .select('id, first_name, last_name, email, commission_rate')
      .eq('id', groomerId)
      .single();

    if (groomerError || !groomer) {
      throw new Error('Groomer not found');
    }

    // Try to fetch commission history
    try {
      const { data: history, error: historyError } = await this.supabase
        .from('commission_history')
        .select('id, groomer_id, old_rate, new_rate, changed_by, notes, created_at')
        .eq('groomer_id', groomerId)
        .order('created_at', { ascending: false });

      if (historyError) {
        throw historyError;
      }

      // Fetch admin details for each history entry if needed
      const historyWithAdmin: CommissionHistory[] = (history || []).map((h: any) => ({
        id: h.id,
        groomer_id: h.groomer_id,
        old_rate: h.old_rate,
        new_rate: h.new_rate,
        changed_by: h.changed_by,
        notes: h.notes,
        created_at: h.created_at
        // Admin details can be fetched separately if needed
      }));

      return {
        groomer,
        history: historyWithAdmin
      };
    } catch (error) {
      // Return empty history if table doesn't exist
      console.warn('Commission history table may not exist:', error);
      return {
        groomer,
        history: []
      };
    }
  }

  /**
   * Format commission rate as percentage string
   */
  formatCommissionRate(rate: number): string {
    return `${Math.round(rate * 100)}%`;
  }

  /**
   * Format currency
   */
  formatCurrency(amount: number): string {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount);
  }
}
