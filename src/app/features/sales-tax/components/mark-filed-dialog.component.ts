import { Component, Input, Output, EventEmitter, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { QuarterlyTaxSummary } from '../../../core/models/types';

export interface FilingDetails {
  filed_date: string;
  confirmation_number: string;
  amount_remitted: number;
  payment_method: string;
  notes?: string;
}

@Component({
  selector: 'app-mark-filed-dialog',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="dialog-overlay" *ngIf="isOpen" (click)="onClose()">
      <div class="dialog" (click)="$event.stopPropagation()">
        <div class="dialog-header">
          <h2>Mark Quarter as Filed</h2>
          <button class="close-btn" (click)="onClose()">
            <span class="material-icons">close</span>
          </button>
        </div>

        <div class="dialog-body">
          <div class="quarter-info">
            <span class="quarter-label">{{ quarter?.label }}</span>
            <span class="quarter-dates">{{ quarter?.period_start }} to {{ quarter?.period_end }}</span>
            <span class="quarter-deadline">Filing deadline: {{ quarter?.deadline }}</span>
          </div>

          <div class="tax-summary">
            <div class="summary-row">
              <span>Tax Collected</span>
              <strong>{{ formatCurrency(quarter?.tax_collected || 0) }}</strong>
            </div>
            <div class="summary-row">
              <span>Taxable Revenue</span>
              <span>{{ formatCurrency(quarter?.taxable_revenue || 0) }}</span>
            </div>
            <div class="summary-row">
              <span>Completed Bookings</span>
              <span>{{ quarter?.booking_count || 0 }}</span>
            </div>
          </div>

          <div class="form-group">
            <label for="filedDate">Filed Date</label>
            <input
              type="date"
              id="filedDate"
              [(ngModel)]="filedDate">
          </div>

          <div class="form-group">
            <label for="confirmationNumber">Confirmation Number</label>
            <input
              type="text"
              id="confirmationNumber"
              [(ngModel)]="confirmationNumber"
              placeholder="TX Comptroller WebFile confirmation #">
          </div>

          <div class="form-group">
            <label for="amountRemitted">Amount Remitted</label>
            <div class="amount-input-wrapper">
              <span class="currency-symbol">$</span>
              <input
                type="number"
                id="amountRemitted"
                [(ngModel)]="amountRemitted"
                step="0.01"
                min="0">
            </div>
            <span class="help-text">
              Tax collected this quarter: {{ formatCurrency(quarter?.tax_collected || 0) }}
            </span>
          </div>

          <div class="form-group">
            <label for="paymentMethod">Payment Method</label>
            <select id="paymentMethod" [(ngModel)]="paymentMethod">
              <option value="">Select method...</option>
              <option value="webfile_eft">WebFile (EFT)</option>
              <option value="webfile_card">WebFile (Credit Card)</option>
              <option value="check">Check</option>
              <option value="eft">Direct EFT</option>
            </select>
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
            <span class="material-icons spinning" *ngIf="isSubmitting">sync</span>
            {{ isSubmitting ? 'Saving...' : 'Mark as Filed' }}
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
      max-width: 500px;
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

    .quarter-info {
      background: #f9fafb;
      border-radius: 8px;
      padding: 1rem;
      margin-bottom: 1rem;
      text-align: center;
    }

    .quarter-label {
      display: block;
      font-weight: 600;
      color: #111827;
      font-size: 1.125rem;
    }

    .quarter-dates {
      display: block;
      font-size: 0.875rem;
      color: #6b7280;
      margin-top: 0.25rem;
    }

    .quarter-deadline {
      display: block;
      font-size: 0.75rem;
      color: #9ca3af;
      margin-top: 0.25rem;
    }

    .tax-summary {
      background: #eff6ff;
      border: 1px solid #bfdbfe;
      border-radius: 8px;
      padding: 0.75rem 1rem;
      margin-bottom: 1.5rem;
    }

    .summary-row {
      display: flex;
      justify-content: space-between;
      padding: 0.25rem 0;
      font-size: 0.875rem;
      color: #1e40af;

      strong {
        font-weight: 600;
      }
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
        box-sizing: border-box;

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
      border-radius: 0 0 12px 12px;
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
    }

    .spinning {
      font-size: 18px;
      animation: spin 1s linear infinite;
    }

    @keyframes spin {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }
  `]
})
export class MarkFiledDialogComponent implements OnChanges {
  @Input() isOpen: boolean = false;
  @Input() quarter: QuarterlyTaxSummary | null = null;
  @Input() isSubmitting: boolean = false;

  @Output() close = new EventEmitter<void>();
  @Output() confirm = new EventEmitter<FilingDetails>();

  filedDate: string = '';
  confirmationNumber: string = '';
  amountRemitted: number = 0;
  paymentMethod: string = '';
  notes: string = '';

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['isOpen'] && this.isOpen) {
      this.resetForm();
    }
  }

  resetForm(): void {
    const today = new Date();
    this.filedDate = today.toISOString().split('T')[0];
    this.amountRemitted = this.quarter?.tax_collected || 0;
    this.confirmationNumber = '';
    this.paymentMethod = '';
    this.notes = '';
  }

  isValid(): boolean {
    return (
      this.filedDate !== '' &&
      this.confirmationNumber.trim() !== '' &&
      this.amountRemitted > 0 &&
      this.paymentMethod !== ''
    );
  }

  onClose(): void {
    this.close.emit();
  }

  onConfirm(): void {
    if (!this.isValid()) return;

    this.confirm.emit({
      filed_date: this.filedDate,
      confirmation_number: this.confirmationNumber.trim(),
      amount_remitted: this.amountRemitted,
      payment_method: this.paymentMethod,
      notes: this.notes.trim() || undefined
    });
  }

  formatCurrency(amount: number): string {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount);
  }
}
