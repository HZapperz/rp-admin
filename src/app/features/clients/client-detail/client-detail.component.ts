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
import { SupabaseService } from '../../../core/services/supabase.service';
import { AddPetModalComponent } from '../../../shared/components/add-pet-modal/add-pet-modal.component';

@Component({
  selector: 'app-client-detail',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, AddPetModalComponent],
  templateUrl: './client-detail.component.html',
  styleUrls: ['./client-detail.component.scss']
})
export class ClientDetailComponent implements OnInit {
  clientData: ClientDetailData | null = null;
  loading = true;
  error = '';

  newNoteText = '';
  newNotePriority: 'low' | 'medium' | 'high' | 'urgent' = 'medium';
  addingNote = false;

  // Add Pet Modal
  showAddPetModal = false;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private clientService: ClientService,
    private authService: AuthService,
    private supabaseService: SupabaseService
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

  // Add Pet Modal methods
  openAddPetModal(): void {
    this.showAddPetModal = true;
  }

  closeAddPetModal(): void {
    this.showAddPetModal = false;
  }

  async onPetAdded(): Promise<void> {
    // Refresh pets list after adding a new pet
    if (this.clientData) {
      this.clientData.pets = await this.clientService.getClientPets(this.clientData.client.id);
    }
    this.showAddPetModal = false;
  }

  formatDate(dateString: string | null | undefined): string {
    if (!dateString) return 'N/A';

    // If it's already a full timestamp, use it directly
    // Otherwise append time component for date-only strings
    const date = dateString.includes('T') || dateString.includes(' ')
      ? new Date(dateString)
      : new Date(dateString + 'T00:00:00Z');

    if (isNaN(date.getTime())) return 'N/A';

    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      timeZone: 'UTC'
    });
  }

  formatDateTime(dateString: string | null | undefined): string {
    if (!dateString) return 'Never';

    const date = new Date(dateString);
    if (isNaN(date.getTime())) return 'Never';

    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
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

  getPetPhotoUrl(photoUrl: string | undefined): string {
    if (!photoUrl) return 'https://via.placeholder.com/80?text=Pet';
    
    // If it's already a full URL, return it
    if (photoUrl.startsWith('http://') || photoUrl.startsWith('https://')) {
      return photoUrl;
    }
    
    // The photo_url from database format: "pet-photos/user_id/filename.jpg"
    // Extract bucket and path
    const parts = photoUrl.split('/');
    if (parts.length >= 2) {
      const bucket = parts[0];
      const path = parts.slice(1).join('/');
      return this.supabaseService.getPublicUrl(bucket, path);
    }
    
    // Fallback: assume pet-photos bucket and use the whole string as path
    return this.supabaseService.getPublicUrl('pet-photos', photoUrl);
  }
}
