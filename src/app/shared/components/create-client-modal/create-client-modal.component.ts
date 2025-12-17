import { Component, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ClientService } from '../../../core/services/client.service';

@Component({
  selector: 'app-create-client-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './create-client-modal.component.html',
  styleUrls: ['./create-client-modal.component.scss']
})
export class CreateClientModalComponent {
  @Output() close = new EventEmitter<void>();
  @Output() clientCreated = new EventEmitter<string>();

  formData = {
    firstName: '',
    lastName: '',
    email: '',
    phone: ''
  };

  saving = false;
  error = '';

  constructor(private clientService: ClientService) {}

  closeModal(): void {
    if (!this.saving) {
      this.close.emit();
    }
  }

  stopPropagation(event: Event): void {
    event.stopPropagation();
  }

  formatPhoneNumber(): void {
    // Remove all non-digit characters
    let digits = this.formData.phone.replace(/\D/g, '');

    // Limit to 10 digits
    digits = digits.substring(0, 10);

    // Format as (XXX) XXX-XXXX
    if (digits.length >= 6) {
      this.formData.phone = `(${digits.substring(0, 3)}) ${digits.substring(3, 6)}-${digits.substring(6)}`;
    } else if (digits.length >= 3) {
      this.formData.phone = `(${digits.substring(0, 3)}) ${digits.substring(3)}`;
    } else if (digits.length > 0) {
      this.formData.phone = `(${digits}`;
    } else {
      this.formData.phone = '';
    }
  }

  validateForm(): boolean {
    this.error = '';

    if (!this.formData.firstName.trim()) {
      this.error = 'First name is required';
      return false;
    }

    if (!this.formData.lastName.trim()) {
      this.error = 'Last name is required';
      return false;
    }

    if (!this.formData.email.trim()) {
      this.error = 'Email is required';
      return false;
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(this.formData.email)) {
      this.error = 'Please enter a valid email address';
      return false;
    }

    return true;
  }

  async createClient(): Promise<void> {
    if (!this.validateForm()) {
      return;
    }

    this.saving = true;
    this.error = '';

    try {
      const result = await this.clientService.createClient({
        firstName: this.formData.firstName.trim(),
        lastName: this.formData.lastName.trim(),
        email: this.formData.email.trim().toLowerCase(),
        phone: this.formData.phone.trim() || undefined
      });

      if (result?.id) {
        this.clientCreated.emit(result.id);
        this.close.emit();
      }
    } catch (err: any) {
      this.error = err.message || 'Failed to create client';
    } finally {
      this.saving = false;
    }
  }
}
