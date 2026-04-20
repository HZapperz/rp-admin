import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SupabaseService } from '../../../core/services/supabase.service';

type Category = 'POODLE_DOODLE' | 'DOUBLE_COAT' | 'LONG_COAT_SPANIEL' | 'WIRE_COAT';
type Size = 'small' | 'medium' | 'large' | 'xl';
type PackageType = 'basic' | 'premium' | 'deluxe';

interface PremiumRow {
  id: string;
  coat_category: Category;
  size: Size;
  package_type: PackageType;
  upcharge_amount: number;
  // transient fields
  original_amount: number;
  dirty: boolean;
}

const CATEGORY_LABELS: Record<Category, string> = {
  POODLE_DOODLE: 'Poodle · Doodle',
  DOUBLE_COAT: 'Double Coat · Deshedding',
  LONG_COAT_SPANIEL: 'Long Coat · Spaniel',
  WIRE_COAT: 'Wire Coat',
};

const CATEGORY_ORDER: Category[] = ['POODLE_DOODLE', 'DOUBLE_COAT', 'LONG_COAT_SPANIEL', 'WIRE_COAT'];
const SIZE_ORDER: Size[] = ['small', 'medium', 'large', 'xl'];
const PACKAGE_ORDER: PackageType[] = ['basic', 'premium', 'deluxe'];
const PACKAGE_LABELS: Record<PackageType, string> = {
  basic: 'Royal Bath',
  premium: 'Royal Groom',
  deluxe: 'Royal Spa',
};

@Component({
  selector: 'app-breed-premiums-editor',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './breed-premiums-editor.component.html',
  styleUrls: ['./breed-premiums-editor.component.scss'],
})
export class BreedPremiumsEditorComponent implements OnInit {
  readonly categoryOrder = CATEGORY_ORDER;
  readonly sizeOrder = SIZE_ORDER;
  readonly packageOrder = PACKAGE_ORDER;
  readonly categoryLabels = CATEGORY_LABELS;
  readonly packageLabels = PACKAGE_LABELS;

  rows: PremiumRow[] = [];
  loading = false;
  saving = false;
  error: string | null = null;
  success: string | null = null;

  constructor(private supabase: SupabaseService) {}

  async ngOnInit(): Promise<void> {
    await this.load();
  }

  async load(): Promise<void> {
    this.loading = true;
    this.error = null;
    try {
      const { data, error } = await this.supabase
        .from('breed_premiums')
        .select('id, coat_category, size, package_type, upcharge_amount')
        .order('coat_category')
        .order('size')
        .order('package_type');
      if (error) throw error;
      this.rows = (data || []).map((r: any) => ({
        id: r.id,
        coat_category: r.coat_category,
        size: r.size,
        package_type: r.package_type,
        upcharge_amount: Number(r.upcharge_amount),
        original_amount: Number(r.upcharge_amount),
        dirty: false,
      }));
    } catch (err: any) {
      this.error = err.message || 'Failed to load breed premiums';
    } finally {
      this.loading = false;
    }
  }

  find(cat: Category, size: Size, pkg: PackageType): PremiumRow | undefined {
    return this.rows.find(r => r.coat_category === cat && r.size === size && r.package_type === pkg);
  }

  onAmountChange(row: PremiumRow, newVal: string | number): void {
    const n = Number(newVal);
    row.upcharge_amount = isNaN(n) ? 0 : Math.max(0, n);
    row.dirty = row.upcharge_amount !== row.original_amount;
    this.success = null;
  }

  get dirtyCount(): number {
    return this.rows.filter(r => r.dirty).length;
  }

  async save(): Promise<void> {
    const dirty = this.rows.filter(r => r.dirty);
    if (dirty.length === 0) return;
    this.saving = true;
    this.error = null;
    this.success = null;
    try {
      // Update each row individually (Supabase doesn't support batch upsert with different values
      // when there's a unique constraint other than PK)
      for (const row of dirty) {
        const { error } = await this.supabase
          .from('breed_premiums')
          .update({ upcharge_amount: row.upcharge_amount, updated_at: new Date().toISOString() })
          .eq('id', row.id);
        if (error) throw error;
      }
      // Mark saved
      for (const row of dirty) {
        row.original_amount = row.upcharge_amount;
        row.dirty = false;
      }
      this.success = `Saved ${dirty.length} ${dirty.length === 1 ? 'cell' : 'cells'}.`;
    } catch (err: any) {
      this.error = err.message || 'Failed to save';
    } finally {
      this.saving = false;
    }
  }

  resetOne(row: PremiumRow): void {
    row.upcharge_amount = row.original_amount;
    row.dirty = false;
  }

  resetAll(): void {
    for (const row of this.rows) {
      row.upcharge_amount = row.original_amount;
      row.dirty = false;
    }
  }
}
