import { Component, EventEmitter, Input, OnInit, Output, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { GroomerService, AvailableSlot, GroomerAvailableSlotsData } from '../../../../../core/services/groomer.service';

export interface DateTimeSelection {
  date: string;
  time_slot: string;           // Display value "9:30 AM - 11:00 AM"
  scheduled_time_start: string; // "HH:MM:SS" format for backend
  scheduled_time_end: string;   // "HH:MM:SS" format for backend
  shift_preference: string;     // "morning" or "afternoon"
}

@Component({
  selector: 'app-select-date-time',
  standalone: true,
  imports: [CommonModule, FormsModule, MatIconModule],
  templateUrl: './select-date-time.component.html',
  styleUrls: ['./select-date-time.component.scss']
})
export class SelectDateTimeComponent implements OnInit, OnChanges {
  @Input() selectedGroomer: any = null;
  @Output() dateTimeSelected = new EventEmitter<DateTimeSelection>();

  selectedDate: Date | null = null;

  // Time inputs in HH:MM AM/PM format
  startTime: string = '';
  endTime: string = '';

  // Calendar data
  currentMonth: Date = new Date();
  calendarDays: (Date | null)[] = [];
  monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
                'July', 'August', 'September', 'October', 'November', 'December'];
  dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  // Help modal state
  showTimeHelp = false;

  // Dynamic availability state
  availableSlots: AvailableSlot[] = [];
  isLoadingSlots = false;
  groomerAvailabilityInfo: GroomerAvailableSlotsData | null = null;
  groomerUnavailableReason: string = '';
  selectedSlot: AvailableSlot | null = null;
  useCustomTime = false;

  constructor(private groomerService: GroomerService) {}

  ngOnInit(): void {
    this.generateCalendar();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['selectedGroomer']) {
      // Reset selections when groomer changes
      this.selectedDate = null;
      this.startTime = '';
      this.endTime = '';
      this.availableSlots = [];
      this.groomerAvailabilityInfo = null;
      this.groomerUnavailableReason = '';
      this.selectedSlot = null;
      this.useCustomTime = false;
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
    // Reset time selections when date changes
    this.selectedSlot = null;
    this.startTime = '';
    this.endTime = '';
    this.availableSlots = [];
    this.groomerUnavailableReason = '';

    // Load available slots for the selected groomer and date
    if (this.selectedGroomer) {
      this.loadAvailableSlots();
    }
  }

  async loadAvailableSlots(): Promise<void> {
    if (!this.selectedGroomer || !this.selectedDate) return;

    this.isLoadingSlots = true;
    this.availableSlots = [];
    this.groomerUnavailableReason = '';

    const dateStr = this.formatDateForAPI(this.selectedDate);

    this.groomerService.getGroomerAvailableSlots(this.selectedGroomer.id, dateStr).subscribe({
      next: (data) => {
        this.groomerAvailabilityInfo = data;

        if (!data.is_available) {
          this.groomerUnavailableReason = data.reason || 'Groomer has no standard availability for this day';
        }
        this.availableSlots = data.business_slots; // always populated

        this.isLoadingSlots = false;
      },
      error: (err) => {
        console.error('Error loading available slots:', err);
        this.groomerUnavailableReason = 'Failed to load available time slots';
        this.isLoadingSlots = false;
      }
    });
  }

  selectSlot(slot: AvailableSlot): void {
    this.selectedSlot = slot;
    this.useCustomTime = false;
    // Set the time inputs from the slot for consistency
    this.startTime = this.groomerService.formatTime(slot.start_time);
    this.endTime = this.groomerService.formatTime(slot.end_time);
    this.emitSelection();
  }

  toggleCustomTime(): void {
    this.useCustomTime = !this.useCustomTime;
    if (this.useCustomTime) {
      this.selectedSlot = null;
      this.startTime = '';
      this.endTime = '';
    }
    this.emitSelection();
  }

  hasAvailableSlots(): boolean {
    return this.availableSlots.some(slot => slot.is_available);
  }

  isSlotSelected(slot: AvailableSlot): boolean {
    return this.selectedSlot?.start_time === slot.start_time && this.selectedSlot?.end_time === slot.end_time;
  }

  onTimeChange(): void {
    this.emitSelection();
  }

  /**
   * Auto-format time input to standard "H:MM AM/PM" format
   * Handles many formats: "930am", "9:30am", "1230pm", "12.30pm", "930", "9:30", "0930"
   */
  formatTimeInput(value: string): string {
    if (!value) return '';

    // Remove spaces and normalize to uppercase
    let cleaned = value.replace(/\s+/g, '').toUpperCase();

    // Convert dots to colons (12.30pm -> 12:30pm)
    cleaned = cleaned.replace(/\./g, ':');

    // Handle formats without separator (1230pm -> 12:30pm, 930am -> 9:30am)
    // Match 3 or 4 digits followed by optional AM/PM
    const noSeparatorMatch = cleaned.match(/^(\d{3,4})(AM|PM)?$/);
    if (noSeparatorMatch) {
      const digits = noSeparatorMatch[1];
      const period = noSeparatorMatch[2] || '';
      if (digits.length === 3) {
        // 930 -> 9:30
        cleaned = digits[0] + ':' + digits.slice(1) + period;
      } else if (digits.length === 4) {
        // 1230 -> 12:30
        cleaned = digits.slice(0, 2) + ':' + digits.slice(2) + period;
      }
    }

    // Match patterns: "9:30AM", "12:30PM", "9:30", "12:30"
    const match = cleaned.match(/^(\d{1,2}):(\d{2})(AM|PM)?$/);
    if (!match) return value; // Return original if no match

    let hours = parseInt(match[1], 10);
    const minutes = match[2];
    let period = match[3] || '';

    // If no period provided, guess based on hour
    if (!period) {
      // Assume business hours: 8-11 = AM, 12+ = PM
      if (hours >= 8 && hours < 12) {
        period = 'AM';
      } else if (hours === 12) {
        period = 'PM';
      } else if (hours >= 1 && hours <= 5) {
        period = 'PM'; // 1-5 likely afternoon
      } else {
        period = 'AM';
      }
    }

    // Normalize hours for display (1-12)
    if (hours > 12) hours = hours - 12;
    if (hours === 0) hours = 12;

    return `${hours}:${minutes} ${period}`;
  }

  toggleTimeHelp(): void {
    this.showTimeHelp = !this.showTimeHelp;
  }

  onStartTimeBlur(): void {
    this.startTime = this.formatTimeInput(this.startTime);
    this.onTimeChange();
  }

  onEndTimeBlur(): void {
    this.endTime = this.formatTimeInput(this.endTime);
    this.onTimeChange();
  }

  /**
   * Convert 12-hour time format to 24-hour format
   * Example: "9:30 AM" → "09:30:00", "1:00 PM" → "13:00:00"
   */
  convertTo24Hour(time12h: string): string {
    if (!time12h) return '';

    // Normalize the input - handle various formats
    const normalized = time12h.trim().toUpperCase();

    // Parse "9:30 AM", "9:30AM", "09:30 AM", etc.
    const match = normalized.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/);
    if (!match) return '';

    let hours = parseInt(match[1], 10);
    const minutes = match[2];
    const period = match[3];

    // Validate hours
    if (hours < 1 || hours > 12) return '';

    // Convert to 24-hour
    if (period === 'PM' && hours !== 12) hours += 12;
    if (period === 'AM' && hours === 12) hours = 0;

    return `${hours.toString().padStart(2, '0')}:${minutes}:00`;
  }

  /**
   * Check if both times are valid and properly formatted
   */
  isTimeValid(): boolean {
    // If using a selected slot, it's valid
    if (this.selectedSlot && !this.useCustomTime) {
      return true;
    }
    // For custom time, check the inputs
    const start24 = this.convertTo24Hour(this.startTime);
    const end24 = this.convertTo24Hour(this.endTime);
    return start24 !== '' && end24 !== '';
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
    let start24 = '';
    let end24 = '';
    let timeSlotLabel = '';

    // Get time values based on selection mode
    if (this.selectedSlot && !this.useCustomTime) {
      // Using selected slot
      start24 = this.selectedSlot.start_time + ':00'; // Add seconds
      end24 = this.selectedSlot.end_time + ':00';
      timeSlotLabel = this.selectedSlot.display_time;
    } else {
      // Using custom time input
      start24 = this.convertTo24Hour(this.startTime);
      end24 = this.convertTo24Hour(this.endTime);
      if (this.startTime && this.endTime) {
        timeSlotLabel = `${this.startTime.trim()} - ${this.endTime.trim()}`;
      }
    }

    if (this.selectedDate && start24 && end24) {
      const dateString = this.formatDateForAPI(this.selectedDate);

      // Determine shift preference based on start hour
      const startHour = parseInt(start24.split(':')[0], 10);
      let shiftPreference: 'morning' | 'afternoon' | 'evening';

      if (startHour < 12) {
        shiftPreference = 'morning';
      } else if (startHour < 17) {  // Before 5 PM
        shiftPreference = 'afternoon';
      } else {
        shiftPreference = 'evening';  // 5 PM and later
      }

      this.dateTimeSelected.emit({
        date: dateString,
        time_slot: timeSlotLabel,
        scheduled_time_start: start24,
        scheduled_time_end: end24,
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
