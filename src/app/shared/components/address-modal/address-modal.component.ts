import { Component, Input, Output, EventEmitter, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ClientService, Address, AddressFormData } from '../../../core/services/client.service';

@Component({
  selector: 'app-address-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './address-modal.component.html',
  styleUrls: ['./address-modal.component.scss']
})
export class AddressModalComponent implements OnInit {
  @Input() clientId!: string;
  @Input() address?: Address; // If provided, editing mode
  @Output() close = new EventEmitter<void>();
  @Output() addressSaved = new EventEmitter<void>();

  formData: AddressFormData = {
    name: '',
    building: '',
    apartment: '',
    floor: '',
    street: '',
    city: '',
    state: 'TX',
    zip_code: '',
    additional_info: '',
    address_type: 'home',
    is_default: false
  };

  saving = false;
  error = '';

  get isEditMode(): boolean {
    return !!this.address;
  }

  constructor(private clientService: ClientService) {}

  ngOnInit(): void {
    if (this.address) {
      this.formData = {
        name: this.address.name || '',
        building: this.address.building || '',
        apartment: this.address.apartment || '',
        floor: this.address.floor || '',
        street: this.address.street || '',
        city: this.address.city || '',
        state: this.address.state || 'TX',
        zip_code: this.address.zip_code || '',
        additional_info: this.address.additional_info || '',
        address_type: this.address.address_type || 'home',
        is_default: this.address.is_default || false
      };
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

  validateForm(): boolean {
    this.error = '';

    if (!this.formData.name?.trim()) {
      this.error = 'Address name is required (e.g., "Home", "Office")';
      return false;
    }

    if (!this.formData.street?.trim()) {
      this.error = 'Street address is required';
      return false;
    }

    if (!this.formData.city?.trim()) {
      this.error = 'City is required';
      return false;
    }

    if (!this.formData.state?.trim()) {
      this.error = 'State is required';
      return false;
    }

    if (!this.formData.zip_code?.trim()) {
      this.error = 'ZIP code is required';
      return false;
    }

    return true;
  }

  async saveAddress(): Promise<void> {
    if (!this.validateForm()) {
      return;
    }

    this.saving = true;
    this.error = '';

    try {
      if (this.isEditMode && this.address) {
        await this.clientService.updateClientAddress(this.address.id, this.formData);
      } else {
        await this.clientService.createClientAddress(this.clientId, this.formData);
      }

      this.addressSaved.emit();
      this.close.emit();
    } catch (err: any) {
      this.error = err.message || 'Failed to save address';
    } finally {
      this.saving = false;
    }
  }
}
