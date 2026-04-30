import { Injectable } from '@angular/core';
import { SupabaseService } from './supabase.service';

export type NoteType = 'admin' | 'groomer_session' | 'pet_behavior';
export type NotePriority = 'low' | 'medium' | 'high' | 'urgent';

export interface UnifiedNote {
  id: string;
  type: NoteType;
  text: string;
  createdAt: string;
  updatedAt?: string;
  priority?: NotePriority;

  // Author
  authorName?: string;
  authorRole: 'admin' | 'groomer' | 'unknown';

  // Related entity (for deep-linking)
  bookingId?: string;
  clientId?: string;
  clientName?: string;
  petId?: string;
  petName?: string;
  groomerId?: string;
  groomerName?: string;

  // For admin notes — entity_type is polymorphic
  entityType?: 'booking' | 'user' | 'payment';
  entityId?: string;

  // Booking date (for groomer session notes — when the groom happened)
  bookingDate?: string;
}

@Injectable({ providedIn: 'root' })
export class AllNotesService {
  constructor(private supabase: SupabaseService) {}

  /**
   * Fetch all notes (admin + groomer session + pet behavior) in parallel and
   * merge into a single chronologically-ordered feed.
   */
  async getAllNotes(): Promise<UnifiedNote[]> {
    const [adminNotes, bookingGroomerNotes, bookingPetNotes, petBehaviorNotes] = await Promise.all([
      this.fetchAdminNotes(),
      this.fetchBookingGroomerNotes(),
      this.fetchBookingPetNotes(),
      this.fetchPetBehaviorNotes(),
    ]);

    const all = [...adminNotes, ...bookingGroomerNotes, ...bookingPetNotes, ...petBehaviorNotes];
    all.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
    return all;
  }

  private async fetchAdminNotes(): Promise<UnifiedNote[]> {
    const { data, error } = await this.supabase
      .from('admin_notes')
      .select(`
        id, entity_type, entity_id, note, priority, admin_id, created_at, updated_at,
        admin:admin_id ( id, first_name, last_name )
      `)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[AllNotesService] admin_notes:', error);
      return [];
    }

    const notes: UnifiedNote[] = (data || []).map((n: any) => ({
      id: `admin:${n.id}`,
      type: 'admin',
      text: n.note,
      createdAt: n.created_at,
      updatedAt: n.updated_at,
      priority: n.priority,
      authorRole: 'admin',
      authorName: this.fullName(n.admin?.first_name, n.admin?.last_name) || 'Admin',
      entityType: n.entity_type,
      entityId: n.entity_id,
    }));

    // Resolve client/booking context for each admin note
    await this.hydrateAdminNoteContext(notes);
    return notes;
  }

  /**
   * Look up the related entity for each admin note (booking → client/groomer/date,
   * user → client name) so we can deep-link and show context in the feed.
   */
  private async hydrateAdminNoteContext(notes: UnifiedNote[]): Promise<void> {
    const bookingIds = notes.filter(n => n.entityType === 'booking').map(n => n.entityId!).filter(Boolean);
    const userIds = notes.filter(n => n.entityType === 'user').map(n => n.entityId!).filter(Boolean);

    const [bookingsRes, usersRes] = await Promise.all([
      bookingIds.length
        ? this.supabase
            .from('bookings')
            .select('id, scheduled_date, client_id, groomer_id, client:client_id(id, first_name, last_name), groomer:groomer_id(id, first_name, last_name)')
            .in('id', bookingIds)
        : Promise.resolve({ data: [] as any[], error: null }),
      userIds.length
        ? this.supabase
            .from('users')
            .select('id, first_name, last_name')
            .in('id', userIds)
        : Promise.resolve({ data: [] as any[], error: null }),
    ]);

    const bookingMap = new Map<string, any>();
    (bookingsRes.data || []).forEach((b: any) => bookingMap.set(b.id, b));
    const userMap = new Map<string, any>();
    (usersRes.data || []).forEach((u: any) => userMap.set(u.id, u));

    for (const n of notes) {
      if (n.entityType === 'booking' && n.entityId) {
        const b = bookingMap.get(n.entityId);
        if (b) {
          n.bookingId = b.id;
          n.bookingDate = b.scheduled_date;
          n.clientId = b.client_id;
          n.clientName = this.fullName(b.client?.first_name, b.client?.last_name);
          n.groomerId = b.groomer_id;
          n.groomerName = this.fullName(b.groomer?.first_name, b.groomer?.last_name);
        }
      } else if (n.entityType === 'user' && n.entityId) {
        const u = userMap.get(n.entityId);
        if (u) {
          n.clientId = u.id;
          n.clientName = this.fullName(u.first_name, u.last_name);
        }
      }
    }
  }

  /**
   * Per-booking groomer notes (bookings.groomer_notes column). One note per booking.
   * Author defaults to the booking's assigned groomer.
   */
  private async fetchBookingGroomerNotes(): Promise<UnifiedNote[]> {
    const { data, error } = await this.supabase
      .from('bookings')
      .select(`
        id, scheduled_date, groomer_notes, completed_at, updated_at, client_id, groomer_id,
        client:client_id ( id, first_name, last_name ),
        groomer:groomer_id ( id, first_name, last_name )
      `)
      .not('groomer_notes', 'is', null)
      .neq('groomer_notes', '')
      .order('updated_at', { ascending: false });

    if (error) {
      console.error('[AllNotesService] bookings.groomer_notes:', error);
      return [];
    }

    return (data || []).map((b: any) => ({
      id: `booking:${b.id}`,
      type: 'groomer_session' as NoteType,
      text: b.groomer_notes,
      createdAt: b.completed_at || b.updated_at,
      updatedAt: b.updated_at,
      authorRole: 'groomer' as const,
      authorName: this.fullName(b.groomer?.first_name, b.groomer?.last_name) || 'Groomer',
      bookingId: b.id,
      bookingDate: b.scheduled_date,
      clientId: b.client_id,
      clientName: this.fullName(b.client?.first_name, b.client?.last_name),
      groomerId: b.groomer_id,
      groomerName: this.fullName(b.groomer?.first_name, b.groomer?.last_name),
    }));
  }

  /**
   * Per-pet groomer notes within a booking (booking_pets.groomer_notes — what
   * the groomer wrote about a specific pet during that groom).
   */
  private async fetchBookingPetNotes(): Promise<UnifiedNote[]> {
    const { data, error } = await this.supabase
      .from('booking_pets')
      .select(`
        id, booking_id, pet_id, groomer_notes, created_at, completed_at,
        pet:pet_id ( id, name ),
        booking:booking_id (
          id, scheduled_date, client_id, groomer_id,
          client:client_id ( id, first_name, last_name ),
          groomer:groomer_id ( id, first_name, last_name )
        )
      `)
      .not('groomer_notes', 'is', null)
      .neq('groomer_notes', '')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[AllNotesService] booking_pets.groomer_notes:', error);
      return [];
    }

    return (data || []).map((bp: any) => ({
      id: `booking_pet:${bp.id}`,
      type: 'groomer_session' as NoteType,
      text: bp.groomer_notes,
      createdAt: bp.completed_at || bp.created_at,
      authorRole: 'groomer' as const,
      authorName: this.fullName(bp.booking?.groomer?.first_name, bp.booking?.groomer?.last_name) || 'Groomer',
      bookingId: bp.booking_id,
      bookingDate: bp.booking?.scheduled_date,
      clientId: bp.booking?.client_id,
      clientName: this.fullName(bp.booking?.client?.first_name, bp.booking?.client?.last_name),
      groomerId: bp.booking?.groomer_id,
      groomerName: this.fullName(bp.booking?.groomer?.first_name, bp.booking?.groomer?.last_name),
      petId: bp.pet_id,
      petName: bp.pet?.name,
    }));
  }

  /**
   * Persistent pet behavior notes (pets.groomer_notes — notes that carry across
   * visits, e.g. "scared of dryer"). Not tied to a single booking.
   */
  private async fetchPetBehaviorNotes(): Promise<UnifiedNote[]> {
    const { data, error } = await this.supabase
      .from('pets')
      .select(`
        id, name, user_id, groomer_notes, created_at, updated_at,
        owner:user_id ( id, first_name, last_name )
      `)
      .not('groomer_notes', 'is', null)
      .neq('groomer_notes', '')
      .order('updated_at', { ascending: false });

    if (error) {
      console.error('[AllNotesService] pets.groomer_notes:', error);
      return [];
    }

    return (data || []).map((p: any) => ({
      id: `pet:${p.id}`,
      type: 'pet_behavior' as NoteType,
      text: p.groomer_notes,
      createdAt: p.updated_at || p.created_at,
      updatedAt: p.updated_at,
      authorRole: 'groomer' as const,
      authorName: 'Groomer',
      petId: p.id,
      petName: p.name,
      clientId: p.user_id,
      clientName: this.fullName(p.owner?.first_name, p.owner?.last_name),
    }));
  }

  private fullName(first?: string | null, last?: string | null): string | undefined {
    const name = [first, last].filter(Boolean).join(' ').trim();
    return name || undefined;
  }
}
