import { Component, EventEmitter, Input, OnInit, Output, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { ClientService } from '../../../../../core/services/client.service';

export interface PaymentConfig {
  payment_type: 'use_saved_card' | 'cash_on_service';
  payment_method_id?: string;
  original_amount: number;
  discount_amount: number;
  final_amount: number;
  discount_reason?: string;
}

export interface PaymentMethod {
  id: string;
  brand: string;
  last4: string;
  exp_month: number;
  exp_year: number;
  is_default: boolean;
}

@Component({
  selector: 'app-payment-summary',
  standalone: true,
  imports: [CommonModule, FormsModule, MatIconModule],
  templateUrl: './payment-summary.component.html',
  styleUrls: ['./payment-summary.component.scss']
})
export class PaymentSummaryComponent implements OnInit, OnChanges {
  @Input() selectedClient: any = null;
  @Input() selectedPets: any[] = [];
  @Input() petServices: any[] = [];
  @Input() selectedGroomer: any = null;
  @Input() selectedDateTime: any = null;
  @Input() selectedAddress: any = null;
  @Output() paymentConfigured = new EventEmitter<PaymentConfig>();

  paymentType: 'use_saved_card' | 'cash_on_service' = 'use_saved_card';
  selectedPaymentMethod: PaymentMethod | null = null;
  paymentMethods: PaymentMethod[] = [];

  originalAmount: number = 0;
  discountAmount: number = 0;
  discountReason: string = '';

  isLoadingPaymentMethods = false;

  constructor(private clientService: ClientService) {}

  ngOnInit(): void {
    this.calculateTotals();
    if (this.selectedClient) {
      this.loadPaymentMethods();
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['petServices'] || changes['selectedClient']) {
      this.calculateTotals();

      // Load payment methods if client changes
      if (changes['selectedClient'] && this.selectedClient) {
        this.loadPaymentMethods();
      }
    }
  }

  calculateTotals(): void {
    this.originalAmount = this.petServices.reduce((sum, ps) => sum + ps.price, 0);
    this.emitPaymentConfig();
  }

  async loadPaymentMethods(): Promise<void> {
    if (!this.selectedClient?.id) {
      return;
    }

    try {
      this.isLoadingPaymentMethods = true;
      console.log('Loading payment methods for client:', this.selectedClient.id);

      const methods = await this.clientService.getClientPaymentMethods(this.selectedClient.id);
      console.log('Loaded payment methods:', methods);

      this.paymentMethods = methods;

      // Auto-select default payment method and set payment type
      if (methods.length > 0) {
        const defaultMethod = methods.find(m => m.is_default) || methods[0];
        this.selectedPaymentMethod = defaultMethod;
        this.paymentType = 'use_saved_card';
      } else {
        // No saved cards, default to cash on service
        this.paymentType = 'cash_on_service';
      }
      this.emitPaymentConfig();

      this.isLoadingPaymentMethods = false;
    } catch (err) {
      console.error('Error loading payment methods:', err);
      this.isLoadingPaymentMethods = false;
    }
  }

  onPaymentTypeChange(type: 'use_saved_card' | 'cash_on_service'): void {
    this.paymentType = type;

    if (type !== 'use_saved_card') {
      this.selectedPaymentMethod = null;
    }

    this.emitPaymentConfig();
  }

  selectPaymentMethod(method: PaymentMethod): void {
    this.selectedPaymentMethod = method;
    this.emitPaymentConfig();
  }

  onDiscountChange(): void {
    // Ensure discount doesn't exceed original amount
    if (this.discountAmount > this.originalAmount) {
      this.discountAmount = this.originalAmount;
    }
    if (this.discountAmount < 0) {
      this.discountAmount = 0;
    }
    this.emitPaymentConfig();
  }

  getFinalAmount(): number {
    return Math.max(0, this.originalAmount - this.discountAmount);
  }

  emitPaymentConfig(): void {
    const config: PaymentConfig = {
      payment_type: this.paymentType,
      payment_method_id: this.selectedPaymentMethod?.id,
      original_amount: this.originalAmount,
      discount_amount: this.discountAmount,
      final_amount: this.getFinalAmount(),
      discount_reason: this.discountReason || undefined
    };

    this.paymentConfigured.emit(config);
  }

  getCardBrandName(brand: string): string {
    const brands: Record<string, string> = {
      'visa': 'Visa',
      'mastercard': 'Mastercard',
      'amex': 'American Express',
      'discover': 'Discover'
    };
    return brands[brand.toLowerCase()] || brand;
  }

  formatCurrency(amount: number): string {
    return `$${amount.toFixed(2)}`;
  }

  formatDate(dateString: string): string {
    if (!dateString) return 'Not selected';
    const date = new Date(dateString + 'T00:00:00Z');
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      timeZone: 'UTC'
    });
  }

  isValid(): boolean {
    // Check if all required data is present
    if (!this.selectedClient || !this.selectedPets.length || !this.petServices.length ||
        !this.selectedGroomer || !this.selectedDateTime || !this.selectedAddress) {
      return false;
    }

    // If using saved card, must have payment method selected
    if (this.paymentType === 'use_saved_card' && !this.selectedPaymentMethod) {
      return false;
    }

    return true;
  }
}
