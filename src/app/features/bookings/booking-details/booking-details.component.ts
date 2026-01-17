import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { BookingService } from '../../../core/services/booking.service';
import { AdminNotesService, AdminNote } from '../../../core/services/admin-notes.service';
import { SupabaseService } from '../../../core/services/supabase.service';
import { GroomerService } from '../../../core/services/groomer.service';
import { EmailService } from '../../../core/services/email.service';
import { ChangeRequestService, ChangeRequest } from '../../../core/services/change-request.service';
import { BookingWithDetails } from '../../../core/models/types';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../../environments/environment';

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
  private changeRequestService = inject(ChangeRequestService);
  private http = inject(HttpClient);

  booking: BookingWithDetails | null = null;
  loading = true;
  error: string | null = null;

  // Pending change request
  pendingChangeRequest: ChangeRequest | null = null;
  processingChangeRequest = false;
  changeRequestRejectReason = '';
  showChangeRequestRejectModal = false;

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

  // Time change modal
  showTimeChangeModal = false;
  timeChangeReason = '';
  newScheduledDate = '';
  newTimeSlot: { label: string; start: string; end: string } | null = null;
  savingTimeChange = false;

  // Custom time slot for time change modal
  useCustomTimeSlotForChange = false;
  customStartTimeForChange = '';
  customEndTimeForChange = '';
  showTimeHelpForChange = false;

  // Custom time slot for groomer assignment
  useCustomTimeSlot = false;
  customStartTime = '';
  customEndTime = '';
  showTimeHelp = false;

  // Service change modal
  showServiceChangeModal = false;
  selectedPetForServiceChange: any = null;
  newPackageType: 'basic' | 'premium' | 'deluxe' = 'basic';
  selectedAddons: { id: string; name: string; price: number }[] = [];
  availableAddons: any[] = [];
  serviceChangeReason = '';
  savingServiceChange = false;

  // Discount management
  discountOption: 'keep' | 'recalculate' | 'custom' | 'remove' = 'keep';
  customDiscountAmount: number = 0;
  currentDiscountAmount: number = 0;
  currentDiscountPercentage: number = 0;

  // Package configuration
  servicePackages = [
    { id: 'basic', name: 'Royal Bath', icon: '🛁' },
    { id: 'premium', name: 'Royal Groom', icon: '✂️' },
    { id: 'deluxe', name: 'Royal Spa', icon: '✨' }
  ];

  packagePrices: Record<string, Record<string, number>> = {
    basic: { small: 59, medium: 79, large: 99, xl: 119 },
    premium: { small: 95, medium: 125, large: 150, xl: 175 },
    deluxe: { small: 115, medium: 145, large: 175, xl: 205 }
  };

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

  // Status management
  isUpdatingStatus = false;

  // Payment management
  isCapturingPayment = false;
  isProcessingTip = false;
  showCaptureModal = false;
  showTipModal = false;
  tipAmount: number = 0;
  captureAmount: number = 0;
  captureTipAmount: number = 0;
  paymentError: string | null = null;
  paymentSuccess: string | null = null;
  earningsBreakdown: any = null;

  ngOnInit() {
    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      this.loadBookingDetails(id);
    } else {
      this.error = 'Invalid booking ID';
      this.loading = false;
    }
  }

  canCancelBooking(): boolean {
    if (!this.booking) return false;
    const status = this.booking.status as string;
    return status !== 'completed' && status !== 'cancelled';
  }

  async updateBookingStatus(newStatus: string) {
    if (!this.booking) return;

    // Confirm cancel action
    if (newStatus === 'cancelled') {
      if (!confirm('Are you sure you want to cancel this booking?')) {
        return;
      }
    }

    this.isUpdatingStatus = true;

    try {
      const updateData: any = {
        status: newStatus,
        updated_at: new Date().toISOString()
      };

      // Add timestamps based on status
      if (newStatus === 'confirmed') {
        updateData.confirmed_at = new Date().toISOString();
      } else if (newStatus === 'in_progress') {
        updateData.actual_start_time = new Date().toISOString();
      } else if (newStatus === 'completed') {
        updateData.actual_end_time = new Date().toISOString();
        updateData.completed_at = new Date().toISOString();
      } else if (newStatus === 'cancelled') {
        updateData.cancelled_at = new Date().toISOString();
      }

      const { error } = await this.supabase
        .from('bookings')
        .update(updateData)
        .eq('id', this.booking.id);

      if (error) throw error;

      // Reload booking to get updated data
      await this.loadBookingDetails(this.booking.id);
    } catch (err: any) {
      console.error('Error updating booking status:', err);
      alert('Failed to update booking status: ' + (err.message || 'Unknown error'));
    } finally {
      this.isUpdatingStatus = false;
    }
  }

  async loadBookingDetails(id: string) {
    try {
      this.loading = true;

      // Load booking, admin notes, modifications, and pending change request in parallel
      const [booking, notes, mods, pendingRequest] = await Promise.all([
        this.bookingService.getBookingById(id),
        this.adminNotesService.getNotesForEntity('booking', id),
        this.loadBookingModifications(id),
        this.changeRequestService.getPendingRequestForBooking(id)
      ]);

      if (!booking) {
        this.error = 'Booking not found';
        this.loading = false;
        return;
      }

      this.booking = booking;
      this.adminNotes = notes;
      this.modifications = mods;
      this.pendingChangeRequest = pendingRequest;
      this.buildTimeline();

      // Debug: Log photo data
      console.log('Booking photos loaded:', {
        bookingId: booking.id,
        before_photos: booking.before_photos,
        after_photos: booking.after_photos,
        beforeCount: booking.before_photos?.length || 0,
        afterCount: booking.after_photos?.length || 0
      });

      // Load earnings breakdown if payment was captured
      if (booking.payment_captured_at) {
        this.loadEarningsBreakdown();
      }

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

    // Collect all pet photos
    const allPhotos: string[] = [];
    for (const pet of this.booking.pets || []) {
      if (pet.before_photo_url) allPhotos.push(pet.before_photo_url);
      if (pet.after_photo_url) allPhotos.push(pet.after_photo_url);
    }

    const currentIndex = allPhotos.indexOf(this.selectedPhoto!);

    if (direction === 'next') {
      this.selectedPhoto = allPhotos[(currentIndex + 1) % allPhotos.length];
    } else {
      this.selectedPhoto = allPhotos[(currentIndex - 1 + allPhotos.length) % allPhotos.length];
    }
  }

  hasAnyPetPhotos(): boolean {
    if (!this.booking?.pets) return false;
    return this.booking.pets.some(pet => pet.before_photo_url || pet.after_photo_url);
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
    // Parse ISO date string as UTC to avoid timezone conversion issues
    const date = new Date(dateString + 'T00:00:00Z');
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      timeZone: 'UTC'
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
    // Reset custom time state
    this.useCustomTimeSlot = false;
    this.customStartTime = '';
    this.customEndTime = '';
    this.showTimeHelp = false;
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
    // Clear custom time when selecting predefined slot
    if (this.useCustomTimeSlot) {
      this.useCustomTimeSlot = false;
    }
  }

  // Custom Time Slot Methods
  toggleCustomTimeSlot() {
    this.useCustomTimeSlot = !this.useCustomTimeSlot;
    if (this.useCustomTimeSlot) {
      // Clear predefined slot selection when switching to custom mode
      this.selectedTimeSlot = null;
    } else {
      // Clear custom time inputs when switching to predefined mode
      this.customStartTime = '';
      this.customEndTime = '';
    }
  }

  toggleTimeHelp() {
    this.showTimeHelp = !this.showTimeHelp;
  }

  /**
   * Auto-format time input to standard "H:MM AM/PM" format
   * Handles many formats: "930am", "9:30am", "1230pm", "12.30pm", "930", "9:30", "0930"
   */
  formatTimeInput(value: string): string {
    if (!value) return '';

    // Remove spaces and normalize to uppercase
    let cleaned = value.replace(/\s+/g, '').toUpperCase();

    // Convert dots to colons (12.30pm -> 12:30pm)
    cleaned = cleaned.replace(/\./g, ':');

    // Handle formats without separator (1230pm -> 12:30pm, 930am -> 9:30am)
    // Match 3 or 4 digits followed by optional AM/PM
    const noSeparatorMatch = cleaned.match(/^(\d{3,4})(AM|PM)?$/);
    if (noSeparatorMatch) {
      const digits = noSeparatorMatch[1];
      const period = noSeparatorMatch[2] || '';
      if (digits.length === 3) {
        // 930 -> 9:30
        cleaned = digits[0] + ':' + digits.slice(1) + period;
      } else if (digits.length === 4) {
        // 1230 -> 12:30
        cleaned = digits.slice(0, 2) + ':' + digits.slice(2) + period;
      }
    }

    // Match patterns: "9:30AM", "12:30PM", "9:30", "12:30"
    const match = cleaned.match(/^(\d{1,2}):(\d{2})(AM|PM)?$/);
    if (!match) return value; // Return original if no match

    let hours = parseInt(match[1], 10);
    const minutes = match[2];
    let period = match[3] || '';

    // If no period provided, guess based on hour
    if (!period) {
      // Assume business hours: 8-11 = AM, 12+ = PM
      if (hours >= 8 && hours < 12) {
        period = 'AM';
      } else if (hours === 12) {
        period = 'PM';
      } else if (hours >= 1 && hours <= 5) {
        period = 'PM'; // 1-5 likely afternoon
      } else {
        period = 'AM';
      }
    }

    // Normalize hours for display (1-12)
    if (hours > 12) hours = hours - 12;
    if (hours === 0) hours = 12;

    return `${hours}:${minutes} ${period}`;
  }

  /**
   * Convert 12-hour time format to 24-hour format
   * Example: "9:30 AM" → "09:30:00", "1:00 PM" → "13:00:00"
   */
  convertTo24Hour(time12h: string): string {
    if (!time12h) return '';

    // Normalize the input - handle various formats
    const normalized = time12h.trim().toUpperCase();

    // Parse "9:30 AM", "9:30AM", "09:30 AM", etc.
    const match = normalized.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/);
    if (!match) return '';

    let hours = parseInt(match[1], 10);
    const minutes = match[2];
    const period = match[3];

    // Validate hours
    if (hours < 1 || hours > 12) return '';

    // Convert to 24-hour
    if (period === 'PM' && hours !== 12) hours += 12;
    if (period === 'AM' && hours === 12) hours = 0;

    return `${hours.toString().padStart(2, '0')}:${minutes}:00`;
  }

  onCustomStartTimeBlur() {
    this.customStartTime = this.formatTimeInput(this.customStartTime);
  }

  onCustomEndTimeBlur() {
    this.customEndTime = this.formatTimeInput(this.customEndTime);
  }

  isCustomTimeValid(): boolean {
    const start24 = this.convertTo24Hour(this.customStartTime);
    const end24 = this.convertTo24Hour(this.customEndTime);
    return start24 !== '' && end24 !== '';
  }

  async assignGroomerAndApprove() {
    // Validate based on whether using custom time or predefined slot
    const hasValidTime = this.useCustomTimeSlot
      ? this.isCustomTimeValid()
      : !!this.selectedTimeSlot;

    if (!this.booking || !this.selectedGroomerId || !hasValidTime || !this.selectedDate) {
      alert('Please select a date, groomer, and time slot');
      return;
    }

    if (this.assigningGroomer) return; // Prevent double submission

    // Get time values based on mode
    let timeSlotStart: string;
    let timeSlotEnd: string;

    if (this.useCustomTimeSlot) {
      timeSlotStart = this.convertTo24Hour(this.customStartTime);
      timeSlotEnd = this.convertTo24Hour(this.customEndTime);
    } else {
      timeSlotStart = this.selectedTimeSlot!.start;
      timeSlotEnd = this.selectedTimeSlot!.end;
    }

    try {
      this.assigningGroomer = true;

      // Step 1: Approve the booking in Supabase
      console.log('Approving booking...', {
        bookingId: this.booking.id,
        groomerId: this.selectedGroomerId,
        scheduledDate: this.selectedDate,
        timeSlotStart,
        timeSlotEnd,
        isCustomTime: this.useCustomTimeSlot
      });

      const success = await this.bookingService.approveBooking(
        this.booking.id,
        this.selectedGroomerId,
        this.selectedDate,
        timeSlotStart,
        timeSlotEnd
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

  viewRabiesCertificate(url: string) {
    if (!url) return;

    // If the URL is already a full URL (starts with http), open it directly
    if (url.startsWith('http://') || url.startsWith('https://')) {
      window.open(url, '_blank');
      return;
    }

    // Otherwise, it's a storage path - convert it to a public URL
    const publicUrl = this.supabase.getPublicUrl('pet-certificates', url);
    window.open(publicUrl, '_blank');
  }

  getPetPhotoUrl(photoUrl: string | undefined): string {
    if (!photoUrl) return 'https://via.placeholder.com/60?text=Pet';

    // If it's already a full URL, return it
    if (photoUrl.startsWith('http://') || photoUrl.startsWith('https://')) {
      return photoUrl;
    }

    // The photo_url from database format: "pet-photos/user_id/filename.jpg"
    // Extract bucket and path
    const parts = photoUrl.split('/');
    if (parts.length >= 2) {
      const bucket = parts[0];
      const path = parts.slice(1).join('/');
      return this.supabase.getPublicUrl(bucket, path);
    }

    // Fallback: assume pet-photos bucket and use the whole string as path
    return this.supabase.getPublicUrl('pet-photos', photoUrl);
  }

  // Time Change Methods
  openTimeChangeModal() {
    if (!this.booking) return;

    // Initialize with current booking date
    this.newScheduledDate = this.booking.scheduled_date;
    this.newTimeSlot = null;
    this.timeChangeReason = '';

    // Set date constraints
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Min date: Tomorrow
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    this.minDate = tomorrow.toISOString().split('T')[0];

    // Max date: 90 days from today
    const maxDate = new Date(today);
    maxDate.setDate(maxDate.getDate() + 90);
    this.maxDate = maxDate.toISOString().split('T')[0];

    this.showTimeChangeModal = true;
  }

  closeTimeChangeModal() {
    this.showTimeChangeModal = false;
    this.newScheduledDate = '';
    this.newTimeSlot = null;
    this.timeChangeReason = '';
    // Reset custom time state
    this.useCustomTimeSlotForChange = false;
    this.customStartTimeForChange = '';
    this.customEndTimeForChange = '';
    this.showTimeHelpForChange = false;
  }

  selectNewTimeSlot(slot: { label: string; start: string; end: string }) {
    this.newTimeSlot = slot;
    // Clear custom time when selecting predefined slot
    if (this.useCustomTimeSlotForChange) {
      this.useCustomTimeSlotForChange = false;
    }
  }

  // Custom Time Slot Methods for Time Change Modal
  toggleCustomTimeSlotForChange() {
    this.useCustomTimeSlotForChange = !this.useCustomTimeSlotForChange;
    if (this.useCustomTimeSlotForChange) {
      // Clear predefined slot selection when switching to custom mode
      this.newTimeSlot = null;
    } else {
      // Clear custom time inputs when switching to predefined mode
      this.customStartTimeForChange = '';
      this.customEndTimeForChange = '';
    }
  }

  toggleTimeHelpForChange() {
    this.showTimeHelpForChange = !this.showTimeHelpForChange;
  }

  onCustomStartTimeForChangeBlur() {
    this.customStartTimeForChange = this.formatTimeInput(this.customStartTimeForChange);
  }

  onCustomEndTimeForChangeBlur() {
    this.customEndTimeForChange = this.formatTimeInput(this.customEndTimeForChange);
  }

  isCustomTimeForChangeValid(): boolean {
    const start24 = this.convertTo24Hour(this.customStartTimeForChange);
    const end24 = this.convertTo24Hour(this.customEndTimeForChange);
    return start24 !== '' && end24 !== '';
  }

  async confirmTimeChange() {
    if (!this.booking) return;

    // Validate inputs
    if (!this.newScheduledDate) {
      alert('Please select a new date');
      return;
    }

    // Validate based on whether using custom time or predefined slot
    const hasValidTime = this.useCustomTimeSlotForChange
      ? this.isCustomTimeForChangeValid()
      : !!this.newTimeSlot;

    if (!hasValidTime) {
      alert('Please select a new time slot or enter a valid custom time');
      return;
    }

    if (!this.timeChangeReason.trim()) {
      alert('Please provide a reason for the time change');
      return;
    }

    if (this.savingTimeChange) return;

    // Get time values based on mode
    let timeSlotStart: string;
    let timeSlotEnd: string;

    if (this.useCustomTimeSlotForChange) {
      timeSlotStart = this.convertTo24Hour(this.customStartTimeForChange);
      timeSlotEnd = this.convertTo24Hour(this.customEndTimeForChange);
    } else {
      timeSlotStart = this.newTimeSlot!.start;
      timeSlotEnd = this.newTimeSlot!.end;
    }

    try {
      this.savingTimeChange = true;

      // Call the booking service to change the time
      const result = await this.bookingService.changeBookingTime(
        this.booking.id,
        this.newScheduledDate,
        timeSlotStart,
        timeSlotEnd
      );

      if (!result.success) {
        alert('Failed to update booking time. Please try again.');
        this.savingTimeChange = false;
        return;
      }

      // Fetch updated booking for email
      const updatedBooking = await this.bookingService.getBookingById(this.booking.id);

      if (updatedBooking && result.oldValues) {
        // Send time change notification emails
        const emailResult = await this.emailService.sendTimeChangeEmails(
          updatedBooking,
          result.oldValues.scheduled_date,
          result.oldValues.scheduled_time_start,
          result.oldValues.scheduled_time_end,
          this.timeChangeReason
        );

        if (emailResult.success) {
          alert('Booking time updated and notifications sent to customer and groomer!');
        } else {
          alert('Booking time updated, but there was an issue sending notification emails.');
        }
      } else {
        alert('Booking time updated successfully!');
      }

      // Close modal and reload booking
      this.closeTimeChangeModal();
      this.savingTimeChange = false;
      await this.loadBookingDetails(this.booking.id);

    } catch (error) {
      console.error('Error changing booking time:', error);
      alert('An unexpected error occurred. Please try again.');
      this.savingTimeChange = false;
    }
  }

  // Service Change Methods
  async openServiceChangeModal(bookingPet: any) {
    if (!this.booking) return;

    // Load available addons from database
    try {
      const { data: addons, error } = await this.supabase
        .from('addons')
        .select('*')
        .eq('is_active', true)
        .order('display_order');

      if (error) {
        console.error('Error loading addons:', error);
        alert('Failed to load add-ons. Please try again.');
        return;
      }

      this.availableAddons = addons || [];
    } catch (err) {
      console.error('Exception loading addons:', err);
      alert('Failed to load add-ons. Please try again.');
      return;
    }

    // Initialize modal with current pet's package and addons
    this.selectedPetForServiceChange = bookingPet;
    this.newPackageType = bookingPet.package_type || 'basic';

    // Initialize selected addons from current booking addons
    this.selectedAddons = (bookingPet.addons || []).map((addon: any) => ({
      id: addon.id,
      name: addon.addon_name,
      price: parseFloat(addon.addon_price) || 0
    }));

    // Initialize discount values from booking
    this.currentDiscountAmount = Number(this.booking.discount_amount) || 0;
    // Calculate current discount percentage based on original subtotal
    const originalSubtotal = Number(this.booking.original_subtotal) || 0;
    this.currentDiscountPercentage = originalSubtotal > 0
      ? (this.currentDiscountAmount / originalSubtotal) * 100
      : 0;
    this.discountOption = 'keep';
    this.customDiscountAmount = this.currentDiscountAmount;

    this.serviceChangeReason = '';
    this.showServiceChangeModal = true;
  }

  closeServiceChangeModal() {
    this.showServiceChangeModal = false;
    this.selectedPetForServiceChange = null;
    this.newPackageType = 'basic';
    this.selectedAddons = [];
    this.serviceChangeReason = '';
    // Reset discount values
    this.discountOption = 'keep';
    this.customDiscountAmount = 0;
    this.currentDiscountAmount = 0;
    this.currentDiscountPercentage = 0;
  }

  selectPackage(packageId: string) {
    if (packageId === 'basic' || packageId === 'premium' || packageId === 'deluxe') {
      const previousPackage = this.newPackageType;
      this.newPackageType = packageId;

      // Remove any selected addons that are no longer available for the new package
      if (previousPackage !== packageId) {
        this.selectedAddons = this.selectedAddons.filter(selectedAddon => {
          const addon = this.availableAddons.find(a => a.id === selectedAddon.id);
          if (!addon) return false;
          return this.isAddonAvailableForPackage(addon);
        });
      }
    }
  }

  toggleAddon(addon: any) {
    const existingIndex = this.selectedAddons.findIndex(a => a.name === addon.name);

    if (existingIndex >= 0) {
      // Remove addon
      this.selectedAddons = this.selectedAddons.filter((_, i) => i !== existingIndex);
    } else {
      // Add addon with size-based pricing
      const price = addon.is_percentage
        ? this.calculatePercentageAddonPrice(addon.percentage)
        : this.getAddonPriceForSize(addon);

      this.selectedAddons = [...this.selectedAddons, {
        id: addon.id,
        name: addon.name,
        price: price
      }];
    }
  }

  isAddonSelected(addon: any): boolean {
    return this.selectedAddons.some(a => a.name === addon.name);
  }

  // Calculate addon price based on pet size (supports size-based pricing)
  getAddonPriceForSize(addon: any): number {
    if (!this.selectedPetForServiceChange) return parseFloat(addon.price) || 0;

    const size = (this.selectedPetForServiceChange.service_size || 'medium').toLowerCase();

    // Check for size-based pricing
    if (size === 'small' && addon.price_small !== null && addon.price_small !== undefined) {
      return parseFloat(addon.price_small);
    }
    if (size === 'medium' && addon.price_medium !== null && addon.price_medium !== undefined) {
      return parseFloat(addon.price_medium);
    }
    if (size === 'large' && addon.price_large !== null && addon.price_large !== undefined) {
      return parseFloat(addon.price_large);
    }
    if (size === 'xl' && addon.price_xl !== null && addon.price_xl !== undefined) {
      return parseFloat(addon.price_xl);
    }

    // Fall back to flat price
    return parseFloat(addon.price) || 0;
  }

  // Check if addon is available for the selected package
  isAddonAvailableForPackage(addon: any): boolean {
    // If no required_packages, available for all
    if (!addon.required_packages || addon.required_packages.length === 0) {
      return true;
    }
    // Check if current package is in the required packages list
    return addon.required_packages.includes(this.newPackageType);
  }

  // Get filtered addons for the current package
  getFilteredAddons(): any[] {
    return this.availableAddons.filter(addon =>
      !addon.is_percentage && this.isAddonAvailableForPackage(addon)
    );
  }

  calculatePercentageAddonPrice(percentage: number): number {
    if (!this.selectedPetForServiceChange) return 0;
    const packagePrice = this.calculateNewPackagePrice();
    return Math.round(packagePrice * (percentage / 100) * 100) / 100;
  }

  calculateNewPackagePrice(): number {
    if (!this.selectedPetForServiceChange) return 0;
    const size = this.selectedPetForServiceChange.service_size || 'medium';
    return this.packagePrices[this.newPackageType]?.[size] || 0;
  }

  calculateNewAddonsTotal(): number {
    return this.selectedAddons.reduce((sum, addon) => sum + addon.price, 0);
  }

  calculateNewPetTotal(): number {
    return this.calculateNewPackagePrice() + this.calculateNewAddonsTotal();
  }

  calculatePriceDifference(): number {
    if (!this.selectedPetForServiceChange) return 0;
    const currentTotal = parseFloat(this.selectedPetForServiceChange.total_price) || 0;
    return this.calculateNewPetTotal() - currentTotal;
  }

  // Discount calculation methods
  getCalculatedDiscount(): number {
    switch (this.discountOption) {
      case 'keep':
        return this.currentDiscountAmount;
      case 'recalculate':
        // Apply same percentage to new subtotal
        const newSubtotal = this.calculateNewBookingSubtotal();
        return Math.round(newSubtotal * (this.currentDiscountPercentage / 100) * 100) / 100;
      case 'custom':
        return this.customDiscountAmount;
      case 'remove':
        return 0;
      default:
        return this.currentDiscountAmount;
    }
  }

  calculateNewBookingSubtotal(): number {
    if (!this.booking) return 0;
    // Sum all pets' totals, replacing the selected pet's price with new price
    let subtotal = 0;
    for (const pet of this.booking.pets || []) {
      if (pet.id === this.selectedPetForServiceChange?.id) {
        subtotal += this.calculateNewPetTotal();
      } else {
        subtotal += Number(pet.total_price) || 0;
      }
    }
    return subtotal;
  }

  calculateNewBookingTotal(): number {
    const subtotal = this.calculateNewBookingSubtotal();
    const discount = this.getCalculatedDiscount();
    const taxRate = Number(this.booking?.tax_rate) || 0.0825;
    const serviceFee = Number(this.booking?.service_fee) || 0;
    const processingFee = Number(this.booking?.processing_fee) || 0;
    const rushFee = Number(this.booking?.rush_fee) || 0;

    const subtotalBeforeTax = subtotal + serviceFee + rushFee - discount;
    const taxAmount = Math.round(subtotalBeforeTax * taxRate * 100) / 100;
    return Math.round((subtotalBeforeTax + taxAmount + processingFee) * 100) / 100;
  }

  calculateBookingTotalDifference(): number {
    if (!this.booking) return 0;
    const currentTotal = Number(this.booking.total_amount) || 0;
    return this.calculateNewBookingTotal() - currentTotal;
  }

  getPackageName(packageType: string): string {
    const pkg = this.servicePackages.find(p => p.id === packageType);
    return pkg ? pkg.name : packageType;
  }

  async confirmServiceChange() {
    if (!this.booking || !this.selectedPetForServiceChange) return;

    // Validate inputs
    if (!this.serviceChangeReason.trim()) {
      alert('Please provide a reason for the service change');
      return;
    }

    if (this.savingServiceChange) return;

    try {
      this.savingServiceChange = true;

      const newPackagePrice = this.calculateNewPackagePrice();
      const newTotalPrice = this.calculateNewPetTotal();
      const addonsData = this.selectedAddons.map(a => ({
        name: a.name,
        price: a.price
      }));

      // Call the booking service to change the service
      const result = await this.bookingService.changeBookingService(
        this.booking.id,
        this.selectedPetForServiceChange.id,
        this.newPackageType,
        newPackagePrice,
        newTotalPrice,
        addonsData,
        this.serviceChangeReason,
        this.getCalculatedDiscount()
      );

      if (!result.success) {
        alert('Failed to update booking service. Please try again.');
        this.savingServiceChange = false;
        return;
      }

      // Send service change notification email to customer
      if (this.booking.client?.email && result.oldValues) {
        try {
          await this.emailService.sendServiceChangeEmail({
            booking: {
              id: this.booking.id,
              scheduled_date: this.booking.scheduled_date,
              address: this.booking.address,
              city: this.booking.city,
              state: this.booking.state
            },
            client: {
              first_name: this.booking.client.first_name,
              last_name: this.booking.client.last_name,
              email: this.booking.client.email
            },
            pet: {
              name: this.selectedPetForServiceChange.pet?.name || 'Your pet'
            },
            oldService: {
              package_name: this.getPackageName(result.oldValues.package_type),
              total_price: result.oldValues.total_price,
              addons: result.oldValues.addons.map((a: any) => a.addon_name)
            },
            newService: {
              package_name: this.getPackageName(this.newPackageType),
              total_price: newTotalPrice,
              addons: this.selectedAddons.map(a => a.name)
            },
            priceDifference: this.calculatePriceDifference(),
            reason: this.serviceChangeReason,
            newBookingTotal: result.newBookingTotal
          });
        } catch (emailErr) {
          console.error('Error sending service change email:', emailErr);
          // Don't fail the operation if email fails
        }
      }

      alert('Service updated successfully! Customer has been notified.');

      // Close modal and reload booking
      this.closeServiceChangeModal();
      this.savingServiceChange = false;
      await this.loadBookingDetails(this.booking.id);

    } catch (error) {
      console.error('Error changing booking service:', error);
      alert('An unexpected error occurred. Please try again.');
      this.savingServiceChange = false;
    }
  }

  // Change Request Methods
  async approveChangeRequest() {
    if (!this.pendingChangeRequest || !this.booking) return;

    if (!confirm('Are you sure you want to approve this change request? The booking will be updated to the new date/time.')) {
      return;
    }

    try {
      this.processingChangeRequest = true;
      const currentUser = this.supabase.session?.user;

      if (!currentUser) {
        alert('You must be logged in to approve requests');
        return;
      }

      const success = await this.changeRequestService.approveRequest(
        this.pendingChangeRequest.id,
        currentUser.id
      );

      if (success) {
        // Send email notification
        await this.sendChangeRequestStatusEmail('approved');
        alert('Change request approved! The booking has been updated and notifications sent.');
        await this.loadBookingDetails(this.booking.id);
      } else {
        alert('Failed to approve change request. Please try again.');
      }
    } catch (err) {
      console.error('Error approving change request:', err);
      alert('An error occurred while approving the request.');
    } finally {
      this.processingChangeRequest = false;
    }
  }

  openChangeRequestRejectModal() {
    this.changeRequestRejectReason = '';
    this.showChangeRequestRejectModal = true;
  }

  closeChangeRequestRejectModal() {
    this.showChangeRequestRejectModal = false;
    this.changeRequestRejectReason = '';
  }

  async confirmRejectChangeRequest() {
    if (!this.pendingChangeRequest || !this.booking) return;

    try {
      this.processingChangeRequest = true;
      const currentUser = this.supabase.session?.user;

      if (!currentUser) {
        alert('You must be logged in to reject requests');
        return;
      }

      const success = await this.changeRequestService.rejectRequest(
        this.pendingChangeRequest.id,
        currentUser.id,
        this.changeRequestRejectReason || undefined
      );

      if (success) {
        // Send email notification
        await this.sendChangeRequestStatusEmail('rejected', this.changeRequestRejectReason);
        alert('Change request rejected. The customer has been notified.');
        this.closeChangeRequestRejectModal();
        await this.loadBookingDetails(this.booking.id);
      } else {
        alert('Failed to reject change request. Please try again.');
      }
    } catch (err) {
      console.error('Error rejecting change request:', err);
      alert('An error occurred while rejecting the request.');
    } finally {
      this.processingChangeRequest = false;
    }
  }

  private async sendChangeRequestStatusEmail(type: 'approved' | 'rejected', adminResponse?: string) {
    if (!this.pendingChangeRequest || !this.booking) return;

    try {
      // Fetch client info
      const { data: client } = await this.supabase.client
        .from('users')
        .select('first_name, last_name, email')
        .eq('id', this.pendingChangeRequest.client_id)
        .single();

      // Fetch pets
      const { data: bookingPets } = await this.supabase.client
        .from('booking_pets')
        .select('pets(name)')
        .eq('booking_id', this.booking.id);

      const emailData = {
        type,
        booking: {
          id: this.booking.id,
          original_date: this.pendingChangeRequest.original_date,
          original_time_start: this.pendingChangeRequest.original_time_start,
          original_time_end: this.pendingChangeRequest.original_time_end,
          new_date: this.pendingChangeRequest.requested_date,
          new_time_start: this.pendingChangeRequest.requested_time_start,
          new_time_end: this.pendingChangeRequest.requested_time_end,
          address: this.booking.address || '',
          city: this.booking.city || '',
          state: this.booking.state || '',
          service_name: 'Grooming Service',
        },
        client: {
          first_name: client?.first_name || '',
          last_name: client?.last_name || '',
          email: client?.email || '',
        },
        groomer: {
          first_name: this.booking.groomer?.first_name || '',
          last_name: this.booking.groomer?.last_name || '',
          email: this.booking.groomer?.email || '',
        },
        pets: bookingPets?.map((bp: any) => ({ name: bp.pets?.name })) || [],
        admin_response: adminResponse,
      };

      await this.http.post(`${environment.apiUrl}/send-change-request-emails`, emailData).toPromise();
    } catch (err) {
      console.error('Error sending change request status email:', err);
    }
  }

  formatTimeShort(timeStr: string): string {
    if (!timeStr) return '';
    const [hours, minutes] = timeStr.split(':');
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const hour12 = hour % 12 || 12;
    return `${hour12}:${minutes} ${ampm}`;
  }

  // Payment Management Methods
  openCaptureModal() {
    if (!this.booking) return;
    this.captureAmount = this.booking.total_amount || 0;
    this.captureTipAmount = 0;
    this.showCaptureModal = true;
    this.paymentError = null;
    this.paymentSuccess = null;
  }

  closeCaptureModal() {
    this.showCaptureModal = false;
    this.captureTipAmount = 0;
  }

  async capturePayment() {
    if (!this.booking) return;

    this.isCapturingPayment = true;
    this.paymentError = null;
    this.paymentSuccess = null;

    try {
      const token = this.supabase.session?.access_token;
      const headers: any = {};
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const response: any = await this.http.post(
        `${environment.apiUrl}/api/groomer/bookings/${this.booking.id}/capture-payment`,
        {
          finalAmount: this.captureAmount,
          tipAmount: this.captureTipAmount || 0
        },
        { headers }
      ).toPromise();

      const totalCaptured = response.amount_captured || (this.captureAmount + (this.captureTipAmount || 0));
      this.paymentSuccess = `Payment captured successfully! Total: $${totalCaptured.toFixed(2)}${this.captureTipAmount > 0 ? ' (includes $' + this.captureTipAmount.toFixed(2) + ' tip)' : ''}`;

      this.showCaptureModal = false;
      this.captureTipAmount = 0;

      // Reload booking to get updated status
      await this.loadBookingDetails(this.booking.id);

      // Load earnings breakdown
      await this.loadEarningsBreakdown();
    } catch (err: any) {
      console.error('Error capturing payment:', err);
      this.paymentError = err.error?.error || 'Failed to capture payment';
    } finally {
      this.isCapturingPayment = false;
    }
  }

  openTipModal() {
    this.tipAmount = 0;
    this.showTipModal = true;
    this.paymentError = null;
    this.paymentSuccess = null;
  }

  closeTipModal() {
    this.showTipModal = false;
    this.tipAmount = 0;
  }

  async processTip() {
    if (!this.booking || this.tipAmount <= 0) {
      this.paymentError = 'Please enter a valid tip amount';
      return;
    }

    if (!confirm(`Are you sure you want to charge a $${this.tipAmount.toFixed(2)} tip to the client's card?`)) {
      return;
    }

    this.isProcessingTip = true;
    this.paymentError = null;
    this.paymentSuccess = null;

    try {
      const token = this.supabase.session?.access_token;
      const headers: any = {};
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const response: any = await this.http.post(
        `${environment.apiUrl}/api/groomer/bookings/${this.booking.id}/charge-tip`,
        { tipAmount: this.tipAmount },
        { headers }
      ).toPromise();

      this.paymentSuccess = `Tip of $${this.tipAmount.toFixed(2)} charged successfully!`;
      this.showTipModal = false;
      this.tipAmount = 0;

      // Reload booking to get updated tip info
      await this.loadBookingDetails(this.booking.id);

      // Reload earnings breakdown
      await this.loadEarningsBreakdown();
    } catch (err: any) {
      console.error('Error processing tip:', err);
      this.paymentError = err.error?.error || 'Failed to process tip';
    } finally {
      this.isProcessingTip = false;
    }
  }

  async loadEarningsBreakdown() {
    if (!this.booking?.id) return;

    try {
      const { data, error } = await this.supabase
        .from('groomer_earnings')
        .select('*')
        .eq('booking_id', this.booking.id)
        .single();

      if (error) {
        console.log('No earnings record found (may not be captured yet)');
        this.earningsBreakdown = null;
        return;
      }

      this.earningsBreakdown = data;
    } catch (err) {
      console.error('Error loading earnings breakdown:', err);
      this.earningsBreakdown = null;
    }
  }
}
