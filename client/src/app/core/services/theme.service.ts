import { Injectable, signal, effect } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class ThemeService {
  private readonly THEME_KEY = 'placement-portal-theme';
  
  // Signals for reactive theme state
  isDarkMode = signal<boolean>(false);
  systemPreference = signal<'light' | 'dark'>('light');

  constructor() {
    this.initializeTheme();
    this.watchSystemPreference();
    
    // Effect to apply theme changes
    effect(() => {
      this.applyTheme(this.isDarkMode());
    });
  }

  private initializeTheme(): void {
    // Check for saved preference
    const savedTheme = localStorage.getItem(this.THEME_KEY);
    
    if (savedTheme) {
      this.isDarkMode.set(savedTheme === 'dark');
    } else {
      // Use system preference
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      this.isDarkMode.set(prefersDark);
      this.systemPreference.set(prefersDark ? 'dark' : 'light');
    }
  }

  private watchSystemPreference(): void {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    
    mediaQuery.addEventListener('change', (e) => {
      this.systemPreference.set(e.matches ? 'dark' : 'light');
      
      // Only auto-switch if no manual preference is saved
      if (!localStorage.getItem(this.THEME_KEY)) {
        this.isDarkMode.set(e.matches);
      }
    });
  }

  private applyTheme(isDark: boolean): void {
    if (isDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }

  toggleTheme(): void {
    const newValue = !this.isDarkMode();
    this.isDarkMode.set(newValue);
    localStorage.setItem(this.THEME_KEY, newValue ? 'dark' : 'light');
  }

  setTheme(mode: 'light' | 'dark' | 'system'): void {
    if (mode === 'system') {
      localStorage.removeItem(this.THEME_KEY);
      this.isDarkMode.set(this.systemPreference() === 'dark');
    } else {
      localStorage.setItem(this.THEME_KEY, mode);
      this.isDarkMode.set(mode === 'dark');
    }
  }
}
