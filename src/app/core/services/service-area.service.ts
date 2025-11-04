import { Injectable } from '@angular/core';
import { Observable, from } from 'rxjs';
import { SupabaseService } from './supabase.service';
import { ServiceAreaZipCode } from '../models/types';

@Injectable({
  providedIn: 'root'
})
export class ServiceAreaService {
  private readonly TABLE_NAME = 'service_area_zipcodes';

  constructor(private supabase: SupabaseService) {}

  /**
   * Fetches all zip codes from the database
   */
  getAllZipCodes(): Observable<ServiceAreaZipCode[]> {
    return from(this.fetchAllZipCodes());
  }

  private async fetchAllZipCodes(): Promise<ServiceAreaZipCode[]> {
    const { data, error } = await this.supabase
      .from(this.TABLE_NAME)
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching zip codes:', error);
      throw new Error('Failed to fetch zip codes');
    }

    return data || [];
  }

  /**
   * Fetches only active zip codes
   */
  getActiveZipCodes(): Observable<ServiceAreaZipCode[]> {
    return from(this.fetchActiveZipCodes());
  }

  private async fetchActiveZipCodes(): Promise<ServiceAreaZipCode[]> {
    const { data, error } = await this.supabase
      .from(this.TABLE_NAME)
      .select('*')
      .eq('is_active', true)
      .order('zip_code', { ascending: true });

    if (error) {
      console.error('Error fetching active zip codes:', error);
      throw new Error('Failed to fetch active zip codes');
    }

    return data || [];
  }

  /**
   * Adds a new zip code to the database
   */
  addZipCode(
    zipCode: string,
    city: string,
    state: string,
    notes?: string
  ): Observable<ServiceAreaZipCode> {
    return from(this.insertZipCode(zipCode, city, state, notes));
  }

  private async insertZipCode(
    zipCode: string,
    city: string,
    state: string,
    notes?: string
  ): Promise<ServiceAreaZipCode> {
    // Validate zip code format
    if (!this.validateZipCode(zipCode)) {
      throw new Error('Invalid zip code format. Must be 5 digits.');
    }

    // Check for duplicates
    const exists = await this.checkZipCodeExists(zipCode);
    if (exists) {
      throw new Error(`Zip code ${zipCode} already exists`);
    }

    const { data, error } = await this.supabase
      .from(this.TABLE_NAME)
      .insert([
        {
          zip_code: zipCode.trim(),
          city: city.trim(),
          state: state.trim().toUpperCase(),
          notes: notes?.trim() || null,
          is_active: true
        }
      ])
      .select()
      .single();

    if (error) {
      console.error('Error adding zip code:', error);
      throw new Error('Failed to add zip code');
    }

    return data;
  }

  /**
   * Updates an existing zip code
   */
  updateZipCode(
    id: string,
    updates: Partial<ServiceAreaZipCode>
  ): Observable<ServiceAreaZipCode> {
    return from(this.performUpdate(id, updates));
  }

  private async performUpdate(
    id: string,
    updates: Partial<ServiceAreaZipCode>
  ): Promise<ServiceAreaZipCode> {
    // If updating zip code, validate format and check for duplicates
    if (updates.zip_code) {
      if (!this.validateZipCode(updates.zip_code)) {
        throw new Error('Invalid zip code format. Must be 5 digits.');
      }

      // Check if the new zip code already exists (excluding current record)
      const { data: existing } = await this.supabase
        .from(this.TABLE_NAME)
        .select('id')
        .eq('zip_code', updates.zip_code)
        .neq('id', id)
        .single();

      if (existing) {
        throw new Error(`Zip code ${updates.zip_code} already exists`);
      }
    }

    const updateData: any = {
      ...updates,
      updated_at: new Date().toISOString()
    };

    // Clean up string fields
    if (updateData.zip_code) updateData.zip_code = updateData.zip_code.trim();
    if (updateData.city) updateData.city = updateData.city.trim();
    if (updateData.state) updateData.state = updateData.state.trim().toUpperCase();
    if (updateData.notes) updateData.notes = updateData.notes.trim();

    const { data, error } = await this.supabase
      .from(this.TABLE_NAME)
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error updating zip code:', error);
      throw new Error('Failed to update zip code');
    }

    return data;
  }

  /**
   * Deletes a zip code from the database
   */
  deleteZipCode(id: string): Observable<void> {
    return from(this.performDelete(id));
  }

  private async performDelete(id: string): Promise<void> {
    const { error } = await this.supabase
      .from(this.TABLE_NAME)
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting zip code:', error);
      throw new Error('Failed to delete zip code');
    }
  }

  /**
   * Toggles the active status of a zip code
   */
  toggleZipCodeStatus(id: string, isActive: boolean): Observable<ServiceAreaZipCode> {
    return from(this.performStatusToggle(id, isActive));
  }

  private async performStatusToggle(id: string, isActive: boolean): Promise<ServiceAreaZipCode> {
    const { data, error } = await this.supabase
      .from(this.TABLE_NAME)
      .update({
        is_active: isActive,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error toggling zip code status:', error);
      throw new Error('Failed to toggle zip code status');
    }

    return data;
  }

  /**
   * Validates zip code format (5 digits)
   */
  validateZipCode(zipCode: string): boolean {
    const zipRegex = /^\d{5}$/;
    return zipRegex.test(zipCode.trim());
  }

  /**
   * Checks if a zip code already exists in the database
   */
  async checkZipCodeExists(zipCode: string): Promise<boolean> {
    const { data, error } = await this.supabase
      .from(this.TABLE_NAME)
      .select('id')
      .eq('zip_code', zipCode.trim())
      .single();

    return data !== null && !error;
  }

  /**
   * Searches zip codes by zip code, city, or state
   */
  searchZipCodes(searchTerm: string): Observable<ServiceAreaZipCode[]> {
    return from(this.performSearch(searchTerm));
  }

  private async performSearch(searchTerm: string): Promise<ServiceAreaZipCode[]> {
    const term = searchTerm.trim().toLowerCase();

    if (!term) {
      return this.fetchAllZipCodes();
    }

    const { data, error } = await this.supabase
      .from(this.TABLE_NAME)
      .select('*')
      .or(`zip_code.ilike.%${term}%,city.ilike.%${term}%,state.ilike.%${term}%`)
      .order('zip_code', { ascending: true });

    if (error) {
      console.error('Error searching zip codes:', error);
      throw new Error('Failed to search zip codes');
    }

    return data || [];
  }
}
