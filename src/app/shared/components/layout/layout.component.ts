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
  styleUrl: './layout.component.scss',
})
export class LayoutComponent implements OnInit {
  currentUser: AuthUser | null = null;
  isSidebarOpen = false; // Start closed on mobile, will be set based on screen size

  navItems: NavItem[] = [
    { label: 'Dashboard', route: '/dashboard', icon: 'dashboard' },
    { label: 'Bookings', route: '/bookings', icon: 'event' },
    { label: 'Clients', route: '/clients', icon: 'people' },
    { label: 'Groomers', route: '/groomers', icon: 'content_cut' },
    { label: 'Services', route: '/services', icon: 'spa' },
    { label: 'Analytics', route: '/analytics', icon: 'analytics' },
    { label: 'Promotions', route: '/promotions', icon: 'card_giftcard' },
    { label: 'Complaints', route: '/complaints', icon: 'feedback' },
    { label: 'Service Areas', route: '/service-areas', icon: 'map' },
    { label: 'Profile', route: '/profile', icon: 'settings' },
  ];

  constructor(private authService: AuthService) {}

  ngOnInit(): void {
    this.authService.currentUser$.subscribe((user) => {
      this.currentUser = user;
    });

    // Set initial sidebar state based on screen size
    this.updateSidebarState();

    // Listen for window resize to update sidebar state
    window.addEventListener('resize', () => this.updateSidebarState());
  }

  private updateSidebarState(): void {
    // On desktop (>= 769px), sidebar should be open by default
    // On mobile (< 769px), sidebar should be closed
    if (window.innerWidth >= 769) {
      this.isSidebarOpen = true;
    } else {
      this.isSidebarOpen = false;
    }
  }

  toggleSidebar(): void {
    // Only toggle on mobile
    if (window.innerWidth <= 768) {
      this.isSidebarOpen = !this.isSidebarOpen;
    }
  }

  closeSidebar(): void {
    // Only close on mobile
    if (window.innerWidth <= 768) {
      this.isSidebarOpen = false;
    }
  }

  onNavClick(): void {
    // Close sidebar on mobile when navigation item is clicked
    if (window.innerWidth <= 768) {
      this.closeSidebar();
    }
  }

  async signOut(): Promise<void> {
    await this.authService.signOut();
  }
}
