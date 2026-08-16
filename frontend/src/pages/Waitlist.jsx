import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
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
    <div className="relative min-h-screen w-full max-w-full overflow-x-hidden bg-tractify-gradient flex flex-col">
      <div className="bg-grain" />
      <div className="glow-orb w-96 h-96 -top-20 -left-20 bg-white/10" />
      <div className="glow-orb w-80 h-80 bottom-0 right-0 bg-brand-300/20" />

      {/* ── NAV — matches LandingPage.jsx exactly ── */}
      <nav className="sticky top-0 z-50 bg-white/5 backdrop-blur-md border-b border-white/10">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-3">
          <button onClick={() => navigate('/')} className="flex items-center gap-2.5 shrink-0">
            <img src="/probook-icon-128.png" alt="Tractify" className="w-8 h-8 rounded-lg" />
            <span className="font-display text-white text-base sm:text-lg tracking-tight">TRACTIFY</span>
          </button>
          <button
            onClick={() => navigate('/login')}
            className="text-sm font-semibold text-white/80 hover:text-white px-3 py-2 rounded-xl hover:bg-white/10 transition-all whitespace-nowrap"
          >
            <span className="hidden sm:inline">Contractor </span>Login
          </button>
        </div>
      </nav>

      <div className="relative flex-1 flex items-center px-4 sm:px-6 py-16 sm:py-24">
        <div className="max-w-lg mx-auto w-full">
          {!done ? (
            <>
              <div className="inline-flex items-center gap-2 bg-white/10 border border-white/20 text-white text-xs font-semibold px-3.5 py-1.5 rounded-full mb-6">
                Get on the list
              </div>
              <h1 className="font-display text-white text-4xl sm:text-5xl leading-[1.02] tracking-tight mb-5">
                GET ON<br />THE LIST.
              </h1>
              <p className="text-white/75 text-sm sm:text-base leading-relaxed mb-9">
                We're finishing up a few things behind the scenes before we can start texting new
                businesses. Drop your info below and we'll reach out the moment we're ready to get
                you set up — first 5 booked jobs are free.
              </p>

              <form onSubmit={handleSubmit} className="space-y-5">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wide text-white/70 mb-2">
                    Business name
                  </label>
                  <input
                    type="text"
                    value={businessName}
                    onChange={(e) => setBusinessName(e.target.value)}
                    placeholder="e.g. Premier Comfort HVAC"
                    className="w-full px-4 py-3 rounded-xl bg-white/10 border border-white/20 text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-white/40 focus:border-transparent text-base"
                    autoComplete="organization"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wide text-white/70 mb-2">
                    Your phone number
                  </label>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(formatPhone(e.target.value))}
                    placeholder="(555) 123-4567"
                    className="w-full px-4 py-3 rounded-xl bg-white/10 border border-white/20 text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-white/40 focus:border-transparent text-base"
                    autoComplete="tel"
                    inputMode="tel"
                    required
                  />
                  <p className="text-xs text-white/50 mt-2">
                    The number you personally carry — this is how we'll text you when we're live.
                  </p>
                </div>

                {error && (
                  <p className="text-sm text-white bg-red-500/20 border border-red-400/30 rounded-lg px-3 py-2">
                    {error}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={!canSubmit}
                  className="btn-sheen w-full inline-flex items-center justify-center gap-2 bg-white text-brand-700 font-bold text-base py-3.5 rounded-xl hover:shadow-xl transition-all shadow-lg shadow-brand-900/30 disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none"
                >
                  {submitting ? 'Joining...' : <>Join the Waitlist <ArrowRight className="w-5 h-5" /></>}
                </button>

                <p className="text-xs text-white/50 text-center leading-relaxed">
                  By joining you agree to receive a text from us when we're ready to onboard you.
                  No spam, no obligation. See our{' '}
                  <a href="/terms" className="text-white hover:underline">Terms</a> and{' '}
                  <a href="/privacy" className="text-white hover:underline">Privacy Policy</a>.
                </p>
              </form>
            </>
          ) : (
            <div className="text-center py-8">
              <div className="w-16 h-16 rounded-full bg-white/10 border border-white/20 flex items-center justify-center mx-auto mb-6">
                <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h1 className="font-display text-white text-3xl sm:text-4xl leading-tight tracking-tight mb-4">
                {alreadyOnWaitlist ? <>YOU'RE ALREADY<br />ON THE LIST.</> : <>YOU'RE ON<br />THE LIST.</>}
              </h1>
              <p className="text-white/75 leading-relaxed">
                We'll text you the moment we're ready to get you set up. Nothing else to do right now.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
