import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, firstValueFrom } from 'rxjs';
import { BookingWithDetails } from '../models/types';

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
  adminEmail?: string;
}

interface EmailResponse {
  success: boolean;
  message?: string;
  error?: string;
}

@Injectable({
  providedIn: 'root'
})
export class EmailService {
  private emailApiUrl = 'http://localhost:3001/api';

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
          total_amount: booking.total_amount,
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
        adminEmail: adminEmail
      };

      console.log('Sending booking approval emails...', {
        bookingId: booking.id,
        clientEmail: emailData.client.email,
        groomerEmail: emailData.groomer.email,
        adminEmail: adminEmail
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
