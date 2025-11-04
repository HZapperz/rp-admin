import { Injectable } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { Observable, from, map, catchError, of } from 'rxjs';
import { Promotion, CreatePromotionDto, UpdatePromotionDto } from '../models/types';

@Injectable({
  providedIn: 'root'
})
export class PromotionService {
  constructor(private supabase: SupabaseService) {}

  // =======================
  // PROMOTIONS CRUD
  // =======================

  /**
   * Get all promotions (including inactive and expired)
   * Admin-only - requires ADMIN role
   */
  getAllPromotions(): Observable<Promotion[]> {
    return from(
      this.supabase.from('promotions')
        .select('*')
        .order('created_at', { ascending: false })
    ).pipe(
      map(response => response.data || []),
      catchError(error => {
        console.error('Error fetching all promotions:', error);
        return of([]);
      })
    );
  }

  /**
   * Get active promotions only
   * Can be called by public clients
   */
  getActivePromotions(): Observable<Promotion[]> {
    const now = new Date().toISOString();
    return from(
      this.supabase.from('promotions')
        .select('*')
        .eq('is_active', true)
        .lte('valid_from', now)
        .gte('valid_until', now)
        .order('discount_percentage', { ascending: false })
    ).pipe(
      map(response => response.data || []),
      catchError(error => {
        console.error('Error fetching active promotions:', error);
        return of([]);
      })
    );
  }

  /**
   * Get a single promotion by ID
   */
  getPromotionById(id: string): Observable<Promotion | null> {
    return from(
      this.supabase.from('promotions')
        .select('*')
        .eq('id', id)
        .single()
    ).pipe(
      map(response => response.data),
      catchError(error => {
        console.error('Error fetching promotion:', error);
        return of(null);
      })
    );
  }

  /**
   * Create a new promotion
   * Admin-only
   */
  createPromotion(promotion: CreatePromotionDto): Observable<Promotion | null> {
    return from(
      this.supabase.from('promotions')
        .insert({
          ...promotion,
          current_uses: 0
        })
        .select()
        .single()
    ).pipe(
      map(response => response.data),
      catchError(error => {
        console.error('Error creating promotion:', error);
        return of(null);
      })
    );
  }

  /**
   * Update an existing promotion
   * Admin-only
   */
  updatePromotion(id: string, updates: UpdatePromotionDto): Observable<boolean> {
    return from(
      this.supabase.from('promotions')
        .update(updates)
        .eq('id', id)
    ).pipe(
      map(response => !response.error),
      catchError(error => {
        console.error('Error updating promotion:', error);
        return of(false);
      })
    );
  }

  /**
   * Toggle promotion active status
   * Admin-only
   */
  togglePromotionStatus(id: string, isActive: boolean): Observable<boolean> {
    return from(
      this.supabase.from('promotions')
        .update({ is_active: isActive })
        .eq('id', id)
    ).pipe(
      map(response => !response.error),
      catchError(error => {
        console.error('Error toggling promotion status:', error);
        return of(false);
      })
    );
  }

  /**
   * Delete a promotion
   * Admin-only
   * Note: Will fail if promotion has been applied to bookings (RESTRICT constraint)
   */
  deletePromotion(id: string): Observable<boolean> {
    return from(
      this.supabase.from('promotions')
        .delete()
        .eq('id', id)
    ).pipe(
      map(response => !response.error),
      catchError(error => {
        console.error('Error deleting promotion:', error);
        return of(false);
      })
    );
  }

  // =======================
  // ANALYTICS & STATISTICS
  // =======================

  /**
   * Get promotion usage statistics
   */
  getPromotionStats(promotionId: string): Observable<{
    total_uses: number;
    total_discount_amount: number;
    unique_customers: number;
  } | null> {
    return from(
      this.supabase.from('booking_promotions')
        .select('discount_amount, booking_id')
        .eq('promotion_id', promotionId)
    ).pipe(
      map(response => {
        if (!response.data || response.data.length === 0) {
          return {
            total_uses: 0,
            total_discount_amount: 0,
            unique_customers: 0
          };
        }

        const total_uses = response.data.length;
        const total_discount_amount = response.data.reduce(
          (sum: number, item: any) => sum + parseFloat(item.discount_amount || 0),
          0
        );
        const unique_customers = new Set(response.data.map((item: any) => item.booking_id)).size;

        return {
          total_uses,
          total_discount_amount,
          unique_customers
        };
      }),
      catchError(error => {
        console.error('Error fetching promotion stats:', error);
        return of(null);
      })
    );
  }

  /**
   * Get all promotions with their usage stats
   */
  getPromotionsWithStats(): Observable<(Promotion & {
    stats?: {
      total_discount_amount: number;
      unique_customers: number;
    }
  })[]> {
    return from(
      this.supabase.from('promotions')
        .select(`
          *,
          booking_promotions (
            discount_amount,
            booking_id
          )
        `)
        .order('created_at', { ascending: false })
    ).pipe(
      map(response => {
        if (!response.data) return [];

        return response.data.map((promo: any) => {
          const bookingPromotions = promo.booking_promotions || [];
          const total_discount_amount = bookingPromotions.reduce(
            (sum: number, bp: any) => sum + parseFloat(bp.discount_amount || 0),
            0
          );
          const unique_customers = new Set(bookingPromotions.map((bp: any) => bp.booking_id)).size;

          // Remove the nested data and add computed stats
          const { booking_promotions, ...promotionData } = promo;

          return {
            ...promotionData,
            stats: {
              total_discount_amount,
              unique_customers
            }
          };
        });
      }),
      catchError(error => {
        console.error('Error fetching promotions with stats:', error);
        return of([]);
      })
    );
  }

  // =======================
  // VALIDATION HELPERS
  // =======================

  /**
   * Validate promotion data before create/update
   */
  validatePromotion(promotion: CreatePromotionDto | UpdatePromotionDto): {
    valid: boolean;
    error?: string;
  } {
    // Check title
    if ('title' in promotion && (!promotion.title || promotion.title.trim().length === 0)) {
      return { valid: false, error: 'Title is required' };
    }

    // Check discount percentage
    if ('discount_percentage' in promotion) {
      if (promotion.discount_percentage === undefined || promotion.discount_percentage === null) {
        return { valid: false, error: 'Discount percentage is required' };
      }
      if (promotion.discount_percentage <= 0 || promotion.discount_percentage > 100) {
        return { valid: false, error: 'Discount percentage must be between 1 and 100' };
      }
    }

    // Check date range
    if ('valid_from' in promotion && 'valid_until' in promotion) {
      if (promotion.valid_from && promotion.valid_until) {
        const fromDate = new Date(promotion.valid_from);
        const untilDate = new Date(promotion.valid_until);

        if (fromDate >= untilDate) {
          return { valid: false, error: 'Valid from date must be before valid until date' };
        }
      }
    }

    // Check max uses
    if ('max_uses' in promotion && promotion.max_uses !== undefined && promotion.max_uses !== null) {
      if (promotion.max_uses <= 0) {
        return { valid: false, error: 'Max uses must be greater than 0' };
      }
    }

    return { valid: true };
  }

  /**
   * Check if promotion is currently valid
   */
  isPromotionValid(promotion: Promotion): boolean {
    if (!promotion.is_active) return false;

    const now = new Date();
    const validFrom = new Date(promotion.valid_from);
    const validUntil = new Date(promotion.valid_until);

    if (now < validFrom || now > validUntil) return false;

    if (promotion.max_uses && promotion.current_uses >= promotion.max_uses) {
      return false;
    }

    return true;
  }

  /**
   * Get promotion status label
   */
  getPromotionStatus(promotion: Promotion): 'active' | 'inactive' | 'expired' | 'scheduled' | 'maxed_out' {
    if (!promotion.is_active) return 'inactive';

    const now = new Date();
    const validFrom = new Date(promotion.valid_from);
    const validUntil = new Date(promotion.valid_until);

    if (now > validUntil) return 'expired';
    if (now < validFrom) return 'scheduled';
    if (promotion.max_uses && promotion.current_uses >= promotion.max_uses) return 'maxed_out';

    return 'active';
  }

  // =======================
  // HELPER METHODS
  // =======================

  /**
   * Format date for display
   */
  formatDate(dateString: string): string {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  }

  /**
   * Format date range for display
   */
  formatDateRange(validFrom: string, validUntil: string): string {
    const from = this.formatDate(validFrom);
    const until = this.formatDate(validUntil);
    return `${from} - ${until}`;
  }

  /**
   * Calculate days remaining for a promotion
   */
  getDaysRemaining(validUntil: string): number {
    const now = new Date();
    const until = new Date(validUntil);
    const diffTime = until.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return Math.max(0, diffDays);
  }
}
