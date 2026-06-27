import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { VanService } from '../../../core/services/van.service';
import { Van, VanDateOverride } from '../../../core/models/types';

type Tab = 'vans' | 'weekly' | 'overrides';

@Component({
  selector: 'app-van-management',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './van-management.component.html',
  styleUrls: ['./van-management.component.scss'],
})
export class VanManagementComponent implements OnInit {
  readonly DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  readonly ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];

  activeTab: Tab = 'vans';
  vans: Van[] = [];
  loading = false;
  error: string | null = null;
  success: string | null = null;

  // Add/edit van form
  showVanForm = false;
  editingVanId: string | null = null;
  vanForm = this.emptyVanForm();
  savingVan = false;

  // Weekly tab
  selectedWeeklyVanId: string | null = null;
  weeklyDays: { day_of_week: number; is_open: boolean }[] = [];
  savingWeekly = false;

  // Overrides tab
  selectedOverrideVanId: string | null = null;
  overrides: VanDateOverride[] = [];
  overrideForm = { date: '', is_open: false, reason: '' };
  savingOverride = false;

  constructor(private vanService: VanService) {}

  ngOnInit(): void {
    this.loadVans();
  }

  private emptyVanForm() {
    return {
      name: '',
      color: '#1E3A8A',
      daily_capacity: null as number | null,
      sort_order: 99,
      notes: '',
      is_active: true,
    };
  }

  loadVans(): void {
    this.loading = true;
    this.error = null;
    this.vanService.getVans(false).subscribe({
      next: (vans) => {
        this.vans = vans;
        this.loading = false;
        if (!this.selectedWeeklyVanId && vans.length) this.selectVanForWeekly(vans[0].id);
        if (!this.selectedOverrideVanId && vans.length) this.selectVanForOverrides(vans[0].id);
      },
      error: () => {
        this.error = 'Failed to load vans.';
        this.loading = false;
      },
    });
  }

  // ---------- Vans tab ----------
  startAddVan(): void {
    this.editingVanId = null;
    this.vanForm = this.emptyVanForm();
    this.vanForm.sort_order = this.vans.length;
    this.showVanForm = true;
  }

  startEditVan(v: Van): void {
    this.editingVanId = v.id;
    this.vanForm = {
      name: v.name,
      color: v.color ?? '#1E3A8A',
      daily_capacity: v.daily_capacity,
      sort_order: v.sort_order,
      notes: v.notes ?? '',
      is_active: v.is_active,
    };
    this.showVanForm = true;
  }

  cancelVanForm(): void {
    this.showVanForm = false;
    this.editingVanId = null;
  }

  saveVan(): void {
    if (!this.vanForm.name.trim()) {
      this.flashError('Van name is required.');
      return;
    }
    this.savingVan = true;
    const payload: Partial<Van> = {
      name: this.vanForm.name.trim(),
      color: this.vanForm.color || null,
      daily_capacity: this.vanForm.daily_capacity ?? null,
      sort_order: this.vanForm.sort_order ?? 99,
      notes: this.vanForm.notes?.trim() || null,
      is_active: this.vanForm.is_active,
    };

    if (this.editingVanId) {
      this.vanService.updateVan(this.editingVanId, payload).subscribe({
        next: (ok) => {
          this.savingVan = false;
          if (ok) {
            this.flashSuccess('Van updated.');
            this.showVanForm = false;
            this.loadVans();
          } else {
            this.flashError('Failed to update van.');
          }
        },
        error: () => {
          this.savingVan = false;
          this.flashError('Failed to update van.');
        },
      });
    } else {
      this.vanService.createVan(payload).subscribe({
        next: (van) => {
          this.savingVan = false;
          if (van) {
            this.flashSuccess('Van created (weekly schedule defaults to open every day).');
            this.showVanForm = false;
            this.loadVans();
          } else {
            this.flashError('Failed to create van.');
          }
        },
        error: () => {
          this.savingVan = false;
          this.flashError('Failed to create van.');
        },
      });
    }
  }

  toggleVanActive(v: Van): void {
    this.vanService.setVanActive(v.id, !v.is_active).subscribe({
      next: (ok) => {
        if (ok) v.is_active = !v.is_active;
        else this.flashError('Failed to update van.');
      },
      error: () => this.flashError('Failed to update van.'),
    });
  }

  // ---------- Weekly tab ----------
  selectVanForWeekly(vanId: string): void {
    this.selectedWeeklyVanId = vanId;
    this.vanService.getVanOperatingDays(vanId).subscribe({
      next: (rows) => {
        this.weeklyDays = this.ALL_DAYS.map((dow) => {
          const row = rows.find((r) => r.day_of_week === dow);
          return { day_of_week: dow, is_open: row ? row.is_open : false };
        });
      },
      error: () => this.flashError('Failed to load weekly schedule.'),
    });
  }

  toggleWeeklyDay(dow: number): void {
    const d = this.weeklyDays.find((w) => w.day_of_week === dow);
    if (d) d.is_open = !d.is_open;
  }

  saveWeekly(): void {
    if (!this.selectedWeeklyVanId) return;
    this.savingWeekly = true;
    this.vanService.bulkUpdateVanOperatingDays(this.selectedWeeklyVanId, this.weeklyDays).subscribe({
      next: (ok) => {
        this.savingWeekly = false;
        ok ? this.flashSuccess('Weekly schedule saved.') : this.flashError('Failed to save weekly schedule.');
      },
      error: () => {
        this.savingWeekly = false;
        this.flashError('Failed to save weekly schedule.');
      },
    });
  }

  // ---------- Overrides tab ----------
  selectVanForOverrides(vanId: string): void {
    this.selectedOverrideVanId = vanId;
    this.loadOverrides();
  }

  loadOverrides(): void {
    if (!this.selectedOverrideVanId) return;
    const today = new Date().toISOString().split('T')[0];
    this.vanService.getVanDateOverrides(this.selectedOverrideVanId, today).subscribe({
      next: (rows) => (this.overrides = rows),
      error: () => this.flashError('Failed to load date overrides.'),
    });
  }

  addOverride(): void {
    if (!this.selectedOverrideVanId || !this.overrideForm.date) {
      this.flashError('Pick a date.');
      return;
    }
    this.savingOverride = true;
    this.vanService
      .upsertVanDateOverride(
        this.selectedOverrideVanId,
        this.overrideForm.date,
        this.overrideForm.is_open,
        this.overrideForm.reason || null
      )
      .subscribe({
        next: (ok) => {
          this.savingOverride = false;
          if (ok) {
            this.flashSuccess('Override saved.');
            this.overrideForm = { date: '', is_open: false, reason: '' };
            this.loadOverrides();
          } else {
            this.flashError('Failed to save override.');
          }
        },
        error: () => {
          this.savingOverride = false;
          this.flashError('Failed to save override.');
        },
      });
  }

  deleteOverride(o: VanDateOverride): void {
    this.vanService.deleteVanDateOverride(o.id).subscribe({
      next: (ok) => {
        if (ok) this.overrides = this.overrides.filter((x) => x.id !== o.id);
        else this.flashError('Failed to delete override.');
      },
      error: () => this.flashError('Failed to delete override.'),
    });
  }

  vanName(id: string | null): string {
    return this.vans.find((v) => v.id === id)?.name ?? '';
  }

  dayName(dow: number): string {
    return this.DAY_NAMES[dow];
  }

  private flashSuccess(msg: string): void {
    this.success = msg;
    this.error = null;
    setTimeout(() => (this.success = null), 3000);
  }

  private flashError(msg: string): void {
    this.error = msg;
    setTimeout(() => (this.error = null), 4000);
  }
}
