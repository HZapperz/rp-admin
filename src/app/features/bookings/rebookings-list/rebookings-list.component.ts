import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RebookingService } from '../../../core/services/rebooking.service';
import { RebookingWithDetails, RebookingStatus } from '../../../core/models/types';

@Component({
  selector: 'app-rebookings-list',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './rebookings-list.component.html',
  styleUrls: ['./rebookings-list.component.scss']
})
export class RebookingsListComponent implements OnInit {
  rebookings: RebookingWithDetails[] = [];
  isLoading = true;
  error: string | null = null;

  selectedStatus: RebookingStatus | 'all' = 'pending';
  expandedId: string | null = null;
  adminNotes: Record<string, string> = {};
  updatingId: string | null = null;

  statusOptions: { value: RebookingStatus | 'all'; label: string }[] = [
    { value: 'all', label: 'All Status' },
    { value: 'pending', label: 'Pending' },
    { value: 'contacted', label: 'Contacted' },
    { value: 'booked', label: 'Booked' },
    { value: 'declined', label: 'Declined' },
    { value: 'no_answer', label: 'No Answer' }
  ];

  constructor(private rebookingService: RebookingService) {}

  ngOnInit() {
    this.loadRebookings();
  }

  loadRebookings() {
    this.isLoading = true;
    this.error = null;

    const filter = this.selectedStatus === 'all' ? undefined : this.selectedStatus;

    this.rebookingService.getAllRebookings(filter).subscribe({
      next: (rebookings) => {
        this.rebookings = rebookings;
        // Initialize admin notes from fetched data
        rebookings.forEach(r => {
          this.adminNotes[r.id] = r.admin_notes || '';
        });
        this.isLoading = false;
      },
      error: (err) => {
        console.error('Error loading rebookings:', err);
        this.error = 'Failed to load rebookings';
        this.isLoading = false;
      }
    });
  }

  onStatusFilterChange(event: Event) {
    this.selectedStatus = (event.target as HTMLSelectElement).value as RebookingStatus | 'all';
    this.loadRebookings();
  }

  toggleExpand(id: string, event: Event) {
    event.stopPropagation();
    this.expandedId = this.expandedId === id ? null : id;
  }

  isExpanded(id: string): boolean {
    return this.expandedId === id;
  }

  async updateStatus(id: string, newStatus: RebookingStatus, event: Event) {
    event.stopPropagation();
    this.updatingId = id;

    const success = await this.rebookingService.updateRebookingStatus(
      id,
      newStatus,
      this.adminNotes[id]
    );

    if (success) {
      this.loadRebookings();
      this.expandedId = null;
    } else {
      this.error = 'Failed to update status';
    }

    this.updatingId = null;
  }

  async saveNotes(id: string, event: Event) {
    event.stopPropagation();
    this.updatingId = id;

    const success = await this.rebookingService.saveAdminNotes(id, this.adminNotes[id]);

    if (!success) {
      this.error = 'Failed to save notes';
    }

    this.updatingId = null;
  }

  formatDate(dateStr: string | undefined): string {
    if (!dateStr) return '-';
    const date = new Date(dateStr + 'T00:00:00Z');
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      timeZone: 'UTC'
    });
  }

  formatPhone(phone: string | undefined): string {
    if (!phone) return '-';
    const cleaned = phone.replace(/\D/g, '');
    if (cleaned.length === 10) {
      return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6)}`;
    }
    return phone;
  }

  getStatusClass(status: RebookingStatus): string {
    const classes: Record<RebookingStatus, string> = {
      pending: 'status-pending',
      contacted: 'status-contacted',
      booked: 'status-booked',
      declined: 'status-declined',
      no_answer: 'status-no-answer'
    };
    return classes[status] || '';
  }

  getStatusLabel(status: RebookingStatus): string {
    const labels: Record<RebookingStatus, string> = {
      pending: 'Pending',
      contacted: 'Contacted',
      booked: 'Booked',
      declined: 'Declined',
      no_answer: 'No Answer'
    };
    return labels[status] || status;
  }

  getTypeLabel(type: 'schedule' | 'callback'): string {
    return type === 'schedule' ? 'Schedule' : 'Callback';
  }

  getPetNames(rebooking: RebookingWithDetails): string {
    return rebooking.pets?.map(p => p.name).join(', ') || '-';
  }

  getRelevantDate(rebooking: RebookingWithDetails): string {
    return rebooking.type === 'schedule'
      ? this.formatDate(rebooking.preferred_date)
      : this.formatDate(rebooking.callback_date);
  }

  callClient(phone: string | undefined, event: Event) {
    event.stopPropagation();
    if (phone) {
      window.location.href = `tel:${phone}`;
    }
  }

  emailClient(email: string | undefined, event: Event) {
    event.stopPropagation();
    if (email) {
      window.location.href = `mailto:${email}`;
    }
  }

  getStats(): { pending: number; contacted: number; booked: number; declined: number; no_answer: number } {
    return {
      pending: this.rebookings.filter(r => r.status === 'pending').length,
      contacted: this.rebookings.filter(r => r.status === 'contacted').length,
      booked: this.rebookings.filter(r => r.status === 'booked').length,
      declined: this.rebookings.filter(r => r.status === 'declined').length,
      no_answer: this.rebookings.filter(r => r.status === 'no_answer').length
    };
  }
}
