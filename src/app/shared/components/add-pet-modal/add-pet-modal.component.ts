import { Component, Input, Output, EventEmitter, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ClientService, Pet } from '../../../core/services/client.service';
import { DOG_BREEDS, searchBreeds } from '../../data/dog-breeds';
import { SupabaseService } from '../../../core/services/supabase.service';

@Component({
  selector: 'app-add-pet-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './add-pet-modal.component.html',
  styleUrls: ['./add-pet-modal.component.scss']
})
export class AddPetModalComponent implements OnInit {
  @Input() clientId!: string;
  @Input() pet?: Pet; // Optional pet for edit mode
  @Output() close = new EventEmitter<void>();
  @Output() petAdded = new EventEmitter<void>();
  @Output() petUpdated = new EventEmitter<void>();

  currentStep = 1;
  totalSteps = 5;

  // Track if we're in edit mode
  get isEditMode(): boolean {
    return !!this.pet;
  }

  // Existing file URLs (for edit mode)
  existingPhotoUrl: string | null = null;
  existingRabiesUrl: string | null = null;

  // Form data matching client wizard structure
  formData = {
    // Step 1: Basic Info
    name: '',
    photo: null as File | null,

    // Step 2: Breed & Size
    breed: '',
    dateOfBirth: '',
    sizeCategory: 'medium' as 'small' | 'medium' | 'large' | 'xl',

    // Step 3: Health
    hasAllergies: null as boolean | null,
    allergyDetails: '',
    hasSkinConditions: null as boolean | null,
    skinConditionDetails: '',

    // Step 4: Behavior
    isFriendly: null as boolean | null,
    blowDryerReaction: '',
    waterReaction: '',
    hasBehavioralIssues: null as boolean | null,
    behavioralIssueDetails: '',

    // Step 5: Documentation
    rabiesCertificate: null as File | null,
    rabiesPending: false,
    additionalNotes: ''
  };

  // UI state
  saving = false;
  error = '';
  photoPreview: string | null = null;
  rabiesPreview: string | null = null;

  // Breed search
  breedSearchQuery = '';
  breedSearchResults: string[] = [];
  showBreedDropdown = false;

  // Validation errors per step
  stepErrors: { [key: number]: string } = {};

  constructor(
    private clientService: ClientService,
    private supabaseService: SupabaseService
  ) {}

  ngOnInit(): void {
    if (this.pet) {
      // Pre-populate form with existing pet data
      this.formData = {
        name: this.pet.name || '',
        photo: null,
        breed: this.pet.breed || '',
        dateOfBirth: this.pet.date_of_birth || '',
        sizeCategory: this.pet.size_category || 'medium',
        hasAllergies: this.pet.has_allergies ?? null,
        allergyDetails: this.pet.allergy_details || '',
        hasSkinConditions: this.pet.has_skin_conditions ?? null,
        skinConditionDetails: this.pet.skin_condition_details || '',
        isFriendly: this.pet.is_friendly ?? null,
        blowDryerReaction: this.pet.blow_dryer_reaction || '',
        waterReaction: this.pet.water_reaction || '',
        hasBehavioralIssues: this.pet.has_behavioral_issues ?? null,
        behavioralIssueDetails: this.pet.behavioral_issue_details || '',
        rabiesCertificate: null,
        rabiesPending: false, // Will be determined by existing URL
        additionalNotes: this.pet.additional_notes || ''
      };

      // Set breed search query for display
      this.breedSearchQuery = this.pet.breed || '';

      // Store existing file URLs
      if (this.pet.photo_url) {
        this.existingPhotoUrl = this.pet.photo_url;
        this.photoPreview = this.getPublicUrl(this.pet.photo_url);
      }

      if (this.pet.rabies_certificate_url) {
        this.existingRabiesUrl = this.pet.rabies_certificate_url;
        this.rabiesPreview = 'Existing certificate';
      }
    }
  }

  // Helper to get public URL for existing files
  private getPublicUrl(storagePath: string): string {
    if (storagePath.startsWith('http://') || storagePath.startsWith('https://')) {
      return storagePath;
    }
    const parts = storagePath.split('/');
    if (parts.length >= 2) {
      const bucket = parts[0];
      const path = parts.slice(1).join('/');
      return this.supabaseService.getPublicUrl(bucket, path);
    }
    return storagePath;
  }

  // Step navigation
  nextStep(): void {
    if (this.validateCurrentStep()) {
      this.stepErrors[this.currentStep] = '';
      if (this.currentStep < this.totalSteps) {
        this.currentStep++;
      }
    }
  }

  prevStep(): void {
    if (this.currentStep > 1) {
      this.currentStep--;
    }
  }

  goToStep(step: number): void {
    // Only allow going back, not forward (must validate to go forward)
    if (step < this.currentStep) {
      this.currentStep = step;
    }
  }

  // Validation per step
  validateCurrentStep(): boolean {
    switch (this.currentStep) {
      case 1:
        if (!this.formData.name.trim()) {
          this.stepErrors[1] = 'Pet name is required';
          return false;
        }
        return true;

      case 2:
        if (!this.formData.breed) {
          this.stepErrors[2] = 'Please select a breed';
          return false;
        }
        if (!this.formData.sizeCategory) {
          this.stepErrors[2] = 'Please select a size';
          return false;
        }
        return true;

      case 3:
        if (this.formData.hasAllergies === null) {
          this.stepErrors[3] = 'Please indicate if your pet has allergies';
          return false;
        }
        if (this.formData.hasAllergies && !this.formData.allergyDetails.trim()) {
          this.stepErrors[3] = 'Please provide allergy details';
          return false;
        }
        if (this.formData.hasSkinConditions === null) {
          this.stepErrors[3] = 'Please indicate if your pet has skin conditions';
          return false;
        }
        if (this.formData.hasSkinConditions && !this.formData.skinConditionDetails.trim()) {
          this.stepErrors[3] = 'Please provide skin condition details';
          return false;
        }
        return true;

      case 4:
        if (this.formData.isFriendly === null) {
          this.stepErrors[4] = 'Please indicate if your pet is friendly';
          return false;
        }
        if (this.formData.isFriendly === false) {
          this.stepErrors[4] = 'We only accept friendly dogs at this time';
          return false;
        }
        if (this.formData.hasBehavioralIssues === null) {
          this.stepErrors[4] = 'Please indicate if your pet has behavioral issues';
          return false;
        }
        if (this.formData.hasBehavioralIssues && !this.formData.behavioralIssueDetails.trim()) {
          this.stepErrors[4] = 'Please provide behavioral issue details';
          return false;
        }
        return true;

      case 5:
        // In edit mode, existing certificate is acceptable
        const hasExistingCert = this.isEditMode && this.existingRabiesUrl;
        if (!this.formData.rabiesCertificate && !this.formData.rabiesPending && !hasExistingCert) {
          this.stepErrors[5] = 'Please upload a rabies certificate or mark as pending';
          return false;
        }
        return true;

      default:
        return true;
    }
  }

  // Breed search
  onBreedSearch(): void {
    this.breedSearchResults = searchBreeds(this.breedSearchQuery);
    this.showBreedDropdown = true;
  }

  selectBreed(breed: string): void {
    this.formData.breed = breed;
    this.breedSearchQuery = breed;
    this.showBreedDropdown = false;
  }

  onBreedInputFocus(): void {
    this.breedSearchResults = searchBreeds(this.breedSearchQuery);
    this.showBreedDropdown = true;
  }

  onBreedInputBlur(): void {
    // Delay to allow click on dropdown item
    setTimeout(() => {
      this.showBreedDropdown = false;
    }, 200);
  }

  // File handling
  onPhotoSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files[0]) {
      this.formData.photo = input.files[0];
      this.photoPreview = URL.createObjectURL(input.files[0]);
    }
  }

  onRabiesCertSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files[0]) {
      this.formData.rabiesCertificate = input.files[0];
      this.formData.rabiesPending = false;
      this.rabiesPreview = input.files[0].name;
    }
  }

  removePhoto(): void {
    this.formData.photo = null;
    this.photoPreview = null;
    this.existingPhotoUrl = null; // Also clear existing URL in edit mode
  }

  removeRabiesCert(): void {
    this.formData.rabiesCertificate = null;
    this.rabiesPreview = null;
    this.existingRabiesUrl = null; // Also clear existing URL in edit mode
  }

  onRabiesPendingChange(): void {
    if (this.formData.rabiesPending) {
      this.formData.rabiesCertificate = null;
      this.rabiesPreview = null;
      this.existingRabiesUrl = null;
    }
  }

  // Submit
  async submitPet(): Promise<void> {
    if (!this.validateCurrentStep()) return;

    this.saving = true;
    this.error = '';

    try {
      // Upload new files if provided
      let photoUrl: string | null | undefined = undefined;
      let rabiesUrl: string | null | undefined = undefined;

      // Handle photo: new upload, keep existing, or remove
      if (this.formData.photo) {
        // New photo uploaded
        photoUrl = await this.clientService.uploadFile(
          this.formData.photo,
          'pet-photos',
          this.clientId
        );
      } else if (this.existingPhotoUrl) {
        // Keep existing photo
        photoUrl = this.existingPhotoUrl;
      } else {
        // No photo (removed or never had one)
        photoUrl = null;
      }

      // Handle rabies certificate: new upload, keep existing, or remove
      if (this.formData.rabiesCertificate) {
        // New certificate uploaded
        rabiesUrl = await this.clientService.uploadFile(
          this.formData.rabiesCertificate,
          'pet-certificates',
          this.clientId
        );
      } else if (this.existingRabiesUrl && !this.formData.rabiesPending) {
        // Keep existing certificate
        rabiesUrl = this.existingRabiesUrl;
      } else {
        // No certificate (removed or marked pending)
        rabiesUrl = null;
      }

      const petData = {
        name: this.formData.name,
        breed: this.formData.breed,
        date_of_birth: this.formData.dateOfBirth || undefined,
        size_category: this.formData.sizeCategory,
        photo_url: photoUrl,
        rabies_certificate_url: rabiesUrl,
        rabies_pending: this.formData.rabiesPending,
        has_allergies: this.formData.hasAllergies || false,
        allergy_details: this.formData.allergyDetails,
        has_skin_conditions: this.formData.hasSkinConditions || false,
        skin_condition_details: this.formData.skinConditionDetails,
        is_friendly: this.formData.isFriendly ?? true,
        blow_dryer_reaction: this.formData.blowDryerReaction,
        water_reaction: this.formData.waterReaction,
        has_behavioral_issues: this.formData.hasBehavioralIssues || false,
        behavioral_issue_details: this.formData.behavioralIssueDetails,
        additional_notes: this.formData.additionalNotes
      };

      if (this.isEditMode && this.pet) {
        // Update existing pet
        await this.clientService.updatePet(this.clientId, this.pet.id, petData);
        this.petUpdated.emit();
      } else {
        // Create new pet
        await this.clientService.createPet(this.clientId, petData);
        this.petAdded.emit();
      }

      this.close.emit();
    } catch (err) {
      console.error('Error saving pet:', err);
      this.error = err instanceof Error ? err.message : 'Failed to save pet';
    } finally {
      this.saving = false;
    }
  }

  closeModal(): void {
    if (!this.saving) {
      this.close.emit();
    }
  }

  stopPropagation(event: Event): void {
    event.stopPropagation();
  }
}
