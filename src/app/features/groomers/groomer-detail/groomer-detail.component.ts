import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { GroomerService, GroomerEarningsDetail, CommissionHistory } from '../../../core/services/groomer.service';
import { PayrollExportService } from '../../../core/services/payroll-export.service';
import { PayPeriodData, AvailablePayrollMonth, WeekData } from '../../../core/models/types';
import { PayrollPeriodSelectorComponent, SelectionMode } from './components/payroll-period-selector.component';
import { PayrollSummaryTableComponent } from './components/payroll-summary-table.component';
import { PayrollWeekSectionComponent } from './components/payroll-week-section.component';
import { MarkPaidDialogComponent, PaymentDetails } from './components/mark-paid-dialog.component';

@Component({
  selector: 'app-groomer-detail',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    PayrollPeriodSelectorComponent,
    PayrollSummaryTableComponent,
    PayrollWeekSectionComponent,
    MarkPaidDialogComponent
  ],
  templateUrl: './groomer-detail.component.html',
  styleUrls: ['./groomer-detail.component.scss']
})
export class GroomerDetailComponent implements OnInit {
  groomerId!: string;
  earningsDetail: GroomerEarningsDetail | null = null;
  commissionHistory: CommissionHistory[] = [];
  isLoading = true;

  editingCommission = false;
  newCommissionPercent = 35;
  commissionNotes = '';
  isSaving = false;
  saveError = '';

  // Payroll state
  availableMonths: AvailablePayrollMonth[] = [];
  selectedYear: number = new Date().getFullYear();
  selectedMonth: number = new Date().getMonth();
  payrollData: PayPeriodData | null = null;
  isLoadingPayroll = false;
  showMarkPaidDialog = false;
  isMarkingPaid = false;

  // Custom date range state
  selectionMode: SelectionMode = 'monthly';
  customStartDate: string = '';
  customEndDate: string = '';

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private groomerService: GroomerService,
    private payrollExportService: PayrollExportService
  ) {}

  ngOnInit() {
    this.groomerId = this.route.snapshot.paramMap.get('id') || '';
    this.loadGroomerData();
    this.loadPayrollData();
  }

  loadGroomerData() {
    this.isLoading = true;

    // Load earnings details
    this.groomerService.getGroomerEarnings(this.groomerId).subscribe({
      next: (data) => {
        this.earningsDetail = data;
        this.isLoading = false;
      },
      error: (err) => {
        console.error('Error loading groomer earnings:', err);
        this.isLoading = false;
      }
    });

    // Load commission history
    this.groomerService.getCommissionHistory(this.groomerId).subscribe({
      next: (data) => {
        this.commissionHistory = data.history;
      },
      error: (err) => {
        console.error('Error loading commission history:', err);
      }
    });
  }

  // Payroll methods
  loadPayrollData() {
    // Load available months
    this.groomerService.getAvailablePayrollMonths(this.groomerId).subscribe({
      next: (months) => {
        this.availableMonths = months;
        if (months.length > 0) {
          // Select the most recent month
          this.selectedYear = months[0].year;
          this.selectedMonth = months[0].month;
          this.loadMonthlyPayroll();
        }
      },
      error: (err) => {
        console.error('Error loading payroll months:', err);
      }
    });
  }

  loadMonthlyPayroll() {
    this.isLoadingPayroll = true;
    this.groomerService.getGroomerMonthlyPayroll(this.groomerId, this.selectedYear, this.selectedMonth).subscribe({
      next: (data) => {
        this.payrollData = data;
        // Expand the first week by default
        if (data.weeks.length > 0) {
          data.weeks[0].is_expanded = true;
        }
        this.isLoadingPayroll = false;
      },
      error: (err) => {
        console.error('Error loading monthly payroll:', err);
        this.isLoadingPayroll = false;
      }
    });
  }

  onPeriodChange(period: { year: number; month: number }) {
    this.selectedYear = period.year;
    this.selectedMonth = period.month;
    this.loadMonthlyPayroll();
  }

  onModeChange(mode: SelectionMode) {
    this.selectionMode = mode;
    if (mode === 'monthly' && this.availableMonths.length > 0) {
      // Reload monthly data when switching back to monthly mode
      this.loadMonthlyPayroll();
    }
  }

  onCustomRangeChange(range: { startDate: string; endDate: string }) {
    this.customStartDate = range.startDate;
    this.customEndDate = range.endDate;
    this.loadCustomRangePayroll();
  }

  loadCustomRangePayroll() {
    if (!this.customStartDate || !this.customEndDate) return;

    this.isLoadingPayroll = true;
    this.groomerService.getGroomerPayrollByDateRange(
      this.groomerId,
      this.customStartDate,
      this.customEndDate
    ).subscribe({
      next: (data) => {
        this.payrollData = data;
        // Expand the first week by default
        if (data.weeks.length > 0) {
          data.weeks[0].is_expanded = true;
        }
        this.isLoadingPayroll = false;
      },
      error: (err) => {
        console.error('Error loading custom range payroll:', err);
        this.isLoadingPayroll = false;
      }
    });
  }

  // Export methods
  exportToCSV() {
    if (!this.payrollData || !this.earningsDetail) return;
    this.payrollExportService.exportToCSV(this.payrollData, this.earningsDetail.groomer.name);
  }

  exportToExcel() {
    if (!this.payrollData || !this.earningsDetail) return;
    this.payrollExportService.exportToExcel(this.payrollData, this.earningsDetail.groomer.name);
  }

  printPayroll() {
    // Expand all weeks before printing
    if (this.payrollData) {
      this.payrollData.weeks.forEach(week => week.is_expanded = true);
    }
    // Small delay to allow UI to update before printing
    setTimeout(() => {
      window.print();
    }, 100);
  }

  toggleWeekExpand(weekIndex: number) {
    if (this.payrollData && this.payrollData.weeks[weekIndex]) {
      this.payrollData.weeks[weekIndex].is_expanded = !this.payrollData.weeks[weekIndex].is_expanded;
    }
  }

  openMarkPaidDialog() {
    this.showMarkPaidDialog = true;
  }

  closeMarkPaidDialog() {
    this.showMarkPaidDialog = false;
  }

  confirmMarkPaid(paymentDetails: PaymentDetails) {
    if (!this.payrollData) return;

    this.isMarkingPaid = true;
    this.groomerService.markPeriodAsPaid(
      this.groomerId,
      this.payrollData.period_start,
      this.payrollData.period_end,
      this.payrollData,
      paymentDetails
    ).subscribe({
      next: (payout) => {
        // Update local state
        if (this.payrollData) {
          this.payrollData.payout = payout;
        }
        this.isMarkingPaid = false;
        this.showMarkPaidDialog = false;
      },
      error: (err) => {
        console.error('Error marking period as paid:', err);
        this.isMarkingPaid = false;
        alert('Failed to mark period as paid. Please try again.');
      }
    });
  }

  startEditCommission() {
    this.editingCommission = true;
    this.newCommissionPercent = Math.round((this.earningsDetail?.groomer.commissionRate || 0.35) * 100);
    this.commissionNotes = '';
    this.saveError = '';
  }

  cancelEditCommission() {
    this.editingCommission = false;
    this.saveError = '';
  }

  saveCommission() {
    if (this.newCommissionPercent < 0 || this.newCommissionPercent > 100) {
      this.saveError = 'Commission rate must be between 0 and 100';
      return;
    }

    this.isSaving = true;
    this.saveError = '';

    const commissionRate = this.newCommissionPercent / 100;

    this.groomerService.updateGroomerCommission(
      this.groomerId,
      commissionRate,
      this.commissionNotes || undefined
    ).subscribe({
      next: () => {
        this.isSaving = false;
        this.editingCommission = false;
        // Show success message
        alert('Commission rate updated successfully!');
        // Reload data to show updated values
        this.loadGroomerData();
      },
      error: (err) => {
        console.error('Error updating commission:', err);

        // Provide more helpful error messages
        if (err.message?.includes('lock') || err.message?.includes('LockManager')) {
          this.saveError = 'Auth session conflict detected. Please close any other admin portal tabs and try again.';
        } else if (err.error?.error) {
          this.saveError = err.error.error;
        } else if (err.message) {
          this.saveError = err.message;
        } else {
          this.saveError = 'Failed to update commission rate. Please try again.';
        }

        this.isSaving = false;
      }
    });
  }

  goBack() {
    this.router.navigate(['/groomers']);
  }

  formatCommissionRate(rate: number): string {
    return this.groomerService.formatCommissionRate(rate);
  }

  formatCurrency(amount: number): string {
    return this.groomerService.formatCurrency(amount);
  }

  formatDate(dateString: string): string {
    if (!dateString) return 'N/A';
    // Parse ISO date string as UTC to avoid timezone conversion issues
    const date = new Date(dateString + 'T00:00:00Z');
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      timeZone: 'UTC'
    });
  }
}
