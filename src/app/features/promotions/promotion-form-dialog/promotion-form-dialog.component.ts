import { Component, Input, Output, EventEmitter, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { PromotionService } from '../../../core/services/promotion.service';
import { Promotion, CreatePromotionDto, UpdatePromotionDto } from '../../../core/models/types';

@Component({
  selector: 'app-promotion-form-dialog',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatDatepickerModule,
    MatNativeDateModule,
    MatSlideToggleModule,
  ],
  templateUrl: './promotion-form-dialog.component.html',
  styleUrls: ['./promotion-form-dialog.component.scss']
})
export class PromotionFormDialogComponent implements OnInit {
  @Input() promotion: Promotion | null = null;
  @Output() close = new EventEmitter<void>();
  @Output() save = new EventEmitter<void>();

  promotionForm!: FormGroup;
  isSubmitting = false;
  errorMessage: string | null = null;

  constructor(
    private fb: FormBuilder,
    private promotionService: PromotionService
  ) {}

  ngOnInit() {
    this.initForm();
  }

  initForm() {
    const now = new Date();
    const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    this.promotionForm = this.fb.group({
      title: [
        this.promotion?.title || '',
        [Validators.required, Validators.minLength(3), Validators.maxLength(100)]
      ],
      description: [
        this.promotion?.description || '',
        [Validators.maxLength(500)]
      ],
      discount_percentage: [
        this.promotion?.discount_percentage || 25,
        [Validators.required, Validators.min(1), Validators.max(100)]
      ],
      valid_from: [
        this.promotion ? new Date(this.promotion.valid_from) : now,
        [Validators.required]
      ],
      valid_until: [
        this.promotion ? new Date(this.promotion.valid_until) : thirtyDaysFromNow,
        [Validators.required]
      ],
      is_active: [
        this.promotion?.is_active ?? true
      ],
      max_uses: [
        this.promotion?.max_uses || null,
        [Validators.min(1)]
      ]
    }, {
      validators: this.dateRangeValidator
    });
  }

  dateRangeValidator(group: FormGroup) {
    const validFrom = group.get('valid_from')?.value;
    const validUntil = group.get('valid_until')?.value;

    if (validFrom && validUntil) {
      const from = new Date(validFrom);
      const until = new Date(validUntil);

      if (from >= until) {
        return { dateRangeInvalid: true };
      }
    }

    return null;
  }

  get isEditMode(): boolean {
    return !!this.promotion;
  }

  get dialogTitle(): string {
    return this.isEditMode ? 'Edit Promotion' : 'Create Promotion';
  }

  onCancel() {
    this.close.emit();
  }

  async onSubmit() {
    if (this.promotionForm.invalid) {
      Object.keys(this.promotionForm.controls).forEach(key => {
        this.promotionForm.get(key)?.markAsTouched();
      });
      return;
    }

    this.isSubmitting = true;
    this.errorMessage = null;

    try {
      const formValue = this.promotionForm.value;

      // Convert dates to ISO strings
      const promotionData = {
        ...formValue,
        valid_from: new Date(formValue.valid_from).toISOString(),
        valid_until: new Date(formValue.valid_until).toISOString(),
        max_uses: formValue.max_uses || null,
        promotion_type: 'general' as const, // All created promotions are general type
      };

      // Validate data
      const validation = this.promotionService.validatePromotion(promotionData);
      if (!validation.valid) {
        this.errorMessage = validation.error || 'Invalid promotion data';
        this.isSubmitting = false;
        return;
      }

      if (this.isEditMode && this.promotion) {
        // Update existing promotion
        const updateData: UpdatePromotionDto = promotionData;
        this.promotionService.updatePromotion(this.promotion.id, updateData).subscribe({
          next: (success) => {
            if (success) {
              this.save.emit();
            } else {
              this.errorMessage = 'Failed to update promotion';
            }
            this.isSubmitting = false;
          },
          error: (err) => {
            console.error('Error updating promotion:', err);
            this.errorMessage = 'Failed to update promotion';
            this.isSubmitting = false;
          }
        });
      } else {
        // Create new promotion
        const createData: CreatePromotionDto = promotionData;
        this.promotionService.createPromotion(createData).subscribe({
          next: (promotion) => {
            if (promotion) {
              this.save.emit();
            } else {
              this.errorMessage = 'Failed to create promotion';
            }
            this.isSubmitting = false;
          },
          error: (err) => {
            console.error('Error creating promotion:', err);
            this.errorMessage = 'Failed to create promotion';
            this.isSubmitting = false;
          }
        });
      }
    } catch (error) {
      console.error('Error submitting form:', error);
      this.errorMessage = 'An unexpected error occurred';
      this.isSubmitting = false;
    }
  }

  getErrorMessage(fieldName: string): string {
    const control = this.promotionForm.get(fieldName);
    if (!control || !control.touched || !control.errors) {
      return '';
    }

    if (control.errors['required']) {
      return `${this.getFieldLabel(fieldName)} is required`;
    }
    if (control.errors['minlength']) {
      return `${this.getFieldLabel(fieldName)} must be at least ${control.errors['minlength'].requiredLength} characters`;
    }
    if (control.errors['maxlength']) {
      return `${this.getFieldLabel(fieldName)} must be no more than ${control.errors['maxlength'].requiredLength} characters`;
    }
    if (control.errors['min']) {
      return `${this.getFieldLabel(fieldName)} must be at least ${control.errors['min'].min}`;
    }
    if (control.errors['max']) {
      return `${this.getFieldLabel(fieldName)} must be no more than ${control.errors['max'].max}`;
    }

    return 'Invalid value';
  }

  getFieldLabel(fieldName: string): string {
    const labels: Record<string, string> = {
      title: 'Title',
      description: 'Description',
      discount_percentage: 'Discount percentage',
      valid_from: 'Valid from date',
      valid_until: 'Valid until date',
      max_uses: 'Max uses'
    };
    return labels[fieldName] || fieldName;
  }
}
