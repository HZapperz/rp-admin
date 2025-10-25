import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ClientService, ClientWithStats } from '../../../core/services/client.service';

@Component({
  selector: 'app-clients-list',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="page">
      <h1>👥 Clients Management</h1>

      <div class="search-box">
        <input type="text" placeholder="Search clients..." (input)="onSearch($event)" />
      </div>

      @if (isLoading) {
        <div class="loading">Loading clients...</div>
      }

      @if (!isLoading) {
        <div class="table-container">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Phone</th>
                <th>Total Bookings</th>
                <th>Total Spent</th>
                <th>Last Booking</th>
              </tr>
            </thead>
            <tbody>
              @for (client of clients; track client.id) {
                <tr>
                  <td>{{ client.first_name }} {{ client.last_name }}</td>
                  <td>{{ client.email }}</td>
                  <td>{{ client.phone || 'N/A' }}</td>
                  <td>{{ client.total_bookings }}</td>
                  <td>\${{ client.total_spent.toFixed(2) }}</td>
                  <td>{{ client.last_booking_date ? formatDate(client.last_booking_date) : 'Never' }}</td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }
    </div>
  `,
  styles: [`
    .page { max-width: 1400px; margin: 0 auto; padding: 2rem; }
    h1 { font-size: 2rem; margin-bottom: 2rem; }
    .search-box { margin-bottom: 2rem; }
    .search-box input { padding: 0.75rem; width: 100%; max-width: 400px; border: 2px solid #e2e8f0; border-radius: 8px; font-size: 1rem; }
    .loading { text-align: center; padding: 4rem; color: #64748b; }
    .table-container { background: white; border-radius: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); overflow: hidden; }
    table { width: 100%; border-collapse: collapse; }
    thead { background: #f8fafc; }
    th { padding: 1rem; text-align: left; font-weight: 600; color: #475569; border-bottom: 2px solid #e2e8f0; }
    td { padding: 1rem; border-bottom: 1px solid #e2e8f0; }
    tr:hover { background: #f8fafc; }
  `]
})
export class ClientsListComponent implements OnInit {
  clients: ClientWithStats[] = [];
  isLoading = true;
  searchTerm = '';

  constructor(private clientService: ClientService) {}

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
    return new Date(date).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  }
}
