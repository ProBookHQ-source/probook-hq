import { useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/client';

export default function ForgotPassword() {
  const [email, setEmail]   = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent]     = useState(false);
  const [error, setError]   = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    if (!email.trim()) return setError('Email is required');
    setLoading(true);
    setError('');
    try {
      await api.post('/auth/contractor/forgot-password', { email: email.trim() });
      setSent(true);
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  const bg = 'min-h-screen bg-gradient-to-br from-brand-50 via-white to-purple-50 flex items-center justify-center p-4 w-full max-w-full overflow-x-hidden';

  if (sent) {
    return (
      <div className={bg}>
        <div className="w-full max-w-md text-center">
          <div className="flex justify-center mb-4">
            <img src="/probook-icon-128.png" alt="ProBook" className="w-14 h-14 rounded-2xl shadow-lg" />
          </div>
          <div className="bg-white rounded-2xl shadow-lg p-8">
            <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-6 h-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">Check your email</h2>
            <p className="text-gray-500 text-sm mb-6">
              If that email is in our system, we've sent a reset link. Check your inbox (and spam folder).
            </p>
            <Link to="/login" className="text-brand-500 text-sm font-semibold hover:underline">
              Back to login
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={bg}>
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <img src="/probook-icon-128.png" alt="ProBook" className="w-14 h-14 rounded-2xl shadow-lg mb-4 mx-auto" />
          <h1 className="text-2xl font-bold text-gray-900">Forgot your password?</h1>
          <p className="text-gray-500 text-sm mt-1">Enter your email and we'll send you a reset link.</p>
        </div>

        <div className="bg-white rounded-2xl shadow-lg p-8">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Email Address</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="jane@smithroofing.com"
                className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 bg-white text-sm transition-all outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
              />
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-600">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 px-4 bg-brand-500 hover:bg-brand-600 disabled:bg-brand-300 text-white font-bold rounded-xl transition-all"
            >
              {loading ? 'Sending…' : 'Send Reset Link'}
            </button>
          </form>

          <p className="text-center text-sm text-gray-500 mt-6">
            Remembered it?{' '}
            <Link to="/login" className="text-brand-500 font-semibold hover:underline">Sign in</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
