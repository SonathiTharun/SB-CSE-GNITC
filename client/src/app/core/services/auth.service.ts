import { Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { Observable, tap, catchError, of } from 'rxjs';

export interface User {
  id: string;
  username: string;
  role: 'admin' | 'student';
  name?: string;
}

export interface LoginResponse {
  success: boolean;
  message?: string;
  role?: 'admin' | 'student';
  user?: User;
}

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  // Production Render URL
  private readonly API_URL = 'https://sb-cse-gnitc-api.onrender.com/api';
  
  // Signals for reactive state management
  currentUser = signal<User | null>(null);
  isAuthenticated = signal<boolean>(false);
  isLoading = signal<boolean>(false);

  constructor(
    private http: HttpClient,
    private router: Router
  ) {
    this.checkAuthStatus();
  }

  login(username: string, password: string): Observable<LoginResponse> {
    this.isLoading.set(true);
    
    return this.http.post<LoginResponse>(`${this.API_URL}/login`, {
      username: username.toUpperCase(),
      password
    }).pipe(
      tap(response => {
        this.isLoading.set(false);
        if (response.success) {
          this.isAuthenticated.set(true);
          if (response.user) {
            this.currentUser.set(response.user);
          }
        }
      }),
      catchError(error => {
        this.isLoading.set(false);
        return of({
          success: false,
          message: error.error?.message || 'Login failed. Please try again.'
        });
      })
    );
  }

  logout(): void {
    this.http.post(`${this.API_URL}/logout`, {}).subscribe({
      next: () => {
        this.currentUser.set(null);
        this.isAuthenticated.set(false);
        this.router.navigate(['/login']);
      },
      error: () => {
        // Even if logout fails on server, clear local state
        this.currentUser.set(null);
        this.isAuthenticated.set(false);
        this.router.navigate(['/login']);
      }
    });
  }

  checkAuthStatus(): void {
    // Note: This endpoint may not exist in the current backend
    // The login will work regardless - this is just for session persistence
    this.http.get<{ authenticated: boolean; user?: User }>(`${this.API_URL}/auth/status`)
      .subscribe({
        next: (response) => {
          this.isAuthenticated.set(response.authenticated);
          if (response.user) {
            this.currentUser.set(response.user);
          }
        },
        error: () => {
          // Silently handle - auth status check is optional
          this.isAuthenticated.set(false);
          this.currentUser.set(null);
        }
      });
  }

  isAdmin(): boolean {
    return this.currentUser()?.role === 'admin';
  }

  isStudent(): boolean {
    return this.currentUser()?.role === 'student';
  }
}
