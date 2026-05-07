import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, firstValueFrom } from 'rxjs';
import { BookingWithDetails } from '../models/types';
import { environment } from '../../../environments/environment';

interface PetLineItem {
  pet_name: string;
  package_name: string;
  service_size: string;
  service_charge: number;
  breed_premium_amount: number;
  coat_category?: string;
  addons: Array<{ name: string; price: number }>;
  pet_total: number;
}

interface BookingEmailData {
  booking: {
    id: string;
    scheduled_date: string;
    scheduled_time_start: string;
    scheduled_time_end: string;
    address: string;
    city: string;
    state: string;
    total_amount: number;
    service_name?: string;
    // Breakdown fields (so the email can render itemized pricing).
    original_subtotal?: number;
    discount_amount?: number;
    credits_applied?: number;
    subtotal_before_tax?: number;
    tax_amount?: number;
    tax_rate?: number;
    tip_amount?: number;
    payment_method_type?: string;
    payment_method_last4?: string;
  };
  client: {
    first_name: string;
    last_name: string;
    email: string;
  };
  groomer: {
    first_name: string;
    last_name: string;
    email: string;
  };
  pets: Array<{
    name: string;
  }>;
  pet_breakdown?: PetLineItem[];
  adminEmail?: string;
}

const PACKAGE_DISPLAY_NAMES: Record<string, string> = {
  basic: 'Royal Bath',
  premium: 'Royal Groom',
  deluxe: 'Royal Spa',
};

/**
 * Build per-pet line items that always sum exactly to pet.total_price.
 *
 * Real-world data has cases where breed_premium_amount is stored on the row
 * but was never added into total_price (e.g. James Foster's Shetland —
 * package_price=125, base_price=140, breed_premium=20, total=155 but
 * 125+20+30=175). Rather than show a breakdown that doesn't add up, we
 * back-derive the service charge from total_price minus addons, and only
 * surface the coat surcharge as its own line item when the expected math
 * (package_price + breed_premium) matches what's actually in pet_total.
 */
function buildPetBreakdown(booking: BookingWithDetails, fallbackServiceName?: string): PetLineItem[] {
  const pets = booking.pets || [];
  return pets.map((bp) => {
    const addonList = (bp.addons || []).map((a) => ({
      name: a.addon_name,
      price: Number(a.addon_price) || 0,
    }));
    const addonsSum = addonList.reduce((s, a) => s + a.price, 0);

    const petTotal = Number(bp.total_price) || 0;
    const packagePrice = Number(bp.package_price) || 0;
    const breedPremium = Number(bp.breed_premium_amount) || 0;

    const inferredService = Math.round((petTotal - addonsSum) * 100) / 100;
    const expectedService = Math.round((packagePrice + breedPremium) * 100) / 100;

    let serviceCharge: number;
    let displayBreedPremium: number;

    if (Math.abs(inferredService - expectedService) < 0.01) {
      // Clean case — package_price + breed_premium + addons = pet_total.
      serviceCharge = packagePrice;
      displayBreedPremium = breedPremium;
    } else {
      // Inconsistent stored data — fold the implied surcharge into the service line
      // so the displayed math still sums to pet_total. Customer sees one Service line
      // covering the actual amount charged, with no phantom coat surcharge.
      serviceCharge = Math.max(0, inferredService);
      displayBreedPremium = 0;
    }

    const packageName =
      PACKAGE_DISPLAY_NAMES[(bp.package_type || '').toLowerCase()] ||
      fallbackServiceName ||
      'Grooming Service';

    return {
      pet_name: bp.pet?.name || 'Pet',
      package_name: packageName,
      service_size: bp.service_size || '',
      service_charge: serviceCharge,
      breed_premium_amount: displayBreedPremium,
      coat_category: displayBreedPremium > 0 ? bp.coat_category : undefined,
      addons: addonList,
      pet_total: petTotal,
    };
  });
}

interface EmailResponse {
  success: boolean;
  message?: string;
  error?: string;
}

interface TimeChangeEmailData {
  booking: {
    id: string;
    old_date: string;
    old_time_start: string;
    old_time_end: string;
    new_date: string;
    new_time_start: string;
    new_time_end: string;
    address: string;
    city: string;
    state: string;
    service_name?: string;
  };
  client: {
    first_name: string;
    last_name: string;
    email: string;
  };
  groomer: {
    first_name: string;
    last_name: string;
    email: string;
  };
  pets: Array<{
    name: string;
  }>;
  reason: string;
}

interface ServiceChangeEmailData {
  booking: {
    id: string;
    scheduled_date: string;
    address: string;
    city: string;
    state: string;
  };
  client: {
    first_name: string;
    last_name: string;
    email: string;
  };
  pet: {
    name: string;
  };
  oldService: {
    package_name: string;
    total_price: number;
    addons: string[];
  };
  newService: {
    package_name: string;
    total_price: number;
    addons: string[];
  };
  priceDifference: number;
  reason: string;
  newBookingTotal?: number;
}

interface CancellationEmailData {
  booking: {
    id: string;
    scheduled_date: string;
    scheduled_time_start: string;
    scheduled_time_end: string;
    address: string;
    city: string;
    state: string;
    total_amount: number;
    service_name?: string;
  };
  client: {
    first_name: string;
    last_name: string;
    email: string;
  };
  groomer?: {
    first_name: string;
    last_name: string;
    email: string;
  };
  pets: Array<{
    name: string;
  }>;
  reason?: string;
  cancelled_by?: string;
  refund_amount?: number;
  adminEmail?: string;
}

@Injectable({
  providedIn: 'root'
})
export class EmailService {
  // Use environment apiUrl for both dev and prod
  private emailApiUrl = environment.production
    ? `${environment.apiUrl}/api`
    : 'http://localhost:3001/api';

  constructor(private http: HttpClient) {}

  /**
   * Send booking approval emails to client, groomer, and admin
   */
  async sendBookingApprovalEmails(
    booking: BookingWithDetails,
    adminEmail?: string
  ): Promise<{ success: boolean; message?: string; error?: string }> {
    try {
      // Validate required data
      if (!booking.client || !booking.groomer || !booking.pets || booking.pets.length === 0) {
        console.error('Missing required booking data for email', {
          hasClient: !!booking.client,
          hasGroomer: !!booking.groomer,
          hasPets: booking.pets && booking.pets.length > 0
        });
        return {
          success: false,
          error: 'Missing required booking data (client, groomer, or pets)'
        };
      }

      // Validate emails
      if (!booking.client.email || !booking.groomer.email) {
        console.error('Missing email addresses', {
          clientEmail: booking.client.email,
          groomerEmail: booking.groomer.email
        });
        return {
          success: false,
          error: 'Missing client or groomer email address'
        };
      }

      // Prepare email data
      const emailData: BookingEmailData = {
        booking: {
          id: booking.id,
          scheduled_date: booking.scheduled_date,
          scheduled_time_start: booking.scheduled_time_start,
          scheduled_time_end: booking.scheduled_time_end,
          address: booking.address,
          city: booking.city,
          state: booking.state,
          total_amount: Number(booking.total_amount) || 0,
          service_name: booking.service_name,
          original_subtotal: Number(booking.original_subtotal) || undefined,
          discount_amount: Number(booking.discount_amount) || undefined,
          credits_applied: Number(booking.credits_applied) || undefined,
          subtotal_before_tax: Number(booking.subtotal_before_tax) || undefined,
          tax_amount: Number(booking.tax_amount) || undefined,
          tax_rate: Number(booking.tax_rate) || undefined,
          tip_amount: Number(booking.tip_amount) || undefined,
          payment_method_type: booking.payment_method_type,
          payment_method_last4: booking.payment_method_last4,
        },
        client: {
          first_name: booking.client.first_name,
          last_name: booking.client.last_name,
          email: booking.client.email
        },
        groomer: {
          first_name: booking.groomer.first_name,
          last_name: booking.groomer.last_name,
          email: booking.groomer.email
        },
        pets: booking.pets.map(bp => ({
          name: bp.pet?.name || 'Unknown Pet'
        })),
        pet_breakdown: buildPetBreakdown(booking, booking.service_name),
        adminEmail: adminEmail
      };

      console.log('Sending booking approval emails...', {
        bookingId: booking.id,
        clientEmail: emailData.client.email,
        groomerEmail: emailData.groomer.email,
        adminEmail: adminEmail,
        breakdownPets: emailData.pet_breakdown?.length || 0,
        bookingTotal: emailData.booking.total_amount,
        bookingSubtotal: emailData.booking.original_subtotal
      });

      // Send request to email service
      const response = await firstValueFrom(
        this.http.post<EmailResponse>(
          `${this.emailApiUrl}/send-booking-approval-emails`,
          emailData
        )
      );

      console.log('Email sending response:', response);
      return response;

    } catch (error) {
      console.error('Error sending booking approval emails:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred while sending emails'
      };
    }
  }

  /**
   * Send time change notification emails to client and groomer
   */
  async sendTimeChangeEmails(
    booking: BookingWithDetails,
    oldDate: string,
    oldTimeStart: string,
    oldTimeEnd: string,
    reason: string
  ): Promise<{ success: boolean; message?: string; error?: string }> {
    try {
      // Validate required data
      if (!booking.client || !booking.groomer || !booking.pets || booking.pets.length === 0) {
        console.error('Missing required booking data for time change email', {
          hasClient: !!booking.client,
          hasGroomer: !!booking.groomer,
          hasPets: booking.pets && booking.pets.length > 0
        });
        return {
          success: false,
          error: 'Missing required booking data (client, groomer, or pets)'
        };
      }

      // Validate emails
      if (!booking.client.email || !booking.groomer.email) {
        console.error('Missing email addresses', {
          clientEmail: booking.client.email,
          groomerEmail: booking.groomer.email
        });
        return {
          success: false,
          error: 'Missing client or groomer email address'
        };
      }

      // Prepare email data
      const emailData: TimeChangeEmailData = {
        booking: {
          id: booking.id,
          old_date: oldDate,
          old_time_start: oldTimeStart,
          old_time_end: oldTimeEnd,
          new_date: booking.scheduled_date,
          new_time_start: booking.scheduled_time_start,
          new_time_end: booking.scheduled_time_end,
          address: booking.address,
          city: booking.city,
          state: booking.state,
          service_name: booking.service_name
        },
        client: {
          first_name: booking.client.first_name,
          last_name: booking.client.last_name,
          email: booking.client.email
        },
        groomer: {
          first_name: booking.groomer.first_name,
          last_name: booking.groomer.last_name,
          email: booking.groomer.email
        },
        pets: booking.pets.map(bp => ({
          name: bp.pet?.name || 'Unknown Pet'
        })),
        reason: reason
      };

      console.log('Sending time change emails...', {
        bookingId: booking.id,
        clientEmail: emailData.client.email,
        groomerEmail: emailData.groomer.email,
        oldDate,
        newDate: booking.scheduled_date
      });

      // Send request to email service
      const response = await firstValueFrom(
        this.http.post<EmailResponse>(
          `${this.emailApiUrl}/send-time-change-emails`,
          emailData
        )
      );

      console.log('Time change email response:', response);
      return response;

    } catch (error) {
      console.error('Error sending time change emails:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred while sending emails'
      };
    }
  }

  /**
   * Send service change notification email to customer only
   */
  async sendServiceChangeEmail(
    data: ServiceChangeEmailData
  ): Promise<{ success: boolean; message?: string; error?: string }> {
    try {
      // Validate required data
      if (!data.client?.email) {
        console.error('Missing client email for service change notification');
        return {
          success: false,
          error: 'Missing client email address'
        };
      }

      console.log('Sending service change email...', {
        bookingId: data.booking.id,
        clientEmail: data.client.email,
        petName: data.pet.name,
        oldPackage: data.oldService.package_name,
        newPackage: data.newService.package_name,
        priceDifference: data.priceDifference
      });

      // Send request to email service
      const response = await firstValueFrom(
        this.http.post<EmailResponse>(
          `${this.emailApiUrl}/send-service-change-email`,
          data
        )
      );

      console.log('Service change email response:', response);
      return response;

    } catch (error) {
      console.error('Error sending service change email:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred while sending email'
      };
    }
  }

  /**
   * Send cancellation notification emails to client, groomer, and admin
   */
  async sendCancellationEmails(
    booking: BookingWithDetails,
    reason?: string,
    cancelledBy?: string,
    refundAmount?: number,
    adminEmail?: string
  ): Promise<{ success: boolean; message?: string; error?: string }> {
    try {
      // Validate required data
      if (!booking.client || !booking.pets || booking.pets.length === 0) {
        console.error('Missing required booking data for cancellation email', {
          hasClient: !!booking.client,
          hasPets: booking.pets && booking.pets.length > 0
        });
        return {
          success: false,
          error: 'Missing required booking data (client or pets)'
        };
      }

      // Validate client email
      if (!booking.client.email) {
        console.error('Missing client email address');
        return {
          success: false,
          error: 'Missing client email address'
        };
      }

      // Prepare email data
      const emailData: CancellationEmailData = {
        booking: {
          id: booking.id,
          scheduled_date: booking.scheduled_date,
          scheduled_time_start: booking.scheduled_time_start,
          scheduled_time_end: booking.scheduled_time_end,
          address: booking.address,
          city: booking.city,
          state: booking.state,
          total_amount: booking.total_amount,
          service_name: booking.service_name
        },
        client: {
          first_name: booking.client.first_name,
          last_name: booking.client.last_name,
          email: booking.client.email
        },
        groomer: (booking.groomer && booking.groomer.email) ? {
          first_name: booking.groomer.first_name,
          last_name: booking.groomer.last_name,
          email: booking.groomer.email
        } : undefined,
        pets: booking.pets.map(bp => ({
          name: bp.pet?.name || 'Unknown Pet'
        })),
        reason: reason,
        cancelled_by: cancelledBy,
        refund_amount: refundAmount,
        adminEmail: adminEmail
      };

      console.log('Sending cancellation emails...', {
        bookingId: booking.id,
        clientEmail: emailData.client.email,
        groomerEmail: emailData.groomer?.email,
        adminEmail: adminEmail,
        reason: reason
      });

      // Send request to email service
      const response = await firstValueFrom(
        this.http.post<EmailResponse>(
          `${this.emailApiUrl}/send-cancellation-emails`,
          emailData
        )
      );

      console.log('Cancellation email response:', response);
      return response;

    } catch (error) {
      console.error('Error sending cancellation emails:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred while sending cancellation emails'
      };
    }
  }

  /**
   * Check if email service is healthy
   */
  async checkEmailServiceHealth(): Promise<boolean> {
    try {
      const response = await firstValueFrom(
        this.http.get<{ status: string }>(`${this.emailApiUrl}/health`)
      );
      return response.status === 'ok';
    } catch (error) {
      console.error('Email service health check failed:', error);
      return false;
    }
  }
}
