import { Component, OnInit, AfterViewInit, ViewChild } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { AnalyticsService } from '../../core/services/analytics.service';
import { BookingService } from '../../core/services/booking.service';
import { KPIData, BookingWithDetails, Readiness, ReadinessFilter } from '../../core/models/types';
import { BusinessSettingsModalComponent } from '../../shared/components/business-settings-modal/business-settings-modal.component';
import { BusinessSettingsService, OperatingDay, OperatingHours, ShiftDateAvailability } from '../../core/services/business-settings.service';
import { TerritoryDashboardComponent } from '../territory-intelligence/territory-dashboard/territory-dashboard.component';
import { BookingReadinessPanelComponent } from './booking-readiness-panel/booking-readiness-panel.component';


type ScheduleView = 'day' | 'week' | 'month';

interface ShiftAvailability {
  morning: boolean;
  afternoon: boolean;
  evening: boolean;
}

interface BookingLayout {
  columnIndex: number;
  totalColumns: number;
}

interface DaySlot {
  date: Date;
  bookings: BookingWithDetails[];
  isToday: boolean;
  isCurrentMonth: boolean;
  dailyRevenue: number;
  collectedRevenue: number;
  confirmedRevenue: number;
  dailyGroomCount: number;
  shiftAvailability: ShiftAvailability;
}

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, BusinessSettingsModalComponent, TerritoryDashboardComponent, BookingReadinessPanelComponent],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss'
})
export class DashboardComponent implements OnInit, AfterViewInit {
  @ViewChild(TerritoryDashboardComponent) territoryMap?: TerritoryDashboardComponent;

  dashboardView: 'schedule' | 'map' = 'schedule';

  setDashboardView(v: 'schedule' | 'map'): void {
    this.dashboardView = v;
    if (v === 'map') {
      setTimeout(() => this.territoryMap?.onShow(), 50);
    } else {
      this.location.replaceState('/dashboard');
    }
  }
  // New KPI data structure
  kpiCards: { bookings: { completed: number; pending: number }; pets: { completed: number; pending: number }; revenue: { collected: number; tips: number; confirmed: number } } = {
    bookings: { completed: 0, pending: 0 },
    pets: { completed: 0, pending: 0 },
    revenue: { collected: 0, tips: 0, confirmed: 0 }
  };

  kpiPeriod: 'week' | 'month' = 'week';
  isLoading = true;
  error: string | null = null;

  // Schedule View
  currentView: ScheduleView = 'week';
  currentDate = new Date();
  windowStart: Date = (() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; })();
  scheduleSlots: DaySlot[] = [];
  allBookings: BookingWithDetails[] = [];

  // Shift availability
  shiftAvailabilityMap = new Map<string, ShiftAvailability>();
  savingShifts = new Set<string>();

  // Readiness filter (replaces the old pending-only toggle)
  readinessFilter: ReadinessFilter = 'all';
  private readinessMap = new WeakMap<BookingWithDetails, Readiness>();
  blockedBookings: BookingWithDetails[] = [];
  readyBookings: BookingWithDetails[] = [];

  // Business Settings Modal
  showBusinessSettingsModal = false;
  operatingDaysSummary = 'Loading...';

  // Booking overlap layout
  bookingLayoutMap = new Map<string, BookingLayout>();

  // Time grid settings
  dayStartHour = 8;  // 8 AM
  dayEndHour = 21;   // 9 PM
  timeSlots: string[] = [];

  constructor(
    private analyticsService: AnalyticsService,
    private bookingService: BookingService,
    private businessSettingsService: BusinessSettingsService,
    private router: Router,
    private route: ActivatedRoute,
    private location: Location
  ) {}

  async ngOnInit(): Promise<void> {
    // Restore map view state from URL params (e.g. when navigating back from client profile)
    const params = this.route.snapshot.queryParams;
    if (params['view'] === 'map') {
      this.dashboardView = 'map';
    }

    this.generateTimeSlots();
    await Promise.all([
      this.loadKPIs(),
      this.loadSchedule()
    ]);
    this.loadBusinessSettingsSummary();
  }

  ngAfterViewInit(): void {
    const params = this.route.snapshot.queryParams;
    if (params['view'] === 'map' && this.territoryMap) {
      const tab = (params['tab'] as 'territory' | 'bookings' | 'fill') || 'territory';
      const date = params['date'] || '';
      setTimeout(() => this.territoryMap?.restoreState(tab, date), 100);
    }
  }

  private generateTimeSlots(): void {
    this.timeSlots = [];
    for (let hour = this.dayStartHour; hour <= this.dayEndHour; hour++) {
      const ampm = hour >= 12 ? 'PM' : 'AM';
      const displayHour = hour % 12 || 12;
      this.timeSlots.push(`${displayHour}:00 ${ampm}`);
    }
  }

  toggleKPIPeriod(period: 'week' | 'month'): void {
    if (this.kpiPeriod !== period) {
      this.kpiPeriod = period;
      this.currentView = period;
      this.currentDate = new Date();
      if (period === 'week') {
        this.windowStart = new Date();
        this.windowStart.setHours(0, 0, 0, 0);
      }
      this.generateScheduleSlots();
      this.loadKPIs();
    }
  }

  getKPIPeriodLabel(): string {
    const now = new Date();
    now.setHours(0, 0, 0, 0);

    if (this.kpiPeriod === 'week') {
      const windowEnd = new Date(this.windowStart);
      windowEnd.setDate(windowEnd.getDate() + 6);

      // Check if window starts on today
      if (this.windowStart.getTime() === now.getTime()) {
        return 'This week';
      }

      return `${this.windowStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${windowEnd.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
    } else {
      // Check if viewing current month
      if (this.currentDate.getMonth() === now.getMonth() &&
          this.currentDate.getFullYear() === now.getFullYear()) {
        return 'This month';
      }

      // Otherwise show month name
      return this.currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    }
  }

  private async loadKPIs(): Promise<void> {
    try {
      // Get all bookings and calculate KPIs
      this.bookingService.getAllBookings().subscribe({
        next: (bookings) => {
          let filteredBookings: typeof bookings;

          if (this.kpiPeriod === 'month') {
            // Get month boundaries from currentDate
            const currentYear = this.currentDate.getFullYear();
            const currentMonth = String(this.currentDate.getMonth() + 1).padStart(2, '0');
            const monthPrefix = `${currentYear}-${currentMonth}`;

            // Filter bookings for the selected month (excluding cancelled)
            filteredBookings = bookings.filter(b => {
              if (b.status === 'cancelled') return false;
              const bookingDateStr = b.scheduled_date.split('T')[0]; // Get YYYY-MM-DD
              return bookingDateStr.startsWith(monthPrefix);
            });
          } else {
            // Filter bookings for the current rolling 7-day window
            const windowEnd = new Date(this.windowStart);
            windowEnd.setDate(windowEnd.getDate() + 6);

            const startDateStr = `${this.windowStart.getFullYear()}-${String(this.windowStart.getMonth() + 1).padStart(2, '0')}-${String(this.windowStart.getDate()).padStart(2, '0')}`;
            const endDateStr = `${windowEnd.getFullYear()}-${String(windowEnd.getMonth() + 1).padStart(2, '0')}-${String(windowEnd.getDate()).padStart(2, '0')}`;

            filteredBookings = bookings.filter(b => {
              if (b.status === 'cancelled') return false;
              const bookingDateStr = b.scheduled_date.split('T')[0];
              return bookingDateStr >= startDateStr && bookingDateStr <= endDateStr;
            });
          }

          // Use filteredBookings instead of monthlyBookings
          const monthlyBookings = filteredBookings;

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

          // Revenue breakdown:
          // collected = subtotal_before_tax (actual business earnings, excludes tax & tips)
          // tips = tip_amount (pass-through to groomers)
          // pending = subtotal_before_tax of upcoming bookings
          const revenueCollected = completedBookings.reduce((sum, b) => {
            return sum + (b.subtotal_before_tax || 0);
          }, 0);
          const revenueTips = completedBookings.reduce((sum, b) => {
            return sum + (b.tip_amount || 0);
          }, 0);
          const confirmedBookings = monthlyBookings.filter(b =>
            b.status === 'confirmed' || b.status === 'in_progress'
          );
          const revenueConfirmed = confirmedBookings.reduce((sum, b) => {
            return sum + (b.subtotal_before_tax || 0);
          }, 0);

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
              tips: revenueTips,
              confirmed: revenueConfirmed
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
          this.loadShiftAvailability();
        },
        error: (err) => {
          console.error('Error loading schedule:', err);
        }
      });
    } catch (err) {
      console.error('Error:', err);
    }
  }

  private loadShiftAvailability(): void {
    if (this.scheduleSlots.length === 0) return;
    const first = this.scheduleSlots[0].date;
    const last = this.scheduleSlots[this.scheduleSlots.length - 1].date;
    const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const start = fmt(first);
    const end = fmt(last);
    this.businessSettingsService.getShiftAvailabilityForRange(start, end).subscribe({
      next: (rows) => {
        // Reset map for this date range (all defaults = true)
        this.shiftAvailabilityMap.clear();
        for (const row of rows) {
          const existing = this.shiftAvailabilityMap.get(row.date) ?? { morning: true, afternoon: true, evening: true };
          existing[row.shift] = row.is_available;
          this.shiftAvailabilityMap.set(row.date, existing);
        }
        this.generateScheduleSlots();
      },
      error: (err) => console.error('Error loading shift availability:', err)
    });
  }

  changeView(view: ScheduleView): void {
    this.currentView = view;
    this.generateScheduleSlots();
  }

  previousDay(): void {
    this.windowStart = new Date(this.windowStart);
    this.windowStart.setDate(this.windowStart.getDate() - 1);
    this._refreshWeekView();
  }

  nextDay(): void {
    this.windowStart = new Date(this.windowStart);
    this.windowStart.setDate(this.windowStart.getDate() + 1);
    this._refreshWeekView();
  }

  previousPeriod(): void {
    if (this.currentView === 'day') {
      this.currentDate = new Date(this.currentDate.setDate(this.currentDate.getDate() - 1));
      this.shiftAvailabilityMap.clear();
      this.generateScheduleSlots();
      this.loadKPIs();
      this.loadShiftAvailability();
    } else if (this.currentView === 'week') {
      this.windowStart = new Date(this.windowStart);
      this.windowStart.setDate(this.windowStart.getDate() - 7);
      this._refreshWeekView();
    } else {
      this.currentDate = new Date(
        this.currentDate.getFullYear(),
        this.currentDate.getMonth() - 1,
        1
      );
      this.shiftAvailabilityMap.clear();
      this.generateScheduleSlots();
      this.loadKPIs();
      this.loadShiftAvailability();
    }
  }

  nextPeriod(): void {
    if (this.currentView === 'day') {
      this.currentDate = new Date(this.currentDate.setDate(this.currentDate.getDate() + 1));
      this.shiftAvailabilityMap.clear();
      this.generateScheduleSlots();
      this.loadKPIs();
      this.loadShiftAvailability();
    } else if (this.currentView === 'week') {
      this.windowStart = new Date(this.windowStart);
      this.windowStart.setDate(this.windowStart.getDate() + 7);
      this._refreshWeekView();
    } else {
      this.currentDate = new Date(
        this.currentDate.getFullYear(),
        this.currentDate.getMonth() + 1,
        1
      );
      this.shiftAvailabilityMap.clear();
      this.generateScheduleSlots();
      this.loadKPIs();
      this.loadShiftAvailability();
    }
  }

  goToToday(): void {
    this.currentDate = new Date();
    this.windowStart = new Date();
    this.windowStart.setHours(0, 0, 0, 0);
    this.shiftAvailabilityMap.clear();
    this.generateScheduleSlots();
    this.loadKPIs();
    this.loadShiftAvailability();
  }

  private _refreshWeekView(): void {
    this.shiftAvailabilityMap.clear();
    this.generateScheduleSlots();
    this.loadKPIs();
    this.loadShiftAvailability();
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
      for (let i = 0; i < 7; i++) {
        const date = new Date(this.windowStart);
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

    this.computeBookingLayouts();
    this.computeReadiness();
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
      .sort((a, b) => {
        const timeCompare = (a.scheduled_time_start || '').localeCompare(b.scheduled_time_start || '');
        if (timeCompare !== 0) return timeCompare;
        return this.getReadinessStackPriority(a) - this.getReadinessStackPriority(b);
      });

    const shiftData = this.shiftAvailabilityMap.get(dateStr) ?? { morning: true, afternoon: true, evening: true };

    return {
      date: new Date(date),
      bookings,
      isToday: date.getTime() === today.getTime(),
      isCurrentMonth,
      dailyRevenue: bookings.reduce((sum, b) => {
        const preTax = b.subtotal_before_tax ?? (b.total_amount - (b.tax_amount || 0) - (b.tip_amount || 0));
        return sum + Math.max(0, preTax);
      }, 0),
      collectedRevenue: bookings
        .filter(b => b.payment_status === 'captured' || b.payment_status === 'paid_cash')
        .reduce((sum, b) => {
          const preTax = b.subtotal_before_tax ?? (b.total_amount - (b.tax_amount || 0) - (b.tip_amount || 0));
          return sum + Math.max(0, preTax);
        }, 0),
      confirmedRevenue: bookings
        .filter(b => b.status === 'confirmed' || b.status === 'in_progress')
        .reduce((sum, b) => {
          const preTax = b.subtotal_before_tax ?? (b.total_amount - (b.tax_amount || 0) - (b.tip_amount || 0));
          return sum + Math.max(0, preTax);
        }, 0),
      dailyGroomCount: bookings.filter(b => b.status !== 'pending').reduce((sum, b) => sum + (b.pets?.length || 0), 0),
      shiftAvailability: { ...shiftData }
    };
  }

  getDateStr(date: Date): string {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }

  toggleShift(slot: DaySlot, shift: 'morning' | 'afternoon' | 'evening', event: Event): void {
    const isAvailable = (event.target as HTMLInputElement).checked;
    const dateStr = this.getDateStr(slot.date);
    const key = `${dateStr}:${shift}`;
    if (this.savingShifts.has(key)) {
      (event.target as HTMLInputElement).checked = !isAvailable;
      return;
    }
    // Optimistic update
    slot.shiftAvailability[shift] = isAvailable;
    this.savingShifts.add(key);
    this.businessSettingsService.upsertShiftAvailability(dateStr, shift, isAvailable).subscribe({
      next: (success) => {
        if (!success) {
          // Revert on failure
          slot.shiftAvailability[shift] = !isAvailable;
        } else {
          // Sync map
          const existing = this.shiftAvailabilityMap.get(dateStr) ?? { morning: true, afternoon: true, evening: true };
          existing[shift] = isAvailable;
          this.shiftAvailabilityMap.set(dateStr, existing);
        }
        this.savingShifts.delete(key);
      },
      error: () => {
        slot.shiftAvailability[shift] = !isAvailable;
        this.savingShifts.delete(key);
      }
    });
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
      const windowEnd = new Date(this.windowStart);
      windowEnd.setDate(windowEnd.getDate() + 6);
      return `${this.windowStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${windowEnd.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
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

  hasMissingRabies(booking: BookingWithDetails): boolean {
    if (['completed', 'cancelled'].includes(booking.status)) return false;
    if (!booking.pets || booking.pets.length === 0) return false;
    return booking.pets.some(bp => !bp.pet?.rabies_certificate_url);
  }

  // Derives a client-side "readiness" state per booking by combining raw status
  // with blockers (currently just missing rabies). Only pending|confirmed can
  // flip to 'blocked'; in_progress/completed/cancelled stay as-is.
  private computeReadiness(): void {
    this.readinessMap = new WeakMap<BookingWithDetails, Readiness>();
    const blocked: BookingWithDetails[] = [];
    const ready: BookingWithDetails[] = [];

    const visible = this.scheduleSlots.flatMap(s => s.bookings);
    for (const booking of visible) {
      const readiness = this.deriveReadiness(booking);
      this.readinessMap.set(booking, readiness);
      if (readiness === 'blocked') blocked.push(booking);
      if (readiness === 'ready_to_confirm') ready.push(booking);
    }

    const byTime = (a: BookingWithDetails, b: BookingWithDetails) => {
      const d = (a.scheduled_date || '').localeCompare(b.scheduled_date || '');
      if (d !== 0) return d;
      return (a.scheduled_time_start || '').localeCompare(b.scheduled_time_start || '');
    };
    blocked.sort(byTime);
    ready.sort(byTime);

    this.blockedBookings = blocked;
    this.readyBookings = ready;
  }

  private deriveReadiness(booking: BookingWithDetails): Readiness {
    const status = booking.status;
    if (status === 'cancelled' || status === 'completed' || status === 'in_progress') {
      return status;
    }
    if (this.hasMissingRabies(booking)) return 'blocked';
    if (status === 'pending') return 'ready_to_confirm';
    return 'confirmed';
  }

  getReadiness(booking: BookingWithDetails): Readiness {
    return this.readinessMap.get(booking) ?? this.deriveReadiness(booking);
  }

  private getReadinessStackPriority(booking: BookingWithDetails): number {
    const r = this.getReadiness(booking);
    switch (r) {
      case 'blocked': return 0;
      case 'completed': return 1;
      case 'ready_to_confirm': return 2;
      case 'in_progress': return 3;
      case 'confirmed': return 4;
      default: return 1;
    }
  }

  getReadinessClass(booking: BookingWithDetails): string {
    const r = this.getReadiness(booking);
    const classes: Record<Readiness, string> = {
      blocked: 'readiness-blocked',
      ready_to_confirm: 'readiness-ready',
      confirmed: 'readiness-confirmed',
      in_progress: 'readiness-progress',
      completed: 'readiness-completed',
      cancelled: 'readiness-cancelled',
    };
    return classes[r] || '';
  }

  getReadinessTooltip(booking: BookingWithDetails): string {
    const r = this.getReadiness(booking);
    const labels: Record<Readiness, string> = {
      blocked: 'Blocked — missing rabies certificate',
      ready_to_confirm: 'Ready to confirm',
      confirmed: 'Confirmed',
      in_progress: 'In progress',
      completed: 'Completed',
      cancelled: 'Cancelled',
    };
    const name = `${booking.client?.first_name ?? ''} ${booking.client?.last_name ?? ''}`.trim();
    return `${name}${name ? ' · ' : ''}${labels[r]}`;
  }

  setReadinessFilter(filter: ReadinessFilter): void {
    // Toggle off if clicking the already-active filter
    this.readinessFilter = this.readinessFilter === filter && filter !== 'all' ? 'all' : filter;
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

  // Overlap layout algorithm — compute side-by-side columns for overlapping bookings
  private computeBookingLayouts(): void {
    this.bookingLayoutMap.clear();

    for (const slot of this.scheduleSlots) {
      const bookings = slot.bookings;
      if (bookings.length === 0) continue;
      if (bookings.length === 1) {
        this.bookingLayoutMap.set(bookings[0].id, { columnIndex: 0, totalColumns: 1 });
        continue;
      }

      // Build overlap clusters (bookings are already sorted by start time)
      const clusters: BookingWithDetails[][] = [];
      let currentCluster: BookingWithDetails[] = [bookings[0]];
      let clusterEnd = this.timeToMinutes(bookings[0].scheduled_time_end);

      for (let i = 1; i < bookings.length; i++) {
        const startMin = this.timeToMinutes(bookings[i].scheduled_time_start);
        if (startMin < clusterEnd) {
          currentCluster.push(bookings[i]);
          clusterEnd = Math.max(clusterEnd, this.timeToMinutes(bookings[i].scheduled_time_end));
        } else {
          clusters.push(currentCluster);
          currentCluster = [bookings[i]];
          clusterEnd = this.timeToMinutes(bookings[i].scheduled_time_end);
        }
      }
      clusters.push(currentCluster);

      // Assign columns within each cluster
      for (const cluster of clusters) {
        if (cluster.length === 1) {
          this.bookingLayoutMap.set(cluster[0].id, { columnIndex: 0, totalColumns: 1 });
          continue;
        }
        const columnEnds: number[] = []; // end time of latest booking in each column
        for (const booking of cluster) {
          const startMin = this.timeToMinutes(booking.scheduled_time_start);
          const endMin = this.timeToMinutes(booking.scheduled_time_end);
          let placed = false;
          for (let col = 0; col < columnEnds.length; col++) {
            if (columnEnds[col] <= startMin) {
              columnEnds[col] = endMin;
              this.bookingLayoutMap.set(booking.id, { columnIndex: col, totalColumns: 0 });
              placed = true;
              break;
            }
          }
          if (!placed) {
            this.bookingLayoutMap.set(booking.id, { columnIndex: columnEnds.length, totalColumns: 0 });
            columnEnds.push(endMin);
          }
        }
        const totalCols = columnEnds.length;
        for (const booking of cluster) {
          const layout = this.bookingLayoutMap.get(booking.id);
          if (layout) layout.totalColumns = totalCols;
        }
      }
    }
  }

  private timeToMinutes(time: string): number {
    if (!time) return 0;
    const [hours, minutes] = time.split(':').map(Number);
    return hours * 60 + minutes;
  }

  // Side-by-side rendering for overlapping bookings: each card occupies
  // 1/totalColumns of the column width. We must set BOTH left and right inline
  // so the CSS `right: 4px` default doesn't stretch every card to the column's
  // right edge (which previously made later cards visually cover earlier ones).
  getBookingLeftStyle(bookingId: string): string {
    const layout = this.bookingLayoutMap.get(bookingId);
    if (!layout || layout.totalColumns <= 1) return '4px';
    const inset = layout.columnIndex === 0 ? '4px' : '1px';
    return `calc(100% / ${layout.totalColumns} * ${layout.columnIndex} + ${inset})`;
  }

  getBookingRightStyle(bookingId: string): string {
    const layout = this.bookingLayoutMap.get(bookingId);
    if (!layout || layout.totalColumns <= 1) return '4px';
    const remaining = layout.totalColumns - layout.columnIndex - 1;
    const inset = remaining === 0 ? '4px' : '1px';
    return `calc(100% / ${layout.totalColumns} * ${remaining} + ${inset})`;
  }

  getBookingZIndex(bookingId: string): number {
    const layout = this.bookingLayoutMap.get(bookingId);
    const columnIndex = layout?.columnIndex ?? 0;
    const booking = this.allBookings.find(b => b.id === bookingId);
    const readinessPriority = booking ? this.getReadinessStackPriority(booking) : 1;
    return readinessPriority * 100 + columnIndex + 1;
  }

  getVisibleBookings(slot: DaySlot): BookingWithDetails[] {
    if (this.readinessFilter === 'all') return slot.bookings;
    return slot.bookings.filter(b => {
      const r = this.getReadiness(b);
      if (this.readinessFilter === 'blocked') return r === 'blocked';
      if (this.readinessFilter === 'ready') return r === 'ready_to_confirm';
      if (this.readinessFilter === 'confirmed') return r === 'confirmed' || r === 'in_progress';
      return true;
    });
  }

  getMonthDotClass(booking: BookingWithDetails): string {
    return this.getReadinessClass(booking);
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
