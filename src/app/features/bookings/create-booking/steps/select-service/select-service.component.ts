import { Component, EventEmitter, Input, OnInit, Output, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClientModule } from '@angular/common/http';
import { MatIconModule } from '@angular/material/icon';
import { PackageService, ServicePackage } from '../../../../../core/services/package.service';
import { AdminBookingService } from '../../../../../core/services/admin-booking.service';

export interface PetServiceSelection {
  pet_id: string;
  pet_name: string;
  pet_size: string;
  package_type: 'BASIC' | 'PREMIUM' | 'DELUXE' | null;
  add_ons: string[];
  /**
   * Addons resolved to their display name + size-priced amount. Populated by the
   * select-service step so the parent wizard doesn't need its own addon catalog —
   * this prevents a race where `addons` could be billed at $0 if the parent's fetch
   * hadn't resolved by submit time.
   */
  addons_resolved?: Array<{ id: string; name: string; price: number }>;
  price: number;
  // DB-resolved package price for this pet's size+package combo. Stored separately
  // from `price` (which includes breed premium + addons) so downstream consumers
  // can persist booking_pets.package_price without re-deriving via a stale lookup.
  package_price: number;
  // Phase 2 breed coat-type surcharge
  breed_id?: string;
  coat_category?: 'POODLE_DOODLE' | 'DOUBLE_COAT' | 'LONG_COAT_SPANIEL' | 'WIRE_COAT' | 'STANDARD';
  breed_premium?: number;
}

export interface PackageOption {
  type: 'BASIC' | 'PREMIUM' | 'DELUXE';
  name: string;
  description: string;
  features: string[];
  priceBySize: {
    SMALL: number;
    MEDIUM: number;
    LARGE: number;
    XL: number;
  };
}

/**
 * Admin-view view model for an add-on. Hydrated from the public.addons table.
 */
export interface AddOnOption {
  id: string;
  name: string;
  description: string;
  priceBySize: {
    SMALL: number;
    MEDIUM: number;
    LARGE: number;
    XL: number;
  };
  required_packages: Array<'BASIC' | 'PREMIUM' | 'DELUXE'> | null;
}

@Component({
  selector: 'app-select-service',
  standalone: true,
  imports: [CommonModule, HttpClientModule, MatIconModule],
  templateUrl: './select-service.component.html',
  styleUrls: ['./select-service.component.scss']
})
export class SelectServiceComponent implements OnInit, OnChanges {
  @Input() selectedPets: any[] = [];
  @Output() servicesSelected = new EventEmitter<PetServiceSelection[]>();

  petServices: PetServiceSelection[] = [];
  packages: PackageOption[] = [];
  loading = true;
  loadError: string | null = null;
  // Phase 2: cached breed data for coat-surcharge lookup
  private breeds: Array<{ id: string; coat_category: string; name: string; aliases?: string[] }> = [];
  private breedPremiums: Array<{ coat_category: string; size: string; package_type: string; upcharge_amount: number }> = [];

  constructor(
    private packageService: PackageService,
    private adminBookingService: AdminBookingService,
  ) {}

  addOns: AddOnOption[] = [];

  ngOnInit(): void {
    this.loadPackages();
    this.loadBreedData();
    this.loadAddons();
    this.initializePetServices();
  }

  /**
   * Pulls the addon catalog from Supabase so admins see the same options clients see
   * (previously this was a hardcoded 4-item list that drifted from the DB).
   */
  private loadAddons(): void {
    this.adminBookingService.getAddons().subscribe({
      next: (addons) => {
        this.addOns = addons.map((a) => {
          const flat = a.price != null ? Number(a.price) : 0;
          const pkgs = (a.required_packages || null) as string[] | null;
          return {
            id: a.id,
            name: a.name,
            description: a.description || '',
            priceBySize: {
              SMALL:  a.price_small  != null ? Number(a.price_small)  : flat,
              MEDIUM: a.price_medium != null ? Number(a.price_medium) : flat,
              LARGE:  a.price_large  != null ? Number(a.price_large)  : flat,
              XL:     a.price_xl     != null ? Number(a.price_xl)     : flat,
            },
            required_packages: pkgs ? (pkgs.map((p) => p.toUpperCase()) as Array<'BASIC' | 'PREMIUM' | 'DELUXE'>) : null,
          };
        });
        // If pets + selections are already in place, re-price them now that the catalog is loaded.
        this.petServices.forEach((ps) => this.calculatePrice(ps));
        this.emitServices();
      },
      error: (err) => console.error('[select-service] loadAddons failed:', err),
    });
  }

  /**
   * Filter add-ons to those applicable to the pet's currently selected package tier.
   * Returns all add-ons if no package is selected yet (so the user sees the full catalog).
   */
  getAvailableAddons(petService: PetServiceSelection): AddOnOption[] {
    if (!petService.package_type) return this.addOns;
    return this.addOns.filter(
      (a) => !a.required_packages || a.required_packages.includes(petService.package_type!)
    );
  }

  private loadBreedData(): void {
    this.adminBookingService.getBreeds().subscribe({
      next: (breeds) => {
        this.breeds = breeds as any;
        // Re-compute breed info for existing services now that data is loaded
        this.petServices.forEach((ps) => this.resolveBreedContext(ps));
        this.petServices.forEach((ps) => this.calculatePrice(ps));
        this.emitServices();
      },
      error: (err) => console.error('[select-service] loadBreeds failed:', err),
    });
    this.adminBookingService.getBreedPremiums().subscribe({
      next: (premiums) => {
        this.breedPremiums = premiums as any;
        this.petServices.forEach((ps) => this.calculatePrice(ps));
        this.emitServices();
      },
      error: (err) => console.error('[select-service] loadPremiums failed:', err),
    });
  }

  /**
   * Determine the effective coat_category for a pet. Resolution order:
   *   1) pet.coat_category_override (explicit admin override)
   *   2) pet.breed_id → breeds.coat_category (linked record)
   *   3) pet.breed free-text → breeds.name/aliases lookup (handles older pets where
   *      the breed_id link was never backfilled — e.g. a Goldendoodle with breed_id=null
   *      still gets POODLE_DOODLE so the surcharge isn't silently dropped)
   *   4) STANDARD fallback
   */
  private resolveBreedContext(petService: PetServiceSelection): void {
    const pet = this.selectedPets.find((p) => p.id === petService.pet_id);
    if (!pet) return;
    const override = pet.coat_category_override;
    let breed = pet.breed_id ? this.breeds.find((b) => b.id === pet.breed_id) : undefined;
    if (!breed && !override && pet.breed) {
      const text = pet.breed.toLowerCase().trim();
      breed = this.breeds.find(b =>
        b.name.toLowerCase().trim() === text ||
        (b.aliases || []).some(a => a.toLowerCase().trim() === text)
      );
    }
    const category = (override || breed?.coat_category || 'STANDARD') as PetServiceSelection['coat_category'];
    petService.breed_id = breed?.id || pet.breed_id;
    petService.coat_category = category;
  }

  loadPackages(): void {
    this.loading = true;
    this.loadError = null;
    this.packageService.getPackages().subscribe({
      next: (packages: ServicePackage[]) => {
        this.packages = packages.map(pkg => ({
          type: pkg.packageType.toUpperCase() as 'BASIC' | 'PREMIUM' | 'DELUXE',
          name: pkg.name,
          description: pkg.description,
          features: pkg.includes,
          priceBySize: {
            SMALL: pkg.prices.small,
            MEDIUM: pkg.prices.medium,
            LARGE: pkg.prices.large,
            XL: pkg.prices.xl
          }
        }));
        this.loading = false;
      },
      error: (error: any) => {
        console.error('Error loading packages:', error);
        // Do NOT install a hardcoded fallback. Showing stale prices and letting
        // an admin submit a booking from them is exactly how booking f586cdd2 got
        // corrupted. Surface the error and block the wizard until the API recovers.
        this.loading = false;
        this.loadError = 'Unable to load service prices from the server. Refresh the page or try again in a moment.';
        this.packages = [];
      }
    });
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['selectedPets']) {
      this.initializePetServices();
    }
  }

  initializePetServices(): void {
    this.petServices = this.selectedPets.map(pet => {
      // Convert size_category to uppercase format expected by priceBySize
      const sizeCategory = pet.size_category?.toUpperCase() || 'SMALL';
      const ps: PetServiceSelection = {
        pet_id: pet.id,
        pet_name: pet.name,
        pet_size: sizeCategory,
        package_type: null,
        add_ons: [],
        price: 0,
        package_price: 0,
        breed_premium: 0,
      };
      this.resolveBreedContext(ps);
      return ps;
    });
    this.emitServices();
  }

  selectPackage(petService: PetServiceSelection, packageType: 'BASIC' | 'PREMIUM' | 'DELUXE'): void {
    petService.package_type = packageType;
    // Drop any previously-selected addons that don't apply to the new tier —
    // otherwise they stay in the payload (billed) even though the UI hides them.
    petService.add_ons = petService.add_ons.filter((addOnId) => {
      const addOn = this.addOns.find((a) => a.id === addOnId);
      if (!addOn || !addOn.required_packages) return true;
      return addOn.required_packages.includes(packageType);
    });
    this.calculatePrice(petService);
    this.emitServices();
  }

  toggleAddOn(petService: PetServiceSelection, addOnId: string): void {
    const index = petService.add_ons.indexOf(addOnId);
    if (index > -1) {
      petService.add_ons.splice(index, 1);
    } else {
      petService.add_ons.push(addOnId);
    }
    this.calculatePrice(petService);
    this.emitServices();
  }

  isAddOnSelected(petService: PetServiceSelection, addOnId: string): boolean {
    return petService.add_ons.includes(addOnId);
  }

  calculatePrice(petService: PetServiceSelection): void {
    let total = 0;
    let packagePrice = 0;

    // Add package price
    if (petService.package_type) {
      const packageOption = this.packages.find(p => p.type === petService.package_type);
      if (packageOption) {
        // Ensure size is uppercase to match priceBySize keys
        const sizeKey = petService.pet_size.toUpperCase() as 'SMALL' | 'MEDIUM' | 'LARGE' | 'XL';
        const price = packageOption.priceBySize[sizeKey];
        if (price !== undefined) {
          packagePrice = price;
          total += price;
        }
      }
    }
    petService.package_price = packagePrice;

    // Phase 2: breed coat-type surcharge
    const pkgTypeLower = petService.package_type?.toLowerCase(); // 'basic' | 'premium' | 'deluxe'
    const sizeLower = petService.pet_size.toLowerCase();         // 'small' | 'medium' | 'large' | 'xl'
    const breedPremium = this.adminBookingService.getBreedPremiumAmount(
      this.breedPremiums,
      petService.coat_category,
      sizeLower,
      pkgTypeLower,
    );
    petService.breed_premium = breedPremium;
    total += breedPremium;

    // Add add-ons prices
    petService.add_ons.forEach(addOnId => {
      const addOn = this.addOns.find(a => a.id === addOnId);
      if (addOn) {
        const sizeKey = petService.pet_size.toUpperCase() as 'SMALL' | 'MEDIUM' | 'LARGE' | 'XL';
        const price = addOn.priceBySize[sizeKey];
        if (price !== undefined) {
          total += price;
        }
      }
    });

    petService.price = total;
  }

  /**
   * Returns the breed coat-surcharge for a pet's currently-selected package, or 0 if none.
   * Used by the template to display the line item.
   */
  getBreedPremium(petService: PetServiceSelection): number {
    return Number(petService.breed_premium) || 0;
  }

  /**
   * Human-readable coat category label for the UI helper.
   */
  getCoatLabel(petService: PetServiceSelection): string {
    switch (petService.coat_category) {
      case 'POODLE_DOODLE': return 'Doodle / Poodle coat';
      case 'DOUBLE_COAT': return 'Double coat';
      case 'LONG_COAT_SPANIEL': return 'Long / silky coat';
      case 'WIRE_COAT': return 'Wire coat';
      default: return '';
    }
  }

  getPackagePrice(packageType: 'BASIC' | 'PREMIUM' | 'DELUXE', size: string): number {
    const packageOption = this.packages.find(p => p.type === packageType);
    if (!packageOption) return 0;
    
    // Ensure size is uppercase to match priceBySize keys
    const sizeKey = size.toUpperCase() as 'SMALL' | 'MEDIUM' | 'LARGE' | 'XL';
    return packageOption.priceBySize[sizeKey] || 0;
  }

  getAddOnPrice(addOnId: string, size: string): number {
    const addOn = this.addOns.find(a => a.id === addOnId);
    if (!addOn) return 0;
    
    // Ensure size is uppercase to match priceBySize keys
    const sizeKey = size.toUpperCase() as 'SMALL' | 'MEDIUM' | 'LARGE' | 'XL';
    return addOn.priceBySize[sizeKey] || 0;
  }

  getTotalPrice(): number {
    const total = this.petServices.reduce((sum, ps) => {
      const price = ps.price || 0;
      return sum + price;
    }, 0);
    return isNaN(total) ? 0 : total;
  }

  isAllPetsConfigured(): boolean {
    return this.petServices.every(ps => ps.package_type !== null);
  }

  emitServices(): void {
    // Resolve each pet's addons against the current catalog so the parent wizard
    // has authoritative names + sized prices without doing a second fetch.
    const resolved = this.petServices.map((ps) => {
      const sizeKey = ps.pet_size.toUpperCase() as 'SMALL' | 'MEDIUM' | 'LARGE' | 'XL';
      const addons_resolved = ps.add_ons
        .map((id) => {
          const a = this.addOns.find((x) => x.id === id);
          if (!a) return null;
          return {
            id: a.id,
            name: a.name,
            price: a.priceBySize[sizeKey] ?? 0,
          };
        })
        .filter((x): x is { id: string; name: string; price: number } => x !== null);
      return { ...ps, addons_resolved };
    });
    this.servicesSelected.emit(resolved);
  }

  formatCurrency(amount: number): string {
    return `$${amount.toFixed(2)}`;
  }

  getPackageName(packageType: 'BASIC' | 'PREMIUM' | 'DELUXE' | null): string {
    if (!packageType) return '';
    const packageOption = this.packages.find(p => p.type === packageType);
    return packageOption?.name || '';
  }
}
