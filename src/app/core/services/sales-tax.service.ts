import { Injectable } from '@angular/core';
import { SupabaseService } from './supabase.service';
import {
  TaxFiling,
  QuarterlyTaxSummary,
  MonthlyTaxDetail,
  TaxBookingRecord
} from '../models/types';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

@Injectable({
  providedIn: 'root'
})
export class SalesTaxService {
  constructor(private supabase: SupabaseService) {}

  /**
   * Get quarterly tax summaries for a given year, merged with filing records
   */
  async getQuarterlySummaries(year: number): Promise<QuarterlyTaxSummary[]> {
    const startDate = `${year}-01-01`;
    const endDate = `${year}-12-31`;

    // Fetch completed bookings for the year
    const { data: bookings } = await this.supabase
      .from('bookings')
      .select('scheduled_date, subtotal_before_tax, tax_amount, total_amount, payment_method_type')
      .eq('status', 'completed')
      .gte('scheduled_date', startDate)
      .lte('scheduled_date', endDate)
      .order('scheduled_date');

    // Fetch filing records for the year
    const { data: filings } = await this.supabase
      .from('tax_filings')
      .select('*')
      .eq('year', year);

    const filingMap = new Map<number, TaxFiling>();
    (filings || []).forEach(f => filingMap.set(f.quarter, f));

    const today = new Date();
    const summaries: QuarterlyTaxSummary[] = [];

    for (let q = 1; q <= 4; q++) {
      const { start, end } = this.getQuarterDateRange(year, q);
      const deadline = this.getDeadline(year, q);
      const deadlineDate = new Date(deadline + 'T00:00:00');
      const diffMs = deadlineDate.getTime() - today.getTime();
      const daysUntil = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

      // Filter bookings for this quarter
      const quarterBookings = (bookings || []).filter(b => {
        const d = b.scheduled_date;
        return d >= start && d <= end;
      });

      let taxableRevenue = 0;
      let taxCollected = 0;
      let totalRevenue = 0;
      let cashTax = 0;
      let cardTax = 0;

      quarterBookings.forEach(b => {
        taxableRevenue += Number(b.subtotal_before_tax) || 0;
        taxCollected += Number(b.tax_amount) || 0;
        totalRevenue += Number(b.total_amount) || 0;

        const tax = Number(b.tax_amount) || 0;
        if (b.payment_method_type === 'cash') {
          cashTax += tax;
        } else {
          cardTax += tax;
        }
      });

      const filing = filingMap.get(q) || null;
      const isFiled = filing?.status === 'filed' || filing?.status === 'amended';

      // Only include quarters that have data or are in the past/current
      const quarterEnd = new Date(end + 'T23:59:59');
      if (quarterBookings.length > 0 || quarterEnd <= today) {
        summaries.push({
          year,
          quarter: q,
          label: `Q${q} ${year}`,
          period_start: start,
          period_end: end,
          deadline,
          booking_count: quarterBookings.length,
          taxable_revenue: taxableRevenue,
          tax_collected: taxCollected,
          total_revenue: totalRevenue,
          cash_tax: cashTax,
          card_tax: cardTax,
          filing,
          is_overdue: !isFiled && daysUntil < 0,
          days_until_deadline: daysUntil
        });
      }
    }

    return summaries;
  }

  /**
   * Get monthly breakdown for a specific quarter
   */
  async getMonthlyBreakdown(year: number, quarter: number): Promise<MonthlyTaxDetail[]> {
    const { start, end } = this.getQuarterDateRange(year, quarter);

    const { data: bookings } = await this.supabase
      .from('bookings')
      .select('scheduled_date, subtotal_before_tax, tax_amount, total_amount')
      .eq('status', 'completed')
      .gte('scheduled_date', start)
      .lte('scheduled_date', end)
      .order('scheduled_date');

    const startMonth = (quarter - 1) * 3;
    const months: MonthlyTaxDetail[] = [];

    for (let i = 0; i < 3; i++) {
      const monthIndex = startMonth + i;
      const monthStart = `${year}-${String(monthIndex + 1).padStart(2, '0')}-01`;
      const lastDay = new Date(year, monthIndex + 1, 0).getDate();
      const monthEnd = `${year}-${String(monthIndex + 1).padStart(2, '0')}-${lastDay}`;

      const monthBookings = (bookings || []).filter(b => {
        const d = b.scheduled_date;
        return d >= monthStart && d <= monthEnd;
      });

      let taxableRevenue = 0;
      let taxCollected = 0;
      let totalRevenue = 0;

      monthBookings.forEach(b => {
        taxableRevenue += Number(b.subtotal_before_tax) || 0;
        taxCollected += Number(b.tax_amount) || 0;
        totalRevenue += Number(b.total_amount) || 0;
      });

      months.push({
        year,
        month: monthIndex + 1,
        label: `${MONTH_NAMES[monthIndex]} ${year}`,
        booking_count: monthBookings.length,
        taxable_revenue: taxableRevenue,
        tax_collected: taxCollected,
        total_revenue: totalRevenue
      });
    }

    return months;
  }

  /**
   * Get individual booking records for a quarter (for CSV export)
   */
  async getBookingsForQuarter(year: number, quarter: number): Promise<TaxBookingRecord[]> {
    const { start, end } = this.getQuarterDateRange(year, quarter);

    const { data: bookings } = await this.supabase
      .from('bookings')
      .select(`
        id,
        scheduled_date,
        subtotal_before_tax,
        tax_amount,
        tax_rate,
        total_amount,
        payment_method_type,
        client:users!client_id(first_name, last_name)
      `)
      .eq('status', 'completed')
      .gte('scheduled_date', start)
      .lte('scheduled_date', end)
      .order('scheduled_date');

    return (bookings || []).map((b: any) => ({
      id: b.id,
      scheduled_date: b.scheduled_date,
      client_name: b.client
        ? `${b.client.first_name} ${b.client.last_name}`
        : 'Unknown',
      subtotal_before_tax: Number(b.subtotal_before_tax) || 0,
      tax_amount: Number(b.tax_amount) || 0,
      tax_rate: Number(b.tax_rate) || 0,
      total_amount: Number(b.total_amount) || 0,
      payment_method_type: b.payment_method_type || 'unknown'
    }));
  }

  /**
   * Get YTD summary for the current year
   */
  async getYTDSummary(): Promise<{ tax_collected: number; taxable_revenue: number; booking_count: number }> {
    const year = new Date().getFullYear();
    const startDate = `${year}-01-01`;
    const today = new Date().toISOString().split('T')[0];

    const { data: bookings } = await this.supabase
      .from('bookings')
      .select('subtotal_before_tax, tax_amount')
      .eq('status', 'completed')
      .gte('scheduled_date', startDate)
      .lte('scheduled_date', today);

    let taxCollected = 0;
    let taxableRevenue = 0;

    (bookings || []).forEach(b => {
      taxCollected += Number(b.tax_amount) || 0;
      taxableRevenue += Number(b.subtotal_before_tax) || 0;
    });

    return {
      tax_collected: taxCollected,
      taxable_revenue: taxableRevenue,
      booking_count: (bookings || []).length
    };
  }

  /**
   * Upsert a filing record (create or update)
   */
  async upsertFiling(data: {
    year: number;
    quarter: number;
    status: 'unfiled' | 'filed' | 'amended';
    filed_date?: string;
    confirmation_number?: string;
    amount_remitted?: number;
    payment_method?: string;
    notes?: string;
    total_tax_collected?: number;
    total_taxable_revenue?: number;
    booking_count?: number;
  }): Promise<TaxFiling | null> {
    const { data: result, error } = await this.supabase
      .from('tax_filings')
      .upsert(
        { ...data, updated_at: new Date().toISOString() },
        { onConflict: 'year,quarter' }
      )
      .select()
      .single();

    if (error) {
      console.error('Error upserting tax filing:', error);
      return null;
    }

    return result;
  }

  /**
   * Get quarter date boundaries
   */
  private getQuarterDateRange(year: number, quarter: number): { start: string; end: string } {
    const startMonth = (quarter - 1) * 3 + 1;
    const endMonth = startMonth + 2;
    const lastDay = new Date(year, endMonth, 0).getDate();

    return {
      start: `${year}-${String(startMonth).padStart(2, '0')}-01`,
      end: `${year}-${String(endMonth).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
    };
  }

  /**
   * Get Texas filing deadline for a quarter
   * Q1 (Jan-Mar) -> Apr 20
   * Q2 (Apr-Jun) -> Jul 20
   * Q3 (Jul-Sep) -> Oct 20
   * Q4 (Oct-Dec) -> Jan 20 of next year
   */
  private getDeadline(year: number, quarter: number): string {
    const deadlineMonth = quarter * 3 + 1;
    if (quarter === 4) {
      return `${year + 1}-01-20`;
    }
    return `${year}-${String(deadlineMonth).padStart(2, '0')}-20`;
  }
}
