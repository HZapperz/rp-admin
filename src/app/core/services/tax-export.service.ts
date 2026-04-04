import { Injectable } from '@angular/core';
import { QuarterlyTaxSummary, MonthlyTaxDetail, TaxBookingRecord } from '../models/types';

@Injectable({
  providedIn: 'root'
})
export class TaxExportService {

  /**
   * Export quarterly tax data to CSV
   */
  exportQuarterlyCSV(
    summary: QuarterlyTaxSummary,
    monthly: MonthlyTaxDetail[],
    bookings: TaxBookingRecord[]
  ): void {
    const content = this.generateQuarterlyCSV(summary, monthly, bookings);
    const filename = `royal_pawz_sales_tax_Q${summary.quarter}_${summary.year}.csv`;
    this.downloadFile(content, filename, 'text/csv;charset=utf-8;');
  }

  /**
   * Export annual tax summary to CSV
   */
  exportAnnualCSV(summaries: QuarterlyTaxSummary[], year: number): void {
    const content = this.generateAnnualCSV(summaries, year);
    const filename = `royal_pawz_sales_tax_${year}_annual.csv`;
    this.downloadFile(content, filename, 'text/csv;charset=utf-8;');
  }

  private generateQuarterlyCSV(
    summary: QuarterlyTaxSummary,
    monthly: MonthlyTaxDetail[],
    bookings: TaxBookingRecord[]
  ): string {
    const lines: string[] = [];

    // Header
    lines.push('Texas Sales Tax Report');
    lines.push(`Business,Royal Pawz Mobile Pet Grooming`);
    lines.push(`Quarter,${summary.label}`);
    lines.push(`Period,${summary.period_start} to ${summary.period_end}`);
    lines.push(`Filing Deadline,${summary.deadline}`);
    lines.push(`Tax Rate,8.25%`);
    lines.push(`Generated,${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`);
    lines.push('');

    // Quarterly Totals
    lines.push('QUARTERLY TOTALS');
    lines.push(`Total Bookings,${summary.booking_count}`);
    lines.push(`Taxable Revenue,${this.formatCurrency(summary.taxable_revenue)}`);
    lines.push(`Tax Collected,${this.formatCurrency(summary.tax_collected)}`);
    lines.push(`Total Revenue (incl. tax),${this.formatCurrency(summary.total_revenue)}`);
    lines.push('');

    // Payment Method Breakdown
    lines.push('TAX BY PAYMENT METHOD');
    lines.push(`Card Payments Tax,${this.formatCurrency(summary.card_tax)}`);
    lines.push(`Cash Payments Tax,${this.formatCurrency(summary.cash_tax)}`);
    lines.push('');

    // Filing Status
    lines.push('FILING STATUS');
    lines.push(`Status,${summary.filing?.status?.toUpperCase() || 'UNFILED'}`);
    if (summary.filing?.filed_date) {
      lines.push(`Filed Date,${summary.filing.filed_date}`);
      lines.push(`Confirmation #,${summary.filing.confirmation_number || ''}`);
      lines.push(`Amount Remitted,${this.formatCurrency(summary.filing.amount_remitted || 0)}`);
    }
    lines.push('');

    // Monthly Breakdown
    lines.push('MONTHLY BREAKDOWN');
    lines.push('Month,Bookings,Taxable Revenue,Tax Collected,Total Revenue');
    monthly.forEach(m => {
      lines.push([
        this.escapeCSV(m.label),
        m.booking_count.toString(),
        this.formatCurrency(m.taxable_revenue),
        this.formatCurrency(m.tax_collected),
        this.formatCurrency(m.total_revenue)
      ].join(','));
    });
    lines.push('');

    // Individual Bookings
    lines.push('INDIVIDUAL BOOKINGS');
    lines.push('Date,Client,Subtotal,Tax,Total,Payment Method');
    bookings.forEach(b => {
      lines.push([
        this.formatDate(b.scheduled_date),
        this.escapeCSV(b.client_name),
        this.formatCurrency(b.subtotal_before_tax),
        this.formatCurrency(b.tax_amount),
        this.formatCurrency(b.total_amount),
        b.payment_method_type
      ].join(','));
    });

    return lines.join('\n');
  }

  private generateAnnualCSV(summaries: QuarterlyTaxSummary[], year: number): string {
    const lines: string[] = [];

    lines.push('Texas Sales Tax Annual Summary');
    lines.push(`Business,Royal Pawz Mobile Pet Grooming`);
    lines.push(`Year,${year}`);
    lines.push(`Tax Rate,8.25%`);
    lines.push(`Generated,${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`);
    lines.push('');

    lines.push('QUARTERLY BREAKDOWN');
    lines.push('Quarter,Period,Bookings,Taxable Revenue,Tax Collected,Status');
    summaries.forEach(s => {
      lines.push([
        s.label,
        `${s.period_start} to ${s.period_end}`,
        s.booking_count.toString(),
        this.formatCurrency(s.taxable_revenue),
        this.formatCurrency(s.tax_collected),
        s.filing?.status?.toUpperCase() || 'UNFILED'
      ].join(','));
    });

    // Grand totals
    const totalBookings = summaries.reduce((sum, s) => sum + s.booking_count, 0);
    const totalRevenue = summaries.reduce((sum, s) => sum + s.taxable_revenue, 0);
    const totalTax = summaries.reduce((sum, s) => sum + s.tax_collected, 0);
    lines.push([
      'ANNUAL TOTAL',
      '',
      totalBookings.toString(),
      this.formatCurrency(totalRevenue),
      this.formatCurrency(totalTax),
      ''
    ].join(','));

    return lines.join('\n');
  }

  private escapeCSV(value: string): string {
    if (!value) return '';
    if (value.includes(',') || value.includes('"') || value.includes('\n')) {
      return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
  }

  private formatCurrency(amount: number): string {
    return amount.toFixed(2);
  }

  private formatDate(dateString: string): string {
    const date = new Date(dateString + 'T00:00:00');
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
  }

  private downloadFile(content: string, filename: string, mimeType: string): void {
    const blob = new Blob([content], { type: mimeType });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  }
}
