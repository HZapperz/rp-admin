import { Component, OnInit, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SMSTemplate, PipelineLeadWithDetails } from '../../models/pipeline.types';
import { SalesPipelineService } from '../../services/sales-pipeline.service';

@Component({
  selector: 'app-template-picker',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './template-picker.component.html',
  styleUrls: ['./template-picker.component.scss']
})
export class TemplatePickerComponent implements OnInit {
  @Input() lead: PipelineLeadWithDetails | null = null;
  @Output() selectTemplate = new EventEmitter<{ template: SMSTemplate; interpolated: string }>();
  @Output() close = new EventEmitter<void>();

  templates: SMSTemplate[] = [];
  isLoading = true;
  selectedCategory: string = 'all';

  categories = [
    { id: 'all', label: 'All' },
    { id: 'welcome', label: 'Welcome' },
    { id: 'follow_up', label: 'Follow-up' },
    { id: 'reminder', label: 'Reminder' },
    { id: 'promo', label: 'Promo' }
  ];

  constructor(private pipelineService: SalesPipelineService) {}

  ngOnInit(): void {
    this.loadTemplates();
  }

  loadTemplates(): void {
    this.pipelineService.getTemplates().subscribe({
      next: (templates) => {
        this.templates = templates;
        this.isLoading = false;
      },
      error: () => {
        this.isLoading = false;
      }
    });
  }

  get filteredTemplates(): SMSTemplate[] {
    if (this.selectedCategory === 'all') {
      return this.templates;
    }
    return this.templates.filter(t => t.category === this.selectedCategory);
  }

  setCategory(category: string): void {
    this.selectedCategory = category;
  }

  getPreviewText(template: SMSTemplate): string {
    if (this.lead) {
      return this.pipelineService.interpolateTemplate(template, this.lead);
    }
    return template.content;
  }

  onSelect(template: SMSTemplate): void {
    const interpolated = this.lead
      ? this.pipelineService.interpolateTemplate(template, this.lead)
      : template.content;

    this.selectTemplate.emit({ template, interpolated });
  }

  onClose(): void {
    this.close.emit();
  }

  getCategoryIcon(category: string): string {
    const icons: Record<string, string> = {
      'welcome': 'waving_hand',
      'follow_up': 'reply',
      'reminder': 'schedule',
      'promo': 'local_offer',
      'custom': 'edit'
    };
    return icons[category] || 'message';
  }
}
