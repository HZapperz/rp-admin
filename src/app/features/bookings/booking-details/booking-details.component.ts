import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { BookingService } from '../../../core/services/booking.service';
import { AdminNotesService, AdminNote } from '../../../core/services/admin-notes.service';
import { SupabaseService } from '../../../core/services/supabase.service';
import { GroomerService } from '../../../core/services/groomer.service';
import { EmailService } from '../../../core/services/email.service';
import { BookingWithDetails } from '../../../core/models/types';
import { FormsModule } from '@angular/forms';

interface TimelineEvent {
  timestamp: string;
  label: string;
  type: 'created' | 'confirmed' | 'started' | 'completed' | 'cancelled' | 'payment';
  icon: string;
}

interface BookingModification {
  id: string;
  modification_type: string;
  old_value: any;
  new_value: any;
  price_change: number;
  reason: string;
  created_at: string;
  modified_by?: {
    first_name: string;
    last_name: string;
  };
}

@Component({
  selector: 'app-booking-details',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './booking-details.component.html',
  styleUrl: './booking-details.component.scss'
})
export class BookingDetailsComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private bookingService = inject(BookingService);
  private adminNotesService = inject(AdminNotesService);
  private supabase = inject(SupabaseService);
  private groomerService = inject(GroomerService);
  private emailService = inject(EmailService);

  booking: BookingWithDetails | null = null;
  loading = true;
  error: string | null = null;

  // Admin notes
  adminNotes: AdminNote[] = [];
  newNote = '';
  newNotePriority: 'low' | 'medium' | 'high' | 'urgent' = 'medium';
  savingNote = false;

  // Activity log
  modifications: BookingModification[] = [];

  // Timeline
  timelineEvents: TimelineEvent[] = [];

  // Photo gallery
  selectedPhoto: string | null = null;
  photoGalleryOpen = false;

  // Edit mode
  editMode = false;
  editingFields: any = {};

  // Groomer assignment
  showAssignmentForm = false;
  availableGroomers: any[] = [];
  selectedGroomerId: string = '';
  selectedTimeSlot: { label: string; start: string; end: string } | null = null;
  selectedDate: string = '';
  minDate: string = '';
  maxDate: string = '';
  showRejectDialog = false;
  rejectionReason: string = '';
  assigningGroomer = false;

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

  ngOnInit() {
    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      this.loadBookingDetails(id);
    } else {
      this.error = 'Invalid booking ID';
      this.loading = false;
    }
  }

  async loadBookingDetails(id: string) {
    try {
      this.loading = true;

      // Load booking, admin notes, and modifications in parallel
      const [booking, notes, mods] = await Promise.all([
        this.bookingService.getBookingById(id),
        this.adminNotesService.getNotesForEntity('booking', id),
        this.loadBookingModifications(id)
      ]);

      if (!booking) {
        this.error = 'Booking not found';
        this.loading = false;
        return;
      }

      this.booking = booking;
      this.adminNotes = notes;
      this.modifications = mods;
      this.buildTimeline();

      this.loading = false;
    } catch (err: any) {
      console.error('Error loading booking details:', err);
      this.error = err.message || 'Failed to load booking details';
      this.loading = false;
    }
  }

  async loadBookingModifications(bookingId: string): Promise<BookingModification[]> {
    try {
      const { data, error } = await this.supabase
        .from('booking_modifications')
        .select(`
          *,
          modified_by:modified_by (
            first_name,
            last_name
          )
        `)
        .eq('booking_id', bookingId)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error loading modifications:', error);
        return [];
      }

      return data || [];
    } catch (err) {
      console.error('Exception loading modifications:', err);
      return [];
    }
  }

  buildTimeline() {
    if (!this.booking) return;

    const events: TimelineEvent[] = [];

    // Created
    if (this.booking.created_at) {
      events.push({
        timestamp: this.booking.created_at,
        label: 'Booking Created',
        type: 'created',
        icon: '📝'
      });
    }

    // Payment authorized
    if (this.booking.payment_authorized_at) {
      events.push({
        timestamp: this.booking.payment_authorized_at,
        label: 'Payment Authorized',
        type: 'payment',
        icon: '💳'
      });
    }

    // Confirmed
    if (this.booking.status === 'confirmed' || this.booking.status === 'completed' || this.booking.status === 'in_progress') {
      // Use updated_at as a proxy for confirmation time
      events.push({
        timestamp: this.booking.updated_at || this.booking.created_at,
        label: 'Booking Confirmed',
        type: 'confirmed',
        icon: '✅'
      });
    }

    // Service started
    if (this.booking.actual_start_time) {
      events.push({
        timestamp: this.booking.actual_start_time,
        label: 'Service Started',
        type: 'started',
        icon: '🚀'
      });
    }

    // Service completed
    if (this.booking.actual_end_time) {
      events.push({
        timestamp: this.booking.actual_end_time,
        label: 'Service Completed',
        type: 'completed',
        icon: '🎉'
      });
    }

    // Payment captured
    if (this.booking.payment_captured_at) {
      events.push({
        timestamp: this.booking.payment_captured_at,
        label: 'Payment Captured',
        type: 'payment',
        icon: '💰'
      });
    }

    // Cancelled
    if (this.booking.cancelled_at) {
      events.push({
        timestamp: this.booking.cancelled_at,
        label: 'Booking Cancelled',
        type: 'cancelled',
        icon: '❌'
      });
    }

    // Sort by timestamp
    events.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    this.timelineEvents = events;
  }

  async saveNote() {
    if (!this.booking || !this.newNote.trim()) return;

    this.savingNote = true;
    const note = await this.adminNotesService.createNote(
      'booking',
      this.booking.id,
      this.newNote.trim(),
      this.newNotePriority
    );

    if (note) {
      this.adminNotes.unshift(note);
      this.newNote = '';
      this.newNotePriority = 'medium';
    }

    this.savingNote = false;
  }

  async deleteNote(noteId: string) {
    if (!confirm('Are you sure you want to delete this note?')) return;

    const success = await this.adminNotesService.deleteNote(noteId);
    if (success) {
      this.adminNotes = this.adminNotes.filter(n => n.id !== noteId);
    }
  }

  openPhotoGallery(photoUrl: string) {
    this.selectedPhoto = photoUrl;
    this.photoGalleryOpen = true;
  }

  closePhotoGallery() {
    this.selectedPhoto = null;
    this.photoGalleryOpen = false;
  }

  navigatePhoto(direction: 'prev' | 'next') {
    if (!this.booking) return;

    const allPhotos = [
      ...(this.booking.before_photos || []),
      ...(this.booking.after_photos || [])
    ];

    const currentIndex = allPhotos.indexOf(this.selectedPhoto!);

    if (direction === 'next') {
      this.selectedPhoto = allPhotos[(currentIndex + 1) % allPhotos.length];
    } else {
      this.selectedPhoto = allPhotos[(currentIndex - 1 + allPhotos.length) % allPhotos.length];
    }
  }

  toggleEditMode() {
    this.editMode = !this.editMode;
    if (this.editMode && this.booking) {
      // Initialize editing fields
      this.editingFields = {
        notes: this.booking.notes || '',
        groomer_notes: this.booking.groomer_notes || ''
      };
    }
  }

  async saveChanges() {
    if (!this.booking) return;

    try {
      const { error } = await this.supabase
        .from('bookings')
        .update({
          notes: this.editingFields.notes,
          groomer_notes: this.editingFields.groomer_notes,
          updated_at: new Date().toISOString()
        })
        .eq('id', this.booking.id);

      if (error) throw error;

      // Reload booking
      await this.loadBookingDetails(this.booking.id);
      this.editMode = false;
    } catch (err: any) {
      console.error('Error saving changes:', err);
      alert('Failed to save changes: ' + err.message);
    }
  }

  getStatusBadgeClass(status: string): string {
    const classes: Record<string, string> = {
      pending: 'bg-yellow-100 text-yellow-800',
      confirmed: 'bg-blue-100 text-blue-800',
      in_progress: 'bg-purple-100 text-purple-800',
      completed: 'bg-green-100 text-green-800',
      cancelled: 'bg-red-100 text-red-800'
    };
    return classes[status] || 'bg-gray-100 text-gray-800';
  }

  getSizeBadgeClass(size: string): string {
    const classes: Record<string, string> = {
      small: 'bg-green-100 text-green-800',
      medium: 'bg-blue-100 text-blue-800',
      large: 'bg-orange-100 text-orange-800',
      xl: 'bg-red-100 text-red-800'
    };
    return classes[size] || 'bg-gray-100 text-gray-800';
  }

  getPriorityBadgeClass(priority: string): string {
    const classes: Record<string, string> = {
      low: 'bg-gray-100 text-gray-800',
      medium: 'bg-blue-100 text-blue-800',
      high: 'bg-orange-100 text-orange-800',
      urgent: 'bg-red-100 text-red-800'
    };
    return classes[priority] || 'bg-gray-100 text-gray-800';
  }

  formatDate(dateString: string): string {
    return new Date(dateString).toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  }

  formatDateTime(dateString: string): string {
    return new Date(dateString).toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  formatTime(timeString: string): string {
    if (!timeString) return '';

    const [hours, minutes] = timeString.split(':');
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour % 12 || 12;

    return `${displayHour}:${minutes} ${ampm}`;
  }

  calculateDuration(startTime: string, endTime: string): number {
    const start = new Date(startTime).getTime();
    const end = new Date(endTime).getTime();
    return Math.round((end - start) / 60000);
  }

  goBack() {
    this.router.navigate(['/bookings']);
  }

  // Groomer Assignment Methods
  async showGroomerAssignment() {
    if (!this.booking) return;

    // Reset selections
    this.selectedGroomerId = '';
    this.selectedTimeSlot = null;

    // Initialize date to original booking date
    this.selectedDate = this.booking.scheduled_date;

    // Set date constraints
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Min date: Tomorrow (can't schedule for today or past)
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    this.minDate = tomorrow.toISOString().split('T')[0];

    // Max date: 90 days from today
    const maxDate = new Date(today);
    maxDate.setDate(maxDate.getDate() + 90);
    this.maxDate = maxDate.toISOString().split('T')[0];

    // Fetch available groomers for the selected date
    try {
      this.availableGroomers = await this.groomerService.getAvailableGroomers(this.selectedDate);
      this.showAssignmentForm = true;
    } catch (error) {
      console.error('Error fetching groomers:', error);
      alert('Failed to load available groomers. Please try again.');
    }
  }

  hideAssignmentForm() {
    this.showAssignmentForm = false;
    this.selectedGroomerId = '';
    this.selectedTimeSlot = null;
  }

  async onDateChange() {
    if (!this.selectedDate) return;

    // Validate the selected date
    const selectedDateObj = new Date(this.selectedDate + 'T00:00:00');
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (selectedDateObj < today) {
      alert('Cannot select a past date. Please choose today or a future date.');
      this.selectedDate = this.booking?.scheduled_date || '';
      return;
    }

    // Reset groomer and time slot selections when date changes
    this.selectedGroomerId = '';
    this.selectedTimeSlot = null;

    // Fetch available groomers for the new date
    try {
      this.availableGroomers = await this.groomerService.getAvailableGroomers(this.selectedDate);

      if (this.availableGroomers.length === 0) {
        alert('No groomers are available for this date. Please select a different date.');
      }
    } catch (error) {
      console.error('Error fetching groomers for date:', error);
      alert('Failed to load available groomers. Please try again.');
    }
  }

  selectTimeSlot(slot: { label: string; start: string; end: string }) {
    this.selectedTimeSlot = slot;
  }

  async assignGroomerAndApprove() {
    if (!this.booking || !this.selectedGroomerId || !this.selectedTimeSlot || !this.selectedDate) {
      alert('Please select a date, groomer, and time slot');
      return;
    }

    if (this.assigningGroomer) return; // Prevent double submission

    try {
      this.assigningGroomer = true;

      // Step 1: Approve the booking in Supabase
      console.log('Approving booking...', {
        bookingId: this.booking.id,
        groomerId: this.selectedGroomerId,
        scheduledDate: this.selectedDate,
        timeSlot: this.selectedTimeSlot
      });

      const success = await this.bookingService.approveBooking(
        this.booking.id,
        this.selectedGroomerId,
        this.selectedDate,
        this.selectedTimeSlot.start,
        this.selectedTimeSlot.end
      );

      if (!success) {
        alert('Failed to approve booking. Please try again.');
        this.assigningGroomer = false;
        return;
      }

      console.log('Booking approved successfully. Fetching updated booking details...');

      // Step 2: Fetch the updated booking with groomer details
      const updatedBooking = await this.bookingService.getBookingById(this.booking.id);

      if (!updatedBooking) {
        console.error('Failed to fetch updated booking details');
        alert('Booking approved but failed to send confirmation emails. Please check the booking details.');
        this.showAssignmentForm = false;
        this.assigningGroomer = false;
        await this.loadBookingDetails(this.booking.id);
        return;
      }

      console.log('Updated booking fetched:', {
        hasPets: !!updatedBooking.pets,
        petsCount: updatedBooking.pets?.length || 0,
        hasGroomer: !!updatedBooking.groomer,
        hasClient: !!updatedBooking.client
      });

      // If the updated booking doesn't have pets, use the original booking's pets
      if (!updatedBooking.pets || updatedBooking.pets.length === 0) {
        console.warn('Updated booking missing pets data, using original booking pets');
        updatedBooking.pets = this.booking.pets;
      }

      // Step 3: Send confirmation emails to client, groomer, and admin
      const adminEmail = 'admin@royalpawzusa.com';

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

      // Step 4: Reload booking details and close assignment form
      this.showAssignmentForm = false;
      this.assigningGroomer = false;
      await this.loadBookingDetails(this.booking.id);

    } catch (error) {
      console.error('Error in assignGroomerAndApprove:', error);
      alert('An unexpected error occurred. Please try again.');
      this.assigningGroomer = false;
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
      alert('Booking rejected successfully');
      this.showRejectDialog = false;
      await this.loadBookingDetails(this.booking.id);
    } else {
      alert('Failed to reject booking. Please try again.');
    }
  }
}
