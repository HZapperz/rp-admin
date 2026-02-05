import { Injectable, inject } from '@angular/core';
import { SupabaseService } from './supabase.service';

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

  // Zip code proximity map for Houston area
  private readonly ZIP_PROXIMITY: Record<string, string[]> = {
    // Rice Village / West U / Medical Center
    '77005': ['77005', '77025', '77030', '77054', '77004'],
    '77025': ['77005', '77025', '77030', '77054', '77035'],
    '77030': ['77005', '77025', '77030', '77054'],
    // Heights / Montrose
    '77006': ['77006', '77007', '77019', '77098'],
    '77007': ['77006', '77007', '77008', '77019'],
    '77008': ['77007', '77008', '77009', '77018'],
    '77019': ['77006', '77007', '77019', '77098'],
    '77098': ['77006', '77019', '77098', '77027'],
    // Bellaire / Meyerland
    '77401': ['77401', '77096', '77035', '77074'],
    '77096': ['77401', '77096', '77035', '77074'],
    '77074': ['77074', '77096', '77035', '77401'],
    '77035': ['77035', '77096', '77074', '77025'],
    // Sugar Land
    '77478': ['77478', '77479', '77498'],
    '77479': ['77478', '77479', '77498'],
    '77498': ['77478', '77479', '77498'],
    // South Houston
    '77051': ['77051', '77021', '77004', '77033'],
    '77021': ['77021', '77051', '77004', '77045'],
    // Memorial / Energy Corridor
    '77024': ['77024', '77055', '77079', '77077'],
    '77055': ['77024', '77055', '77008', '77018'],
    '77079': ['77024', '77079', '77077', '77094'],
    '77077': ['77024', '77079', '77077', '77094'],
    // Galleria / Uptown
    '77027': ['77027', '77056', '77098', '77057'],
    '77056': ['77027', '77056', '77057', '77024'],
    '77057': ['77027', '77056', '77057', '77055'],
    // Katy area
    '77450': ['77450', '77494', '77493'],
    '77494': ['77450', '77494', '77493', '77084'],
    '77493': ['77450', '77494', '77493'],
    // Spring / The Woodlands
    '77379': ['77379', '77380', '77381', '77382'],
    '77380': ['77379', '77380', '77381', '77382'],
    '77381': ['77379', '77380', '77381', '77382'],
    '77382': ['77379', '77380', '77381', '77382'],
    // Pearland
    '77581': ['77581', '77584', '77089'],
    '77584': ['77581', '77584', '77089'],
    // Clear Lake / Webster
    '77058': ['77058', '77059', '77062'],
    '77059': ['77058', '77059', '77062'],
    '77062': ['77058', '77059', '77062'],
  };

  getNearbyZips(zip: string): string[] {
    return this.ZIP_PROXIMITY[zip] || [zip];
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
      const nearbyZips = this.getNearbyZips(zip);
      const recommendations = await this.getRecommendationsForZips(
        nearbyZips,
        daysThreshold,
        processedClientIds,
        date
      );

      // Track processed clients to avoid duplicates across locations
      recommendations.forEach((r) => processedClientIds.add(r.id));

      locations.push({
        zip_code: zip,
        city: info.city,
        bookings_today: info.count,
        recommendations,
      });
    }

    // Sort locations by number of bookings (descending)
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
    // Get addresses in target zips
    const { data: addresses, error: addressError } = await this.supabase
      .from('addresses')
      .select('user_id, street, city, zip_code')
      .in('zip_code', zips);

    if (addressError || !addresses || addresses.length === 0) {
      return [];
    }

    // Get unique client IDs, excluding already processed
    const clientIds = [
      ...new Set(
        addresses
          .map((a) => a.user_id)
          .filter((id) => id && !excludeClientIds.has(id))
      ),
    ];

    if (clientIds.length === 0) {
      return [];
    }

    // Get client details
    const { data: clients, error: clientError } = await this.supabase
      .from('users')
      .select('id, first_name, last_name, email, phone')
      .eq('role', 'CLIENT')
      .in('id', clientIds);

    if (clientError || !clients || clients.length === 0) {
      return [];
    }

    // Filter out test/dev accounts
    const filteredClients = clients.filter((c) => {
      const email = c.email?.toLowerCase() || '';
      return (
        !email.includes('test') &&
        !email.includes('dev') &&
        !email.includes('demo') &&
        !email.includes('@example.com')
      );
    });

    if (filteredClients.length === 0) {
      return [];
    }

    const filteredClientIds = filteredClients.map((c) => c.id);

    // Get pets for these clients
    const { data: pets, error: petsError } = await this.supabase
      .from('pets')
      .select('id, user_id, name, breed')
      .in('user_id', filteredClientIds);

    // Only include clients who have pets
    const clientsWithPets = new Set(pets?.map((p) => p.user_id) || []);
    const clientsWithPetsFiltered = filteredClients.filter((c) =>
      clientsWithPets.has(c.id)
    );

    if (clientsWithPetsFiltered.length === 0) {
      return [];
    }

    const clientIdsWithPets = clientsWithPetsFiltered.map((c) => c.id);

    // Get booking stats for these clients
    const { data: bookingStats, error: bookingStatsError } = await this.supabase
      .from('bookings')
      .select('client_id, scheduled_date, status')
      .in('client_id', clientIdsWithPets);

    // Calculate stats per client
    const clientStats: Record<
      string,
      { lastBookingDate: string | null; completedCount: number }
    > = {};

    for (const clientId of clientIdsWithPets) {
      const clientBookings =
        bookingStats?.filter((b) => b.client_id === clientId) || [];
      const completedBookings = clientBookings.filter(
        (b) => b.status === 'completed'
      );
      const sortedBookings = clientBookings
        .filter((b) => b.scheduled_date)
        .sort(
          (a, b) =>
            new Date(b.scheduled_date).getTime() -
            new Date(a.scheduled_date).getTime()
        );

      clientStats[clientId] = {
        lastBookingDate: sortedBookings[0]?.scheduled_date || null,
        completedCount: completedBookings.length,
      };
    }

    // Calculate days since last booking and filter by threshold
    const targetDateObj = new Date(targetDate);
    const recommendations: ClientRecommendation[] = [];

    for (const client of clientsWithPetsFiltered) {
      const stats = clientStats[client.id];
      let daysSinceBooking: number | null = null;

      if (stats.lastBookingDate) {
        const lastDate = new Date(stats.lastBookingDate);
        daysSinceBooking = Math.floor(
          (targetDateObj.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24)
        );

        // Skip if booked too recently
        if (daysSinceBooking < daysThreshold) {
          continue;
        }
      }

      // Get client's address in the target zips
      const clientAddress = addresses.find(
        (a) => a.user_id === client.id && zips.includes(a.zip_code)
      );

      // Get client's pets
      const clientPets =
        pets?.filter((p) => p.user_id === client.id).map((p) => ({
          id: p.id,
          name: p.name,
          breed: p.breed,
        })) || [];

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
      });
    }

    // Sort by completed bookings (warm leads first), then by days since booking
    recommendations.sort((a, b) => {
      // First, sort by completed bookings (descending)
      if (b.completed_bookings !== a.completed_bookings) {
        return b.completed_bookings - a.completed_bookings;
      }
      // Then by days since last booking (ascending - more recent first if they're warm leads)
      const daysA = a.days_since_booking ?? Infinity;
      const daysB = b.days_since_booking ?? Infinity;
      return daysA - daysB;
    });

    return recommendations;
  }

  getLeadBadge(completedBookings: number): { label: string; class: string } {
    if (completedBookings >= 5) return { label: 'VIP', class: 'badge-vip' };
    if (completedBookings >= 2) return { label: 'Warm', class: 'badge-warm' };
    if (completedBookings === 1)
      return { label: 'Returning', class: 'badge-returning' };
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
