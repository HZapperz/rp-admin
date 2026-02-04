import { Component, Input, Output, EventEmitter, OnInit, OnDestroy, ElementRef, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ClientService } from '../../../core/services/client.service';
import { environment } from '../../../../environments/environment';
import { loadStripe, Stripe, StripeElements, StripeCardElement } from '@stripe/stripe-js';

@Component({
  selector: 'app-payment-method-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './payment-method-modal.component.html',
  styleUrls: ['./payment-method-modal.component.scss']
})
export class PaymentMethodModalComponent implements OnInit, OnDestroy {
  @Input() clientId!: string;
  @Output() close = new EventEmitter<void>();
  @Output() paymentMethodAdded = new EventEmitter<void>();

  @ViewChild('cardElement') cardElementRef!: ElementRef;

  private stripe: Stripe | null = null;
  private elements: StripeElements | null = null;
  private cardElement: StripeCardElement | null = null;

  loading = true;
  saving = false;
  error = '';
  clientSecret = '';
  stripeCustomerId = '';

  constructor(private clientService: ClientService) {}

  async ngOnInit(): Promise<void> {
    try {
      console.log('Payment modal: Loading Stripe...');
      // Load Stripe
      this.stripe = await loadStripe(environment.stripePublishableKey);

      if (!this.stripe) {
        this.error = 'Failed to load Stripe';
        this.loading = false;
        return;
      }
      console.log('Payment modal: Stripe loaded successfully');

      // Get MOTO SetupIntent from API
      console.log('Payment modal: Creating SetupIntent for client:', this.clientId);
      console.log('Payment modal: API URL:', environment.apiUrl);
      const setupData = await this.clientService.createSetupIntentForClient(this.clientId);
      console.log('Payment modal: SetupIntent created successfully');
      this.clientSecret = setupData.clientSecret;
      this.stripeCustomerId = setupData.stripeCustomerId;

      // Now mount the payment element after we have the client secret
      // Use setTimeout to ensure the DOM is ready
      setTimeout(() => {
        this.mountPaymentElement();
      }, 0);

    } catch (err: any) {
      console.error('Payment modal: Error initializing payment form:', err);
      this.error = err.message || 'Failed to initialize payment form';
      this.loading = false;
    }
  }

  private async mountPaymentElement(): Promise<void> {
    if (!this.stripe || !this.clientSecret) {
      return;
    }

    try {
      console.log('Payment modal: Creating Stripe Elements...');

      // Create Stripe Elements (without clientSecret for Card Element)
      this.elements = this.stripe.elements({
        appearance: {
          theme: 'stripe',
          variables: {
            colorPrimary: '#667eea',
            colorBackground: '#ffffff',
            colorText: '#1a202c',
            colorDanger: '#dc2626',
            fontFamily: 'system-ui, -apple-system, sans-serif',
            borderRadius: '10px',
            spacingUnit: '4px'
          }
        }
      });

      // Create Card Element (simpler, no wallet integrations)
      this.cardElement = this.elements.create('card', {
        style: {
          base: {
            fontSize: '16px',
            color: '#1a202c',
            fontFamily: 'system-ui, -apple-system, sans-serif',
            '::placeholder': {
              color: '#a0aec0'
            }
          },
          invalid: {
            color: '#dc2626',
            iconColor: '#dc2626'
          }
        },
        hidePostalCode: false
      });

      const container = document.getElementById('payment-element-container');
      if (container) {
        this.cardElement.mount(container);
        console.log('Payment modal: Card element mounted successfully');
      } else {
        console.error('Payment modal: Container not found');
      }

      // Listen for errors on the card element
      this.cardElement.on('change', (event) => {
        if (event.error) {
          this.error = event.error.message || '';
        } else {
          this.error = '';
        }
      });

      this.loading = false;
    } catch (err: any) {
      console.error('Error mounting card element:', err);
      this.error = 'Failed to load payment form';
      this.loading = false;
    }
  }

  ngOnDestroy(): void {
    if (this.cardElement) {
      this.cardElement.unmount();
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

  async submitPayment(): Promise<void> {
    if (!this.stripe || !this.cardElement) {
      this.error = 'Payment form not ready';
      return;
    }

    this.saving = true;
    this.error = '';

    try {
      console.log('Payment modal: Confirming card setup...');

      // Confirm the SetupIntent with the Card Element
      const { setupIntent, error: setupError } = await this.stripe.confirmCardSetup(
        this.clientSecret,
        {
          payment_method: {
            card: this.cardElement
          }
        }
      );

      if (setupError) {
        console.error('Payment modal: Setup error:', setupError);
        this.error = setupError.message || 'Failed to save card';
        this.saving = false;
        return;
      }

      if (!setupIntent || !setupIntent.payment_method) {
        this.error = 'Failed to get payment method';
        this.saving = false;
        return;
      }

      console.log('Payment modal: Card setup confirmed, saving to database...');

      // Save the payment method to the database
      const paymentMethodId = typeof setupIntent.payment_method === 'string'
        ? setupIntent.payment_method
        : setupIntent.payment_method.id;

      await this.clientService.saveClientPaymentMethod(
        this.clientId,
        paymentMethodId,
        this.stripeCustomerId,
        true // set as default
      );

      console.log('Payment modal: Payment method saved successfully');
      this.paymentMethodAdded.emit();
      this.close.emit();

    } catch (err: any) {
      console.error('Error saving payment method:', err);
      this.error = err.message || 'Failed to save payment method';
    } finally {
      this.saving = false;
    }
  }
}
