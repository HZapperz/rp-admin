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
import { Router } from '@angular/router';
import { forkJoin } from 'rxjs';
import mapboxgl from 'mapbox-gl';
import { environment } from '../../../../environments/environment';
import { TerritoryService } from '../../../core/services/territory.service';
import { BookingService } from '../../../core/services/booking.service';
import { GroomerService, GroomerWithStats } from '../../../core/services/groomer.service';
import { SupabaseService } from '../../../core/services/supabase.service';
import { FillScheduleService, ClientRecommendation, Pet } from '../../../core/services/fill-schedule.service';
import {
  TerritoryCustomer,
  ZipCodeMetrics,
  TerritoryMetrics,
  TerritoryFilters,
  BookingWithDetails,
  BookingFilters
} from '../../../core/models/types';

interface ClientActionState {
  smsSending?: boolean;
  smsSent?: boolean;
  pipelineAdding?: boolean;
  pipelineAdded?: boolean;
  pipelineExisting?: boolean;
  smsMessage?: string;
  showSmsInput?: boolean;
}

@Component({
  selector: 'app-territory-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './territory-dashboard.component.html',
  styleUrl: './territory-dashboard.component.scss'
})
export class TerritoryDashboardComponent implements OnInit, OnDestroy, AfterViewInit {
  private territoryService = inject(TerritoryService);
  private bookingService = inject(BookingService);
  private groomerService = inject(GroomerService);
  private supabase = inject(SupabaseService);
  private fillScheduleService = inject(FillScheduleService);
  private router = inject(Router);
  @ViewChild('mapCanvas') mapCanvas!: ElementRef<HTMLDivElement>;
  map: mapboxgl.Map | null = null;
  private mapMarkers: mapboxgl.Marker[] = [];
  private dayBookingMarkers: mapboxgl.Marker[] = [];
  private flyToSuppressed = false;

  // Tab state
  activeTab: 'territory' | 'bookings' | 'fill' = 'territory';

  // Territory state
  customers: TerritoryCustomer[] = [];
  zipMetrics: ZipCodeMetrics[] = [];
  territoryMetrics: TerritoryMetrics | null = null;
  selectedCustomer: TerritoryCustomer | null = null;
  loading = false;

  // Bookings by Day state
  selectedDate: string = this.getTodayString();
  dayBookings: BookingWithDetails[] = [];
  dayBookingsLoading = false;
  dayDataLoaded = false;
  unmappedBookingCount = 0;
  groomers: GroomerWithStats[] = [];
  groomersLoaded = false;
  selectedGroomerId = '';

  // Filter state
  filters: TerritoryFilters = {
    status: [],
    service_tiers: [],
    date_range: { start: '', end: '' },
    frequency: [],
    min_ltv: undefined,
    max_ltv: undefined
  };

  // Fill Schedule state
  fillClients: ClientRecommendation[] = [];
  fillLoading = false;
  fillDataLoaded = false;
  fillRadiusMiles = 5;
  fillDaysThreshold = 21;
  selectedFillClient: ClientRecommendation | null = null;
  private fillClientMarkers: mapboxgl.Marker[] = [];
  private fillActionStates = new Map<string, ClientActionState>();
  readonly FILL_THRESHOLD_PRESETS = [7, 14, 21, 30, 60];

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

  // =========================================================================
  // TAB MANAGEMENT
  // =========================================================================

  setTab(tab: 'territory' | 'bookings' | 'fill'): void {
    if (this.activeTab === tab) return;
    this.activeTab = tab;
    this.selectedCustomer = null;

    if (tab === 'bookings') {
      // Lazy-load groomers on first visit
      if (!this.groomersLoaded) {
        this.groomerService.getAllGroomers().subscribe({
          next: (groomers) => { this.groomers = groomers; this.groomersLoaded = true; },
          error: (err) => console.error('Error loading groomers:', err)
        });
      }
      this.clearMarkers();
      this.clearFillClientMarkers();
      if (this.dayDataLoaded) {
        this.renderDayBookingMarkers();
      } else {
        this.loadDayBookings();
      }
    } else if (tab === 'fill') {
      if (!this.groomersLoaded) {
        this.groomerService.getAllGroomers().subscribe({
          next: (groomers) => { this.groomers = groomers; this.groomersLoaded = true; },
          error: (err) => console.error('Error loading groomers:', err)
        });
      }
      this.clearMarkers();
      if (this.dayDataLoaded) {
        this.renderDayBookingMarkers();
        if (this.fillDataLoaded) {
          this.renderFillClientMarkers();
        } else {
          this.loadFillSchedule();
        }
      } else {
        // loadDayBookings will call loadFillSchedule when done (since activeTab === 'fill')
        this.loadDayBookings();
      }
    } else {
      // territory: clear day and fill markers, restore customer markers
      this.clearDayBookingMarkers();
      this.clearFillClientMarkers();
      this.renderCustomerMarkers();
    }

    // Resize map after grid reflow
    setTimeout(() => this.map?.resize(), 50);
  }

  // =========================================================================
  // TERRITORY DATA
  // =========================================================================

  loadTerritoryData(): void {
    this.loading = true;

    this.territoryService.getTerritoryCustomers(this.filters).subscribe({
      next: (customers) => {
        this.customers = customers;
        if (this.activeTab === 'territory') {
          this.renderCustomerMarkers();
        }
      },
      error: (err) => {
        console.error('Error loading customers:', err);
        this.loading = false;
      }
    });

    this.territoryService.getZipCodeMetrics(this.filters).subscribe({
      next: (metrics) => {
        this.zipMetrics = metrics;
      },
      error: (err) => console.error('Error loading ZIP metrics:', err)
    });

    this.territoryService.getTerritoryMetrics(this.filters).subscribe({
      next: (metrics) => {
        this.territoryMetrics = metrics;
        this.loading = false;
      },
      error: (err) => {
        console.error('Error loading territory metrics:', err);
        this.loading = false;
      }
    });
  }

  // =========================================================================
  // BOOKINGS BY DAY
  // =========================================================================

  loadDayBookings(): void {
    this.dayBookingsLoading = true;
    this.unmappedBookingCount = 0;
    // Suppress flyTo during load so mouseenter on newly rendered cards doesn't hijack the map
    this.flyToSuppressed = true;

    // Confirmed/in-progress/completed bookings for the selected day only
    const dayFilters: BookingFilters = {
      status: ['confirmed', 'in_progress', 'completed'],
      dateRange: {
        start: this.selectedDate,
        end: this.selectedDate
      }
    };
    if (this.selectedGroomerId) {
      dayFilters.groomerId = this.selectedGroomerId;
    }

    // All pending bookings regardless of date (admin needs to see full backlog to reschedule)
    const pendingFilters: BookingFilters = {
      status: ['pending']
    };

    forkJoin([
      this.bookingService.getAllBookings(dayFilters),
      this.bookingService.getAllBookings(pendingFilters)
    ]).subscribe({
      next: async ([dayBookings, allPending]) => {
        // Merge and deduplicate by id
        const seenIds = new Set<string>();
        const merged: BookingWithDetails[] = [];
        for (const b of [...dayBookings, ...allPending]) {
          if (!seenIds.has(b.id)) {
            seenIds.add(b.id);
            merged.push(b);
          }
        }

        // Sort: confirmed/in_progress first (by time), then pending at end
        this.dayBookings = merged.sort((a, b) => {
          const aPending = a.status === 'pending' ? 1 : 0;
          const bPending = b.status === 'pending' ? 1 : 0;
          if (aPending !== bPending) return aPending - bPending;
          const timeA = a.scheduled_time_start || '99:99';
          const timeB = b.scheduled_time_start || '99:99';
          return timeA.localeCompare(timeB);
        });

        // Enrich bookings with address coordinates
        await this.enrichBookingsWithCoordinates(this.dayBookings);

        this.dayDataLoaded = true;
        this.dayBookingsLoading = false;
        this.renderDayBookingMarkers();

        // If fill tab is active, auto-load fill schedule now that booking coords are ready
        if (this.activeTab === 'fill' && !this.fillDataLoaded) {
          this.loadFillSchedule();
        }

        // Allow flyTo again after fitBounds animation completes
        setTimeout(() => { this.flyToSuppressed = false; }, 1000);
      },
      error: (err) => {
        console.error('Error loading day bookings:', err);
        this.dayBookingsLoading = false;
        this.flyToSuppressed = false;
      }
    });
  }

  /**
   * Enrich bookings with lat/lng coordinates via two-step fallback:
   * 1. Look up from the addresses table
   * 2. Geocode via Mapbox API in parallel (full address, then zip-only fallback)
   */
  private async enrichBookingsWithCoordinates(bookings: BookingWithDetails[]): Promise<void> {
    const needsCoords = (b: BookingWithDetails) =>
      !b.latitude || !b.longitude || b.latitude === 0 || b.longitude === 0;

    // Step 1: addresses table lookup
    const clientIds = [...new Set(bookings.filter(needsCoords).map(b => b.client_id))];
    if (clientIds.length > 0) {
      const { data: addresses, error } = await this.supabase
        .from('addresses')
        .select('user_id, street, latitude, longitude')
        .in('user_id', clientIds)
        .not('latitude', 'is', null)
        .not('longitude', 'is', null);

      if (!error && addresses) {
        const coordsLookup: Record<string, { lat: number; lng: number }> = {};
        for (const addr of addresses) {
          if (!coordsLookup[addr.user_id]) {
            coordsLookup[addr.user_id] = {
              lat: parseFloat(addr.latitude),
              lng: parseFloat(addr.longitude)
            };
          }
        }
        for (const booking of bookings) {
          if (needsCoords(booking)) {
            const coords = coordsLookup[booking.client_id];
            if (coords) {
              booking.latitude = coords.lat;
              booking.longitude = coords.lng;
            }
          }
        }
      }
    }

    // Step 2: parallel Mapbox geocoding for bookings still missing coordinates
    const stillMissing = bookings.filter(needsCoords);
    const results = await Promise.all(stillMissing.map(async (booking) => {
      // Build the best query we can from available fields
      const parts = [booking.address?.trim(), booking.city?.trim(), booking.state || 'TX', booking.zip_code?.trim()]
        .filter(Boolean);
      if (parts.length === 0) return false;

      const tryGeocode = async (q: string): Promise<boolean> => {
        try {
          const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(q)}.json` +
                      `?access_token=${environment.mapboxAccessToken}&limit=1&country=us`;
          const res = await fetch(url);
          const data = await res.json();
          if (data.features?.length) {
            const [lng, lat] = data.features[0].center;
            booking.latitude = lat;
            booking.longitude = lng;
            return true;
          }
        } catch { /* fall through */ }
        return false;
      };

      // Try full address first, then zip-code-only as last resort
      const fullQuery = parts.join(', ');
      if (await tryGeocode(fullQuery)) return true;

      if (booking.zip_code?.trim()) {
        return tryGeocode(`${booking.zip_code.trim()}, TX, US`);
      }
      return false;
    }));

    this.unmappedBookingCount = results.filter(r => !r).length;
  }

  prevDay(): void {
    const d = new Date(this.selectedDate + 'T12:00:00');
    d.setDate(d.getDate() - 1);
    this.selectedDate = this.dateToString(d);
    this.dayDataLoaded = false;
    this.fillDataLoaded = false;
    this.loadDayBookings();
  }

  nextDay(): void {
    const d = new Date(this.selectedDate + 'T12:00:00');
    d.setDate(d.getDate() + 1);
    this.selectedDate = this.dateToString(d);
    this.dayDataLoaded = false;
    this.fillDataLoaded = false;
    this.loadDayBookings();
  }

  goToToday(): void {
    this.selectedDate = this.getTodayString();
    this.dayDataLoaded = false;
    this.fillDataLoaded = false;
    this.loadDayBookings();
  }

  onDateChange(): void {
    this.dayDataLoaded = false;
    this.fillDataLoaded = false;
    this.loadDayBookings();
  }

  onGroomerFilterChange(): void {
    this.dayDataLoaded = false;
    this.fillDataLoaded = false;
    this.loadDayBookings();
  }

  refreshBookings(): void {
    this.dayDataLoaded = false;
    this.fillDataLoaded = false;
    this.loadDayBookings();
  }

  // =========================================================================
  // MAP - INIT & CLEANUP
  // =========================================================================

  /** Called by the dashboard when this panel becomes visible after being hidden. */
  onShow(): void {
    this.map?.resize();
    if (this.activeTab === 'bookings' && this.dayBookings.length > 0) {
      this.renderDayBookingMarkers();
    } else if (this.activeTab === 'fill' && this.dayBookings.length > 0) {
      this.renderDayBookingMarkers();
      if (this.fillClients.length > 0) {
        this.renderFillClientMarkers();
      }
    } else if (this.activeTab === 'territory' && this.customers.length > 0) {
      this.renderCustomerMarkers();
    }
  }

  private initMap(): void {
    if (!this.mapCanvas?.nativeElement) return;

    (mapboxgl as any).accessToken = environment.mapboxAccessToken;

    this.map = new mapboxgl.Map({
      container: this.mapCanvas.nativeElement,
      style: 'mapbox://styles/mapbox/light-v11',
      center: [-95.3698, 29.7604],
      zoom: 10
    });

    this.map.addControl(new mapboxgl.ScaleControl(), 'bottom-left');
    this.map.addControl(new mapboxgl.NavigationControl(), 'bottom-right');

    this.map.on('load', () => {
      if (this.activeTab === 'territory') {
        this.renderCustomerMarkers();
      }
    });
  }

  private cleanupMap(): void {
    this.clearMarkers();
    this.clearDayBookingMarkers();
    this.clearFillClientMarkers();
    if (this.map) {
      this.map.remove();
      this.map = null;
    }
  }

  // =========================================================================
  // MAP - CUSTOMER MARKERS (TERRITORY TAB)
  // =========================================================================

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

  private clearMarkers(): void {
    this.mapMarkers.forEach(marker => marker.remove());
    this.mapMarkers = [];
  }

  private getStatusColor(status: string): string {
    const statusMap: Record<string, string> = {
      'active': '#4caf50',
      'warm_lead': '#ff9800',
      'at_risk': '#f44336',
      'vip': '#ffc107'
    };
    return statusMap[status] || '#9e9e9e';
  }

  private getMarkerSize(ltv: number): number {
    return 20;
  }

  // =========================================================================
  // MAP - DAY BOOKING MARKERS (BOOKINGS TAB)
  // =========================================================================

  private renderDayBookingMarkers(): void {
    if (!this.map) return;

    this.clearDayBookingMarkers();

    const bounds = new mapboxgl.LngLatBounds();
    let hasMarkers = false;
    let sequence = 0;

    this.dayBookings.forEach(booking => {
      if (!booking.latitude || !booking.longitude) return;

      const isPending = booking.status === 'pending';
      const isCompleted = booking.status === 'completed';
      if (!isPending) sequence++;
      const markerLabel = isPending ? '!' : String(sequence);
      const markerColor = isPending ? '#ff9800' : isCompleted ? '#4caf50' : '#2196f3';

      const el = document.createElement('div');
      el.className = 'booking-marker-numbered';
      el.style.width = '28px';
      el.style.height = '28px';
      el.style.backgroundColor = markerColor;
      el.style.borderRadius = '50%';
      el.style.border = '2px solid white';
      el.style.boxShadow = '0 2px 8px rgba(0,0,0,0.3)';
      el.style.cursor = 'pointer';
      el.style.display = 'flex';
      el.style.alignItems = 'center';
      el.style.justifyContent = 'center';
      el.style.color = 'white';
      el.style.fontSize = isPending ? '14px' : '12px';
      el.style.fontWeight = '700';
      el.style.lineHeight = '1';
      el.style.transition = 'opacity 0.2s ease, box-shadow 0.2s ease';
      el.textContent = markerLabel;

      el.addEventListener('mouseenter', () => {
        el.style.opacity = '0.8';
        el.style.boxShadow = '0 4px 12px rgba(0,0,0,0.5)';
      });
      el.addEventListener('mouseleave', () => {
        el.style.opacity = '1';
        el.style.boxShadow = '0 2px 8px rgba(0,0,0,0.3)';
      });
      el.addEventListener('click', () => {
        this.openBookingDetail(booking.id);
      });

      const marker = new mapboxgl.Marker({ element: el })
        .setLngLat([booking.longitude, booking.latitude])
        .addTo(this.map!);

      this.dayBookingMarkers.push(marker);
      bounds.extend([booking.longitude, booking.latitude]);
      hasMarkers = true;
    });

    if (hasMarkers) {
      this.map.fitBounds(bounds, { padding: 60, maxZoom: 14, duration: 800 });
    }
  }

  private clearDayBookingMarkers(): void {
    this.dayBookingMarkers.forEach(marker => marker.remove());
    this.dayBookingMarkers = [];
  }

  // =========================================================================
  // CUSTOMER INTERACTIONS (TERRITORY TAB)
  // =========================================================================

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

  closeCustomerDetail(): void {
    this.selectedCustomer = null;
  }

  // =========================================================================
  // TERRITORY FILTERS
  // =========================================================================

  toggleFilters(): void {
    this.showFilters = !this.showFilters;
  }

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

  isStatusSelected(status: string): boolean {
    return this.filters.status?.includes(status as any) || false;
  }

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

  // =========================================================================
  // MAP CONTROLS
  // =========================================================================

  resetMapView(): void {
    if (this.map) {
      this.map.flyTo({
        center: [-95.3698, 29.7604],
        zoom: 10,
        duration: 1000
      });
    }
  }

  toggleViewMode(): void {
    this.viewMode = this.viewMode === 'markers' ? 'heatmap' : 'markers';

    if (this.viewMode === 'markers') {
      this.renderCustomerMarkers();
    } else {
      this.clearMarkers();
    }
  }

  // =========================================================================
  // FILL SCHEDULE
  // =========================================================================

  async loadFillSchedule(): Promise<void> {
    this.fillLoading = true;
    this.fillClients = [];
    this.selectedFillClient = null;
    this.clearFillClientMarkers();

    const bookingCoords = this.dayBookings
      .filter(b => b.status !== 'pending' && b.latitude && b.longitude && b.latitude !== 0 && b.longitude !== 0)
      .map(b => ({ latitude: b.latitude!, longitude: b.longitude! }));

    try {
      this.fillClients = await this.fillScheduleService.getMapRecommendations(
        this.selectedDate,
        bookingCoords,
        this.fillRadiusMiles,
        this.fillDaysThreshold
      );
      this.fillDataLoaded = true;
      this.renderFillClientMarkers();
    } catch (err) {
      console.error('Error loading fill schedule:', err);
    } finally {
      this.fillLoading = false;
    }
  }

  private renderFillClientMarkers(): void {
    if (!this.map) return;
    this.clearFillClientMarkers();

    this.fillClients.forEach(client => {
      if (!client.latitude || !client.longitude) return;

      const initials = `${client.first_name?.[0] || ''}${client.last_name?.[0] || ''}`.toUpperCase();
      const isSelected = this.selectedFillClient?.id === client.id;

      const el = document.createElement('div');
      el.className = 'fill-client-marker';
      el.style.cssText = [
        'width:28px', 'height:28px', 'background-color:#9c27b0', 'border-radius:50%',
        'border:2px solid white', 'cursor:pointer', 'display:flex', 'align-items:center',
        'justify-content:center', 'color:white', 'font-size:10px', 'font-weight:700',
        'line-height:1', 'transition:opacity 0.2s ease,box-shadow 0.2s ease',
        `box-shadow:${isSelected ? '0 0 0 3px #9c27b0,0 2px 8px rgba(0,0,0,0.4)' : '0 2px 8px rgba(0,0,0,0.3)'}`,
        isSelected ? 'transform:scale(1.15)' : ''
      ].join(';');
      el.textContent = initials;

      el.addEventListener('mouseenter', () => {
        el.style.opacity = '0.85';
        el.style.boxShadow = '0 4px 14px rgba(156,39,176,0.6)';
      });
      el.addEventListener('mouseleave', () => {
        el.style.opacity = '1';
        el.style.boxShadow = isSelected ? '0 0 0 3px #9c27b0,0 2px 8px rgba(0,0,0,0.4)' : '0 2px 8px rgba(0,0,0,0.3)';
      });
      el.addEventListener('click', () => this.selectFillClient(client));

      const marker = new mapboxgl.Marker({ element: el })
        .setLngLat([client.longitude, client.latitude])
        .addTo(this.map!);

      this.fillClientMarkers.push(marker);
    });
  }

  private clearFillClientMarkers(): void {
    this.fillClientMarkers.forEach(m => m.remove());
    this.fillClientMarkers = [];
  }

  selectFillClient(client: ClientRecommendation): void {
    this.selectedFillClient = client;
    if (this.map && client.latitude && client.longitude) {
      this.map.flyTo({ center: [client.longitude, client.latitude], zoom: 14, duration: 800 });
    }
    this.renderFillClientMarkers();
  }

  onFillRadiusChange(): void {
    this.fillDataLoaded = false;
    if (this.activeTab === 'fill' && this.dayDataLoaded) {
      this.loadFillSchedule();
    }
  }

  onFillThresholdChange(days: number): void {
    this.fillDaysThreshold = days;
    this.fillDataLoaded = false;
    if (this.activeTab === 'fill' && this.dayDataLoaded) {
      this.loadFillSchedule();
    }
  }

  refreshFill(): void {
    this.fillDataLoaded = false;
    this.dayDataLoaded = false;
    this.loadDayBookings();
  }

  async sendFillSMS(client: ClientRecommendation, event: Event): Promise<void> {
    event.stopPropagation();
    const state = this.getFillActionState(client.id);
    if (!client.phone || state.smsSending || state.smsSent) return;

    if (!state.showSmsInput) {
      this.fillActionStates.set(client.id, {
        ...state,
        showSmsInput: true,
        smsMessage: state.smsMessage || this.fillScheduleService.generateMessage(client, this.selectedDate)
      });
      return;
    }

    const currentState = this.getFillActionState(client.id);
    const message = currentState.smsMessage || '';
    this.fillActionStates.set(client.id, { ...currentState, smsSending: true });

    const success = await this.fillScheduleService.sendFillScheduleSMS(
      client.id,
      client.phone,
      message,
      client.pipeline_lead_id || undefined
    );

    const afterState = this.getFillActionState(client.id);
    this.fillActionStates.set(client.id, { ...afterState, smsSending: false, smsSent: success, showSmsInput: false });
  }

  cancelFillSMS(client: ClientRecommendation, event: Event): void {
    event.stopPropagation();
    const state = this.getFillActionState(client.id);
    this.fillActionStates.set(client.id, { ...state, showSmsInput: false });
  }

  async addFillToPipeline(client: ClientRecommendation, event: Event): Promise<void> {
    event.stopPropagation();
    const state = this.getFillActionState(client.id);
    if (state.pipelineAdding || state.pipelineAdded) return;

    this.fillActionStates.set(client.id, { ...state, pipelineAdding: true });

    const result = await this.fillScheduleService.addToPipeline(client.id);

    const afterState = this.getFillActionState(client.id);
    this.fillActionStates.set(client.id, {
      ...afterState,
      pipelineAdding: false,
      pipelineAdded: result.success,
      pipelineExisting: result.existing
    });

    if (result.success && result.leadId) {
      client.pipeline_lead_id = result.leadId;
      client.pipeline_stage = client.pipeline_stage || 'NEW';
    }
  }

  getFillActionState(clientId: string): ClientActionState {
    if (!this.fillActionStates.has(clientId)) {
      this.fillActionStates.set(clientId, {});
    }
    return this.fillActionStates.get(clientId)!;
  }

  getFillLeadBadge(client: ClientRecommendation): { label: string; class: string } {
    return this.fillScheduleService.getLeadBadge(client.completed_bookings);
  }

  getDistanceLabel(miles: number | undefined): string {
    if (miles === undefined || miles === null) return '';
    if (miles < 0.1) return '< 0.1 mi';
    return `${miles.toFixed(1)} mi`;
  }

  getConfirmedStopsCount(): number {
    return this.dayBookings.filter(b => b.status !== 'pending').length;
  }

  getPetNames(pets: Pet[]): string {
    return pets.map(p => p.name).join(', ');
  }

  // =========================================================================
  // BOOKING HELPERS
  // =========================================================================

  flyToDayBooking(booking: BookingWithDetails): void {
    if (this.flyToSuppressed) return;
    if (this.map && booking.latitude && booking.longitude) {
      this.map.flyTo({
        center: [booking.longitude, booking.latitude],
        zoom: 14,
        duration: 1000
      });
    }
  }

  openBookingDetail(id: string): void {
    this.router.navigate(['/bookings/details', id]);
  }

  getDayBookingTimeDisplay(booking: BookingWithDetails): string {
    // Use scheduled_time_start/end as the source of truth
    if (booking.scheduled_time_start && booking.scheduled_time_start !== '00:00:00') {
      const start = this.formatTimeString(booking.scheduled_time_start);
      if (booking.scheduled_time_end && booking.scheduled_time_end !== '00:00:00') {
        const end = this.formatTimeString(booking.scheduled_time_end);
        return `${start} - ${end}`;
      }
      return start;
    }
    // Fallback to shift preference label
    if (booking.shift_preference) {
      const labels: Record<string, string> = {
        'morning': 'Morning',
        'afternoon': 'Afternoon',
        'evening': 'Evening'
      };
      return labels[booking.shift_preference] || booking.shift_preference;
    }
    return 'TBD';
  }

  private formatTimeString(time: string): string {
    const parts = time.split(':');
    if (parts.length < 2) return time;
    let hours = parseInt(parts[0], 10);
    const minutes = parts[1];
    const ampm = hours >= 12 ? 'PM' : 'AM';
    if (hours === 0) hours = 12;
    else if (hours > 12) hours -= 12;
    return `${hours}:${minutes} ${ampm}`;
  }

  getClientName(booking: BookingWithDetails): string {
    if (booking.client) {
      return `${booking.client.first_name} ${booking.client.last_name}`;
    }
    return 'Unknown Client';
  }

  getGroomerName(booking: BookingWithDetails): string {
    if (booking.groomer) {
      return `${booking.groomer.first_name} ${booking.groomer.last_name}`;
    }
    return 'Unassigned';
  }

  getConfirmedCount(): number {
    return this.dayBookings.filter(b => b.status !== 'pending').length;
  }

  getBookingSequenceLabel(index: number): string {
    // Pending bookings get "!", confirmed/in_progress get their sequence number
    const booking = this.dayBookings[index];
    if (booking.status === 'pending') return '!';
    // Count non-pending bookings up to and including this index
    let seq = 0;
    for (let i = 0; i <= index; i++) {
      if (this.dayBookings[i].status !== 'pending') seq++;
    }
    return String(seq);
  }

  getPetCount(booking: BookingWithDetails): number {
    return booking.pets?.length || 0;
  }

  getBookingStatusClass(status: string): string {
    return `booking-status-badge ${status.replace('_', '-')}`;
  }

  getBookingStatusLabel(status: string): string {
    const labels: Record<string, string> = {
      'pending': 'Pending',
      'confirmed': 'Confirmed',
      'in_progress': 'In Progress',
      'completed': 'Completed'
    };
    return labels[status] || status;
  }

  // =========================================================================
  // DATE HELPERS
  // =========================================================================

  getSelectedDateDisplay(): string {
    const d = new Date(this.selectedDate + 'T12:00:00');
    return d.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  }

  isToday(): boolean {
    return this.selectedDate === this.getTodayString();
  }

  private getTodayString(): string {
    return this.dateToString(new Date());
  }

  private dateToString(d: Date): string {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  // =========================================================================
  // FORMATTING HELPERS
  // =========================================================================

  formatCurrency(value: number): string {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(value);
  }

  formatDate(dateString?: string): string {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  }

  getStatusLabel(status: string): string {
    const labels: Record<string, string> = {
      'active': 'Active',
      'warm_lead': 'Warm Lead',
      'at_risk': 'At Risk',
      'vip': 'VIP'
    };
    return labels[status] || status;
  }

  getStatusBadgeClass(status: string): string {
    return `status-badge status-${status}`;
  }
}
