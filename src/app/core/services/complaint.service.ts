import { Injectable } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { Observable, from } from 'rxjs';
import { Complaint, ComplaintStatus } from '../models/types';

@Injectable({
  providedIn: 'root'
})
export class ComplaintService {
  constructor(private supabase: SupabaseService) {}

  getAllComplaints(): Observable<Complaint[]> {
    return from(this.fetchComplaints());
  }

  private async fetchComplaints(): Promise<Complaint[]> {
    const { data, error } = await this.supabase
      .from('complaints')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching complaints:', error);
      throw error;
    }

    return data || [];
  }

  async getComplaintById(id: string): Promise<Complaint | null> {
    const { data, error } = await this.supabase
      .from('complaints')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      console.error('Error fetching complaint:', error);
      return null;
    }

    return data;
  }

  async updateComplaintStatus(
    complaintId: string,
    status: ComplaintStatus,
    resolutionNotes?: string
  ): Promise<boolean> {
    const updateData: any = {
      status,
      updated_at: new Date().toISOString()
    };

    if (status === 'resolved' || status === 'closed') {
      updateData.resolution_notes = resolutionNotes;
      updateData.resolved_at = new Date().toISOString();
    }

    const { error } = await this.supabase
      .from('complaints')
      .update(updateData)
      .eq('id', complaintId);

    if (error) {
      console.error('Error updating complaint:', error);
      return false;
    }

    return true;
  }

  async updateComplaintPriority(
    complaintId: string,
    priority: 'low' | 'medium' | 'high'
  ): Promise<boolean> {
    const { error } = await this.supabase
      .from('complaints')
      .update({
        priority,
        updated_at: new Date().toISOString()
      })
      .eq('id', complaintId);

    if (error) {
      console.error('Error updating complaint priority:', error);
      return false;
    }

    return true;
  }

  async getComplaintStats(): Promise<{
    total: number;
    pending: number;
    in_progress: number;
    resolved: number;
    closed: number;
  }> {
    const { data, error } = await this.supabase
      .from('complaints')
      .select('status');

    if (error) {
      console.error('Error fetching complaint stats:', error);
      return { total: 0, pending: 0, in_progress: 0, resolved: 0, closed: 0 };
    }

    const stats = {
      total: data.length,
      pending: data.filter(c => c.status === 'pending').length,
      in_progress: data.filter(c => c.status === 'in_progress').length,
      resolved: data.filter(c => c.status === 'resolved').length,
      closed: data.filter(c => c.status === 'closed').length
    };

    return stats;
  }
}
