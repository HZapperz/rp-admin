import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SupabaseService } from '../../../core/services/supabase.service';

type Category = 'POODLE_DOODLE' | 'DOUBLE_COAT' | 'LONG_COAT_SPANIEL' | 'WIRE_COAT' | 'STANDARD';
type Size = 'small' | 'medium' | 'large' | 'xl';

interface Breed {
  id: string;
  name: string;
  coat_category: Category;
  typical_size?: Size | null;
  aliases?: string[];
  is_active: boolean;
  display_order?: number;
  // Transient
  dirty?: boolean;
  aliasesInput?: string;
}

const CATEGORIES: Category[] = ['POODLE_DOODLE', 'DOUBLE_COAT', 'LONG_COAT_SPANIEL', 'WIRE_COAT', 'STANDARD'];
const SIZES: (Size | null)[] = [null, 'small', 'medium', 'large', 'xl'];

const CATEGORY_LABELS: Record<Category, string> = {
  POODLE_DOODLE: 'Poodle · Doodle',
  DOUBLE_COAT: 'Double Coat',
  LONG_COAT_SPANIEL: 'Long Coat / Spaniel',
  WIRE_COAT: 'Wire Coat',
  STANDARD: 'Standard (no surcharge)',
};

@Component({
  selector: 'app-breeds-editor',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './breeds-editor.component.html',
  styleUrls: ['./breeds-editor.component.scss'],
})
export class BreedsEditorComponent implements OnInit {
  readonly categories = CATEGORIES;
  readonly sizes = SIZES;
  readonly categoryLabels = CATEGORY_LABELS;

  breeds: Breed[] = [];
  filter = '';
  categoryFilter: Category | 'ALL' = 'ALL';
  loading = false;
  saving = false;
  error: string | null = null;
  success: string | null = null;

  showAddModal = false;
  newBreed: Partial<Breed> = this.blankBreed();
  newAliasesInput = '';

  constructor(private supabase: SupabaseService) {}

  async ngOnInit(): Promise<void> {
    await this.load();
  }

  blankBreed(): Partial<Breed> {
    return {
      name: '',
      coat_category: 'STANDARD',
      typical_size: null,
      aliases: [],
      is_active: true,
    };
  }

  async load(): Promise<void> {
    this.loading = true;
    this.error = null;
    try {
      const { data, error } = await this.supabase
        .from('breeds')
        .select('id, name, coat_category, typical_size, aliases, is_active, display_order')
        .order('coat_category')
        .order('name');
      if (error) throw error;
      this.breeds = (data || []).map((b: any) => ({
        id: b.id,
        name: b.name,
        coat_category: b.coat_category,
        typical_size: b.typical_size,
        aliases: b.aliases || [],
        is_active: b.is_active,
        display_order: b.display_order,
        dirty: false,
        aliasesInput: (b.aliases || []).join(', '),
      }));
    } catch (err: any) {
      this.error = err.message || 'Failed to load breeds';
    } finally {
      this.loading = false;
    }
  }

  get filteredBreeds(): Breed[] {
    const q = this.filter.trim().toLowerCase();
    return this.breeds.filter(b => {
      if (this.categoryFilter !== 'ALL' && b.coat_category !== this.categoryFilter) return false;
      if (!q) return true;
      if (b.name.toLowerCase().includes(q)) return true;
      return (b.aliases || []).some(a => a.toLowerCase().includes(q));
    });
  }

  get dirtyCount(): number {
    return this.breeds.filter(b => b.dirty).length;
  }

  markDirty(breed: Breed): void {
    breed.dirty = true;
    this.success = null;
  }

  onAliasesChange(breed: Breed, value: string): void {
    breed.aliasesInput = value;
    breed.aliases = value
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);
    this.markDirty(breed);
  }

  async save(): Promise<void> {
    const dirty = this.breeds.filter(b => b.dirty);
    if (dirty.length === 0) return;
    this.saving = true;
    this.error = null;
    this.success = null;
    try {
      for (const breed of dirty) {
        const { error } = await this.supabase
          .from('breeds')
          .update({
            name: breed.name,
            coat_category: breed.coat_category,
            typical_size: breed.typical_size,
            aliases: breed.aliases,
            is_active: breed.is_active,
            updated_at: new Date().toISOString(),
          })
          .eq('id', breed.id);
        if (error) throw error;
      }
      for (const breed of dirty) breed.dirty = false;
      this.success = `Saved ${dirty.length} ${dirty.length === 1 ? 'breed' : 'breeds'}.`;
    } catch (err: any) {
      this.error = err.message || 'Failed to save';
    } finally {
      this.saving = false;
    }
  }

  openAdd(): void {
    this.newBreed = this.blankBreed();
    this.newAliasesInput = '';
    this.showAddModal = true;
    this.error = null;
    this.success = null;
  }

  closeAdd(): void {
    this.showAddModal = false;
  }

  async createNew(): Promise<void> {
    if (!this.newBreed.name?.trim()) {
      this.error = 'Breed name is required';
      return;
    }
    const aliases = this.newAliasesInput
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);
    this.saving = true;
    this.error = null;
    try {
      const { data, error } = await this.supabase
        .from('breeds')
        .insert({
          name: this.newBreed.name!.trim(),
          coat_category: this.newBreed.coat_category,
          typical_size: this.newBreed.typical_size || null,
          aliases,
          is_active: this.newBreed.is_active ?? true,
        })
        .select()
        .single();
      if (error) throw error;
      this.breeds.push({
        ...(data as any),
        dirty: false,
        aliasesInput: aliases.join(', '),
        aliases,
      });
      this.breeds.sort((a, b) => a.coat_category.localeCompare(b.coat_category) || a.name.localeCompare(b.name));
      this.success = `Created "${data.name}".`;
      this.showAddModal = false;
    } catch (err: any) {
      this.error = err.message || 'Failed to create breed';
    } finally {
      this.saving = false;
    }
  }

  async toggleActive(breed: Breed): Promise<void> {
    breed.is_active = !breed.is_active;
    this.markDirty(breed);
  }
}
