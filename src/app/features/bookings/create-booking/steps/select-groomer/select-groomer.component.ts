import { Component, EventEmitter, OnInit, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { GroomerService } from '../../../../../core/services/groomer.service';

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
  imports: [CommonModule, FormsModule],
  templateUrl: './select-groomer.component.html',
  styleUrls: ['./select-groomer.component.scss']
})
export class SelectGroomerComponent implements OnInit {
  @Output() groomerSelected = new EventEmitter<Groomer>();

  groomers: Groomer[] = [];
  filteredGroomers: Groomer[] = [];
  searchTerm: string = '';
  selectedGroomer: Groomer | null = null;
  isLoading = false;
  error: string | null = null;

  constructor(private groomerService: GroomerService) {}

  ngOnInit(): void {
    this.loadGroomers();
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
