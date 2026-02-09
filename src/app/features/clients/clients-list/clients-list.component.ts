import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import {
  ClientService,
  ClientWithStats,
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
  clients: ClientWithStats[] = [];
  isLoading = true;
  searchTerm = '';
  failedAvatars = new Set<string>();
  expandedCards: Set<string> = new Set();
  showCreateClientModal = false;
  viewMode: 'table' | 'cards' = 'table'; // Default to table view

  constructor(private clientService: ClientService, private router: Router) {}

  ngOnInit() {
    this.loadClients();
  }

  loadClients() {
    this.clientService.getAllClients(this.searchTerm).subscribe({
      next: (allClients) => {
        // Filter to only show actual clients (users with completed bookings)
        this.clients = allClients.filter((c) => !c.is_warm_lead);
        this.isLoading = false;
        this.failedAvatars.clear();
      },
      error: (err) => {
        console.error(err);
        this.isLoading = false;
      },
    });
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

  onAvatarError(clientId: string) {
    this.failedAvatars.add(clientId);
  }

  hasAvatarFailed(clientId: string): boolean {
    return this.failedAvatars.has(clientId);
  }

  onSearch(event: Event) {
    this.searchTerm = (event.target as HTMLInputElement).value;
    this.isLoading = true;
    this.loadClients();
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

  viewClientDetail(clientId: string): void {
    this.router.navigate(['/clients', clientId]);
  }

  // Create Client Modal methods
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

  // View toggle methods
  setViewMode(mode: 'table' | 'cards'): void {
    this.viewMode = mode;
  }
}
