import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, catchError, of, tap } from 'rxjs';

export interface Student {
  _id: string;
  studentId: string;
  sno?: number;
  name: string;
  company: string;
  salary: number;
  photo?: string;
  logo?: string;
  isOriginal: boolean;
  verificationStatus: 'verified' | 'pending' | 'rejected';
  createdAt?: Date;
}

export interface PlacementStats {
  total: number;
  verified: number;
  pending: number;
  rejected: number;
  companies: number;
  avgPackage: number;
  highestPackage: number;
}

export interface GroupedStudent {
  studentId: string;
  name: string;
  photo?: string;
  placements: {
    _id: string;
    company: string;
    salary: number;
    status: 'verified' | 'pending' | 'rejected';
    isOriginal: boolean;
    logo?: string;
  }[];
  companies: string[];
  maxPackage: number;
  hasPending: boolean;
}

export interface Company {
  _id: string;
  name: string;
  logo: string;
}

export interface Notification {
  _id: string;
  title: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error';
  read: boolean;
  createdAt: Date;
}

export interface PlacementsResponse {
  placements: Student[];
  total: number;
}

@Injectable({
  providedIn: 'root'
})
export class PlacementService {
  private http = inject(HttpClient);
  private API_URL = 'https://sb-cse-gnitc-api.onrender.com/api';

  // Cached data
  placements = signal<Student[]>([]);
  groupedStudents = signal<GroupedStudent[]>([]);
  companies = signal<Company[]>([]);
  notifications = signal<Notification[]>([]);
  unreadNotifications = signal(0);
  
  stats = signal<PlacementStats | null>(null);
  isLoading = signal(false);
  error = signal<string | null>(null);

  /**
   * Fetch all placements from backend (Admin only)
   */
  fetchPlacements(): Observable<PlacementsResponse> {
    this.isLoading.set(true);
    this.error.set(null);

    return this.http.get<PlacementsResponse>(`${this.API_URL}/placements`).pipe(
      tap(response => {
        this.placements.set(response.placements);
        this.groupPlacements(response.placements);
        this.calculateStats(response.placements);
        this.isLoading.set(false);
      }),
      catchError(err => {
        this.error.set(err.message || 'Failed to fetch placements');
        this.isLoading.set(false);
        return of({ placements: [], total: 0 });
      })
    );
  }

  /**
   * Calculate statistics from placements data
   */
  private calculateStats(placements: Student[]): void {
    if (!placements.length) {
      this.stats.set(null);
      return;
    }

    const verified = placements.filter(p => p.verificationStatus === 'verified');
    const pending = placements.filter(p => p.verificationStatus === 'pending');
    const rejected = placements.filter(p => p.verificationStatus === 'rejected');
    
    const companies = new Set(placements.map(p => p.company?.toLowerCase()).filter(Boolean));
    
    const salaries = placements.map(p => p.salary || 0).filter(s => s > 0);
    const avgPackage = salaries.length > 0 
      ? parseFloat((salaries.reduce((a, b) => a + b, 0) / salaries.length).toFixed(2))
      : 0;
    const highestPackage = salaries.length > 0 ? Math.max(...salaries) : 0;

    this.stats.set({
      total: placements.length,
      verified: verified.length,
      pending: pending.length,
      rejected: rejected.length,
      companies: companies.size,
      avgPackage,
      highestPackage
    });
  }

  /**
   * Group placements by student ID for the dashboard table
   */
  private groupPlacements(placements: Student[]): void {
    const groups = new Map<string, GroupedStudent>();

    placements.forEach(p => {
      // Normalize ID (handle case sensitivity)
      const id = p.studentId.toUpperCase();
      
      if (!groups.has(id)) {
        groups.set(id, {
          studentId: id,
          name: p.name,
          photo: p.photo,
          placements: [],
          companies: [],
          maxPackage: 0,
          hasPending: false
        });
      }

      const group = groups.get(id)!;
      
      // Update basic info if missing (sometimes original record has better data)
      if (!group.photo && p.photo) group.photo = p.photo;
      
      // Add placement info
      if (p.company) {
        group.placements.push({
          _id: p._id,
          company: p.company,
          salary: p.salary,
          status: p.verificationStatus,
          isOriginal: p.isOriginal,
          logo: p.logo
        });
        
        if (!group.companies.includes(p.company)) {
          group.companies.push(p.company);
        }
        
        if (p.salary > group.maxPackage) {
          group.maxPackage = p.salary;
        }
        
        if (p.verificationStatus === 'pending') {
          group.hasPending = true;
        }
      }
    });

    this.groupedStudents.set(Array.from(groups.values()));
  }

  /**
   * Verify or reject a placement
   */
  verifyPlacement(type: 'placement' | 'original', id: string, action: 'approve' | 'reject'): Observable<any> {
    return this.http.post(`${this.API_URL}/admin/verify`, { type, id, action });
  }

  // ==================== STUDENT METHODS ====================

  /**
   * Get logged-in student's profile and placements
   */
  getMyProfile(): Observable<{ student: Student; placements: Student[]; hasPhoto: boolean }> {
    return this.http.get<{ student: Student; placements: Student[]; hasPhoto: boolean }>(`${this.API_URL}/my-profile`);
  }

  /**
   * Submit a new placement
   */
  submitPlacement(data: { company: string; salary: number; logo?: string }): Observable<any> {
    return this.http.post(`${this.API_URL}/placements`, data);
  }

  /**
   * Delete a student's own placement
   */
  deleteMyPlacement(id: string): Observable<any> {
    return this.http.delete(`${this.API_URL}/placements/${id}`);
  }

  /**
   * Upload student profile photo
   */
  uploadPhoto(file: File): Observable<{ success: boolean; photo: string }> {
    const formData = new FormData();
    formData.append('photo', file);
    return this.http.post<{ success: boolean; photo: string }>(`${this.API_URL}/upload-photo`, formData);
  }

  // ==================== COMPANY METHODS ====================

  fetchCompanies(): Observable<Company[]> {
    return this.http.get<Company[]>(`${this.API_URL}/companies`).pipe(
      tap(companies => this.companies.set(companies))
    );
  }

  addCompany(name: string, logoFile: File): Observable<any> {
    const formData = new FormData();
    formData.append('name', name);
    formData.append('logo', logoFile);
    return this.http.post(`${this.API_URL}/companies`, formData);
  }

  deleteCompany(id: string): Observable<any> {
    return this.http.delete(`${this.API_URL}/companies/${id}`);
  }

  // ==================== NOTIFICATION METHODS ====================

  fetchNotifications(): void {
    this.http.get<{ notifications: Notification[], unreadCount: number }>(`${this.API_URL}/notifications`)
      .subscribe({
        next: (res) => {
          this.notifications.set(res.notifications);
          this.unreadNotifications.set(res.unreadCount);
        },
        error: (err) => console.error('Failed to fetch notifications', err)
      });
  }

  markAsRead(id?: string): Observable<any> {
    return this.http.post(`${this.API_URL}/notifications/read`, { id }).pipe(
      tap(() => this.fetchNotifications())
    );
  }

  /**
   * Delete a student (Admin only)
   */
  deleteStudent(studentId: string): Observable<any> {
    return this.http.delete(`${this.API_URL}/students/${studentId}`);
  }

  /**
   * Update a student (Admin only)
   */
  updateStudent(studentId: string, data: { name?: string; company?: string; salary?: number }): Observable<any> {
    return this.http.put(`${this.API_URL}/students/${studentId}`, data);
  }

  /**
   * Create new student (Admin only)
   */
  createStudent(data: { id: string; name: string }): Observable<any> {
    return this.http.post(`${this.API_URL}/students/create`, data);
  }
}
