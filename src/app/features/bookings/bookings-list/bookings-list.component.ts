import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
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

  selectedStatus: string = 'all';
  searchTerm: string = '';

  showGroomerModal = false;
  selectedBooking: BookingWithDetails | null = null;
  availableGroomers: any[] = [];
  selectedGroomerId: string = '';
  selectedTimeSlot: { label: string; start: string; end: string } | null = null;

  // Time slots configuration
  morningSlots = [
    { label: '8:30 AM - 9:45 AM', start: '08:30:00', end: '09:45:00' },
    { label: '9:45 AM - 11:00 AM', start: '09:45:00', end: '11:00:00' },
    { label: '11:00 AM - 12:15 PM', start: '11:00:00', end: '12:15:00' },
  ];

  afternoonSlots = [
    { label: '1:00 PM - 2:15 PM', start: '13:00:00', end: '14:15:00' },
    { label: '2:15 PM - 3:30 PM', start: '14:15:00', end: '15:30:00' },
    { label: '3:30 PM - 4:45 PM', start: '15:30:00', end: '16:45:00' },
  ];

  constructor(
    private bookingService: BookingService,
    private groomerService: GroomerService
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

    // Filter by status
    if (this.selectedStatus === 'unassigned') {
      // Show bookings without an assigned groomer
      filtered = filtered.filter(b => !b.groomer_id && b.status === 'pending');
    } else if (this.selectedStatus !== 'all') {
      filtered = filtered.filter(b => b.status === this.selectedStatus);
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

    this.filteredBookings = filtered;
  }

  onStatusFilterChange(event: Event) {
    this.selectedStatus = (event.target as HTMLSelectElement).value;
    this.applyFilters();
  }

  onSearchChange(event: Event) {
    this.searchTerm = (event.target as HTMLInputElement).value;
    this.applyFilters();
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

  async approveBooking(booking: BookingWithDetails) {
    // Show groomer selection modal
    this.selectedBooking = booking;
    this.selectedGroomerId = '';
    this.selectedTimeSlot = null;
    this.availableGroomers = await this.groomerService.getAvailableGroomers(booking.scheduled_date);
    this.showGroomerModal = true;
  }

  async assignGroomerAndApprove() {
    if (!this.selectedBooking || !this.selectedGroomerId) {
      alert('Please select a groomer');
      return;
    }

    if (!this.selectedTimeSlot) {
      alert('Please select a time slot');
      return;
    }

    const success = await this.bookingService.approveBooking(
      this.selectedBooking.id,
      this.selectedGroomerId,
      this.selectedTimeSlot.start,
      this.selectedTimeSlot.end
    );

    if (success) {
      this.showGroomerModal = false;
      this.selectedBooking = null;
      this.selectedGroomerId = '';
      this.selectedTimeSlot = null;
      await this.loadBookings();
    } else {
      alert('Failed to approve booking');
    }
  }

  async rejectBooking(booking: BookingWithDetails) {
    const reason = prompt(`Reject booking for ${booking.client?.first_name} ${booking.client?.last_name}?\n\nReason:`);

    if (reason === null) return;

    const success = await this.bookingService.rejectBooking(booking.id, reason);

    if (success) {
      await this.loadBookings();
    } else {
      alert('Failed to reject booking');
    }
  }

  closeGroomerModal() {
    this.showGroomerModal = false;
    this.selectedBooking = null;
  }

  formatDate(dateString: string): string {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  }

  formatCurrency(amount: number): string {
    return `$${amount.toFixed(2)}`;
  }
}
