import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ServiceAreaService } from '../../../core/services/service-area.service';
import { ServiceAreaZipCode } from '../../../core/models/types';
import { ZipCodeModalComponent } from '../../../shared/components/zip-code-modal/zip-code-modal.component';

/**
 * Service Areas Management Component
 *
 * FUTURE IMPLEMENTATION: Van Territory Management
 *
 * Pseudocode for Van-Territory Assignment Algorithm:
 *
 * 1. VAN MANAGEMENT:
 *    - Each van has unique ID, capacity, and operating status
 *    - Van model: { id, name, capacity, status: 'active'|'maintenance', currentLocation }
 *
 * 2. TERRITORY ASSIGNMENT:
 *    function assignTerritoryToVan(vanId, zipCodes[]):
 *      - Validate van exists and is active
 *      - Check zip codes are within service area
 *      - Calculate optimal route through assigned zip codes
 *      - Update van_territories table:
 *        INSERT INTO van_territories (van_id, zip_code, priority, created_at)
 *
 * 3. BOOKING ROUTING ALGORITHM:
 *    function routeBookingToVan(booking):
 *      - Get booking zip code
 *      - Find vans assigned to that territory:
 *        SELECT * FROM van_territories WHERE zip_code = booking.zip_code
 *      - For each eligible van:
 *        * Check current capacity for booking.scheduled_date
 *        * Calculate distance from last booking location
 *        * Score = (availableCapacity * 0.6) + (proximity * 0.4)
 *      - Assign booking to highest-scored van
 *
 * 4. LOAD BALANCING:
 *    - Monitor bookings per van per day
 *    - If van exceeds capacity threshold (e.g., 8 bookings/day):
 *      * Trigger overflow routing to adjacent van territories
 *      * Notify admin for manual review
 *
 * 5. DYNAMIC REBALANCING:
 *    - Weekly analytics on territory utilization
 *    - Suggest territory reassignments based on:
 *      * Booking density heatmaps
 *      * Van travel time optimization
 *      * Seasonal demand patterns
 *
 * Database Schema (Future):
 *   CREATE TABLE vans (
 *     id UUID PRIMARY KEY,
 *     name TEXT,
 *     license_plate TEXT,
 *     capacity INT DEFAULT 8,
 *     status TEXT CHECK (status IN ('active', 'maintenance', 'retired'))
 *   );
 *
 *   CREATE TABLE van_territories (
 *     id UUID PRIMARY KEY,
 *     van_id UUID REFERENCES vans(id),
 *     zip_code TEXT,
 *     priority INT DEFAULT 1,
 *     effective_from DATE,
 *     effective_to DATE
 *   );
 */

@Component({
  selector: 'app-service-areas-list',
  standalone: true,
  imports: [CommonModule, FormsModule, ZipCodeModalComponent],
  templateUrl: './service-areas-list.component.html',
  styleUrls: ['./service-areas-list.component.scss']
})
export class ServiceAreasListComponent implements OnInit {
  zipCodes: ServiceAreaZipCode[] = [];
  filteredZipCodes: ServiceAreaZipCode[] = [];
  isLoading = true;
  error: string | null = null;
  successMessage: string = '';
  searchTerm: string = '';

  // Modal state
  showModal = false;
  selectedZipCode: ServiceAreaZipCode | null = null;

  // Delete confirmation
  zipCodeToDelete: ServiceAreaZipCode | null = null;

  constructor(private serviceAreaService: ServiceAreaService) {}

  ngOnInit(): void {
    this.loadZipCodes();
  }

  async loadZipCodes(): Promise<void> {
    this.isLoading = true;
    this.error = null;

    try {
      this.serviceAreaService.getAllZipCodes().subscribe({
        next: (data) => {
          this.zipCodes = data;
          this.applyFilters();
          this.isLoading = false;
        },
        error: (err) => {
          this.error = 'Failed to load zip codes. Please try again.';
          console.error('Error loading zip codes:', err);
          this.isLoading = false;
        }
      });
    } catch (err) {
      this.error = 'Failed to load zip codes. Please try again.';
      console.error('Error loading zip codes:', err);
      this.isLoading = false;
    }
  }

  applyFilters(): void {
    if (!this.searchTerm.trim()) {
      this.filteredZipCodes = this.zipCodes;
      return;
    }

    const term = this.searchTerm.toLowerCase();
    this.filteredZipCodes = this.zipCodes.filter(
      (zipCode) =>
        zipCode.zip_code.toLowerCase().includes(term) ||
        zipCode.city.toLowerCase().includes(term) ||
        zipCode.state.toLowerCase().includes(term)
    );
  }

  onSearchChange(): void {
    this.applyFilters();
  }

  openAddModal(): void {
    this.selectedZipCode = null;
    this.showModal = true;
  }

  openEditModal(zipCode: ServiceAreaZipCode): void {
    this.selectedZipCode = zipCode;
    this.showModal = true;
  }

  closeModal(): void {
    this.showModal = false;
    this.selectedZipCode = null;
  }

  onZipCodeSaved(): void {
    this.loadZipCodes();
    this.showSuccessMessage(
      this.selectedZipCode ? 'Zip code updated successfully!' : 'Zip code added successfully!'
    );
  }

  async toggleStatus(zipCode: ServiceAreaZipCode): Promise<void> {
    try {
      await this.serviceAreaService
        .toggleZipCodeStatus(zipCode.id, !zipCode.is_active)
        .toPromise();

      this.showSuccessMessage(
        `Zip code ${zipCode.is_active ? 'deactivated' : 'activated'} successfully!`
      );
      this.loadZipCodes();
    } catch (err: any) {
      this.error = err.message || 'Failed to toggle zip code status';
      setTimeout(() => (this.error = null), 5000);
    }
  }

  confirmDelete(zipCode: ServiceAreaZipCode): void {
    this.zipCodeToDelete = zipCode;
  }

  cancelDelete(): void {
    this.zipCodeToDelete = null;
  }

  async deleteZipCode(): Promise<void> {
    if (!this.zipCodeToDelete) return;

    try {
      await this.serviceAreaService.deleteZipCode(this.zipCodeToDelete.id).toPromise();
      this.showSuccessMessage('Zip code deleted successfully!');
      this.zipCodeToDelete = null;
      this.loadZipCodes();
    } catch (err: any) {
      this.error = err.message || 'Failed to delete zip code';
      this.zipCodeToDelete = null;
      setTimeout(() => (this.error = null), 5000);
    }
  }

  private showSuccessMessage(message: string): void {
    this.successMessage = message;
    setTimeout(() => {
      this.successMessage = '';
    }, 3000);
  }

  // Future methods for van territory management:
  // assignZipCodeToVan(zipCode: string, vanId: string): Promise<void>
  // unassignZipCodeFromVan(zipCode: string): Promise<void>
  // getVanUtilization(vanId: string, dateRange: DateRange): Promise<UtilizationMetrics>
  // rebalanceTerritories(): Promise<RebalanceSuggestion[]>
}
