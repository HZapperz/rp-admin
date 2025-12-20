import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AvailablePayrollMonth } from '../../../../core/models/types';

@Component({
  selector: 'app-payroll-period-selector',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="period-selector">
      <div class="selector-controls">
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
    </div>
  `,
  styles: [`
    .period-selector {
      display: flex;
      align-items: center;
      gap: 1rem;
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
  `]
})
export class PayrollPeriodSelectorComponent {
  @Input() availableMonths: AvailablePayrollMonth[] = [];
  @Input() selectedYear: number = new Date().getFullYear();
  @Input() selectedMonth: number = new Date().getMonth();

  @Output() periodChange = new EventEmitter<{ year: number; month: number }>();

  get selectedMonthKey(): string {
    return `${this.selectedYear}-${this.selectedMonth}`;
  }

  onMonthSelect(key: string): void {
    const [year, month] = key.split('-').map(Number);
    this.periodChange.emit({ year, month });
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
