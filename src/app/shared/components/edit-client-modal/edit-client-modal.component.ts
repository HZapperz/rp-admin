import { Component, Input, Output, EventEmitter, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ClientService, ClientWithStats } from '../../../core/services/client.service';

@Component({
  selector: 'app-edit-client-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './edit-client-modal.component.html',
  styleUrls: ['./edit-client-modal.component.scss']
})
export class EditClientModalComponent implements OnInit {
  @Input() client!: ClientWithStats;
  @Output() close = new EventEmitter<void>();
  @Output() clientUpdated = new EventEmitter<void>();

  formData = {
    firstName: '',
    lastName: '',
    email: '',
    phone: ''
  };

  originalEmail = '';
  saving = false;
  error = '';

  constructor(private clientService: ClientService) {}

  ngOnInit(): void {
    this.formData = {
      firstName: this.client.first_name || '',
      lastName: this.client.last_name || '',
      email: this.client.email || '',
      phone: this.client.phone || ''
    };
    this.originalEmail = this.client.email?.toLowerCase() || '';
  }

  get emailChanged(): boolean {
    return this.formData.email.toLowerCase().trim() !== this.originalEmail;
  }

  closeModal(): void {
    if (!this.saving) {
      this.close.emit();
    }
  }

  stopPropagation(event: Event): void {
    event.stopPropagation();
  }

  formatPhoneNumber(): void {
    let digits = this.formData.phone.replace(/\D/g, '');
    digits = digits.substring(0, 10);

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

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(this.formData.email)) {
      this.error = 'Please enter a valid email address';
      return false;
    }

    return true;
  }

  async updateClient(): Promise<void> {
    if (!this.validateForm()) {
      return;
    }

    this.saving = true;
    this.error = '';

    try {
      await this.clientService.updateClient(this.client.id, {
        firstName: this.formData.firstName.trim(),
        lastName: this.formData.lastName.trim(),
        email: this.formData.email.trim().toLowerCase(),
        phone: this.formData.phone.trim() || undefined
      });

      this.clientUpdated.emit();
      this.close.emit();
    } catch (err: any) {
      this.error = err.message || 'Failed to update client';
    } finally {
      this.saving = false;
    }
  }
}
