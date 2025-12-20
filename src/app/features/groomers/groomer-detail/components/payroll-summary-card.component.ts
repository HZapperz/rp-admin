import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { PayPeriodData } from '../../../../core/models/types';

@Component({
  selector: 'app-payroll-summary-card',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="summary-card" [class.paid]="periodData?.payout?.status === 'paid'">
      <div class="summary-header">
        <h3>Period Summary</h3>
        <div class="status-badge" [class.paid]="periodData?.payout?.status === 'paid'">
          <span class="material-icons" *ngIf="periodData?.payout?.status === 'paid'">check_circle</span>
          {{ periodData?.payout?.status === 'paid' ? 'PAID' : 'UNPAID' }}
        </div>
      </div>

      <div class="stats-grid">
        <div class="stat-item">
          <span class="stat-label">Grooms</span>
          <span class="stat-value">{{ periodData?.totals?.booking_count || 0 }}</span>
        </div>

        <div class="stat-item">
          <span class="stat-label">Pre-tax Total</span>
          <span class="stat-value">{{ formatCurrency(periodData?.totals?.pre_tax_total || 0) }}</span>
        </div>

        <div class="stat-item">
          <span class="stat-label">Tips</span>
          <span class="stat-value tip">{{ formatCurrency(periodData?.totals?.tips || 0) }}</span>
        </div>

        <div class="stat-item">
          <span class="stat-label">Commission ({{ formatPercent(commissionRate) }})</span>
          <span class="stat-value">{{ formatCurrency(periodData?.totals?.commission_earnings || 0) }}</span>
        </div>
      </div>

      <div class="total-section">
        <div class="total-row">
          <span class="total-label">TOTAL PAYOUT</span>
          <span class="total-value">{{ formatCurrency(periodData?.totals?.total_payout || 0) }}</span>
        </div>
        <div class="formula-hint">
          (Pre-tax x {{ formatPercent(commissionRate) }}) + Tips
        </div>
      </div>

      <div class="actions">
        <button
          *ngIf="periodData?.payout?.status !== 'paid'"
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
      </div>
    </div>
  `,
  styles: [`
    .summary-card {
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

    .stats-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 1rem;
      margin-bottom: 1rem;

      @media (min-width: 640px) {
        grid-template-columns: repeat(4, 1fr);
      }
    }

    .stat-item {
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
    }

    .stat-label {
      font-size: 0.75rem;
      color: #6b7280;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    .stat-value {
      font-size: 1.25rem;
      font-weight: 600;
      color: #111827;

      &.tip {
        color: #10b981;
      }
    }

    .total-section {
      background: #f9fafb;
      border-radius: 8px;
      padding: 1rem;
      margin-bottom: 1rem;
    }

    .total-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .total-label {
      font-size: 0.875rem;
      font-weight: 600;
      color: #374151;
    }

    .total-value {
      font-size: 1.5rem;
      font-weight: 700;
      color: #111827;
    }

    .formula-hint {
      font-size: 0.75rem;
      color: #9ca3af;
      margin-top: 0.25rem;
    }

    .actions {
      display: flex;
      justify-content: flex-end;
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
  `]
})
export class PayrollSummaryCardComponent {
  @Input() periodData: PayPeriodData | null = null;
  @Input() commissionRate: number = 0.35;

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
