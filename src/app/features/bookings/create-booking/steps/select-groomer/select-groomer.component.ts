import { Component, EventEmitter, OnInit, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { GroomerService } from '../../../../../core/services/groomer.service';
import { VanService } from '../../../../../core/services/van.service';
import { Van } from '../../../../../core/models/types';

export interface Groomer {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone?: string;
  bio?: string;
  avatar_url?: string;
  specialties?: string[];
  rating?: number;
  total_bookings?: number;
}

@Component({
  selector: 'app-select-groomer',
  standalone: true,
  imports: [CommonModule, FormsModule, MatIconModule],
  templateUrl: './select-groomer.component.html',
  styleUrls: ['./select-groomer.component.scss']
})
export class SelectGroomerComponent implements OnInit {
  @Output() groomerSelected = new EventEmitter<Groomer>();
  @Output() vanSelected = new EventEmitter<Van | null>();

  groomers: Groomer[] = [];
  filteredGroomers: Groomer[] = [];
  searchTerm: string = '';
  selectedGroomer: Groomer | null = null;
  isLoading = false;
  error: string | null = null;

  vans: Van[] = [];
  selectedVanId: string = '';

  constructor(
    private groomerService: GroomerService,
    private vanService: VanService
  ) {}

  ngOnInit(): void {
    this.loadGroomers();
    this.loadVans();
  }

  loadVans(): void {
    this.vanService.getVans(true).subscribe({
      next: (vans) => {
        this.vans = vans;
        // Default to the first active van so new bookings get a van by default.
        if (!this.selectedVanId && vans.length) {
          this.selectedVanId = vans[0].id;
          this.vanSelected.emit(vans[0]);
        }
      },
      error: (err) => console.error('Error loading vans:', err),
    });
  }

  onVanChange(vanId: string): void {
    this.selectedVanId = vanId;
    const van = this.vans.find((v) => v.id === vanId) || null;
    this.vanSelected.emit(van);
  }

  async loadGroomers(): Promise<void> {
    try {
      this.isLoading = true;
      this.error = null;

      this.groomerService.getAllGroomers().subscribe({
        next: (groomers) => {
          this.groomers = groomers;
          this.filteredGroomers = this.groomers;
          this.isLoading = false;
        },
        error: (err) => {
          console.error('Error loading groomers:', err);
          this.error = 'Failed to load groomers';
          this.isLoading = false;
        }
      });
    } catch (err) {
      console.error('Error loading groomers:', err);
      this.error = 'Failed to load groomers';
      this.isLoading = false;
    }
  }

  onSearchChange(event: Event): void {
    const target = event.target as HTMLInputElement;
    this.searchTerm = target.value;
    this.performSearch();
  }

  private performSearch(): void {
    if (!this.searchTerm.trim()) {
      this.filteredGroomers = this.groomers;
      return;
    }

    const term = this.searchTerm.toLowerCase();
    this.filteredGroomers = this.groomers.filter(groomer =>
      groomer.first_name.toLowerCase().includes(term) ||
      groomer.last_name.toLowerCase().includes(term) ||
      groomer.email.toLowerCase().includes(term) ||
      (groomer.specialties && groomer.specialties.some(s => s.toLowerCase().includes(term)))
    );
  }

  selectGroomer(groomer: Groomer): void {
    this.selectedGroomer = groomer;
    this.groomerSelected.emit(groomer);
  }

  getInitials(groomer: Groomer): string {
    return `${groomer.first_name.charAt(0)}${groomer.last_name.charAt(0)}`.toUpperCase();
  }

  getRatingStars(rating: number | undefined): string {
    if (!rating) return '☆☆☆☆☆';
    const fullStars = Math.floor(rating);
    const hasHalfStar = rating % 1 >= 0.5;
    let stars = '★'.repeat(fullStars);
    if (hasHalfStar && fullStars < 5) stars += '½';
    stars += '☆'.repeat(5 - Math.ceil(rating));
    return stars.slice(0, 5);
  }
}
