import { Injectable } from '@angular/core';
import { SupabaseService } from './supabase.service';

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
    id: string;
    first_name: string;
    last_name: string;
    email: string;
  };
}

@Injectable({
  providedIn: 'root'
})
export class AdminNotesService {
  constructor(private supabase: SupabaseService) {}

  async getNotesForEntity(entityType: 'booking' | 'user' | 'payment', entityId: string): Promise<AdminNote[]> {
    const { data, error } = await this.supabase
      .from('admin_notes')
      .select(`
        *,
        admin:admin_id (
          id,
          first_name,
          last_name,
          email
        )
      `)
      .eq('entity_type', entityType)
      .eq('entity_id', entityId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching admin notes:', error);
      return [];
    }

    return data || [];
  }

  async createNote(
    entityType: 'booking' | 'user' | 'payment',
    entityId: string,
    note: string,
    priority?: 'low' | 'medium' | 'high' | 'urgent'
  ): Promise<AdminNote | null> {
    const adminId = this.supabase.session?.user?.id;

    if (!adminId) {
      console.error('No admin user logged in');
      return null;
    }

    const { data, error } = await this.supabase
      .from('admin_notes')
      .insert({
        entity_type: entityType,
        entity_id: entityId,
        note,
        priority: priority || 'medium',
        admin_id: adminId,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .select(`
        *,
        admin:admin_id (
          id,
          first_name,
          last_name,
          email
        )
      `)
      .single();

    if (error) {
      console.error('Error creating admin note:', error);
      return null;
    }

    return data;
  }

  async updateNote(noteId: string, note: string, priority?: 'low' | 'medium' | 'high' | 'urgent'): Promise<boolean> {
    const { error } = await this.supabase
      .from('admin_notes')
      .update({
        note,
        priority,
        updated_at: new Date().toISOString()
      })
      .eq('id', noteId);

    if (error) {
      console.error('Error updating admin note:', error);
      return false;
    }

    return true;
  }

  async deleteNote(noteId: string): Promise<boolean> {
    const { error } = await this.supabase
      .from('admin_notes')
      .delete()
      .eq('id', noteId);

    if (error) {
      console.error('Error deleting admin note:', error);
      return false;
    }

    return true;
  }
}
