import { Component, EventEmitter, Input, OnInit, Output, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { ClientService, Pet } from '../../../../../core/services/client.service';
import { SupabaseService } from '../../../../../core/services/supabase.service';

@Component({
  selector: 'app-select-pets',
  standalone: true,
  imports: [CommonModule, MatIconModule],
  templateUrl: './select-pets.component.html',
  styleUrls: ['./select-pets.component.scss']
})
export class SelectPetsComponent implements OnInit, OnChanges {
  @Input() selectedClient: any = null;
  @Output() petsSelected = new EventEmitter<Pet[]>();

  pets: Pet[] = [];
  selectedPets: Pet[] = [];
  isLoading = false;
  error: string | null = null;

  constructor(
    private clientService: ClientService,
    private supabaseService: SupabaseService
  ) {}

  ngOnInit(): void {
    if (this.selectedClient) {
      this.loadPets();
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['selectedClient'] && this.selectedClient) {
      this.loadPets();
      // Reset selections when client changes
      this.selectedPets = [];
      this.petsSelected.emit([]);
    }
  }

  async loadPets(): Promise<void> {
    if (!this.selectedClient?.id) {
      return;
    }

    try {
      this.isLoading = true;
      this.error = null;

      this.pets = await this.clientService.getClientPets(this.selectedClient.id);
      this.isLoading = false;
    } catch (err) {
      console.error('Error loading pets:', err);
      this.error = 'Failed to load pets';
      this.isLoading = false;
    }
  }

  isPetSelected(pet: Pet): boolean {
    return this.selectedPets.some(p => p.id === pet.id);
  }

  togglePetSelection(pet: Pet): void {
    const index = this.selectedPets.findIndex(p => p.id === pet.id);

    if (index > -1) {
      // Remove from selection
      this.selectedPets.splice(index, 1);
    } else {
      // Add to selection
      this.selectedPets.push(pet);
    }

    this.petsSelected.emit([...this.selectedPets]);
  }

  getSizeLabel(size?: string): string {
    if (!size) return 'Unknown';
    const labels: Record<string, string> = {
      'small': 'Small',
      'medium': 'Medium',
      'large': 'Large',
      'xl': 'XL'
    };
    return labels[size] || size;
  }

  getSizeBadgeClass(size?: string): string {
    if (!size) return '';
    const classes: Record<string, string> = {
      'small': 'size-small',
      'medium': 'size-medium',
      'large': 'size-large',
      'xl': 'size-xl'
    };
    return classes[size] || '';
  }

  getInitials(name: string): string {
    return name.charAt(0).toUpperCase();
  }

  getPetPhotoUrl(photoUrl: string | undefined): string | null {
    if (!photoUrl) return null;
    
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
