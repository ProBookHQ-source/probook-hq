import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Zap, Calendar, Clock, CheckCircle, XCircle, AlertTriangle } from 'lucide-react';

const API = import.meta.env.VITE_API_URL || '';

function fmtDate(dateStr) {
  if (!dateStr) return '';
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });
}

function fmtTime(t) {
  if (!t) return '';
  const [h, m] = String(t).split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${ampm}`;
}

export default function CancelPage({ mode = 'cancel' }) {
  const { token } = useParams();
  const navigate  = useNavigate();
  const isReschedule = mode === 'reschedule';

  const [appt,    setAppt]    = useState(null);
  const [status,  setStatus]  = useState('loading'); // loading | confirm | kept | success | error
  const [message, setMessage] = useState('');
  const [working, setWorking] = useState(false);

  useEffect(() => {
    const endpoint = isReschedule
      ? `/api/bookings/reschedule-info/${token}`
      : `/api/bookings/cancel-info/${token}`;

    fetch(`${API}${endpoint}`)
      .then(async r => {
        const data = await r.json();
        if (!r.ok) { setMessage(data.error || 'Something went wrong.'); setStatus('error'); return; }
        setAppt(data);
        setStatus('confirm');
      })
      .catch(() => { setMessage('Unable to load appointment details. Please try again.'); setStatus('error'); });
  }, [token, isReschedule]);

  async function handleConfirm() {
    setWorking(true);
    const endpoint = isReschedule
      ? `/api/bookings/reschedule-token/${token}`
      : `/api/bookings/cancel-token/${token}`;

    try {
      const r    = await fetch(`${API}${endpoint}`, { method: 'POST' });
      const data = await r.json();
      if (!r.ok) {
        setMessage(data.error || 'Something went wrong.');
        setStatus('error');
        return;
      }
      if (isReschedule && data.booking_token) {
        navigate(`/book/${data.booking_token}`);
      } else {
        // Handle limit_reached: show success but with contact-us message
        if (data.limit_reached) setMessage('contact_us');
        setStatus('success');
      }
    } catch {
      setMessage('Network error. Please try again.');
      setStatus('error');
    } finally {
      setWorking(false);
    }
  }

  const bgGradient = 'min-h-screen bg-gradient-to-br from-brand-50 to-purple-50 flex items-center justify-center p-4';

  // ── Loading ──────────────────────────────────────────────────────────────────
  if (status === 'loading') {
    return (
      <div className={bgGradient}>
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-brand-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-500">Loading your appointment…</p>
        </div>
      </div>
    );
  }

  // ── Error ────────────────────────────────────────────────────────────────────
  if (status === 'error') {
    return (
      <div className={bgGradient}>
        <div className="bg-white rounded-2xl shadow-lg max-w-md w-full p-8 text-center">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <XCircle className="w-8 h-8 text-red-500" />
          </div>
          <h1 className="text-xl font-bold text-gray-900 mb-2">Unable to process request</h1>
          <p className="text-gray-500 mb-6">{message}</p>
          <p className="text-sm text-gray-400">
            Need help? Email us at{' '}
            <a href="mailto:bookings@probookhq.com" className="text-brand-600 hover:underline">
              bookings@probookhq.com
            </a>
          </p>
        </div>
      </div>
    );
  }

  // ── Success (cancel only — reschedule redirects) ──────────────────────────────
  if (status === 'success') {
    return (
      <div className={bgGradient}>
        <div className="bg-white rounded-2xl shadow-lg max-w-md w-full p-8 text-center">
          {/* Logo */}
          <div className="flex items-center justify-center gap-2 mb-8">
            <div className="w-9 h-9 bg-brand-500 rounded-xl flex items-center justify-center">
              <Zap className="w-5 h-5 text-white fill-white" />
            </div>
            <span className="text-xl font-black text-brand-500">Pro</span>
            <span className="text-xl font-light text-gray-800 -ml-1">Book</span>
          </div>

          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="w-8 h-8 text-green-500" />
          </div>
          <h1 className="text-xl font-bold text-gray-900 mb-2">Appointment cancelled</h1>
          {message === 'contact_us' ? (
            <p className="text-gray-500 mb-6">
              Your appointment has been cancelled. To book a new time, please contact us directly at{' '}
              <a href="mailto:bookings@probookhq.com" className="text-brand-600 hover:underline font-semibold">
                bookings@probookhq.com
              </a>
            </p>
          ) : (
            <p className="text-gray-500 mb-6">
              Your appointment has been cancelled. We've sent a new booking link to your email so you can reschedule whenever you're ready.
            </p>
          )}
          <p className="text-sm text-gray-400">
            Questions?{' '}
            <a href="mailto:bookings@probookhq.com" className="text-brand-500 hover:underline">
              bookings@probookhq.com
            </a>
          </p>
        </div>
      </div>
    );
  }

  // ── Kept ─────────────────────────────────────────────────────────────────────
  if (status === 'kept') {
    return (
      <div className={bgGradient}>
        <div className="bg-white rounded-2xl shadow-lg max-w-md w-full p-8 text-center">
          <div className="flex items-center justify-center gap-2 mb-8">
            <div className="w-9 h-9 bg-brand-500 rounded-xl flex items-center justify-center">
              <Zap className="w-5 h-5 text-white fill-white" />
            </div>
            <span className="text-xl font-black text-brand-500">Pro</span>
            <span className="text-xl font-light text-gray-800 -ml-1">Book</span>
          </div>
          <div className="w-16 h-16 bg-brand-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="w-8 h-8 text-brand-500" />
          </div>
          <h1 className="text-xl font-bold text-gray-900 mb-2">You're all set!</h1>
          <p className="text-gray-500 mb-4">
            Your appointment with <strong>{appt?.contractor_name}</strong> is still on.
          </p>
          {appt && (
            <div className="bg-brand-50 rounded-xl border-l-4 border-brand-500 p-4 text-left mb-6">
              <div className="flex items-center gap-2 text-gray-800 font-semibold mb-1">
                <Calendar className="w-4 h-4 text-brand-500" />
                {fmtDate(appt.scheduled_date)}
              </div>
              <div className="flex items-center gap-2 text-gray-800 font-semibold">
                <Clock className="w-4 h-4 text-brand-500" />
                {fmtTime(appt.scheduled_time)}
              </div>
            </div>
          )}
          <p className="text-xs text-gray-400">
            Need to make a change later? Use the links in your confirmation email or contact{' '}
            <a href="mailto:bookings@probookhq.com" className="text-brand-500 hover:underline">
              bookings@probookhq.com
            </a>
          </p>
        </div>
      </div>
    );
  }

  // ── Confirm step ─────────────────────────────────────────────────────────────
  return (
    <div className={bgGradient}>
      <div className="bg-white rounded-2xl shadow-lg max-w-md w-full overflow-hidden">

        {/* Header */}
        <div className="px-8 pt-8 pb-6 text-center border-b border-gray-100">
          <div className="flex items-center justify-center gap-2 mb-6">
            <div className="w-9 h-9 bg-brand-500 rounded-xl flex items-center justify-center">
              <Zap className="w-5 h-5 text-white fill-white" />
            </div>
            <span className="text-xl font-black text-brand-500">Pro</span>
            <span className="text-xl font-light text-gray-800 -ml-1">Book</span>
          </div>

          <div className="w-14 h-14 bg-amber-50 rounded-full flex items-center justify-center mx-auto mb-4">
            <AlertTriangle className="w-7 h-7 text-amber-500" />
          </div>
          <h1 className="text-xl font-bold text-gray-900 mb-1">
            {isReschedule ? 'Reschedule your appointment?' : 'Cancel your appointment?'}
          </h1>
          <p className="text-sm text-gray-500">
            {isReschedule
              ? 'Your current appointment will be cancelled and you\'ll pick a new time.'
              : 'This action cannot be undone. You\'ll receive a new booking link by email.'}
          </p>
        </div>

        {/* Appointment details */}
        <div className="px-8 py-6">
          <div className="bg-brand-50 rounded-xl border-l-4 border-brand-500 p-4 mb-6">
            <p className="text-xs font-bold text-brand-600 uppercase tracking-widest mb-3">
              {isReschedule ? 'Current appointment' : 'Appointment to cancel'}
            </p>
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-gray-800 font-semibold">
                <Calendar className="w-4 h-4 text-brand-500 shrink-0" />
                {fmtDate(appt.scheduled_date)}
              </div>
              <div className="flex items-center gap-2 text-gray-800 font-semibold">
                <Clock className="w-4 h-4 text-brand-500 shrink-0" />
                {fmtTime(appt.scheduled_time)}
              </div>
              <p className="text-sm text-gray-500 pt-1">with <strong>{appt.contractor_name}</strong></p>
            </div>
          </div>

          {/* Action buttons */}
          <div className="space-y-3">
            <button
              onClick={handleConfirm}
              disabled={working}
              className={`w-full py-3 px-4 rounded-xl font-bold text-white transition-all
                ${isReschedule
                  ? 'bg-brand-500 hover:bg-brand-600 disabled:bg-brand-300'
                  : 'bg-red-500 hover:bg-red-600 disabled:bg-red-300'}
              `}
            >
              {working
                ? (isReschedule ? 'Loading calendar…' : 'Cancelling…')
                : (isReschedule ? 'Yes, pick a new time' : 'Yes, cancel my appointment')}
            </button>

            <button
              onClick={() => setStatus('kept')}
              disabled={working}
              className="w-full py-3 px-4 rounded-xl font-semibold text-gray-600 bg-gray-100 hover:bg-gray-200 transition-all disabled:opacity-50"
            >
              Keep my appointment
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="px-8 pb-6 text-center">
          <p className="text-xs text-gray-400">
            Need help?{' '}
            <a href="mailto:bookings@probookhq.com" className="text-brand-500 hover:underline">
              bookings@probookhq.com
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
