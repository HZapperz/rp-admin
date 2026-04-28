import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { DomSanitizer, SafeUrl } from '@angular/platform-browser';
import { BookingService } from '../../../core/services/booking.service';
import { GroomerService } from '../../../core/services/groomer.service';
import { BookingWithDetails, BookingStatus } from '../../../core/models/types';

@Component({
  selector: 'app-bookings-list',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './bookings-list.component.html',
  styleUrls: ['./bookings-list.component.scss']
})
export class BookingsListComponent implements OnInit {
  bookings: BookingWithDetails[] = [];
  filteredBookings: BookingWithDetails[] = [];
  isLoading = true;
  error: string | null = null;

  selectedStatus: string = 'pending';
  searchTerm: string = '';
  dateFilter: string = 'all';
  rabiesFilter: 'all' | 'has' | 'missing' = 'all';
  expandedCards: Set<string> = new Set();

  constructor(
    private bookingService: BookingService,
    private groomerService: GroomerService,
    private router: Router,
    private sanitizer: DomSanitizer
  ) {}

  async ngOnInit() {
    await this.loadBookings();
  }

  async loadBookings() {
    try {
      this.isLoading = true;
      this.bookingService.getAllBookings().subscribe({
        next: (bookings) => {
          this.bookings = bookings;
          this.applyFilters();
          this.isLoading = false;
        },
        error: (err) => {
          console.error('Error loading bookings:', err);
          this.error = 'Failed to load bookings';
          this.isLoading = false;
        }
      });
    } catch (err) {
      console.error('Error:', err);
      this.error = 'Failed to load bookings';
      this.isLoading = false;
    }
  }

  applyFilters() {
    let filtered = [...this.bookings];

    // Filter by date range
    if (this.dateFilter !== 'all') {
      const todayStr = new Date().toISOString().split('T')[0];
      if (this.dateFilter === 'today') {
        filtered = filtered.filter(b => b.scheduled_date === todayStr);
      } else if (this.dateFilter === 'week') {
        const weekEnd = new Date();
        weekEnd.setDate(weekEnd.getDate() + 6);
        const weekEndStr = weekEnd.toISOString().split('T')[0];
        filtered = filtered.filter(b => b.scheduled_date >= todayStr && b.scheduled_date <= weekEndStr);
      } else if (this.dateFilter === 'month') {
        const monthEnd = new Date();
        monthEnd.setDate(monthEnd.getDate() + 29);
        const monthEndStr = monthEnd.toISOString().split('T')[0];
        filtered = filtered.filter(b => b.scheduled_date >= todayStr && b.scheduled_date <= monthEndStr);
      }
    }

    // Filter by status
    if (this.selectedStatus === 'unassigned') {
      filtered = filtered.filter(b => !b.groomer_id && b.status === 'pending');
    } else if (this.selectedStatus === 'needs_reminder') {
      filtered = filtered.filter(b => this.isNeedingManualReminder(b));
    } else if (this.selectedStatus !== 'all') {
      filtered = filtered.filter(b => b.status === this.selectedStatus);
    }

    // Filter by rabies certificate status
    if (this.rabiesFilter === 'has') {
      filtered = filtered.filter(b => !this.hasMissingRabies(b));
    } else if (this.rabiesFilter === 'missing') {
      filtered = filtered.filter(b => this.hasMissingRabies(b));
    }

    // Filter by search term
    if (this.searchTerm) {
      const term = this.searchTerm.toLowerCase();
      filtered = filtered.filter(b =>
        b.client?.first_name?.toLowerCase().includes(term) ||
        b.client?.last_name?.toLowerCase().includes(term) ||
        b.groomer?.first_name?.toLowerCase().includes(term) ||
        b.groomer?.last_name?.toLowerCase().includes(term) ||
        b.id.toLowerCase().includes(term)
      );
    }

    // Urgency sort when viewing all
    if (this.selectedStatus === 'all') {
      filtered.sort((a, b) => {
        const rankDiff = this.getUrgencyRank(a) - this.getUrgencyRank(b);
        if (rankDiff !== 0) return rankDiff;
        return (a.scheduled_date || '').localeCompare(b.scheduled_date || '');
      });
    }

    // Pending/unassigned: newest first
    if (this.selectedStatus === 'pending' || this.selectedStatus === 'unassigned') {
      filtered.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
    }

    this.filteredBookings = filtered;
  }

  getUrgencyRank(booking: BookingWithDetails): number {
    if (booking.status === 'pending' && !booking.groomer_id) return 1;
    if (booking.status === 'pending') return 2;
    if (booking.status === 'confirmed' && this.isNeedingManualReminder(booking)) return 3;
    if (booking.status === 'confirmed') return 4;
    if (booking.status === 'in_progress') return 5;
    if (booking.status === 'completed') return 6;
    return 7; // cancelled
  }

  setStatusFilter(value: string) {
    this.selectedStatus = value;
    this.applyFilters();
  }

  setDateFilter(value: string) {
    this.dateFilter = value;
    this.applyFilters();
  }

  setRabiesFilter(value: 'all' | 'has' | 'missing') {
    this.rabiesFilter = value;
    this.applyFilters();
  }

  onSearchChange(event: Event) {
    this.searchTerm = (event.target as HTMLInputElement).value;
    this.applyFilters();
  }

  get pendingCount(): number {
    return this.bookings.filter(b => b.status === 'pending').length;
  }

  get unassignedCount(): number {
    return this.bookings.filter(b => !b.groomer_id && b.status === 'pending').length;
  }

  get confirmedCount(): number {
    return this.bookings.filter(b => b.status === 'confirmed').length;
  }

  get inProgressCount(): number {
    return this.bookings.filter(b => b.status === 'in_progress').length;
  }

  get completedCount(): number {
    return this.bookings.filter(b => b.status === 'completed').length;
  }

  get cancelledCount(): number {
    return this.bookings.filter(b => b.status === 'cancelled').length;
  }

  get showAttentionBanner(): boolean {
    return this.pendingCount > 0
      && this.selectedStatus !== 'pending'
      && this.selectedStatus !== 'unassigned';
  }

  getStatusClass(status: BookingStatus): string {
    const classes: Record<BookingStatus, string> = {
      'pending': 'status-pending',
      'confirmed': 'status-confirmed',
      'in_progress': 'status-progress',
      'completed': 'status-completed',
      'cancelled': 'status-cancelled'
    };
    return classes[status] || '';
  }

  getStatusLabel(status: BookingStatus): string {
    const labels: Record<BookingStatus, string> = {
      'pending': 'Pending',
      'confirmed': 'Confirmed',
      'in_progress': 'In Progress',
      'completed': 'Completed',
      'cancelled': 'Cancelled'
    };
    return labels[status] || status;
  }

  openBookingDetail(booking: BookingWithDetails): void {
    // Navigate to booking details page
    this.router.navigate(['/bookings/details', booking.id]);
  }

  formatDate(dateString: string): string {
    // Parse ISO date string as UTC to avoid timezone conversion issues
    const date = new Date(dateString + 'T00:00:00Z');
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      timeZone: 'UTC'
    });
  }

  formatCurrency(amount: number): string {
    return `$${amount.toFixed(2)}`;
  }

  getSubmittedAgo(booking: BookingWithDetails): string {
    if (!booking.created_at) return '';
    const created = new Date(booking.created_at).getTime();
    const diffMs = Date.now() - created;
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays === 1) return '1 day ago';
    if (diffDays < 30) return `${diffDays} days ago`;
    const diffMonths = Math.floor(diffDays / 30);
    return diffMonths === 1 ? '1 mo ago' : `${diffMonths} mo ago`;
  }

  getSubmittedTooltip(booking: BookingWithDetails): string {
    if (!booking.created_at) return '';
    return new Date(booking.created_at).toLocaleString('en-US', {
      year: 'numeric', month: 'short', day: 'numeric',
      hour: 'numeric', minute: '2-digit'
    });
  }

  isStaleSubmission(booking: BookingWithDetails): boolean {
    if (booking.status !== 'pending' || !booking.created_at) return false;
    const ageDays = (Date.now() - new Date(booking.created_at).getTime()) / 86400000;
    return ageDays >= 3;
  }

  navigateToCreateBooking(): void {
    this.router.navigate(['/bookings/create']);
  }

  toggleCard(bookingId: string, event: Event): void {
    event.stopPropagation();
    if (this.expandedCards.has(bookingId)) {
      this.expandedCards.delete(bookingId);
    } else {
      this.expandedCards.add(bookingId);
    }
  }

  isCardExpanded(bookingId: string): boolean {
    return this.expandedCards.has(bookingId);
  }

  openPhoto(url: string): void {
    window.open(url, '_blank');
  }

  hasMissingRabies(booking: BookingWithDetails): boolean {
    return booking.pets?.some(bp => !bp.pet?.rabies_certificate_url) ?? false;
  }

  /** True when booking is confirmed, within 24h, and client explicitly declined SMS */
  isNeedingManualReminder(booking: BookingWithDetails): boolean {
    if (booking.status !== 'confirmed') return false;
    if (booking.client?.sms_consent !== false) return false;

    const scheduledDate = booking.scheduled_date;
    const scheduledTime = booking.scheduled_time_start;
    if (!scheduledDate || !scheduledTime) return false;

    const timeParts = scheduledTime.split(':');
    const apptDt = new Date(scheduledDate + 'T00:00:00Z');
    apptDt.setUTCHours(parseInt(timeParts[0], 10), parseInt(timeParts[1], 10), 0, 0);

    const now = Date.now();
    const diffMs = apptDt.getTime() - now;
    return diffMs > 0 && diffMs <= 24 * 60 * 60 * 1000;
  }

  get needsReminderCount(): number {
    return this.bookings.filter(b => this.isNeedingManualReminder(b)).length;
  }

  getAppointmentReminderSmsUrl(booking: BookingWithDetails): SafeUrl {
    const phone = booking.client?.phone;
    if (!phone) return this.sanitizer.bypassSecurityTrustUrl('');

    const firstName = booking.client?.first_name || '';
    const petNames = (booking.pets ?? [])
      .map(bp => bp.pet?.name)
      .filter(Boolean)
      .join(' & ') || 'your pet';

    const timeParts = (booking.scheduled_time_start || '').split(':');
    const timeDisplay = timeParts.length >= 2
      ? new Date(0, 0, 0, parseInt(timeParts[0], 10), parseInt(timeParts[1], 10))
          .toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
      : booking.scheduled_time_start;

    const hasMissingRabies = this.hasMissingRabies(booking);
    const rabiesPart = hasMissingRabies
      ? ` Please also have the rabies vaccination certificate ready — text us at (832) 504-0760 or reply to your confirmation email to submit it.`
      : '';

    const msg = `Hi ${firstName}! Reminder: ${petNames}'s grooming is tomorrow at ${timeDisplay}.${rabiesPart} See you soon! 🐾`;
    return this.sanitizer.bypassSecurityTrustUrl(`sms:${phone}&body=${encodeURIComponent(msg)}`);
  }

  // Helper methods to check for pet photos
  hasPhotos(booking: BookingWithDetails): boolean {
    return booking.pets?.some(pet => pet.before_photo_url || pet.after_photo_url) || false;
  }

  getFirstBeforePhoto(booking: BookingWithDetails): string | null {
    const petWithPhoto = booking.pets?.find(pet => pet.before_photo_url);
    return petWithPhoto?.before_photo_url || null;
  }

  getFirstAfterPhoto(booking: BookingWithDetails): string | null {
    const petWithPhoto = booking.pets?.find(pet => pet.after_photo_url);
    return petWithPhoto?.after_photo_url || null;
  }
}
