import { Injectable } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { Observable, from } from 'rxjs';
import {
  GroomerPayout,
  GroomDetail,
  PayPeriodData,
  WeekData,
  AvailablePayrollMonth,
  GroomDetailPet
} from '../models/types';

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

  // ==========================================
  // PAYROLL METHODS
  // ==========================================

  /**
   * Get available months with payroll data for a groomer
   */
  getAvailablePayrollMonths(groomerId: string): Observable<AvailablePayrollMonth[]> {
    return from(this.fetchAvailablePayrollMonths(groomerId));
  }

  private async fetchAvailablePayrollMonths(groomerId: string): Promise<AvailablePayrollMonth[]> {
    const { data: bookings, error } = await this.supabase
      .from('bookings')
      .select('scheduled_date')
      .eq('groomer_id', groomerId)
      .eq('status', 'completed')
      .order('scheduled_date', { ascending: false });

    if (error) {
      console.error('Error fetching payroll months:', error);
      throw error;
    }

    if (!bookings || bookings.length === 0) {
      return [];
    }

    // Group by year-month
    const monthMap = new Map<string, { year: number; month: number; count: number }>();

    bookings.forEach(booking => {
      const date = new Date(booking.scheduled_date);
      const year = date.getFullYear();
      const month = date.getMonth();
      const key = `${year}-${month}`;

      if (!monthMap.has(key)) {
        monthMap.set(key, { year, month, count: 0 });
      }
      monthMap.get(key)!.count++;
    });

    // Convert to array and format labels
    const months: AvailablePayrollMonth[] = Array.from(monthMap.values()).map(m => ({
      year: m.year,
      month: m.month,
      label: new Date(m.year, m.month).toLocaleDateString('en-US', { year: 'numeric', month: 'long' }),
      booking_count: m.count
    }));

    return months.sort((a, b) => {
      if (a.year !== b.year) return b.year - a.year;
      return b.month - a.month;
    });
  }

  /**
   * Get monthly payroll data for a groomer
   */
  getGroomerMonthlyPayroll(groomerId: string, year: number, month: number): Observable<PayPeriodData> {
    return from(this.fetchGroomerMonthlyPayroll(groomerId, year, month));
  }

  private async fetchGroomerMonthlyPayroll(groomerId: string, year: number, month: number): Promise<PayPeriodData> {
    // Calculate period start and end
    const periodStart = new Date(year, month, 1);
    const periodEnd = new Date(year, month + 1, 0); // Last day of month

    const startStr = periodStart.toISOString().split('T')[0];
    const endStr = periodEnd.toISOString().split('T')[0];

    // Get groomer's commission rate
    const { data: groomer } = await this.supabase
      .from('users')
      .select('commission_rate')
      .eq('id', groomerId)
      .single();

    const commissionRate = groomer?.commission_rate || 0.35;

    // Fetch all completed bookings for this period
    const { data: bookings, error: bookingsError } = await this.supabase
      .from('bookings')
      .select(`
        id,
        scheduled_date,
        client_id,
        total_amount,
        tax_amount,
        tip_amount,
        payment_status
      `)
      .eq('groomer_id', groomerId)
      .eq('status', 'completed')
      .gte('scheduled_date', startStr)
      .lte('scheduled_date', endStr)
      .order('scheduled_date', { ascending: false });

    if (bookingsError) {
      console.error('Error fetching bookings:', bookingsError);
      throw bookingsError;
    }

    if (!bookings || bookings.length === 0) {
      return this.createEmptyPayPeriodData(startStr, endStr, year, month);
    }

    // Batch fetch clients, booking_pets, pets, and addons
    const bookingIds = bookings.map(b => b.id);
    const clientIds = [...new Set(bookings.map(b => b.client_id).filter(Boolean))];

    const [clientsResult, bookingPetsResult] = await Promise.all([
      this.supabase
        .from('users')
        .select('id, first_name, last_name')
        .in('id', clientIds),
      this.supabase
        .from('booking_pets')
        .select('id, booking_id, pet_id, package_type, total_price')
        .in('booking_id', bookingIds)
    ]);

    const clients = clientsResult.data || [];
    const bookingPets = bookingPetsResult.data || [];

    // Fetch pet details
    const petIds = [...new Set(bookingPets.map(bp => bp.pet_id).filter(Boolean))];
    const { data: pets } = await this.supabase
      .from('pets')
      .select('id, name, breed')
      .in('id', petIds.length > 0 ? petIds : ['00000000-0000-0000-0000-000000000000']);

    // Fetch addons
    const bookingPetIds = bookingPets.map(bp => bp.id);
    const { data: addons } = await this.supabase
      .from('booking_addons')
      .select('booking_pet_id, addon_name, addon_price')
      .in('booking_pet_id', bookingPetIds.length > 0 ? bookingPetIds : ['00000000-0000-0000-0000-000000000000']);

    // Create lookup maps
    const clientMap = new Map(clients.map(c => [c.id, c]));
    const petMap = new Map((pets || []).map(p => [p.id, p]));
    const addonsByBookingPetId = (addons || []).reduce((acc, addon) => {
      if (!acc[addon.booking_pet_id]) acc[addon.booking_pet_id] = [];
      acc[addon.booking_pet_id].push({ addon_name: addon.addon_name, addon_price: addon.addon_price });
      return acc;
    }, {} as Record<string, Array<{ addon_name: string; addon_price: number }>>);

    const bookingPetsByBookingId = bookingPets.reduce((acc, bp) => {
      if (!acc[bp.booking_id]) acc[bp.booking_id] = [];
      acc[bp.booking_id].push(bp);
      return acc;
    }, {} as Record<string, typeof bookingPets>);

    // Check for existing payout record
    const { data: existingPayout } = await this.supabase
      .from('groomer_payouts')
      .select('*')
      .eq('groomer_id', groomerId)
      .eq('period_start', startStr)
      .eq('period_end', endStr)
      .single();

    // Build groom details
    const grooms: GroomDetail[] = bookings.map(booking => {
      const client = clientMap.get(booking.client_id);
      const bpets = bookingPetsByBookingId[booking.id] || [];

      const petDetails: GroomDetailPet[] = bpets.map(bp => {
        const pet = petMap.get(bp.pet_id);
        return {
          pet_id: bp.pet_id,
          pet_name: pet?.name || 'Unknown Pet',
          breed: pet?.breed,
          package_type: bp.package_type,
          total_price: bp.total_price || 0,
          addons: addonsByBookingPetId[bp.id] || []
        };
      });

      const totalAmount = booking.total_amount || 0;
      const taxAmount = booking.tax_amount || 0;
      const preTaxAmount = totalAmount - taxAmount;
      const tipAmount = booking.tip_amount || 0;
      const groomerCut = (preTaxAmount * commissionRate) + tipAmount;

      return {
        booking_id: booking.id,
        scheduled_date: booking.scheduled_date,
        client: {
          id: booking.client_id,
          first_name: client?.first_name || 'Unknown',
          last_name: client?.last_name || ''
        },
        pets: petDetails,
        total_amount: totalAmount,
        tax_amount: taxAmount,
        pre_tax_amount: preTaxAmount,
        tip_amount: tipAmount,
        commission_rate: commissionRate,
        groomer_cut: groomerCut,
        payment_status: booking.payment_status || 'unknown'
      };
    });

    // Group grooms by week
    const weeks = this.groupGroomsByWeek(grooms, commissionRate);

    // Calculate period totals
    const totals = {
      total_amount: grooms.reduce((sum, g) => sum + g.total_amount, 0),
      tax_amount: grooms.reduce((sum, g) => sum + g.tax_amount, 0),
      pre_tax_total: grooms.reduce((sum, g) => sum + g.pre_tax_amount, 0),
      tips: grooms.reduce((sum, g) => sum + g.tip_amount, 0),
      commission_earnings: grooms.reduce((sum, g) => sum + (g.pre_tax_amount * commissionRate), 0),
      total_payout: grooms.reduce((sum, g) => sum + g.groomer_cut, 0),
      booking_count: grooms.length
    };

    return {
      period_start: startStr,
      period_end: endStr,
      period_label: new Date(year, month).toLocaleDateString('en-US', { year: 'numeric', month: 'long' }),
      totals,
      payout: existingPayout || undefined,
      weeks
    };
  }

  /**
   * Get payroll data for a custom date range
   */
  getGroomerPayrollByDateRange(groomerId: string, startDate: string, endDate: string): Observable<PayPeriodData> {
    return from(this.fetchGroomerPayrollByDateRange(groomerId, startDate, endDate));
  }

  private async fetchGroomerPayrollByDateRange(groomerId: string, startDate: string, endDate: string): Promise<PayPeriodData> {
    // Get groomer's commission rate
    const { data: groomer } = await this.supabase
      .from('users')
      .select('commission_rate')
      .eq('id', groomerId)
      .single();

    const commissionRate = groomer?.commission_rate || 0.35;

    // Fetch all completed bookings for this period
    const { data: bookings, error: bookingsError } = await this.supabase
      .from('bookings')
      .select(`
        id,
        scheduled_date,
        client_id,
        total_amount,
        tax_amount,
        tip_amount,
        payment_status
      `)
      .eq('groomer_id', groomerId)
      .eq('status', 'completed')
      .gte('scheduled_date', startDate)
      .lte('scheduled_date', endDate)
      .order('scheduled_date', { ascending: false });

    if (bookingsError) {
      console.error('Error fetching bookings:', bookingsError);
      throw bookingsError;
    }

    if (!bookings || bookings.length === 0) {
      return this.createEmptyPayPeriodDataForRange(startDate, endDate);
    }

    // Batch fetch clients, booking_pets, pets, and addons
    const bookingIds = bookings.map(b => b.id);
    const clientIds = [...new Set(bookings.map(b => b.client_id).filter(Boolean))];

    const [clientsResult, bookingPetsResult] = await Promise.all([
      this.supabase
        .from('users')
        .select('id, first_name, last_name')
        .in('id', clientIds),
      this.supabase
        .from('booking_pets')
        .select('id, booking_id, pet_id, package_type, total_price')
        .in('booking_id', bookingIds)
    ]);

    const clients = clientsResult.data || [];
    const bookingPets = bookingPetsResult.data || [];

    // Fetch pet details
    const petIds = [...new Set(bookingPets.map(bp => bp.pet_id).filter(Boolean))];
    const { data: pets } = await this.supabase
      .from('pets')
      .select('id, name, breed')
      .in('id', petIds.length > 0 ? petIds : ['00000000-0000-0000-0000-000000000000']);

    // Fetch addons
    const bookingPetIds = bookingPets.map(bp => bp.id);
    const { data: addons } = await this.supabase
      .from('booking_addons')
      .select('booking_pet_id, addon_name, addon_price')
      .in('booking_pet_id', bookingPetIds.length > 0 ? bookingPetIds : ['00000000-0000-0000-0000-000000000000']);

    // Create lookup maps
    const clientMap = new Map(clients.map(c => [c.id, c]));
    const petMap = new Map((pets || []).map(p => [p.id, p]));
    const addonsByBookingPetId = (addons || []).reduce((acc, addon) => {
      if (!acc[addon.booking_pet_id]) acc[addon.booking_pet_id] = [];
      acc[addon.booking_pet_id].push({ addon_name: addon.addon_name, addon_price: addon.addon_price });
      return acc;
    }, {} as Record<string, Array<{ addon_name: string; addon_price: number }>>);

    const bookingPetsByBookingId = bookingPets.reduce((acc, bp) => {
      if (!acc[bp.booking_id]) acc[bp.booking_id] = [];
      acc[bp.booking_id].push(bp);
      return acc;
    }, {} as Record<string, typeof bookingPets>);

    // Build groom details
    const grooms: GroomDetail[] = bookings.map(booking => {
      const client = clientMap.get(booking.client_id);
      const bpets = bookingPetsByBookingId[booking.id] || [];

      const petDetails: GroomDetailPet[] = bpets.map(bp => {
        const pet = petMap.get(bp.pet_id);
        return {
          pet_id: bp.pet_id,
          pet_name: pet?.name || 'Unknown Pet',
          breed: pet?.breed,
          package_type: bp.package_type,
          total_price: bp.total_price || 0,
          addons: addonsByBookingPetId[bp.id] || []
        };
      });

      const totalAmount = booking.total_amount || 0;
      const taxAmount = booking.tax_amount || 0;
      const preTaxAmount = totalAmount - taxAmount;
      const tipAmount = booking.tip_amount || 0;
      const groomerCut = (preTaxAmount * commissionRate) + tipAmount;

      return {
        booking_id: booking.id,
        scheduled_date: booking.scheduled_date,
        client: {
          id: booking.client_id,
          first_name: client?.first_name || 'Unknown',
          last_name: client?.last_name || ''
        },
        pets: petDetails,
        total_amount: totalAmount,
        tax_amount: taxAmount,
        pre_tax_amount: preTaxAmount,
        tip_amount: tipAmount,
        commission_rate: commissionRate,
        groomer_cut: groomerCut,
        payment_status: booking.payment_status || 'unknown'
      };
    });

    // Group grooms by week
    const weeks = this.groupGroomsByWeek(grooms, commissionRate);

    // Calculate period totals
    const totals = {
      total_amount: grooms.reduce((sum, g) => sum + g.total_amount, 0),
      tax_amount: grooms.reduce((sum, g) => sum + g.tax_amount, 0),
      pre_tax_total: grooms.reduce((sum, g) => sum + g.pre_tax_amount, 0),
      tips: grooms.reduce((sum, g) => sum + g.tip_amount, 0),
      commission_earnings: grooms.reduce((sum, g) => sum + (g.pre_tax_amount * commissionRate), 0),
      total_payout: grooms.reduce((sum, g) => sum + g.groomer_cut, 0),
      booking_count: grooms.length
    };

    // Format period label for custom range
    const startDateObj = new Date(startDate + 'T00:00:00');
    const endDateObj = new Date(endDate + 'T00:00:00');
    const periodLabel = `${startDateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${endDateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;

    return {
      period_start: startDate,
      period_end: endDate,
      period_label: periodLabel,
      totals,
      payout: undefined, // Custom ranges don't have payout records
      weeks
    };
  }

  private createEmptyPayPeriodDataForRange(startDate: string, endDate: string): PayPeriodData {
    const startDateObj = new Date(startDate + 'T00:00:00');
    const endDateObj = new Date(endDate + 'T00:00:00');
    const periodLabel = `${startDateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${endDateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;

    return {
      period_start: startDate,
      period_end: endDate,
      period_label: periodLabel,
      totals: {
        total_amount: 0,
        tax_amount: 0,
        pre_tax_total: 0,
        tips: 0,
        commission_earnings: 0,
        total_payout: 0,
        booking_count: 0
      },
      payout: undefined,
      weeks: []
    };
  }

  private groupGroomsByWeek(grooms: GroomDetail[], commissionRate: number): WeekData[] {
    const weekMap = new Map<string, { start: Date; end: Date; grooms: GroomDetail[] }>();

    grooms.forEach(groom => {
      const date = new Date(groom.scheduled_date);
      const weekStart = this.getWeekStart(date);
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekEnd.getDate() + 6);

      const key = weekStart.toISOString().split('T')[0];

      if (!weekMap.has(key)) {
        weekMap.set(key, { start: weekStart, end: weekEnd, grooms: [] });
      }
      weekMap.get(key)!.grooms.push(groom);
    });

    const weeks: WeekData[] = Array.from(weekMap.entries()).map(([_, data]) => {
      const weekGrooms = data.grooms;
      const commissionEarnings = weekGrooms.reduce((sum, g) => sum + (g.pre_tax_amount * commissionRate), 0);
      return {
        week_start: data.start.toISOString().split('T')[0],
        week_end: data.end.toISOString().split('T')[0],
        week_label: this.formatWeekLabel(data.start, data.end),
        totals: {
          pre_tax_total: weekGrooms.reduce((sum, g) => sum + g.pre_tax_amount, 0),
          tips: weekGrooms.reduce((sum, g) => sum + g.tip_amount, 0),
          total_payout: weekGrooms.reduce((sum, g) => sum + g.groomer_cut, 0),
          booking_count: weekGrooms.length,
          commission_earnings: commissionEarnings,
          hourly_pay: 0,           // Placeholder for future feature
          misc_adjustments: 0      // Placeholder for future feature
        },
        grooms: weekGrooms.sort((a, b) => new Date(b.scheduled_date).getTime() - new Date(a.scheduled_date).getTime()),
        is_expanded: false
      };
    });

    return weeks.sort((a, b) => new Date(b.week_start).getTime() - new Date(a.week_start).getTime());
  }

  private getWeekStart(date: Date): Date {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day;
    d.setDate(diff);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  private formatWeekLabel(start: Date, end: Date): string {
    const startMonth = start.toLocaleDateString('en-US', { month: 'short' });
    const endMonth = end.toLocaleDateString('en-US', { month: 'short' });
    const startDay = start.getDate();
    const endDay = end.getDate();

    if (startMonth === endMonth) {
      return `Week of ${startMonth} ${startDay}-${endDay}`;
    }
    return `Week of ${startMonth} ${startDay} - ${endMonth} ${endDay}`;
  }

  private createEmptyPayPeriodData(startStr: string, endStr: string, year: number, month: number): PayPeriodData {
    return {
      period_start: startStr,
      period_end: endStr,
      period_label: new Date(year, month).toLocaleDateString('en-US', { year: 'numeric', month: 'long' }),
      totals: {
        total_amount: 0,
        tax_amount: 0,
        pre_tax_total: 0,
        tips: 0,
        commission_earnings: 0,
        total_payout: 0,
        booking_count: 0
      },
      payout: undefined,
      weeks: []
    };
  }

  /**
   * Mark a pay period as paid
   */
  markPeriodAsPaid(
    groomerId: string,
    periodStart: string,
    periodEnd: string,
    periodData: PayPeriodData,
    paymentDetails: {
      paid_amount: number;
      payment_method: string;
      payment_reference?: string;
      notes?: string;
    }
  ): Observable<GroomerPayout> {
    return from(this.createOrUpdatePayout(groomerId, periodStart, periodEnd, periodData, paymentDetails));
  }

  private async createOrUpdatePayout(
    groomerId: string,
    periodStart: string,
    periodEnd: string,
    periodData: PayPeriodData,
    paymentDetails: {
      paid_amount: number;
      payment_method: string;
      payment_reference?: string;
      notes?: string;
    }
  ): Promise<GroomerPayout> {
    const { data: { user } } = await this.supabase.auth.getUser();

    // Get groomer's commission rate
    const { data: groomer } = await this.supabase
      .from('users')
      .select('commission_rate')
      .eq('id', groomerId)
      .single();

    const commissionRate = groomer?.commission_rate || 0.35;

    const payoutData = {
      groomer_id: groomerId,
      period_start: periodStart,
      period_end: periodEnd,
      total_amount: periodData.totals.total_amount,
      total_tax: periodData.totals.tax_amount,
      total_pre_tax: periodData.totals.pre_tax_total,
      total_tips: periodData.totals.tips,
      commission_rate: commissionRate,
      total_commission_earnings: periodData.totals.commission_earnings,
      total_payout: periodData.totals.total_payout,
      booking_count: periodData.totals.booking_count,
      status: 'paid' as const,
      paid_amount: paymentDetails.paid_amount,
      paid_at: new Date().toISOString(),
      paid_by: user?.id,
      payment_method: paymentDetails.payment_method,
      payment_reference: paymentDetails.payment_reference || null,
      notes: paymentDetails.notes || null
    };

    const { data, error } = await this.supabase
      .from('groomer_payouts')
      .upsert(payoutData, { onConflict: 'groomer_id,period_start,period_end' })
      .select()
      .single();

    if (error) {
      console.error('Error creating payout:', error);
      throw error;
    }

    return data;
  }

  /**
   * Get payout history for a groomer
   */
  getPayoutHistory(groomerId: string): Observable<GroomerPayout[]> {
    return from(this.fetchPayoutHistory(groomerId));
  }

  private async fetchPayoutHistory(groomerId: string): Promise<GroomerPayout[]> {
    const { data, error } = await this.supabase
      .from('groomer_payouts')
      .select('*')
      .eq('groomer_id', groomerId)
      .order('period_start', { ascending: false });

    if (error) {
      console.error('Error fetching payout history:', error);
      throw error;
    }

    return data || [];
  }
}
