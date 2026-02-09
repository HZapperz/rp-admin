import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import {
  ClientService,
  ClientWithStats,
} from '../../../core/services/client.service';

@Component({
  selector: 'app-outreach-list',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './outreach-list.component.html',
  styleUrls: ['./outreach-list.component.scss'],
})
export class OutreachListComponent implements OnInit {
  clients: ClientWithStats[] = [];
  allClients: ClientWithStats[] = [];
  isLoading = true;
  searchTerm = '';

  // Filter states
  segmentFilter: 'all' | 'ACTIVE_CLIENT' | 'WARM_LEAD' = 'all';
  smsFilter: 'all' | 'sms-yes' | 'hide-no-sms' = 'all';
  priorityFilter: 'all' | 'high' | 'medium' | 'low' = 'all';
  sortBy: 'priority' | 'last-booking-asc' | 'last-booking-desc' = 'priority';

  constructor(private clientService: ClientService, private router: Router) {}

  ngOnInit() {
    this.loadClients();
  }

  loadClients() {
    this.clientService.getAllClients(this.searchTerm).subscribe({
      next: (allClients) => {
        this.allClients = allClients;
        this.applyFilters();
        this.isLoading = false;
      },
      error: (err) => {
        console.error(err);
        this.isLoading = false;
      },
    });
  }

  applyFilters() {
    let filtered = [...this.allClients];
    console.log('Starting with clients:', filtered.length);

    // Segment filter
    if (this.segmentFilter !== 'all') {
      filtered = filtered.filter((c) => {
        const segment = this.getSegment(c);
        return segment === this.segmentFilter;
      });
      console.log(`After segment filter (${this.segmentFilter}):`, filtered.length);
    }

    // SMS filter
    if (this.smsFilter !== 'all') {
      const before = filtered.length;
      filtered = filtered.filter((c) => {
        if (this.smsFilter === 'sms-yes') {
          return c.sms_enabled === true;
        }
        if (this.smsFilter === 'hide-no-sms') {
          return c.sms_enabled !== false;
        }
        return true;
      });
      console.log(`SMS filter (${this.smsFilter}): ${before} → ${filtered.length}`);
      console.log('Sample client sms_enabled values:', this.allClients.slice(0, 3).map(c => ({
        name: `${c.first_name} ${c.last_name}`,
        sms_enabled: c.sms_enabled
      })));
    }

    // Priority filter
    if (this.priorityFilter !== 'all') {
      filtered = filtered.filter((c) => {
        const priorityClass = this.getPriorityClass(c);
        return priorityClass === `priority-${this.priorityFilter}`;
      });
      console.log(`After priority filter (${this.priorityFilter}):`, filtered.length);
    }

    // Sort based on selected option
    if (this.sortBy === 'last-booking-asc') {
      filtered.sort((a, b) => {
        const aDate = a.last_booking_date ? new Date(a.last_booking_date).getTime() : 0;
        const bDate = b.last_booking_date ? new Date(b.last_booking_date).getTime() : 0;
        return aDate - bDate; // Oldest first
      });
    } else if (this.sortBy === 'last-booking-desc') {
      filtered.sort((a, b) => {
        const aDate = a.last_booking_date ? new Date(a.last_booking_date).getTime() : 0;
        const bDate = b.last_booking_date ? new Date(b.last_booking_date).getTime() : 0;
        return bDate - aDate; // Most recent first
      });
    } else {
      // Default: Uncontacted customers first, then by priority
      filtered.sort((a, b) => {
        // First, sort by outreach status (uncontacted first)
        const aContacted = a.last_outreach_date ? 1 : 0;
        const bContacted = b.last_outreach_date ? 1 : 0;
        if (aContacted !== bContacted) {
          return aContacted - bContacted;
        }

        // Then by priority
        const aPriority = this.getPriority(a);
        const bPriority = this.getPriority(b);
        return bPriority - aPriority;
      });
    }

    console.log('Final filtered count:', filtered.length);
    this.clients = filtered;
  }

  getSegment(client: ClientWithStats): string {
    if (client.total_bookings >= 1) return 'ACTIVE_CLIENT';
    if (client.is_warm_lead) return 'WARM_LEAD';
    return 'COLD_LEAD';
  }

  getPriority(client: ClientWithStats): number {
    let priority = 5;
    if (client.total_bookings > 0) priority += 2;
    if (client.sms_enabled) priority += 1;
    if (client.total_bookings >= 3) priority += 2;
    return priority;
  }

  getPriorityClass(client: ClientWithStats): string {
    const priority = this.getPriority(client);
    if (priority >= 10) return 'priority-high';
    if (priority >= 6) return 'priority-medium';
    return 'priority-low';
  }

  getSegmentBadgeClass(segment: string): string {
    if (segment === 'ACTIVE_CLIENT') return 'segment-active';
    if (segment === 'WARM_LEAD') return 'segment-warm';
    return 'segment-cold';
  }

  setSegmentFilter(filter: typeof this.segmentFilter) {
    this.segmentFilter = filter;
    this.applyFilters();
  }

  setSmsFilter(filter: typeof this.smsFilter) {
    console.log('SMS filter clicked:', filter);
    this.smsFilter = filter;
    this.applyFilters();
  }

  setPriorityFilter(filter: typeof this.priorityFilter) {
    this.priorityFilter = filter;
    this.applyFilters();
  }

  setSortBy(sort: typeof this.sortBy) {
    this.sortBy = sort;
    this.applyFilters();
  }

  onSearch(event: Event) {
    this.searchTerm = (event.target as HTMLInputElement).value;
    this.isLoading = true;
    this.loadClients();
  }

  viewClientDetail(clientId: string): void {
    this.router.navigate(['/clients', clientId]);
  }

  callClient(client: ClientWithStats, event: Event): void {
    event.stopPropagation();
    if (client.phone) {
      window.location.href = `tel:${client.phone}`;
    }
  }

  smsClient(client: ClientWithStats, event: Event): void {
    event.stopPropagation();
    if (client.phone) {
      window.location.href = `sms:${client.phone}`;
    }
  }

  getPetNames(pets: { id: string; name: string }[] | undefined): string {
    if (!pets || pets.length === 0) return 'No pets';
    return pets.map((p) => p.name).join(', ');
  }

  formatDate(date: string | undefined): string {
    if (!date) return 'N/A';
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }

  async markAsContacted(client: ClientWithStats, event: Event): Promise<void> {
    event.stopPropagation();

    const success = await this.clientService.markOutreachCompleted(client.id);
    if (success) {
      // Update the local client object
      client.last_outreach_date = new Date().toISOString();
      // Re-apply filters to re-sort the list
      this.applyFilters();
    } else {
      alert('Failed to mark customer as contacted. Please try again.');
    }
  }

  isContacted(client: ClientWithStats): boolean {
    return !!client.last_outreach_date;
  }
}
