import { Injectable } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { Observable, from } from 'rxjs';
import { environment } from '../../../environments/environment';

// Types for create/update operations
export interface CreateClientData {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
}

export interface UpdateClientData {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
}

export interface AddressFormData {
  name: string;
  building: string;
  apartment?: string;
  floor?: string;
  street: string;
  city?: string;
  state?: string;
  zip_code?: string;
  additional_info?: string;
  address_type: 'home' | 'work' | 'other';
  is_default?: boolean;
}

export interface ClientWithStats {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone?: string;
  avatar_url?: string;
  created_at: string;
  total_bookings: number;
  total_spent: number;
  last_booking_date?: string;
  blocked_at?: string;
  last_sign_in_at?: string;
}

export interface Pet {
  id: string;
  user_id: string;
  name: string;
  breed?: string;
  age?: string;
  date_of_birth?: string;
  size_category?: 'small' | 'medium' | 'large' | 'xl';
  special_notes?: string;
  photo_url?: string;
  rabies_certificate_url?: string;
  has_allergies?: boolean;
  allergy_details?: string;
  has_skin_conditions?: boolean;
  skin_condition_details?: string;
  is_friendly?: boolean;
  blow_dryer_reaction?: string;
  water_reaction?: string;
  has_behavioral_issues?: boolean;
  behavioral_issue_details?: string;
  additional_notes?: string;
  created_at: string;
  updated_at: string;
}

export interface Address {
  id: string;
  user_id: string;
  name: string;
  building: string;
  apartment?: string;
  floor?: string;
  street: string;
  city?: string;
  state?: string;
  zip_code?: string;
  additional_info?: string;
  address_type: 'home' | 'work' | 'other';
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

export interface PaymentMethod {
  id: string;
  user_id: string;
  stripe_customer_id: string;
  stripe_payment_method_id: string;
  brand: string;
  last4: string;
  exp_month: number;
  exp_year: number;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

export interface Rating {
  id: string;
  booking_id: string;
  client_id: string;
  groomer_id: string;
  experience_rating: number;
  recommendation_rating: number;
  quality_rating: number;
  comment?: string;
  reviewer_role: 'CLIENT' | 'GROOMER';
  created_at: string;
  groomer?: {
    first_name: string;
    last_name: string;
  };
}

export interface AdminNote {
  id: string;
  entity_type: 'booking' | 'user' | 'payment';
  entity_id: string;
  note: string;
  priority?: 'low' | 'medium' | 'high' | 'urgent';
  admin_id: string;
  created_at: string;
  updated_at: string;
  admin?: {
    first_name: string;
    last_name: string;
  };
}

export interface ClientDetailData {
  client: ClientWithStats;
  pets: Pet[];
  addresses: Address[];
  paymentMethods: PaymentMethod[];
  bookings: any[];
  ratings: Rating[];
  adminNotes: AdminNote[];
}

@Injectable({
  providedIn: 'root'
})
export class ClientService {
  constructor(private supabase: SupabaseService) {}

  /**
   * Get authorization headers for API calls
   */
  private getAuthHeaders(): Record<string, string> {
    const session = this.supabase.session;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (session?.access_token) {
      headers['Authorization'] = `Bearer ${session.access_token}`;
    }
    return headers;
  }

  getAllClients(search?: string): Observable<ClientWithStats[]> {
    return from(this.fetchClients(search));
  }

  private async fetchClients(search?: string): Promise<ClientWithStats[]> {
    // Step 1: Get all clients
    let query = this.supabase
      .from('users')
      .select('id, first_name, last_name, email, phone, avatar_url, created_at')
      .eq('role', 'CLIENT')
      .order('created_at', { ascending: false });

    if (search) {
      // First, find user_ids of clients whose pets match the search term
      const { data: matchingPets } = await this.supabase
        .from('pets')
        .select('user_id')
        .ilike('name', `%${search}%`);

      const petOwnerIds = matchingPets?.map(p => p.user_id).filter(Boolean) || [];

      // Build the search query with client fields OR pet owner IDs
      if (petOwnerIds.length > 0) {
        query = query.or(`first_name.ilike.%${search}%,last_name.ilike.%${search}%,email.ilike.%${search}%,id.in.(${petOwnerIds.join(',')})`);
      } else {
        query = query.or(`first_name.ilike.%${search}%,last_name.ilike.%${search}%,email.ilike.%${search}%`);
      }
    }

    const { data: clients, error } = await query;

    if (error) {
      console.error('Error fetching clients:', error);
      throw error;
    }

    if (!clients || clients.length === 0) {
      return [];
    }

    // Step 2: Batch fetch all bookings for these clients
    const clientIds = clients.map(c => c.id);

    const { data: bookings } = await this.supabase
      .from('bookings')
      .select('client_id, total_amount, scheduled_date, status')
      .in('client_id', clientIds)
      .eq('status', 'completed');

    // Step 3: Create lookup by client_id
    const bookingsByClient: Record<string, any[]> = (bookings || []).reduce((acc, booking) => {
      if (!acc[booking.client_id]) {
        acc[booking.client_id] = [];
      }
      acc[booking.client_id].push(booking);
      return acc;
    }, {} as Record<string, any[]>);

    // Step 4: Combine and calculate stats
    const clientsWithStats: ClientWithStats[] = clients.map(client => {
      const clientBookings = bookingsByClient[client.id] || [];

      const totalBookings = clientBookings.length;
      const totalSpent = clientBookings.reduce((sum, b) => sum + (b.total_amount || 0), 0);
      const lastBookingDate = clientBookings.length > 0
        ? clientBookings.sort((a, b) => new Date(b.scheduled_date).getTime() - new Date(a.scheduled_date).getTime())[0].scheduled_date
        : undefined;

      return {
        ...client,
        total_bookings: totalBookings,
        total_spent: totalSpent,
        last_booking_date: lastBookingDate
      };
    });

    return clientsWithStats;
  }

  async getClientById(id: string): Promise<ClientWithStats | null> {
    // Fetch client
    const { data: client, error } = await this.supabase
      .from('users')
      .select('*')
      .eq('id', id)
      .eq('role', 'CLIENT')
      .single();

    if (error) {
      console.error('Error fetching client:', error);
      return null;
    }

    if (!client) return null;

    // Get booking stats and auth info in parallel
    const [bookingsResult, authInfoResult] = await Promise.all([
      this.supabase
        .from('bookings')
        .select('total_amount, scheduled_date')
        .eq('client_id', id)
        .eq('status', 'completed'),
      this.supabase.client.rpc('get_user_auth_info', { user_id: id })
    ]);

    const bookings = bookingsResult.data as { total_amount: number; scheduled_date: string }[] | null;
    const authInfo = authInfoResult.data as { last_sign_in_at: string | null }[] | null;

    const totalBookings = bookings?.length || 0;
    const totalSpent = bookings?.reduce((sum: number, b) => sum + (b.total_amount || 0), 0) || 0;
    const lastBookingDate = bookings && bookings.length > 0
      ? bookings.sort((a, b) => new Date(b.scheduled_date).getTime() - new Date(a.scheduled_date).getTime())[0].scheduled_date
      : undefined;

    return {
      ...client,
      total_bookings: totalBookings,
      total_spent: totalSpent,
      last_booking_date: lastBookingDate,
      last_sign_in_at: authInfo?.[0]?.last_sign_in_at || null
    };
  }

  async getClientBookings(clientId: string) {
    const { data, error } = await this.supabase
      .from('bookings')
      .select('*')
      .eq('client_id', clientId)
      .order('scheduled_date', { ascending: false });

    if (error) {
      console.error('Error fetching client bookings:', error);
      return [];
    }

    return data;
  }

  async blockClient(clientId: string): Promise<boolean> {
    const { error } = await this.supabase
      .from('users')
      .update({
        blocked_at: new Date().toISOString()
      })
      .eq('id', clientId);

    if (error) {
      console.error('Error blocking client:', error);
      return false;
    }

    return true;
  }

  async unblockClient(clientId: string): Promise<boolean> {
    const { error } = await this.supabase
      .from('users')
      .update({
        blocked_at: null
      })
      .eq('id', clientId);

    if (error) {
      console.error('Error unblocking client:', error);
      return false;
    }

    return true;
  }

  async getClientStats(): Promise<{
    total: number;
    active: number;
    blocked: number;
  }> {
    const { data, error } = await this.supabase
      .from('users')
      .select('blocked_at')
      .eq('role', 'CLIENT');

    if (error) {
      console.error('Error fetching client stats:', error);
      return { total: 0, active: 0, blocked: 0 };
    }

    const total = data.length;
    const blocked = data.filter(c => c.blocked_at !== null).length;
    const active = total - blocked;

    return { total, active, blocked };
  }

  async getClientPets(clientId: string): Promise<Pet[]> {
    const { data, error } = await this.supabase
      .from('pets')
      .select('*')
      .eq('user_id', clientId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching client pets:', error);
      return [];
    }

    return data || [];
  }

  async getClientAddresses(clientId: string): Promise<Address[]> {
    console.log('Fetching addresses for client ID:', clientId);
    
    const { data, error } = await this.supabase
      .from('addresses')
      .select('*')
      .eq('user_id', clientId)
      .order('is_default', { ascending: false });

    if (error) {
      console.error('Error fetching client addresses:', error);
      console.error('Error details:', JSON.stringify(error, null, 2));
      return [];
    }

    console.log('Fetched addresses:', data);
    return data || [];
  }

  async getClientPaymentMethods(clientId: string): Promise<PaymentMethod[]> {
    const { data, error } = await this.supabase
      .from('payment_methods')
      .select('*')
      .eq('user_id', clientId)
      .order('is_default', { ascending: false });

    if (error) {
      console.error('Error fetching payment methods:', error);
      return [];
    }

    return data || [];
  }

  async getClientRatings(clientId: string): Promise<Rating[]> {
    const { data, error } = await this.supabase
      .from('ratings')
      .select(`
        *,
        groomer:groomer_id (
          first_name,
          last_name
        )
      `)
      .eq('client_id', clientId)
      .eq('reviewer_role', 'CLIENT')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching client ratings:', error);
      return [];
    }

    return data || [];
  }

  async getClientAdminNotes(clientId: string): Promise<AdminNote[]> {
    const { data, error } = await this.supabase
      .from('admin_notes')
      .select(`
        *,
        admin:admin_id (
          first_name,
          last_name
        )
      `)
      .eq('entity_type', 'user')
      .eq('entity_id', clientId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching admin notes:', error);
      return [];
    }

    return data || [];
  }

  async createAdminNote(
    entityType: 'booking' | 'user' | 'payment',
    entityId: string,
    note: string,
    priority: 'low' | 'medium' | 'high' | 'urgent',
    adminId: string
  ): Promise<AdminNote | null> {
    const { data, error } = await this.supabase
      .from('admin_notes')
      .insert({
        entity_type: entityType,
        entity_id: entityId,
        note,
        priority,
        admin_id: adminId
      })
      .select(`
        *,
        admin:admin_id (
          first_name,
          last_name
        )
      `)
      .single();

    if (error) {
      console.error('Error creating admin note:', error);
      return null;
    }

    return data;
  }

  async getClientDetailData(clientId: string): Promise<ClientDetailData | null> {
    try {
      const [client, pets, addresses, paymentMethods, bookings, ratings, adminNotes] = await Promise.all([
        this.getClientById(clientId),
        this.getClientPets(clientId),
        this.getClientAddresses(clientId),
        this.getClientPaymentMethods(clientId),
        this.getClientBookings(clientId),
        this.getClientRatings(clientId),
        this.getClientAdminNotes(clientId)
      ]);

      if (!client) {
        return null;
      }

      return {
        client,
        pets,
        addresses,
        paymentMethods,
        bookings,
        ratings,
        adminNotes
      };
    } catch (error) {
      console.error('Error fetching client detail data:', error);
      return null;
    }
  }

  // Upload file to Supabase Storage
  async uploadFile(
    file: File,
    bucket: string,
    userId: string
  ): Promise<string | null> {
    const fileExt = file.name.split('.').pop();
    const fileName = `${Date.now()}.${fileExt}`;
    const filePath = `${userId}/${fileName}`;

    const { error: uploadError } = await this.supabase.client.storage
      .from(bucket)
      .upload(filePath, file);

    if (uploadError) {
      console.error('Upload error:', uploadError);
      return null;
    }

    // Return storage path format: bucket/path
    return `${bucket}/${filePath}`;
  }

  // Create a new pet for a client
  async createPet(clientId: string, petData: {
    name: string;
    breed?: string;
    date_of_birth?: string;
    size_category?: 'small' | 'medium' | 'large' | 'xl';
    photo_url?: string | null;
    rabies_certificate_url?: string | null;
    rabies_pending?: boolean;
    has_allergies?: boolean;
    allergy_details?: string;
    has_skin_conditions?: boolean;
    skin_condition_details?: string;
    is_friendly?: boolean;
    blow_dryer_reaction?: string;
    water_reaction?: string;
    has_behavioral_issues?: boolean;
    behavioral_issue_details?: string;
    additional_notes?: string;
  }): Promise<Pet | null> {
    const { data, error } = await this.supabase
      .from('pets')
      .insert({
        user_id: clientId,
        name: petData.name.trim(),
        breed: petData.breed?.trim() || null,
        date_of_birth: petData.date_of_birth || null,
        size_category: petData.size_category || 'medium',
        photo_url: petData.photo_url || null,
        rabies_certificate_url: petData.rabies_certificate_url || null,
        rabies_pending: petData.rabies_pending || false,
        rabies_pending_acknowledged_at: petData.rabies_pending ? new Date().toISOString() : null,
        has_allergies: petData.has_allergies || false,
        allergy_details: petData.has_allergies ? petData.allergy_details?.trim() : null,
        has_skin_conditions: petData.has_skin_conditions || false,
        skin_condition_details: petData.has_skin_conditions ? petData.skin_condition_details?.trim() : null,
        is_friendly: petData.is_friendly ?? true,
        blow_dryer_reaction: petData.blow_dryer_reaction || null,
        water_reaction: petData.water_reaction || null,
        has_behavioral_issues: petData.has_behavioral_issues || false,
        behavioral_issue_details: petData.has_behavioral_issues ? petData.behavioral_issue_details?.trim() : null,
        additional_notes: petData.additional_notes?.trim() || null,
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating pet:', error);
      throw error;
    }

    return data;
  }

  // Update an existing pet
  async updatePet(clientId: string, petId: string, petData: Partial<{
    name: string;
    breed?: string;
    date_of_birth?: string;
    size_category?: 'small' | 'medium' | 'large' | 'xl';
    photo_url?: string | null;
    rabies_certificate_url?: string | null;
    rabies_pending?: boolean;
    has_allergies?: boolean;
    allergy_details?: string;
    has_skin_conditions?: boolean;
    skin_condition_details?: string;
    is_friendly?: boolean;
    blow_dryer_reaction?: string;
    water_reaction?: string;
    has_behavioral_issues?: boolean;
    behavioral_issue_details?: string;
    additional_notes?: string;
  }>): Promise<Pet | null> {
    const updateData: any = {};

    if (petData.name !== undefined) updateData.name = petData.name.trim();
    if (petData.breed !== undefined) updateData.breed = petData.breed?.trim() || null;
    if (petData.date_of_birth !== undefined) updateData.date_of_birth = petData.date_of_birth || null;
    if (petData.size_category !== undefined) updateData.size_category = petData.size_category;
    if (petData.photo_url !== undefined) updateData.photo_url = petData.photo_url || null;
    if (petData.rabies_certificate_url !== undefined) updateData.rabies_certificate_url = petData.rabies_certificate_url || null;
    if (petData.rabies_pending !== undefined) {
      updateData.rabies_pending = petData.rabies_pending;
      if (petData.rabies_pending) {
        updateData.rabies_pending_acknowledged_at = new Date().toISOString();
      }
    }
    if (petData.has_allergies !== undefined) {
      updateData.has_allergies = petData.has_allergies;
      updateData.allergy_details = petData.has_allergies ? petData.allergy_details?.trim() : null;
    }
    if (petData.has_skin_conditions !== undefined) {
      updateData.has_skin_conditions = petData.has_skin_conditions;
      updateData.skin_condition_details = petData.has_skin_conditions ? petData.skin_condition_details?.trim() : null;
    }
    if (petData.is_friendly !== undefined) updateData.is_friendly = petData.is_friendly;
    if (petData.blow_dryer_reaction !== undefined) updateData.blow_dryer_reaction = petData.blow_dryer_reaction || null;
    if (petData.water_reaction !== undefined) updateData.water_reaction = petData.water_reaction || null;
    if (petData.has_behavioral_issues !== undefined) {
      updateData.has_behavioral_issues = petData.has_behavioral_issues;
      updateData.behavioral_issue_details = petData.has_behavioral_issues ? petData.behavioral_issue_details?.trim() : null;
    }
    if (petData.additional_notes !== undefined) updateData.additional_notes = petData.additional_notes?.trim() || null;

    const { data, error } = await this.supabase
      .from('pets')
      .update(updateData)
      .eq('id', petId)
      .eq('user_id', clientId)
      .select()
      .single();

    if (error) {
      console.error('Error updating pet:', error);
      throw error;
    }

    return data;
  }

  // ============================================
  // NEW: Admin Client Management Methods
  // ============================================

  /**
   * Create a new client account with invite email
   */
  async createClient(data: CreateClientData): Promise<{ id: string; email: string } | null> {
    try {
      const response = await fetch(`${environment.apiUrl}/api/admin/clients`, {
        method: 'POST',
        headers: this.getAuthHeaders(),
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to create client');
      }

      return await response.json();
    } catch (error) {
      console.error('Error creating client:', error);
      throw error;
    }
  }

  /**
   * Update an existing client's profile
   */
  async updateClient(clientId: string, data: UpdateClientData): Promise<boolean> {
    try {
      const response = await fetch(`${environment.apiUrl}/api/admin/clients/${clientId}`, {
        method: 'PUT',
        headers: this.getAuthHeaders(),
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to update client');
      }

      return true;
    } catch (error) {
      console.error('Error updating client:', error);
      throw error;
    }
  }

  /**
   * Create a new address for a client
   */
  async createClientAddress(clientId: string, addressData: AddressFormData): Promise<Address | null> {
    try {
      const response = await fetch(`${environment.apiUrl}/api/admin/clients/${clientId}/addresses`, {
        method: 'POST',
        headers: this.getAuthHeaders(),
        body: JSON.stringify(addressData),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to create address');
      }

      return await response.json();
    } catch (error) {
      console.error('Error creating client address:', error);
      throw error;
    }
  }

  /**
   * Update an existing address (admin endpoint with audit trail)
   */
  async updateClientAddress(clientId: string, addressId: string, addressData: Partial<AddressFormData>): Promise<Address | null> {
    try {
      const response = await fetch(`${environment.apiUrl}/api/admin/clients/${clientId}/addresses/${addressId}`, {
        method: 'PUT',
        headers: this.getAuthHeaders(),
        body: JSON.stringify(addressData),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to update address');
      }

      return await response.json();
    } catch (error) {
      console.error('Error updating address:', error);
      throw error;
    }
  }

  /**
   * Delete an address (admin endpoint with audit trail)
   */
  async deleteClientAddress(clientId: string, addressId: string): Promise<boolean> {
    try {
      const response = await fetch(`${environment.apiUrl}/api/admin/clients/${clientId}/addresses/${addressId}`, {
        method: 'DELETE',
        headers: this.getAuthHeaders(),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to delete address');
      }

      return true;
    } catch (error) {
      console.error('Error deleting address:', error);
      throw error;
    }
  }

  /**
   * Create a MOTO SetupIntent for adding a payment method on behalf of a client
   */
  async createSetupIntentForClient(clientId: string): Promise<{ clientSecret: string; stripeCustomerId: string }> {
    try {
      const response = await fetch(`${environment.apiUrl}/api/admin/clients/${clientId}/setup-intent`, {
        method: 'POST',
        headers: this.getAuthHeaders(),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to create setup intent');
      }

      return await response.json();
    } catch (error) {
      console.error('Error creating setup intent:', error);
      throw error;
    }
  }

  /**
   * Save a payment method for a client after SetupIntent confirmation
   */
  async saveClientPaymentMethod(
    clientId: string,
    paymentMethodId: string,
    customerId: string,
    setAsDefault: boolean = true
  ): Promise<PaymentMethod | null> {
    try {
      const response = await fetch(`${environment.apiUrl}/api/admin/clients/${clientId}/payment-methods`, {
        method: 'POST',
        headers: this.getAuthHeaders(),
        body: JSON.stringify({
          payment_method_id: paymentMethodId,
          customer_id: customerId,
          set_as_default: setAsDefault,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to save payment method');
      }

      return await response.json();
    } catch (error) {
      console.error('Error saving payment method:', error);
      throw error;
    }
  }

  /**
   * Delete a payment method (mark as inactive)
   */
  async deleteClientPaymentMethod(clientId: string, paymentMethodId: string): Promise<boolean> {
    try {
      const response = await fetch(
        `${environment.apiUrl}/api/admin/clients/${clientId}/payment-methods?paymentMethodId=${paymentMethodId}`,
        {
          method: 'DELETE',
          headers: this.getAuthHeaders(),
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to delete payment method');
      }

      return true;
    } catch (error) {
      console.error('Error deleting payment method:', error);
      throw error;
    }
  }
}
