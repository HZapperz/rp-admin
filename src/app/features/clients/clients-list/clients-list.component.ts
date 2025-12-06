import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import {
  ClientService,
  ClientWithStats,
} from '../../../core/services/client.service';

@Component({
  selector: 'app-clients-list',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './clients-list.component.html',
  styleUrls: ['./clients-list.component.scss'],
})
export class ClientsListComponent implements OnInit {
  clients: ClientWithStats[] = [];
  isLoading = true;
  searchTerm = '';
  failedAvatars = new Set<string>();
  expandedCards: Set<string> = new Set();

  constructor(private clientService: ClientService, private router: Router) {}

  ngOnInit() {
    this.loadClients();
  }

  loadClients() {
    this.clientService.getAllClients(this.searchTerm).subscribe({
      next: (clients) => {
        this.clients = clients;
        this.isLoading = false;
        // Reset failed avatars when loading new clients
        this.failedAvatars.clear();
      },
      error: (err) => {
        console.error(err);
        this.isLoading = false;
      },
    });
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
}
