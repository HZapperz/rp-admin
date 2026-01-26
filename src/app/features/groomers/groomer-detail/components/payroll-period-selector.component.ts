import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { AvailablePayrollMonth } from '../../../../core/models/types';

export type SelectionMode = 'monthly' | 'custom';

@Component({
  selector: 'app-payroll-period-selector',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatDatepickerModule,
    MatNativeDateModule,
    MatFormFieldModule,
    MatInputModule
  ],
  template: `
    <div class="period-selector">
      <!-- Mode Toggle -->
      <div class="mode-toggle">
        <button
          class="toggle-btn"
          [class.active]="selectionMode === 'monthly'"
          (click)="setMode('monthly')">
          Monthly
        </button>
        <button
          class="toggle-btn"
          [class.active]="selectionMode === 'custom'"
          (click)="setMode('custom')">
          Custom Range
        </button>
      </div>

      <!-- Monthly Mode Controls -->
      <div *ngIf="selectionMode === 'monthly'" class="selector-controls">
        <button
          class="nav-btn"
          (click)="navigatePrevious()"
          [disabled]="!canNavigatePrevious()">
          <span class="material-icons">chevron_left</span>
        </button>

        <select
          class="month-select"
          [ngModel]="selectedMonthKey"
          (ngModelChange)="onMonthSelect($event)">
          <option *ngFor="let month of availableMonths" [value]="month.year + '-' + month.month">
            {{ month.label }} ({{ month.booking_count }} grooms)
          </option>
        </select>

        <button
          class="nav-btn"
          (click)="navigateNext()"
          [disabled]="!canNavigateNext()">
          <span class="material-icons">chevron_right</span>
        </button>
      </div>

      <!-- Custom Range Mode Controls -->
      <div *ngIf="selectionMode === 'custom'" class="custom-range-controls">
        <div class="date-inputs">
          <div class="date-field">
            <label>Start Date</label>
            <input
              type="date"
              [ngModel]="customStartDate"
              (ngModelChange)="onStartDateChange($event)"
              [max]="customEndDate || today"
              class="date-input"
            />
          </div>
          <span class="date-separator">to</span>
          <div class="date-field">
            <label>End Date</label>
            <input
              type="date"
              [ngModel]="customEndDate"
              (ngModelChange)="onEndDateChange($event)"
              [min]="customStartDate"
              [max]="today"
              class="date-input"
            />
          </div>
        </div>
        <button
          class="apply-btn"
          (click)="applyCustomRange()"
          [disabled]="!customStartDate || !customEndDate">
          <span class="material-icons">search</span>
          Apply
        </button>
      </div>
    </div>
  `,
  styles: [`
    .period-selector {
      display: flex;
      flex-direction: column;
      gap: 1rem;

      @media (min-width: 768px) {
        flex-direction: row;
        align-items: center;
      }
    }

    .mode-toggle {
      display: flex;
      background: #f3f4f6;
      border-radius: 8px;
      padding: 4px;
    }

    .toggle-btn {
      padding: 0.5rem 1rem;
      border: none;
      background: transparent;
      border-radius: 6px;
      font-size: 0.875rem;
      font-weight: 500;
      color: #6b7280;
      cursor: pointer;
      transition: all 0.2s;
      white-space: nowrap;

      &:hover:not(.active) {
        color: #374151;
      }

      &.active {
        background: white;
        color: #3b82f6;
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
      }
    }

    .selector-controls {
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    .nav-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 36px;
      height: 36px;
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      background: white;
      cursor: pointer;
      transition: all 0.2s;

      &:hover:not(:disabled) {
        background: #f3f4f6;
        border-color: #d1d5db;
      }

      &:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }

      .material-icons {
        font-size: 20px;
        color: #374151;
      }
    }

    .month-select {
      padding: 0.5rem 2rem 0.5rem 1rem;
      font-size: 1rem;
      font-weight: 500;
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      background: white;
      cursor: pointer;
      min-width: 220px;
      appearance: none;
      background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%23374151' d='M6 8L1 3h10z'/%3E%3C/svg%3E");
      background-repeat: no-repeat;
      background-position: right 0.75rem center;

      &:focus {
        outline: none;
        border-color: #3b82f6;
        box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
      }
    }

    .custom-range-controls {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;

      @media (min-width: 640px) {
        flex-direction: row;
        align-items: flex-end;
      }
    }

    .date-inputs {
      display: flex;
      align-items: flex-end;
      gap: 0.5rem;
      flex-wrap: wrap;
    }

    .date-field {
      display: flex;
      flex-direction: column;
      gap: 0.25rem;

      label {
        font-size: 0.75rem;
        font-weight: 500;
        color: #6b7280;
        text-transform: uppercase;
        letter-spacing: 0.05em;
      }
    }

    .date-input {
      padding: 0.5rem 0.75rem;
      font-size: 0.9375rem;
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      background: white;
      min-width: 140px;

      &:focus {
        outline: none;
        border-color: #3b82f6;
        box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
      }
    }

    .date-separator {
      color: #9ca3af;
      font-size: 0.875rem;
      padding-bottom: 0.5rem;
    }

    .apply-btn {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.5rem 1rem;
      background: #3b82f6;
      color: white;
      border: none;
      border-radius: 8px;
      font-size: 0.875rem;
      font-weight: 500;
      cursor: pointer;
      transition: background 0.2s;
      white-space: nowrap;

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

    /* Print styles */
    @media print {
      .mode-toggle,
      .nav-btn,
      .apply-btn {
        display: none;
      }

      .month-select,
      .date-input {
        border: none;
        background: transparent;
        font-weight: 600;
      }
    }
  `]
})
export class PayrollPeriodSelectorComponent {
  @Input() availableMonths: AvailablePayrollMonth[] = [];
  @Input() selectedYear: number = new Date().getFullYear();
  @Input() selectedMonth: number = new Date().getMonth();
  @Input() selectionMode: SelectionMode = 'monthly';
  @Input() customStartDate: string = '';
  @Input() customEndDate: string = '';

  @Output() periodChange = new EventEmitter<{ year: number; month: number }>();
  @Output() modeChange = new EventEmitter<SelectionMode>();
  @Output() customRangeChange = new EventEmitter<{ startDate: string; endDate: string }>();

  today: string = new Date().toISOString().split('T')[0];

  get selectedMonthKey(): string {
    return `${this.selectedYear}-${this.selectedMonth}`;
  }

  setMode(mode: SelectionMode): void {
    this.selectionMode = mode;
    this.modeChange.emit(mode);
  }

  onMonthSelect(key: string): void {
    const [year, month] = key.split('-').map(Number);
    this.periodChange.emit({ year, month });
  }

  onStartDateChange(date: string): void {
    this.customStartDate = date;
  }

  onEndDateChange(date: string): void {
    this.customEndDate = date;
  }

  applyCustomRange(): void {
    if (this.customStartDate && this.customEndDate) {
      this.customRangeChange.emit({
        startDate: this.customStartDate,
        endDate: this.customEndDate
      });
    }
  }

  navigatePrevious(): void {
    const currentIndex = this.getCurrentIndex();
    if (currentIndex < this.availableMonths.length - 1) {
      const prev = this.availableMonths[currentIndex + 1];
      this.periodChange.emit({ year: prev.year, month: prev.month });
    }
  }

  navigateNext(): void {
    const currentIndex = this.getCurrentIndex();
    if (currentIndex > 0) {
      const next = this.availableMonths[currentIndex - 1];
      this.periodChange.emit({ year: next.year, month: next.month });
    }
  }

  canNavigatePrevious(): boolean {
    const currentIndex = this.getCurrentIndex();
    return currentIndex < this.availableMonths.length - 1;
  }

  canNavigateNext(): boolean {
    const currentIndex = this.getCurrentIndex();
    return currentIndex > 0;
  }

  private getCurrentIndex(): number {
    return this.availableMonths.findIndex(
      m => m.year === this.selectedYear && m.month === this.selectedMonth
    );
  }
}
