import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { forkJoin } from 'rxjs';
import { BusinessSettingsService, OperatingDay, OperatingHours } from '../../../core/services/business-settings.service';
import { BusinessSettingsModalComponent } from '../../../shared/components/business-settings-modal/business-settings-modal.component';

interface DaySchedule {
  dayOfWeek: number;
  isOpen: boolean;
  opensAt?: string;
  closesAt?: string;
}

@Component({
  selector: 'app-profile-settings',
  standalone: true,
  imports: [CommonModule, BusinessSettingsModalComponent],
  template: `
    <div class="settings-page">
      <h1 class="page-title">Settings</h1>

      <!-- Business Hours Section -->
      <div class="settings-section">
        <div class="section-header">
          <div class="section-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"/>
              <polyline points="12 6 12 12 16 14"/>
            </svg>
          </div>
          <div class="section-info">
            <h2>Business Hours</h2>
            <p>Set your operating days and hours for appointments</p>
          </div>
          <button class="btn-edit" (click)="openBusinessSettings()">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
            Edit
          </button>
        </div>

        <div class="section-content">
          @if (isLoading) {
            <div class="loading-state">Loading...</div>
          } @else {
            <div class="hours-grid">
              @for (day of schedule; track day.dayOfWeek) {
                <div class="day-row" [class.closed]="!day.isOpen">
                  <span class="day-name">{{ getDayName(day.dayOfWeek) }}</span>
                  @if (day.isOpen && day.opensAt && day.closesAt) {
                    <span class="day-hours">{{ formatTime(day.opensAt) }} - {{ formatTime(day.closesAt) }}</span>
                  } @else {
                    <span class="day-closed">Closed</span>
                  }
                </div>
              }
            </div>
          }
        </div>
      </div>

      <!-- More settings sections can be added here -->
    </div>

    @if (showBusinessSettingsModal) {
      <app-business-settings-modal
        (close)="closeBusinessSettings()"
        (settingsSaved)="onBusinessSettingsSaved()">
      </app-business-settings-modal>
    }
  `,
  styles: [`
    .settings-page {
      max-width: 800px;
      margin: 0 auto;
      padding: 0 1rem;
    }

    .page-title {
      font-size: 1.5rem;
      font-weight: 700;
      color: #1e293b;
      margin: 0 0 1.5rem 0;

      @media (min-width: 769px) {
        font-size: 2rem;
        margin: 0 0 2rem 0;
      }
    }

    .settings-section {
      background: white;
      border-radius: 16px;
      border: 1px solid #e2e8f0;
      overflow: hidden;
      margin-bottom: 1.5rem;
    }

    .section-header {
      display: flex;
      align-items: center;
      gap: 1rem;
      padding: 1.25rem;
      border-bottom: 1px solid #f1f5f9;

      @media (min-width: 768px) {
        padding: 1.5rem;
      }
    }

    .section-icon {
      width: 44px;
      height: 44px;
      border-radius: 12px;
      background: #f1f5f9;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;

      svg {
        stroke: #64748b;
      }
    }

    .section-info {
      flex: 1;
      min-width: 0;

      h2 {
        font-size: 1rem;
        font-weight: 600;
        color: #1e293b;
        margin: 0 0 0.25rem 0;

        @media (min-width: 768px) {
          font-size: 1.125rem;
        }
      }

      p {
        font-size: 0.8125rem;
        color: #64748b;
        margin: 0;

        @media (min-width: 768px) {
          font-size: 0.875rem;
        }
      }
    }

    .btn-edit {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.5rem 1rem;
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      font-size: 0.875rem;
      font-weight: 500;
      color: #475569;
      cursor: pointer;
      transition: all 0.15s ease;

      &:hover {
        background: #f1f5f9;
        border-color: #cbd5e1;
      }

      svg {
        stroke: currentColor;
      }
    }

    .section-content {
      padding: 1.25rem;

      @media (min-width: 768px) {
        padding: 1.5rem;
      }
    }

    .loading-state {
      color: #64748b;
      text-align: center;
      padding: 1rem;
    }

    .hours-grid {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }

    .day-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 0.625rem 0.875rem;
      background: #f8fafc;
      border-radius: 8px;

      &.closed {
        opacity: 0.6;
      }
    }

    .day-name {
      font-size: 0.875rem;
      font-weight: 500;
      color: #1e293b;
    }

    .day-hours {
      font-size: 0.875rem;
      color: #475569;
    }

    .day-closed {
      font-size: 0.8125rem;
      color: #94a3b8;
      font-style: italic;
    }
  `]
})
export class ProfileSettingsComponent implements OnInit {
  schedule: DaySchedule[] = [];
  isLoading = true;
  showBusinessSettingsModal = false;

  private dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  constructor(private businessSettingsService: BusinessSettingsService) {}

  ngOnInit(): void {
    this.loadBusinessSettings();
  }

  private loadBusinessSettings(): void {
    this.isLoading = true;

    forkJoin({
      days: this.businessSettingsService.getOperatingDays(),
      hours: this.businessSettingsService.getOperatingHours()
    }).subscribe({
      next: ({ days, hours }) => {
        // Merge days and hours into a unified schedule
        this.schedule = days.map(day => {
          const dayHours = hours.find(h => h.day_of_week === day.day_of_week);
          return {
            dayOfWeek: day.day_of_week,
            isOpen: day.is_open,
            opensAt: dayHours?.opens_at,
            closesAt: dayHours?.closes_at
          };
        });
        this.isLoading = false;
      },
      error: (err) => {
        console.error('Error loading business settings:', err);
        this.isLoading = false;
      }
    });
  }

  getDayName(dayOfWeek: number): string {
    return this.dayNames[dayOfWeek] || '';
  }

  formatTime(time: string | undefined): string {
    if (!time) return '';
    const [hours, minutes] = time.split(':');
    const hour = parseInt(hours, 10);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour % 12 || 12;
    return `${displayHour}:${minutes} ${ampm}`;
  }

  openBusinessSettings(): void {
    this.showBusinessSettingsModal = true;
  }

  closeBusinessSettings(): void {
    this.showBusinessSettingsModal = false;
  }

  onBusinessSettingsSaved(): void {
    this.showBusinessSettingsModal = false;
    this.loadBusinessSettings();
  }
}
