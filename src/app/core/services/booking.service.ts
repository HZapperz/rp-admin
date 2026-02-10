import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { SupabaseService } from './supabase.service';
import { Observable, from, map } from 'rxjs';
import { BookingWithDetails, BookingStatus, BookingFilters } from '../models/types';
import { environment } from '../../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class BookingService {
  private http = inject(HttpClient);

  constructor(private supabase: SupabaseService) {}

  /**
   * Maps package type to display service name
   */
  private getServiceNameFromPackage(packageType: string): string {
    const packageToServiceName: Record<string, string> = {
      'basic': 'Royal Bath',
      'premium': 'Royal Groom',
      'deluxe': 'Royal Spa'
    };
    return packageToServiceName[packageType] || 'Grooming Service';
  }

  getAllBookings(filters?: BookingFilters): Observable<BookingWithDetails[]> {
    return from(this.fetchBookings(filters));
  }

  private async fetchBookings(filters?: BookingFilters): Promise<BookingWithDetails[]> {
    // Step 1: Fetch base bookings
    let query = this.supabase
      .from('bookings')
      .select('*')
      .order('created_at', { ascending: false });

    // Apply filters
    if (filters?.status && filters.status.length > 0) {
      query = query.in('status', filters.status);
    }

    if (filters?.dateRange) {
      query = query
        .gte('scheduled_date', filters.dateRange.start)
        .lte('scheduled_date', filters.dateRange.end);
    }

    if (filters?.groomerId !== undefined) {
      // Support both filtering by specific groomer and unassigned bookings (null)
      if (filters.groomerId === null || filters.groomerId === '') {
        query = query.is('groomer_id', null);
      } else {
        query = query.eq('groomer_id', filters.groomerId);
      }
    }

    if (filters?.clientId) {
      query = query.eq('client_id', filters.clientId);
    }

    const { data: bookings, error } = await query;

    if (error) {
      console.error('Error fetching bookings:', error);
      throw error;
    }

    if (!bookings || bookings.length === 0) {
      return [];
    }

    // Debug: Log bookings with photos
    const bookingsWithPhotos = bookings.filter(b => b.before_photos?.length > 0 || b.after_photos?.length > 0);
    console.log('Bookings with photos:', bookingsWithPhotos.length, bookingsWithPhotos.map(b => ({ id: b.id, before: b.before_photos, after: b.after_photos })));

    // Step 2: Extract unique IDs (filter out null groomer_id for pending bookings)
    const groomerIds = [...new Set(bookings.map(b => b.groomer_id).filter(Boolean))];
    const clientIds = [...new Set(bookings.map(b => b.client_id).filter(Boolean))];
    const bookingIds = bookings.map(b => b.id);

    // Step 3: Batch fetch all related data in parallel
    const [groomersResult, clientsResult, bookingPetsResult] = await Promise.all([
      groomerIds.length > 0
        ? this.supabase
            .from('users')
            .select('id, first_name, last_name, avatar_url, phone, email')
            .in('id', groomerIds)
        : Promise.resolve({ data: [], error: null }),
      this.supabase
        .from('users')
        .select('id, first_name, last_name, avatar_url, phone, email')
        .in('id', clientIds),
      this.supabase
        .from('booking_pets')
        .select('*')
        .in('booking_id', bookingIds)
    ]);

    if (groomersResult.error) console.error('Error fetching groomers:', groomersResult.error);
    if (clientsResult.error) console.error('Error fetching clients:', clientsResult.error);
    if (bookingPetsResult.error) console.error('Error fetching booking pets:', bookingPetsResult.error);

    // Step 4: Fetch pets and addons
    const petIds = [...new Set((bookingPetsResult.data || []).map(bp => bp.pet_id).filter(Boolean))];
    const bookingPetIds = (bookingPetsResult.data || []).map(bp => bp.id);

    const [petsResult, addonsResult] = await Promise.all([
      petIds.length > 0
        ? this.supabase.from('pets').select('*').in('id', petIds)
        : Promise.resolve({ data: [], error: null }),
      bookingPetIds.length > 0
        ? this.supabase.from('booking_addons').select('*').in('booking_pet_id', bookingPetIds)
        : Promise.resolve({ data: [], error: null })
    ]);

    // Step 5: Create lookup objects for O(1) access
    const groomersLookup: Record<string, any> = (groomersResult.data || []).reduce((acc, g) => {
      acc[g.id] = g;
      return acc;
    }, {} as Record<string, any>);

    const clientsLookup: Record<string, any> = (clientsResult.data || []).reduce((acc, c) => {
      acc[c.id] = c;
      return acc;
    }, {} as Record<string, any>);

    const petsLookup: Record<string, any> = (petsResult.data || []).reduce((acc, p) => {
      acc[p.id] = p;
      return acc;
    }, {} as Record<string, any>);

    const addonsByBookingPetId: Record<string, any[]> = (addonsResult.data || []).reduce((acc, addon) => {
      if (!acc[addon.booking_pet_id]) {
        acc[addon.booking_pet_id] = [];
      }
      acc[addon.booking_pet_id].push(addon);
      return acc;
    }, {} as Record<string, any[]>);

    const bookingPetsByBookingId: Record<string, any[]> = (bookingPetsResult.data || []).reduce((acc, bp) => {
      if (!acc[bp.booking_id]) {
        acc[bp.booking_id] = [];
      }
      acc[bp.booking_id].push({
        ...bp,
        pet: petsLookup[bp.pet_id],
        addons: addonsByBookingPetId[bp.id] || []
      });
      return acc;
    }, {} as Record<string, any[]>);

    // Step 6: Combine and return enriched data
    const bookingsWithDetails: BookingWithDetails[] = bookings.map(booking => ({
      ...booking,
      groomer: groomersLookup[booking.groomer_id] || undefined,
      client: clientsLookup[booking.client_id] || undefined,
      pets: bookingPetsByBookingId[booking.id] || []
    }));

    return bookingsWithDetails;
  }

  async getBookingById(id: string): Promise<BookingWithDetails | null> {
    console.log('getBookingById called for:', id);

    // Fetch single booking
    const { data: booking, error } = await this.supabase
      .from('bookings')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      console.error('Error fetching booking:', error);
      return null;
    }

    if (!booking) {
      console.warn('No booking found for id:', id);
      return null;
    }

    console.log('Booking fetched, now fetching related data...', {
      bookingId: booking.id,
      before_photos: booking.before_photos,
      after_photos: booking.after_photos,
      hasPhotos: !!(booking.before_photos?.length || booking.after_photos?.length)
    });

    // Batch fetch related data (groomer might be null for pending bookings)
    const [groomerResult, clientResult, bookingPetsResult] = await Promise.all([
      booking.groomer_id
        ? this.supabase
            .from('users')
            .select('id, first_name, last_name, avatar_url, phone, email')
            .eq('id', booking.groomer_id)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      this.supabase
        .from('users')
        .select('id, first_name, last_name, avatar_url, phone, email')
        .eq('id', booking.client_id)
        .single(),
      this.supabase
        .from('booking_pets')
        .select('*')
        .eq('booking_id', booking.id)
    ]);

    console.log('Booking pets fetched:', {
      count: bookingPetsResult.data?.length || 0,
      hasError: !!bookingPetsResult.error,
      error: bookingPetsResult.error
    });

    if (bookingPetsResult.error) {
      console.error('Error fetching booking_pets:', bookingPetsResult.error);
    }

    // Fetch pets and addons for this booking
    const bookingPetIds = (bookingPetsResult.data || []).map(bp => bp.id);
    const petIds = [...new Set((bookingPetsResult.data || []).map(bp => bp.pet_id).filter(Boolean))];

    console.log('Pet IDs to fetch:', { petIds, bookingPetIds });

    const [petsResult, addonsResult] = await Promise.all([
      petIds.length > 0
        ? this.supabase.from('pets').select('*').in('id', petIds)
        : Promise.resolve({ data: [], error: null }),
      bookingPetIds.length > 0
        ? this.supabase.from('booking_addons').select('*').in('booking_pet_id', bookingPetIds)
        : Promise.resolve({ data: [], error: null })
    ]);

    console.log('Pets fetched:', {
      count: petsResult.data?.length || 0,
      hasError: !!petsResult.error
    });

    // Create lookups
    const petsLookup: Record<string, any> = (petsResult.data || []).reduce((acc, p) => {
      acc[p.id] = p;
      return acc;
    }, {} as Record<string, any>);

    const addonsByBookingPetId: Record<string, any[]> = (addonsResult.data || []).reduce((acc, addon) => {
      if (!acc[addon.booking_pet_id]) {
        acc[addon.booking_pet_id] = [];
      }
      acc[addon.booking_pet_id].push(addon);
      return acc;
    }, {} as Record<string, any[]>);

    const petsWithDetails = (bookingPetsResult.data || []).map(bp => ({
      ...bp,
      pet: petsLookup[bp.pet_id],
      addons: addonsByBookingPetId[bp.id] || []
    }));

    console.log('Final pets with details:', {
      count: petsWithDetails.length,
      pets: petsWithDetails
    });

    return {
      ...booking,
      groomer: groomerResult.data || undefined,
      client: clientResult.data || undefined,
      pets: petsWithDetails
    };
  }

  async approveBooking(bookingId: string, groomerId: string, scheduledDate: string, timeSlotStart: string, timeSlotEnd: string): Promise<boolean> {
    try {
      console.log('Attempting to approve booking...', {
        bookingId,
        groomerId,
        scheduledDate,
        timeSlotStart,
        timeSlotEnd,
        currentUser: this.supabase.session?.user?.id
      });

      // Update booking with groomer assignment, date, time slots, and confirm status
      const { data, error } = await this.supabase
        .from('bookings')
        .update({
          groomer_id: groomerId,
          scheduled_date: scheduledDate,
          scheduled_time_start: timeSlotStart,
          scheduled_time_end: timeSlotEnd,
          status: 'confirmed',
          updated_at: new Date().toISOString()
        })
        .eq('id', bookingId)
        .select();

      if (error) {
        console.error('Error approving booking:', {
          error,
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code
        });
        return false;
      }

      console.log('Booking approved successfully', { data });
      return true;
    } catch (error) {
      console.error('Exception while approving booking:', error);
      return false;
    }
  }

  async rejectBooking(bookingId: string, reason?: string): Promise<boolean> {
    const { error } = await this.supabase
      .from('bookings')
      .update({
        status: 'cancelled',
        cancellation_reason: reason || 'Rejected by admin',
        cancelled_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', bookingId);

    if (error) {
      console.error('Error rejecting booking:', error);
      return false;
    }

    return true;
  }

  async assignGroomer(bookingId: string, groomerId: string): Promise<boolean> {
    const { error } = await this.supabase
      .from('bookings')
      .update({
        groomer_id: groomerId,
        updated_at: new Date().toISOString()
      })
      .eq('id', bookingId);

    if (error) {
      console.error('Error assigning groomer:', error);
      return false;
    }

    return true;
  }

  async updateBookingStatus(bookingId: string, status: BookingStatus): Promise<boolean> {
    const { error } = await this.supabase
      .from('bookings')
      .update({
        status,
        updated_at: new Date().toISOString()
      })
      .eq('id', bookingId);

    if (error) {
      console.error('Error updating booking status:', error);
      return false;
    }

    return true;
  }

  async changeBookingTime(
    bookingId: string,
    newDate: string,
    newTimeStart: string,
    newTimeEnd: string
  ): Promise<{ success: boolean; oldValues?: { scheduled_date: string; scheduled_time_start: string; scheduled_time_end: string } }> {
    try {
      // Validate inputs
      if (!newDate || !newTimeStart || !newTimeEnd) {
        console.error('Missing required time change parameters:', { newDate, newTimeStart, newTimeEnd });
        return { success: false };
      }

      // Validate time format (HH:MM:SS or HH:MM)
      const timeRegex = /^\d{1,2}:\d{2}(:\d{2})?$/;
      if (!timeRegex.test(newTimeStart) || !timeRegex.test(newTimeEnd)) {
        console.error('Invalid time format:', { newTimeStart, newTimeEnd });
        return { success: false };
      }

      // Ensure time has seconds (HH:MM:SS format)
      const formatTime = (time: string): string => {
        return time.includes(':') && time.split(':').length === 2 ? `${time}:00` : time;
      };

      const formattedStartTime = formatTime(newTimeStart);
      const formattedEndTime = formatTime(newTimeEnd);

      console.log('Changing booking time:', {
        bookingId,
        newDate,
        newTimeStart: formattedStartTime,
        newTimeEnd: formattedEndTime
      });

      // 1. Fetch current booking to get old values (for email notification)
      const { data: currentBooking, error: fetchError } = await this.supabase
        .from('bookings')
        .select('scheduled_date, scheduled_time_start, scheduled_time_end')
        .eq('id', bookingId)
        .single();

      if (fetchError || !currentBooking) {
        console.error('Error fetching current booking:', fetchError);
        return { success: false };
      }

      const oldValues = {
        scheduled_date: currentBooking.scheduled_date,
        scheduled_time_start: currentBooking.scheduled_time_start,
        scheduled_time_end: currentBooking.scheduled_time_end
      };

      // 2. Update booking with new date/time
      const { error: updateError } = await this.supabase
        .from('bookings')
        .update({
          scheduled_date: newDate,
          scheduled_time_start: formattedStartTime,
          scheduled_time_end: formattedEndTime,
          updated_at: new Date().toISOString()
        })
        .eq('id', bookingId);

      if (updateError) {
        console.error('Error updating booking time:', updateError);
        return { success: false };
      }

      console.log('Booking time updated successfully');
      return { success: true, oldValues };
    } catch (error) {
      console.error('Exception while changing booking time:', error);
      return { success: false };
    }
  }

  async changeBookingService(
    bookingId: string,
    bookingPetId: string,
    newPackageType: string,
    newPackagePrice: number,
    newTotalPrice: number,
    addons: { name: string; price: number }[],
    reason: string,
    newDiscountAmount?: number
  ): Promise<{
    success: boolean;
    oldValues?: { package_type: string; total_price: number; addons: any[] };
    newBookingTotal?: number;
  }> {
    try {
      // 1. Fetch current booking_pet data for logging old values
      const { data: currentPet, error: fetchPetError } = await this.supabase
        .from('booking_pets')
        .select('*')
        .eq('id', bookingPetId)
        .single();

      if (fetchPetError || !currentPet) {
        console.error('Error fetching current booking pet:', fetchPetError);
        return { success: false };
      }

      // 2. Fetch current addons for this pet
      const { data: currentAddons, error: fetchAddonsError } = await this.supabase
        .from('booking_addons')
        .select('*')
        .eq('booking_pet_id', bookingPetId);

      if (fetchAddonsError) {
        console.error('Error fetching current addons:', fetchAddonsError);
        return { success: false };
      }

      const oldValues = {
        package_type: currentPet.package_type,
        total_price: parseFloat(currentPet.total_price) || 0,
        addons: currentAddons || []
      };

      // 3. Update booking_pets record with new package_type and prices
      const { error: updatePetError } = await this.supabase
        .from('booking_pets')
        .update({
          package_type: newPackageType,
          package_price: newPackagePrice,
          total_price: newTotalPrice
        })
        .eq('id', bookingPetId);

      if (updatePetError) {
        console.error('Error updating booking pet:', updatePetError);
        return { success: false };
      }

      // 4. Delete existing booking_addons for this pet
      const { error: deleteAddonsError } = await this.supabase
        .from('booking_addons')
        .delete()
        .eq('booking_pet_id', bookingPetId);

      if (deleteAddonsError) {
        console.error('Error deleting old addons:', deleteAddonsError);
        // Continue anyway, as the main update succeeded
      }

      // 5. Insert new booking_addons records
      if (addons.length > 0) {
        const addonRecords = addons.map(addon => ({
          booking_pet_id: bookingPetId,
          addon_name: addon.name,
          addon_price: addon.price
        }));

        const { error: insertAddonsError } = await this.supabase
          .from('booking_addons')
          .insert(addonRecords);

        if (insertAddonsError) {
          console.error('Error inserting new addons:', insertAddonsError);
          // Continue anyway
        }
      }

      // 6. Recalculate and update bookings.total_amount
      // First, get all booking_pets for this booking to sum their totals
      const { data: allBookingPets, error: fetchAllPetsError } = await this.supabase
        .from('booking_pets')
        .select('total_price')
        .eq('booking_id', bookingId);

      if (fetchAllPetsError) {
        console.error('Error fetching all booking pets:', fetchAllPetsError);
        return { success: false };
      }

      // Calculate new subtotal from all pets
      const subtotal = (allBookingPets || []).reduce(
        (sum, pet) => sum + (parseFloat(pet.total_price) || 0),
        0
      );

      // Get current booking for tax rate and fees
      const { data: currentBooking, error: fetchBookingError } = await this.supabase
        .from('bookings')
        .select('tax_rate, service_fee, processing_fee, rush_fee, discount_amount')
        .eq('id', bookingId)
        .single();

      if (fetchBookingError || !currentBooking) {
        console.error('Error fetching current booking:', fetchBookingError);
        return { success: false };
      }

      // Calculate tax and new total
      const taxRate = parseFloat(currentBooking.tax_rate) || 0.0825;
      const serviceFee = parseFloat(currentBooking.service_fee) || 0;
      const processingFee = parseFloat(currentBooking.processing_fee) || 0;
      const rushFee = parseFloat(currentBooking.rush_fee) || 0;
      // Use new discount amount if provided, otherwise keep existing
      const discountAmount = newDiscountAmount !== undefined
        ? newDiscountAmount
        : (parseFloat(currentBooking.discount_amount) || 0);

      const subtotalBeforeTax = subtotal + serviceFee + rushFee - discountAmount;
      const taxAmount = Math.round(subtotalBeforeTax * taxRate * 100) / 100;
      const newTotalAmount = Math.round((subtotalBeforeTax + taxAmount + processingFee) * 100) / 100;

      // Update booking totals, service_name, and discount
      const serviceName = this.getServiceNameFromPackage(newPackageType);
      const { error: updateBookingError } = await this.supabase
        .from('bookings')
        .update({
          service_name: serviceName,
          discount_amount: discountAmount,
          subtotal_before_tax: subtotalBeforeTax,
          tax_amount: taxAmount,
          total_amount: newTotalAmount,
          updated_at: new Date().toISOString()
        })
        .eq('id', bookingId);

      if (updateBookingError) {
        console.error('Error updating booking totals:', updateBookingError);
        return { success: false };
      }

      // 7. Log modification to booking_modifications table
      const currentUser = this.supabase.session?.user;
      const priceChange = newTotalPrice - oldValues.total_price;

      const { error: logError } = await this.supabase
        .from('booking_modifications')
        .insert({
          booking_id: bookingId,
          modified_by: currentUser?.id,
          modification_type: 'service_adjustment',
          old_value: {
            package_type: oldValues.package_type,
            total_price: oldValues.total_price,
            addons: oldValues.addons.map(a => ({ name: a.addon_name, price: a.addon_price }))
          },
          new_value: {
            package_type: newPackageType,
            total_price: newTotalPrice,
            addons: addons
          },
          price_change: priceChange,
          reason: reason
        });

      if (logError) {
        console.error('Error logging modification:', logError);
        // Don't fail the operation for logging error
      }

      return { success: true, oldValues, newBookingTotal: newTotalAmount };
    } catch (error) {
      console.error('Exception while changing booking service:', error);
      return { success: false };
    }
  }

  /**
   * Remove a pet from a booking
   * This will delete the booking_pets record and its addons, then update the booking totals
   */
  async removePetFromBooking(
    bookingId: string,
    bookingPetId: string,
    newTotals: {
      newOriginalSubtotal: number;
      newDiscountAmount: number;
      newSubtotalBeforeTax: number;
      newTaxAmount: number;
      newTotalAmount: number;
    },
    reason: string,
    modifiedBy: string
  ): Promise<boolean> {
    try {
      // 1. Get the pet info before deleting (for logging)
      const { data: petInfo, error: petInfoError } = await this.supabase
        .from('booking_pets')
        .select(`
          *,
          pet:pets(name, breed),
          addons:booking_addons(addon_name, addon_price)
        `)
        .eq('id', bookingPetId)
        .single();

      if (petInfoError || !petInfo) {
        console.error('Error fetching pet info:', petInfoError);
        return false;
      }

      // 2. Delete booking_addons for this pet
      const { error: deleteAddonsError } = await this.supabase
        .from('booking_addons')
        .delete()
        .eq('booking_pet_id', bookingPetId);

      if (deleteAddonsError) {
        console.error('Error deleting booking addons:', deleteAddonsError);
        return false;
      }

      // 3. Delete the booking_pets record
      const { error: deletePetError } = await this.supabase
        .from('booking_pets')
        .delete()
        .eq('id', bookingPetId);

      if (deletePetError) {
        console.error('Error deleting booking pet:', deletePetError);
        return false;
      }

      // 4. Update the booking totals
      const { error: updateBookingError } = await this.supabase
        .from('bookings')
        .update({
          original_subtotal: newTotals.newOriginalSubtotal,
          discount_amount: newTotals.newDiscountAmount,
          subtotal_before_tax: newTotals.newSubtotalBeforeTax,
          tax_amount: newTotals.newTaxAmount,
          total_amount: newTotals.newTotalAmount,
          updated_at: new Date().toISOString()
        })
        .eq('id', bookingId);

      if (updateBookingError) {
        console.error('Error updating booking totals:', updateBookingError);
        return false;
      }

      // 5. Log modification to booking_modifications table
      const petTotal = parseFloat(petInfo.total_price || '0');
      const addonsTotal = (petInfo.addons || []).reduce((sum: number, a: any) => sum + parseFloat(a.addon_price || '0'), 0);
      const priceChange = -(petTotal + addonsTotal);

      const { error: logError } = await this.supabase
        .from('booking_modifications')
        .insert({
          booking_id: bookingId,
          modified_by: modifiedBy,
          modification_type: 'pet_removed',
          old_value: {
            pet_name: petInfo.pet?.name,
            pet_breed: petInfo.pet?.breed,
            package_type: petInfo.package_type,
            total_price: petInfo.total_price,
            addons: petInfo.addons?.map((a: any) => ({ name: a.addon_name, price: a.addon_price })) || []
          },
          new_value: null,
          price_change: priceChange,
          reason: reason
        });

      if (logError) {
        console.error('Error logging pet removal:', logError);
        // Don't fail the operation for logging error
      }

      return true;
    } catch (error) {
      console.error('Exception while removing pet from booking:', error);
      return false;
    }
  }

  async getBookingStats(): Promise<{
    total: number;
    pending: number;
    confirmed: number;
    completed: number;
    cancelled: number;
  }> {
    const { data, error } = await this.supabase
      .from('bookings')
      .select('status');

    if (error) {
      console.error('Error fetching booking stats:', error);
      return { total: 0, pending: 0, confirmed: 0, completed: 0, cancelled: 0 };
    }

    const stats = {
      total: data.length,
      pending: data.filter(b => b.status === 'pending').length,
      confirmed: data.filter(b => b.status === 'confirmed').length,
      completed: data.filter(b => b.status === 'completed').length,
      cancelled: data.filter(b => b.status === 'cancelled').length
    };

    return stats;
  }
}
