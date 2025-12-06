import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { ClientService, ClientWithStats } from '../../../core/services/client.service';

@Component({
  selector: 'app-clients-list',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './clients-list.component.html',
  styleUrl: './clients-list.component.scss'
})
export class ClientsListComponent implements OnInit {
  clients: ClientWithStats[] = [];
  isLoading = true;
  searchTerm = '';

  constructor(
    private clientService: ClientService,
    private router: Router
  ) {}

  ngOnInit() {
    this.loadClients();
  }

  loadClients() {
    this.clientService.getAllClients(this.searchTerm).subscribe({
      next: (clients) => {
        this.clients = clients;
        this.isLoading = false;
      },
      error: (err) => {
        console.error(err);
        this.isLoading = false;
      }
    });
  }

  onSearch(event: Event) {
    this.searchTerm = (event.target as HTMLInputElement).value;
    this.isLoading = true;
    this.loadClients();
  }

  formatDate(date: string): string {
    // Parse ISO date string as UTC to avoid timezone conversion issues
    const d = new Date(date + 'T00:00:00Z');
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' });
  }

  viewClientDetail(clientId: string): void {
    this.router.navigate(['/clients', clientId]);
  }
}
