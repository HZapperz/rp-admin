import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PipelineLeadWithDetails, SMSTemplate } from '../../models/pipeline.types';
import { SalesPipelineService } from '../../services/sales-pipeline.service';
import { TemplatePickerComponent } from '../template-picker/template-picker.component';

@Component({
  selector: 'app-compose-sms',
  standalone: true,
  imports: [CommonModule, FormsModule, TemplatePickerComponent],
  templateUrl: './compose-sms.component.html',
  styleUrls: ['./compose-sms.component.scss']
})
export class ComposeSmsComponent {
  @Input() lead!: PipelineLeadWithDetails;
  @Output() close = new EventEmitter<void>();
  @Output() sent = new EventEmitter<void>();

  message = '';
  isSending = false;
  error: string | null = null;
  showTemplatePicker = false;
  selectedTemplate: SMSTemplate | null = null;

  readonly maxLength = 160;

  constructor(private pipelineService: SalesPipelineService) {}

  get characterCount(): number {
    return this.message.length;
  }

  get isOverLimit(): boolean {
    return this.message.length > this.maxLength;
  }

  get segmentCount(): number {
    return Math.ceil(this.message.length / this.maxLength);
  }

  get formattedPhone(): string {
    return this.pipelineService.formatPhone(this.lead.user.phone);
  }

  get canSend(): boolean {
    return this.message.trim().length > 0 && !this.isSending && !!this.lead.user.phone;
  }

  openTemplatePicker(): void {
    this.showTemplatePicker = true;
  }

  closeTemplatePicker(): void {
    this.showTemplatePicker = false;
  }

  onTemplateSelected(event: { template: SMSTemplate; interpolated: string }): void {
    this.selectedTemplate = event.template;
    this.message = event.interpolated;
    this.showTemplatePicker = false;
  }

  clearTemplate(): void {
    this.selectedTemplate = null;
    this.message = '';
  }

  async sendMessage(): Promise<void> {
    if (!this.canSend) return;

    this.isSending = true;
    this.error = null;

    try {
      await this.pipelineService.sendSMS(this.lead.id, this.message).toPromise();
      this.sent.emit();
    } catch (err: any) {
      console.error('Error sending SMS:', err);
      this.error = err.message || 'Failed to send message';
      this.isSending = false;
    }
  }

  onClose(): void {
    this.close.emit();
  }

  onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      this.sendMessage();
    }
  }
}
