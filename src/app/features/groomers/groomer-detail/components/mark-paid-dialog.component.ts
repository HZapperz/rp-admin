import { Component, Input, Output, EventEmitter, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PayPeriodData } from '../../../../core/models/types';

export interface PaymentDetails {
  paid_amount: number;
  payment_method: string;
  payment_reference?: string;
  notes?: string;
}

@Component({
  selector: 'app-mark-paid-dialog',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="dialog-overlay" *ngIf="isOpen" (click)="onClose()">
      <div class="dialog" (click)="$event.stopPropagation()">
        <div class="dialog-header">
          <h2>Mark Period as Paid</h2>
          <button class="close-btn" (click)="onClose()">
            <span class="material-icons">close</span>
          </button>
        </div>

        <div class="dialog-body">
          <div class="period-info">
            <span class="period-label">{{ periodData?.period_label }}</span>
            <span class="period-dates">{{ periodData?.period_start }} to {{ periodData?.period_end }}</span>
          </div>

          <div class="form-group">
            <label for="amount">Payment Amount</label>
            <div class="amount-input-wrapper">
              <span class="currency-symbol">$</span>
              <input
                type="number"
                id="amount"
                [(ngModel)]="paidAmount"
                step="0.01"
                min="0">
            </div>
            <span class="help-text">
              Calculated payout: {{ formatCurrency(periodData?.totals?.total_payout || 0) }}
            </span>
          </div>

          <div class="form-group">
            <label for="method">Payment Method</label>
            <select id="method" [(ngModel)]="paymentMethod">
              <option value="">Select method...</option>
              <option value="direct_deposit">Direct Deposit</option>
              <option value="check">Check</option>
              <option value="cash">Cash</option>
              <option value="venmo">Venmo</option>
              <option value="zelle">Zelle</option>
              <option value="other">Other</option>
            </select>
          </div>

          <div class="form-group">
            <label for="reference">Reference Number (Optional)</label>
            <input
              type="text"
              id="reference"
              [(ngModel)]="paymentReference"
              placeholder="Check #, transaction ID, etc.">
          </div>

          <div class="form-group">
            <label for="notes">Notes (Optional)</label>
            <textarea
              id="notes"
              [(ngModel)]="notes"
              rows="3"
              placeholder="Any additional notes..."></textarea>
          </div>
        </div>

        <div class="dialog-footer">
          <button class="btn-cancel" (click)="onClose()">Cancel</button>
          <button
            class="btn-confirm"
            (click)="onConfirm()"
            [disabled]="!isValid() || isSubmitting">
            <span class="material-icons" *ngIf="isSubmitting">sync</span>
            {{ isSubmitting ? 'Saving...' : 'Confirm Payment' }}
          </button>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .dialog-overlay {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1000;
      padding: 1rem;
    }

    .dialog {
      background: white;
      border-radius: 12px;
      width: 100%;
      max-width: 480px;
      max-height: 90vh;
      overflow-y: auto;
      box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1);
    }

    .dialog-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 1.25rem 1.5rem;
      border-bottom: 1px solid #e5e7eb;

      h2 {
        margin: 0;
        font-size: 1.25rem;
        font-weight: 600;
        color: #111827;
      }
    }

    .close-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 32px;
      height: 32px;
      border: none;
      background: transparent;
      border-radius: 8px;
      cursor: pointer;
      color: #6b7280;

      &:hover {
        background: #f3f4f6;
      }
    }

    .dialog-body {
      padding: 1.5rem;
    }

    .period-info {
      background: #f9fafb;
      border-radius: 8px;
      padding: 1rem;
      margin-bottom: 1.5rem;
      text-align: center;
    }

    .period-label {
      display: block;
      font-weight: 600;
      color: #111827;
      font-size: 1.125rem;
    }

    .period-dates {
      display: block;
      font-size: 0.875rem;
      color: #6b7280;
      margin-top: 0.25rem;
    }

    .form-group {
      margin-bottom: 1.25rem;

      label {
        display: block;
        font-size: 0.875rem;
        font-weight: 500;
        color: #374151;
        margin-bottom: 0.5rem;
      }

      input, select, textarea {
        width: 100%;
        padding: 0.75rem;
        border: 1px solid #d1d5db;
        border-radius: 8px;
        font-size: 0.875rem;
        transition: border-color 0.2s;

        &:focus {
          outline: none;
          border-color: #3b82f6;
          box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
        }
      }

      textarea {
        resize: vertical;
      }
    }

    .amount-input-wrapper {
      position: relative;
    }

    .currency-symbol {
      position: absolute;
      left: 0.75rem;
      top: 50%;
      transform: translateY(-50%);
      color: #6b7280;
      font-weight: 500;
    }

    .amount-input-wrapper input {
      padding-left: 1.75rem;
    }

    .help-text {
      display: block;
      font-size: 0.75rem;
      color: #6b7280;
      margin-top: 0.25rem;
    }

    .dialog-footer {
      display: flex;
      justify-content: flex-end;
      gap: 0.75rem;
      padding: 1.25rem 1.5rem;
      border-top: 1px solid #e5e7eb;
      background: #f9fafb;
    }

    .btn-cancel {
      padding: 0.75rem 1.25rem;
      border: 1px solid #d1d5db;
      background: white;
      border-radius: 8px;
      font-size: 0.875rem;
      font-weight: 500;
      color: #374151;
      cursor: pointer;

      &:hover {
        background: #f3f4f6;
      }
    }

    .btn-confirm {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.75rem 1.25rem;
      border: none;
      background: #10b981;
      border-radius: 8px;
      font-size: 0.875rem;
      font-weight: 500;
      color: white;
      cursor: pointer;

      &:hover:not(:disabled) {
        background: #059669;
      }

      &:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }

      .material-icons {
        font-size: 18px;
        animation: spin 1s linear infinite;
      }
    }

    @keyframes spin {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }
  `]
})
export class MarkPaidDialogComponent implements OnChanges {
  @Input() isOpen: boolean = false;
  @Input() periodData: PayPeriodData | null = null;
  @Input() groomerName: string = '';
  @Input() isSubmitting: boolean = false;

  @Output() close = new EventEmitter<void>();
  @Output() confirm = new EventEmitter<PaymentDetails>();

  paidAmount: number = 0;
  paymentMethod: string = '';
  paymentReference: string = '';
  notes: string = '';

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['periodData'] && this.periodData) {
      this.paidAmount = this.periodData.totals.total_payout;
    }
    if (changes['isOpen'] && this.isOpen) {
      this.resetForm();
    }
  }

  resetForm(): void {
    this.paidAmount = this.periodData?.totals.total_payout || 0;
    this.paymentMethod = '';
    this.paymentReference = '';
    this.notes = '';
  }

  isValid(): boolean {
    return this.paidAmount > 0 && this.paymentMethod !== '';
  }

  onClose(): void {
    this.close.emit();
  }

  onConfirm(): void {
    if (!this.isValid()) return;

    this.confirm.emit({
      paid_amount: this.paidAmount,
      payment_method: this.paymentMethod,
      payment_reference: this.paymentReference || undefined,
      notes: this.notes || undefined
    });
  }

  formatCurrency(amount: number): string {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount);
  }
}
