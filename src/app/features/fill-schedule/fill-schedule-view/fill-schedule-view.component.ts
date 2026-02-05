import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import {
  FillScheduleService,
  FillScheduleData,
  LocationGroup,
  ClientRecommendation,
} from '../../../core/services/fill-schedule.service';

@Component({
  selector: 'app-fill-schedule-view',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './fill-schedule-view.component.html',
  styleUrls: ['./fill-schedule-view.component.scss'],
})
export class FillScheduleViewComponent implements OnInit {
  private fillScheduleService = inject(FillScheduleService);
  private router = inject(Router);

  isLoading = true;
  error: string | null = null;
  selectedDate: string = '';
  daysThreshold = 21;

  data: FillScheduleData | null = null;
  expandedLocations: Set<string> = new Set();
  copiedMessageId: string | null = null;

  ngOnInit(): void {
    // Default to today
    this.selectedDate = this.formatDateForInput(new Date());
    this.loadRecommendations();
  }

  private formatDateForInput(date: Date): string {
    return date.toISOString().split('T')[0];
  }

  async loadRecommendations(): Promise<void> {
    this.isLoading = true;
    this.error = null;

    try {
      this.data = await this.fillScheduleService.getRecommendations(
        this.selectedDate,
        this.daysThreshold
      );
      // Auto-expand first location if there are any
      if (this.data.locations.length > 0) {
        this.expandedLocations.add(this.data.locations[0].zip_code);
      }
    } catch (err) {
      console.error('Error loading recommendations:', err);
      this.error = 'Failed to load recommendations. Please try again.';
    } finally {
      this.isLoading = false;
    }
  }

  onDateChange(): void {
    this.expandedLocations.clear();
    this.loadRecommendations();
  }

  refresh(): void {
    this.loadRecommendations();
  }

  toggleLocation(zipCode: string): void {
    if (this.expandedLocations.has(zipCode)) {
      this.expandedLocations.delete(zipCode);
    } else {
      this.expandedLocations.add(zipCode);
    }
  }

  isLocationExpanded(zipCode: string): boolean {
    return this.expandedLocations.has(zipCode);
  }

  getLeadBadge(completedBookings: number): { label: string; class: string } {
    return this.fillScheduleService.getLeadBadge(completedBookings);
  }

  formatLastBooking(date: string | null, daysSince: number | null): string {
    if (!date) return 'Never booked';
    const formattedDate = new Date(date).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });
    if (daysSince !== null) {
      return `${formattedDate} (${daysSince}d ago)`;
    }
    return formattedDate;
  }

  getPetSummary(pets: { name: string; breed?: string }[]): string {
    return pets
      .map((p) => (p.breed ? `${p.name} (${p.breed})` : p.name))
      .join(', ');
  }

  callClient(client: ClientRecommendation, event: Event): void {
    event.stopPropagation();
    if (client.phone) {
      window.location.href = `tel:${client.phone}`;
    }
  }

  smsClient(client: ClientRecommendation, event: Event): void {
    event.stopPropagation();
    if (client.phone) {
      window.location.href = `sms:${client.phone}`;
    }
  }

  copyMessage(client: ClientRecommendation, event: Event): void {
    event.stopPropagation();
    const message = this.fillScheduleService.generateMessage(
      client,
      this.selectedDate
    );

    navigator.clipboard.writeText(message).then(() => {
      this.copiedMessageId = client.id;
      setTimeout(() => {
        this.copiedMessageId = null;
      }, 2000);
    });
  }

  isCopied(clientId: string): boolean {
    return this.copiedMessageId === clientId;
  }

  viewClient(clientId: string): void {
    this.router.navigate(['/clients', clientId]);
  }

  formatPhone(phone: string | null): string {
    if (!phone) return 'N/A';
    // Format as (XXX) XXX-XXXX if 10 digits
    const cleaned = phone.replace(/\D/g, '');
    if (cleaned.length === 10) {
      return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6)}`;
    }
    if (cleaned.length === 11 && cleaned[0] === '1') {
      return `(${cleaned.slice(1, 4)}) ${cleaned.slice(4, 7)}-${cleaned.slice(7)}`;
    }
    return phone;
  }
}
