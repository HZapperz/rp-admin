import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { AnalyticsService } from '../../core/services/analytics.service';
import { BookingService } from '../../core/services/booking.service';
import { KPIData, BookingWithDetails } from '../../core/models/types';
import { BusinessSettingsModalComponent } from '../../shared/components/business-settings-modal/business-settings-modal.component';
import { BusinessSettingsService, OperatingDay, OperatingHours } from '../../core/services/business-settings.service';

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
  imports: [CommonModule, RouterModule, BusinessSettingsModalComponent],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss'
})
export class DashboardComponent implements OnInit {
  // New KPI data structure
  kpiCards = {
    bookings: { completed: 0, pending: 0 },
    pets: { completed: 0, pending: 0 },
    revenue: { collected: 0, pending: 0 }
  };

  isLoading = true;
  error: string | null = null;

  // Schedule View
  currentView: ScheduleView = 'week';
  currentDate = new Date();
  scheduleSlots: DaySlot[] = [];
  allBookings: BookingWithDetails[] = [];

  // Business Settings Modal
  showBusinessSettingsModal = false;
  operatingDaysSummary = 'Loading...';

  // Time grid settings
  dayStartHour = 8;  // 8 AM
  dayEndHour = 18;   // 6 PM
  timeSlots: string[] = [];

  constructor(
    private analyticsService: AnalyticsService,
    private bookingService: BookingService,
    private businessSettingsService: BusinessSettingsService,
    private router: Router
  ) {}

  async ngOnInit(): Promise<void> {
    this.generateTimeSlots();
    await Promise.all([
      this.loadKPIs(),
      this.loadSchedule()
    ]);
    this.loadBusinessSettingsSummary();
  }

  private generateTimeSlots(): void {
    this.timeSlots = [];
    for (let hour = this.dayStartHour; hour <= this.dayEndHour; hour++) {
      const ampm = hour >= 12 ? 'PM' : 'AM';
      const displayHour = hour % 12 || 12;
      this.timeSlots.push(`${displayHour}:00 ${ampm}`);
    }
  }

  private async loadKPIs(): Promise<void> {
    try {
      // Get all bookings and calculate KPIs
      this.bookingService.getAllBookings().subscribe({
        next: (bookings) => {
          // Get current month boundaries as YYYY-MM strings for comparison
          const now = new Date();
          const currentYear = now.getFullYear();
          const currentMonth = String(now.getMonth() + 1).padStart(2, '0');
          const monthPrefix = `${currentYear}-${currentMonth}`;

          // Filter bookings for current month (excluding cancelled)
          // Using string comparison to avoid timezone issues
          const monthlyBookings = bookings.filter(b => {
            if (b.status === 'cancelled') return false;
            const bookingDateStr = b.scheduled_date.split('T')[0]; // Get YYYY-MM-DD
            return bookingDateStr.startsWith(monthPrefix);
          });

          // Separate completed vs pending/upcoming bookings
          const completedBookings = monthlyBookings.filter(b => b.status === 'completed');
          const pendingBookings = monthlyBookings.filter(b =>
            b.status === 'confirmed' || b.status === 'in_progress' || b.status === 'pending'
          );

          // Count pets for completed bookings
          const petsCompleted = completedBookings.reduce((sum, b) => {
            return sum + (b.pets?.length || 0);
          }, 0);

          // Count pets for pending/upcoming bookings
          const petsPending = pendingBookings.reduce((sum, b) => {
            return sum + (b.pets?.length || 0);
          }, 0);

          // Calculate revenue - collected (completed) vs pending (confirmed + in_progress)
          const revenueCollected = completedBookings.reduce((sum, b) => sum + (b.total_amount || 0), 0);
          const revenuePending = pendingBookings.reduce((sum, b) => sum + (b.total_amount || 0), 0);

          this.kpiCards = {
            bookings: {
              completed: completedBookings.length,
              pending: pendingBookings.length
            },
            pets: {
              completed: petsCompleted,
              pending: petsPending
            },
            revenue: {
              collected: revenueCollected,
              pending: revenuePending
            }
          };
        },
        error: (err) => {
          console.error('Error loading KPIs:', err);
        }
      });

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
      // Construct new date directly to avoid setMonth overflow
      // e.g., Jan 31 + setMonth(Feb) would overflow to March 3
      this.currentDate = new Date(
        this.currentDate.getFullYear(),
        this.currentDate.getMonth() - 1,
        1
      );
    }
    this.generateScheduleSlots();
  }

  nextPeriod(): void {
    if (this.currentView === 'day') {
      this.currentDate = new Date(this.currentDate.setDate(this.currentDate.getDate() + 1));
    } else if (this.currentView === 'week') {
      this.currentDate = new Date(this.currentDate.setDate(this.currentDate.getDate() + 7));
    } else {
      // Construct new date directly to avoid setMonth overflow
      // e.g., Jan 31 + setMonth(Feb) would overflow to March 3
      this.currentDate = new Date(
        this.currentDate.getFullYear(),
        this.currentDate.getMonth() + 1,
        1
      );
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
    // Use local date methods to avoid UTC timezone shift
    const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    const bookings = this.allBookings
      .filter(b => {
        if (b.status === 'cancelled') return false;
        // Direct string comparison - both are already in YYYY-MM-DD format
        const bookingDateStr = b.scheduled_date.split('T')[0];
        return bookingDateStr === dateStr;
      })
      .sort((a, b) => (a.scheduled_time_start || '').localeCompare(b.scheduled_time_start || ''));

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

  getStatusLabel(status: string): string {
    const labels: Record<string, string> = {
      'pending': 'Pending',
      'confirmed': 'Confirmed',
      'in_progress': 'In Progress',
      'completed': 'Completed',
      'cancelled': 'Cancelled'
    };
    return labels[status] || status;
  }

  getGroomerInitials(groomer: any): string {
    if (!groomer) return '';
    const first = groomer.first_name?.[0] || '';
    const last = groomer.last_name?.[0] || '';
    return (first + last).toUpperCase();
  }

  formatTime(time: string): string {
    if (!time) return '';
    const [hours, minutes] = time.split(':');
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour % 12 || 12;
    return `${displayHour}:${minutes} ${ampm}`;
  }

  // Calculate top position as percentage based on start time
  getBookingTop(startTime: string): number {
    if (!startTime) return 0;
    const [hours, minutes] = startTime.split(':').map(Number);
    const totalMinutes = (hours - this.dayStartHour) * 60 + minutes;
    const totalDayMinutes = (this.dayEndHour - this.dayStartHour) * 60;
    return (totalMinutes / totalDayMinutes) * 100;
  }

  // Calculate height as percentage based on duration
  getBookingHeight(startTime: string, endTime: string): number {
    if (!startTime || !endTime) {
      console.warn('Missing booking time:', { startTime, endTime });
      return 12.5; // Default to 75 minutes (1h 15m standard slot) if missing
    }

    try {
      const [startHours, startMinutes] = startTime.split(':').map(Number);
      const [endHours, endMinutes] = endTime.split(':').map(Number);

      // Validate parsed values
      if (isNaN(startHours) || isNaN(startMinutes) || isNaN(endHours) || isNaN(endMinutes)) {
        console.warn('Invalid time values:', { startTime, endTime });
        return 12.5; // Default to 75 minutes
      }

      const durationMinutes = (endHours * 60 + endMinutes) - (startHours * 60 + startMinutes);

      // Check for invalid duration
      if (durationMinutes <= 0) {
        console.warn('Invalid duration (end before start):', { startTime, endTime, durationMinutes });
        return 12.5; // Default to 75 minutes
      }

      const totalDayMinutes = (this.dayEndHour - this.dayStartHour) * 60;
      const heightPercent = (durationMinutes / totalDayMinutes) * 100;
      return Math.max(heightPercent, 5); // Minimum 5% height for visibility
    } catch (error) {
      console.error('Error calculating booking height:', error, { startTime, endTime });
      return 12.5; // Default to 75 minutes
    }
  }

  // Get duration in readable format
  getBookingDuration(startTime: string, endTime: string): string {
    if (!startTime || !endTime) return '';
    const [startHours, startMinutes] = startTime.split(':').map(Number);
    const [endHours, endMinutes] = endTime.split(':').map(Number);
    const durationMinutes = (endHours * 60 + endMinutes) - (startHours * 60 + startMinutes);
    const hours = Math.floor(durationMinutes / 60);
    const mins = durationMinutes % 60;
    if (hours > 0 && mins > 0) return `${hours}h ${mins}m`;
    if (hours > 0) return `${hours}h`;
    return `${mins}m`;
  }

  openBookingDetail(booking: BookingWithDetails): void {
    // Navigate to booking details page
    this.router.navigate(['/bookings/details', booking.id]);
  }

  // Business Settings Methods
  loadBusinessSettingsSummary(): void {
    this.businessSettingsService.getOperatingDays().subscribe(days => {
      this.businessSettingsService.getOperatingHours().subscribe(hours => {
        const openDays = days.filter(d => d.is_open);
        const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

        if (openDays.length === 0) {
          this.operatingDaysSummary = 'No operating days set';
        } else if (openDays.length === 7) {
          // Get hours for first open day
          const firstDay = openDays[0];
          const firstHours = hours.find(h => h.day_of_week === firstDay.day_of_week);
          if (firstHours) {
            const opensAt = this.businessSettingsService.formatTime(firstHours.opens_at);
            const closesAt = this.businessSettingsService.formatTime(firstHours.closes_at);
            this.operatingDaysSummary = `7 days/week, ${opensAt} - ${closesAt}`;
          } else {
            this.operatingDaysSummary = '7 days/week';
          }
        } else {
          const dayLabels = openDays.map(d => dayNames[d.day_of_week]).join(', ');
          // Get hours for first open day
          const firstDay = openDays[0];
          const firstHours = hours.find(h => h.day_of_week === firstDay.day_of_week);
          if (firstHours) {
            const opensAt = this.businessSettingsService.formatTime(firstHours.opens_at);
            const closesAt = this.businessSettingsService.formatTime(firstHours.closes_at);
            this.operatingDaysSummary = `${dayLabels} • ${opensAt} - ${closesAt}`;
          } else {
            this.operatingDaysSummary = dayLabels;
          }
        }
      });
    });
  }

  openBusinessSettings(): void {
    this.showBusinessSettingsModal = true;
  }

  closeBusinessSettings(): void {
    this.showBusinessSettingsModal = false;
  }

  onBusinessSettingsSaved(): void {
    this.loadBusinessSettingsSummary();
    this.loadSchedule(); // Reload schedule to reflect new operating days
  }
}
