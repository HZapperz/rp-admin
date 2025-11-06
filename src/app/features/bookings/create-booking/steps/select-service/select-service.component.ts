import { Component, EventEmitter, Input, OnInit, Output, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';

export interface PetServiceSelection {
  pet_id: string;
  pet_name: string;
  pet_size: string;
  package_type: 'BASIC' | 'PREMIUM' | 'DELUXE' | null;
  add_ons: string[];
  price: number;
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
  };
}

@Component({
  selector: 'app-select-service',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './select-service.component.html',
  styleUrls: ['./select-service.component.scss']
})
export class SelectServiceComponent implements OnInit, OnChanges {
  @Input() selectedPets: any[] = [];
  @Output() servicesSelected = new EventEmitter<PetServiceSelection[]>();

  petServices: PetServiceSelection[] = [];

  packages: PackageOption[] = [
    {
      type: 'BASIC',
      name: 'Basic Groom',
      description: 'Essential grooming services',
      features: ['Bath', 'Brush', 'Nail Trim', 'Ear Cleaning'],
      priceBySize: { SMALL: 45, MEDIUM: 60, LARGE: 75 }
    },
    {
      type: 'PREMIUM',
      name: 'Premium Groom',
      description: 'Complete grooming experience',
      features: ['Everything in Basic', 'Haircut/Styling', 'Teeth Brushing', 'Paw Pad Treatment'],
      priceBySize: { SMALL: 70, MEDIUM: 90, LARGE: 110 }
    },
    {
      type: 'DELUXE',
      name: 'Deluxe Spa',
      description: 'Ultimate pampering session',
      features: ['Everything in Premium', 'Deep Conditioning', 'Facial Treatment', 'Aromatherapy', 'Bandana/Bow'],
      priceBySize: { SMALL: 100, MEDIUM: 130, LARGE: 160 }
    }
  ];

  addOns: AddOnOption[] = [
    {
      id: 'FLEA_TREATMENT',
      name: 'Flea & Tick Treatment',
      description: 'Professional flea and tick prevention',
      priceBySize: { SMALL: 15, MEDIUM: 20, LARGE: 25 }
    },
    {
      id: 'DE_SHEDDING',
      name: 'De-shedding Treatment',
      description: 'Reduce excessive shedding',
      priceBySize: { SMALL: 20, MEDIUM: 25, LARGE: 30 }
    },
    {
      id: 'TEETH_CLEANING',
      name: 'Advanced Teeth Cleaning',
      description: 'Deep dental hygiene',
      priceBySize: { SMALL: 25, MEDIUM: 30, LARGE: 35 }
    },
    {
      id: 'NAIL_GRINDING',
      name: 'Nail Grinding',
      description: 'Smooth nail finishing',
      priceBySize: { SMALL: 10, MEDIUM: 12, LARGE: 15 }
    }
  ];

  ngOnInit(): void {
    this.initializePetServices();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['selectedPets']) {
      this.initializePetServices();
    }
  }

  initializePetServices(): void {
    this.petServices = this.selectedPets.map(pet => ({
      pet_id: pet.id,
      pet_name: pet.name,
      pet_size: pet.size,
      package_type: null,
      add_ons: [],
      price: 0
    }));
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
        total += packageOption.priceBySize[petService.pet_size as keyof typeof packageOption.priceBySize];
      }
    }

    // Add add-ons prices
    petService.add_ons.forEach(addOnId => {
      const addOn = this.addOns.find(a => a.id === addOnId);
      if (addOn) {
        total += addOn.priceBySize[petService.pet_size as keyof typeof addOn.priceBySize];
      }
    });

    petService.price = total;
  }

  getPackagePrice(packageType: 'BASIC' | 'PREMIUM' | 'DELUXE', size: string): number {
    const packageOption = this.packages.find(p => p.type === packageType);
    return packageOption?.priceBySize[size as keyof typeof packageOption.priceBySize] || 0;
  }

  getAddOnPrice(addOnId: string, size: string): number {
    const addOn = this.addOns.find(a => a.id === addOnId);
    return addOn?.priceBySize[size as keyof typeof addOn.priceBySize] || 0;
  }

  getTotalPrice(): number {
    return this.petServices.reduce((sum, ps) => sum + ps.price, 0);
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
