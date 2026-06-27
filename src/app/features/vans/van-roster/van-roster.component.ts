import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { forkJoin, Observable } from 'rxjs';
import { VanService } from '../../../core/services/van.service';
import { GroomerService, GroomerWithStats } from '../../../core/services/groomer.service';
import { Van, VanRoster, VanOperatingDay, VanDateOverride, RosterShift } from '../../../core/models/types';

interface VanRosterView {
  van: Van;
  isOpen: boolean;
  splitMode: boolean;
  wholeDayGroomerId: string;
  morningGroomerId: string;
  afternoonGroomerId: string;
  eveningGroomerId: string;
}

/**
 * Daily Roster — assign which groomer drives which van on a given date.
 * Whole-day by default; "Split shifts" lets a van be staffed per morning/afternoon/evening.
 * Warnings are SOFT (unavailable groomer / double-rostered across vans) — never blocking.
 */
@Component({
  selector: 'app-van-roster',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './van-roster.component.html',
  styleUrls: ['./van-roster.component.scss'],
})
export class VanRosterComponent implements OnInit {
  readonly SHIFTS: RosterShift[] = ['morning', 'afternoon', 'evening'];

  selectedDate = '';
  loading = false;
  saving = false;
  error: string | null = null;
  success: string | null = null;

  vans: Van[] = [];
  groomers: GroomerWithStats[] = [];
  roster: VanRoster[] = [];
  weeklyAll: VanOperatingDay[] = [];
  overridesForDate: VanDateOverride[] = [];

  views: VanRosterView[] = [];

  // Soft warnings, keyed by `${vanId}:${shift|'day'}`
  private dupWarnings: Record<string, string> = {};
  private availWarnings: Record<string, string> = {};

  constructor(private vanService: VanService, private groomerService: GroomerService) {}

  ngOnInit(): void {
    this.selectedDate = new Date().toISOString().split('T')[0];
    this.load();
  }

  onDateChange(): void {
    if (this.selectedDate) this.load();
  }

  load(): void {
    this.loading = true;
    this.error = null;
    this.dupWarnings = {};
    this.availWarnings = {};
    forkJoin({
      vans: this.vanService.getVans(true),
      groomers: this.groomerService.getAllGroomers(),
      roster: this.vanService.getRosterForDate(this.selectedDate),
      weekly: this.vanService.getAllOperatingDays(),
      overrides: this.vanService.getDateOverridesForRange(this.selectedDate, this.selectedDate),
    }).subscribe({
      next: ({ vans, groomers, roster, weekly, overrides }) => {
        this.vans = vans;
        this.groomers = groomers;
        this.roster = roster;
        this.weeklyAll = weekly;
        this.overridesForDate = overrides;
        this.buildViews();
        this.recomputeDuplicateWarnings();
        this.loading = false;
      },
      error: () => {
        this.error = 'Failed to load roster.';
        this.loading = false;
      },
    });
  }

  private buildViews(): void {
    this.views = this.vans.map((van) => {
      const weeklyForVan = this.weeklyAll.filter((w) => w.van_id === van.id);
      const overridesForVan = this.overridesForDate.filter((o) => o.van_id === van.id);
      const isOpen = this.vanService.isVanOpenOn(weeklyForVan, overridesForVan, this.selectedDate);
      const rows = this.roster.filter((r) => r.van_id === van.id);
      const whole = rows.find((r) => r.shift === null);
      const morning = rows.find((r) => r.shift === 'morning');
      const afternoon = rows.find((r) => r.shift === 'afternoon');
      const evening = rows.find((r) => r.shift === 'evening');
      return {
        van,
        isOpen,
        splitMode: !whole && !!(morning || afternoon || evening),
        wholeDayGroomerId: whole?.groomer_id ?? '',
        morningGroomerId: morning?.groomer_id ?? '',
        afternoonGroomerId: afternoon?.groomer_id ?? '',
        eveningGroomerId: evening?.groomer_id ?? '',
      };
    });
  }

  groomerName(id: string | null | undefined): string {
    if (!id) return '';
    const g = this.groomers.find((x) => x.id === id);
    return g ? `${g.first_name} ${g.last_name}` : 'Unknown';
  }

  toggleSplit(view: VanRosterView): void {
    const goingSplit = !view.splitMode;
    view.splitMode = goingSplit;
    // Either direction clears the van's rows for the day; the admin re-picks.
    view.wholeDayGroomerId = '';
    view.morningGroomerId = '';
    view.afternoonGroomerId = '';
    view.eveningGroomerId = '';
    this.clearWarning(view.van.id, 'day');
    this.SHIFTS.forEach((s) => this.clearWarning(view.van.id, s));
    this.save(this.vanService.clearVanDay(view.van.id, this.selectedDate));
  }

  onWholeDayChange(view: VanRosterView, groomerId: string): void {
    view.wholeDayGroomerId = groomerId;
    this.clearWarning(view.van.id, 'day');
    if (!groomerId) {
      this.save(this.vanService.clearVanDay(view.van.id, this.selectedDate));
      return;
    }
    this.save(this.vanService.setWholeDayRoster(view.van.id, this.selectedDate, groomerId));
    this.checkAvailability(view.van.id, 'day', groomerId);
  }

  onShiftChange(view: VanRosterView, shift: RosterShift, groomerId: string): void {
    if (shift === 'morning') view.morningGroomerId = groomerId;
    if (shift === 'afternoon') view.afternoonGroomerId = groomerId;
    if (shift === 'evening') view.eveningGroomerId = groomerId;
    this.clearWarning(view.van.id, shift);
    if (!groomerId) {
      const row = this.roster.find(
        (r) => r.van_id === view.van.id && r.roster_date === this.selectedDate && r.shift === shift
      );
      if (row) this.save(this.vanService.removeRoster(row.id));
      return;
    }
    this.save(this.vanService.setShiftRoster(view.van.id, this.selectedDate, shift, groomerId));
    this.checkAvailability(view.van.id, shift, groomerId);
  }

  shiftGroomerId(view: VanRosterView, shift: RosterShift): string {
    if (shift === 'morning') return view.morningGroomerId;
    if (shift === 'afternoon') return view.afternoonGroomerId;
    return view.eveningGroomerId;
  }

  private save(obs: Observable<boolean>): void {
    this.saving = true;
    obs.subscribe({
      next: (ok) => {
        this.saving = false;
        if (ok) {
          this.flashSuccess('Roster updated.');
          this.reloadRoster();
        } else {
          this.flashError('Failed to update roster.');
        }
      },
      error: () => {
        this.saving = false;
        this.flashError('Failed to update roster.');
      },
    });
  }

  private reloadRoster(): void {
    this.vanService.getRosterForDate(this.selectedDate).subscribe((roster) => {
      this.roster = roster;
      this.recomputeDuplicateWarnings();
    });
  }

  // ---------- soft warnings ----------
  private warnKey(vanId: string, shift: RosterShift | 'day'): string {
    return `${vanId}:${shift}`;
  }

  private clearWarning(vanId: string, shift: RosterShift | 'day'): void {
    delete this.dupWarnings[this.warnKey(vanId, shift)];
    delete this.availWarnings[this.warnKey(vanId, shift)];
  }

  warningFor(vanId: string, shift: RosterShift | 'day'): string | null {
    const key = this.warnKey(vanId, shift);
    return this.dupWarnings[key] || this.availWarnings[key] || null;
  }

  private checkAvailability(vanId: string, shift: RosterShift | 'day', groomerId: string): void {
    this.groomerService.getGroomerAvailableSlots(groomerId, this.selectedDate).subscribe({
      next: (data) => {
        if (!data.is_available) {
          this.availWarnings[this.warnKey(vanId, shift)] = data.reason || 'Groomer is not available this day.';
        }
      },
      error: () => {},
    });
  }

  private recomputeDuplicateWarnings(): void {
    this.dupWarnings = {};
    const byGroomer: Record<string, VanRoster[]> = {};
    for (const r of this.roster) {
      (byGroomer[r.groomer_id] ||= []).push(r);
    }
    for (const [groomerId, rows] of Object.entries(byGroomer)) {
      const distinctVans = new Set(rows.map((r) => r.van_id));
      if (distinctVans.size > 1) {
        for (const r of rows) {
          this.dupWarnings[this.warnKey(r.van_id, (r.shift ?? 'day') as RosterShift | 'day')] =
            `${this.groomerName(groomerId)} is rostered to more than one van today.`;
        }
      }
    }
  }

  private flashSuccess(msg: string): void {
    this.success = msg;
    this.error = null;
    setTimeout(() => (this.success = null), 2500);
  }

  private flashError(msg: string): void {
    this.error = msg;
    setTimeout(() => (this.error = null), 4000);
  }
}
