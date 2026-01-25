import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SupabaseService } from '../../../core/services/supabase.service';

interface PetGroom {
  date: string;
  service: string;
  pet: string;
  breed: string;
  size: string;
  package: string;
  price: number;
  minutes: number;
  hourlyReturn: number;
  isOutlier: boolean;
}

interface SizePackageAvg {
  size: string;
  package: string;
  grooms: number;
  avgMinutes: number;
  avgPrice: number;
  avgHourlyReturn: number;
}

interface BreedAvg {
  breed: string;
  size: string;
  grooms: number;
  avgMinutes: number;
  avgPrice: number;
  avgHourlyReturn: number;
}

@Component({
  selector: 'app-pricing-analysis',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './pricing-analysis.component.html',
  styleUrl: './pricing-analysis.component.scss'
})
export class PricingAnalysisComponent implements OnInit {
  isLoading = true;
  error: string | null = null;

  // Summary stats
  totalGrooms = 0;
  validGrooms = 0;
  outlierCount = 0;
  minHourlyReturn = 0;
  maxHourlyReturn = 0;
  avgHourlyReturn = 0;

  // Data arrays
  petGrooms: PetGroom[] = [];
  outliers: PetGroom[] = [];
  sizePackageAvgs: SizePackageAvg[] = [];
  timeSinkBreeds: BreedAvg[] = [];
  moneyMakerBreeds: BreedAvg[] = [];

  // Industry benchmarks (static data)
  industryBenchmarks = [
    { coatType: 'Silky/Long', examples: 'Maltese, Yorkie, Shih Tzu', industryTime: '60-90 min', yourTime: '47-60 min', verdict: 'Faster' },
    { coatType: 'Curly/Doodle', examples: 'Poodle, Goldendoodle', industryTime: '150-210 min', yourTime: '96-126 min', verdict: 'Faster' },
    { coatType: 'Double Coat', examples: 'Golden Retriever, GSD', industryTime: '90-150 min', yourTime: '50-63 min', verdict: 'Way Faster' },
    { coatType: 'Wire/Terrier', examples: 'Westie, Schnauzer', industryTime: '90-150 min', yourTime: '62-167 min', verdict: 'Variable' }
  ];

  // Pricing recommendations (static data based on analysis)
  pricingComparison = [
    { size: 'small', package: 'basic', avgTime: 53, currentPrice: 59, actualHourly: 70, targetPrice: 71, diff: '+$12' },
    { size: 'small', package: 'premium', avgTime: 77, currentPrice: 95, actualHourly: 74, targetPrice: 103, diff: '+$8' },
    { size: 'small', package: 'deluxe', avgTime: 92, currentPrice: 125, actualHourly: 83, targetPrice: 123, diff: 'OK' },
    { size: 'medium', package: 'premium', avgTime: 94, currentPrice: 125, actualHourly: 76, targetPrice: 125, diff: 'OK' },
    { size: 'large', package: 'basic', avgTime: 44, currentPrice: 99, actualHourly: 135, targetPrice: 59, diff: 'Premium' },
    { size: 'xl', package: 'basic', avgTime: 56, currentPrice: 119, actualHourly: 127, targetPrice: 75, diff: 'Premium' },
    { size: 'xl', package: 'deluxe', avgTime: 77, currentPrice: 205, actualHourly: 159, targetPrice: 103, diff: 'Premium' }
  ];

  surcharges = [
    { condition: 'Curly/Doodle Coat', examples: 'Poodles, Goldendoodles, Labradoodles', addedTime: '+30-60 min', surcharge: '+$15-25' },
    { condition: 'Wire Coat / Hand-stripping', examples: 'Westies, Schnauzers, Terriers', addedTime: '+30-60 min', surcharge: '+$20-30' },
    { condition: 'Matted Coat', examples: 'Any breed with tangles', addedTime: '+30-45 min', surcharge: '+$30-50' },
    { condition: 'Double Coat (de-shed)', examples: 'Huskies, GSDs, Golden Retrievers', addedTime: '+15-30 min', surcharge: '+$15-20' }
  ];

  constructor(private supabase: SupabaseService) {}

  async ngOnInit(): Promise<void> {
    await this.loadData();
  }

  private async loadData(): Promise<void> {
    try {
      this.isLoading = true;

      // Fetch pet-level groom data
      const { data: groomData, error: groomError } = await this.supabase.client
        .rpc('get_pricing_analysis_data');

      if (groomError) {
        // If RPC doesn't exist, fall back to direct query
        await this.loadDataDirect();
        return;
      }

      this.processGroomData(groomData);
    } catch (err: any) {
      console.error('Error loading pricing data:', err);
      // Try direct query as fallback
      await this.loadDataDirect();
    }
  }

  private async loadDataDirect(): Promise<void> {
    try {
      // Direct query for pet-level data
      const { data: bookings, error: bookingsError } = await this.supabase.client
        .from('bookings')
        .select(`
          id,
          scheduled_date,
          service_name,
          actual_start_time,
          actual_end_time,
          booking_pets (
            id,
            service_size,
            package_type,
            total_price,
            started_at,
            completed_at,
            pet:pets (
              name,
              breed
            )
          )
        `)
        .eq('status', 'completed')
        .order('scheduled_date', { ascending: false });

      if (bookingsError) throw bookingsError;

      // Process the data
      const petGrooms: PetGroom[] = [];

      for (const booking of bookings || []) {
        const bookingStart = booking.actual_start_time ? new Date(booking.actual_start_time) : null;
        const bookingEnd = booking.actual_end_time ? new Date(booking.actual_end_time) : null;
        const bookingMinutes = bookingStart && bookingEnd
          ? (bookingEnd.getTime() - bookingStart.getTime()) / 60000
          : null;
        const petCount = booking.booking_pets?.length || 1;

        for (const bp of booking.booking_pets || []) {
          // Calculate pet-specific time if available
          let minutes: number;
          if (bp.started_at && bp.completed_at) {
            const petStart = new Date(bp.started_at);
            const petEnd = new Date(bp.completed_at);
            minutes = (petEnd.getTime() - petStart.getTime()) / 60000;
          } else if (bookingMinutes) {
            minutes = bookingMinutes / petCount;
          } else {
            continue; // Skip if no time data
          }

          const price = Number(bp.total_price) || 0;
          const hourlyReturn = minutes > 0 ? (price / (minutes / 60)) : 0;
          const isOutlier = minutes < 10;

          // Handle Supabase relation which may return as object or array
          const petData = Array.isArray(bp.pet) ? bp.pet[0] : bp.pet;

          petGrooms.push({
            date: booking.scheduled_date,
            service: booking.service_name || 'Mixed',
            pet: petData?.name || 'Unknown',
            breed: petData?.breed || 'Unknown',
            size: bp.service_size,
            package: bp.package_type,
            price,
            minutes: Math.round(minutes),
            hourlyReturn: Math.round(hourlyReturn * 100) / 100,
            isOutlier
          });
        }
      }

      this.processGroomData(petGrooms);
    } catch (err: any) {
      console.error('Error loading direct data:', err);
      this.error = 'Failed to load pricing analysis data. Please try again.';
      this.isLoading = false;
    }
  }

  private processGroomData(data: PetGroom[]): void {
    // Separate valid grooms from outliers
    this.petGrooms = data.filter(g => !g.isOutlier);
    this.outliers = data.filter(g => g.isOutlier);

    this.totalGrooms = data.length;
    this.validGrooms = this.petGrooms.length;
    this.outlierCount = this.outliers.length;

    if (this.petGrooms.length > 0) {
      const hourlyReturns = this.petGrooms.map(g => g.hourlyReturn);
      this.minHourlyReturn = Math.round(Math.min(...hourlyReturns));
      this.maxHourlyReturn = Math.round(Math.max(...hourlyReturns));
      this.avgHourlyReturn = Math.round(hourlyReturns.reduce((a, b) => a + b, 0) / hourlyReturns.length);
    }

    // Calculate size/package averages
    this.calculateSizePackageAvgs();

    // Calculate breed averages
    this.calculateBreedAvgs();

    this.isLoading = false;
  }

  private calculateSizePackageAvgs(): void {
    const groups = new Map<string, PetGroom[]>();

    for (const groom of this.petGrooms) {
      const key = `${groom.size}|${groom.package}`;
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key)!.push(groom);
    }

    this.sizePackageAvgs = Array.from(groups.entries()).map(([key, grooms]) => {
      const [size, pkg] = key.split('|');
      const avgMinutes = Math.round(grooms.reduce((a, g) => a + g.minutes, 0) / grooms.length);
      const avgPrice = Math.round(grooms.reduce((a, g) => a + g.price, 0) / grooms.length * 100) / 100;
      const avgHourlyReturn = Math.round(grooms.reduce((a, g) => a + g.hourlyReturn, 0) / grooms.length * 100) / 100;

      return {
        size,
        package: pkg,
        grooms: grooms.length,
        avgMinutes,
        avgPrice,
        avgHourlyReturn
      };
    });

    // Sort by size then package
    const sizeOrder = ['small', 'medium', 'large', 'xl'];
    const pkgOrder = ['basic', 'premium', 'deluxe'];
    this.sizePackageAvgs.sort((a, b) => {
      const sizeCompare = sizeOrder.indexOf(a.size) - sizeOrder.indexOf(b.size);
      if (sizeCompare !== 0) return sizeCompare;
      return pkgOrder.indexOf(a.package) - pkgOrder.indexOf(b.package);
    });
  }

  private calculateBreedAvgs(): void {
    const groups = new Map<string, PetGroom[]>();

    for (const groom of this.petGrooms) {
      const key = `${groom.breed}|${groom.size}`;
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key)!.push(groom);
    }

    const allBreeds: BreedAvg[] = Array.from(groups.entries()).map(([key, grooms]) => {
      const [breed, size] = key.split('|');
      const avgMinutes = Math.round(grooms.reduce((a, g) => a + g.minutes, 0) / grooms.length);
      const avgPrice = Math.round(grooms.reduce((a, g) => a + g.price, 0) / grooms.length * 100) / 100;
      const avgHourlyReturn = Math.round(grooms.reduce((a, g) => a + g.hourlyReturn, 0) / grooms.length * 100) / 100;

      return {
        breed,
        size,
        grooms: grooms.length,
        avgMinutes,
        avgPrice,
        avgHourlyReturn
      };
    });

    // Time sinks: under $70/hr, sorted by hourly return ascending
    this.timeSinkBreeds = allBreeds
      .filter(b => b.avgHourlyReturn < 70)
      .sort((a, b) => a.avgHourlyReturn - b.avgHourlyReturn);

    // Money makers: over $90/hr, sorted by hourly return descending
    this.moneyMakerBreeds = allBreeds
      .filter(b => b.avgHourlyReturn >= 90)
      .sort((a, b) => b.avgHourlyReturn - a.avgHourlyReturn);
  }

  getSizeClass(size: string): string {
    const classes: Record<string, string> = {
      'small': 'badge-blue',
      'medium': 'badge-yellow',
      'large': 'badge-orange',
      'xl': 'badge-red'
    };
    return classes[size] || 'badge-blue';
  }

  getPackageClass(pkg: string): string {
    const classes: Record<string, string> = {
      'basic': 'badge-green',
      'premium': 'badge-blue',
      'deluxe': 'badge-purple'
    };
    return classes[pkg] || 'badge-green';
  }

  getHourlyReturnClass(rate: number): string {
    if (rate >= 100) return 'rate-excellent';
    if (rate >= 80) return 'rate-good';
    if (rate >= 60) return 'rate-ok';
    return 'rate-poor';
  }

  getRowClass(groom: PetGroom): string {
    if (groom.hourlyReturn >= 100) return 'row-good';
    if (groom.hourlyReturn < 50) return 'row-bad';
    return '';
  }

  getSizePackageRowClass(avg: SizePackageAvg): string {
    if (avg.avgHourlyReturn >= 120) return 'row-good';
    if (avg.avgHourlyReturn < 60) return 'row-bad';
    return '';
  }
}
