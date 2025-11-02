import { Component, Output, EventEmitter, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  BusinessSettingsService,
  OperatingDay,
  OperatingHours,
  Holiday,
  SpecialHours,
  BookingConflict
} from '../../../core/services/business-settings.service';

interface DayConfig {
  dayOfWeek: number;
  dayName: string;
  isOpen: boolean;
  opensAt: string;
  closesAt: string;
  breakStart: string;
  breakEnd: string;
  hasBreak: boolean;
}

@Component({
  selector: 'app-business-settings-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './business-settings-modal.component.html',
  styleUrls: ['./business-settings-modal.component.scss']
})
export class BusinessSettingsModalComponent implements OnInit {
  @Output() close = new EventEmitter<void>();
  @Output() settingsSaved = new EventEmitter<void>();

  // Active tab
  activeTab: 'days' | 'hours' | 'holidays' | 'special' = 'days';

  // Days configuration
  daysConfig: DayConfig[] = [];
  originalDaysConfig: DayConfig[] = [];

  // Holidays
  holidays: Holiday[] = [];
  newHoliday = {
    date: '',
    name: '',
    is_recurring: true,
    description: ''
  };

  // Special hours
  specialHours: SpecialHours[] = [];
  newSpecialHours = {
    date: '',
    opens_at: '',
    closes_at: '',
    is_closed: false,
    reason: ''
  };

  // UI state
  loading = false;
  saving = false;
  showConflictDialog = false;
  conflicts: BookingConflict[] = [];
  error: string = '';
  success: string = '';

  // For calendar display
  currentYear = new Date().getFullYear();

  constructor(private businessSettingsService: BusinessSettingsService) {}

  ngOnInit() {
    this.loadAllData();
  }

  loadAllData() {
    this.loading = true;
    this.error = '';

    // Load operating days and hours
    this.businessSettingsService.getOperatingDays().subscribe(days => {
      this.businessSettingsService.getOperatingHours().subscribe(hours => {
        this.initializeDaysConfig(days, hours);
        this.originalDaysConfig = JSON.parse(JSON.stringify(this.daysConfig));
        this.loading = false;
      });
    });

    // Load holidays
    this.businessSettingsService.getHolidays(this.currentYear).subscribe(holidays => {
      this.holidays = holidays;
    });

    // Load special hours (next 90 days)
    const today = new Date().toISOString().split('T')[0];
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 90);
    const endDate = futureDate.toISOString().split('T')[0];

    this.businessSettingsService.getSpecialHours(today, endDate).subscribe(special => {
      this.specialHours = special;
    });
  }

  initializeDaysConfig(days: OperatingDay[], hours: OperatingHours[]) {
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

    this.daysConfig = dayNames.map((name, index) => {
      const day = days.find(d => d.day_of_week === index);
      const hour = hours.find(h => h.day_of_week === index);

      return {
        dayOfWeek: index,
        dayName: name,
        isOpen: day?.is_open || false,
        opensAt: hour?.opens_at || '08:30:00',
        closesAt: hour?.closes_at || '17:00:00',
        breakStart: hour?.break_start || '12:00:00',
        breakEnd: hour?.break_end || '13:00:00',
        hasBreak: !!(hour?.break_start && hour?.break_end)
      };
    });
  }

  // =======================
  // TAB NAVIGATION
  // =======================

  setActiveTab(tab: 'days' | 'hours' | 'holidays' | 'special') {
    this.activeTab = tab;
    this.error = '';
    this.success = '';
  }

  // =======================
  // SAVE HANDLERS
  // =======================

  async saveAllSettings() {
    // Check which days are being closed
    const closedDays = this.daysConfig
      .filter((day, index) => {
        const originalDay = this.originalDaysConfig[index];
        return originalDay.isOpen && !day.isOpen;
      })
      .map(day => day.dayOfWeek);

    // If days are being closed, check for conflicts
    if (closedDays.length > 0) {
      this.checkConflicts(closedDays);
    } else {
      await this.performSave();
    }
  }

  checkConflicts(closedDays: number[]) {
    this.loading = true;
    this.businessSettingsService.checkBookingConflicts(closedDays).subscribe(conflicts => {
      this.loading = false;
      if (conflicts.length > 0) {
        this.conflicts = conflicts;
        this.showConflictDialog = true;
      } else {
        this.performSave();
      }
    });
  }

  async confirmAndCancelBookings() {
    this.saving = true;
    const bookingIds = this.conflicts.map(c => c.id);

    this.businessSettingsService.cancelAffectedBookings(
      bookingIds,
      'Business operating hours changed'
    ).subscribe(success => {
      if (success) {
        this.showConflictDialog = false;
        this.performSave();
      } else {
        this.saving = false;
        this.error = 'Failed to cancel affected bookings. Please try again.';
      }
    });
  }

  async performSave() {
    this.saving = true;
    this.error = '';

    try {
      // Save operating days
      const dayUpdates = this.daysConfig.map(day => ({
        day_of_week: day.dayOfWeek,
        is_open: day.isOpen
      }));

      const daysSuccess = await new Promise<boolean>(resolve => {
        this.businessSettingsService.bulkUpdateOperatingDays(dayUpdates).subscribe(resolve);
      });

      if (!daysSuccess) {
        throw new Error('Failed to update operating days');
      }

      // Save operating hours for open days
      for (const day of this.daysConfig) {
        if (day.isOpen) {
          // Validate hours
          const validation = this.businessSettingsService.validateOperatingHours({
            opens_at: day.opensAt,
            closes_at: day.closesAt,
            break_start: day.hasBreak ? day.breakStart : null,
            break_end: day.hasBreak ? day.breakEnd : null
          });

          if (!validation.valid) {
            throw new Error(`${day.dayName}: ${validation.error}`);
          }

          const hoursSuccess = await new Promise<boolean>(resolve => {
            this.businessSettingsService.updateOperatingHours(day.dayOfWeek, {
              opens_at: day.opensAt,
              closes_at: day.closesAt,
              break_start: day.hasBreak ? day.breakStart : null,
              break_end: day.hasBreak ? day.breakEnd : null
            }).subscribe(resolve);
          });

          if (!hoursSuccess) {
            throw new Error(`Failed to update hours for ${day.dayName}`);
          }
        }
      }

      this.success = 'Settings saved successfully!';
      this.originalDaysConfig = JSON.parse(JSON.stringify(this.daysConfig));
      this.settingsSaved.emit();

      // Auto-close success message after 2 seconds
      setTimeout(() => {
        this.success = '';
      }, 2000);

    } catch (err: any) {
      this.error = err.message || 'Failed to save settings';
    } finally {
      this.saving = false;
    }
  }

  // =======================
  // HOLIDAYS
  // =======================

  addHoliday() {
    if (!this.newHoliday.date || !this.newHoliday.name) {
      this.error = 'Please provide both date and name for the holiday';
      return;
    }

    this.saving = true;
    this.businessSettingsService.addHoliday(this.newHoliday).subscribe(success => {
      this.saving = false;
      if (success) {
        this.loadAllData(); // Reload to get new holiday
        this.newHoliday = {
          date: '',
          name: '',
          is_recurring: true,
          description: ''
        };
        this.success = 'Holiday added successfully!';
        setTimeout(() => this.success = '', 2000);
      } else {
        this.error = 'Failed to add holiday';
      }
    });
  }

  deleteHoliday(id: string) {
    if (!confirm('Are you sure you want to delete this holiday?')) {
      return;
    }

    this.businessSettingsService.deleteHoliday(id).subscribe(success => {
      if (success) {
        this.holidays = this.holidays.filter(h => h.id !== id);
        this.success = 'Holiday deleted successfully!';
        setTimeout(() => this.success = '', 2000);
      } else {
        this.error = 'Failed to delete holiday';
      }
    });
  }

  // =======================
  // SPECIAL HOURS
  // =======================

  addSpecialHours() {
    if (!this.newSpecialHours.date) {
      this.error = 'Please provide a date';
      return;
    }

    if (!this.newSpecialHours.is_closed && (!this.newSpecialHours.opens_at || !this.newSpecialHours.closes_at)) {
      this.error = 'Please provide opening and closing times, or mark as closed';
      return;
    }

    this.saving = true;
    this.businessSettingsService.addSpecialHours(this.newSpecialHours).subscribe(success => {
      this.saving = false;
      if (success) {
        this.loadAllData(); // Reload to get new special hours
        this.newSpecialHours = {
          date: '',
          opens_at: '',
          closes_at: '',
          is_closed: false,
          reason: ''
        };
        this.success = 'Special hours added successfully!';
        setTimeout(() => this.success = '', 2000);
      } else {
        this.error = 'Failed to add special hours';
      }
    });
  }

  deleteSpecialHours(id: string) {
    if (!confirm('Are you sure you want to delete this special hours entry?')) {
      return;
    }

    this.businessSettingsService.deleteSpecialHours(id).subscribe(success => {
      if (success) {
        this.specialHours = this.specialHours.filter(s => s.id !== id);
        this.success = 'Special hours deleted successfully!';
        setTimeout(() => this.success = '', 2000);
      } else {
        this.error = 'Failed to delete special hours';
      }
    });
  }

  // =======================
  // HELPER METHODS
  // =======================

  formatTime(timeString: string): string {
    return this.businessSettingsService.formatTime(timeString);
  }

  formatDate(dateString: string): string {
    const date = new Date(dateString + 'T00:00:00');
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  }

  closeModal() {
    if (this.saving) return;
    this.close.emit();
  }

  closeConflictDialog() {
    this.showConflictDialog = false;
    this.conflicts = [];
  }
}
