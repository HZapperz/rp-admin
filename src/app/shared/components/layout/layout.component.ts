import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { AuthUser } from '../../../core/models/types';

interface NavItem {
  label: string;
  route: string;
  icon: string;
}

@Component({
  selector: 'app-layout',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './layout.component.html',
  styleUrl: './layout.component.scss'
})
export class LayoutComponent implements OnInit {
  currentUser: AuthUser | null = null;
  isSidebarOpen = true;

  navItems: NavItem[] = [
    { label: 'Dashboard', route: '/dashboard', icon: '📊' },
    { label: 'Bookings', route: '/bookings', icon: '📅' },
    { label: 'Clients', route: '/clients', icon: '👥' },
    { label: 'Groomers', route: '/groomers', icon: '✂️' },
    { label: 'Analytics', route: '/analytics', icon: '📈' },
    { label: 'Promotions', route: '/promotions', icon: '🎁' },
    { label: 'Complaints', route: '/complaints', icon: '📝' },
    { label: 'Service Areas', route: '/service-areas', icon: '🗺️' },
    { label: 'Profile', route: '/profile', icon: '⚙️' }
  ];

  constructor(private authService: AuthService) {}

  ngOnInit(): void {
    this.authService.currentUser$.subscribe(user => {
      this.currentUser = user;
    });
  }

  toggleSidebar(): void {
    this.isSidebarOpen = !this.isSidebarOpen;
  }

  async signOut(): Promise<void> {
    await this.authService.signOut();
  }
}
