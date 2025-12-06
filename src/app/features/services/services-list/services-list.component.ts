import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SupabaseService } from '../../../core/services/supabase.service';

interface ServicePackage {
  id: string;
  service_id: string;
  name: string;
  description: string;
  duration: number;
  price_small: number;
  price_medium: number;
  price_large: number;
  price_xl: number;
  includes: string[];
  icon: string;
  package_type: 'basic' | 'premium' | 'deluxe';
  is_popular: boolean;
  is_active: boolean;
  display_order: number;
  created_at: string;
  updated_at: string;
}

@Component({
  selector: 'app-services-list',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './services-list.component.html',
  styleUrls: ['./services-list.component.scss'],
})
export class ServicesListComponent implements OnInit {
  packages: ServicePackage[] = [];
  loading = false;
  error: string | null = null;
  showAddModal = false;
  isSubmitting = false;

  // Form data for new package
  newPackage: Partial<ServicePackage> = {
    name: '',
    description: '',
    duration: 60,
    price_small: 0,
    price_medium: 0,
    price_large: 0,
    price_xl: 0,
    includes: [],
    icon: '✨',
    package_type: 'basic',
    is_popular: false,
    is_active: true,
    display_order: 0,
  };

  newIncludeItem = '';

  constructor(private supabase: SupabaseService) {}

  async ngOnInit(): Promise<void> {
    await this.loadPackages();
  }

  async loadPackages(): Promise<void> {
    this.loading = true;
    this.error = null;

    try {
      // Try to fetch from service_packages table
      const { data, error } = await this.supabase
        .from('service_packages')
        .select('*')
        .order('display_order', { ascending: true });

      if (error) {
        console.error('Error loading packages:', error);
        // If table doesn't exist, use fallback data
        this.packages = this.getFallbackPackages();
      } else {
        // Transform the data to match our interface
        this.packages = (data || []).map((pkg: any) => ({
          ...pkg,
          includes: Array.isArray(pkg.includes) ? pkg.includes : (pkg.includes ? [pkg.includes] : []),
        }));
      }
    } catch (err) {
      console.error('Error loading packages:', err);
      // Use fallback data if Supabase query fails
      this.packages = this.getFallbackPackages();
    } finally {
      this.loading = false;
    }
  }

  getFallbackPackages(): ServicePackage[] {
    // Fallback packages if database table doesn't exist
    return [
      {
        id: '1',
        service_id: '1',
        name: 'Royal Bath',
        description: 'Essential grooming package with bath, nail care, and ear cleaning',
        duration: 60,
        price_small: 59,
        price_medium: 79,
        price_large: 99,
        price_xl: 119,
        includes: ['Bath & Brush', 'Gland Expression', 'Nail Trim', 'Ear Cleaning'],
        icon: '🛁',
        package_type: 'basic',
        is_popular: false,
        is_active: true,
        display_order: 1,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      {
        id: '2',
        service_id: '2',
        name: 'Royal Groom',
        description: 'Complete grooming service with haircut, teeth cleaning, and nail buffing',
        duration: 90,
        price_small: 95,
        price_medium: 125,
        price_large: 150,
        price_xl: 175,
        includes: [
          'Bath & Brush',
          'Gland Expression',
          'Nail Trim',
          'Ear Cleaning',
          'Hair Trim',
          'Teeth Cleaning',
          'Nail Buffing',
        ],
        icon: '✂️',
        package_type: 'premium',
        is_popular: true,
        is_active: true,
        display_order: 2,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      {
        id: '3',
        service_id: '3',
        name: 'Royal Spa',
        description: 'Premium spa experience with aromatherapy, paw care, and all grooming services',
        duration: 120,
        price_small: 115,
        price_medium: 145,
        price_large: 175,
        price_xl: 205,
        includes: [
          'Bath & Brush',
          'Gland Expression',
          'Nail Trim',
          'Ear Cleaning',
          'Hair Trim',
          'Teeth Cleaning',
          'Nose & Paws Treatment',
          'Nail Buffing',
          'Aromatherapy Oils & Essentials',
        ],
        icon: '✨',
        package_type: 'deluxe',
        is_popular: false,
        is_active: true,
        display_order: 3,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ];
  }

  async toggleStatus(pkg: ServicePackage): Promise<void> {
    const newStatus = !pkg.is_active;

    try {
      const { error } = await this.supabase
        .from('service_packages')
        .update({ is_active: newStatus })
        .eq('id', pkg.id);

      if (error) {
        console.error('Error updating package status:', error);
        this.error = 'Failed to update package status';
        return;
      }

      pkg.is_active = newStatus;
    } catch (err) {
      console.error('Error updating package status:', err);
      // Update locally even if API call fails
      pkg.is_active = newStatus;
    }
  }

  editPackage(pkg: ServicePackage): void {
    // TODO: Open edit dialog
    console.log('Edit package:', pkg);
  }

  async deletePackage(pkg: ServicePackage): Promise<void> {
    if (!confirm(`Are you sure you want to deactivate "${pkg.name}"? This will hide it from clients.`)) {
      return;
    }

    try {
      const { error } = await this.supabase
        .from('service_packages')
        .update({ is_active: false })
        .eq('id', pkg.id);

      if (error) {
        console.error('Error deactivating package:', error);
        this.error = 'Failed to deactivate package';
        return;
      }

      pkg.is_active = false;
      await this.loadPackages();
    } catch (err) {
      console.error('Error deactivating package:', err);
      // Update locally even if API call fails
      pkg.is_active = false;
    }
  }

  addPackage(): void {
    this.resetForm();
    this.showAddModal = true;
  }

  closeModal(): void {
    this.showAddModal = false;
    this.resetForm();
    this.error = null;
  }

  resetForm(): void {
    this.newPackage = {
      name: '',
      description: '',
      duration: 60,
      price_small: 0,
      price_medium: 0,
      price_large: 0,
      price_xl: 0,
      includes: [],
      icon: '✨',
      package_type: 'basic',
      is_popular: false,
      is_active: true,
      display_order: this.packages.length + 1,
    };
    this.newIncludeItem = '';
  }

  addIncludeItem(): void {
    if (this.newIncludeItem.trim()) {
      if (!this.newPackage.includes) {
        this.newPackage.includes = [];
      }
      this.newPackage.includes.push(this.newIncludeItem.trim());
      this.newIncludeItem = '';
    }
  }

  removeIncludeItem(index: number): void {
    if (this.newPackage.includes) {
      this.newPackage.includes.splice(index, 1);
    }
  }

  async submitPackage(): Promise<void> {
    // Validation
    if (!this.newPackage.name?.trim()) {
      this.error = 'Package name is required';
      return;
    }
    if (!this.newPackage.description?.trim()) {
      this.error = 'Description is required';
      return;
    }
    if (!this.newPackage.duration || this.newPackage.duration <= 0) {
      this.error = 'Duration must be greater than 0';
      return;
    }
    if (
      !this.newPackage.price_small ||
      !this.newPackage.price_medium ||
      !this.newPackage.price_large ||
      !this.newPackage.price_xl
    ) {
      this.error = 'All prices are required';
      return;
    }
    if (!this.newPackage.includes || this.newPackage.includes.length === 0) {
      this.error = 'At least one include item is required';
      return;
    }

    this.isSubmitting = true;
    this.error = null;

    try {
      const packageData = {
        service_id: this.newPackage.service_id || 'default',
        name: this.newPackage.name.trim(),
        description: this.newPackage.description.trim(),
        duration: this.newPackage.duration,
        price_small: this.newPackage.price_small,
        price_medium: this.newPackage.price_medium,
        price_large: this.newPackage.price_large,
        price_xl: this.newPackage.price_xl,
        includes: this.newPackage.includes,
        icon: this.newPackage.icon || '✨',
        package_type: this.newPackage.package_type || 'basic',
        is_popular: this.newPackage.is_popular || false,
        is_active: this.newPackage.is_active !== false,
        display_order: this.newPackage.display_order || this.packages.length + 1,
      };

      const { data, error } = await this.supabase
        .from('service_packages')
        .insert(packageData)
        .select()
        .single();

      if (error) {
        console.error('Error creating package:', error);
        this.error = 'Failed to create package. Please try again.';
        this.isSubmitting = false;
        return;
      }

      // Success - reload packages and close modal
      await this.loadPackages();
      this.closeModal();
    } catch (err) {
      console.error('Error creating package:', err);
      this.error = 'Failed to create package. Please try again.';
    } finally {
      this.isSubmitting = false;
    }
  }

  formatPrice(price: number): string {
    return `$${price.toFixed(2)}`;
  }

  getPackageTypeLabel(type: string): string {
    const labels: Record<string, string> = {
      basic: 'Royal Bath',
      premium: 'Royal Groom',
      deluxe: 'Royal Spa',
    };
    return labels[type] || type;
  }

  getPackageTypeColor(type: string): string {
    const colors: Record<string, string> = {
      basic: 'badge-info',
      premium: 'badge-primary',
      deluxe: 'badge-accent',
    };
    return colors[type] || 'badge-default';
  }
}
