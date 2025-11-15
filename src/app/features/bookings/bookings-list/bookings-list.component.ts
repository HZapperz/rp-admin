import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
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

  constructor(
    private bookingService: BookingService,
    private groomerService: GroomerService,
    private router: Router
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

  navigateToCreateBooking(): void {
    this.router.navigate(['/bookings/create']);
  }
}
