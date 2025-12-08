import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ChangeRequestService, ChangeRequest } from '../../../core/services/change-request.service';
import { SupabaseService } from '../../../core/services/supabase.service';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../../environments/environment';

@Component({
  selector: 'app-change-requests-list',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './change-requests-list.component.html',
  styleUrls: ['./change-requests-list.component.scss']
})
export class ChangeRequestsListComponent implements OnInit {
  private changeRequestService = inject(ChangeRequestService);
  private supabase = inject(SupabaseService);
  private http = inject(HttpClient);
  private router = inject(Router);

  requests: ChangeRequest[] = [];
  filteredRequests: ChangeRequest[] = [];
  isLoading = true;
  error: string | null = null;

  selectedStatus: 'all' | 'pending' | 'approved' | 'rejected' = 'pending';
  searchTerm = '';

  // Modal state
  showRejectModal = false;
  rejectReason = '';
  selectedRequest: ChangeRequest | null = null;
  isProcessing = false;

  ngOnInit() {
    this.loadRequests();
  }

  async loadRequests() {
    try {
      this.isLoading = true;
      this.error = null;

      const status = this.selectedStatus === 'all' ? undefined : this.selectedStatus;
      this.requests = await this.changeRequestService.getChangeRequests(status);
      this.applyFilters();
    } catch (err) {
      console.error('Error loading change requests:', err);
      this.error = 'Failed to load change requests';
    } finally {
      this.isLoading = false;
    }
  }

  applyFilters() {
    let filtered = [...this.requests];

    if (this.searchTerm) {
      const term = this.searchTerm.toLowerCase();
      filtered = filtered.filter(r =>
        r.client?.first_name?.toLowerCase().includes(term) ||
        r.client?.last_name?.toLowerCase().includes(term) ||
        r.client?.email?.toLowerCase().includes(term) ||
        r.pets?.some(p => p.name.toLowerCase().includes(term))
      );
    }

    this.filteredRequests = filtered;
  }

  onStatusFilterChange(event: Event) {
    this.selectedStatus = (event.target as HTMLSelectElement).value as any;
    this.loadRequests();
  }

  onSearchChange(event: Event) {
    this.searchTerm = (event.target as HTMLInputElement).value;
    this.applyFilters();
  }

  async approveRequest(request: ChangeRequest) {
    if (!confirm('Are you sure you want to approve this change request? The booking will be updated to the new date/time.')) {
      return;
    }

    try {
      this.isProcessing = true;
      const currentUser = this.supabase.session?.user;

      if (!currentUser) {
        alert('You must be logged in to approve requests');
        return;
      }

      const success = await this.changeRequestService.approveRequest(request.id, currentUser.id);

      if (success) {
        // Send email notification
        await this.sendStatusEmail(request, 'approved');

        alert('Request approved successfully! The booking has been updated.');
        this.loadRequests();
      } else {
        alert('Failed to approve request. Please try again.');
      }
    } catch (err) {
      console.error('Error approving request:', err);
      alert('An error occurred while approving the request.');
    } finally {
      this.isProcessing = false;
    }
  }

  openRejectModal(request: ChangeRequest) {
    this.selectedRequest = request;
    this.rejectReason = '';
    this.showRejectModal = true;
  }

  closeRejectModal() {
    this.showRejectModal = false;
    this.selectedRequest = null;
    this.rejectReason = '';
  }

  async confirmReject() {
    if (!this.selectedRequest) return;

    try {
      this.isProcessing = true;
      const currentUser = this.supabase.session?.user;

      if (!currentUser) {
        alert('You must be logged in to reject requests');
        return;
      }

      const success = await this.changeRequestService.rejectRequest(
        this.selectedRequest.id,
        currentUser.id,
        this.rejectReason || undefined
      );

      if (success) {
        // Send email notification
        await this.sendStatusEmail(this.selectedRequest, 'rejected', this.rejectReason);

        alert('Request rejected successfully.');
        this.closeRejectModal();
        this.loadRequests();
      } else {
        alert('Failed to reject request. Please try again.');
      }
    } catch (err) {
      console.error('Error rejecting request:', err);
      alert('An error occurred while rejecting the request.');
    } finally {
      this.isProcessing = false;
    }
  }

  private async sendStatusEmail(request: ChangeRequest, type: 'approved' | 'rejected', adminResponse?: string) {
    try {
      // Fetch full booking details
      const { data: booking } = await this.supabase.client
        .from('bookings')
        .select('*, groomer:users!bookings_groomer_id_fkey(id, first_name, last_name, email)')
        .eq('id', request.booking_id)
        .single();

      if (!booking) {
        console.error('Booking not found for email');
        return;
      }

      const emailData = {
        type,
        booking: {
          id: booking.id,
          original_date: request.original_date,
          original_time_start: request.original_time_start,
          original_time_end: request.original_time_end,
          new_date: request.requested_date,
          new_time_start: request.requested_time_start,
          new_time_end: request.requested_time_end,
          address: booking.address || '',
          city: booking.city || '',
          state: booking.state || '',
          service_name: 'Grooming Service',
        },
        client: {
          first_name: request.client?.first_name || '',
          last_name: request.client?.last_name || '',
          email: request.client?.email || '',
        },
        groomer: {
          first_name: booking.groomer?.first_name || '',
          last_name: booking.groomer?.last_name || '',
          email: booking.groomer?.email || '',
        },
        pets: request.pets || [],
        admin_response: adminResponse,
      };

      await this.http.post(`${environment.apiUrl}/send-change-request-emails`, emailData).toPromise();
    } catch (err) {
      console.error('Error sending status email:', err);
    }
  }

  viewBooking(bookingId: string) {
    this.router.navigate(['/bookings/details', bookingId]);
  }

  formatDate(dateStr: string): string {
    const date = new Date(dateStr + 'T00:00:00Z');
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      timeZone: 'UTC'
    });
  }

  formatTime(timeStr: string): string {
    const [hours, minutes] = timeStr.split(':');
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const hour12 = hour % 12 || 12;
    return `${hour12}:${minutes} ${ampm}`;
  }

  formatDateTime(dateStr: string): string {
    return new Date(dateStr).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  }

  getStatusClass(status: string): string {
    const classes: Record<string, string> = {
      'pending': 'status-pending',
      'approved': 'status-approved',
      'rejected': 'status-rejected'
    };
    return classes[status] || '';
  }

  getStatusLabel(status: string): string {
    const labels: Record<string, string> = {
      'pending': 'Pending Review',
      'approved': 'Approved',
      'rejected': 'Rejected'
    };
    return labels[status] || status;
  }
}
