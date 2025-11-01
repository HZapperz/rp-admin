import { Component, Input, Output, EventEmitter, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { BookingWithDetails } from '../../../core/models/types';
import { BookingService } from '../../../core/services/booking.service';
import { GroomerService } from '../../../core/services/groomer.service';

@Component({
  selector: 'app-booking-detail-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './booking-detail-modal.component.html',
  styleUrls: ['./booking-detail-modal.component.scss']
})
export class BookingDetailModalComponent implements OnInit {
  @Input() booking: BookingWithDetails | null = null;
  @Output() close = new EventEmitter<void>();
  @Output() bookingUpdated = new EventEmitter<void>();

  showGroomerModal = false;
  availableGroomers: any[] = [];
  selectedGroomerId: string = '';
  selectedTimeSlot: { label: string; start: string; end: string } | null = null;
  showRejectDialog = false;
  rejectionReason: string = '';

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

  ngOnInit() {
    // Component initialization
  }

  closeModal() {
    this.close.emit();
  }

  formatDate(dateString: string): string {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  }

  formatCurrency(amount: number): string {
    return `$${amount.toFixed(2)}`;
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

  getPackageLabel(packageType: string): string {
    const labels: Record<string, string> = {
      'basic': 'Basic Package',
      'premium': 'Premium Package',
      'deluxe': 'Deluxe Package'
    };
    return labels[packageType] || packageType;
  }

  async openApproveModal() {
    if (!this.booking) return;
    this.selectedGroomerId = '';
    this.selectedTimeSlot = null;
    this.availableGroomers = await this.groomerService.getAvailableGroomers(this.booking.scheduled_date);
    this.showGroomerModal = true;
  }

  closeGroomerModal() {
    this.showGroomerModal = false;
    this.selectedGroomerId = '';
    this.selectedTimeSlot = null;
  }

  async assignGroomerAndApprove() {
    if (!this.booking || !this.selectedGroomerId || !this.selectedTimeSlot) {
      alert('Please select both a groomer and a time slot');
      return;
    }

    const success = await this.bookingService.approveBooking(
      this.booking.id,
      this.selectedGroomerId,
      this.selectedTimeSlot.start,
      this.selectedTimeSlot.end
    );

    if (success) {
      this.showGroomerModal = false;
      this.bookingUpdated.emit();
      this.closeModal();
    } else {
      alert('Failed to approve booking. Please try again.');
    }
  }

  openRejectDialog() {
    this.rejectionReason = '';
    this.showRejectDialog = true;
  }

  closeRejectDialog() {
    this.showRejectDialog = false;
    this.rejectionReason = '';
  }

  async confirmReject() {
    if (!this.booking) return;

    if (!this.rejectionReason.trim()) {
      alert('Please provide a reason for rejection');
      return;
    }

    const success = await this.bookingService.rejectBooking(this.booking.id, this.rejectionReason);

    if (success) {
      this.showRejectDialog = false;
      this.bookingUpdated.emit();
      this.closeModal();
    } else {
      alert('Failed to reject booking. Please try again.');
    }
  }

  viewRabiesCertificate(url: string) {
    if (url) {
      window.open(url, '_blank');
    }
  }

  getPaymentStatusClass(status: string): string {
    const classes: Record<string, string> = {
      'succeeded': 'payment-success',
      'pending': 'payment-pending',
      'failed': 'payment-failed'
    };
    return classes[status] || 'payment-unknown';
  }
}
