import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import {
  ClientService,
  ClientWithStats,
} from '../../../core/services/client.service';

@Component({
  selector: 'app-warm-leads-list',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './warm-leads-list.component.html',
  styleUrls: ['./warm-leads-list.component.scss'],
})
export class WarmLeadsListComponent implements OnInit {
  warmLeads: ClientWithStats[] = [];
  filteredLeads: ClientWithStats[] = [];
  isLoading = true;
  searchTerm = '';
  failedAvatars = new Set<string>();
  expandedCards: Set<string> = new Set();

  constructor(private clientService: ClientService, private router: Router) {}

  ngOnInit() {
    this.loadWarmLeads();
  }

  // Users to hide from warm leads (test/admin accounts)
  private hiddenUsers = [
    'eren codes',
    'hamza zulquernain',
    'babar zulquernain',
  ];

  loadWarmLeads() {
    this.clientService.getAllClients(this.searchTerm).subscribe({
      next: (clients) => {
        // Filter to only show warm leads (users with no completed bookings)
        // Exclude hidden test/admin accounts
        // Sort by progress descending (most complete at top)
        this.warmLeads = clients
          .filter((c) => c.is_warm_lead)
          .filter((c) => {
            const fullName = `${c.first_name} ${c.last_name}`.toLowerCase();
            return !this.hiddenUsers.some(hidden => hidden.toLowerCase() === fullName);
          })
          .sort((a, b) => this.getCompletionCount(b) - this.getCompletionCount(a));
        this.filteredLeads = [...this.warmLeads];
        this.isLoading = false;
        this.failedAvatars.clear();
      },
      error: (err) => {
        console.error(err);
        this.isLoading = false;
      },
    });
  }

  onAvatarError(leadId: string) {
    this.failedAvatars.add(leadId);
  }

  hasAvatarFailed(leadId: string): boolean {
    return this.failedAvatars.has(leadId);
  }

  onSearch(event: Event) {
    this.searchTerm = (event.target as HTMLInputElement).value;
    this.isLoading = true;
    this.loadWarmLeads();
  }

  formatDate(date: string): string {
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }

  getInitials(firstName: string, lastName: string): string {
    return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();
  }

  getPetNames(pets: { id: string; name: string }[] | undefined): string {
    if (!pets || pets.length === 0) return '';
    return pets.map((p) => p.name).join(', ');
  }

  toggleCard(leadId: string, event: Event): void {
    event.stopPropagation();
    if (this.expandedCards.has(leadId)) {
      this.expandedCards.delete(leadId);
    } else {
      this.expandedCards.add(leadId);
    }
  }

  isCardExpanded(leadId: string): boolean {
    return this.expandedCards.has(leadId);
  }

  viewLeadDetail(leadId: string): void {
    // Navigate to client detail page (warm leads use same detail page as clients)
    this.router.navigate(['/clients', leadId]);
  }

  getCompletionCount(lead: ClientWithStats): number {
    const status = lead.completion_status;
    return [
      status.profile_complete,
      status.has_pet,
      status.has_address,
      status.has_payment_method,
      status.has_started_booking,
    ].filter(Boolean).length;
  }

  callLead(lead: ClientWithStats, event: Event): void {
    event.stopPropagation();
    if (lead.phone) {
      window.location.href = `tel:${lead.phone}`;
    }
  }

  smsLead(lead: ClientWithStats, event: Event): void {
    event.stopPropagation();
    if (lead.phone) {
      window.location.href = `sms:${lead.phone}`;
    }
  }
}
