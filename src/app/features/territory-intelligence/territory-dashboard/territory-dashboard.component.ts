import {
  Component,
  OnInit,
  OnDestroy,
  inject,
  ElementRef,
  ViewChild,
  AfterViewInit
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import mapboxgl from 'mapbox-gl';
import { environment } from '../../../../environments/environment';
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
  imports: [CommonModule, FormsModule],
  templateUrl: './territory-dashboard.component.html',
  styleUrl: './territory-dashboard.component.scss'
})
export class TerritoryDashboardComponent implements OnInit, OnDestroy, AfterViewInit {
  private territoryService = inject(TerritoryService);
  @ViewChild('mapCanvas') mapCanvas!: ElementRef<HTMLDivElement>;
  map: mapboxgl.Map | null = null;
  private mapMarkers: mapboxgl.Marker[] = [];

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

  ngAfterViewInit(): void {
    this.initMap();
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
   * Initialize mapbox-gl map
   */
  private initMap(): void {
    if (!this.mapCanvas?.nativeElement) return;

    (mapboxgl as any).accessToken = environment.mapboxAccessToken;

    this.map = new mapboxgl.Map({
      container: this.mapCanvas.nativeElement,
      style: 'mapbox://styles/mapbox/light-v11',
      center: [-95.3698, 29.7604], // Houston, TX [lng, lat]
      zoom: 10
    });

    this.map.addControl(new mapboxgl.ScaleControl(), 'bottom-left');
    this.map.addControl(new mapboxgl.NavigationControl(), 'bottom-right');

    this.map.on('load', () => {
      this.renderCustomerMarkers();
    });
  }

  /**
   * Render customer markers on the map
   */
  private renderCustomerMarkers(): void {
    if (!this.map || this.viewMode === 'heatmap') return;

    this.clearMarkers();

    this.customers.forEach(customer => {
      const markerColor = this.getStatusColor(customer.status);
      const markerSize = this.getMarkerSize(customer.lifetime_value);

      const el = document.createElement('div');
      el.className = 'custom-marker';
      el.style.width = `${markerSize}px`;
      el.style.height = `${markerSize}px`;
      el.style.backgroundColor = markerColor;
      el.style.borderRadius = '50%';
      el.style.border = '2px solid white';
      el.style.boxShadow = '0 2px 8px rgba(0,0,0,0.3)';
      el.style.cursor = 'pointer';
      el.style.transition = 'opacity 0.2s ease, box-shadow 0.2s ease';

      el.addEventListener('mouseenter', () => {
        el.style.opacity = '0.8';
        el.style.boxShadow = '0 4px 12px rgba(0,0,0,0.5)';
      });
      el.addEventListener('mouseleave', () => {
        el.style.opacity = '1';
        el.style.boxShadow = '0 2px 8px rgba(0,0,0,0.3)';
      });
      el.addEventListener('click', () => {
        this.onCustomerClick(customer);
      });

      const marker = new mapboxgl.Marker({ element: el })
        .setLngLat([customer.longitude, customer.latitude])
        .addTo(this.map!);

      this.mapMarkers.push(marker);
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
    this.mapMarkers.forEach(marker => marker.remove());
    this.mapMarkers = [];
  }

  /**
   * Handle customer marker click
   */
  onCustomerClick(customer: TerritoryCustomer): void {
    this.selectedCustomer = customer;

    if (this.map) {
      this.map.flyTo({
        center: [customer.longitude, customer.latitude],
        zoom: 14,
        duration: 1000
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
      this.map.flyTo({
        center: [-95.3698, 29.7604],
        zoom: 10,
        duration: 1000
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
