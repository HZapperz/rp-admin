import { Component, Input, Output, EventEmitter, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PayPeriodData, WeekData } from '../../../../core/models/types';

export interface MiscAdjustment {
  weekStart: string;
  amount: number;
  note?: string;
}

@Component({
  selector: 'app-payroll-summary-table',
  standalone: true,
  imports: [CommonModule, FormsModule],
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
              <th class="number-col misc-col">Misc</th>
              <th class="number-col total-col">Total</th>
            </tr>
          </thead>
          <tbody>
            <tr *ngFor="let week of periodData?.weeks; let i = index">
              <td class="week-col">{{ week.week_label }}</td>
              <td class="number-col">{{ formatCurrency(week.totals.commission_earnings) }}</td>
              <td class="number-col tips">{{ formatCurrency(week.totals.tips) }}</td>
              <td class="number-col placeholder">{{ week.totals.hourly_pay > 0 ? formatCurrency(week.totals.hourly_pay) : '-' }}</td>
              <td class="number-col misc-cell" [class.editing]="editingWeekIndex === i" [class.has-value]="getMiscValue(week) !== 0">
                <!-- Display mode -->
                <div *ngIf="editingWeekIndex !== i && !isPaid" class="misc-display" (click)="startEditMisc(i, week)">
                  <span class="misc-value" [class.positive]="getMiscValue(week) > 0" [class.negative]="getMiscValue(week) < 0">
                    {{ getMiscValue(week) !== 0 ? formatCurrency(getMiscValue(week)) : '-' }}
                  </span>
                  <span class="edit-hint material-icons">edit</span>
                </div>
                <!-- Read-only when paid -->
                <div *ngIf="isPaid" class="misc-readonly">
                  <span [class.positive]="getMiscValue(week) > 0" [class.negative]="getMiscValue(week) < 0">
                    {{ getMiscValue(week) !== 0 ? formatCurrency(getMiscValue(week)) : '-' }}
                  </span>
                </div>
                <!-- Edit mode -->
                <div *ngIf="editingWeekIndex === i && !isPaid" class="misc-edit">
                  <input
                    type="number"
                    [(ngModel)]="editingMiscValue"
                    (keydown.enter)="saveMisc(week)"
                    (keydown.escape)="cancelEditMisc()"
                    (blur)="saveMisc(week)"
                    class="misc-input"
                    step="0.01"
                    placeholder="0.00"
                    #miscInput
                  />
                </div>
              </td>
              <td class="number-col total-col">{{ formatCurrency(getWeekTotal(week)) }}</td>
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
              <td class="number-col misc-total" [class.has-value]="getTotalMisc() !== 0">
                <strong [class.positive]="getTotalMisc() > 0" [class.negative]="getTotalMisc() < 0">
                  {{ getTotalMisc() !== 0 ? formatCurrency(getTotalMisc()) : '-' }}
                </strong>
              </td>
              <td class="number-col total-col"><strong>{{ formatCurrency(getGrandTotal()) }}</strong></td>
            </tr>
          </tfoot>
        </table>
      </div>

      <div class="misc-hint" *ngIf="!isPaid && periodData?.weeks?.length">
        <span class="material-icons">info</span>
        Click on Misc values to add bonuses (+) or deductions (-)
      </div>

      <div class="summary-footer">
        <div class="groom-count">
          <span class="material-icons">pets</span>
          {{ periodData?.totals?.booking_count || 0 }} grooms completed
        </div>

        <div class="actions">
          <button
            *ngIf="!isPaid && !isCustomRange"
            class="mark-paid-btn"
            (click)="onMarkAsPaid()"
            [disabled]="!periodData?.totals?.booking_count">
            <span class="material-icons">payments</span>
            Mark as Paid
          </button>

          <div *ngIf="isPaid" class="paid-info">
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

      .misc-col {
        min-width: 100px;
      }

      .misc-cell {
        position: relative;

        &.has-value {
          .misc-value {
            font-weight: 500;
          }
        }
      }

      .misc-display {
        display: flex;
        align-items: center;
        justify-content: flex-end;
        gap: 0.25rem;
        cursor: pointer;
        padding: 0.25rem 0.5rem;
        margin: -0.25rem -0.5rem;
        border-radius: 4px;
        transition: background 0.2s;

        &:hover {
          background: #f3f4f6;

          .edit-hint {
            opacity: 1;
          }
        }

        .edit-hint {
          font-size: 14px;
          color: #9ca3af;
          opacity: 0;
          transition: opacity 0.2s;
        }
      }

      .misc-readonly {
        text-align: right;
      }

      .misc-value, .misc-readonly span {
        color: #9ca3af;

        &.positive {
          color: #10b981;
        }

        &.negative {
          color: #ef4444;
        }
      }

      .misc-edit {
        .misc-input {
          width: 80px;
          padding: 0.375rem 0.5rem;
          border: 2px solid #3b82f6;
          border-radius: 4px;
          font-family: 'Monaco', 'Courier New', monospace;
          font-size: 0.9375rem;
          text-align: right;

          &:focus {
            outline: none;
            box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.2);
          }
        }
      }

      .misc-total {
        &.has-value strong {
          &.positive {
            color: #10b981;
          }

          &.negative {
            color: #ef4444;
          }
        }
      }
    }

    .misc-hint {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      margin-top: 0.75rem;
      padding: 0.5rem 0.75rem;
      background: #f0f9ff;
      border-radius: 6px;
      font-size: 0.8125rem;
      color: #0369a1;

      .material-icons {
        font-size: 16px;
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
      .custom-range-note,
      .misc-hint,
      .edit-hint {
        display: none !important;
      }

      .misc-display {
        cursor: default;
        &:hover {
          background: transparent;
        }
      }

      .summary-table {
        th, td {
          border: 1px solid #ccc;
        }
      }
    }
  `]
})
export class PayrollSummaryTableComponent implements OnChanges {
  @Input() periodData: PayPeriodData | null = null;
  @Input() commissionRate: number = 0.35;
  @Input() isCustomRange: boolean = false;

  @Output() markAsPaid = new EventEmitter<void>();
  @Output() miscAdjustmentsChange = new EventEmitter<MiscAdjustment[]>();

  // Misc adjustments stored by week_start key
  miscAdjustments: Map<string, number> = new Map();

  // Editing state
  editingWeekIndex: number | null = null;
  editingMiscValue: number = 0;

  get isPaid(): boolean {
    return this.periodData?.payout?.status === 'paid';
  }

  ngOnChanges(changes: SimpleChanges): void {
    // Reset misc adjustments when period data changes
    if (changes['periodData'] && this.periodData) {
      // Initialize misc adjustments from existing data
      this.periodData.weeks.forEach(week => {
        if (week.totals.misc_adjustments !== 0) {
          this.miscAdjustments.set(week.week_start, week.totals.misc_adjustments);
        }
      });
    }
  }

  getMiscValue(week: WeekData): number {
    return this.miscAdjustments.get(week.week_start) ?? week.totals.misc_adjustments ?? 0;
  }

  getWeekTotal(week: WeekData): number {
    const misc = this.getMiscValue(week);
    return week.totals.commission_earnings + week.totals.tips + week.totals.hourly_pay + misc;
  }

  getTotalMisc(): number {
    let total = 0;
    this.periodData?.weeks.forEach(week => {
      total += this.getMiscValue(week);
    });
    return total;
  }

  getGrandTotal(): number {
    const basePayout = this.periodData?.totals?.total_payout || 0;
    const miscTotal = this.getTotalMisc();
    // Subtract the original misc (already in total_payout) and add new misc
    const originalMisc = this.periodData?.weeks.reduce((sum, w) => sum + (w.totals.misc_adjustments || 0), 0) || 0;
    return basePayout - originalMisc + miscTotal;
  }

  startEditMisc(index: number, week: WeekData): void {
    if (this.isPaid) return;
    this.editingWeekIndex = index;
    this.editingMiscValue = this.getMiscValue(week);
    // Focus input after view updates
    setTimeout(() => {
      const input = document.querySelector('.misc-input') as HTMLInputElement;
      if (input) {
        input.focus();
        input.select();
      }
    }, 0);
  }

  saveMisc(week: WeekData): void {
    if (this.editingWeekIndex === null) return;

    const value = this.editingMiscValue || 0;

    if (value === 0) {
      this.miscAdjustments.delete(week.week_start);
    } else {
      this.miscAdjustments.set(week.week_start, value);
    }

    // Update the week data directly
    week.totals.misc_adjustments = value;

    this.editingWeekIndex = null;
    this.emitMiscChanges();
  }

  cancelEditMisc(): void {
    this.editingWeekIndex = null;
  }

  private emitMiscChanges(): void {
    const adjustments: MiscAdjustment[] = [];
    this.miscAdjustments.forEach((amount, weekStart) => {
      adjustments.push({ weekStart, amount });
    });
    this.miscAdjustmentsChange.emit(adjustments);
  }

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
