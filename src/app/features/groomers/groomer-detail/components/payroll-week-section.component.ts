import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { WeekData, GroomDetail } from '../../../../core/models/types';

@Component({
  selector: 'app-payroll-week-section',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="week-section">
      <button class="week-header" (click)="toggleExpand()">
        <div class="header-left">
          <span class="material-icons expand-icon">
            {{ isExpanded ? 'expand_more' : 'chevron_right' }}
          </span>
          <span class="week-label">{{ weekData.week_label }}</span>
        </div>
        <div class="header-right">
          <span class="week-payout">{{ formatCurrency(weekData.totals.total_payout) }}</span>
          <span class="week-count">{{ weekData.totals.booking_count }} groom{{ weekData.totals.booking_count !== 1 ? 's' : '' }}</span>
        </div>
      </button>

      <div class="week-content" *ngIf="isExpanded">
        <div class="grooms-table">
          <div class="table-header">
            <span class="col-date">Date</span>
            <span class="col-client">Client</span>
            <span class="col-pets">Pets / Services</span>
            <span class="col-pretax">Pre-tax</span>
            <span class="col-tip">Tip</span>
            <span class="col-cut">Cut</span>
          </div>

          <div class="groom-row" *ngFor="let groom of weekData.grooms">
            <span class="col-date">{{ formatDate(groom.scheduled_date) }}</span>
            <span class="col-client">{{ groom.client.first_name }} {{ groom.client.last_name }}</span>
            <div class="col-pets">
              <div class="pet-item" *ngFor="let pet of groom.pets">
                <span class="pet-name">{{ pet.pet_name }}</span>
                <span class="pet-package">({{ pet.package_type }})</span>
                <div class="pet-addons" *ngIf="pet.addons.length > 0">
                  <span class="addon" *ngFor="let addon of pet.addons">
                    + {{ addon.addon_name }} {{ formatCurrency(addon.addon_price) }}
                  </span>
                </div>
              </div>
            </div>
            <span class="col-pretax">{{ formatCurrency(groom.pre_tax_amount) }}</span>
            <span class="col-tip" [class.has-tip]="groom.tip_amount > 0">
              {{ groom.tip_amount > 0 ? formatCurrency(groom.tip_amount) : '-' }}
            </span>
            <span class="col-cut">{{ formatCurrency(groom.groomer_cut) }}</span>
          </div>
        </div>

        <!-- Mobile view -->
        <div class="grooms-mobile">
          <div class="groom-card" *ngFor="let groom of weekData.grooms">
            <div class="groom-card-header">
              <span class="groom-date">{{ formatDate(groom.scheduled_date) }}</span>
              <span class="groom-cut">{{ formatCurrency(groom.groomer_cut) }}</span>
            </div>
            <div class="groom-card-client">
              {{ groom.client.first_name }} {{ groom.client.last_name }}
            </div>
            <div class="groom-card-pets">
              <div class="pet-item" *ngFor="let pet of groom.pets">
                <span class="pet-name">{{ pet.pet_name }}</span>
                <span class="pet-package">({{ pet.package_type }})</span>
                <div class="pet-addons" *ngIf="pet.addons.length > 0">
                  <span class="addon" *ngFor="let addon of pet.addons">
                    + {{ addon.addon_name }}
                  </span>
                </div>
              </div>
            </div>
            <div class="groom-card-financials">
              <span>Pre-tax: {{ formatCurrency(groom.pre_tax_amount) }}</span>
              <span *ngIf="groom.tip_amount > 0" class="tip">Tip: {{ formatCurrency(groom.tip_amount) }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .week-section {
      background: white;
      border-radius: 8px;
      border: 1px solid #e5e7eb;
      margin-bottom: 0.5rem;
      overflow: hidden;
    }

    .week-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      width: 100%;
      padding: 1rem;
      background: #f9fafb;
      border: none;
      cursor: pointer;
      transition: background 0.2s;

      &:hover {
        background: #f3f4f6;
      }
    }

    .header-left {
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    .expand-icon {
      font-size: 20px;
      color: #6b7280;
    }

    .week-label {
      font-weight: 500;
      color: #111827;
    }

    .header-right {
      display: flex;
      align-items: center;
      gap: 1rem;
    }

    .week-payout {
      font-weight: 600;
      color: #111827;
    }

    .week-count {
      font-size: 0.875rem;
      color: #6b7280;
    }

    .week-content {
      border-top: 1px solid #e5e7eb;
    }

    .grooms-table {
      display: none;

      @media (min-width: 768px) {
        display: block;
      }
    }

    .table-header {
      display: grid;
      grid-template-columns: 100px 150px 1fr 100px 80px 100px;
      gap: 0.5rem;
      padding: 0.75rem 1rem;
      background: #f9fafb;
      font-size: 0.75rem;
      font-weight: 600;
      color: #6b7280;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    .groom-row {
      display: grid;
      grid-template-columns: 100px 150px 1fr 100px 80px 100px;
      gap: 0.5rem;
      padding: 0.75rem 1rem;
      border-bottom: 1px solid #f3f4f6;
      font-size: 0.875rem;
      align-items: start;

      &:last-child {
        border-bottom: none;
      }
    }

    .col-date {
      color: #374151;
    }

    .col-client {
      color: #111827;
      font-weight: 500;
    }

    .col-pets {
      color: #374151;
    }

    .pet-item {
      margin-bottom: 0.25rem;

      &:last-child {
        margin-bottom: 0;
      }
    }

    .pet-name {
      font-weight: 500;
    }

    .pet-package {
      color: #6b7280;
      font-size: 0.8125rem;
    }

    .pet-addons {
      margin-left: 0.5rem;
      font-size: 0.8125rem;
      color: #6b7280;
    }

    .addon {
      display: block;
    }

    .col-pretax, .col-cut {
      font-weight: 500;
      color: #111827;
      text-align: right;
    }

    .col-tip {
      text-align: right;
      color: #9ca3af;

      &.has-tip {
        color: #10b981;
        font-weight: 500;
      }
    }

    /* Mobile grooms view */
    .grooms-mobile {
      display: block;
      padding: 0.5rem;

      @media (min-width: 768px) {
        display: none;
      }
    }

    .groom-card {
      background: #f9fafb;
      border-radius: 8px;
      padding: 1rem;
      margin-bottom: 0.5rem;

      &:last-child {
        margin-bottom: 0;
      }
    }

    .groom-card-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 0.5rem;
    }

    .groom-date {
      font-size: 0.875rem;
      color: #6b7280;
    }

    .groom-cut {
      font-weight: 600;
      color: #111827;
    }

    .groom-card-client {
      font-weight: 500;
      color: #111827;
      margin-bottom: 0.5rem;
    }

    .groom-card-pets {
      font-size: 0.875rem;
      color: #374151;
      margin-bottom: 0.5rem;
    }

    .groom-card-financials {
      display: flex;
      gap: 1rem;
      font-size: 0.8125rem;
      color: #6b7280;

      .tip {
        color: #10b981;
      }
    }
  `]
})
export class PayrollWeekSectionComponent {
  @Input() weekData!: WeekData;
  @Input() isExpanded: boolean = false;

  @Output() toggleExpandEvent = new EventEmitter<void>();

  toggleExpand(): void {
    this.toggleExpandEvent.emit();
  }

  formatCurrency(amount: number): string {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount);
  }

  formatDate(dateString: string): string {
    const date = new Date(dateString + 'T00:00:00Z');
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      timeZone: 'UTC'
    });
  }
}
