import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  BusinessSettingsService,
  BookingTimeSlot,
} from '../../../core/services/business-settings.service';

@Component({
  selector: 'app-time-slots-list',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './time-slots-list.component.html',
  styleUrls: ['./time-slots-list.component.scss'],
})
export class TimeSlotsListComponent implements OnInit {
  slots: BookingTimeSlot[] = [];
  loading = false;
  error: string | null = null;
  showAddForm = false;
  isSubmitting = false;
  deletingId: string | null = null;

  readonly DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  readonly ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];

  newSlot: Partial<BookingTimeSlot> & { days_of_week_selection: number[] } = {
    label: '',
    display_time: '',
    start_time: '',
    end_time: '',
    is_active: true,
    is_client_visible: true,
    days_of_week: null,
    sort_order: 99,
    days_of_week_selection: [],
  };

  constructor(private businessSettingsService: BusinessSettingsService) {}

  ngOnInit(): void {
    this.loadSlots();
  }

  loadSlots(): void {
    this.loading = true;
    this.error = null;

    this.businessSettingsService.getBookingTimeSlots().subscribe({
      next: (slots) => {
        this.slots = slots;
        this.loading = false;
      },
      error: (err) => {
        console.error('Error loading time slots:', err);
        this.error = 'Failed to load time slots. Please try again.';
        this.loading = false;
      },
    });
  }

  isEveningSlot(slot: BookingTimeSlot): boolean {
    return slot.start_time >= '17:00:00';
  }

  formatTime(timeStr: string): string {
    return this.businessSettingsService.formatTime(timeStr);
  }

  getDayLabels(daysOfWeek: number[] | null): string {
    if (!daysOfWeek || daysOfWeek.length === 0) return 'All days';
    if (daysOfWeek.length === 7) return 'All days';
    return daysOfWeek.map(d => this.DAY_NAMES[d]).join(', ');
  }

  toggleActive(slot: BookingTimeSlot): void {
    const newValue = !slot.is_active;
    this.businessSettingsService.updateBookingTimeSlot(slot.id, { is_active: newValue }).subscribe({
      next: (success) => {
        if (success) {
          slot.is_active = newValue;
        } else {
          alert('Failed to update slot. Please try again.');
        }
      },
      error: () => alert('Failed to update slot. Please try again.'),
    });
  }

  toggleClientVisible(slot: BookingTimeSlot): void {
    const newValue = !slot.is_client_visible;
    this.businessSettingsService.updateBookingTimeSlot(slot.id, { is_client_visible: newValue }).subscribe({
      next: (success) => {
        if (success) {
          slot.is_client_visible = newValue;
        } else {
          alert('Failed to update slot. Please try again.');
        }
      },
      error: () => alert('Failed to update slot. Please try again.'),
    });
  }

  toggleDaySelection(day: number): void {
    const idx = this.newSlot.days_of_week_selection.indexOf(day);
    if (idx === -1) {
      this.newSlot.days_of_week_selection.push(day);
    } else {
      this.newSlot.days_of_week_selection.splice(idx, 1);
    }
  }

  isDaySelected(day: number): boolean {
    return this.newSlot.days_of_week_selection.includes(day);
  }

  openAddForm(): void {
    this.newSlot = {
      label: '',
      display_time: '',
      start_time: '',
      end_time: '',
      is_active: true,
      is_client_visible: true,
      days_of_week: null,
      sort_order: (this.slots.length + 1) * 10,
      days_of_week_selection: [],
    };
    this.showAddForm = true;
  }

  cancelAdd(): void {
    this.showAddForm = false;
  }

  submitAdd(): void {
    if (!this.newSlot.label || !this.newSlot.start_time || !this.newSlot.end_time) {
      alert('Label, start time, and end time are required.');
      return;
    }

    const daysOfWeek =
      this.newSlot.days_of_week_selection.length > 0 &&
      this.newSlot.days_of_week_selection.length < 7
        ? [...this.newSlot.days_of_week_selection].sort()
        : null;

    const slotToCreate: Omit<BookingTimeSlot, 'id' | 'created_at' | 'updated_at'> = {
      label: this.newSlot.label!,
      display_time: this.newSlot.display_time || '',
      start_time: this.newSlot.start_time!,
      end_time: this.newSlot.end_time!,
      is_active: this.newSlot.is_active !== false,
      is_client_visible: this.newSlot.is_client_visible !== false,
      days_of_week: daysOfWeek,
      sort_order: this.newSlot.sort_order || 99,
    };

    this.isSubmitting = true;
    this.businessSettingsService.createBookingTimeSlot(slotToCreate).subscribe({
      next: (success) => {
        this.isSubmitting = false;
        if (success) {
          this.showAddForm = false;
          this.loadSlots();
        } else {
          alert('Failed to create time slot. Please try again.');
        }
      },
      error: () => {
        this.isSubmitting = false;
        alert('Failed to create time slot. Please try again.');
      },
    });
  }

  confirmDelete(slot: BookingTimeSlot): void {
    if (!confirm(`Delete "${slot.label}"? This cannot be undone.`)) return;

    this.deletingId = slot.id;
    this.businessSettingsService.deleteBookingTimeSlot(slot.id).subscribe({
      next: (success) => {
        this.deletingId = null;
        if (success) {
          this.slots = this.slots.filter(s => s.id !== slot.id);
        } else {
          alert('Failed to delete time slot. Please try again.');
        }
      },
      error: () => {
        this.deletingId = null;
        alert('Failed to delete time slot. Please try again.');
      },
    });
  }
}
