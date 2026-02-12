import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  CdkDragDrop,
  CdkDrag,
  CdkDropList,
  moveItemInArray,
  transferArrayItem
} from '@angular/cdk/drag-drop';
import {
  PipelineLeadWithDetails,
  PipelineStage,
  StageConfig
} from '../../models/pipeline.types';
import { LeadCardComponent } from '../lead-card/lead-card.component';

@Component({
  selector: 'app-stage-column',
  standalone: true,
  imports: [CommonModule, CdkDropList, CdkDrag, LeadCardComponent],
  templateUrl: './stage-column.component.html',
  styleUrls: ['./stage-column.component.scss']
})
export class StageColumnComponent {
  @Input() stage!: StageConfig;
  @Input() leads: PipelineLeadWithDetails[] = [];
  @Input() connectedDropLists: string[] = [];
  @Input() dropListId!: string;

  @Output() leadDropped = new EventEmitter<{
    lead: PipelineLeadWithDetails;
    fromStage: PipelineStage;
    toStage: PipelineStage;
    previousIndex: number;
    currentIndex: number;
  }>();
  @Output() viewLead = new EventEmitter<string>();
  @Output() sendSms = new EventEmitter<PipelineLeadWithDetails>();
  @Output() makeCall = new EventEmitter<PipelineLeadWithDetails>();
  @Output() moveToStage = new EventEmitter<{ lead: PipelineLeadWithDetails; stage: PipelineStage }>();

  get leadCount(): number {
    return this.leads.length;
  }

  onDrop(event: CdkDragDrop<PipelineLeadWithDetails[]>): void {
    if (event.previousContainer === event.container) {
      // Reorder within same column
      moveItemInArray(event.container.data, event.previousIndex, event.currentIndex);
    } else {
      // Move to different column
      const lead = event.previousContainer.data[event.previousIndex];
      const fromStage = this.extractStageFromId(event.previousContainer.id);

      transferArrayItem(
        event.previousContainer.data,
        event.container.data,
        event.previousIndex,
        event.currentIndex
      );

      this.leadDropped.emit({
        lead,
        fromStage,
        toStage: this.stage.stage,
        previousIndex: event.previousIndex,
        currentIndex: event.currentIndex
      });
    }
  }

  private extractStageFromId(dropListId: string): PipelineStage {
    // Drop list ID format: 'stage-NEW', 'stage-TEXTED', etc.
    return dropListId.replace('stage-', '') as PipelineStage;
  }

  onViewLead(leadId: string): void {
    this.viewLead.emit(leadId);
  }

  onSendSms(lead: PipelineLeadWithDetails): void {
    this.sendSms.emit(lead);
  }

  onMakeCall(lead: PipelineLeadWithDetails): void {
    this.makeCall.emit(lead);
  }

  onMoveToStage(event: { lead: PipelineLeadWithDetails; stage: PipelineStage }): void {
    this.moveToStage.emit(event);
  }
}
