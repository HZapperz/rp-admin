import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

export interface BookingState {
  client?: any;
  pets?: any[];
  services?: any[];
  groomer?: any;
  dateTime?: any;
  address?: any;
  payment?: any;
  rushService?: boolean;
  sameDayService?: boolean;
  specialInstructions?: string;
  timestamp?: number;
}

@Injectable({
  providedIn: 'root'
})
export class BookingStateService {
  private readonly STORAGE_KEY = 'admin_booking_draft';
  private readonly EXPIRY_TIME = 24 * 60 * 60 * 1000; // 24 hours

  private stateSubject = new BehaviorSubject<BookingState>({});
  public state$ = this.stateSubject.asObservable();

  constructor() {
    this.loadState();
  }

  private loadState(): void {
    try {
      const saved = localStorage.getItem(this.STORAGE_KEY);
      if (saved) {
        const state: BookingState = JSON.parse(saved);
        // Check if not expired
        if (state.timestamp && (Date.now() - state.timestamp < this.EXPIRY_TIME)) {
          this.stateSubject.next(state);
        } else {
          this.clearState();
        }
      }
    } catch (error) {
      console.error('Error loading booking state:', error);
    }
  }

  updateState(partial: Partial<BookingState>): void {
    const current = this.stateSubject.value;
    const updated = {
      ...current,
      ...partial,
      timestamp: Date.now()
    };
    this.stateSubject.next(updated);
    this.saveState(updated);
  }

  private saveState(state: BookingState): void {
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(state));
    } catch (error) {
      console.error('Error saving booking state:', error);
    }
  }

  getState(): BookingState {
    return this.stateSubject.value;
  }

  clearState(): void {
    localStorage.removeItem(this.STORAGE_KEY);
    this.stateSubject.next({});
  }

  // Calculate total with rush/same-day fees
  calculateTotal(baseAmount: number): { subtotal: number; rushFee: number; sameDayFee: number; tax: number; total: number } {
    const state = this.getState();
    const subtotal = baseAmount;
    const rushFee = state.rushService ? 30 : 0;
    const sameDayFee = state.sameDayService ? Math.round(baseAmount * 0.25) : 0;
    const taxableAmount = subtotal + rushFee + sameDayFee;
    const tax = Math.round(taxableAmount * 0.0825 * 100) / 100; // 8.25% tax
    const total = taxableAmount + tax;

    return { subtotal, rushFee, sameDayFee, tax, total };
  }
}
