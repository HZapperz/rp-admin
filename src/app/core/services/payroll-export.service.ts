import { Injectable } from '@angular/core';
import { PayPeriodData, WeekData, GroomDetail } from '../models/types';

@Injectable({
  providedIn: 'root'
})
export class PayrollExportService {

  /**
   * Export payroll data to CSV format
   */
  exportToCSV(data: PayPeriodData, groomerName: string): void {
    const content = this.generateCSVContent(data, groomerName);
    const filename = this.generateFilename(groomerName, data.period_label, 'csv');
    this.downloadFile(content, filename, 'text/csv;charset=utf-8;');
  }

  /**
   * Export payroll data to Excel-friendly CSV format
   * (Adds BOM for proper UTF-8 encoding in Excel)
   */
  exportToExcel(data: PayPeriodData, groomerName: string): void {
    const content = this.generateCSVContent(data, groomerName);
    // Add BOM for Excel UTF-8 compatibility
    const contentWithBOM = '\uFEFF' + content;
    const filename = this.generateFilename(groomerName, data.period_label, 'csv');
    this.downloadFile(contentWithBOM, filename, 'application/vnd.ms-excel;charset=utf-8;');
  }

  /**
   * Generate CSV content from payroll data
   */
  private generateCSVContent(data: PayPeriodData, groomerName: string): string {
    const lines: string[] = [];

    // Header section
    lines.push(`Payroll Report`);
    lines.push(`Groomer,${this.escapeCSV(groomerName)}`);
    lines.push(`Period,${this.escapeCSV(data.period_label)}`);
    lines.push(`Generated,${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`);
    lines.push(`Status,${data.payout?.status === 'paid' ? 'PAID' : 'UNPAID'}`);
    lines.push('');

    // Weekly Summary Table
    lines.push('WEEKLY SUMMARY');
    lines.push('Week,Commission,Tips,Hourly,Misc,Total');

    data.weeks.forEach(week => {
      lines.push([
        this.escapeCSV(week.week_label),
        this.formatCurrencyForCSV(week.totals.commission_earnings),
        this.formatCurrencyForCSV(week.totals.tips),
        week.totals.hourly_pay > 0 ? this.formatCurrencyForCSV(week.totals.hourly_pay) : '-',
        week.totals.misc_adjustments !== 0 ? this.formatCurrencyForCSV(week.totals.misc_adjustments) : '-',
        this.formatCurrencyForCSV(week.totals.total_payout)
      ].join(','));
    });

    // Totals row
    lines.push([
      'TOTAL',
      this.formatCurrencyForCSV(data.totals.commission_earnings),
      this.formatCurrencyForCSV(data.totals.tips),
      '-',
      '-',
      this.formatCurrencyForCSV(data.totals.total_payout)
    ].join(','));

    lines.push('');

    // Period Totals Summary
    lines.push('PERIOD TOTALS');
    lines.push(`Total Grooms,${data.totals.booking_count}`);
    lines.push(`Pre-tax Total,${this.formatCurrencyForCSV(data.totals.pre_tax_total)}`);
    lines.push(`Commission Earnings,${this.formatCurrencyForCSV(data.totals.commission_earnings)}`);
    lines.push(`Tips,${this.formatCurrencyForCSV(data.totals.tips)}`);
    lines.push(`Total Payout,${this.formatCurrencyForCSV(data.totals.total_payout)}`);
    lines.push('');

    // Detailed groom list
    lines.push('DETAILED GROOM LIST');
    lines.push('Date,Client,Pets,Pre-tax Amount,Tip,Groomer Cut,Payment Status');

    data.weeks.forEach(week => {
      week.grooms.forEach(groom => {
        const petNames = groom.pets.map(p => p.pet_name).join('; ');
        lines.push([
          this.formatDateForCSV(groom.scheduled_date),
          this.escapeCSV(`${groom.client.first_name} ${groom.client.last_name}`),
          this.escapeCSV(petNames),
          this.formatCurrencyForCSV(groom.pre_tax_amount),
          this.formatCurrencyForCSV(groom.tip_amount),
          this.formatCurrencyForCSV(groom.groomer_cut),
          groom.payment_status
        ].join(','));
      });
    });

    // Payment info if paid
    if (data.payout?.status === 'paid') {
      lines.push('');
      lines.push('PAYMENT DETAILS');
      lines.push(`Paid Amount,${this.formatCurrencyForCSV(data.payout.paid_amount || 0)}`);
      lines.push(`Paid Date,${data.payout.paid_at ? this.formatDateForCSV(data.payout.paid_at) : ''}`);
      lines.push(`Payment Method,${data.payout.payment_method || ''}`);
      if (data.payout.payment_reference) {
        lines.push(`Reference,${this.escapeCSV(data.payout.payment_reference)}`);
      }
      if (data.payout.notes) {
        lines.push(`Notes,${this.escapeCSV(data.payout.notes)}`);
      }
    }

    return lines.join('\n');
  }

  /**
   * Generate a filename for the export
   */
  private generateFilename(groomerName: string, periodLabel: string, extension: string): string {
    const safeName = groomerName.replace(/[^a-zA-Z0-9]/g, '_');
    const safePeriod = periodLabel.replace(/[^a-zA-Z0-9]/g, '_');
    return `payroll_${safeName}_${safePeriod}.${extension}`;
  }

  /**
   * Escape a value for CSV (handle commas, quotes, newlines)
   */
  private escapeCSV(value: string): string {
    if (!value) return '';
    // If value contains comma, quote, or newline, wrap in quotes and escape existing quotes
    if (value.includes(',') || value.includes('"') || value.includes('\n')) {
      return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
  }

  /**
   * Format currency for CSV (numeric value without symbol for calculations)
   */
  private formatCurrencyForCSV(amount: number): string {
    return amount.toFixed(2);
  }

  /**
   * Format date for CSV
   */
  private formatDateForCSV(dateString: string): string {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
  }

  /**
   * Download file to user's device
   */
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

  /**
   * Format currency for display
   */
  formatCurrency(amount: number): string {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount);
  }
}
