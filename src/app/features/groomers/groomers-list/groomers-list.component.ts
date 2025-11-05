import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
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
                <th>Commission</th>
                <th>Bookings</th>
                <th>Gross Revenue</th>
                <th>Stripe Fees</th>
                <th>Net Revenue</th>
                <th>Groomer Earnings</th>
                <th>Rating</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              @for (groomer of groomers; track groomer.id) {
                <tr>
                  <td class="name-cell">
                    <div class="name">{{ groomer.first_name }} {{ groomer.last_name }}</div>
                    <div class="phone">{{ groomer.phone || 'No phone' }}</div>
                  </td>
                  <td>{{ groomer.email }}</td>
                  <td>
                    <span class="commission-badge">
                      {{ formatCommissionRate(groomer.commission_rate || 0.35) }}
                    </span>
                  </td>
                  <td>
                    <div class="bookings-cell">
                      <div>{{ groomer.stats?.completedBookings || 0 }}/{{ groomer.stats?.totalBookings || 0 }}</div>
                      <div class="completion-rate">{{ (groomer.stats?.completionRate || 0).toFixed(0) }}%</div>
                    </div>
                  </td>
                  <td class="currency">{{ formatCurrency(groomer.stats?.totalGrossRevenue || 0) }}</td>
                  <td class="currency fee">-{{ formatCurrency(groomer.stats?.totalStripeFees || 0) }}</td>
                  <td class="currency net">{{ formatCurrency(groomer.stats?.totalNetRevenue || 0) }}</td>
                  <td class="currency earnings">{{ formatCurrency(groomer.stats?.totalGroomerEarnings || 0) }}</td>
                  <td>
                    @if ((groomer.stats?.averageRating || 0) > 0) {
                      <span class="rating">{{ (groomer.stats?.averageRating || 0).toFixed(1) }} ⭐</span>
                    } @else {
                      <span class="no-rating">N/A</span>
                    }
                  </td>
                  <td>
                    <button class="view-btn" (click)="viewGroomer(groomer.id)">
                      View Details
                    </button>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }
    </div>
  `,
  styles: [`
    .page { max-width: 1600px; margin: 0 auto; padding: 2rem; }
    h1 { font-size: 2rem; margin-bottom: 2rem; }
    .search-box { margin-bottom: 2rem; }
    .search-box input { padding: 0.75rem; width: 100%; max-width: 400px; border: 2px solid #e2e8f0; border-radius: 8px; font-size: 1rem; }
    .loading { text-align: center; padding: 4rem; color: #64748b; }
    .table-container { background: white; border-radius: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); overflow-x: auto; }
    table { width: 100%; border-collapse: collapse; min-width: 1200px; }
    thead { background: #f8fafc; }
    th { padding: 1rem 0.75rem; text-align: left; font-weight: 600; color: #475569; border-bottom: 2px solid #e2e8f0; font-size: 0.8rem; white-space: nowrap; }
    td { padding: 0.875rem 0.75rem; border-bottom: 1px solid #e2e8f0; font-size: 0.875rem; }
    tr:hover { background: #f8fafc; }

    .name-cell .name { font-weight: 600; color: #1e293b; margin-bottom: 0.25rem; }
    .name-cell .phone { font-size: 0.75rem; color: #64748b; }

    .commission-badge {
      display: inline-block;
      padding: 0.25rem 0.75rem;
      background: #dbeafe;
      color: #1e40af;
      border-radius: 9999px;
      font-weight: 600;
      font-size: 0.8rem;
    }

    .bookings-cell { text-align: center; }
    .bookings-cell .completion-rate { font-size: 0.75rem; color: #64748b; margin-top: 0.25rem; }

    .currency {
      font-family: 'Monaco', 'Courier New', monospace;
      text-align: right;
      font-weight: 500;
    }
    .currency.fee { color: #dc2626; }
    .currency.net { color: #059669; font-weight: 600; }
    .currency.earnings { color: #2563eb; font-weight: 700; }

    .rating { color: #f59e0b; font-weight: 600; }
    .no-rating { color: #94a3b8; font-size: 0.875rem; }

    .view-btn {
      padding: 0.5rem 1rem;
      background: #3b82f6;
      color: white;
      border: none;
      border-radius: 6px;
      font-size: 0.875rem;
      font-weight: 500;
      cursor: pointer;
      transition: background 0.2s;
    }
    .view-btn:hover { background: #2563eb; }
  `]
})
export class GroomersListComponent implements OnInit {
  groomers: GroomerWithStats[] = [];
  isLoading = true;
  searchTerm = '';

  constructor(
    private groomerService: GroomerService,
    private router: Router
  ) {}

  ngOnInit() {
    this.loadGroomers();
  }

  loadGroomers() {
    // Use new API endpoint with commission data
    this.groomerService.getAllGroomersWithCommission().subscribe({
      next: (groomers) => {
        this.groomers = groomers;
        this.isLoading = false;
      },
      error: (err) => {
        console.error('Error loading groomers:', err);
        this.isLoading = false;
      }
    });
  }

  onSearch(event: Event) {
    this.searchTerm = (event.target as HTMLInputElement).value;
    this.isLoading = true;
    // For now, filter client-side. Could implement server-side search later
    this.loadGroomers();
  }

  viewGroomer(groomerId: string) {
    this.router.navigate(['/groomers', groomerId]);
  }

  formatCommissionRate(rate: number): string {
    return this.groomerService.formatCommissionRate(rate);
  }

  formatCurrency(amount: number): string {
    return this.groomerService.formatCurrency(amount);
  }
}
