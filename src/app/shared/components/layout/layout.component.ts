import { Component, OnInit, inject, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { AuthUser } from '../../../core/models/types';
import { ChangeRequestService } from '../../../core/services/change-request.service';
import { SMSService } from '../../../core/services/sms.service';
import { Subscription } from 'rxjs';

interface NavItem {
  label: string;
  route: string;
  icon: string;
  badge?: number;
}

@Component({
  selector: 'app-layout',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './layout.component.html',
  styleUrl: './layout.component.scss',
})
export class LayoutComponent implements OnInit, OnDestroy {
  private changeRequestService = inject(ChangeRequestService);
  private smsService = inject(SMSService);
  private pendingCountSub?: Subscription;
  private smsStatsSub?: Subscription;

  currentUser: AuthUser | null = null;
  isSidebarOpen = false; // Start closed on mobile, will be set based on screen size
  pendingChangeRequests = 0;
  unreadSmsCount = 0;

  navItems: NavItem[] = [
    { label: 'Dashboard', route: '/dashboard', icon: 'dashboard' },
    { label: 'Bookings', route: '/bookings', icon: 'event' },
    { label: 'Rebookings', route: '/bookings/rebookings', icon: 'event_repeat' },
    { label: 'Change Requests', route: '/change-requests', icon: 'schedule' },
    { label: 'Clients', route: '/clients', icon: 'people' },
    { label: 'Sales Pipeline', route: '/sales-pipeline', icon: 'trending_up' },
    { label: 'Fill Schedule', route: '/fill-schedule', icon: 'calendar_month' },
    { label: 'Groomers', route: '/groomers', icon: 'content_cut' },
    { label: 'Services', route: '/services', icon: 'spa' },
    { label: 'Time Slots', route: '/time-slots', icon: 'schedule' },
    { label: 'Analytics', route: '/analytics', icon: 'analytics' },
    { label: 'Territory', route: '/territory', icon: 'map' },
    { label: 'Reports', route: '/reports', icon: 'assessment' },
    { label: 'Sessions', route: '/sessions', icon: 'videocam' },
    { label: 'Promotions', route: '/promotions', icon: 'card_giftcard' },
    { label: 'Complaints', route: '/complaints', icon: 'feedback' },
    { label: 'Service Areas', route: '/service-areas', icon: 'location_on' },
    { label: 'Email Campaign', route: '/email-campaign', icon: 'campaign' },
    { label: 'Settings', route: '/profile', icon: 'settings' },
  ];

  constructor(private authService: AuthService) {}

  ngOnInit(): void {
    this.authService.currentUser$.subscribe((user) => {
      this.currentUser = user;
    });

    // Subscribe to pending change requests count
    this.pendingCountSub = this.changeRequestService.pendingCount$.subscribe(count => {
      this.pendingChangeRequests = count;
    });

    // Load SMS stats for unread count
    this.loadSmsStats();

    // Set initial sidebar state based on screen size
    this.updateSidebarState();

    // Listen for window resize to update sidebar state
    window.addEventListener('resize', () => this.updateSidebarState());
  }

  ngOnDestroy(): void {
    this.pendingCountSub?.unsubscribe();
    this.smsStatsSub?.unsubscribe();
  }

  private loadSmsStats(): void {
    this.smsStatsSub = this.smsService.getStats().subscribe({
      next: (stats) => {
        this.unreadSmsCount = stats.unread_conversations + stats.escalated_conversations;
      },
      error: (err) => {
        console.error('Error loading SMS stats:', err);
      }
    });
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
