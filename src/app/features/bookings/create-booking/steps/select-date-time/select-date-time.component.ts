import { Component, EventEmitter, Input, OnInit, Output, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { BusinessSettingsService } from '../../../../../core/services/business-settings.service';

export interface TimeSlot {
  id: string;
  label: string;       // Display: "Morning (8:30 AM - 12:00 PM)"
  display_time: string;
  start: string;       // Backend: "08:30:00"
  end: string;         // Backend: "12:00:00"
  available: boolean;
}

export interface DateTimeSelection {
  date: string;
  time_slot: string;           // Display value
  scheduled_time_start: string; // "HH:MM:SS" format
  scheduled_time_end: string;   // "HH:MM:SS" format
  shift_preference: string;     // "morning" or "afternoon"
}

@Component({
  selector: 'app-select-date-time',
  standalone: true,
  imports: [CommonModule, MatIconModule],
  templateUrl: './select-date-time.component.html',
  styleUrls: ['./select-date-time.component.scss']
})
export class SelectDateTimeComponent implements OnInit, OnChanges {
  @Input() selectedGroomer: any = null;
  @Output() dateTimeSelected = new EventEmitter<DateTimeSelection>();

  selectedDate: Date | null = null;
  selectedTimeSlot: TimeSlot | null = null;

  // Calendar data
  currentMonth: Date = new Date();
  calendarDays: (Date | null)[] = [];
  monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
                'July', 'August', 'September', 'October', 'November', 'December'];
  dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  // Time slots loaded from database
  timeSlots: TimeSlot[] = [];
  isLoadingTimeSlots = false;

  constructor(private businessSettingsService: BusinessSettingsService) {}

  ngOnInit(): void {
    this.generateCalendar();
    this.loadTimeSlots();
  }

  loadTimeSlots(): void {
    this.isLoadingTimeSlots = true;
    this.businessSettingsService.getBookingTimeSlots().subscribe({
      next: (slots) => {
        this.timeSlots = slots
          .filter(s => s.is_active)
          .map(s => ({
            id: s.id,
            label: s.label,
            display_time: s.display_time,
            start: s.start_time,
            end: s.end_time,
            available: true
          }));
        this.isLoadingTimeSlots = false;
      },
      error: (err) => {
        console.error('Error loading time slots:', err);
        this.isLoadingTimeSlots = false;
      }
    });
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['selectedGroomer']) {
      // Reset selections when groomer changes
      this.selectedDate = null;
      this.selectedTimeSlot = null;
    }
  }

  generateCalendar(): void {
    const year = this.currentMonth.getFullYear();
    const month = this.currentMonth.getMonth();

    // First day of the month
    const firstDay = new Date(year, month, 1);
    const startingDayOfWeek = firstDay.getDay();

    // Last day of the month
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();

    // Generate calendar array
    this.calendarDays = [];

    // Add empty slots for days before the first day
    for (let i = 0; i < startingDayOfWeek; i++) {
      this.calendarDays.push(null);
    }

    // Add days of the month
    for (let day = 1; day <= daysInMonth; day++) {
      this.calendarDays.push(new Date(year, month, day));
    }
  }

  previousMonth(): void {
    this.currentMonth = new Date(
      this.currentMonth.getFullYear(),
      this.currentMonth.getMonth() - 1,
      1
    );
    this.generateCalendar();
  }

  nextMonth(): void {
    this.currentMonth = new Date(
      this.currentMonth.getFullYear(),
      this.currentMonth.getMonth() + 1,
      1
    );
    this.generateCalendar();
  }

  selectDate(date: Date | null): void {
    if (!date || !this.isDateSelectable(date)) {
      return;
    }

    this.selectedDate = date;
    this.selectedTimeSlot = null; // Reset time slot when date changes
    this.emitSelection();
  }

  selectTimeSlot(timeSlot: TimeSlot): void {
    if (!timeSlot.available) {
      return;
    }

    this.selectedTimeSlot = timeSlot;
    this.emitSelection();
  }

  isDateSelectable(date: Date): boolean {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return date >= today;
  }

  isDateSelected(date: Date | null): boolean {
    if (!date || !this.selectedDate) {
      return false;
    }
    return date.toDateString() === this.selectedDate.toDateString();
  }

  isToday(date: Date | null): boolean {
    if (!date) {
      return false;
    }
    const today = new Date();
    return date.toDateString() === today.toDateString();
  }

  emitSelection(): void {
    if (this.selectedDate && this.selectedTimeSlot) {
      const dateString = this.formatDateForAPI(this.selectedDate);
      // Determine shift preference based on start hour (morning = before 12:00)
      const startHour = parseInt(this.selectedTimeSlot.start.split(':')[0], 10);
      const shiftPreference = startHour < 12 ? 'morning' : 'afternoon';

      this.dateTimeSelected.emit({
        date: dateString,
        time_slot: this.selectedTimeSlot.label,  // Use label from database
        scheduled_time_start: this.selectedTimeSlot.start,
        scheduled_time_end: this.selectedTimeSlot.end,
        shift_preference: shiftPreference
      });
    } else {
      this.dateTimeSelected.emit({
        date: '',
        time_slot: '',
        scheduled_time_start: '',
        scheduled_time_end: '',
        shift_preference: ''
      });
    }
  }

  formatDateForAPI(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  formatDateDisplay(date: Date): string {
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  }

  getCurrentMonthYear(): string {
    return `${this.monthNames[this.currentMonth.getMonth()]} ${this.currentMonth.getFullYear()}`;
  }
}
