import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  PipelineLeadWithDetails,
  PipelineStage,
  getStageConfig,
  getCompletionCount,
  PIPELINE_STAGES
} from '../../models/pipeline.types';
import { SalesPipelineService } from '../../services/sales-pipeline.service';

@Component({
  selector: 'app-lead-card',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './lead-card.component.html',
  styleUrls: ['./lead-card.component.scss']
})
export class LeadCardComponent {
  @Input() lead!: PipelineLeadWithDetails;
  @Output() viewDetail = new EventEmitter<string>();
  @Output() sendSms = new EventEmitter<PipelineLeadWithDetails>();
  @Output() makeCall = new EventEmitter<PipelineLeadWithDetails>();
  @Output() moveToStage = new EventEmitter<{ lead: PipelineLeadWithDetails; stage: PipelineStage }>();

  showMoveMenu = false;
  isExpanded = false;

  stages = PIPELINE_STAGES.filter(s => !['CONVERTED', 'LOST'].includes(s.stage));

  constructor(private pipelineService: SalesPipelineService) {}

  get initials(): string {
    return `${this.lead.user.first_name.charAt(0)}${this.lead.user.last_name.charAt(0)}`.toUpperCase();
  }

  get fullName(): string {
    return `${this.lead.user.first_name} ${this.lead.user.last_name}`;
  }

  get petNames(): string {
    if (!this.lead.pets || this.lead.pets.length === 0) return 'No pets';
    return this.lead.pets.map(p => p.name).join(', ');
  }

  get completionCount(): number {
    return getCompletionCount(this.lead.completion_status);
  }

  get completionPercentage(): number {
    return (this.completionCount / 5) * 100;
  }

  get formattedPhone(): string {
    return this.pipelineService.formatPhone(this.lead.user.phone);
  }

  get hasUnreadMessages(): boolean {
    return (this.lead.conversation?.unread_count || 0) > 0;
  }

  get stageColor(): string {
    return getStageConfig(this.lead.pipeline_stage).color;
  }

  toggleExpand(event: Event): void {
    event.stopPropagation();
    this.isExpanded = !this.isExpanded;
  }

  onViewDetail(event: Event): void {
    event.stopPropagation();
    this.viewDetail.emit(this.lead.id);
  }

  onSendSms(event: Event): void {
    event.stopPropagation();
    this.sendSms.emit(this.lead);
  }

  onMakeCall(event: Event): void {
    event.stopPropagation();
    if (this.lead.user.phone) {
      window.location.href = `tel:${this.lead.user.phone}`;
      this.makeCall.emit(this.lead);
    }
  }

  toggleMoveMenu(event: Event): void {
    event.stopPropagation();
    this.showMoveMenu = !this.showMoveMenu;
  }

  onMoveToStage(stage: PipelineStage, event: Event): void {
    event.stopPropagation();
    this.showMoveMenu = false;
    if (stage !== this.lead.pipeline_stage) {
      this.moveToStage.emit({ lead: this.lead, stage });
    }
  }

  closeMoveMenu(): void {
    this.showMoveMenu = false;
  }

  getCompletionSteps(): Array<{ label: string; done: boolean }> {
    return [
      { label: 'Profile', done: this.lead.completion_status.profile_complete },
      { label: 'Pet', done: this.lead.completion_status.has_pet },
      { label: 'Address', done: this.lead.completion_status.has_address },
      { label: 'Payment', done: this.lead.completion_status.has_payment_method },
      { label: 'Booking', done: this.lead.completion_status.has_started_booking }
    ];
  }
}
