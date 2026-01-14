import { Component, OnInit, OnDestroy, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { gsap } from 'gsap';
import { AuthService } from '../../../core/services/auth.service';
import { ThemeService } from '../../../core/services/theme.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule],
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.css']
})
export class LoginComponent implements OnInit, OnDestroy {
  private fb = inject(FormBuilder);
  private authService = inject(AuthService);
  private themeService = inject(ThemeService);
  private router = inject(Router);

  // Background slideshow - 5 campus images
  backgroundImages = [
    'assets/backgrounds/auditorium.jpg',
    'assets/backgrounds/gate.jpg',
    'assets/backgrounds/drone-view.jpg',
    'assets/backgrounds/gnit-campus.jpeg',
    'assets/backgrounds/pharmacy.webp'
  ];
  
  currentBgIndex = signal(0);
  private bgInterval: any;

  // Form
  loginForm: FormGroup;
  isLoading = signal(false);
  errorMessage = signal('');
  showPassword = signal(false);

  constructor() {
    this.loginForm = this.fb.group({
      username: ['', [Validators.required, Validators.minLength(3)]],
      password: ['', [Validators.required, Validators.minLength(4)]]
    });
  }

  ngOnInit(): void {
    this.startBackgroundSlideshow();
    this.animateEntrance();
  }

  ngOnDestroy(): void {
    if (this.bgInterval) {
      clearInterval(this.bgInterval);
    }
  }

  private startBackgroundSlideshow(): void {
    this.bgInterval = setInterval(() => {
      this.currentBgIndex.update(index => 
        (index + 1) % this.backgroundImages.length
      );
    }, 5000); // Change every 5 seconds
  }

  private animateEntrance(): void {
    // GSAP entrance animations
    gsap.fromTo('.login-card', 
      { opacity: 0, y: 30, scale: 0.95 },
      { opacity: 1, y: 0, scale: 1, duration: 0.8, ease: 'power3.out', delay: 0.3 }
    );

    gsap.fromTo('.brand-section', 
      { opacity: 0, x: -30 },
      { opacity: 1, x: 0, duration: 0.8, ease: 'power3.out', delay: 0.5 }
    );

    gsap.fromTo('.form-element', 
      { opacity: 0, y: 20 },
      { opacity: 1, y: 0, duration: 0.5, stagger: 0.1, ease: 'power2.out', delay: 0.7 }
    );
  }

  togglePassword(): void {
    this.showPassword.update(v => !v);
  }

  toggleDarkMode(): void {
    this.themeService.toggleTheme();
  }

  get isDarkMode(): boolean {
    return this.themeService.isDarkMode();
  }

  onSubmit(): void {
    if (this.loginForm.invalid) {
      this.loginForm.markAllAsTouched();
      return;
    }

    this.isLoading.set(true);
    this.errorMessage.set('');

    const { username, password } = this.loginForm.value;

    this.authService.login(username, password).subscribe({
      next: (response) => {
        this.isLoading.set(false);
        
        if (response.success) {
          // Animate exit
          gsap.to('.login-card', {
            opacity: 0,
            scale: 0.95,
            duration: 0.3,
            onComplete: () => {
              if (response.role === 'admin') {
                this.router.navigate(['/dashboard']);
              } else {
                this.router.navigate(['/student']);
              }
            }
          });
        } else {
          this.errorMessage.set(response.message || 'Invalid credentials');
          // Shake animation on error
          gsap.fromTo('.login-card', 
            { x: -10 },
            { x: 0, duration: 0.5, ease: 'elastic.out(1, 0.3)' }
          );
        }
      },
      error: (error) => {
        this.isLoading.set(false);
        this.errorMessage.set('Login failed. Please try again.');
      }
    });
  }

  // Form getters for validation
  get usernameControl() { return this.loginForm.get('username'); }
  get passwordControl() { return this.loginForm.get('password'); }
}
