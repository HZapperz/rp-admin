import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { AnalyticsService } from '../../core/services/analytics.service';
import { BookingService } from '../../core/services/booking.service';
import { KPIData, BookingWithDetails } from '../../core/models/types';

type ScheduleView = 'day' | 'week' | 'month';

interface DaySlot {
  date: Date;
  bookings: BookingWithDetails[];
  isToday: boolean;
  isCurrentMonth: boolean;
}

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss'
})
export class DashboardComponent implements OnInit {
  kpis = [
    { label: 'Total Bookings', value: '0', icon: '📅', color: '#6366f1' },
    { label: 'Total Revenue', value: '$0', icon: '💰', color: '#10b981' },
    { label: 'Active Groomers', value: '0', icon: '✂️', color: '#f59e0b' },
    { label: 'Average Rating', value: '0.0', icon: '⭐', color: '#ec4899' }
  ];

  isLoading = true;
  error: string | null = null;

  // Schedule View
  currentView: ScheduleView = 'week';
  currentDate = new Date();
  scheduleSlots: DaySlot[] = [];
  allBookings: BookingWithDetails[] = [];

  constructor(
    private analyticsService: AnalyticsService,
    private bookingService: BookingService
  ) {}

  async ngOnInit(): Promise<void> {
    await Promise.all([
      this.loadKPIs(),
      this.loadSchedule()
    ]);
  }

  private async loadKPIs(): Promise<void> {
    try {
      const kpiData: KPIData = await this.analyticsService.getDashboardKPIs();

      this.kpis = [
        {
          label: 'Total Bookings',
          value: kpiData.totalBookings.toString(),
          icon: '📅',
          color: '#6366f1'
        },
        {
          label: 'Total Revenue',
          value: `$${kpiData.totalRevenue.toFixed(2)}`,
          icon: '💰',
          color: '#10b981'
        },
        {
          label: 'Active Groomers',
          value: kpiData.activeGroomers.toString(),
          icon: '✂️',
          color: '#f59e0b'
        },
        {
          label: 'Average Rating',
          value: kpiData.averageRating.toFixed(1),
          icon: '⭐',
          color: '#ec4899'
        }
      ];

      this.error = null;
    } catch (err: any) {
      console.error('Error loading KPIs:', err);
      this.error = 'Failed to load dashboard data. Please try again.';
    } finally {
      this.isLoading = false;
    }
  }

  private async loadSchedule(): Promise<void> {
    try {
      this.bookingService.getAllBookings().subscribe({
        next: (bookings) => {
          this.allBookings = bookings;
          this.generateScheduleSlots();
        },
        error: (err) => {
          console.error('Error loading schedule:', err);
        }
      });
    } catch (err) {
      console.error('Error:', err);
    }
  }

  changeView(view: ScheduleView): void {
    this.currentView = view;
    this.generateScheduleSlots();
  }

  previousPeriod(): void {
    if (this.currentView === 'day') {
      this.currentDate = new Date(this.currentDate.setDate(this.currentDate.getDate() - 1));
    } else if (this.currentView === 'week') {
      this.currentDate = new Date(this.currentDate.setDate(this.currentDate.getDate() - 7));
    } else {
      this.currentDate = new Date(this.currentDate.setMonth(this.currentDate.getMonth() - 1));
    }
    this.generateScheduleSlots();
  }

  nextPeriod(): void {
    if (this.currentView === 'day') {
      this.currentDate = new Date(this.currentDate.setDate(this.currentDate.getDate() + 1));
    } else if (this.currentView === 'week') {
      this.currentDate = new Date(this.currentDate.setDate(this.currentDate.getDate() + 7));
    } else {
      this.currentDate = new Date(this.currentDate.setMonth(this.currentDate.getMonth() + 1));
    }
    this.generateScheduleSlots();
  }

  goToToday(): void {
    this.currentDate = new Date();
    this.generateScheduleSlots();
  }

  private generateScheduleSlots(): void {
    this.scheduleSlots = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (this.currentView === 'day') {
      const date = new Date(this.currentDate);
      date.setHours(0, 0, 0, 0);
      this.scheduleSlots.push(this.createDaySlot(date, today));
    } else if (this.currentView === 'week') {
      const startOfWeek = this.getStartOfWeek(this.currentDate);
      for (let i = 0; i < 7; i++) {
        const date = new Date(startOfWeek);
        date.setDate(date.getDate() + i);
        this.scheduleSlots.push(this.createDaySlot(date, today));
      }
    } else {
      const startOfMonth = new Date(this.currentDate.getFullYear(), this.currentDate.getMonth(), 1);
      const endOfMonth = new Date(this.currentDate.getFullYear(), this.currentDate.getMonth() + 1, 0);

      // Start from the beginning of the week containing the first day
      const start = this.getStartOfWeek(startOfMonth);

      // Generate 6 weeks (42 days) to cover all cases
      for (let i = 0; i < 42; i++) {
        const date = new Date(start);
        date.setDate(date.getDate() + i);
        const isCurrentMonth = date.getMonth() === this.currentDate.getMonth();
        this.scheduleSlots.push(this.createDaySlot(date, today, isCurrentMonth));
      }
    }
  }

  private createDaySlot(date: Date, today: Date, isCurrentMonth: boolean = true): DaySlot {
    const dateStr = date.toISOString().split('T')[0];
    const bookings = this.allBookings.filter(b => {
      const bookingDate = new Date(b.scheduled_date).toISOString().split('T')[0];
      return bookingDate === dateStr;
    });

    return {
      date: new Date(date),
      bookings,
      isToday: date.getTime() === today.getTime(),
      isCurrentMonth
    };
  }

  private getStartOfWeek(date: Date): Date {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day;
    return new Date(d.setDate(diff));
  }

  getPeriodLabel(): string {
    if (this.currentView === 'day') {
      return this.currentDate.toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
    } else if (this.currentView === 'week') {
      const startOfWeek = this.getStartOfWeek(this.currentDate);
      const endOfWeek = new Date(startOfWeek);
      endOfWeek.setDate(endOfWeek.getDate() + 6);
      return `${startOfWeek.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${endOfWeek.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
    } else {
      return this.currentDate.toLocaleDateString('en-US', { year: 'numeric', month: 'long' });
    }
  }

  getStatusClass(status: string): string {
    const classes: Record<string, string> = {
      'pending': 'status-pending',
      'confirmed': 'status-confirmed',
      'in_progress': 'status-progress',
      'completed': 'status-completed',
      'cancelled': 'status-cancelled'
    };
    return classes[status] || '';
  }

  formatTime(time: string): string {
    if (!time) return '';
    const [hours, minutes] = time.split(':');
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour % 12 || 12;
    return `${displayHour}:${minutes} ${ampm}`;
  }
}
