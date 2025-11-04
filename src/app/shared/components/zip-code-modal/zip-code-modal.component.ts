import { Component, EventEmitter, Input, Output, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ServiceAreaService } from '../../../core/services/service-area.service';
import { ServiceAreaZipCode } from '../../../core/models/types';

@Component({
  selector: 'app-zip-code-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './zip-code-modal.component.html',
  styleUrls: ['./zip-code-modal.component.scss']
})
export class ZipCodeModalComponent implements OnInit {
  @Input() zipCode: ServiceAreaZipCode | null = null; // For edit mode
  @Output() close = new EventEmitter<void>();
  @Output() zipCodeSaved = new EventEmitter<void>();

  loading = false;
  saving = false;
  error = '';
  success = '';

  formData = {
    zip_code: '',
    city: '',
    state: 'TX',
    notes: ''
  };

  isEditMode = false;

  constructor(private serviceAreaService: ServiceAreaService) {}

  ngOnInit() {
    // If zipCode input is provided, we're in edit mode
    if (this.zipCode) {
      this.isEditMode = true;
      this.formData = {
        zip_code: this.zipCode.zip_code,
        city: this.zipCode.city,
        state: this.zipCode.state,
        notes: this.zipCode.notes || ''
      };
    }
  }

  async saveZipCode() {
    // Reset messages
    this.error = '';
    this.success = '';

    // Validate form
    if (!this.validateForm()) {
      return;
    }

    this.saving = true;

    try {
      if (this.isEditMode && this.zipCode) {
        // Update existing zip code
        await this.serviceAreaService
          .updateZipCode(this.zipCode.id, {
            zip_code: this.formData.zip_code,
            city: this.formData.city,
            state: this.formData.state,
            notes: this.formData.notes || undefined
          })
          .toPromise();

        this.success = 'Zip code updated successfully!';
      } else {
        // Add new zip code
        await this.serviceAreaService
          .addZipCode(
            this.formData.zip_code,
            this.formData.city,
            this.formData.state,
            this.formData.notes || undefined
          )
          .toPromise();

        this.success = 'Zip code added successfully!';
      }

      // Emit success event
      this.zipCodeSaved.emit();

      // Close modal after a short delay
      setTimeout(() => {
        this.closeModal();
      }, 1000);
    } catch (err: any) {
      this.error = err.message || 'Failed to save zip code';
    } finally {
      this.saving = false;
    }
  }

  validateForm(): boolean {
    // Validate zip code
    if (!this.formData.zip_code.trim()) {
      this.error = 'Zip code is required';
      return false;
    }

    if (!this.serviceAreaService.validateZipCode(this.formData.zip_code)) {
      this.error = 'Invalid zip code format. Must be 5 digits.';
      return false;
    }

    // Validate city
    if (!this.formData.city.trim()) {
      this.error = 'City is required';
      return false;
    }

    // Validate state
    if (!this.formData.state.trim()) {
      this.error = 'State is required';
      return false;
    }

    return true;
  }

  closeModal() {
    if (this.saving) return;
    this.close.emit();
  }

  onOverlayClick(event: MouseEvent) {
    // Close modal when clicking on overlay (not the content)
    if (event.target === event.currentTarget) {
      this.closeModal();
    }
  }
}
