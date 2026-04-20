import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { SupabaseService } from './supabase.service';

export type IncidentStatus =
  | 'open'
  | 'acknowledged'
  | 'investigating'
  | 'resolved'
  | 'closed';

export interface IncidentReport {
  id: string;
  booking_id: string | null;
  shift_id: string | null;
  groomer_id: string;
  incident_date: string;
  incident_time: string;
  location: string | null;
  incident_types: string[];
  pet_id: string | null;
  pet_was_aggressive: boolean | null;
  aggression_description: string | null;
  description: string;
  injuries_occurred: boolean | null;
  injury_description: string | null;
  first_aid_administered: boolean | null;
  vet_care_required: boolean | null;
  employee_medical_care_required: boolean | null;
  actions_taken: string | null;
  owner_notified: boolean | null;
  owner_notified_at: string | null;
  management_notified: boolean | null;
  management_notified_at: string | null;
  photos_taken: boolean | null;
  photo_urls: string[];
  security_recording_available: boolean | null;
  follow_up_flags: string[];
  follow_up_notes: string | null;
  employee_signature_url: string | null;
  status: IncidentStatus;
  reviewed_by: string | null;
  review_notes: string | null;
  reviewed_at: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
  groomer?: { id: string; first_name: string; last_name: string } | null;
}

@Injectable({ providedIn: 'root' })
export class IncidentService {
  private incidentsSubject = new BehaviorSubject<IncidentReport[]>([]);
  readonly incidents$: Observable<IncidentReport[]> = this.incidentsSubject.asObservable();

  constructor(private supabase: SupabaseService) {}

  async loadIncidents(status?: IncidentStatus | 'all'): Promise<IncidentReport[]> {
    let query = this.supabase
      .from('incident_reports')
      .select(
        `
        *,
        groomer:users!incident_reports_groomer_id_fkey(id, first_name, last_name)
      `
      )
      .order('created_at', { ascending: false })
      .limit(200);

    if (status && status !== 'all') query = query.eq('status', status);

    const { data, error } = await query;
    if (error) {
      console.error('Failed to load incidents', error);
      throw error;
    }

    const list = (data ?? []) as IncidentReport[];
    this.incidentsSubject.next(list);
    return list;
  }

  async getIncident(id: string): Promise<IncidentReport | null> {
    const { data, error } = await this.supabase
      .from('incident_reports')
      .select(
        `
        *,
        groomer:users!incident_reports_groomer_id_fkey(id, first_name, last_name)
      `
      )
      .eq('id', id)
      .maybeSingle();
    if (error) {
      console.error('Failed to load incident', error);
      return null;
    }
    return (data as IncidentReport) ?? null;
  }

  async updateStatus(
    id: string,
    status: IncidentStatus,
    reviewNotes?: string
  ): Promise<boolean> {
    const update: Record<string, unknown> = {
      status,
      reviewed_at: new Date().toISOString(),
    };
    const { data: authData } = await this.supabase.client.auth.getUser();
    if (authData?.user?.id) {
      update['reviewed_by'] = authData.user.id;
    }
    if (typeof reviewNotes === 'string') update['review_notes'] = reviewNotes;
    if (status === 'resolved' || status === 'closed') {
      update['resolved_at'] = new Date().toISOString();
    }

    const { error } = await this.supabase
      .from('incident_reports')
      .update(update)
      .eq('id', id);
    if (error) {
      console.error('Failed to update incident status', error);
      return false;
    }

    // Refresh cached list
    const current = this.incidentsSubject.getValue();
    this.incidentsSubject.next(
      current.map((i) =>
        i.id === id
          ? {
              ...i,
              status,
              review_notes:
                typeof reviewNotes === 'string' ? reviewNotes : i.review_notes,
              reviewed_at: update['reviewed_at'] as string,
              resolved_at:
                (update['resolved_at'] as string | undefined) ?? i.resolved_at,
            }
          : i
      )
    );
    return true;
  }

  async signedPhotoUrl(path: string): Promise<string | null> {
    const objectPath = path.replace(/^incident-evidence\//, '');
    const { data, error } = await this.supabase.client.storage
      .from('incident-evidence')
      .createSignedUrl(objectPath, 60 * 10);
    if (error || !data) return null;
    return data.signedUrl;
  }
}
