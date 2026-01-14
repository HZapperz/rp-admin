import { Component, OnInit, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { MatStepperModule, MatStepper } from '@angular/material/stepper';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatCardModule } from '@angular/material/card';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { AdminBookingService, AdminBookingRequest, PetBooking, PricingOverride } from '../../../core/services/admin-booking.service';
import { SelectClientComponent } from './steps/select-client/select-client.component';
import { SelectPetsComponent } from './steps/select-pets/select-pets.component';
import { SelectServiceComponent, PetServiceSelection } from './steps/select-service/select-service.component';
import { SelectGroomerComponent } from './steps/select-groomer/select-groomer.component';
import { SelectDateTimeComponent, DateTimeSelection } from './steps/select-date-time/select-date-time.component';
import { SelectAddressComponent } from './steps/select-address/select-address.component';
import { PaymentSummaryComponent, PaymentConfig } from './steps/payment-summary/payment-summary.component';

@Component({
  selector: 'app-create-booking',
  standalone: true,
  imports: [
    CommonModule,
    MatStepperModule,
    MatButtonModule,
    MatIconModule,
    MatCardModule,
    MatProgressBarModule,
    SelectClientComponent,
    SelectPetsComponent,
    SelectServiceComponent,
    SelectGroomerComponent,
    SelectDateTimeComponent,
    SelectAddressComponent,
    PaymentSummaryComponent
  ],
  templateUrl: './create-booking.component.html',
  styleUrls: ['./create-booking.component.scss']
})
export class CreateBookingComponent implements OnInit {
  @ViewChild('stepper') stepper!: MatStepper;

  // Booking data accumulated through wizard steps
  bookingData: Partial<AdminBookingRequest> = {};

  // Selected data for display
  selectedClient: any = null;
  selectedPets: any[] = [];
  petServices: PetServiceSelection[] = [];
  selectedGroomer: any = null;
  selectedDateTime: DateTimeSelection | null = null;
  selectedAddress: any = null;
  paymentConfig: PaymentConfig | null = null;

  // UI state
  isSubmitting = false;
  submitError: string | null = null;
  currentStepIndex = 0;

  steps = [
    { index: 0, label: 'Client' },
    { index: 1, label: 'Pets' },
    { index: 2, label: 'Services' },
    { index: 3, label: 'Groomer' },
    { index: 4, label: 'Date & Time' },
    { index: 5, label: 'Address' },
    { index: 6, label: 'Review' }
  ];

  constructor(
    private adminBookingService: AdminBookingService,
    private router: Router
  ) {}

  ngOnInit(): void {
    // Initialize booking data
    this.bookingData = {
      payment_type: 'pay_on_completion'
    };
    this.currentStepIndex = 0;
  }

  // Step 1: Client selected
  onClientSelected(client: any): void {
    this.selectedClient = client;
    this.bookingData.client_id = client.id;
    console.log('Client selected:', client);
  }

  // Step 2: Pets selected
  onPetsSelected(pets: any[]): void {
    this.selectedPets = pets;
    console.log('Pets selected:', pets);
  }

  // Step 3: Services selected
  onServicesSelected(services: PetServiceSelection[]): void {
    this.petServices = services;
    console.log('Services selected:', services);
  }

  // Step 4: Groomer selected
  onGroomerSelected(groomer: any): void {
    this.selectedGroomer = groomer;
    this.bookingData.groomer_id = groomer.id;
    console.log('Groomer selected:', groomer);
  }

  // Step 5: Date and time selected
  onDateTimeSelected(data: DateTimeSelection): void {
    this.selectedDateTime = data;
    this.bookingData.scheduled_date = data.date;
    this.bookingData.assigned_time_slot = data.time_slot;
    this.bookingData.scheduled_time_start = data.scheduled_time_start;
    this.bookingData.scheduled_time_end = data.scheduled_time_end;
    this.bookingData.shift_preference = data.shift_preference;
    console.log('Date/Time selected:', data);
  }

  // Step 6: Address selected
  onAddressSelected(address: any): void {
    this.selectedAddress = address;
    if (address) {
      this.bookingData.address_id = address.id;
    }
    console.log('Address selected:', address);
  }

  // Step 7: Payment and review
  onPaymentConfigured(config: PaymentConfig): void {
    this.paymentConfig = config;
    this.bookingData.payment_type = config.payment_type;
    this.bookingData.payment_method_id = config.payment_method_id;

    // Always send pricing override to avoid API defaulting to $100
    const subtotalAfterDiscount = config.original_amount - config.discount_amount;
    const taxAmount = Math.round(subtotalAfterDiscount * 0.0825 * 100) / 100;
    this.bookingData.pricing_override = {
      subtotal: config.original_amount,
      discount_amount: config.discount_amount,
      discount_reason: config.discount_reason || '',
      tax_amount: taxAmount,
      total: subtotalAfterDiscount + taxAmount
    };

    console.log('Payment configured:', config);
  }

  // Check if step is complete
  isStep1Complete(): boolean {
    return !!this.selectedClient;
  }

  isStep2Complete(): boolean {
    return this.selectedPets.length > 0;
  }

  isStep3Complete(): boolean {
    return this.petServices.length > 0 &&
           this.petServices.every(ps => ps.package_type !== null);
  }

  isStep4Complete(): boolean {
    return !!this.selectedGroomer;
  }

  isStep5Complete(): boolean {
    return !!this.selectedDateTime?.date && !!this.selectedDateTime?.time_slot;
  }

  isStep6Complete(): boolean {
    return !!this.selectedAddress;
  }

  isStep7Complete(): boolean {
    return !!this.paymentConfig &&
           (this.paymentConfig.payment_type !== 'use_saved_card' ||
            !!this.paymentConfig.payment_method_id);
  }

  // Submit booking
  async submitBooking(): Promise<void> {
    if (!this.isStep7Complete()) {
      this.submitError = 'Please complete all required fields';
      return;
    }

    this.isSubmitting = true;
    this.submitError = null;

    try {
      // Build pets array with service details from petServices
      const pets: PetBooking[] = this.petServices.map(ps => {
        // Calculate package price (without addons)
        const packagePrice = this.calculatePackagePrice(ps.package_type!, ps.pet_size);

        // Calculate addons total and build addons array
        const addons = ps.add_ons.map(addonId => {
          const addonPrice = this.calculateAddonPrice(addonId, ps.pet_size);
          return {
            name: this.getAddonName(addonId),
            price: addonPrice
          };
        });

        return {
          pet_id: ps.pet_id,
          service_size: ps.pet_size.toLowerCase() as 'small' | 'medium' | 'large' | 'xl',
          package_type: ps.package_type!.toLowerCase() as 'basic' | 'premium' | 'deluxe',
          base_price: packagePrice,
          package_price: packagePrice,
          total_price: ps.price,
          addons: addons.length > 0 ? addons : undefined
        };
      });

      const bookingRequest: AdminBookingRequest = {
        client_id: this.bookingData.client_id!,
        groomer_id: this.bookingData.groomer_id!,
        payment_type: this.bookingData.payment_type!,
        payment_method_id: this.bookingData.payment_method_id,
        scheduled_date: this.bookingData.scheduled_date!,
        assigned_time_slot: this.bookingData.assigned_time_slot!,
        scheduled_time_start: this.bookingData.scheduled_time_start!,
        scheduled_time_end: this.bookingData.scheduled_time_end!,
        shift_preference: this.bookingData.shift_preference!,
        pets,
        address_id: this.bookingData.address_id!,
        pricing_override: this.bookingData.pricing_override
      };

      console.log('Submitting booking:', bookingRequest);

      const result = await this.adminBookingService.createBooking(bookingRequest).toPromise();

      console.log('Booking created successfully:', result);

      // Navigate to booking list
      this.router.navigate(['/bookings']);
    } catch (error: any) {
      console.error('Error creating booking:', error);
      this.submitError = error.error?.error || 'Failed to create booking. Please try again.';
    } finally {
      this.isSubmitting = false;
    }
  }

  // Helper methods for pricing calculations
  private calculatePackagePrice(packageType: string, size: string): number {
    // Package prices mapped from select-service component
    const packages: Record<string, Record<string, number>> = {
      'BASIC': { 'SMALL': 59, 'MEDIUM': 79, 'LARGE': 99, 'XL': 119 },
      'PREMIUM': { 'SMALL': 95, 'MEDIUM': 125, 'LARGE': 150, 'XL': 175 },
      'DELUXE': { 'SMALL': 115, 'MEDIUM': 145, 'LARGE': 175, 'XL': 205 }
    };

    return packages[packageType]?.[size] || 0;
  }

  private calculateAddonPrice(addonId: string, size: string): number {
    // Addon prices - flat rate regardless of size
    const addons: Record<string, number> = {
      'flea-treatment': 20,
      'de-shedding': 30,
      'skunk-works': 100
    };

    return addons[addonId] || 0;
  }

  private getAddonName(addonId: string): string {
    const names: Record<string, string> = {
      'flea-treatment': 'Flea Treatment',
      'de-shedding': 'De-Shedding',
      'skunk-works': 'Skunk Works'
    };

    return names[addonId] || addonId;
  }

  // Cancel and go back
  cancel(): void {
    if (confirm('Are you sure you want to cancel? All progress will be lost.')) {
      this.router.navigate(['/bookings']);
    }
  }

  // Navigation helpers
  goToStep(stepIndex: number): void {
    if (this.stepper) {
      this.stepper.selectedIndex = stepIndex;
    }
    this.currentStepIndex = stepIndex;
  }

  nextStep(): void {
    if (this.canProceedToNextStep() && this.currentStepIndex < this.steps.length - 1) {
      this.currentStepIndex++;
      // Sync with mat-stepper if it exists (for backward compatibility)
      if (this.stepper && this.stepper.selectedIndex !== this.currentStepIndex) {
        this.stepper.selectedIndex = this.currentStepIndex;
      }
    }
  }

  previousStep(): void {
    if (this.currentStepIndex > 0) {
      this.currentStepIndex--;
      // Sync with mat-stepper if it exists (for backward compatibility)
      if (this.stepper && this.stepper.selectedIndex !== this.currentStepIndex) {
        this.stepper.selectedIndex = this.currentStepIndex;
      }
    }
  }

  canProceedToNextStep(): boolean {
    switch (this.currentStepIndex) {
      case 0: return this.isStep1Complete();
      case 1: return this.isStep2Complete();
      case 2: return this.isStep3Complete();
      case 3: return this.isStep4Complete();
      case 4: return this.isStep5Complete();
      case 5: return this.isStep6Complete();
      default: return true;
    }
  }
}
