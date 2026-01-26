import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { PayPeriodData } from '../../../../core/models/types';

@Component({
  selector: 'app-payroll-summary-table',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="summary-table-container" [class.paid]="periodData?.payout?.status === 'paid'">
      <div class="summary-header">
        <h3>Period Summary</h3>
        <div class="header-actions">
          <div class="status-badge" [class.paid]="periodData?.payout?.status === 'paid'">
            <span class="material-icons" *ngIf="periodData?.payout?.status === 'paid'">check_circle</span>
            {{ periodData?.payout?.status === 'paid' ? 'PAID' : 'UNPAID' }}
          </div>
        </div>
      </div>

      <div class="table-wrapper">
        <table class="summary-table">
          <thead>
            <tr>
              <th class="week-col">Week</th>
              <th class="number-col">Commission</th>
              <th class="number-col">Tips</th>
              <th class="number-col">Hourly</th>
              <th class="number-col">Misc</th>
              <th class="number-col total-col">Total</th>
            </tr>
          </thead>
          <tbody>
            <tr *ngFor="let week of periodData?.weeks">
              <td class="week-col">{{ week.week_label }}</td>
              <td class="number-col">{{ formatCurrency(week.totals.commission_earnings) }}</td>
              <td class="number-col tips">{{ formatCurrency(week.totals.tips) }}</td>
              <td class="number-col placeholder">{{ week.totals.hourly_pay > 0 ? formatCurrency(week.totals.hourly_pay) : '-' }}</td>
              <td class="number-col placeholder">{{ week.totals.misc_adjustments !== 0 ? formatCurrency(week.totals.misc_adjustments) : '-' }}</td>
              <td class="number-col total-col">{{ formatCurrency(week.totals.total_payout) }}</td>
            </tr>
            <tr *ngIf="!periodData?.weeks?.length" class="no-data-row">
              <td colspan="6">No completed grooms in this period</td>
            </tr>
          </tbody>
          <tfoot *ngIf="periodData?.weeks?.length">
            <tr class="totals-row">
              <td class="week-col"><strong>TOTAL</strong></td>
              <td class="number-col"><strong>{{ formatCurrency(periodData?.totals?.commission_earnings || 0) }}</strong></td>
              <td class="number-col tips"><strong>{{ formatCurrency(periodData?.totals?.tips || 0) }}</strong></td>
              <td class="number-col placeholder"><strong>-</strong></td>
              <td class="number-col placeholder"><strong>-</strong></td>
              <td class="number-col total-col"><strong>{{ formatCurrency(periodData?.totals?.total_payout || 0) }}</strong></td>
            </tr>
          </tfoot>
        </table>
      </div>

      <div class="summary-footer">
        <div class="groom-count">
          <span class="material-icons">pets</span>
          {{ periodData?.totals?.booking_count || 0 }} grooms completed
        </div>

        <div class="actions">
          <button
            *ngIf="periodData?.payout?.status !== 'paid' && !isCustomRange"
            class="mark-paid-btn"
            (click)="onMarkAsPaid()"
            [disabled]="!periodData?.totals?.booking_count">
            <span class="material-icons">payments</span>
            Mark as Paid
          </button>

          <div *ngIf="periodData?.payout?.status === 'paid'" class="paid-info">
            <span class="paid-date">
              Paid on {{ formatDate(periodData?.payout?.paid_at) }}
            </span>
            <span class="paid-amount" *ngIf="periodData?.payout?.paid_amount">
              {{ formatCurrency(periodData?.payout?.paid_amount || 0) }}
            </span>
            <span class="paid-method" *ngIf="periodData?.payout?.payment_method">
              via {{ periodData?.payout?.payment_method }}
            </span>
          </div>

          <div *ngIf="isCustomRange && !periodData?.payout" class="custom-range-note">
            <span class="material-icons">info</span>
            Custom date ranges cannot be marked as paid
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .summary-table-container {
      background: white;
      border-radius: 12px;
      border: 2px solid #fbbf24;
      padding: 1.5rem;
      margin-bottom: 1.5rem;

      &.paid {
        border-color: #10b981;
      }
    }

    .summary-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 1rem;

      h3 {
        margin: 0;
        font-size: 1.125rem;
        font-weight: 600;
        color: #111827;
      }
    }

    .header-actions {
      display: flex;
      align-items: center;
      gap: 1rem;
    }

    .status-badge {
      display: flex;
      align-items: center;
      gap: 0.25rem;
      padding: 0.25rem 0.75rem;
      border-radius: 9999px;
      font-size: 0.75rem;
      font-weight: 600;
      background: #fef3c7;
      color: #92400e;

      &.paid {
        background: #d1fae5;
        color: #065f46;
      }

      .material-icons {
        font-size: 14px;
      }
    }

    .table-wrapper {
      overflow-x: auto;
      -webkit-overflow-scrolling: touch;
    }

    .summary-table {
      width: 100%;
      border-collapse: collapse;
      min-width: 500px;

      thead {
        background: #f9fafb;

        th {
          padding: 0.75rem;
          text-align: left;
          font-weight: 600;
          color: #374151;
          border-bottom: 2px solid #e5e7eb;
          font-size: 0.8125rem;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          white-space: nowrap;
        }
      }

      tbody {
        tr {
          transition: background 0.2s;

          &:hover {
            background: #f9fafb;
          }

          td {
            padding: 0.75rem;
            border-bottom: 1px solid #e5e7eb;
            font-size: 0.9375rem;
            color: #111827;
          }
        }

        .no-data-row td {
          text-align: center;
          padding: 2rem;
          color: #9ca3af;
          font-style: italic;
        }
      }

      tfoot {
        .totals-row {
          background: #f0fdf4;

          td {
            padding: 0.875rem 0.75rem;
            border-top: 2px solid #10b981;
            font-size: 1rem;
          }
        }
      }

      .week-col {
        min-width: 140px;
      }

      .number-col {
        text-align: right;
        font-family: 'Monaco', 'Courier New', monospace;
        min-width: 90px;
      }

      .total-col {
        background: rgba(16, 185, 129, 0.05);
        font-weight: 600;
      }

      .tips {
        color: #10b981;
      }

      .placeholder {
        color: #9ca3af;
      }
    }

    .summary-footer {
      display: flex;
      flex-direction: column;
      gap: 1rem;
      margin-top: 1rem;
      padding-top: 1rem;
      border-top: 1px solid #e5e7eb;

      @media (min-width: 640px) {
        flex-direction: row;
        justify-content: space-between;
        align-items: center;
      }
    }

    .groom-count {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      font-size: 0.875rem;
      color: #6b7280;

      .material-icons {
        font-size: 18px;
      }
    }

    .actions {
      display: flex;
      align-items: center;
      gap: 1rem;
    }

    .mark-paid-btn {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.75rem 1.5rem;
      background: #3b82f6;
      color: white;
      border: none;
      border-radius: 8px;
      font-size: 0.875rem;
      font-weight: 500;
      cursor: pointer;
      transition: background 0.2s;

      &:hover:not(:disabled) {
        background: #2563eb;
      }

      &:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }

      .material-icons {
        font-size: 18px;
      }
    }

    .paid-info {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 0.5rem;
      font-size: 0.875rem;
      color: #065f46;
    }

    .paid-date {
      font-weight: 500;
    }

    .paid-amount {
      font-weight: 600;
    }

    .paid-method {
      color: #6b7280;
    }

    .custom-range-note {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      font-size: 0.8125rem;
      color: #6b7280;
      font-style: italic;

      .material-icons {
        font-size: 16px;
      }
    }

    /* Print styles */
    @media print {
      .summary-table-container {
        border: 1px solid #000;
        break-inside: avoid;
      }

      .mark-paid-btn,
      .custom-range-note {
        display: none;
      }

      .summary-table {
        th, td {
          border: 1px solid #ccc;
        }
      }
    }
  `]
})
export class PayrollSummaryTableComponent {
  @Input() periodData: PayPeriodData | null = null;
  @Input() commissionRate: number = 0.35;
  @Input() isCustomRange: boolean = false;

  @Output() markAsPaid = new EventEmitter<void>();

  onMarkAsPaid(): void {
    this.markAsPaid.emit();
  }

  formatCurrency(amount: number): string {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount);
  }

  formatPercent(rate: number): string {
    return `${Math.round(rate * 100)}%`;
  }

  formatDate(dateString?: string): string {
    if (!dateString) return '';
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  }
}
