import { Component, Input, Output, EventEmitter, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { BookingWithDetails } from '../../../core/models/types';
import { BookingService } from '../../../core/services/booking.service';
import { GroomerService } from '../../../core/services/groomer.service';
import { SupabaseService } from '../../../core/services/supabase.service';
import { EmailService } from '../../../core/services/email.service';

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
    private groomerService: GroomerService,
    private supabaseService: SupabaseService,
    private emailService: EmailService
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

    try {
      // Step 1: Approve the booking in Supabase
      console.log('Approving booking...', {
        bookingId: this.booking.id,
        groomerId: this.selectedGroomerId,
        timeSlot: this.selectedTimeSlot
      });

      const success = await this.bookingService.approveBooking(
        this.booking.id,
        this.selectedGroomerId,
        this.selectedTimeSlot.start,
        this.selectedTimeSlot.end
      );

      if (!success) {
        alert('Failed to approve booking. Please try again.');
        return;
      }

      console.log('Booking approved successfully. Fetching updated booking details...');

      // Step 2: Fetch the updated booking with groomer details
      const updatedBooking = await this.bookingService.getBookingById(this.booking.id);

      if (!updatedBooking) {
        console.error('Failed to fetch updated booking details');
        alert('Booking approved but failed to send confirmation emails. Please check the booking details.');
        this.showGroomerModal = false;
        this.bookingUpdated.emit();
        this.closeModal();
        return;
      }

      console.log('Updated booking fetched:', updatedBooking);

      // Step 3: Send confirmation emails to client, groomer, and admin
      // You can configure the admin email here
      const adminEmail = 'admin@royalpawz.com'; // Configure this as needed

      console.log('Sending confirmation emails...');
      const emailResult = await this.emailService.sendBookingApprovalEmails(
        updatedBooking,
        adminEmail
      );

      if (emailResult.success) {
        console.log('All confirmation emails sent successfully');
        alert('Booking approved and confirmation emails sent successfully!');
      } else {
        console.warn('Booking approved but some emails may have failed:', emailResult.error);
        alert('Booking approved! However, there was an issue sending some confirmation emails.');
      }

      // Step 4: Close modal and notify parent
      this.showGroomerModal = false;
      this.bookingUpdated.emit();
      this.closeModal();

    } catch (error) {
      console.error('Error in assignGroomerAndApprove:', error);
      alert('An unexpected error occurred. Please try again.');
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
    if (!url) return;

    // If the URL is already a full URL (starts with http), open it directly
    if (url.startsWith('http://') || url.startsWith('https://')) {
      window.open(url, '_blank');
      return;
    }

    // Otherwise, it's a storage path - convert it to a public URL
    // The bucket name is 'pet-certificates' based on the database storage format
    const publicUrl = this.supabaseService.getPublicUrl('pet-certificates', url);
    window.open(publicUrl, '_blank');
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
