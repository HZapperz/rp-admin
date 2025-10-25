import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { GroomerService, GroomerWithStats } from '../../../core/services/groomer.service';

@Component({
  selector: 'app-groomers-list',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="page">
      <h1>✂️ Groomers Management</h1>

      <div class="search-box">
        <input type="text" placeholder="Search groomers..." (input)="onSearch($event)" />
      </div>

      @if (isLoading) {
        <div class="loading">Loading groomers...</div>
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
                <th>Completed</th>
                <th>Total Revenue</th>
                <th>Avg Rating</th>
                <th>Completion Rate</th>
              </tr>
            </thead>
            <tbody>
              @for (groomer of groomers; track groomer.id) {
                <tr>
                  <td>{{ groomer.first_name }} {{ groomer.last_name }}</td>
                  <td>{{ groomer.email }}</td>
                  <td>{{ groomer.phone || 'N/A' }}</td>
                  <td>{{ groomer.total_bookings }}</td>
                  <td>{{ groomer.completed_bookings }}</td>
                  <td>\${{ groomer.total_revenue.toFixed(2) }}</td>
                  <td>{{ groomer.average_rating.toFixed(1) }} ⭐</td>
                  <td>{{ groomer.completion_rate.toFixed(1) }}%</td>
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
    th { padding: 1rem; text-align: left; font-weight: 600; color: #475569; border-bottom: 2px solid #e2e8f0; font-size: 0.875rem; }
    td { padding: 1rem; border-bottom: 1px solid #e2e8f0; font-size: 0.9rem; }
    tr:hover { background: #f8fafc; }
  `]
})
export class GroomersListComponent implements OnInit {
  groomers: GroomerWithStats[] = [];
  isLoading = true;
  searchTerm = '';

  constructor(private groomerService: GroomerService) {}

  ngOnInit() {
    this.loadGroomers();
  }

  loadGroomers() {
    this.groomerService.getAllGroomers(this.searchTerm).subscribe({
      next: (groomers) => {
        this.groomers = groomers;
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
    this.loadGroomers();
  }
}
