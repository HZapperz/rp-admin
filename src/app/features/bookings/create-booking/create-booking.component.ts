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

  constructor(
    private adminBookingService: AdminBookingService,
    private router: Router
  ) {}

  ngOnInit(): void {
    // Initialize booking data
    this.bookingData = {
      payment_type: 'pay_on_completion'
    };
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

    // Set pricing override if there's a discount
    if (config.discount_amount > 0) {
      this.bookingData.pricing_override = {
        subtotal: config.original_amount,
        discount_amount: config.discount_amount,
        discount_reason: config.discount_reason || '',
        tax_amount: 0,
        total: config.final_amount
      };
    } else {
      this.bookingData.pricing_override = undefined;
    }

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
        return {
          pet_id: ps.pet_id,
          service_size: ps.pet_size as 'SMALL' | 'MEDIUM' | 'LARGE',
          package_type: ps.package_type!,
          base_price: ps.price,
          package_price: ps.price,
          total_price: ps.price,
          addons: [] // Add-ons are included in the total price already
        };
      });

      const bookingRequest: AdminBookingRequest = {
        client_id: this.bookingData.client_id!,
        groomer_id: this.bookingData.groomer_id!,
        payment_type: this.bookingData.payment_type!,
        payment_method_id: this.bookingData.payment_method_id,
        scheduled_date: this.bookingData.scheduled_date!,
        assigned_time_slot: this.bookingData.assigned_time_slot!,
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

  // Cancel and go back
  cancel(): void {
    if (confirm('Are you sure you want to cancel? All progress will be lost.')) {
      this.router.navigate(['/bookings']);
    }
  }

  // Navigation helpers
  goToStep(stepIndex: number): void {
    this.stepper.selectedIndex = stepIndex;
  }
}
