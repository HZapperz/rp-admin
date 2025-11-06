import { Component, EventEmitter, OnInit, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { ClientService, ClientWithStats } from '../../../../../core/services/client.service';
import { debounceTime, Subject } from 'rxjs';

@Component({
  selector: 'app-select-client',
  standalone: true,
  imports: [CommonModule, FormsModule, MatIconModule],
  templateUrl: './select-client.component.html',
  styleUrls: ['./select-client.component.scss']
})
export class SelectClientComponent implements OnInit {
  @Output() clientSelected = new EventEmitter<ClientWithStats>();

  clients: ClientWithStats[] = [];
  filteredClients: ClientWithStats[] = [];
  searchTerm: string = '';
  selectedClient: ClientWithStats | null = null;
  isLoading = false;
  error: string | null = null;

  private searchSubject = new Subject<string>();

  constructor(private clientService: ClientService) {}

  ngOnInit(): void {
    this.loadClients();

    // Debounce search input
    this.searchSubject.pipe(debounceTime(300)).subscribe(searchTerm => {
      this.performSearch(searchTerm);
    });
  }

  async loadClients(): Promise<void> {
    try {
      this.isLoading = true;
      this.error = null;

      this.clientService.getAllClients().subscribe({
        next: (clients) => {
          this.clients = clients;
          this.filteredClients = clients;
          this.isLoading = false;
        },
        error: (err) => {
          console.error('Error loading clients:', err);
          this.error = 'Failed to load clients';
          this.isLoading = false;
        }
      });
    } catch (err) {
      console.error('Error loading clients:', err);
      this.error = 'Failed to load clients';
      this.isLoading = false;
    }
  }

  onSearchChange(event: Event): void {
    const target = event.target as HTMLInputElement;
    this.searchTerm = target.value;
    this.searchSubject.next(this.searchTerm);
  }

  private performSearch(searchTerm: string): void {
    if (!searchTerm.trim()) {
      this.filteredClients = this.clients;
      return;
    }

    const term = searchTerm.toLowerCase();
    this.filteredClients = this.clients.filter(client =>
      client.first_name.toLowerCase().includes(term) ||
      client.last_name.toLowerCase().includes(term) ||
      client.email.toLowerCase().includes(term) ||
      (client.phone && client.phone.includes(term))
    );
  }

  selectClient(client: ClientWithStats): void {
    this.selectedClient = client;
    this.clientSelected.emit(client);
  }

  formatCurrency(amount: number): string {
    return `$${amount.toFixed(2)}`;
  }

  formatDate(dateString: string | undefined): string {
    if (!dateString) return 'Never';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  }

  getInitials(client: ClientWithStats): string {
    return `${client.first_name.charAt(0)}${client.last_name.charAt(0)}`.toUpperCase();
  }
}
