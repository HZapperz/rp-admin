import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { BookingService } from '../../../core/services/booking.service';
import { GroomerService } from '../../../core/services/groomer.service';
import { BookingWithDetails, BookingStatus } from '../../../core/models/types';
import { BookingDetailModalComponent } from '../../../shared/components/booking-detail-modal/booking-detail-modal.component';

@Component({
  selector: 'app-bookings-list',
  standalone: true,
  imports: [CommonModule, FormsModule, BookingDetailModalComponent],
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

  // Booking Detail Modal
  showBookingModal = false;
  selectedBooking: BookingWithDetails | null = null;

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

  async openBookingDetail(booking: BookingWithDetails): Promise<void> {
    // Fetch full booking details including pets
    const fullBooking = await this.bookingService.getBookingById(booking.id);
    if (fullBooking) {
      this.selectedBooking = fullBooking;
      this.showBookingModal = true;
    }
  }

  closeBookingModal(): void {
    this.showBookingModal = false;
    this.selectedBooking = null;
  }

  async onBookingUpdated(): Promise<void> {
    // Reload bookings after an update
    await this.loadBookings();
  }

  formatDate(dateString: string): string {
    // Parse as local date to avoid timezone issues
    const [year, month, day] = dateString.split('-').map(Number);
    const date = new Date(year, month - 1, day, 12, 0, 0);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  }

  formatCurrency(amount: number): string {
    return `$${amount.toFixed(2)}`;
  }
}
