import { Injectable } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { Observable, from, map, catchError, of } from 'rxjs';
import { Van, VanOperatingDay, VanDateOverride, VanRoster, RosterShift } from '../models/types';

/**
 * VanService — manages the fleet (vans), each van's weekly operating-days baseline,
 * per-date on/off overrides, and the daily groomer↔van roster.
 *
 * Mirrors the public availability model in royal-pawz `/api/availability/dates`:
 * a van is "open" on a date if a dated override says so, else its weekly baseline
 * (a MISSING weekly row counts as CLOSED — which is why createVan() seeds all 7 days).
 */
@Injectable({
  providedIn: 'root'
})
export class VanService {
  constructor(private supabase: SupabaseService) {}

  // =======================
  // VANS (CRUD)
  // =======================

  getVans(activeOnly = false): Observable<Van[]> {
    let query = this.supabase.from('vans').select('*').order('sort_order', { ascending: true });
    if (activeOnly) {
      query = query.eq('is_active', true);
    }
    return from(query).pipe(
      map(response => (response.data as Van[]) || []),
      catchError(error => {
        console.error('Error fetching vans:', error);
        return of([]);
      })
    );
  }

  getVanById(id: string): Observable<Van | null> {
    return from(
      this.supabase.from('vans').select('*').eq('id', id).single()
    ).pipe(
      map(response => (response.data as Van) || null),
      catchError(error => {
        console.error('Error fetching van:', error);
        return of(null);
      })
    );
  }

  /**
   * Create a van AND seed its 7 weekly operating-day rows (all open). The public
   * availability gate treats a missing weekly row as closed, so a van created
   * without these rows would never be bookable.
   */
  createVan(van: Partial<Van>): Observable<Van | null> {
    return from(this.createVanWithDefaults(van)).pipe(
      catchError(error => {
        console.error('Error creating van:', error);
        return of(null);
      })
    );
  }

  private async createVanWithDefaults(van: Partial<Van>): Promise<Van | null> {
    const { data, error } = await this.supabase.from('vans').insert({
      name: van.name,
      color: van.color ?? null,
      is_active: van.is_active ?? true,
      daily_capacity: van.daily_capacity ?? null,
      sort_order: van.sort_order ?? 0,
      notes: van.notes ?? null,
    }).select().single();

    if (error || !data) {
      console.error('Error creating van:', error);
      return null;
    }

    const weeklyRows = Array.from({ length: 7 }, (_, dow) => ({
      van_id: data.id,
      day_of_week: dow,
      is_open: true,
    }));
    const { error: seedError } = await this.supabase
      .from('van_operating_days')
      .insert(weeklyRows);
    if (seedError) {
      // Non-fatal: the van exists; surface so the admin can re-save weekly days.
      console.error('Error seeding van operating days:', seedError);
    }

    return data as Van;
  }

  updateVan(id: string, updates: Partial<Van>): Observable<boolean> {
    return from(
      this.supabase.from('vans')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', id)
    ).pipe(
      map(response => !response.error),
      catchError(error => {
        console.error('Error updating van:', error);
        return of(false);
      })
    );
  }

  /** Soft delete / re-enable via is_active (preferred over hard delete to keep history). */
  setVanActive(id: string, isActive: boolean): Observable<boolean> {
    return this.updateVan(id, { is_active: isActive });
  }

  deleteVan(id: string): Observable<boolean> {
    return from(
      this.supabase.from('vans').delete().eq('id', id)
    ).pipe(
      map(response => !response.error),
      catchError(error => {
        console.error('Error deleting van:', error);
        return of(false);
      })
    );
  }

  // =======================
  // VAN OPERATING DAYS (weekly baseline)
  // =======================

  /** All weekly operating-day rows across every van — used by the roster screen. */
  getAllOperatingDays(): Observable<VanOperatingDay[]> {
    return from(
      this.supabase.from('van_operating_days').select('*')
    ).pipe(
      map(response => (response.data as VanOperatingDay[]) || []),
      catchError(error => {
        console.error('Error fetching all van operating days:', error);
        return of([]);
      })
    );
  }

  getVanOperatingDays(vanId: string): Observable<VanOperatingDay[]> {
    return from(
      this.supabase.from('van_operating_days')
        .select('*')
        .eq('van_id', vanId)
        .order('day_of_week', { ascending: true })
    ).pipe(
      map(response => (response.data as VanOperatingDay[]) || []),
      catchError(error => {
        console.error('Error fetching van operating days:', error);
        return of([]);
      })
    );
  }

  bulkUpdateVanOperatingDays(vanId: string, updates: { day_of_week: number; is_open: boolean }[]): Observable<boolean> {
    const rows = updates.map(u => ({
      van_id: vanId,
      day_of_week: u.day_of_week,
      is_open: u.is_open,
      updated_at: new Date().toISOString(),
    }));
    return from(
      this.supabase.from('van_operating_days')
        .upsert(rows, { onConflict: 'van_id,day_of_week' })
    ).pipe(
      map(response => !response.error),
      catchError(error => {
        console.error('Error bulk updating van operating days:', error);
        return of(false);
      })
    );
  }

  // =======================
  // VAN DATE OVERRIDES (per-date on/off toggle)
  // =======================

  getVanDateOverrides(vanId: string, start?: string, end?: string): Observable<VanDateOverride[]> {
    let query = this.supabase.from('van_date_overrides')
      .select('*')
      .eq('van_id', vanId)
      .order('date', { ascending: true });
    if (start) query = query.gte('date', start);
    if (end) query = query.lte('date', end);
    return from(query).pipe(
      map(response => (response.data as VanDateOverride[]) || []),
      catchError(error => {
        console.error('Error fetching van date overrides:', error);
        return of([]);
      })
    );
  }

  /** All overrides across all vans for a date range — used by the roster screen. */
  getDateOverridesForRange(start: string, end: string): Observable<VanDateOverride[]> {
    return from(
      this.supabase.from('van_date_overrides')
        .select('*')
        .gte('date', start)
        .lte('date', end)
    ).pipe(
      map(response => (response.data as VanDateOverride[]) || []),
      catchError(error => {
        console.error('Error fetching van date overrides for range:', error);
        return of([]);
      })
    );
  }

  upsertVanDateOverride(vanId: string, date: string, isOpen: boolean, reason?: string | null): Observable<boolean> {
    return from(
      this.supabase.from('van_date_overrides')
        .upsert(
          { van_id: vanId, date, is_open: isOpen, reason: reason ?? null, updated_at: new Date().toISOString() },
          { onConflict: 'van_id,date' }
        )
    ).pipe(
      map(response => !response.error),
      catchError(error => {
        console.error('Error saving van date override:', error);
        return of(false);
      })
    );
  }

  deleteVanDateOverride(id: string): Observable<boolean> {
    return from(
      this.supabase.from('van_date_overrides').delete().eq('id', id)
    ).pipe(
      map(response => !response.error),
      catchError(error => {
        console.error('Error deleting van date override:', error);
        return of(false);
      })
    );
  }

  // =======================
  // VAN ROSTER (daily groomer ↔ van assignment, with shift override)
  // =======================

  getRosterForDate(date: string): Observable<VanRoster[]> {
    return from(
      this.supabase.from('van_roster').select('*').eq('roster_date', date)
    ).pipe(
      map(response => (response.data as VanRoster[]) || []),
      catchError(error => {
        console.error('Error fetching roster for date:', error);
        return of([]);
      })
    );
  }

  getRosterForVanDate(vanId: string, date: string): Observable<VanRoster[]> {
    return from(
      this.supabase.from('van_roster').select('*').eq('van_id', vanId).eq('roster_date', date)
    ).pipe(
      map(response => (response.data as VanRoster[]) || []),
      catchError(error => {
        console.error('Error fetching roster for van/date:', error);
        return of([]);
      })
    );
  }

  getRosterForRange(start: string, end: string): Observable<VanRoster[]> {
    return from(
      this.supabase.from('van_roster').select('*').gte('roster_date', start).lte('roster_date', end)
    ).pipe(
      map(response => (response.data as VanRoster[]) || []),
      catchError(error => {
        console.error('Error fetching roster for range:', error);
        return of([]);
      })
    );
  }

  /**
   * Assign one groomer to a van for the WHOLE day. Clears any existing
   * whole-day + shift rows for that van/date first ("per day + shift override":
   * setting a whole-day driver removes split-shift rows).
   */
  setWholeDayRoster(vanId: string, date: string, groomerId: string): Observable<boolean> {
    return from(this.setWholeDayRosterAsync(vanId, date, groomerId)).pipe(
      catchError(error => {
        console.error('Error setting whole-day roster:', error);
        return of(false);
      })
    );
  }

  private async setWholeDayRosterAsync(vanId: string, date: string, groomerId: string): Promise<boolean> {
    const del = await this.supabase.from('van_roster')
      .delete().eq('van_id', vanId).eq('roster_date', date);
    if (del.error) { console.error('Error clearing van/date roster:', del.error); return false; }
    const ins = await this.supabase.from('van_roster')
      .insert({ van_id: vanId, roster_date: date, groomer_id: groomerId, shift: null });
    if (ins.error) { console.error('Error inserting whole-day roster:', ins.error); return false; }
    return true;
  }

  /**
   * Assign a groomer to a van for a single SHIFT. Removes the whole-day row (if any)
   * and replaces any existing assignment for that shift.
   */
  setShiftRoster(vanId: string, date: string, shift: RosterShift, groomerId: string): Observable<boolean> {
    return from(this.setShiftRosterAsync(vanId, date, shift, groomerId)).pipe(
      catchError(error => {
        console.error('Error setting shift roster:', error);
        return of(false);
      })
    );
  }

  private async setShiftRosterAsync(vanId: string, date: string, shift: RosterShift, groomerId: string): Promise<boolean> {
    // Drop the whole-day row — the day is now split into shifts.
    const delWhole = await this.supabase.from('van_roster')
      .delete().eq('van_id', vanId).eq('roster_date', date).is('shift', null);
    if (delWhole.error) { console.error('Error clearing whole-day roster:', delWhole.error); return false; }
    // Replace any existing assignment for this shift.
    const delShift = await this.supabase.from('van_roster')
      .delete().eq('van_id', vanId).eq('roster_date', date).eq('shift', shift);
    if (delShift.error) { console.error('Error clearing shift roster:', delShift.error); return false; }
    const ins = await this.supabase.from('van_roster')
      .insert({ van_id: vanId, roster_date: date, groomer_id: groomerId, shift });
    if (ins.error) { console.error('Error inserting shift roster:', ins.error); return false; }
    return true;
  }

  /** Remove a single roster row by id. */
  removeRoster(id: string): Observable<boolean> {
    return from(
      this.supabase.from('van_roster').delete().eq('id', id)
    ).pipe(
      map(response => !response.error),
      catchError(error => {
        console.error('Error removing roster entry:', error);
        return of(false);
      })
    );
  }

  /** Clear all roster rows (whole-day + shifts) for a van on a date. */
  clearVanDay(vanId: string, date: string): Observable<boolean> {
    return from(
      this.supabase.from('van_roster').delete().eq('van_id', vanId).eq('roster_date', date)
    ).pipe(
      map(response => !response.error),
      catchError(error => {
        console.error('Error clearing van day roster:', error);
        return of(false);
      })
    );
  }

  // =======================
  // CLIENT-SIDE HELPERS
  // =======================

  /**
   * Is the van open on `date`? A dated override wins; otherwise the weekly baseline
   * for that weekday (a missing weekly row = closed, matching the public gate).
   */
  isVanOpenOn(weekly: VanOperatingDay[], overrides: VanDateOverride[], date: string): boolean {
    const dow = new Date(date + 'T00:00:00').getDay();
    const override = overrides.find(o => o.date === date);
    if (override) return override.is_open;
    const weeklyRow = weekly.find(w => w.day_of_week === dow);
    return weeklyRow ? weeklyRow.is_open : false;
  }

  /**
   * The groomer rostered to a van on a date for the given shift.
   * Falls back to the whole-day (shift = null) assignment when no shift-specific row exists.
   */
  rosteredGroomerFor(roster: VanRoster[], vanId: string, date: string, shift: RosterShift | null): string | null {
    const forVanDate = roster.filter(r => r.van_id === vanId && r.roster_date === date);
    if (shift) {
      const shiftRow = forVanDate.find(r => r.shift === shift);
      if (shiftRow) return shiftRow.groomer_id;
    }
    const wholeDay = forVanDate.find(r => r.shift === null);
    return wholeDay ? wholeDay.groomer_id : null;
  }
}
