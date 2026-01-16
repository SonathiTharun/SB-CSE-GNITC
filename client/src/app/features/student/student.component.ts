import { Component, OnInit, inject, signal, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { gsap } from 'gsap';
import { AuthService } from '../../core/services/auth.service';
import { PlacementService, Student } from '../../core/services/placement.service';

@Component({
  selector: 'app-student',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './student.component.html',
  styleUrls: ['./student.component.css']
})
export class StudentComponent implements OnInit {
  private router = inject(Router);
  private authService = inject(AuthService);
  private placementService = inject(PlacementService);

  // State
  student = signal<Student | null>(null);
  myPlacements = signal<Student[]>([]);
  isLoading = signal(false);
  isSubmitting = signal(false);
  
  get companies() { return this.placementService.companies; }

  // Form Data
  placementForm = {
    company: '',
    salary: null as number | null
  };
  
  // UI State
  showUploadModal = signal(false);
  selectedFile: File | null = null;
  message = signal<{type: 'success' | 'error', text: string} | null>(null);

  // Notifications & Modal State
  showNotifications = signal(false);
  showLogoutModal = signal(false);
  
  // Edit Placement Modal
  showEditModal = signal(false);
  editingPlacement = signal<Student | null>(null);
  editForm = { company: '', salary: null as number | null, logo: '' };
  editPhotoFile: File | null = null;
  
  // Notification Sound System
  private audioContext: AudioContext | null = null;
  private lastNotificationCount = 0;

  get notifications() { return this.placementService.notifications; }
  get unreadCount() { return this.placementService.unreadNotifications; }

  constructor() {
    effect(() => {
      const count = this.unreadCount();
      if (this.lastNotificationCount !== -1 && count > this.lastNotificationCount) {
        this.playNotificationSound();
      }
      this.lastNotificationCount = count;
    });
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
      
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(880, this.audioContext.currentTime);
      oscillator.frequency.exponentialRampToValueAtTime(1760, this.audioContext.currentTime + 0.1);
      
      gainNode.gain.setValueAtTime(0.3, this.audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.5);
      
      oscillator.start();
      oscillator.stop(this.audioContext.currentTime + 0.5);
    } catch (e) {
      console.error('Audio playback failed', e);
    }
  }

  toggleNotifications(event: Event) {
    event.stopPropagation();
    this.showNotifications.update(v => !v);
  }

  markAsRead(id?: string) {
    this.placementService.markAsRead(id).subscribe();
  }

  confirmLogout() {
    this.showLogoutModal.set(true);
  }

  ngOnInit(): void {
    this.loadProfile();
    this.placementService.fetchCompanies().subscribe();
    this.placementService.fetchNotifications();
    // Poll notifications every 30s
    setInterval(() => this.placementService.fetchNotifications(), 30000);
    
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

    // Close dropdown on click outside
    document.addEventListener('click', () => {
      this.showNotifications.set(false);
    });
  }

  loadProfile(): void {
    this.isLoading.set(true);
    this.placementService.getMyProfile().subscribe({
      next: (data) => {
        this.student.set(data.student);
        this.myPlacements.set(data.placements);
        this.isLoading.set(false);
        this.animateEntrance();
      },
      error: (err) => {
        console.error('Failed to load profile:', err);
        this.isLoading.set(false);
      }
    });
  }

  animateEntrance(): void {
    setTimeout(() => {
      gsap.fromTo('.profile-card', 
        { opacity: 0, y: 30 },
        { opacity: 1, y: 0, duration: 0.6, ease: 'power3.out' }
      );

      gsap.fromTo('.placement-form', 
        { opacity: 0, x: -30 },
        { opacity: 1, x: 0, duration: 0.6, delay: 0.2, ease: 'power3.out' }
      );

      gsap.fromTo('.placement-item', 
        { opacity: 0, x: 30 },
        { opacity: 1, x: 0, duration: 0.5, stagger: 0.1, delay: 0.4, ease: 'power3.out' }
      );
    }, 100);
  }

  onFileSelected(event: any): void {
    const file = event.target.files[0];
    if (file) {
      this.selectedFile = file;
    }
  }

  uploadPhoto(): void {
    if (!this.selectedFile) return;

    this.isSubmitting.set(true);
    this.placementService.uploadPhoto(this.selectedFile).subscribe({
      next: (res) => {
        if (this.student()) {
          this.student.update(s => s ? ({ ...s, photo: res.photo }) : null);
        }
        this.showMessage('success', 'Photo uploaded successfully!');
        this.showUploadModal.set(false);
        this.selectedFile = null;
        this.isSubmitting.set(false);
      },
      error: (err) => {
        this.showMessage('error', 'Failed to upload photo');
        this.isSubmitting.set(false);
      }
    });
  }

  submitPlacement(): void {
    if (!this.placementForm.company || !this.placementForm.salary) {
      this.showMessage('error', 'Please fill in all fields');
      return;
    }

    if (!this.student()?.photo) {
      this.showMessage('error', 'Please upload your profile photo first');
      return;
    }

    // Check for duplicate company
    const isDuplicate = this.myPlacements().some(
      p => p.company.toLowerCase() === this.placementForm.company.toLowerCase()
    );
    if (isDuplicate) {
      this.showMessage('error', 'You already have a placement at this company');
      return;
    }

    this.isSubmitting.set(true);
    
    // Look up the company's logo from the companies list
    const selectedCompany = this.companies().find(c => c.name === this.placementForm.company);
    const companyLogo = selectedCompany?.logo || '';
    
    this.placementService.submitPlacement({
      company: this.placementForm.company,
      salary: this.placementForm.salary,
      logo: companyLogo
    }).subscribe({
      next: (res) => {
        this.showMessage('success', 'Placement submitted successfully!');
        this.placementForm = { company: '', salary: null };
        this.loadProfile(); // Reload to show new placement
        this.isSubmitting.set(false);
      },
      error: (err) => {
        this.showMessage('error', 'Failed to submit placement');
        this.isSubmitting.set(false);
      }
    });
  }

  deletePlacement(id: string): void {
    if (!confirm('Are you sure you want to delete this placement?')) return;

    this.placementService.deleteMyPlacement(id).subscribe({
      next: () => {
        this.showMessage('success', 'Placement deleted successfully');
        this.loadProfile();
      },
      error: (err) => {
        this.showMessage('error', 'Failed to delete placement');
      }
    });
  }

  // Edit Placement Methods
  openEditModal(placement: Student): void {
    this.editingPlacement.set(placement);
    this.editForm = { 
      company: placement.company, 
      salary: placement.salary,
      logo: placement.logo || ''
    };
    this.editPhotoFile = null; // Reset photo selection
    this.showEditModal.set(true);
  }

  onEditPhotoSelected(event: any): void {
    const file = event.target.files[0];
    if (file) {
      this.editPhotoFile = file;
    }
  }

  submitEdit(): void {
    const p = this.editingPlacement();
    if (!p || !this.editForm.company || !this.editForm.salary) {
      this.showMessage('error', 'Please fill all fields');
      return;
    }
    
    // Client-side duplicate check (excluding current placement)
    const isDuplicate = this.myPlacements().some(
      pl => pl._id !== p._id && 
      pl.company.toLowerCase() === this.editForm.company.toLowerCase()
    );
    if (isDuplicate) {
      this.showMessage('error', 'You already have a placement at this company');
      return;
    }
    
    this.isSubmitting.set(true);
    const selectedCompany = this.companies().find(c => c.name === this.editForm.company);
    
    // Upload photo first if selected
    const uploadAndUpdate = async () => {
      try {
        if (this.editPhotoFile) {
          await this.placementService.uploadPhoto(this.editPhotoFile).toPromise();
        }
        
        this.placementService.updatePlacement(p._id, {
          company: this.editForm.company,
          salary: this.editForm.salary!,
          logo: selectedCompany?.logo || this.editForm.logo
        }).subscribe({
          next: () => {
            this.showMessage('success', 'Placement updated! Sent for re-verification.');
            this.showEditModal.set(false);
            this.editingPlacement.set(null);
            this.editPhotoFile = null;
            this.loadProfile();
            this.isSubmitting.set(false);
          },
          error: (err) => {
            this.showMessage('error', err.error?.error || 'Failed to update placement');
            this.isSubmitting.set(false);
          }
        });
      } catch (err) {
        this.showMessage('error', 'Failed to upload photo');
        this.isSubmitting.set(false);
      }
    };
    
    uploadAndUpdate();
  }

  logout(): void {
    this.authService.logout();
  }

  showMessage(type: 'success' | 'error', text: string): void {
    this.message.set({ type, text });
    setTimeout(() => this.message.set(null), 3000);
  }

  getInitial(name: string | undefined): string {
    return name ? name.charAt(0).toUpperCase() : 'S';
  }

  getPhotoUrl(photo: string | undefined): string {
    if (!photo) return '';
    return photo.startsWith('http') 
      ? photo 
      : `https://sb-cse-gnitc-api.onrender.com/api/photo/${photo}`;
  }
}
