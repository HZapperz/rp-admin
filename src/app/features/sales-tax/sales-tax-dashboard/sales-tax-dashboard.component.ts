import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SalesTaxService } from '../../../core/services/sales-tax.service';
import { TaxExportService } from '../../../core/services/tax-export.service';
import { QuarterlyTaxSummary, MonthlyTaxDetail } from '../../../core/models/types';
import { MarkFiledDialogComponent, FilingDetails } from '../components/mark-filed-dialog.component';

@Component({
  selector: 'app-sales-tax-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule, MarkFiledDialogComponent],
  templateUrl: './sales-tax-dashboard.component.html',
  styleUrls: ['./sales-tax-dashboard.component.scss']
})
export class SalesTaxDashboardComponent implements OnInit {
  isLoading = true;
  error: string | null = null;

  // Data
  quarters: QuarterlyTaxSummary[] = [];
  ytdTaxCollected = 0;
  ytdBookingCount = 0;
  currentQuarter: QuarterlyTaxSummary | null = null;
  overdueQuarters: QuarterlyTaxSummary[] = [];

  // Year selector
  selectedYear: number = new Date().getFullYear();
  availableYears: number[] = [];

  // Expandable monthly detail
  expandedQuarterKey: string | null = null;
  monthlyDetail: MonthlyTaxDetail[] = [];
  isLoadingDetail = false;

  // Filing dialog
  showFilingDialog = false;
  filingDialogQuarter: QuarterlyTaxSummary | null = null;
  isSubmittingFiling = false;

  // Export loading state
  exportingQuarter: string | null = null;

  constructor(
    private salesTaxService: SalesTaxService,
    private taxExportService: TaxExportService
  ) {}

  ngOnInit(): void {
    const currentYear = new Date().getFullYear();
    // Show years from 2025 (when business started) to current
    for (let y = 2025; y <= currentYear; y++) {
      this.availableYears.push(y);
    }
    this.loadData();
  }

  async loadData(): Promise<void> {
    this.isLoading = true;
    this.error = null;

    try {
      const [quarters, ytd] = await Promise.all([
        this.salesTaxService.getQuarterlySummaries(this.selectedYear),
        this.selectedYear === new Date().getFullYear()
          ? this.salesTaxService.getYTDSummary()
          : Promise.resolve(null)
      ]);

      this.quarters = quarters;

      if (ytd) {
        this.ytdTaxCollected = ytd.tax_collected;
        this.ytdBookingCount = ytd.booking_count;
      } else {
        // For past years, compute from quarters
        this.ytdTaxCollected = quarters.reduce((sum, q) => sum + q.tax_collected, 0);
        this.ytdBookingCount = quarters.reduce((sum, q) => sum + q.booking_count, 0);
      }

      // Find current quarter and overdue quarters
      const today = new Date();
      const currentQ = Math.ceil((today.getMonth() + 1) / 3);
      this.currentQuarter = quarters.find(
        q => q.year === today.getFullYear() && q.quarter === currentQ
      ) || null;

      this.overdueQuarters = quarters.filter(q => q.is_overdue);
    } catch (err) {
      console.error('Failed to load tax data:', err);
      this.error = 'Failed to load sales tax data. Please try again.';
    } finally {
      this.isLoading = false;
    }
  }

  onYearChange(): void {
    this.expandedQuarterKey = null;
    this.monthlyDetail = [];
    this.loadData();
  }

  getNextDeadline(): QuarterlyTaxSummary | null {
    const unfiled = this.quarters
      .filter(q => !q.filing || q.filing.status === 'unfiled')
      .sort((a, b) => a.days_until_deadline - b.days_until_deadline);
    return unfiled[0] || null;
  }

  getStatusClass(quarter: QuarterlyTaxSummary): string {
    if (quarter.filing?.status === 'filed' || quarter.filing?.status === 'amended') {
      return 'status-filed';
    }
    if (quarter.is_overdue) {
      return 'status-overdue';
    }
    if (quarter.days_until_deadline <= 30 && quarter.days_until_deadline >= 0) {
      return 'status-due-soon';
    }
    return 'status-unfiled';
  }

  getStatusLabel(quarter: QuarterlyTaxSummary): string {
    if (quarter.filing?.status === 'filed') return 'Filed';
    if (quarter.filing?.status === 'amended') return 'Amended';
    if (quarter.is_overdue) return 'Overdue';
    if (quarter.days_until_deadline <= 30 && quarter.days_until_deadline >= 0) {
      return `Due in ${quarter.days_until_deadline} days`;
    }
    return 'Unfiled';
  }

  async toggleQuarterDetail(quarter: QuarterlyTaxSummary): Promise<void> {
    const key = `${quarter.year}-${quarter.quarter}`;
    if (this.expandedQuarterKey === key) {
      this.expandedQuarterKey = null;
      this.monthlyDetail = [];
      return;
    }

    this.expandedQuarterKey = key;
    this.isLoadingDetail = true;

    try {
      this.monthlyDetail = await this.salesTaxService.getMonthlyBreakdown(
        quarter.year,
        quarter.quarter
      );
    } catch (err) {
      console.error('Failed to load monthly detail:', err);
    } finally {
      this.isLoadingDetail = false;
    }
  }

  isExpanded(quarter: QuarterlyTaxSummary): boolean {
    return this.expandedQuarterKey === `${quarter.year}-${quarter.quarter}`;
  }

  // Filing dialog
  openFilingDialog(quarter: QuarterlyTaxSummary): void {
    this.filingDialogQuarter = quarter;
    this.showFilingDialog = true;
  }

  closeFilingDialog(): void {
    this.showFilingDialog = false;
    this.filingDialogQuarter = null;
  }

  async onFilingConfirm(details: FilingDetails): Promise<void> {
    if (!this.filingDialogQuarter) return;
    this.isSubmittingFiling = true;

    try {
      const q = this.filingDialogQuarter;
      await this.salesTaxService.upsertFiling({
        year: q.year,
        quarter: q.quarter,
        status: 'filed',
        filed_date: details.filed_date,
        confirmation_number: details.confirmation_number,
        amount_remitted: details.amount_remitted,
        payment_method: details.payment_method,
        notes: details.notes,
        total_tax_collected: q.tax_collected,
        total_taxable_revenue: q.taxable_revenue,
        booking_count: q.booking_count
      });

      this.closeFilingDialog();
      await this.loadData();
    } catch (err) {
      console.error('Failed to save filing:', err);
    } finally {
      this.isSubmittingFiling = false;
    }
  }

  // CSV export
  async exportQuarter(quarter: QuarterlyTaxSummary): Promise<void> {
    const key = `${quarter.year}-${quarter.quarter}`;
    this.exportingQuarter = key;

    try {
      const [monthly, bookings] = await Promise.all([
        this.salesTaxService.getMonthlyBreakdown(quarter.year, quarter.quarter),
        this.salesTaxService.getBookingsForQuarter(quarter.year, quarter.quarter)
      ]);

      this.taxExportService.exportQuarterlyCSV(quarter, monthly, bookings);
    } catch (err) {
      console.error('Failed to export:', err);
    } finally {
      this.exportingQuarter = null;
    }
  }

  exportAnnual(): void {
    this.taxExportService.exportAnnualCSV(this.quarters, this.selectedYear);
  }

  isExporting(quarter: QuarterlyTaxSummary): boolean {
    return this.exportingQuarter === `${quarter.year}-${quarter.quarter}`;
  }

  formatCurrency(amount: number): string {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount);
  }

  formatDate(dateString: string): string {
    return new Date(dateString + 'T00:00:00').toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  }
}
