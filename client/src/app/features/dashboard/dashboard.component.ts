import {
  Component,
  OnInit,
  OnDestroy,
  inject,
  signal,
  effect,
  ElementRef,
  ViewChild,
  AfterViewInit,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { gsap } from 'gsap';
import ApexCharts from 'apexcharts';
import { ThemeService } from '../../core/services/theme.service';
import {
  PlacementService,
  Student,
  GroupedStudent,
} from '../../core/services/placement.service';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.css'],
})
export class DashboardComponent implements OnInit, AfterViewInit, OnDestroy {
  private router = inject(Router);
  private themeService = inject(ThemeService);
  private placementService = inject(PlacementService);
  private authService = inject(AuthService);

  // Chart instances
  private trendChart: ApexCharts | null = null;
  private donutChart: ApexCharts | null = null;
  private barChart: ApexCharts | null = null;

  // Sidebar state
  sidebarCollapsed = signal(false);
  activeMenu = signal('dashboard');
  currentView = signal<'overview' | 'students' | 'pending' | 'reports'>(
    'overview'
  );

  // Search and filter
  searchQuery = signal('');
  statusFilter = signal('all');
  sortBy = signal('sno');
  sendingReminders = signal(false);

  // Real data from service
  get isLoading() {
    return this.placementService.isLoading;
  }
  get error() {
    return this.placementService.error;
  }
  get stats() {
    return this.placementService.stats;
  }
  get allStudents() {
    return this.placementService.groupedStudents;
  }
  // Raw placements for charts/stats
  get rawPlacements() {
    return this.placementService.placements;
  }
  get companies() {
    return this.placementService.companies;
  }
  get notifications() {
    return this.placementService.notifications;
  }
  get unreadCount() {
    return this.placementService.unreadNotifications;
  }

  // Export Modal State
  exportModalVisible = signal(false);
  exportType = signal<'excel' | 'word'>('excel');
  
  // Preview Modal State
  previewModalVisible = signal(false);
  previewFilter = signal<'verified' | 'all'>('all');
  previewData = signal<any[]>([]);

  // Modal States
  showCreateStudentModal = signal(false);
  showCompanyModal = signal(false);
  showActionMenu = signal<string | null>(null); // Student ID
  showNotifications = signal(false);
  showLogoutModal = signal(false);

  // Notification Sound System
  private audioContext: AudioContext | null = null;
  private lastNotificationCount = 0;

  // Forms
  newStudent = { id: '', name: '' };
  newCompany = { name: '', logo: null as File | null };
  isSubmitting = signal(false);

  // Filtered grouped students
  get filteredStudents() {
    let result = [...this.allStudents()];

    const query = this.searchQuery().toLowerCase();
    if (query) {
      result = result.filter(
        (s) =>
          s.name?.toLowerCase().includes(query) ||
          s.studentId?.toLowerCase().includes(query) ||
          s.companies.some((c) => c.toLowerCase().includes(query))
      );
    }

    if (this.statusFilter() !== 'all') {
      if (this.statusFilter() === 'pending') {
        result = result.filter((s) => s.hasPending);
      } else {
        // For verified/rejected, check if any placement matches
        result = result.filter((s) =>
          s.placements.some((p) => p.status === this.statusFilter())
        );
      }
    }

    const sort = this.sortBy();
    result.sort((a, b) => {
      if (sort === 'name') return (a.name || '').localeCompare(b.name || '');
      if (sort === 'package-high')
        return (b.maxPackage || 0) - (a.maxPackage || 0);
      if (sort === 'package-low')
        return (a.maxPackage || 0) - (b.maxPackage || 0);
      // Sort by first company
      if (sort === 'company')
        return (a.companies[0] || '').localeCompare(b.companies[0] || '');
      return 0; // SNo implicitly handled by order
    });

    return result;
  }

  get pendingStudents() {
    // Return individual pending placements
    return this.rawPlacements().filter(
      (s) => s.verificationStatus === 'pending'
    );
  }

  get isDarkMode(): boolean {
    return this.themeService.isDarkMode();
  }

  get topCompanies(): { name: string; count: number }[] {
    const companyMap = new Map<string, number>();
    this.rawPlacements().forEach((s) => {
      if (s.company) {
        const count = companyMap.get(s.company) || 0;
        companyMap.set(s.company, count + 1);
      }
    });
    return Array.from(companyMap.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 6);
  }

  constructor() {
    effect(() => {
      const count = this.unreadCount();
      // Safeguard against initial load triggering sound
      if (this.lastNotificationCount !== -1 && count > this.lastNotificationCount) {
        this.playNotificationSound();
      }
      this.lastNotificationCount = count;
    });
    // Initialize with current count to avoid first run sound
    this.lastNotificationCount = this.unreadCount(); 
  }

  // Notification Sound
  playNotificationSound() {
    try {
      if (!this.audioContext) {
        this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      
      const oscillator = this.audioContext.createOscillator();
      const gainNode = this.audioContext.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(this.audioContext.destination);
      
      // High pitch pleasant "ding"
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(880, this.audioContext.currentTime); // A5
      oscillator.frequency.exponentialRampToValueAtTime(1760, this.audioContext.currentTime + 0.1); // A6
      
      gainNode.gain.setValueAtTime(0.3, this.audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.5);
      
      oscillator.start();
      oscillator.stop(this.audioContext.currentTime + 0.5);
    } catch (e) {
      console.error('Audio playback failed', e);
    }
  }

  confirmLogout() {
    this.showLogoutModal.set(true);
  }



  ngOnInit(): void {
    this.loadData();
    this.placementService.fetchCompanies().subscribe();
    this.placementService.fetchNotifications();
    // Poll notifications every 30s
    setInterval(() => this.placementService.fetchNotifications(), 30000);
  }

  ngAfterViewInit(): void {
    // Initialize AudioContext on first user interaction (required by browsers)
    const initAudio = () => {
      if (!this.audioContext) {
        this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      if (this.audioContext.state === 'suspended') {
        this.audioContext.resume();
      }
      document.removeEventListener('click', initAudio);
    };
    document.addEventListener('click', initAudio);

    // Close menus on click outside
    document.addEventListener('click', () => {
      this.showActionMenu.set(null);
      this.showNotifications.set(false);
    });
  }

  ngOnDestroy(): void {
    this.destroyCharts();
  }

  toggleActionMenu(studentId: string, event: Event): void {
    event.stopPropagation();
    if (this.showActionMenu() === studentId) {
      this.showActionMenu.set(null);
    } else {
      this.showActionMenu.set(studentId);
    }
  }

  // ==================== ACTIONS ====================

  verifyStudent(
    type: 'placement' | 'original',
    id: string,
    action: 'approve' | 'reject'
  ): void {
    this.placementService.verifyPlacement(type, id, action).subscribe({
      next: () => {
        this.loadData();
        // Show simplified feedback
      },
    });
  }

  deleteStudent(id: string): void {
    if (
      !confirm(
        'Are you sure you want to delete this student and all their data? This cannot be undone.'
      )
    )
      return;

    this.placementService.deleteStudent(id).subscribe({
      next: () => {
        this.loadData();
        this.showActionMenu.set(null);
      },
    });
  }

  // ==================== CREATE STUDENT ====================

  createStudent(): void {
    if (!this.newStudent.id || !this.newStudent.name) return;

    this.isSubmitting.set(true);
    this.placementService.createStudent(this.newStudent).subscribe({
      next: () => {
        this.isSubmitting.set(false);
        this.showCreateStudentModal.set(false);
        this.newStudent = { id: '', name: '' };
        this.loadData();
      },
      error: () => this.isSubmitting.set(false),
    });
  }

  // ==================== COMPANY MANAGEMENT ====================

  onLogoSelected(event: any): void {
    if (event.target.files.length > 0) {
      this.newCompany.logo = event.target.files[0];
    }
  }

  addCompany(): void {
    if (!this.newCompany.name) return;

    this.isSubmitting.set(true);
    this.placementService
      .addCompany(this.newCompany.name, this.newCompany.logo!)
      .subscribe({
        next: () => {
          this.isSubmitting.set(false);
          this.showCompanyModal.set(false);
          this.newCompany = { name: '', logo: null };
          this.placementService.fetchCompanies().subscribe();
        },
        error: () => this.isSubmitting.set(false),
      });
  }

  deleteCompany(id: string): void {
    if (!confirm('Delete this company?')) return;

    this.placementService.deleteCompany(id).subscribe({
      next: () => this.placementService.fetchCompanies().subscribe(),
    });
  }

  // ==================== NOTIFICATIONS ====================

  toggleNotifications(event: Event): void {
    event.stopPropagation();
    this.showNotifications.update((v) => !v);
  }

  markAsRead(id?: string): void {
    this.placementService.markAsRead(id).subscribe();
  }
  private destroyCharts(): void {
    if (this.trendChart) {
      this.trendChart.destroy();
    }
    if (this.donutChart) {
      this.donutChart.destroy();
    }
    if (this.barChart) {
      this.barChart.destroy();
    }
  }

  private loadData(): void {
    this.placementService.fetchPlacements().subscribe({
      next: () => {
        setTimeout(() => {
          this.initCharts();
          this.animateEntrance();
        }, 100);
      },
      error: (err) => console.error('Failed to load placements:', err),
    });
  }

  private initCharts(): void {
    this.destroyCharts();

    // Trend Chart
    const trendEl = document.querySelector('#trendChart');
    if (trendEl) {
      this.trendChart = new ApexCharts(trendEl, {
        series: [
          {
            name: 'Placements',
            data: [12, 19, 25, 31, 42, 55, 68, 82, 96, 110, 125, 131],
          },
        ],
        chart: {
          type: 'area',
          height: 280,
          toolbar: { show: false },
          fontFamily: 'Inter, sans-serif',
        },
        stroke: { curve: 'smooth', width: 3 },
        colors: ['#ef4444'],
        fill: {
          type: 'gradient',
          gradient: {
            shadeIntensity: 1,
            opacityFrom: 0.4,
            opacityTo: 0.1,
            stops: [0, 90, 100],
          },
        },
        xaxis: {
          categories: [
            'Jan',
            'Feb',
            'Mar',
            'Apr',
            'May',
            'Jun',
            'Jul',
            'Aug',
            'Sep',
            'Oct',
            'Nov',
            'Dec',
          ],
          labels: { style: { colors: '#94a3b8' } },
        },
        yaxis: { labels: { style: { colors: '#94a3b8' } } },
        dataLabels: { enabled: false },
        tooltip: { theme: 'dark' },
      });
      this.trendChart.render();
    }

    // Donut Chart
    const donutEl = document.querySelector('#donutChart');
    if (donutEl) {
      const companies = this.topCompanies;
      this.donutChart = new ApexCharts(donutEl, {
        series:
          companies.length > 0
            ? companies.map((c) => c.count)
            : [28, 22, 18, 15, 10, 7],
        chart: { type: 'donut', height: 300, fontFamily: 'Inter, sans-serif' },
        labels:
          companies.length > 0
            ? companies.map((c) => c.name)
            : ['TCS', 'Infosys', 'Wipro', 'Capgemini', 'Cognizant', 'Others'],
        colors: [
          '#ef4444',
          '#f97316',
          '#eab308',
          '#22c55e',
          '#3b82f6',
          '#8b5cf6',
        ],
        legend: { position: 'bottom', labels: { colors: '#94a3b8' } },
        dataLabels: { enabled: true },
        plotOptions: { pie: { donut: { size: '65%' } } },
      });
      this.donutChart.render();
    }

    // Bar Chart
    const barEl = document.querySelector('#barChart');
    if (barEl) {
      this.barChart = new ApexCharts(barEl, {
        series: [{ name: 'Students', data: [15, 35, 42, 28, 11] }],
        chart: {
          type: 'bar',
          height: 280,
          toolbar: { show: false },
          fontFamily: 'Inter, sans-serif',
        },
        colors: ['#3b82f6'],
        xaxis: {
          categories: ['< 3 LPA', '3-4 LPA', '4-5 LPA', '5-7 LPA', '> 7 LPA'],
          labels: { style: { colors: '#94a3b8' } },
        },
        yaxis: { labels: { style: { colors: '#94a3b8' } } },
        dataLabels: { enabled: false },
        tooltip: { theme: 'dark' },
      });
      this.barChart.render();
    }
  }

  private animateEntrance(): void {
    if (document.querySelector('.stat-card')) {
      gsap.fromTo(
        '.stat-card',
        { opacity: 0, y: 30, scale: 0.95 },
        {
          opacity: 1,
          y: 0,
          scale: 1,
          duration: 0.6,
          stagger: 0.1,
          ease: 'power3.out',
        }
      );
    }

    if (document.querySelector('.chart-card')) {
      gsap.fromTo(
        '.chart-card',
        { opacity: 0, y: 40 },
        {
          opacity: 1,
          y: 0,
          duration: 0.7,
          stagger: 0.15,
          delay: 0.3,
          ease: 'power2.out',
        }
      );
    }

    if (document.querySelector('.data-table')) {
      gsap.fromTo(
        '.data-table',
        { opacity: 0, y: 50 },
        { opacity: 1, y: 0, duration: 0.8, delay: 0.6, ease: 'power2.out' }
      );
    }

    if (document.querySelector('.sidebar-item')) {
      gsap.fromTo(
        '.sidebar-item',
        { opacity: 0, x: -20 },
        {
          opacity: 1,
          x: 0,
          duration: 0.4,
          stagger: 0.08,
          delay: 0.2,
          ease: 'power2.out',
        }
      );
    }
  }

  toggleSidebar(): void {
    this.sidebarCollapsed.update((v) => !v);
  }

  toggleDarkMode(): void {
    this.themeService.toggleTheme();
  }

  setActiveMenu(menu: 'overview' | 'students' | 'pending' | 'reports'): void {
    this.activeMenu.set(menu);
    this.currentView.set(menu);

    if (menu === 'overview') {
      setTimeout(() => this.initCharts(), 100);
    }
  }

  logout(): void {
    this.authService.logout(); // Clear session/token
    gsap.to('.dashboard-container', {
      opacity: 0,
      scale: 0.98,
      duration: 0.3,
      onComplete: () => {
        this.router.navigate(['/login']);
      },
    });
  }

  refreshData(): void {
    this.loadData();
  }

  getStatusClass(status: string): string {
    switch (status) {
      case 'verified':
        return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400';
      case 'pending':
        return 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400';
      case 'rejected':
        return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400';
      default:
        return '';
    }
  }

  getPackageClass(salary: number): string {
    if (salary >= 6) return 'text-emerald-600 dark:text-emerald-400 font-bold';
    if (salary >= 4) return 'text-blue-600 dark:text-blue-400';
    return 'text-slate-600 dark:text-slate-400';
  }

  approveStudent(student: Student): void {
    const type = student.isOriginal ? 'original' : 'placement';
    this.placementService
      .verifyPlacement(type, student._id, 'approve')
      .subscribe({
        next: () => {
          this.loadData();
        },
        error: (err) => console.error('Approve failed:', err),
      });
  }

  rejectStudent(student: Student): void {
    const type = student.isOriginal ? 'original' : 'placement';
    this.placementService
      .verifyPlacement(type, student._id, 'reject')
      .subscribe({
        next: () => {
          this.loadData();
        },
        error: (err) => console.error('Reject failed:', err),
      });
  }

  // Send reminder emails to all pending students
  async sendPendingReminders(): Promise<void> {
    if (this.sendingReminders()) return;
    
    const pending = this.pendingStudents.length;
    if (pending === 0) {
      alert('No pending verifications to remind!');
      return;
    }
    
    if (!confirm(`Send reminder emails to ${pending} pending student(s)?`)) return;
    
    this.sendingReminders.set(true);
    
    try {
      const response = await fetch('https://sb-cse-gnitc-api.onrender.com/api/admin/send-pending-reminders', {
        method: 'POST',
        credentials: 'include'
      });
      const result = await response.json();
      
      if (result.success) {
        alert(`✅ Sent ${result.count} reminder emails successfully!`);
      } else {
        alert('❌ Failed to send reminders: ' + (result.error || 'Unknown error'));
      }
    } catch (e) {
      alert('❌ Error sending reminders');
      console.error(e);
    } finally {
      this.sendingReminders.set(false);
    }
  }

  // Export Modal Methods
  showExportModal(type: 'excel' | 'word'): void {
    this.exportType.set(type);
    this.exportModalVisible.set(true);
  }

  executeExport(filter: 'verified' | 'all'): void {
    this.exportModalVisible.set(false);
    if (this.exportType() === 'excel') {
      this.exportToExcel(filter);
    } else {
      this.exportToWord(filter);
    }
  }

  showPreview(filter: 'verified' | 'all'): void {
    this.exportModalVisible.set(false);
    this.previewFilter.set(filter);
    
    let students = this.allStudents();
    if (filter === 'verified') {
      students = students.filter(s => !s.hasPending);
    }
    this.previewData.set(students);
    this.previewModalVisible.set(true);
  }

  downloadFromPreview(): void {
    this.previewModalVisible.set(false);
    const filter = this.previewFilter();
    if (this.exportType() === 'excel') {
      this.exportToExcel(filter);
    } else {
      this.exportToWord(filter);
    }
  }

  getVerifiedCount(): number {
    return this.allStudents().filter(s => !s.hasPending).length;
  }

  // Helper to get company logo URL by company name (fuzzy match)
  getCompanyLogo(companyName: string): string | null {
    if (!companyName) return null;
    
    // Aggressive normalize: lowercase, remove ALL spaces, remove common suffixes
    const normalize = (name: string) => 
      name.toLowerCase()
          .replace(/\s+/g, '')  // Remove ALL spaces
          .replace(/[^a-z0-9]/g, '') // Remove special chars
          .replace(/(technologies|tech|solutions|pvt|ltd|limited|private|inc|llp)$/g, '') // Remove suffixes
          .trim();
    
    const normalizedSearch = normalize(companyName);
    
    // Try exact normalized match first
    let company = this.companies().find(c => 
      normalize(c.name) === normalizedSearch
    );
    
    // If not found, try contains match (either direction)
    if (!company) {
      company = this.companies().find(c => {
        const normalizedCompany = normalize(c.name);
        return normalizedCompany.includes(normalizedSearch) || 
               normalizedSearch.includes(normalizedCompany);
      });
    }
    
    // Only return Cloudinary URLs (they are reliable)
    // Local API URLs don't work on deployment
    if (company?.logo && company.logo.includes('cloudinary.com')) {
      return company.logo;
    }
    
    return null;
  }

  getStudentPhoto(student: Student | GroupedStudent): string {
    if (!student.photo) return '';
    return student.photo.startsWith('http') ? student.photo : `https://sb-cse-gnitc-api.onrender.com/api/photo/${student.photo}`;
  }

  exportToExcel(filter: 'verified' | 'all' = 'all'): void {
    import('xlsx').then((XLSX) => {
      let students = this.allStudents();
      if (filter === 'verified') {
        students = students.filter(s => !s.hasPending);
      }

      // Flatten: one row per placement for students with multiple offers
      const data: any[] = [];
      let sno = 1;
      students.forEach(s => {
        if (s.placements && s.placements.length > 0) {
          s.placements.forEach(p => {
            // ALWAYS prefer Company collection lookup (has Cloudinary URLs)
            const logoBase = this.getCompanyLogo(p.company) || 
              (p.logo && p.logo.includes('cloudinary.com') ? p.logo : null);
            const photoUrl = s.photo ? (s.photo.startsWith('http') ? s.photo : `https://sb-cse-gnitc-api.onrender.com/api/photo/${s.photo}`) : 'No Photo';
            
            data.push({
              'S.No': sno++,
              'Student ID': s.studentId,
              'Student Name': s.name,
              'Photo Link': photoUrl,
              'Company': p.company,
              'Company Logo': logoBase || 'No Logo',
              'Package (LPA)': p.salary,
            });
          });
        } else {
          // Fallback for students without detailed placements
          const photoUrl = s.photo ? (s.photo.startsWith('http') ? s.photo : `https://sb-cse-gnitc-api.onrender.com/api/photo/${s.photo}`) : 'No Photo';
          data.push({
            'S.No': sno++,
            'Student ID': s.studentId,
            'Student Name': s.name,
            'Photo Link': photoUrl,
            'Company': s.companies.join(', '),
            'Company Logo': 'No Logo',
            'Package (LPA)': s.maxPackage,
          });
        }
      });

      const ws = XLSX.utils.json_to_sheet(data);

      // Set column widths
      ws['!cols'] = [
        { wch: 6 }, // S.No
        { wch: 15 }, // Student ID
        { wch: 25 }, // Student Name
        { wch: 45 }, // Photo Link
        { wch: 25 }, // Company
        { wch: 45 }, // Company Logo
        { wch: 12 }, // Package
      ];

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Placement Report');

      const date = new Date().toISOString().split('T')[0];
      const suffix = filter === 'verified' ? '_Verified' : '_All';
      XLSX.writeFile(wb, `CSE_Placement_Report${suffix}_${date}.xlsx`);
    });
  }

  exportToWord(filter: 'verified' | 'all' = 'all'): void {
    const stats = this.stats();
    let students = this.allStudents();
    if (filter === 'verified') {
      students = students.filter(s => !s.hasPending);
    }
    const date = new Date().toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    });

    // Build table rows - one row per placement for students with multiple offers
    let tableRows = '';
    let sno = 1;
    students.forEach((s) => {
      // Use HTML width/height attributes for Word compatibility
      let photoSrc = '';
      if (s.photo) {
          photoSrc = s.photo.startsWith('http') ? s.photo : `https://sb-cse-gnitc-api.onrender.com/api/photo/${s.photo}`;
      }
      
      const photoCell = s.photo 
        ? `<img src="${photoSrc}" width="50" height="50" alt="${s.name}">`
        : `<b style="font-size:16px;color:#6366f1;">${s.name?.charAt(0) || 'S'}</b>`;
      
      if (s.placements && s.placements.length > 0) {
        // One row per placement
        s.placements.forEach(p => {
          // ALWAYS prefer Company collection lookup (has Cloudinary URLs)
          // Only use stored logo if it's a valid Cloudinary URL
          let logoUrl = this.getCompanyLogo(p.company) || 
            (p.logo && p.logo.includes('cloudinary.com') ? p.logo : null);
          const logoCell = logoUrl 
            ? `<img src="${logoUrl}" width="40" height="40" alt="${p.company}">`
            : `<span style="color:#999;font-size:10px;">No Logo</span>`;
          
          tableRows += `
            <tr>
              <td style="border:1px solid #ccc;padding:8px;text-align:center;">${sno++}</td>
              <td style="border:1px solid #ccc;padding:8px;text-align:center;width:60px;">${photoCell}</td>
              <td style="border:1px solid #ccc;padding:8px;">
                <b>${s.name}</b><br>
                <span style="color:#666;font-size:11px;">${s.studentId}</span>
              </td>
              <td style="border:1px solid #ccc;padding:8px;text-align:center;width:50px;">${logoCell}</td>
              <td style="border:1px solid #ccc;padding:8px;"><b>${p.company}</b></td>
              <td style="border:1px solid #ccc;padding:8px;text-align:center;"><b style="color:#059669;">${p.salary} LPA</b></td>
            </tr>
          `;
        });
      } else {
        // Fallback for students without detailed placements
        tableRows += `
          <tr>
            <td style="border:1px solid #ccc;padding:8px;text-align:center;">${sno++}</td>
            <td style="border:1px solid #ccc;padding:8px;text-align:center;width:60px;">${photoCell}</td>
            <td style="border:1px solid #ccc;padding:8px;">
              <b>${s.name}</b><br>
              <span style="color:#666;font-size:11px;">${s.studentId}</span>
            </td>
            <td style="border:1px solid #ccc;padding:8px;text-align:center;width:50px;"><span style="color:#999;">-</span></td>
            <td style="border:1px solid #ccc;padding:8px;">${s.companies.join(', ')}</td>
            <td style="border:1px solid #ccc;padding:8px;text-align:center;"><b style="color:#059669;">${s.maxPackage} LPA</b></td>
          </tr>
        `;
      }
    });

    const reportTitle = filter === 'verified' ? 'Verified Placements Report' : 'Complete Placement Report';

    // Word-compatible HTML with simpler structure
    const htmlContent = `
<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word">
<head>
<meta charset="utf-8">
<title>CSE Placement Report</title>
<!--[if gte mso 9]>
<xml>
<w:WordDocument>
<w:View>Print</w:View>
<w:Zoom>100</w:Zoom>
</w:WordDocument>
</xml>
<![endif]-->
<style>
  @page { size: landscape; margin: 0.5in; }
  body { font-family: Arial, sans-serif; font-size: 12px; }
  h1 { color: #1e3a8a; font-size: 20px; margin: 0; text-align: center; }
  h2 { color: #4338ca; font-size: 14px; margin: 5px 0; text-align: center; }
  h3 { color: #6366f1; font-size: 12px; margin: 5px 0; text-align: center; }
  .date { color: #666; font-size: 11px; text-align: center; margin-bottom: 20px; }
  table { width: 100%; border-collapse: collapse; margin-top: 15px; }
  th { background-color: #1e3a8a; color: white; padding: 10px; text-align: left; font-size: 11px; border: 1px solid #1e3a8a; }
  td { padding: 8px; border: 1px solid #ccc; vertical-align: middle; }
  .stats-table { margin: 15px 0; }
  .stats-table td { text-align: center; padding: 15px; background: #f0f0ff; border: none; }
  .stat-value { font-size: 24px; font-weight: bold; color: #1e3a8a; }
  .stat-label { font-size: 10px; color: #666; }
  .footer { text-align: center; margin-top: 30px; font-size: 10px; color: #666; border-top: 1px solid #ccc; padding-top: 15px; }
</style>
</head>
<body>
<h1>GURU NANAK INSTITUTIONS TECHNICAL CAMPUS</h1>
<h2>Department of Computer Science & Engineering</h2>
<h3>${reportTitle}</h3>
<p class="date">Generated on: ${date}</p>

<table class="stats-table">
  <tr>
    <td><div class="stat-value">${students.length}</div><div class="stat-label">Students</div></td>
    <td><div class="stat-value">${stats?.verified || 0}</div><div class="stat-label">Verified</div></td>
    <td><div class="stat-value">${stats?.companies || 0}</div><div class="stat-label">Companies</div></td>
    <td><div class="stat-value">${stats?.avgPackage || 0}</div><div class="stat-label">Avg Package (LPA)</div></td>
  </tr>
</table>

<table>
  <thead>
    <tr>
      <th style="width:30px;text-align:center;">#</th>
      <th style="width:60px;text-align:center;">Photo</th>
      <th style="width:160px;">Student Details</th>
      <th style="width:50px;text-align:center;">Logo</th>
      <th>Company</th>
      <th style="width:80px;text-align:center;">Package</th>
    </tr>
  </thead>
  <tbody>
    ${tableRows}
  </tbody>
</table>

<div class="footer">
  <b>GNITC Placement Portal</b> | Special Batch ${new Date().getFullYear()}<br>
  This is an auto-generated report. For official use only.
</div>
</body>
</html>
    `;

    const blob = new Blob(['\ufeff', htmlContent], {
      type: 'application/msword',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const suffix = filter === 'verified' ? '_Verified' : '_All';
    link.download = `CSE_Placement_Report${suffix}_${new Date().toISOString().split('T')[0]}.doc`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  getInitial(name: string | undefined): string {
    return name ? name.charAt(0).toUpperCase() : 'S';
  }
}
