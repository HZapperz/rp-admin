import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatCardModule } from '@angular/material/card';
import { PromotionService } from '../../../core/services/promotion.service';
import { Promotion, UpdatePromotionDto } from '../../../core/models/types';

@Component({
  selector: 'app-first-time-promotion-card',
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
    MatCardModule,
  ],
  templateUrl: './first-time-promotion-card.component.html',
  styleUrls: ['./first-time-promotion-card.component.scss']
})
export class FirstTimePromotionCardComponent {
  @Input() promotion!: Promotion;
  @Output() updated = new EventEmitter<void>();

  editMode = false;
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
    this.promotionForm = this.fb.group({
      discount_percentage: [
        this.promotion?.discount_percentage || 25,
        [Validators.required, Validators.min(1), Validators.max(100)]
      ],
      valid_until: [
        this.promotion ? new Date(this.promotion.valid_until) : new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        [Validators.required]
      ],
      is_active: [
        this.promotion?.is_active ?? true
      ]
    });
  }

  toggleEditMode() {
    this.editMode = !this.editMode;
    if (!this.editMode) {
      // Reset form when canceling
      this.initForm();
      this.errorMessage = null;
    }
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

      const updateData: UpdatePromotionDto = {
        discount_percentage: formValue.discount_percentage,
        valid_until: new Date(formValue.valid_until).toISOString(),
        is_active: formValue.is_active
      };

      this.promotionService.updatePromotion(this.promotion.id, updateData).subscribe({
        next: (success) => {
          if (success) {
            this.editMode = false;
            this.updated.emit();
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
    } catch (error) {
      console.error('Error submitting form:', error);
      this.errorMessage = 'An unexpected error occurred';
      this.isSubmitting = false;
    }
  }

  formatDate(dateString: string): string {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  }

  getErrorMessage(fieldName: string): string {
    const control = this.promotionForm.get(fieldName);
    if (!control || !control.touched || !control.errors) {
      return '';
    }

    if (control.errors['required']) {
      return `${fieldName} is required`;
    }
    if (control.errors['min']) {
      return `Must be at least ${control.errors['min'].min}`;
    }
    if (control.errors['max']) {
      return `Must be no more than ${control.errors['max'].max}`;
    }

    return 'Invalid value';
  }
}
