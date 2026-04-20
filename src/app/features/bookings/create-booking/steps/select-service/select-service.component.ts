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
  price: number;
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

export interface AddOnOption {
  id: string;
  name: string;
  description: string;
  priceBySize: {
    SMALL: number;
    MEDIUM: number;
    LARGE: number;
    XL?: number;
  };
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
  // Phase 2: cached breed data for coat-surcharge lookup
  private breeds: Array<{ id: string; coat_category: string; name: string }> = [];
  private breedPremiums: Array<{ coat_category: string; size: string; package_type: string; upcharge_amount: number }> = [];

  constructor(
    private packageService: PackageService,
    private adminBookingService: AdminBookingService,
  ) {}

  addOns: AddOnOption[] = [
    {
      id: 'premium-products',
      name: 'Premium Products',
      description: 'Upgraded shampoo, conditioner, and grooming products',
      priceBySize: { SMALL: 20, MEDIUM: 20, LARGE: 20, XL: 20 }
    },
    {
      id: 'flea-treatment',
      name: 'Flea Treatment',
      description: 'Professional flea treatment and prevention',
      priceBySize: { SMALL: 20, MEDIUM: 20, LARGE: 20, XL: 20 }
    },
    {
      id: 'de-shedding',
      name: 'De-Shedding',
      description: 'Deep de-shedding treatment to reduce shedding',
      priceBySize: { SMALL: 30, MEDIUM: 30, LARGE: 30, XL: 30 }
    },
    {
      id: 'skunk-works',
      name: 'Skunk Works',
      description: 'Specialized treatment for skunk spray odor removal',
      priceBySize: { SMALL: 100, MEDIUM: 100, LARGE: 100, XL: 100 }
    }
  ];

  ngOnInit(): void {
    this.loadPackages();
    this.loadBreedData();
    this.initializePetServices();
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
   * Determine the effective coat_category for a pet (pet.coat_category_override beats
   * breed.coat_category). Sets breed_id + coat_category on the PetServiceSelection.
   */
  private resolveBreedContext(petService: PetServiceSelection): void {
    const pet = this.selectedPets.find((p) => p.id === petService.pet_id);
    if (!pet) return;
    const override = pet.coat_category_override;
    const breed = pet.breed_id ? this.breeds.find((b) => b.id === pet.breed_id) : undefined;
    const category = (override || breed?.coat_category || 'STANDARD') as PetServiceSelection['coat_category'];
    petService.breed_id = pet.breed_id;
    petService.coat_category = category;
  }

  loadPackages(): void {
    this.loading = true;
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
        this.loading = false;
        // Fallback to default packages if API fails
        this.packages = [
          {
            type: 'BASIC',
            name: 'Royal Bath',
            description: 'Essential grooming package with bath, nail care, and ear cleaning',
            features: ['Bath & Brush', 'Gland Expression', 'Nail Trim', 'Ear Cleaning'],
            priceBySize: { SMALL: 59, MEDIUM: 79, LARGE: 99, XL: 119 }
          },
          {
            type: 'PREMIUM',
            name: 'Royal Groom',
            description: 'Complete grooming service with haircut, teeth cleaning, and nail buffing',
            features: ['Bath & Brush', 'Gland Expression', 'Nail Trim', 'Ear Cleaning', 'Hair Trim', 'Teeth Cleaning', 'Nail Buffing'],
            priceBySize: { SMALL: 95, MEDIUM: 125, LARGE: 150, XL: 175 }
          },
          {
            type: 'DELUXE',
            name: 'Royal Spa',
            description: 'Premium spa experience with aromatherapy, paw care, and all grooming services',
            features: ['Bath & Brush', 'Gland Expression', 'Nail Trim', 'Ear Cleaning', 'Hair Trim', 'Teeth Cleaning', 'Nose & Paws Treatment', 'Nail Buffing', 'Aromatherapy Oils & Essentials'],
            priceBySize: { SMALL: 115, MEDIUM: 145, LARGE: 175, XL: 205 }
          }
        ];
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
        breed_premium: 0,
      };
      this.resolveBreedContext(ps);
      return ps;
    });
    this.emitServices();
  }

  selectPackage(petService: PetServiceSelection, packageType: 'BASIC' | 'PREMIUM' | 'DELUXE'): void {
    petService.package_type = packageType;
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

    // Add package price
    if (petService.package_type) {
      const packageOption = this.packages.find(p => p.type === petService.package_type);
      if (packageOption) {
        // Ensure size is uppercase to match priceBySize keys
        const sizeKey = petService.pet_size.toUpperCase() as 'SMALL' | 'MEDIUM' | 'LARGE' | 'XL';
        const price = packageOption.priceBySize[sizeKey];
        if (price !== undefined) {
          total += price;
        }
      }
    }

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
    this.servicesSelected.emit([...this.petServices]);
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
