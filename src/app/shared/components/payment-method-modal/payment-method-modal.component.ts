import { Component, Input, Output, EventEmitter, OnInit, OnDestroy, ElementRef, ViewChild, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ClientService } from '../../../core/services/client.service';
import { environment } from '../../../../environments/environment';
import { loadStripe, Stripe, StripeElements, StripePaymentElement } from '@stripe/stripe-js';

@Component({
  selector: 'app-payment-method-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './payment-method-modal.component.html',
  styleUrls: ['./payment-method-modal.component.scss']
})
export class PaymentMethodModalComponent implements OnInit, AfterViewInit, OnDestroy {
  @Input() clientId!: string;
  @Output() close = new EventEmitter<void>();
  @Output() paymentMethodAdded = new EventEmitter<void>();

  @ViewChild('paymentElement') paymentElementRef!: ElementRef;

  private stripe: Stripe | null = null;
  private elements: StripeElements | null = null;
  private paymentElement: StripePaymentElement | null = null;

  loading = true;
  saving = false;
  error = '';
  clientSecret = '';
  stripeCustomerId = '';

  constructor(private clientService: ClientService) {}

  async ngOnInit(): Promise<void> {
    try {
      // Load Stripe
      this.stripe = await loadStripe(environment.stripePublishableKey);

      if (!this.stripe) {
        this.error = 'Failed to load Stripe';
        this.loading = false;
        return;
      }

      // Get MOTO SetupIntent from API
      const setupData = await this.clientService.createSetupIntentForClient(this.clientId);
      this.clientSecret = setupData.clientSecret;
      this.stripeCustomerId = setupData.stripeCustomerId;

    } catch (err: any) {
      console.error('Error initializing payment form:', err);
      this.error = err.message || 'Failed to initialize payment form';
      this.loading = false;
    }
  }

  async ngAfterViewInit(): Promise<void> {
    // Wait a tick for the view to be ready
    setTimeout(async () => {
      await this.mountPaymentElement();
    }, 100);
  }

  private async mountPaymentElement(): Promise<void> {
    if (!this.stripe || !this.clientSecret) {
      return;
    }

    try {
      // Create Stripe Elements with the client secret
      this.elements = this.stripe.elements({
        clientSecret: this.clientSecret,
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
          },
          rules: {
            '.Input': {
              border: '2px solid #e2e8f0',
              padding: '12px 16px',
            },
            '.Input:focus': {
              border: '2px solid #667eea',
              boxShadow: '0 0 0 3px rgba(102, 126, 234, 0.1)'
            }
          }
        }
      });

      // Create and mount the Payment Element
      this.paymentElement = this.elements.create('payment', {
        layout: 'tabs'
      });

      const container = document.getElementById('payment-element-container');
      if (container) {
        this.paymentElement.mount(container);
      }

      this.loading = false;
    } catch (err: any) {
      console.error('Error mounting payment element:', err);
      this.error = 'Failed to load payment form';
      this.loading = false;
    }
  }

  ngOnDestroy(): void {
    if (this.paymentElement) {
      this.paymentElement.unmount();
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
    if (!this.stripe || !this.elements) {
      this.error = 'Payment form not ready';
      return;
    }

    this.saving = true;
    this.error = '';

    try {
      // Confirm the SetupIntent
      const { setupIntent, error: setupError } = await this.stripe.confirmSetup({
        elements: this.elements,
        redirect: 'if_required',
        confirmParams: {
          return_url: window.location.href
        }
      });

      if (setupError) {
        this.error = setupError.message || 'Failed to save card';
        this.saving = false;
        return;
      }

      if (!setupIntent || !setupIntent.payment_method) {
        this.error = 'Failed to get payment method';
        this.saving = false;
        return;
      }

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
