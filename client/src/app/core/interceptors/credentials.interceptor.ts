import { HttpInterceptorFn } from '@angular/common/http';

export const credentialsInterceptor: HttpInterceptorFn = (req, next) => {
  // Add withCredentials for cross-origin cookie handling (Vercel -> Render)
  const authReq = req.clone({
    withCredentials: true
  });
  return next(authReq);
};
