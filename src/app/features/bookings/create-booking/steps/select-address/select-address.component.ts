import { Component, EventEmitter, Input, OnInit, Output, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { ClientService, Address } from '../../../../../core/services/client.service';

@Component({
  selector: 'app-select-address',
  standalone: true,
  imports: [CommonModule, MatIconModule],
  templateUrl: './select-address.component.html',
  styleUrls: ['./select-address.component.scss']
})
export class SelectAddressComponent implements OnInit, OnChanges {
  @Input() selectedClient: any = null;
  @Output() addressSelected = new EventEmitter<Address>();

  addresses: Address[] = [];
  selectedAddress: Address | null = null;
  isLoading = false;
  error: string | null = null;

  constructor(private clientService: ClientService) {}

  ngOnInit(): void {
    if (this.selectedClient) {
      this.loadAddresses();
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['selectedClient'] && this.selectedClient) {
      this.loadAddresses();
      // Reset selection when client changes
      this.selectedAddress = null;
      this.addressSelected.emit(null as any);
    }
  }

  async loadAddresses(): Promise<void> {
    if (!this.selectedClient?.id) {
      console.warn('No client selected or client ID missing');
      return;
    }

    try {
      this.isLoading = true;
      this.error = null;

      console.log('Loading addresses for client:', this.selectedClient);
      console.log('Client ID:', this.selectedClient.id);

      this.addresses = await this.clientService.getClientAddresses(this.selectedClient.id);

      console.log('Loaded addresses:', this.addresses);
      console.log('Address count:', this.addresses.length);

      // Auto-select default address if exists
      const defaultAddress = this.addresses.find(a => a.is_default);
      if (defaultAddress) {
        this.selectAddress(defaultAddress);
      }

      this.isLoading = false;
    } catch (err) {
      console.error('Error loading addresses:', err);
      this.error = 'Failed to load addresses. Please check the console for details.';
      this.isLoading = false;
    }
  }

  selectAddress(address: Address): void {
    this.selectedAddress = address;
    this.addressSelected.emit(address);
  }

  getAddressTypeLabel(type: string): string {
    const labels: Record<string, string> = {
      'home': 'Home',
      'work': 'Work',
      'other': 'Other'
    };
    return labels[type] || type;
  }

  getAddressTypeBadgeClass(type: string): string {
    const classes: Record<string, string> = {
      'home': 'type-home',
      'work': 'type-work',
      'other': 'type-other'
    };
    return classes[type] || '';
  }

  formatAddress(address: Address): string {
    const parts = [
      address.building,
      address.floor,
      address.street,
      address.city,
      address.state,
      address.zip_code
    ].filter(Boolean);

    return parts.join(', ');
  }

  getAddressIcon(type: string): string {
    const icons: Record<string, string> = {
      'home': '🏠',
      'work': '🏢',
      'other': '📍'
    };
    return icons[type] || '📍';
  }
}
