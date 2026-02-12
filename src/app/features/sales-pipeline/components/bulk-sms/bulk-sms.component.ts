import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PipelineLeadWithDetails, SMSTemplate } from '../../models/pipeline.types';
import { SalesPipelineService } from '../../services/sales-pipeline.service';
import { TemplatePickerComponent } from '../template-picker/template-picker.component';

@Component({
  selector: 'app-bulk-sms',
  standalone: true,
  imports: [CommonModule, FormsModule, TemplatePickerComponent],
  templateUrl: './bulk-sms.component.html',
  styleUrls: ['./bulk-sms.component.scss']
})
export class BulkSmsComponent {
  @Input() leads: PipelineLeadWithDetails[] = [];
  @Output() close = new EventEmitter<void>();
  @Output() sent = new EventEmitter<void>();

  customMessage = '';
  selectedTemplate: SMSTemplate | null = null;
  showTemplatePicker = false;

  isSending = false;
  error: string | null = null;
  results: { total: number; success: number; failed: number } | null = null;

  // Template hint text (to avoid Angular interpolation issues with curly braces)
  readonly variableHintText = 'Use {{first_name}} and {{pet_name}} for personalization';
  readonly placeholderText = 'Type your message... Variables like {{first_name}} will be replaced for each recipient.';

  constructor(private pipelineService: SalesPipelineService) {}

  get leadsWithPhone(): PipelineLeadWithDetails[] {
    return this.leads.filter(l => l.user.phone);
  }

  get leadsWithoutPhone(): PipelineLeadWithDetails[] {
    return this.leads.filter(l => !l.user.phone);
  }

  get canSend(): boolean {
    return this.leadsWithPhone.length > 0 &&
           !this.isSending &&
           (!!this.selectedTemplate || this.customMessage.trim().length > 0);
  }

  openTemplatePicker(): void {
    this.showTemplatePicker = true;
  }

  closeTemplatePicker(): void {
    this.showTemplatePicker = false;
  }

  onTemplateSelected(event: { template: SMSTemplate; interpolated: string }): void {
    this.selectedTemplate = event.template;
    this.customMessage = '';
    this.showTemplatePicker = false;
  }

  clearTemplate(): void {
    this.selectedTemplate = null;
  }

  useCustomMessage(): void {
    this.selectedTemplate = null;
  }

  async sendBulk(): Promise<void> {
    if (!this.canSend) return;

    this.isSending = true;
    this.error = null;
    this.results = null;

    try {
      const response = await this.pipelineService.sendBulkSMS({
        lead_ids: this.leadsWithPhone.map(l => l.id),
        template_id: this.selectedTemplate?.id,
        custom_message: this.selectedTemplate ? undefined : this.customMessage
      }).toPromise();

      const success = response.filter((r: any) => r.success).length;
      const failed = response.filter((r: any) => !r.success).length;

      this.results = {
        total: response.length,
        success,
        failed
      };

      if (failed === 0) {
        // Auto-close after success
        setTimeout(() => this.sent.emit(), 1500);
      }
    } catch (err: any) {
      console.error('Bulk SMS error:', err);
      this.error = err.message || 'Failed to send bulk messages';
    } finally {
      this.isSending = false;
    }
  }

  onClose(): void {
    this.close.emit();
  }

  formatPhone(phone: string | null): string {
    return this.pipelineService.formatPhone(phone);
  }
}
