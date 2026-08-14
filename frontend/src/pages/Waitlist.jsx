import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import api from '../api/client';
import { formatPhone } from '../utils/formatPhone';

export default function Waitlist() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const acquisitionSource = searchParams.get('src') || null;

  const [businessName, setBusinessName] = useState('');
  const [phone, setPhone] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [alreadyOnWaitlist, setAlreadyOnWaitlist] = useState(false);

  const phoneDigits = phone.replace(/\D/g, '');
  const canSubmit = businessName.trim().length > 1 && phoneDigits.length === 10 && !submitting;

  async function handleSubmit(e) {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setError('');
    try {
      const { data } = await api.post('/waitlist', {
        businessName: businessName.trim(),
        phone: phoneDigits,
        acquisitionSource,
      });
      setAlreadyOnWaitlist(!!data.alreadyOnWaitlist);
      setDone(true);
    } catch (err) {
      setError(err.response?.data?.error || 'Something went wrong — please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-white">
      {/* Nav */}
      <nav className="sticky top-0 z-50 bg-white/90 backdrop-blur border-b border-gray-100">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <button onClick={() => navigate('/')} className="flex items-center gap-2">
            <img src="/probook-icon-128.png" alt="Tractify" className="w-7 h-7 rounded-lg" />
            <span className="font-bold text-gray-900">Tractify</span>
          </button>
        </div>
      </nav>

      <div className="max-w-lg mx-auto px-4 sm:px-6 py-16">
        {!done ? (
          <>
            <h1 className="text-3xl sm:text-4xl font-extrabold text-gray-900 mb-3 tracking-tight">
              Get on the list.
            </h1>
            <p className="text-gray-600 mb-8 leading-relaxed">
              We're finishing up a few things behind the scenes before we can start texting new
              businesses. Drop your info below and we'll reach out the moment we're ready to get
              you set up — first 5 booked jobs are free.
            </p>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-800 mb-1.5">
                  Business name
                </label>
                <input
                  type="text"
                  value={businessName}
                  onChange={(e) => setBusinessName(e.target.value)}
                  placeholder="e.g. Premier Comfort HVAC"
                  className="w-full px-4 py-3 rounded-xl border border-gray-300 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-base"
                  autoComplete="organization"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-800 mb-1.5">
                  Your phone number
                </label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(formatPhone(e.target.value))}
                  placeholder="(555) 123-4567"
                  className="w-full px-4 py-3 rounded-xl border border-gray-300 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-base"
                  autoComplete="tel"
                  inputMode="tel"
                  required
                />
                <p className="text-xs text-gray-400 mt-1.5">
                  The number you personally carry — this is how we'll text you when we're live.
                </p>
              </div>

              {error && (
                <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={!canSubmit}
                className="w-full py-3.5 rounded-xl bg-indigo-600 text-white font-semibold text-base hover:bg-indigo-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {submitting ? 'Joining...' : 'Join the waitlist'}
              </button>

              <p className="text-xs text-gray-400 text-center leading-relaxed">
                By joining you agree to receive a text from us when we're ready to onboard you.
                No spam, no obligation. See our{' '}
                <a href="/terms" className="text-indigo-600 hover:underline">Terms</a> and{' '}
                <a href="/privacy" className="text-indigo-600 hover:underline">Privacy Policy</a>.
              </p>
            </form>
          </>
        ) : (
          <div className="text-center py-8">
            <div className="w-14 h-14 rounded-full bg-indigo-50 flex items-center justify-center mx-auto mb-5">
              <svg className="w-7 h-7 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h1 className="text-2xl font-extrabold text-gray-900 mb-2">
              {alreadyOnWaitlist ? "You're already on the list." : "You're on the list."}
            </h1>
            <p className="text-gray-600 leading-relaxed">
              We'll text you the moment we're ready to get you set up. Nothing else to do right now.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
