import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { BookingWithDetails, ReadinessFilter } from '../../../core/models/types';

@Component({
  selector: 'app-booking-readiness-panel',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './booking-readiness-panel.component.html',
  styleUrls: ['./booking-readiness-panel.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class BookingReadinessPanelComponent {
  @Input() blocked: BookingWithDetails[] = [];
  @Input() ready: BookingWithDetails[] = [];
  @Input() activeFilter: ReadinessFilter = 'all';
  @Input() periodLabel = '';

  @Output() filterChange = new EventEmitter<ReadinessFilter>();
  @Output() bookingClick = new EventEmitter<BookingWithDetails>();

  readonly maxChips = 6;

  togglePill(target: 'blocked' | 'ready'): void {
    this.filterChange.emit(this.activeFilter === target ? 'all' : target);
  }

  clickChip(booking: BookingWithDetails, event: Event): void {
    event.stopPropagation();
    this.bookingClick.emit(booking);
  }

  clientLabel(booking: BookingWithDetails): string {
    const first = booking.client?.first_name ?? '';
    const last = booking.client?.last_name ?? '';
    const name = `${first} ${last}`.trim();
    return name || 'Unknown client';
  }

  shortTime(booking: BookingWithDetails): string {
    const t = booking.scheduled_time_start;
    if (!t) return '';
    const [h, m] = t.split(':');
    const hour = parseInt(h, 10);
    const ampm = hour >= 12 ? 'p' : 'a';
    const displayHour = hour % 12 || 12;
    return `${displayHour}:${m}${ampm}`;
  }

  dayShort(booking: BookingWithDetails): string {
    if (!booking.scheduled_date) return '';
    const d = new Date(booking.scheduled_date + 'T00:00:00');
    return d.toLocaleDateString('en-US', { weekday: 'short' });
  }
}
