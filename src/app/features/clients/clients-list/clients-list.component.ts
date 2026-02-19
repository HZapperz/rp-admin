import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import {
  ClientService,
  ClientWithEngagement,
  ClientSegment,
  ClientRelationsStats,
  ClientNudge,
  CLIENT_SEGMENT_CONFIGS,
  ClientSegmentConfig,
} from '../../../core/services/client.service';
import { CreateClientModalComponent } from '../../../shared/components/create-client-modal/create-client-modal.component';

@Component({
  selector: 'app-clients-list',
  standalone: true,
  imports: [CommonModule, CreateClientModalComponent],
  templateUrl: './clients-list.component.html',
  styleUrls: ['./clients-list.component.scss'],
})
export class ClientsListComponent implements OnInit {
  clients: ClientWithEngagement[] = [];
  filteredClients: ClientWithEngagement[] = [];
  isLoading = true;
  searchTerm = '';
  failedAvatars = new Set<string>();
  expandedCards: Set<string> = new Set();
  showCreateClientModal = false;

  // Client Relations UI state
  selectedSegment: ClientSegment = 'all';
  stats: ClientRelationsStats | null = null;
  nudges: ClientNudge[] = [];
  dismissedNudges = new Set<string>();

  // Selection mode for bulk actions
  selectionMode = false;
  selectedClients = new Set<string>();

  // Sorting
  sortColumn: 'engagement_score' | 'total_spent' | 'days_since_last_booking' | 'name' = 'engagement_score';
  sortDirection: 'asc' | 'desc' = 'desc';

  // Segment configurations
  segmentConfigs = CLIENT_SEGMENT_CONFIGS;
  segmentList: ClientSegment[] = ['all', 'vip', 'at_risk', 'upcoming', 'new'];

  constructor(public clientService: ClientService, private router: Router) {}

  ngOnInit() {
    this.loadData();
  }

  loadData() {
    this.isLoading = true;

    // Load clients with engagement and stats in parallel
    Promise.all([
      this.clientService.getClientsWithEngagement(this.searchTerm, this.selectedSegment).toPromise(),
      this.clientService.getClientRelationsStats()
    ]).then(([clients, stats]) => {
      this.clients = clients || [];
      this.filteredClients = [...this.clients];
      this.stats = stats;
      this.nudges = stats?.nudges || [];
      this.isLoading = false;
      this.failedAvatars.clear();

      // Apply current sort
      this.applySort();
    }).catch(err => {
      console.error('Error loading client relations data:', err);
      this.isLoading = false;
    });
  }

  // Segment handling
  selectSegment(segment: ClientSegment) {
    this.selectedSegment = segment;
    this.isLoading = true;

    this.clientService.getClientsWithEngagement(this.searchTerm, segment).subscribe({
      next: (clients) => {
        this.clients = clients;
        this.filteredClients = [...clients];
        this.isLoading = false;
        this.applySort();
      },
      error: (err) => {
        console.error('Error loading clients:', err);
        this.isLoading = false;
      }
    });
  }

  get currentSegmentConfig(): ClientSegmentConfig {
    return this.segmentConfigs[this.selectedSegment];
  }

  getSegmentCount(segment: ClientSegment): number {
    if (!this.stats) return 0;
    switch (segment) {
      case 'vip': return this.stats.vip_count;
      case 'at_risk': return this.stats.at_risk_count;
      case 'upcoming': return this.stats.upcoming_count;
      case 'new': return this.stats.new_count;
      default: return this.stats.total;
    }
  }

  get visibleNudges(): ClientNudge[] {
    return this.nudges.filter(n => !this.dismissedNudges.has(n.message));
  }

  dismissNudge(nudge: ClientNudge) {
    this.dismissedNudges.add(nudge.message);
  }

  // Search handling
  onSearch(event: Event) {
    this.searchTerm = (event.target as HTMLInputElement).value;
    this.loadData();
  }

  clearSearch() {
    this.searchTerm = '';
    this.loadData();
  }

  // Sorting
  onSort(column: typeof this.sortColumn) {
    if (this.sortColumn === column) {
      this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      this.sortColumn = column;
      this.sortDirection = column === 'name' ? 'asc' : 'desc';
    }
    this.applySort();
  }

  private applySort() {
    this.filteredClients.sort((a, b) => {
      // Primary sort: uncontacted clients first (contacted go to bottom)
      const aContacted = this.wasRecentlyContacted(a) ? 1 : 0;
      const bContacted = this.wasRecentlyContacted(b) ? 1 : 0;
      if (aContacted !== bContacted) {
        return aContacted - bContacted;
      }

      // Secondary sort: by selected column
      let comparison = 0;
      switch (this.sortColumn) {
        case 'engagement_score':
          comparison = a.engagement_score - b.engagement_score;
          break;
        case 'total_spent':
          comparison = a.total_spent - b.total_spent;
          break;
        case 'days_since_last_booking':
          comparison = a.days_since_last_booking - b.days_since_last_booking;
          break;
        case 'name':
          comparison = `${a.first_name} ${a.last_name}`.localeCompare(`${b.first_name} ${b.last_name}`);
          break;
      }
      return this.sortDirection === 'asc' ? comparison : -comparison;
    });
  }

  // Selection mode
  toggleSelectionMode() {
    this.selectionMode = !this.selectionMode;
    if (!this.selectionMode) {
      this.selectedClients.clear();
    }
  }

  toggleClientSelection(clientId: string) {
    if (this.selectedClients.has(clientId)) {
      this.selectedClients.delete(clientId);
    } else {
      this.selectedClients.add(clientId);
    }
  }

  toggleSelectAll() {
    const allSelected = this.filteredClients.every(c => this.selectedClients.has(c.id));
    if (allSelected) {
      this.selectedClients.clear();
    } else {
      this.filteredClients.forEach(c => this.selectedClients.add(c.id));
    }
  }

  get allCurrentSelected(): boolean {
    return this.filteredClients.length > 0 && this.filteredClients.every(c => this.selectedClients.has(c.id));
  }

  // Client actions
  callClient(client: ClientWithEngagement, event: Event): void {
    event.stopPropagation();
    if (client.phone) {
      window.location.href = `tel:${client.phone}`;
    }
  }

  smsClient(client: ClientWithEngagement, event: Event): void {
    event.stopPropagation();
    if (client.phone) {
      window.location.href = `sms:${client.phone}`;
    }
  }

  iMessageClient(client: ClientWithEngagement, event: Event): void {
    event.stopPropagation();
    const url = this.clientService.getIMessageUrl(client);
    if (url !== '#') {
      window.open(url, '_blank');
    }
  }

  async markOutreachDone(client: ClientWithEngagement, event: Event): Promise<void> {
    event.stopPropagation();
    await this.clientService.logClientActivity(client.id, 'note', 'Marked outreach complete');
    // Refresh data
    this.loadData();
  }

  viewClientDetail(clientId: string): void {
    this.router.navigate(['/clients', clientId]);
  }

  // Avatar handling
  onAvatarError(clientId: string) {
    this.failedAvatars.add(clientId);
  }

  hasAvatarFailed(clientId: string): boolean {
    return this.failedAvatars.has(clientId);
  }

  // Formatting helpers
  formatDate(date: string): string {
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }

  formatCurrency(amount: number): string {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  }

  getInitials(firstName: string, lastName: string): string {
    return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();
  }

  getPetNames(pets: { id: string; name: string }[] | undefined): string {
    if (!pets || pets.length === 0) return '';
    return pets.map((p) => p.name).join(', ');
  }

  // Engagement badge styling
  getEngagementColor(score: number): string {
    if (score >= 70) return '#16a34a';
    if (score >= 40) return '#ca8a04';
    return '#dc2626';
  }

  getEngagementBg(score: number): string {
    if (score >= 70) return '#dcfce7';
    if (score >= 40) return '#fef9c3';
    return '#fee2e2';
  }

  // Segment badge styling
  getSegmentColor(segment: ClientSegment): string {
    return this.segmentConfigs[segment].color;
  }

  getSegmentBg(segment: ClientSegment): string {
    return this.segmentConfigs[segment].bgColor;
  }

  // Suggested action styling
  getSuggestedActionPriorityClass(priority: string | undefined): string {
    if (!priority) return '';
    return `priority-${priority}`;
  }

  // Outreach status
  wasRecentlyContacted(client: ClientWithEngagement): boolean {
    if (!client.last_outreach_date) return false;
    const daysSince = Math.floor((Date.now() - new Date(client.last_outreach_date).getTime()) / (1000 * 60 * 60 * 24));
    return daysSince <= 7;
  }

  getOutreachDaysAgo(client: ClientWithEngagement): number | null {
    if (!client.last_outreach_date) return null;
    return Math.floor((Date.now() - new Date(client.last_outreach_date).getTime()) / (1000 * 60 * 60 * 24));
  }

  // Card expansion
  toggleCard(clientId: string, event: Event): void {
    event.stopPropagation();
    if (this.expandedCards.has(clientId)) {
      this.expandedCards.delete(clientId);
    } else {
      this.expandedCards.add(clientId);
    }
  }

  isCardExpanded(clientId: string): boolean {
    return this.expandedCards.has(clientId);
  }

  // Create Client Modal
  openCreateClientModal(): void {
    this.showCreateClientModal = true;
  }

  closeCreateClientModal(): void {
    this.showCreateClientModal = false;
  }

  onClientCreated(clientId: string): void {
    this.showCreateClientModal = false;
    this.router.navigate(['/clients', clientId]);
  }
}
