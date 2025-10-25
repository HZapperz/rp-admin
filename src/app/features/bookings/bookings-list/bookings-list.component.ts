import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { BookingService } from '../../../core/services/booking.service';
import { GroomerService } from '../../../core/services/groomer.service';
import { BookingWithDetails, BookingStatus } from '../../../core/models/types';

@Component({
  selector: 'app-bookings-list',
  standalone: true,
  imports: [CommonModule],
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
    if (this.selectedStatus !== 'all') {
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
    if (!confirm(`Approve booking for ${booking.client?.first_name} ${booking.client?.last_name}?`)) {
      return;
    }

    // Show groomer selection modal
    this.selectedBooking = booking;
    this.availableGroomers = await this.groomerService.getAvailableGroomers(booking.scheduled_date);
    this.showGroomerModal = true;
  }

  async assignGroomerAndApprove(groomerId: string) {
    if (!this.selectedBooking) return;

    const success = await this.bookingService.approveBooking(this.selectedBooking.id, groomerId);

    if (success) {
      this.showGroomerModal = false;
      this.selectedBooking = null;
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
