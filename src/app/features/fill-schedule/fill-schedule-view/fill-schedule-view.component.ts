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
import {
  getStageConfig,
  PipelineStage,
  StageConfig,
} from '../../sales-pipeline/models/pipeline.types';

interface ClientActionState {
  sendingSMS: boolean;
  smsSent: boolean;
  smsError: boolean;
  addingToPipeline: boolean;
  pipelineAdded: boolean;
  pipelineAlready: boolean;
}

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

  readonly THRESHOLD_PRESETS = [7, 14, 21, 30, 60];

  data: FillScheduleData | null = null;
  expandedLocations: Set<string> = new Set();
  copiedMessageId: string | null = null;

  // Per-client action state map keyed by client.id
  private actionStates = new Map<string, ClientActionState>();

  ngOnInit(): void {
    this.selectedDate = this.formatDateForInput(new Date());
    this.loadRecommendations();
  }

  private formatDateForInput(date: Date): string {
    return date.toISOString().split('T')[0];
  }

  private getOrCreateActionState(clientId: string): ClientActionState {
    if (!this.actionStates.has(clientId)) {
      this.actionStates.set(clientId, {
        sendingSMS: false,
        smsSent: false,
        smsError: false,
        addingToPipeline: false,
        pipelineAdded: false,
        pipelineAlready: false,
      });
    }
    return this.actionStates.get(clientId)!;
  }

  getActionState(clientId: string): ClientActionState {
    return this.getOrCreateActionState(clientId);
  }

  async loadRecommendations(): Promise<void> {
    this.isLoading = true;
    this.error = null;
    this.actionStates.clear();

    try {
      this.data = await this.fillScheduleService.getRecommendations(
        this.selectedDate,
        this.daysThreshold
      );
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

  setThreshold(days: number): void {
    if (this.daysThreshold === days) return;
    this.daysThreshold = days;
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

  async sendSMS(client: ClientRecommendation, event: Event): Promise<void> {
    event.stopPropagation();

    if (!client.phone) return;

    const state = this.getOrCreateActionState(client.id);
    if (state.sendingSMS) return;

    state.sendingSMS = true;
    state.smsSent = false;
    state.smsError = false;

    try {
      const message = this.fillScheduleService.generateMessage(
        client,
        this.selectedDate
      );

      let leadId = client.pipeline_lead_id ?? undefined;

      // If no pipeline lead yet, add to pipeline first to get a lead ID
      if (!leadId) {
        const result = await this.fillScheduleService.addToPipeline(client.id);
        if (result.success) {
          leadId = result.leadId;
          // Reflect the new pipeline state locally so the badge renders
          client.pipeline_lead_id = leadId ?? null;
          if (!client.pipeline_stage) {
            client.pipeline_stage = 'NEW';
          }
        }
      }

      const success = await this.fillScheduleService.sendFillScheduleSMS(
        client.id,
        client.phone,
        message,
        leadId
      );

      state.smsSent = success;
      state.smsError = !success;

      if (success) {
        setTimeout(() => {
          state.smsSent = false;
        }, 3000);
      } else {
        setTimeout(() => {
          state.smsError = false;
        }, 3000);
      }
    } catch (err) {
      console.error('Error sending SMS:', err);
      state.smsError = true;
      setTimeout(() => {
        state.smsError = false;
      }, 3000);
    } finally {
      state.sendingSMS = false;
    }
  }

  async addToPipeline(client: ClientRecommendation, event: Event): Promise<void> {
    event.stopPropagation();

    const state = this.getOrCreateActionState(client.id);
    if (state.addingToPipeline) return;

    state.addingToPipeline = true;
    state.pipelineAdded = false;
    state.pipelineAlready = false;

    try {
      const result = await this.fillScheduleService.addToPipeline(client.id);

      if (result.existing) {
        state.pipelineAlready = true;
        setTimeout(() => {
          state.pipelineAlready = false;
        }, 3000);
      } else if (result.success) {
        state.pipelineAdded = true;
        // Reflect locally so the badge renders without a full reload
        client.pipeline_lead_id = result.leadId ?? null;
        if (!client.pipeline_stage) {
          client.pipeline_stage = 'NEW';
        }
        setTimeout(() => {
          state.pipelineAdded = false;
        }, 3000);
      }
    } catch (err) {
      console.error('Error adding to pipeline:', err);
    } finally {
      state.addingToPipeline = false;
    }
  }

  getPipelineStageConfig(stage: string | null | undefined): StageConfig | null {
    if (!stage) return null;
    return getStageConfig(stage as PipelineStage);
  }

  viewClient(clientId: string): void {
    this.router.navigate(['/clients', clientId]);
  }

  formatPhone(phone: string | null): string {
    if (!phone) return 'N/A';
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
