import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, BehaviorSubject, throwError } from 'rxjs';
import { map, catchError, tap } from 'rxjs/operators';
import { environment } from '../../../environments/environment';

export interface ServicePackage {
  id: string;
  name: string;
  description: string;
  duration: number;
  prices: {
    small: number;
    medium: number;
    large: number;
    xl: number;
  };
  includes: string[];
  icon: string;
  popular?: boolean;
  packageType: 'basic' | 'premium' | 'deluxe';
}

export interface PackagesResponse {
  success: boolean;
  data: ServicePackage[];
}

@Injectable({
  providedIn: 'root'
})
export class PackageService {
  private packagesCache$ = new BehaviorSubject<ServicePackage[] | null>(null);
  private readonly API_URL = environment.apiUrl;

  constructor(private http: HttpClient) {
    // Pre-load packages on service initialization
    this.loadPackages().subscribe();
  }

  /**
   * Get all service packages from the API
   * Uses cached data if available
   */
  getPackages(): Observable<ServicePackage[]> {
    const cached = this.packagesCache$.value;
    if (cached) {
      return this.packagesCache$.asObservable().pipe(
        map(packages => packages || [])
      );
    }
    return this.loadPackages();
  }

  /**
   * Force reload packages from API
   */
  loadPackages(): Observable<ServicePackage[]> {
    return this.http.get<PackagesResponse>(`${this.API_URL}/api/services/packages`)
      .pipe(
        map(response => response.data),
        tap(packages => this.packagesCache$.next(packages)),
        catchError(error => {
          console.error('Error loading packages:', error);
          return throwError(() => new Error('Failed to load service packages'));
        })
      );
  }

  /**
   * Get a specific package by ID
   */
  getPackageById(id: string): Observable<ServicePackage | undefined> {
    return this.getPackages().pipe(
      map(packages => packages.find(pkg => pkg.id === id))
    );
  }

  /**
   * Get a specific package by package type
   */
  getPackageByType(type: 'basic' | 'premium' | 'deluxe'): Observable<ServicePackage | undefined> {
    return this.getPackages().pipe(
      map(packages => packages.find(pkg => pkg.packageType === type))
    );
  }

  /**
   * Get package name by type (for display purposes)
   */
  getPackageNameByType(type: string): string {
    const nameMap: Record<string, string> = {
      'basic': 'Royal Bath',
      'premium': 'Royal Groom',
      'deluxe': 'Royal Spa'
    };
    return nameMap[type] || type;
  }

  /**
   * Get package price by type and size
   */
  getPackagePrice(type: 'basic' | 'premium' | 'deluxe', size: 'small' | 'medium' | 'large' | 'xl'): Observable<number> {
    return this.getPackageByType(type).pipe(
      map(pkg => pkg?.prices[size] || 0)
    );
  }

  /**
   * Clear the cache (useful for testing or forcing refresh)
   */
  clearCache(): void {
    this.packagesCache$.next(null);
  }
}
