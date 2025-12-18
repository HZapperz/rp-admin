import { Component, Input, Output, EventEmitter, OnInit, AfterViewInit, OnDestroy, ElementRef, ViewChild, CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ClientService, Address, AddressFormData } from '../../../core/services/client.service';
import { environment } from '../../../../environments/environment';
import mapboxgl from 'mapbox-gl';

interface ServiceAreaVerification {
  serviceable: boolean;
  message: string;
  zip_code?: string;
  city?: string;
  state?: string;
}

@Component({
  selector: 'app-mapbox-address-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  templateUrl: './mapbox-address-modal.component.html',
  styleUrls: ['./mapbox-address-modal.component.scss']
})
export class MapboxAddressModalComponent implements OnInit, AfterViewInit, OnDestroy {
  @Input() clientId!: string;
  @Input() address?: Address;
  @Output() close = new EventEmitter<void>();
  @Output() addressSaved = new EventEmitter<void>();

  @ViewChild('mapContainer', { static: false }) mapContainer!: ElementRef<HTMLDivElement>;
  @ViewChild('streetInput', { static: false }) streetInput!: ElementRef<HTMLInputElement>;

  formData: AddressFormData = {
    name: '',
    building: '', // Kept for API compatibility
    street: '',
    city: '',
    state: 'TX',
    zip_code: '',
    address_type: 'home',
    is_default: false
  };

  // Map state
  private map: mapboxgl.Map | null = null;
  private marker: mapboxgl.Marker | null = null;
  viewport = {
    longitude: -95.3698,
    latitude: 29.7604,
    zoom: 11
  };
  markerPosition: { longitude: number; latitude: number } | null = {
    longitude: -95.3698,
    latitude: 29.7604
  };

  // Verification state
  isVerifying = false;
  verificationResult: ServiceAreaVerification | null = null;

  // Form state
  saving = false;
  error = '';
  mapboxToken = environment.mapboxAccessToken;

  get isEditMode(): boolean {
    return !!this.address;
  }

  constructor(private clientService: ClientService) {}

  ngOnInit(): void {
    if (this.address) {
      // Client app stores street address in 'building' field
      // Load from building for display in the street input
      this.formData = {
        name: this.address.name || '',
        building: '', // Will be set on save
        street: this.address.building || this.address.street || '', // Load from building (client format)
        city: this.address.city || '',
        state: this.address.state || 'TX',
        zip_code: this.address.zip_code || '',
        address_type: this.address.address_type || 'home',
        is_default: this.address.is_default || false
      };
    }
  }

  ngAfterViewInit(): void {
    setTimeout(() => {
      this.initializeMap();
      this.initializeAutofill();

      // If editing, geocode the existing address (street contains building data in edit mode)
      if (this.isEditMode && this.formData.street && this.formData.zip_code) {
        this.geocodeAndUpdateMap();
      }
    }, 100);
  }

  ngOnDestroy(): void {
    if (this.marker) {
      this.marker.remove();
      this.marker = null;
    }
    if (this.map) {
      this.map.remove();
      this.map = null;
    }
  }

  private initializeMap(): void {
    if (!this.mapContainer?.nativeElement || !this.mapboxToken) return;

    (mapboxgl as any).accessToken = this.mapboxToken;

    this.map = new mapboxgl.Map({
      container: this.mapContainer.nativeElement,
      style: 'mapbox://styles/mapbox/streets-v12',
      center: [this.viewport.longitude, this.viewport.latitude],
      zoom: this.viewport.zoom
    });

    this.map.addControl(new mapboxgl.NavigationControl(), 'top-right');

    // Initialize marker
    const markerEl = document.createElement('div');
    markerEl.className = 'custom-marker';
    markerEl.innerHTML = `
      <div style="width: 32px; height: 32px; background: #EF4444; border-radius: 50%; display: flex; align-items: center; justify-content: center; box-shadow: 0 2px 8px rgba(0,0,0,0.3); border: 2px solid white;">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2">
          <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
          <circle cx="12" cy="10" r="3"/>
        </svg>
      </div>
    `;

    this.marker = new mapboxgl.Marker({ element: markerEl })
      .setLngLat([this.viewport.longitude, this.viewport.latitude])
      .addTo(this.map);
  }

  private initializeAutofill(): void {
    if (!this.streetInput?.nativeElement || !this.mapboxToken) return;

    // Load the Mapbox Search JS Web library dynamically
    const script = document.createElement('script');
    script.src = 'https://api.mapbox.com/search-js/v1.0.0-beta.21/web.js';
    script.onload = () => {
      const mapboxsearch = (window as any).mapboxsearch;
      if (mapboxsearch && mapboxsearch.autofill) {
        const autofillCollection = mapboxsearch.autofill({
          accessToken: this.mapboxToken,
          options: {
            country: 'US',
            language: 'en'
          }
        });

        autofillCollection.addEventListener('retrieve', (event: any) => {
          const feature = event.detail.features[0];
          if (feature && feature.properties) {
            const props = feature.properties;

            // Update form fields
            this.formData.street = props.address_line1 || props.full_address || '';
            this.formData.city = props.place || props.locality || '';
            this.formData.state = props.region_code || props.region || 'TX';
            this.formData.zip_code = props.postcode || '';

            // Clear verification when address changes
            this.verificationResult = null;

            // Update map
            this.geocodeAndUpdateMap();
          }
        });
      }
    };
    document.head.appendChild(script);
  }

  async geocodeAndUpdateMap(): Promise<void> {
    if (!this.formData.street || !this.formData.city || !this.formData.zip_code) return;

    const coords = await this.geocodeAddress(
      this.formData.street,
      this.formData.city,
      this.formData.state || 'TX',
      this.formData.zip_code
    );

    if (coords && this.map && this.marker) {
      this.viewport = {
        longitude: coords.longitude,
        latitude: coords.latitude,
        zoom: 14
      };
      this.markerPosition = coords;

      this.map.flyTo({
        center: [coords.longitude, coords.latitude],
        zoom: 14,
        duration: 1000
      });

      this.marker.setLngLat([coords.longitude, coords.latitude]);
    }
  }

  private async geocodeAddress(
    address: string,
    city: string,
    state: string,
    zipCode: string
  ): Promise<{ longitude: number; latitude: number } | null> {
    if (!this.mapboxToken) return null;

    try {
      const query = encodeURIComponent(`${address}, ${city}, ${state} ${zipCode}`);
      const response = await fetch(
        `https://api.mapbox.com/geocoding/v5/mapbox.places/${query}.json?access_token=${this.mapboxToken}&country=US&limit=1`
      );
      const data = await response.json();

      if (data.features && data.features.length > 0) {
        const [longitude, latitude] = data.features[0].center;
        return { longitude, latitude };
      }
      return null;
    } catch (error) {
      console.error('Error geocoding address:', error);
      return null;
    }
  }

  async verifyServiceArea(): Promise<boolean> {
    if (!this.formData.zip_code) {
      this.error = 'Please enter a complete address with zip code';
      return false;
    }

    this.isVerifying = true;
    this.verificationResult = null;
    this.error = '';

    try {
      const response = await fetch(`${environment.apiUrl}/api/service-area/verify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ zip_code: this.formData.zip_code }),
      });

      const data: ServiceAreaVerification = await response.json();
      this.verificationResult = data;

      if (!data.serviceable) {
        this.error = data.message || 'Address is outside our service area';
        return false;
      }

      return true;
    } catch (error) {
      console.error('Error verifying service area:', error);
      this.error = 'Failed to verify address. Please try again.';
      return false;
    } finally {
      this.isVerifying = false;
    }
  }

  onAddressFieldChange(): void {
    this.verificationResult = null;
  }

  closeModal(): void {
    if (!this.saving) {
      this.close.emit();
    }
  }

  stopPropagation(event: Event): void {
    event.stopPropagation();
  }

  validateForm(): boolean {
    this.error = '';

    if (!this.formData.name?.trim()) {
      this.error = 'Address name is required (e.g., "Home", "Office")';
      return false;
    }

    if (!this.formData.street?.trim()) {
      this.error = 'Street address is required';
      return false;
    }

    if (!this.formData.city?.trim()) {
      this.error = 'City is required';
      return false;
    }

    if (!this.formData.state?.trim()) {
      this.error = 'State is required';
      return false;
    }

    if (!this.formData.zip_code?.trim()) {
      this.error = 'ZIP code is required';
      return false;
    }

    return true;
  }

  async saveAddress(): Promise<void> {
    if (!this.validateForm()) {
      return;
    }

    // Verify service area before saving
    const isServiceable = await this.verifyServiceArea();
    if (!isServiceable) {
      return;
    }

    this.saving = true;
    this.error = '';

    try {
      // Transform data to match client app format:
      // Client app stores street address in 'building' field, leaves 'street' empty
      const dataToSave: AddressFormData = {
        ...this.formData,
        building: this.formData.street, // Put street address in building field
        street: '', // Leave street empty
      };

      if (this.isEditMode && this.address) {
        await this.clientService.updateClientAddress(this.clientId, this.address.id, dataToSave);
      } else {
        await this.clientService.createClientAddress(this.clientId, dataToSave);
      }

      this.addressSaved.emit();
      this.close.emit();
    } catch (err: any) {
      this.error = err.message || 'Failed to save address';
    } finally {
      this.saving = false;
    }
  }
}
