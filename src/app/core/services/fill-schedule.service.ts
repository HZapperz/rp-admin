import { Injectable, inject } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { environment } from '../../../environments/environment';

export interface Pet {
  id: string;
  name: string;
  breed?: string;
}

export interface ClientRecommendation {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  pets: Pet[];
  address: {
    street: string;
    city: string;
    zip_code: string;
  };
  last_booking_date: string | null;
  completed_bookings: number;
  days_since_booking: number | null;
  pipeline_stage?: string | null;
  pipeline_lead_id?: string | null;
}

export interface LocationGroup {
  zip_code: string;
  city: string;
  bookings_today: number;
  recommendations: ClientRecommendation[];
}

export interface FillScheduleData {
  date: string;
  total_bookings: number;
  total_locations: number;
  total_leads: number;
  locations: LocationGroup[];
}

@Injectable({ providedIn: 'root' })
export class FillScheduleService {
  private supabase = inject(SupabaseService);
  private http = inject(HttpClient);

  // Cache for zip proximity data from DB
  private zipProximityCache: Map<string, string[]> | null = null;

  async getNearbyZips(zip: string): Promise<string[]> {
    if (!this.zipProximityCache) {
      await this.loadZipProximity();
    }
    return this.zipProximityCache?.get(zip) || [zip];
  }

  private async loadZipProximity(): Promise<void> {
    const { data, error } = await this.supabase
      .from('zip_proximity')
      .select('zip_code, nearby_zips')
      .eq('is_active', true);

    this.zipProximityCache = new Map();
    for (const row of data || []) {
      this.zipProximityCache.set(row.zip_code, row.nearby_zips);
    }
  }

  clearZipCache(): void {
    this.zipProximityCache = null;
  }

  async getRecommendations(date: string, daysThreshold = 21): Promise<FillScheduleData> {
    // 1. Get today's bookings grouped by location
    const { data: bookings, error: bookingsError } = await this.supabase
      .from('bookings')
      .select('id, zip_code, city, scheduled_time_start')
      .eq('scheduled_date', date)
      .in('status', ['confirmed', 'pending']);

    if (bookingsError) {
      console.error('Error fetching bookings:', bookingsError);
      throw bookingsError;
    }

    if (!bookings || bookings.length === 0) {
      return {
        date,
        total_bookings: 0,
        total_locations: 0,
        total_leads: 0,
        locations: [],
      };
    }

    // Group bookings by zip_code
    const locationGroups: Record<string, { city: string; count: number }> = {};
    for (const booking of bookings) {
      const zip = booking.zip_code;
      if (!zip) continue;
      if (!locationGroups[zip]) {
        locationGroups[zip] = { city: booking.city || 'Unknown', count: 0 };
      }
      locationGroups[zip].count++;
    }

    // 2. For each location, get recommendations
    const locations: LocationGroup[] = [];
    const processedClientIds = new Set<string>();

    for (const [zip, info] of Object.entries(locationGroups)) {
      const nearbyZips = await this.getNearbyZips(zip);
      const recommendations = await this.getRecommendationsForZips(
        nearbyZips,
        daysThreshold,
        processedClientIds,
        date
      );

      recommendations.forEach((r) => processedClientIds.add(r.id));

      locations.push({
        zip_code: zip,
        city: info.city,
        bookings_today: info.count,
        recommendations,
      });
    }

    locations.sort((a, b) => b.bookings_today - a.bookings_today);

    const totalLeads = locations.reduce((sum, loc) => sum + loc.recommendations.length, 0);

    return {
      date,
      total_bookings: bookings.length,
      total_locations: locations.length,
      total_leads: totalLeads,
      locations,
    };
  }

  private async getRecommendationsForZips(
    zips: string[],
    daysThreshold: number,
    excludeClientIds: Set<string>,
    targetDate: string
  ): Promise<ClientRecommendation[]> {
    const { data: addresses, error: addressError } = await this.supabase
      .from('addresses')
      .select('user_id, street, city, zip_code')
      .in('zip_code', zips);

    if (addressError || !addresses || addresses.length === 0) {
      return [];
    }

    const clientIds = [
      ...new Set(
        addresses
          .map((a) => a.user_id)
          .filter((id) => id && !excludeClientIds.has(id))
      ),
    ];

    if (clientIds.length === 0) return [];

    const { data: clients, error: clientError } = await this.supabase
      .from('users')
      .select('id, first_name, last_name, email, phone')
      .eq('role', 'CLIENT')
      .in('id', clientIds);

    if (clientError || !clients || clients.length === 0) return [];

    const filteredClients = clients.filter((c) => {
      const email = c.email?.toLowerCase() || '';
      return (
        !email.includes('test') &&
        !email.includes('dev') &&
        !email.includes('demo') &&
        !email.includes('@example.com')
      );
    });

    if (filteredClients.length === 0) return [];

    const filteredClientIds = filteredClients.map((c) => c.id);

    // Fetch pets, booking stats, and pipeline status in parallel
    const [petsResult, bookingStatsResult, pipelineResult] = await Promise.all([
      this.supabase
        .from('pets')
        .select('id, user_id, name, breed')
        .in('user_id', filteredClientIds),
      this.supabase
        .from('bookings')
        .select('client_id, scheduled_date, status')
        .in('client_id', filteredClientIds),
      this.supabase
        .from('sales_pipeline_leads')
        .select('id, user_id, pipeline_stage')
        .in('user_id', filteredClientIds)
    ]);

    const pets = petsResult.data || [];
    const bookingStats = bookingStatsResult.data || [];
    const pipelineLeads = pipelineResult.data || [];

    // Only include clients who have pets
    const clientsWithPets = new Set(pets.map((p) => p.user_id));
    const clientsWithPetsFiltered = filteredClients.filter((c) =>
      clientsWithPets.has(c.id)
    );

    if (clientsWithPetsFiltered.length === 0) return [];

    const clientIdsWithPets = clientsWithPetsFiltered.map((c) => c.id);

    // Build lookup maps
    const pipelineMap = new Map(pipelineLeads.map(p => [p.user_id, p]));

    const clientStatsMap: Record<string, { lastBookingDate: string | null; completedCount: number }> = {};
    for (const clientId of clientIdsWithPets) {
      const clientBookings = bookingStats.filter((b) => b.client_id === clientId);
      const completedBookings = clientBookings.filter((b) => b.status === 'completed');
      const sortedBookings = clientBookings
        .filter((b) => b.scheduled_date)
        .sort((a, b) => new Date(b.scheduled_date).getTime() - new Date(a.scheduled_date).getTime());

      clientStatsMap[clientId] = {
        lastBookingDate: sortedBookings[0]?.scheduled_date || null,
        completedCount: completedBookings.length,
      };
    }

    const targetDateObj = new Date(targetDate);
    const recommendations: ClientRecommendation[] = [];

    for (const client of clientsWithPetsFiltered) {
      const stats = clientStatsMap[client.id];
      let daysSinceBooking: number | null = null;

      if (stats.lastBookingDate) {
        const lastDate = new Date(stats.lastBookingDate);
        daysSinceBooking = Math.floor(
          (targetDateObj.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24)
        );

        if (daysSinceBooking < daysThreshold) continue;
      }

      const clientAddress = addresses.find(
        (a) => a.user_id === client.id && zips.includes(a.zip_code)
      );

      const clientPets = pets
        .filter((p) => p.user_id === client.id)
        .map((p) => ({ id: p.id, name: p.name, breed: p.breed }));

      const pipelineLead = pipelineMap.get(client.id);

      recommendations.push({
        id: client.id,
        first_name: client.first_name || '',
        last_name: client.last_name || '',
        email: client.email || '',
        phone: client.phone,
        pets: clientPets,
        address: clientAddress
          ? {
              street: clientAddress.street || '',
              city: clientAddress.city || '',
              zip_code: clientAddress.zip_code || '',
            }
          : { street: '', city: '', zip_code: '' },
        last_booking_date: stats.lastBookingDate,
        completed_bookings: stats.completedCount,
        days_since_booking: daysSinceBooking,
        pipeline_stage: pipelineLead?.pipeline_stage || null,
        pipeline_lead_id: pipelineLead?.id || null,
      });
    }

    recommendations.sort((a, b) => {
      if (b.completed_bookings !== a.completed_bookings) {
        return b.completed_bookings - a.completed_bookings;
      }
      const daysA = a.days_since_booking ?? Infinity;
      const daysB = b.days_since_booking ?? Infinity;
      return daysA - daysB;
    });

    return recommendations;
  }

  // ==================== PIPELINE INTEGRATION ====================

  async addToPipeline(userId: string): Promise<{ success: boolean; leadId?: string; existing?: boolean }> {
    // Check if already in pipeline
    const { data: existing } = await this.supabase
      .from('sales_pipeline_leads')
      .select('id')
      .eq('user_id', userId)
      .single();

    if (existing) {
      // Update geo_boost flag
      await this.supabase
        .from('sales_pipeline_leads')
        .update({ geo_boost: true, last_activity_at: new Date().toISOString() })
        .eq('id', existing.id);

      return { success: true, leadId: existing.id, existing: true };
    }

    // Create new lead with geo_boost
    const { data, error } = await this.supabase
      .from('sales_pipeline_leads')
      .insert({
        user_id: userId,
        pipeline_stage: 'NEW',
        priority: 5,
        geo_boost: true,
        stage_changed_at: new Date().toISOString(),
        last_activity_at: new Date().toISOString()
      })
      .select('id')
      .single();

    if (error) return { success: false };
    return { success: true, leadId: data.id, existing: false };
  }

  async sendFillScheduleSMS(userId: string, phone: string, message: string, leadId?: string): Promise<boolean> {
    try {
      const headers = new HttpHeaders({
        'Content-Type': 'application/json',
        'X-API-Key': environment.smsService.apiKey
      });

      await this.http.post(`${environment.smsService.url}/send/sms`, {
        to: phone,
        body: message
      }, { headers }).toPromise();

      // Log activity if we have a pipeline lead
      if (leadId) {
        await this.supabase
          .from('contact_activities')
          .insert({
            lead_id: leadId,
            user_id: userId,
            activity_type: 'SMS_SENT',
            notes: message,
            metadata: { source: 'fill_schedule' }
          });

        await this.supabase
          .from('sales_pipeline_leads')
          .update({
            last_sms_sent_at: new Date().toISOString(),
            last_activity_at: new Date().toISOString()
          })
          .eq('id', leadId);
      }

      return true;
    } catch (error) {
      console.error('Error sending fill schedule SMS:', error);
      return false;
    }
  }

  // ==================== HELPERS ====================

  getLeadBadge(completedBookings: number): { label: string; class: string } {
    if (completedBookings >= 5) return { label: 'VIP', class: 'badge-vip' };
    if (completedBookings >= 2) return { label: 'Warm', class: 'badge-warm' };
    if (completedBookings === 1) return { label: 'Returning', class: 'badge-returning' };
    return { label: 'New', class: 'badge-new' };
  }

  generateMessage(client: ClientRecommendation, date: string): string {
    const petNames = client.pets.map((p) => p.name).join(' and ');
    const formattedDate = new Date(date).toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
    });

    return `Hi ${client.first_name}! This is Royal Pawz. We'll be in your area on ${formattedDate} and have availability for ${petNames}. Would you like to schedule a grooming appointment?`;
  }
}
