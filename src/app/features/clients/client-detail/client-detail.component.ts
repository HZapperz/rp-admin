import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import {
  ClientService,
  ClientDetailData,
  Pet,
  Address,
  PaymentMethod,
  Rating,
  AdminNote
} from '../../../core/services/client.service';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'app-client-detail',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  template: `
    <div class="client-detail-container">
      <!-- Loading State -->
      <div *ngIf="loading" class="loading">
        <div class="spinner"></div>
        <p>Loading client details...</p>
      </div>

      <!-- Error State -->
      <div *ngIf="error" class="error-state">
        <h2>Error Loading Client</h2>
        <p>{{ error }}</p>
        <button (click)="goBack()" class="btn-back">Back to Clients</button>
      </div>

      <!-- Client Detail Content -->
      <div *ngIf="!loading && !error && clientData" class="detail-content">
        <!-- Header -->
        <div class="detail-header">
          <button (click)="goBack()" class="btn-back">← Back to Clients</button>
          <h1>Client Details</h1>
        </div>

        <!-- Client Overview -->
        <div class="section overview-section">
          <div class="client-profile">
            <div class="profile-image">
              <img
                [src]="clientData.client.avatar_url || 'assets/default-avatar.png'"
                [alt]="clientData.client.first_name + ' ' + clientData.client.last_name"
                onerror="this.src='https://via.placeholder.com/150?text=No+Image'"
              />
            </div>
            <div class="profile-info">
              <h2>{{ clientData.client.first_name }} {{ clientData.client.last_name }}</h2>
              <div class="profile-details">
                <div class="detail-item">
                  <span class="label">Email:</span>
                  <span class="value">{{ clientData.client.email }}</span>
                </div>
                <div class="detail-item">
                  <span class="label">Phone:</span>
                  <span class="value">{{ clientData.client.phone || 'N/A' }}</span>
                </div>
                <div class="detail-item">
                  <span class="label">Member Since:</span>
                  <span class="value">{{ formatDate(clientData.client.created_at) }}</span>
                </div>
                <div class="detail-item" *ngIf="clientData.client.blocked_at">
                  <span class="label">Status:</span>
                  <span class="value status-blocked">Blocked</span>
                </div>
              </div>
            </div>
          </div>

          <!-- Statistics -->
          <div class="stats-grid">
            <div class="stat-card">
              <div class="stat-value">{{ clientData.client.total_bookings }}</div>
              <div class="stat-label">Total Bookings</div>
            </div>
            <div class="stat-card">
              <div class="stat-value">{{ formatCurrency(clientData.client.total_spent) }}</div>
              <div class="stat-label">Total Spent</div>
            </div>
            <div class="stat-card">
              <div class="stat-value">{{ clientData.client.last_booking_date ? formatDate(clientData.client.last_booking_date) : 'Never' }}</div>
              <div class="stat-label">Last Booking</div>
            </div>
          </div>
        </div>

        <!-- Pets Section -->
        <div class="section">
          <h3 class="section-title">Pets ({{ clientData.pets.length }})</h3>
          <div *ngIf="clientData.pets.length === 0" class="empty-state">
            No pets registered
          </div>
          <div class="pets-grid" *ngIf="clientData.pets.length > 0">
            <div class="pet-card" *ngFor="let pet of clientData.pets">
              <div class="pet-header">
                <img
                  [src]="pet.photo_url || 'https://via.placeholder.com/80?text=Pet'"
                  [alt]="pet.name"
                  class="pet-image"
                  onerror="this.src='https://via.placeholder.com/80?text=Pet'"
                />
                <div class="pet-basic-info">
                  <h4>{{ pet.name }}</h4>
                  <p class="pet-breed">{{ pet.breed || 'Unknown breed' }}</p>
                  <span class="pet-size" *ngIf="pet.size_category">{{ pet.size_category | uppercase }}</span>
                </div>
              </div>
              <div class="pet-details">
                <div *ngIf="pet.age || pet.date_of_birth">
                  <strong>Age:</strong> {{ pet.age || calculateAge(pet.date_of_birth) }}
                </div>
                <div *ngIf="pet.has_allergies">
                  <strong>Allergies:</strong> {{ pet.allergy_details || 'Yes' }}
                </div>
                <div *ngIf="pet.has_skin_conditions">
                  <strong>Skin Conditions:</strong> {{ pet.skin_condition_details || 'Yes' }}
                </div>
                <div *ngIf="pet.blow_dryer_reaction">
                  <strong>Blow Dryer Reaction:</strong> {{ pet.blow_dryer_reaction }}
                </div>
                <div *ngIf="pet.water_reaction">
                  <strong>Water Reaction:</strong> {{ pet.water_reaction }}
                </div>
                <div *ngIf="pet.special_notes || pet.additional_notes">
                  <strong>Notes:</strong> {{ pet.special_notes || pet.additional_notes }}
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Addresses Section -->
        <div class="section">
          <h3 class="section-title">Addresses ({{ clientData.addresses.length }})</h3>
          <div *ngIf="clientData.addresses.length === 0" class="empty-state">
            No addresses saved
          </div>
          <div class="addresses-list" *ngIf="clientData.addresses.length > 0">
            <div class="address-card" *ngFor="let address of clientData.addresses">
              <div class="address-header">
                <span class="address-name">{{ address.name }}</span>
                <span class="badge" *ngIf="address.is_default">Default</span>
                <span class="address-type">{{ address.address_type }}</span>
              </div>
              <div class="address-details">
                {{ address.building }}<span *ngIf="address.apartment">, Apt {{ address.apartment }}</span><span *ngIf="address.floor">, Floor {{ address.floor }}</span><br/>
                {{ address.street }}<br/>
                {{ address.city }}, {{ address.state }} {{ address.zip_code }}
                <div *ngIf="address.additional_info" class="address-notes">
                  {{ address.additional_info }}
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Payment Methods Section -->
        <div class="section">
          <h3 class="section-title">Payment Methods ({{ clientData.paymentMethods.length }})</h3>
          <div *ngIf="clientData.paymentMethods.length === 0" class="empty-state">
            No payment methods saved
          </div>
          <div class="payment-methods-list" *ngIf="clientData.paymentMethods.length > 0">
            <div class="payment-card" *ngFor="let pm of clientData.paymentMethods">
              <div class="payment-header">
                <span class="card-brand">{{ pm.brand | uppercase }}</span>
                <span class="badge" *ngIf="pm.is_default">Default</span>
              </div>
              <div class="payment-details">
                <div class="card-number">•••• •••• •••• {{ pm.last4 }}</div>
                <div class="card-expiry">Expires: {{ pm.exp_month }}/{{ pm.exp_year }}</div>
              </div>
            </div>
          </div>
        </div>

        <!-- Booking History Section -->
        <div class="section">
          <h3 class="section-title">Booking History ({{ clientData.bookings.length }})</h3>
          <div *ngIf="clientData.bookings.length === 0" class="empty-state">
            No bookings yet
          </div>
          <div class="bookings-table" *ngIf="clientData.bookings.length > 0">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Time</th>
                  <th>Service</th>
                  <th>Groomer</th>
                  <th>Amount</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                <tr *ngFor="let booking of clientData.bookings">
                  <td>{{ formatDate(booking.scheduled_date) }}</td>
                  <td>{{ formatTime(booking.scheduled_time_start) }} - {{ formatTime(booking.scheduled_time_end) }}</td>
                  <td>{{ booking.service_name || 'N/A' }}</td>
                  <td>{{ booking.groomer_name || 'Unassigned' }}</td>
                  <td>{{ formatCurrency(booking.total_amount) }}</td>
                  <td>
                    <span [class]="'status-badge ' + getStatusClass(booking.status)">
                      {{ getStatusLabel(booking.status) }}
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- Ratings Section -->
        <div class="section">
          <h3 class="section-title">Reviews Given ({{ clientData.ratings.length }})</h3>
          <div *ngIf="clientData.ratings.length === 0" class="empty-state">
            No reviews yet
          </div>
          <div class="ratings-list" *ngIf="clientData.ratings.length > 0">
            <div class="rating-card" *ngFor="let rating of clientData.ratings">
              <div class="rating-header">
                <span class="groomer-name">Groomer: {{ rating.groomer?.first_name }} {{ rating.groomer?.last_name }}</span>
                <span class="rating-date">{{ formatDate(rating.created_at) }}</span>
              </div>
              <div class="rating-scores">
                <div class="score-item">
                  <span class="score-label">Experience:</span>
                  <span class="score-value">{{ rating.experience_rating }}/5 ⭐</span>
                </div>
                <div class="score-item">
                  <span class="score-label">Quality:</span>
                  <span class="score-value">{{ rating.quality_rating }}/5 ⭐</span>
                </div>
                <div class="score-item">
                  <span class="score-label">Recommendation:</span>
                  <span class="score-value">{{ rating.recommendation_rating }}/5 ⭐</span>
                </div>
              </div>
              <div class="rating-comment" *ngIf="rating.comment">
                "{{ rating.comment }}"
              </div>
            </div>
          </div>
        </div>

        <!-- Admin Notes Section -->
        <div class="section">
          <h3 class="section-title">Admin Notes</h3>

          <!-- Add Note Form -->
          <div class="add-note-form">
            <h4>Add New Note</h4>
            <div class="form-group">
              <label for="note-priority">Priority:</label>
              <select id="note-priority" [(ngModel)]="newNotePriority" class="form-control">
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>
            <div class="form-group">
              <label for="note-text">Note:</label>
              <textarea
                id="note-text"
                [(ngModel)]="newNoteText"
                class="form-control"
                rows="3"
                placeholder="Enter admin note..."
              ></textarea>
            </div>
            <button
              (click)="addAdminNote()"
              [disabled]="!newNoteText.trim() || addingNote"
              class="btn-primary"
            >
              {{ addingNote ? 'Adding...' : 'Add Note' }}
            </button>
          </div>

          <!-- Notes List -->
          <div *ngIf="clientData.adminNotes.length === 0" class="empty-state">
            No admin notes yet
          </div>
          <div class="notes-list" *ngIf="clientData.adminNotes.length > 0">
            <div class="note-card" *ngFor="let note of clientData.adminNotes">
              <div class="note-header">
                <span [class]="'priority-badge priority-' + note.priority">{{ note.priority || 'medium' }}</span>
                <span class="note-author">{{ note.admin?.first_name }} {{ note.admin?.last_name }}</span>
                <span class="note-date">{{ formatDate(note.created_at) }}</span>
              </div>
              <div class="note-content">
                {{ note.note }}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .client-detail-container {
      padding: 2rem;
      max-width: 1400px;
      margin: 0 auto;
    }

    .loading {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 400px;
      gap: 1rem;
    }

    .spinner {
      border: 3px solid #f3f3f3;
      border-top: 3px solid #6366f1;
      border-radius: 50%;
      width: 40px;
      height: 40px;
      animation: spin 1s linear infinite;
    }

    @keyframes spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }

    .error-state {
      text-align: center;
      padding: 2rem;
    }

    .detail-header {
      margin-bottom: 2rem;
    }

    .detail-header h1 {
      margin: 1rem 0;
      font-size: 2rem;
      color: #1f2937;
    }

    .btn-back {
      background: #6366f1;
      color: white;
      border: none;
      padding: 0.5rem 1rem;
      border-radius: 6px;
      cursor: pointer;
      font-size: 0.875rem;
      transition: background 0.2s;
    }

    .btn-back:hover {
      background: #4f46e5;
    }

    .section {
      background: white;
      border-radius: 12px;
      padding: 1.5rem;
      margin-bottom: 2rem;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
    }

    .section-title {
      font-size: 1.25rem;
      font-weight: 600;
      color: #1f2937;
      margin-bottom: 1.5rem;
      padding-bottom: 0.75rem;
      border-bottom: 2px solid #e5e7eb;
    }

    .overview-section {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
    }

    .client-profile {
      display: flex;
      gap: 2rem;
      margin-bottom: 2rem;
    }

    .profile-image img {
      width: 150px;
      height: 150px;
      border-radius: 50%;
      object-fit: cover;
      border: 4px solid white;
      box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
    }

    .profile-info h2 {
      color: white;
      font-size: 2rem;
      margin-bottom: 1rem;
    }

    .profile-details {
      display: grid;
      gap: 0.75rem;
    }

    .detail-item {
      display: flex;
      gap: 0.5rem;
    }

    .detail-item .label {
      font-weight: 600;
      opacity: 0.9;
    }

    .detail-item .value {
      opacity: 0.95;
    }

    .status-blocked {
      background: #ef4444;
      padding: 0.25rem 0.75rem;
      border-radius: 4px;
      font-size: 0.875rem;
    }

    .stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 1rem;
    }

    .stat-card {
      background: rgba(255, 255, 255, 0.2);
      backdrop-filter: blur(10px);
      padding: 1.5rem;
      border-radius: 12px;
      text-align: center;
    }

    .stat-value {
      font-size: 2rem;
      font-weight: bold;
      margin-bottom: 0.5rem;
    }

    .stat-label {
      font-size: 0.875rem;
      opacity: 0.9;
    }

    .pets-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
      gap: 1.5rem;
    }

    .pet-card {
      border: 1px solid #e5e7eb;
      border-radius: 12px;
      padding: 1.5rem;
      transition: transform 0.2s, box-shadow 0.2s;
    }

    .pet-card:hover {
      transform: translateY(-2px);
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
    }

    .pet-header {
      display: flex;
      gap: 1rem;
      margin-bottom: 1rem;
      align-items: center;
    }

    .pet-image {
      width: 80px;
      height: 80px;
      border-radius: 50%;
      object-fit: cover;
    }

    .pet-basic-info h4 {
      margin: 0 0 0.25rem 0;
      color: #1f2937;
    }

    .pet-breed {
      margin: 0;
      color: #6b7280;
      font-size: 0.875rem;
    }

    .pet-size {
      display: inline-block;
      background: #6366f1;
      color: white;
      padding: 0.25rem 0.5rem;
      border-radius: 4px;
      font-size: 0.75rem;
      margin-top: 0.5rem;
    }

    .pet-details {
      display: grid;
      gap: 0.5rem;
      font-size: 0.875rem;
      color: #4b5563;
    }

    .addresses-list {
      display: grid;
      gap: 1rem;
    }

    .address-card {
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      padding: 1rem;
    }

    .address-header {
      display: flex;
      gap: 0.75rem;
      align-items: center;
      margin-bottom: 0.75rem;
    }

    .address-name {
      font-weight: 600;
      color: #1f2937;
    }

    .address-type {
      color: #6b7280;
      font-size: 0.875rem;
      text-transform: capitalize;
    }

    .badge {
      background: #10b981;
      color: white;
      padding: 0.25rem 0.5rem;
      border-radius: 4px;
      font-size: 0.75rem;
    }

    .address-details {
      color: #4b5563;
      font-size: 0.875rem;
      line-height: 1.6;
    }

    .address-notes {
      margin-top: 0.5rem;
      padding-top: 0.5rem;
      border-top: 1px solid #e5e7eb;
      font-style: italic;
    }

    .payment-methods-list {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
      gap: 1rem;
    }

    .payment-card {
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      padding: 1rem;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
    }

    .payment-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 1rem;
    }

    .card-brand {
      font-weight: 700;
      font-size: 1.125rem;
    }

    .payment-details {
      display: grid;
      gap: 0.5rem;
    }

    .card-number {
      font-size: 1.125rem;
      letter-spacing: 0.1em;
    }

    .card-expiry {
      font-size: 0.875rem;
      opacity: 0.9;
    }

    .bookings-table {
      overflow-x: auto;
    }

    table {
      width: 100%;
      border-collapse: collapse;
    }

    thead {
      background: #f9fafb;
    }

    th {
      text-align: left;
      padding: 0.75rem;
      font-weight: 600;
      color: #374151;
      border-bottom: 2px solid #e5e7eb;
    }

    td {
      padding: 0.75rem;
      border-bottom: 1px solid #e5e7eb;
      color: #4b5563;
    }

    .status-badge {
      padding: 0.25rem 0.75rem;
      border-radius: 12px;
      font-size: 0.75rem;
      font-weight: 600;
      text-transform: uppercase;
    }

    .status-pending { background: #fef3c7; color: #92400e; }
    .status-confirmed { background: #dbeafe; color: #1e40af; }
    .status-progress { background: #e0e7ff; color: #3730a3; }
    .status-completed { background: #d1fae5; color: #065f46; }
    .status-cancelled { background: #fee2e2; color: #991b1b; }

    .ratings-list {
      display: grid;
      gap: 1rem;
    }

    .rating-card {
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      padding: 1rem;
    }

    .rating-header {
      display: flex;
      justify-content: space-between;
      margin-bottom: 1rem;
    }

    .groomer-name {
      font-weight: 600;
      color: #1f2937;
    }

    .rating-date {
      color: #6b7280;
      font-size: 0.875rem;
    }

    .rating-scores {
      display: flex;
      gap: 1.5rem;
      margin-bottom: 0.75rem;
      flex-wrap: wrap;
    }

    .score-item {
      display: flex;
      gap: 0.5rem;
      align-items: center;
    }

    .score-label {
      font-size: 0.875rem;
      color: #6b7280;
    }

    .score-value {
      font-weight: 600;
      color: #1f2937;
    }

    .rating-comment {
      padding: 0.75rem;
      background: #f9fafb;
      border-radius: 6px;
      font-style: italic;
      color: #4b5563;
    }

    .add-note-form {
      background: #f9fafb;
      padding: 1.5rem;
      border-radius: 8px;
      margin-bottom: 1.5rem;
    }

    .add-note-form h4 {
      margin-top: 0;
      margin-bottom: 1rem;
      color: #1f2937;
    }

    .form-group {
      margin-bottom: 1rem;
    }

    .form-group label {
      display: block;
      margin-bottom: 0.5rem;
      font-weight: 600;
      color: #374151;
    }

    .form-control {
      width: 100%;
      padding: 0.5rem;
      border: 1px solid #d1d5db;
      border-radius: 6px;
      font-size: 0.875rem;
    }

    .form-control:focus {
      outline: none;
      border-color: #6366f1;
      box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.1);
    }

    .btn-primary {
      background: #6366f1;
      color: white;
      border: none;
      padding: 0.75rem 1.5rem;
      border-radius: 6px;
      cursor: pointer;
      font-weight: 600;
      transition: background 0.2s;
    }

    .btn-primary:hover:not(:disabled) {
      background: #4f46e5;
    }

    .btn-primary:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .notes-list {
      display: grid;
      gap: 1rem;
    }

    .note-card {
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      padding: 1rem;
    }

    .note-header {
      display: flex;
      gap: 1rem;
      align-items: center;
      margin-bottom: 0.75rem;
      flex-wrap: wrap;
    }

    .priority-badge {
      padding: 0.25rem 0.75rem;
      border-radius: 4px;
      font-size: 0.75rem;
      font-weight: 600;
      text-transform: uppercase;
    }

    .priority-low { background: #dbeafe; color: #1e40af; }
    .priority-medium { background: #fef3c7; color: #92400e; }
    .priority-high { background: #fed7aa; color: #9a3412; }
    .priority-urgent { background: #fee2e2; color: #991b1b; }

    .note-author {
      color: #6b7280;
      font-size: 0.875rem;
      font-weight: 600;
    }

    .note-date {
      color: #9ca3af;
      font-size: 0.875rem;
      margin-left: auto;
    }

    .note-content {
      color: #4b5563;
      line-height: 1.6;
    }

    .empty-state {
      text-align: center;
      padding: 2rem;
      color: #6b7280;
      font-style: italic;
    }
  `]
})
export class ClientDetailComponent implements OnInit {
  clientData: ClientDetailData | null = null;
  loading = true;
  error = '';

  newNoteText = '';
  newNotePriority: 'low' | 'medium' | 'high' | 'urgent' = 'medium';
  addingNote = false;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private clientService: ClientService,
    private authService: AuthService
  ) {}

  async ngOnInit() {
    const clientId = this.route.snapshot.paramMap.get('id');
    if (!clientId) {
      this.error = 'Client ID not provided';
      this.loading = false;
      return;
    }

    await this.loadClientData(clientId);
  }

  async loadClientData(clientId: string) {
    try {
      this.loading = true;
      this.clientData = await this.clientService.getClientDetailData(clientId);

      if (!this.clientData) {
        this.error = 'Client not found';
      }
    } catch (err) {
      console.error('Error loading client data:', err);
      this.error = 'Failed to load client data';
    } finally {
      this.loading = false;
    }
  }

  async addAdminNote() {
    if (!this.newNoteText.trim() || !this.clientData) return;

    const currentUser = this.authService.currentUser;
    if (!currentUser) {
      alert('You must be logged in to add notes');
      return;
    }

    try {
      this.addingNote = true;
      const note = await this.clientService.createAdminNote(
        'user',
        this.clientData.client.id,
        this.newNoteText.trim(),
        this.newNotePriority,
        currentUser.id
      );

      if (note) {
        // Add the new note to the list
        this.clientData.adminNotes.unshift(note);
        // Reset form
        this.newNoteText = '';
        this.newNotePriority = 'medium';
      } else {
        alert('Failed to add note. Please try again.');
      }
    } catch (err) {
      console.error('Error adding note:', err);
      alert('Failed to add note. Please try again.');
    } finally {
      this.addingNote = false;
    }
  }

  goBack() {
    this.router.navigate(['/clients']);
  }

  formatDate(dateString: string): string {
    // Parse ISO date string as UTC to avoid timezone conversion issues
    const date = new Date(dateString + 'T00:00:00Z');
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      timeZone: 'UTC'
    });
  }

  formatTime(timeString: string): string {
    if (!timeString) return 'N/A';
    const [hours, minutes] = timeString.split(':');
    const hour = parseInt(hours, 10);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour % 12 || 12;
    return `${displayHour}:${minutes} ${ampm}`;
  }

  formatCurrency(amount: number): string {
    return `$${amount.toFixed(2)}`;
  }

  getStatusClass(status: string): string {
    return `status-${status.replace('_', '-')}`;
  }

  getStatusLabel(status: string): string {
    const labels: Record<string, string> = {
      'pending': 'Pending',
      'confirmed': 'Confirmed',
      'in_progress': 'In Progress',
      'completed': 'Completed',
      'cancelled': 'Cancelled'
    };
    return labels[status] || status;
  }

  calculateAge(dateOfBirth?: string): string {
    if (!dateOfBirth) return 'Unknown';
    const today = new Date();
    const birthDate = new Date(dateOfBirth);
    const ageInYears = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();

    if (ageInYears < 1) {
      const ageInMonths = monthDiff + (ageInYears * 12);
      return `${ageInMonths} months`;
    }

    return `${ageInYears} years`;
  }
}
