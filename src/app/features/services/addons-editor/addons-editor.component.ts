import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SupabaseService } from '../../../core/services/supabase.service';

type PackageType = 'basic' | 'premium' | 'deluxe';

interface AddonRow {
  id: string;
  name: string;
  description?: string | null;
  price?: number | null;
  price_small?: number | null;
  price_medium?: number | null;
  price_large?: number | null;
  price_xl?: number | null;
  is_percentage: boolean;
  percentage?: number | null;
  category?: string | null;
  required_packages?: PackageType[] | null;
  is_active: boolean;
  display_order?: number | null;
  // Transient UI state
  dirty?: boolean;
}

const PACKAGES: PackageType[] = ['basic', 'premium', 'deluxe'];
const PACKAGE_LABELS: Record<PackageType, string> = {
  basic: 'Bath',
  premium: 'Groom',
  deluxe: 'Spa',
};

@Component({
  selector: 'app-addons-editor',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './addons-editor.component.html',
  styleUrls: ['./addons-editor.component.scss'],
})
export class AddonsEditorComponent implements OnInit {
  readonly packages = PACKAGES;
  readonly packageLabels = PACKAGE_LABELS;

  addons: AddonRow[] = [];
  filter = '';
  loading = false;
  saving = false;
  error: string | null = null;
  success: string | null = null;

  showAddModal = false;
  newAddon: Partial<AddonRow> = this.blankAddon();

  constructor(private supabase: SupabaseService) {}

  async ngOnInit(): Promise<void> {
    await this.load();
  }

  blankAddon(): Partial<AddonRow> {
    return {
      name: '',
      description: '',
      price_small: null,
      price_medium: null,
      price_large: null,
      price_xl: null,
      is_percentage: false,
      percentage: null,
      category: 'grooming',
      required_packages: null,
      is_active: true,
      display_order: 100,
    };
  }

  async load(): Promise<void> {
    this.loading = true;
    this.error = null;
    try {
      const { data, error } = await this.supabase
        .from('addons')
        .select('id, name, description, price, price_small, price_medium, price_large, price_xl, is_percentage, percentage, category, required_packages, is_active, display_order')
        .order('display_order', { nullsFirst: false })
        .order('name');
      if (error) throw error;
      this.addons = (data || []).map((a: any) => ({
        id: a.id,
        name: a.name,
        description: a.description,
        price: a.price,
        price_small: a.price_small,
        price_medium: a.price_medium,
        price_large: a.price_large,
        price_xl: a.price_xl,
        is_percentage: !!a.is_percentage,
        percentage: a.percentage,
        category: a.category,
        required_packages: a.required_packages,
        is_active: a.is_active,
        display_order: a.display_order,
        dirty: false,
      }));
    } catch (err: any) {
      this.error = err.message || 'Failed to load add-ons';
    } finally {
      this.loading = false;
    }
  }

  get filteredAddons(): AddonRow[] {
    const q = this.filter.trim().toLowerCase();
    if (!q) return this.addons;
    return this.addons.filter(a =>
      a.name.toLowerCase().includes(q) ||
      (a.category || '').toLowerCase().includes(q)
    );
  }

  get dirtyCount(): number {
    return this.addons.filter(a => a.dirty).length;
  }

  markDirty(addon: AddonRow): void {
    addon.dirty = true;
    this.success = null;
  }

  /**
   * Toggle whether this addon requires a specific package tier. `null` means "all tiers".
   */
  togglePackage(addon: AddonRow, pkg: PackageType): void {
    const current = new Set(addon.required_packages || []);
    if (current.has(pkg)) current.delete(pkg);
    else current.add(pkg);
    // If all three tiers are checked, collapse to null (= "all tiers") so the DB stays clean.
    addon.required_packages = current.size === 0 || current.size === 3 ? null : Array.from(current) as PackageType[];
    this.markDirty(addon);
  }

  isPackageRequired(addon: AddonRow, pkg: PackageType): boolean {
    if (!addon.required_packages || addon.required_packages.length === 0) return true;
    return addon.required_packages.includes(pkg);
  }

  toggleActive(addon: AddonRow): void {
    addon.is_active = !addon.is_active;
    this.markDirty(addon);
  }

  /**
   * True if this addon has at least one size-specific price set. Used to show
   * a "legacy flat price" hint for addons that still only have the flat column.
   */
  hasSizePrices(addon: AddonRow): boolean {
    return addon.price_small != null ||
           addon.price_medium != null ||
           addon.price_large != null ||
           addon.price_xl != null;
  }

  async save(): Promise<void> {
    const dirty = this.addons.filter(a => a.dirty);
    if (dirty.length === 0) return;
    this.saving = true;
    this.error = null;
    this.success = null;
    try {
      for (const addon of dirty) {
        const patch: any = {
          name: addon.name.trim(),
          description: addon.description,
          category: addon.category,
          required_packages: addon.required_packages,
          is_active: addon.is_active,
          display_order: addon.display_order,
          updated_at: new Date().toISOString(),
        };
        if (addon.is_percentage) {
          patch.percentage = addon.percentage;
        } else {
          patch.price_small = addon.price_small;
          patch.price_medium = addon.price_medium;
          patch.price_large = addon.price_large;
          patch.price_xl = addon.price_xl;
          // If admin has set any size-specific price, null the flat fallback.
          // Otherwise `calculateAddonPrice` would silently return the flat price
          // for sizes that are still null — producing mixed per-size/flat billing.
          if (this.hasSizePrices(addon)) {
            patch.price = null;
          }
        }
        const { error } = await this.supabase
          .from('addons')
          .update(patch)
          .eq('id', addon.id);
        if (error) throw error;
      }
      for (const addon of dirty) addon.dirty = false;
      this.success = `Saved ${dirty.length} ${dirty.length === 1 ? 'add-on' : 'add-ons'}.`;
    } catch (err: any) {
      this.error = err.message || 'Failed to save';
    } finally {
      this.saving = false;
    }
  }

  openAdd(): void {
    this.newAddon = this.blankAddon();
    this.showAddModal = true;
    this.error = null;
    this.success = null;
  }

  closeAdd(): void {
    this.showAddModal = false;
  }

  async createNew(): Promise<void> {
    if (!this.newAddon.name?.trim()) {
      this.error = 'Add-on name is required';
      return;
    }
    if (this.newAddon.is_percentage) {
      if (this.newAddon.percentage == null || Number(this.newAddon.percentage) <= 0) {
        this.error = 'Percentage must be greater than 0';
        return;
      }
    } else {
      const someSize = [
        this.newAddon.price_small, this.newAddon.price_medium,
        this.newAddon.price_large, this.newAddon.price_xl,
      ].some(v => v != null && Number(v) >= 0);
      if (!someSize) {
        this.error = 'Set at least one size price';
        return;
      }
    }
    this.saving = true;
    this.error = null;
    try {
      const insert: any = {
        name: this.newAddon.name!.trim(),
        description: this.newAddon.description || null,
        category: this.newAddon.category || null,
        required_packages: this.newAddon.required_packages || null,
        is_active: this.newAddon.is_active ?? true,
        is_percentage: !!this.newAddon.is_percentage,
        display_order: this.newAddon.display_order ?? 100,
      };
      if (this.newAddon.is_percentage) {
        insert.percentage = Number(this.newAddon.percentage);
      } else {
        insert.price_small = this.newAddon.price_small != null ? Number(this.newAddon.price_small) : null;
        insert.price_medium = this.newAddon.price_medium != null ? Number(this.newAddon.price_medium) : null;
        insert.price_large = this.newAddon.price_large != null ? Number(this.newAddon.price_large) : null;
        insert.price_xl = this.newAddon.price_xl != null ? Number(this.newAddon.price_xl) : null;
      }
      const { data, error } = await this.supabase
        .from('addons')
        .insert(insert)
        .select()
        .single();
      if (error) throw error;
      this.addons.push({ ...(data as any), dirty: false });
      this.addons.sort((a, b) => (a.display_order ?? 999) - (b.display_order ?? 999) || a.name.localeCompare(b.name));
      this.success = `Created "${(data as any).name}".`;
      this.showAddModal = false;
    } catch (err: any) {
      this.error = err.message || 'Failed to create add-on';
    } finally {
      this.saving = false;
    }
  }
}
