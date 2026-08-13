import axios from 'axios';

const api = axios.create({ baseURL: '/api' });

// Attach JWT automatically — a sessionStorage impersonation token (admin viewing
// a contractor's portal, see auth.js /admin/impersonate-contractor) always wins
// over the normal localStorage token. sessionStorage is tab-isolated by spec, so
// this can never leak into or overwrite the admin's own session in another tab.
api.interceptors.request.use(config => {
  const token = sessionStorage.getItem('impersonate_token') || localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// On 401, clear auth and redirect to login — but NOT on auth endpoints themselves.
// If this was an impersonation session, only clear the impersonation keys — NOT
// localStorage, which holds the admin's real session and is shared across tabs.
api.interceptors.response.use(
  res => res,
  err => {
    const isAuthRoute = err.config?.url?.includes('/auth/');
    if (err.response?.status === 401 && !isAuthRoute) {
      const isImpersonating = !!sessionStorage.getItem('impersonate_token');
      if (isImpersonating) {
        sessionStorage.removeItem('impersonate_token');
        sessionStorage.removeItem('impersonate_user');
      } else {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
      }
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

export default api;
