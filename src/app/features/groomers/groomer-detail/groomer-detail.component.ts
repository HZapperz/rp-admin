import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { GroomerService, GroomerEarningsDetail, CommissionHistory } from '../../../core/services/groomer.service';

@Component({
  selector: 'app-groomer-detail',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="page">
      <button class="back-btn" (click)="goBack()">← Back to Groomers</button>

      @if (isLoading) {
        <div class="loading">Loading groomer details...</div>
      }

      @if (!isLoading && earningsDetail) {
        <div class="header">
          <h1>{{ earningsDetail.groomer.name }}</h1>
          <p class="email">{{ earningsDetail.groomer.email }}</p>
        </div>

        <!-- Commission Management Card -->
        <div class="card commission-card">
          <h2>Commission Management</h2>

          <div class="current-commission">
            <label>Current Commission Rate:</label>
            <span class="commission-value">
              {{ formatCommissionRate(earningsDetail.groomer.commissionRate) }}
            </span>
          </div>

          @if (!editingCommission) {
            <button class="edit-btn" (click)="startEditCommission()">
              Edit Commission Rate
            </button>
          }

          @if (editingCommission) {
            <div class="edit-form">
              <div class="form-group">
                <label>New Commission Rate (%):</label>
                <input
                  type="number"
                  [(ngModel)]="newCommissionPercent"
                  min="0"
                  max="100"
                  step="1"
                  placeholder="e.g., 35"
                />
                <small>Enter percentage (e.g., 35 for 35%)</small>
              </div>

              <div class="form-group">
                <label>Notes (optional):</label>
                <textarea
                  [(ngModel)]="commissionNotes"
                  placeholder="Reason for rate change..."
                  rows="3"
                ></textarea>
              </div>

              <div class="form-actions">
                <button class="save-btn" (click)="saveCommission()" [disabled]="isSaving">
                  {{ isSaving ? 'Saving...' : 'Save Changes' }}
                </button>
                <button class="cancel-btn" (click)="cancelEditCommission()">
                  Cancel
                </button>
              </div>

              @if (saveError) {
                <div class="error">{{ saveError }}</div>
              }
            </div>
          }

          <!-- Commission History -->
          <div class="commission-history">
            <h3>Commission History</h3>
            @if (commissionHistory.length === 0) {
              <p class="no-history">No rate changes yet</p>
            }
            @for (change of commissionHistory; track change.id) {
              <div class="history-item">
                <div class="history-header">
                  <span class="rate-change">
                    {{ formatCommissionRate(change.old_rate) }} → {{ formatCommissionRate(change.new_rate) }}
                  </span>
                  <span class="date">{{ formatDate(change.created_at) }}</span>
                </div>
                <div class="history-details">
                  <span class="admin">By: {{ change.admin?.first_name }} {{ change.admin?.last_name }}</span>
                  @if (change.notes) {
                    <p class="notes">{{ change.notes }}</p>
                  }
                </div>
              </div>
            }
          </div>
        </div>

        <!-- Earnings Summary Card -->
        <div class="card earnings-card">
          <h2>Earnings Summary</h2>

          <div class="stats-grid">
            <div class="stat">
              <label>Total Bookings</label>
              <span class="value">{{ earningsDetail.summary.totalBookings }}</span>
            </div>
            <div class="stat highlight">
              <label>Gross Revenue</label>
              <span class="value">{{ formatCurrency(earningsDetail.summary.totalGrossRevenue) }}</span>
            </div>
            <div class="stat negative">
              <label>Stripe Fees</label>
              <span class="value">-{{ formatCurrency(earningsDetail.summary.totalStripeFees) }}</span>
            </div>
            <div class="stat positive">
              <label>Net Revenue</label>
              <span class="value">{{ formatCurrency(earningsDetail.summary.totalNetRevenue) }}</span>
            </div>
            <div class="stat">
              <label>Service Commission</label>
              <span class="value">{{ formatCurrency(earningsDetail.summary.totalServiceCommission) }}</span>
            </div>
            <div class="stat">
              <label>Tips</label>
              <span class="value">{{ formatCurrency(earningsDetail.summary.totalTips) }}</span>
            </div>
            <div class="stat primary">
              <label>Total Groomer Earnings</label>
              <span class="value">{{ formatCurrency(earningsDetail.summary.totalEarnings) }}</span>
            </div>
            <div class="stat pending">
              <label>Pending Payout</label>
              <span class="value">{{ formatCurrency(earningsDetail.summary.pendingPayout) }}</span>
            </div>
          </div>
        </div>

        <!-- Recent Earnings -->
        <div class="card">
          <h2>Recent Earnings (Last 20)</h2>
          <div class="table-container">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Client</th>
                  <th>Gross</th>
                  <th>Stripe Fee</th>
                  <th>Commission</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                @for (earning of earningsDetail.earnings.slice(0, 20); track earning.id) {
                  <tr>
                    <td>{{ formatDate(earning.booking?.scheduled_date) }}</td>
                    <td>{{ earning.booking?.client?.first_name }} {{ earning.booking?.client?.last_name }}</td>
                    <td class="currency">{{ formatCurrency(earning.service_amount_gross) }}</td>
                    <td class="currency fee">-{{ formatCurrency(earning.total_stripe_fees) }}</td>
                    <td class="currency earnings">{{ formatCurrency(earning.groomer_amount) }}</td>
                    <td>
                      <span class="status-badge status-{{ earning.status }}">
                        {{ earning.status }}
                      </span>
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </div>
      }
    </div>
  `,
  styles: [`
    .page { max-width: 1200px; margin: 0 auto; padding: 2rem; }

    .back-btn {
      padding: 0.5rem 1rem;
      background: #f1f5f9;
      border: none;
      border-radius: 6px;
      cursor: pointer;
      margin-bottom: 1.5rem;
      font-size: 0.9rem;
      transition: background 0.2s;
    }
    .back-btn:hover { background: #e2e8f0; }

    .loading { text-align: center; padding: 4rem; color: #64748b; }

    .header { margin-bottom: 2rem; }
    .header h1 { font-size: 2rem; margin-bottom: 0.5rem; }
    .header .email { color: #64748b; }

    .card {
      background: white;
      border-radius: 12px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
      padding: 2rem;
      margin-bottom: 2rem;
    }

    .card h2 { font-size: 1.5rem; margin-bottom: 1.5rem; color: #1e293b; }
    .card h3 { font-size: 1.1rem; margin: 2rem 0 1rem; color: #475569; }

    .commission-card .current-commission {
      display: flex;
      align-items: center;
      gap: 1rem;
      padding: 1rem;
      background: #f0f9ff;
      border-radius: 8px;
      margin-bottom: 1rem;
    }
    .commission-card .current-commission label { font-weight: 600; color: #0369a1; }
    .commission-card .current-commission .commission-value {
      font-size: 1.5rem;
      font-weight: 700;
      color: #0284c7;
    }

    .edit-btn {
      padding: 0.75rem 1.5rem;
      background: #3b82f6;
      color: white;
      border: none;
      border-radius: 6px;
      cursor: pointer;
      font-weight: 500;
      transition: background 0.2s;
    }
    .edit-btn:hover { background: #2563eb; }

    .edit-form {
      margin-top: 1.5rem;
      padding: 1.5rem;
      background: #f8fafc;
      border-radius: 8px;
    }

    .form-group {
      margin-bottom: 1.5rem;
    }
    .form-group label {
      display: block;
      margin-bottom: 0.5rem;
      font-weight: 600;
      color: #334155;
    }
    .form-group input,
    .form-group textarea {
      width: 100%;
      padding: 0.75rem;
      border: 2px solid #e2e8f0;
      border-radius: 6px;
      font-size: 1rem;
      font-family: inherit;
    }
    .form-group input:focus,
    .form-group textarea:focus {
      outline: none;
      border-color: #3b82f6;
    }
    .form-group small {
      display: block;
      margin-top: 0.25rem;
      color: #64748b;
      font-size: 0.85rem;
    }

    .form-actions {
      display: flex;
      gap: 1rem;
      margin-top: 1.5rem;
    }
    .save-btn {
      padding: 0.75rem 1.5rem;
      background: #10b981;
      color: white;
      border: none;
      border-radius: 6px;
      cursor: pointer;
      font-weight: 500;
      transition: background 0.2s;
    }
    .save-btn:hover:not(:disabled) { background: #059669; }
    .save-btn:disabled { opacity: 0.5; cursor: not-allowed; }

    .cancel-btn {
      padding: 0.75rem 1.5rem;
      background: #f1f5f9;
      color: #475569;
      border: none;
      border-radius: 6px;
      cursor: pointer;
      font-weight: 500;
      transition: background 0.2s;
    }
    .cancel-btn:hover { background: #e2e8f0; }

    .error {
      margin-top: 1rem;
      padding: 0.75rem;
      background: #fee2e2;
      color: #dc2626;
      border-radius: 6px;
      font-size: 0.9rem;
    }

    .commission-history { margin-top: 2rem; }
    .no-history { color: #94a3b8; font-style: italic; }

    .history-item {
      padding: 1rem;
      background: #f8fafc;
      border-left: 4px solid #3b82f6;
      border-radius: 6px;
      margin-bottom: 1rem;
    }
    .history-header {
      display: flex;
      justify-content: space-between;
      margin-bottom: 0.5rem;
    }
    .history-header .rate-change {
      font-weight: 700;
      color: #1e293b;
    }
    .history-header .date { color: #64748b; font-size: 0.875rem; }
    .history-details .admin { color: #475569; font-size: 0.9rem; }
    .history-details .notes {
      margin-top: 0.5rem;
      padding: 0.5rem;
      background: white;
      border-radius: 4px;
      font-size: 0.875rem;
      color: #64748b;
    }

    .stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 1.5rem;
    }
    .stat {
      padding: 1.25rem;
      background: #f8fafc;
      border-radius: 8px;
      border: 2px solid #e2e8f0;
    }
    .stat label {
      display: block;
      font-size: 0.875rem;
      color: #64748b;
      margin-bottom: 0.5rem;
      font-weight: 500;
    }
    .stat value {
      display: block;
      font-size: 1.5rem;
      font-weight: 700;
      color: #1e293b;
      font-family: 'Monaco', 'Courier New', monospace;
    }
    .stat.highlight { background: #fef3c7; border-color: #fbbf24; }
    .stat.highlight value { color: #b45309; }
    .stat.negative { background: #fee2e2; border-color: #fca5a5; }
    .stat.negative value { color: #dc2626; }
    .stat.positive { background: #d1fae5; border-color: #6ee7b7; }
    .stat.positive value { color: #059669; }
    .stat.primary { background: #dbeafe; border-color: #93c5fd; }
    .stat.primary value { color: #2563eb; font-size: 1.75rem; }
    .stat.pending { background: #fce7f3; border-color: #f9a8d4; }
    .stat.pending value { color: #db2777; }

    .table-container { overflow-x: auto; margin-top: 1rem; }
    table { width: 100%; border-collapse: collapse; }
    thead { background: #f8fafc; }
    th {
      padding: 0.875rem;
      text-align: left;
      font-weight: 600;
      color: #475569;
      border-bottom: 2px solid #e2e8f0;
      font-size: 0.875rem;
    }
    td {
      padding: 0.875rem;
      border-bottom: 1px solid #e2e8f0;
      font-size: 0.875rem;
    }
    tr:hover { background: #f8fafc; }

    .currency {
      font-family: 'Monaco', 'Courier New', monospace;
      text-align: right;
      font-weight: 500;
    }
    .currency.fee { color: #dc2626; }
    .currency.earnings { color: #2563eb; font-weight: 700; }

    .status-badge {
      display: inline-block;
      padding: 0.25rem 0.75rem;
      border-radius: 9999px;
      font-size: 0.75rem;
      font-weight: 600;
      text-transform: uppercase;
    }
    .status-badge.status-pending { background: #fef3c7; color: #b45309; }
    .status-badge.status-processing { background: #dbeafe; color: #1e40af; }
    .status-badge.status-paid { background: #d1fae5; color: #047857; }
  `]
})
export class GroomerDetailComponent implements OnInit {
  groomerId!: string;
  earningsDetail: GroomerEarningsDetail | null = null;
  commissionHistory: CommissionHistory[] = [];
  isLoading = true;

  editingCommission = false;
  newCommissionPercent = 35;
  commissionNotes = '';
  isSaving = false;
  saveError = '';

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private groomerService: GroomerService
  ) {}

  ngOnInit() {
    this.groomerId = this.route.snapshot.paramMap.get('id') || '';
    this.loadGroomerData();
  }

  loadGroomerData() {
    this.isLoading = true;

    // Load earnings details
    this.groomerService.getGroomerEarnings(this.groomerId).subscribe({
      next: (data) => {
        this.earningsDetail = data;
        this.isLoading = false;
      },
      error: (err) => {
        console.error('Error loading groomer earnings:', err);
        this.isLoading = false;
      }
    });

    // Load commission history
    this.groomerService.getCommissionHistory(this.groomerId).subscribe({
      next: (data) => {
        this.commissionHistory = data.history;
      },
      error: (err) => {
        console.error('Error loading commission history:', err);
      }
    });
  }

  startEditCommission() {
    this.editingCommission = true;
    this.newCommissionPercent = Math.round((this.earningsDetail?.groomer.commissionRate || 0.35) * 100);
    this.commissionNotes = '';
    this.saveError = '';
  }

  cancelEditCommission() {
    this.editingCommission = false;
    this.saveError = '';
  }

  saveCommission() {
    if (this.newCommissionPercent < 0 || this.newCommissionPercent > 100) {
      this.saveError = 'Commission rate must be between 0 and 100';
      return;
    }

    this.isSaving = true;
    this.saveError = '';

    const commissionRate = this.newCommissionPercent / 100;

    this.groomerService.updateGroomerCommission(
      this.groomerId,
      commissionRate,
      this.commissionNotes || undefined
    ).subscribe({
      next: () => {
        this.isSaving = false;
        this.editingCommission = false;
        // Show success message
        alert('Commission rate updated successfully!');
        // Reload data to show updated values
        this.loadGroomerData();
      },
      error: (err) => {
        console.error('Error updating commission:', err);

        // Provide more helpful error messages
        if (err.message?.includes('lock') || err.message?.includes('LockManager')) {
          this.saveError = 'Auth session conflict detected. Please close any other admin portal tabs and try again.';
        } else if (err.error?.error) {
          this.saveError = err.error.error;
        } else if (err.message) {
          this.saveError = err.message;
        } else {
          this.saveError = 'Failed to update commission rate. Please try again.';
        }

        this.isSaving = false;
      }
    });
  }

  goBack() {
    this.router.navigate(['/groomers']);
  }

  formatCommissionRate(rate: number): string {
    return this.groomerService.formatCommissionRate(rate);
  }

  formatCurrency(amount: number): string {
    return this.groomerService.formatCurrency(amount);
  }

  formatDate(dateString: string): string {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  }
}
