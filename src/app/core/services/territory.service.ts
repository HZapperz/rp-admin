import { Injectable } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { Observable, from, map } from 'rxjs';
import {
  TerritoryCustomer,
  ZipCodeMetrics,
  TerritoryMetrics,
  TerritoryFilters
} from '../models/types';

@Injectable({
  providedIn: 'root'
})
export class TerritoryService {
  constructor(private supabase: SupabaseService) {}

  /**
   * Fetch and transform customer data for map visualization
   */
  getTerritoryCustomers(filters?: TerritoryFilters): Observable<TerritoryCustomer[]> {
    return from(this.fetchTerritoryCustomers(filters));
  }

  private async fetchTerritoryCustomers(filters?: TerritoryFilters): Promise<TerritoryCustomer[]> {
    try {
      // Fetch all users with CLIENT role
      let usersQuery = this.supabase
        .from('users')
        .select('id, first_name, last_name, email, phone')
        .eq('role', 'CLIENT');

      const { data: users, error: usersError } = await usersQuery;

      if (usersError) {
        console.error('Error fetching users:', usersError);
        throw usersError;
      }

      if (!users || users.length === 0) {
        return [];
      }

      const userIds = users.map(u => u.id);

      // Fetch addresses with geocoding for these users
      const { data: addresses, error: addressesError } = await this.supabase
        .from('addresses')
        .select('*')
        .in('user_id', userIds)
        .not('latitude', 'is', null)
        .not('longitude', 'is', null)
        .eq('is_default', true);

      if (addressesError) {
        console.error('Error fetching addresses:', addressesError);
        throw addressesError;
      }

      // Fetch all bookings with geocoded addresses
      let bookingsQuery = this.supabase
        .from('bookings')
        .select('client_id, status, total_amount, scheduled_date, created_at, address, city, state, zip_code, latitude, longitude')
        .in('client_id', userIds)
        .in('status', ['confirmed', 'completed', 'in_progress'])
        .not('latitude', 'is', null)
        .not('longitude', 'is', null);

      // Apply date range filter if provided
      if (filters?.date_range && filters.date_range.start && filters.date_range.end) {
        bookingsQuery = bookingsQuery
          .gte('scheduled_date', filters.date_range.start)
          .lte('scheduled_date', filters.date_range.end);
      }

      const { data: bookings, error: bookingsError } = await bookingsQuery;

      if (bookingsError) {
        console.error('Error fetching bookings:', bookingsError);
        throw bookingsError;
      }

      // Create lookup maps
      const addressByUserId = new Map(
        (addresses || []).map(addr => [addr.user_id, addr])
      );

      // Group bookings by user
      const bookingsByUserId = new Map<string, any[]>();
      (bookings || []).forEach(booking => {
        if (!bookingsByUserId.has(booking.client_id)) {
          bookingsByUserId.set(booking.client_id, []);
        }
        bookingsByUserId.get(booking.client_id)!.push(booking);
      });

      // Create location lookup - prefer address table, fallback to most recent booking location
      const locationByUserId = new Map<string, { latitude: number; longitude: number; address: string; city: string; state: string; zip_code: string }>();

      // First, add addresses from addresses table
      (addresses || []).forEach(addr => {
        locationByUserId.set(addr.user_id, {
          latitude: addr.latitude!,
          longitude: addr.longitude!,
          address: addr.street || addr.building || '',
          city: addr.city || '',
          state: addr.state || 'TX',
          zip_code: addr.zip_code || ''
        });
      });

      // Then, add locations from bookings for users without addresses
      (bookings || []).forEach(booking => {
        if (!locationByUserId.has(booking.client_id)) {
          locationByUserId.set(booking.client_id, {
            latitude: booking.latitude!,
            longitude: booking.longitude!,
            address: booking.address || '',
            city: booking.city || '',
            state: booking.state || 'TX',
            zip_code: booking.zip_code || ''
          });
        }
      });

      // Transform users into TerritoryCustomer objects
      const customers: TerritoryCustomer[] = users
        .filter(user => locationByUserId.has(user.id)) // Only include users with geocoded locations
        .map(user => {
          const location = locationByUserId.get(user.id)!;
          const userBookings = bookingsByUserId.get(user.id) || [];

          // Calculate lifetime value
          const lifetime_value = userBookings.reduce(
            (sum, b) => sum + (parseFloat(b.total_amount) || 0),
            0
          );

          // Calculate customer status
          const total_bookings = userBookings.length;
          const now = new Date();
          const sortedBookings = [...userBookings].sort(
            (a, b) => new Date(b.scheduled_date).getTime() - new Date(a.scheduled_date).getTime()
          );

          let status: 'active' | 'warm_lead' | 'at_risk' | 'vip' = 'warm_lead';
          let last_booking_date: string | undefined;
          let next_booking_date: string | undefined;

          if (total_bookings === 0) {
            status = 'warm_lead';
          } else {
            const lastBooking = sortedBookings[0];
            last_booking_date = lastBooking.scheduled_date;

            const daysSinceLastBooking = Math.floor(
              (now.getTime() - new Date(lastBooking.scheduled_date).getTime()) / (1000 * 60 * 60 * 24)
            );

            // Find next upcoming booking
            const upcomingBookings = userBookings.filter(
              b => new Date(b.scheduled_date) > now && b.status === 'confirmed'
            );
            if (upcomingBookings.length > 0) {
              next_booking_date = upcomingBookings[0].scheduled_date;
            }

            // Determine status
            if (lifetime_value > 1000 || total_bookings >= 5) {
              status = 'vip';
            } else if (daysSinceLastBooking <= 60 || upcomingBookings.length > 0) {
              status = 'active';
            } else if (daysSinceLastBooking > 60 && daysSinceLastBooking <= 90 && !next_booking_date) {
              status = 'at_risk';
            }
          }

          const fullName = `${user.first_name || ''} ${user.last_name || ''}`.trim();

          return {
            id: user.id,
            name: fullName || 'Unknown',
            email: user.email,
            phone: user.phone,
            zip_code: location.zip_code,
            latitude: location.latitude,
            longitude: location.longitude,
            lifetime_value,
            total_bookings,
            last_booking_date,
            next_booking_date,
            status,
            address: location.address,
            city: location.city,
            state: location.state
          };
        });

      // Apply filters
      let filteredCustomers = customers;

      if (filters?.status && filters.status.length > 0) {
        filteredCustomers = filteredCustomers.filter(c =>
          filters.status!.includes(c.status)
        );
      }

      if (filters?.min_ltv !== undefined) {
        filteredCustomers = filteredCustomers.filter(c =>
          c.lifetime_value >= filters.min_ltv!
        );
      }

      if (filters?.max_ltv !== undefined) {
        filteredCustomers = filteredCustomers.filter(c =>
          c.lifetime_value <= filters.max_ltv!
        );
      }

      return filteredCustomers;
    } catch (error) {
      console.error('Error fetching territory customers:', error);
      throw error;
    }
  }

  /**
   * Aggregate revenue/bookings by ZIP code
   */
  getZipCodeMetrics(filters?: TerritoryFilters): Observable<ZipCodeMetrics[]> {
    return from(this.fetchZipCodeMetrics(filters));
  }

  private async fetchZipCodeMetrics(filters?: TerritoryFilters): Promise<ZipCodeMetrics[]> {
    try {
      const customers = await this.fetchTerritoryCustomers(filters);

      // Group by ZIP code
      const zipMap = new Map<string, {
        customers: TerritoryCustomer[];
        total_revenue: number;
        total_bookings: number;
        latitude_sum: number;
        longitude_sum: number;
      }>();

      customers.forEach(customer => {
        if (!customer.zip_code) return;

        if (!zipMap.has(customer.zip_code)) {
          zipMap.set(customer.zip_code, {
            customers: [],
            total_revenue: 0,
            total_bookings: 0,
            latitude_sum: 0,
            longitude_sum: 0
          });
        }

        const zip = zipMap.get(customer.zip_code)!;
        zip.customers.push(customer);
        zip.total_revenue += customer.lifetime_value;
        zip.total_bookings += customer.total_bookings;
        zip.latitude_sum += customer.latitude;
        zip.longitude_sum += customer.longitude;
      });

      // Convert to ZipCodeMetrics array
      const metrics: ZipCodeMetrics[] = Array.from(zipMap.entries()).map(([zip_code, data]) => {
        const customer_count = data.customers.length;
        const avg_ltv = data.total_revenue / customer_count;
        const latitude = data.latitude_sum / customer_count;
        const longitude = data.longitude_sum / customer_count;

        // Use first customer's city and state
        const firstCustomer = data.customers[0];

        return {
          zip_code,
          city: firstCustomer.city,
          state: firstCustomer.state,
          customer_count,
          total_revenue: Math.round(data.total_revenue * 100) / 100,
          booking_count: data.total_bookings,
          avg_ltv: Math.round(avg_ltv * 100) / 100,
          latitude,
          longitude
        };
      });

      // Sort by total revenue descending
      return metrics.sort((a, b) => b.total_revenue - a.total_revenue);
    } catch (error) {
      console.error('Error fetching ZIP code metrics:', error);
      throw error;
    }
  }

  /**
   * Calculate dashboard KPIs
   */
  getTerritoryMetrics(filters?: TerritoryFilters): Observable<TerritoryMetrics> {
    return from(this.fetchTerritoryMetrics(filters));
  }

  private async fetchTerritoryMetrics(filters?: TerritoryFilters): Promise<TerritoryMetrics> {
    try {
      const customers = await this.fetchTerritoryCustomers(filters);
      const zipMetrics = await this.fetchZipCodeMetrics(filters);

      const total_customers = customers.length;
      const total_revenue = customers.reduce((sum, c) => sum + c.lifetime_value, 0);
      const total_bookings = customers.reduce((sum, c) => sum + c.total_bookings, 0);
      const avg_bookings_per_customer = total_customers > 0
        ? Math.round((total_bookings / total_customers) * 10) / 10
        : 0;

      // Get top 5 ZIP codes
      const top_zip_codes = zipMetrics.slice(0, 5);

      // Calculate period comparison (compare with previous period)
      let customers_change_percent = 0;
      let revenue_change_percent = 0;

      if (filters?.date_range) {
        // Calculate previous period
        const start = new Date(filters.date_range.start);
        const end = new Date(filters.date_range.end);
        const duration = end.getTime() - start.getTime();
        const prevStart = new Date(start.getTime() - duration);
        const prevEnd = new Date(start);

        const prevFilters: TerritoryFilters = {
          ...filters,
          date_range: {
            start: prevStart.toISOString().split('T')[0],
            end: prevEnd.toISOString().split('T')[0]
          }
        };

        const prevCustomers = await this.fetchTerritoryCustomers(prevFilters);
        const prev_total_customers = prevCustomers.length;
        const prev_total_revenue = prevCustomers.reduce((sum, c) => sum + c.lifetime_value, 0);

        customers_change_percent = prev_total_customers > 0
          ? Math.round(((total_customers - prev_total_customers) / prev_total_customers) * 100)
          : 0;

        revenue_change_percent = prev_total_revenue > 0
          ? Math.round(((total_revenue - prev_total_revenue) / prev_total_revenue) * 100)
          : 0;
      }

      return {
        total_customers,
        total_revenue: Math.round(total_revenue * 100) / 100,
        avg_bookings_per_customer,
        top_zip_codes,
        period_comparison: {
          customers_change_percent,
          revenue_change_percent
        }
      };
    } catch (error) {
      console.error('Error fetching territory metrics:', error);
      throw error;
    }
  }
}
