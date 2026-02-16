import {
  Component,
  OnInit,
  OnDestroy,
  inject
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import * as L from 'leaflet';
import { LeafletModule } from '@asymmetrik/ngx-leaflet';
import { TerritoryService } from '../../../core/services/territory.service';
import {
  TerritoryCustomer,
  ZipCodeMetrics,
  TerritoryMetrics,
  TerritoryFilters
} from '../../../core/models/types';

@Component({
  selector: 'app-territory-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule, LeafletModule],
  templateUrl: './territory-dashboard.component.html',
  styleUrl: './territory-dashboard.component.scss'
})
export class TerritoryDashboardComponent implements OnInit, OnDestroy {
  private territoryService = inject(TerritoryService);
  map: L.Map | null = null;
  mapOptions: L.MapOptions = {
    center: L.latLng(29.7604, -95.3698), // Houston, TX
    zoom: 10,
    layers: [
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '© OpenStreetMap contributors'
      })
    ]
  };
  private markers: L.Marker[] = [];
  private heatmapLayer: string | null = null;

  // State
  customers: TerritoryCustomer[] = [];
  zipMetrics: ZipCodeMetrics[] = [];
  territoryMetrics: TerritoryMetrics | null = null;
  selectedCustomer: TerritoryCustomer | null = null;
  loading = false;

  // Filter state
  filters: TerritoryFilters = {
    status: [],
    service_tiers: [],
    date_range: { start: '', end: '' },
    frequency: [],
    min_ltv: undefined,
    max_ltv: undefined
  };

  // UI state
  viewMode: 'markers' | 'heatmap' = 'markers';
  showFilters = true;

  // Status filter options
  statusOptions = [
    { value: 'active', label: 'Active', color: '#4caf50' },
    { value: 'warm_lead', label: 'Warm Lead', color: '#ff9800' },
    { value: 'at_risk', label: 'At Risk', color: '#f44336' },
    { value: 'vip', label: 'VIP', color: '#ffc107' }
  ];

  ngOnInit(): void {
    this.loadTerritoryData();
  }

  ngOnDestroy(): void {
    this.cleanupMap();
  }

  /**
   * Load all territory data from service
   */
  loadTerritoryData(): void {
    this.loading = true;

    // Load customers
    this.territoryService.getTerritoryCustomers(this.filters).subscribe({
      next: (customers) => {
        this.customers = customers;
        console.log('Loaded customers:', customers.length);
        this.renderCustomerMarkers();
      },
      error: (err) => {
        console.error('Error loading customers:', err);
        this.loading = false;
      }
    });

    // Load ZIP metrics
    this.territoryService.getZipCodeMetrics(this.filters).subscribe({
      next: (metrics) => {
        this.zipMetrics = metrics;
        console.log('Loaded ZIP metrics:', metrics.length);
      },
      error: (err) => {
        console.error('Error loading ZIP metrics:', err);
      }
    });

    // Load territory metrics
    this.territoryService.getTerritoryMetrics(this.filters).subscribe({
      next: (metrics) => {
        this.territoryMetrics = metrics;
        console.log('Loaded territory metrics:', metrics);
        this.loading = false;
      },
      error: (err) => {
        console.error('Error loading territory metrics:', err);
        this.loading = false;
      }
    });
  }

  /**
   * Callback when Leaflet map is ready
   */
  onMapReady(map: L.Map): void {
    this.map = map;

    // Add scale control
    L.control.scale({ position: 'bottomleft' }).addTo(map);

    // Render markers once map is ready
    this.renderCustomerMarkers();
  }

  /**
   * Render customer markers on the map
   */
  private renderCustomerMarkers(): void {
    if (!this.map || this.viewMode === 'heatmap') return;

    // Clear existing markers
    this.clearMarkers();

    // Create markers for each customer
    this.customers.forEach(customer => {
      const markerColor = this.getStatusColor(customer.status);
      const markerSize = this.getMarkerSize(customer.lifetime_value);

      // Create custom icon with divIcon
      const customIcon = L.divIcon({
        className: 'custom-marker',
        html: `<div class="marker-inner" style="
          width: ${markerSize}px;
          height: ${markerSize}px;
          background-color: ${markerColor};
          border-radius: 50%;
          border: 2px solid white;
          box-shadow: 0 2px 8px rgba(0,0,0,0.3);
          cursor: pointer;
        "></div>`,
        iconSize: [markerSize, markerSize],
        iconAnchor: [markerSize / 2, markerSize / 2] // Center anchor
      });

      // Create marker
      const marker = L.marker(
        [customer.latitude, customer.longitude],
        { icon: customIcon }
      );

      // Add hover effect (no transform, just opacity + shadow)
      marker.on('mouseover', () => {
        const markerEl = marker.getElement();
        if (markerEl) {
          const inner = markerEl.querySelector('.marker-inner') as HTMLElement;
          if (inner) {
            inner.style.opacity = '0.8';
            inner.style.boxShadow = '0 4px 12px rgba(0,0,0,0.5)';
          }
        }
      });

      marker.on('mouseout', () => {
        const markerEl = marker.getElement();
        if (markerEl) {
          const inner = markerEl.querySelector('.marker-inner') as HTMLElement;
          if (inner) {
            inner.style.opacity = '1';
            inner.style.boxShadow = '0 2px 8px rgba(0,0,0,0.3)';
          }
        }
      });

      // Add click handler
      marker.on('click', () => {
        this.onCustomerClick(customer);
      });

      // Add to map
      marker.addTo(this.map!);
      this.markers.push(marker);
    });
  }

  /**
   * Get marker color based on customer status
   */
  private getStatusColor(status: string): string {
    const statusMap: Record<string, string> = {
      'active': '#4caf50',
      'warm_lead': '#ff9800',
      'at_risk': '#f44336',
      'vip': '#ffc107'
    };
    return statusMap[status] || '#9e9e9e';
  }

  /**
   * Calculate marker size based on lifetime value
   */
  private getMarkerSize(ltv: number): number {
    if (ltv === 0) return 8;
    if (ltv < 200) return 10;
    if (ltv < 500) return 12;
    if (ltv < 1000) return 16;
    return 20;
  }

  /**
   * Clear all markers from the map
   */
  private clearMarkers(): void {
    this.markers.forEach(marker => marker.remove());
    this.markers = [];
  }

  /**
   * Handle customer marker click
   */
  onCustomerClick(customer: TerritoryCustomer): void {
    this.selectedCustomer = customer;

    // Fly to customer location
    if (this.map) {
      this.map.flyTo([customer.latitude, customer.longitude], 14, {
        duration: 1.0 // Duration in seconds
      });
    }
  }

  /**
   * Close customer detail popup
   */
  closeCustomerDetail(): void {
    this.selectedCustomer = null;
  }

  /**
   * Toggle filter panel visibility
   */
  toggleFilters(): void {
    this.showFilters = !this.showFilters;
  }

  /**
   * Handle status filter change
   */
  onStatusFilterChange(status: string, event: any): void {
    if (event.target.checked) {
      if (!this.filters.status) {
        this.filters.status = [];
      }
      this.filters.status.push(status as any);
    } else {
      this.filters.status = this.filters.status?.filter(s => s !== status);
    }
    this.loadTerritoryData();
  }

  /**
   * Check if status is selected
   */
  isStatusSelected(status: string): boolean {
    return this.filters.status?.includes(status as any) || false;
  }

  /**
   * Clear all filters
   */
  clearFilters(): void {
    this.filters = {
      status: [],
      service_tiers: [],
      date_range: { start: '', end: '' },
      frequency: [],
      min_ltv: undefined,
      max_ltv: undefined
    };
    this.loadTerritoryData();
  }

  /**
   * Reset map view to Houston center
   */
  resetMapView(): void {
    if (this.map) {
      this.map.flyTo([29.7604, -95.3698], 10, {
        duration: 1.0 // Duration in seconds
      });
    }
  }

  /**
   * Toggle view mode between markers and heatmap
   */
  toggleViewMode(): void {
    this.viewMode = this.viewMode === 'markers' ? 'heatmap' : 'markers';

    if (this.viewMode === 'markers') {
      this.renderCustomerMarkers();
      // Remove heatmap layer if exists
    } else {
      this.clearMarkers();
      // Add heatmap layer (future enhancement)
    }
  }

  /**
   * Format currency
   */
  formatCurrency(value: number): string {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(value);
  }

  /**
   * Format date
   */
  formatDate(dateString?: string): string {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  }

  /**
   * Get status label
   */
  getStatusLabel(status: string): string {
    const labels: Record<string, string> = {
      'active': 'Active',
      'warm_lead': 'Warm Lead',
      'at_risk': 'At Risk',
      'vip': 'VIP'
    };
    return labels[status] || status;
  }

  /**
   * Get status badge class
   */
  getStatusBadgeClass(status: string): string {
    return `status-badge status-${status}`;
  }

  /**
   * Cleanup map resources
   */
  private cleanupMap(): void {
    this.clearMarkers();
    if (this.map) {
      this.map.remove();
      this.map = null;
    }
  }
}
