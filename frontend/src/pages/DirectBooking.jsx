import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { format, addDays, parseISO } from 'date-fns';
import toast from 'react-hot-toast';
import api from '../api/client';
import { Calendar, Clock, CheckCircle, ChevronLeft, ChevronRight, ArrowRight, User, Mail, Phone } from 'lucide-react';

const LOOKAHEAD_DAYS = 14;

function groupByDate(slots) {
  return slots.reduce((acc, s) => {
    if (!acc[s.date]) acc[s.date] = [];
    acc[s.date].push(s.time);
    return acc;
  }, {});
}

function fmtTime(time) {
  const [h, m] = time.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const hour = h % 12 || 12;
  return `${hour}:${String(m).padStart(2, '0')} ${period}`;
}

export default function DirectBooking() {
  const { slug } = useParams();

  // Form state
  const [name, setName]   = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [notes, setNotes] = useState('');

  // Picker state
  const [step, setStep]               = useState('form');   // 'form' | 'pick' | 'confirmed'
  const [selectedDate, setSelectedDate] = useState(null);
  const [selectedTime, setSelectedTime] = useState(null);
  const [weekOffset, setWeekOffset]     = useState(0);

  const now        = new Date();
  const from       = format(addDays(now, weekOffset * 7), 'yyyy-MM-dd');
  const to         = format(addDays(now, weekOffset * 7 + LOOKAHEAD_DAYS - 1), 'yyyy-MM-dd');
  const clientDate = format(now, 'yyyy-MM-dd');
  const clientTime = format(now, 'HH:mm');

  // Load contractor by slug
  const { data: contractor, isLoading: ctxLoading, isError: ctxError } = useQuery({
    queryKey: ['contractor-slug', slug],
    queryFn: () => api.get(`/contractors/public/${slug}`).then(r => r.data),
    retry: false,
  });

  // Open slots
  const { data: slots = [], isLoading: slotsLoading } = useQuery({
    queryKey: ['open-slots-direct', contractor?.id, from, to],
    queryFn: () => api.get(
      `/availability/${contractor.id}/open-slots?from=${from}&to=${to}&clientDate=${clientDate}&clientTime=${clientTime}`
    ).then(r => r.data),
    enabled: !!contractor?.id && step === 'pick',
  });

  const slotsByDate    = groupByDate(slots);
  const availableDates = Object.keys(slotsByDate).sort();

  const bookMutation = useMutation({
    mutationFn: () => api.post('/bookings/book-direct', {
      contractor_id: contractor.id,
      name, email, phone, notes,
      date: selectedDate,
      time: selectedTime,
    }),
    onSuccess: () => setStep('confirmed'),
    onError: (err) => toast.error(err.response?.data?.error || 'Booking failed. Please try another time.'),
  });

  const handleFormSubmit = (e) => {
    e.preventDefault();
    if (!name.trim() || !email.trim()) return;
    setStep('pick');
  };

  // ── Loading ──────────────────────────────────────────────────────────────────
  if (ctxLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-brand-50 to-purple-50 flex items-center justify-center w-full overflow-x-hidden">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-brand-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-500">Loading booking page...</p>
        </div>
      </div>
    );
  }

  // ── Not found ────────────────────────────────────────────────────────────────
  if (ctxError || !contractor) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-brand-50 to-purple-50 flex items-center justify-center p-4 w-full overflow-x-hidden">
        <div className="card max-w-md w-full text-center">
          <div className="w-14 h-14 bg-red-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <span className="text-2xl">⚠️</span>
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">Page Not Found</h2>
          <p className="text-gray-500 text-sm">This booking page doesn't exist or is no longer active.</p>
        </div>
      </div>
    );
  }

  const displayName = contractor.company_name || contractor.name;

  // ── Confirmed ────────────────────────────────────────────────────────────────
  if (step === 'confirmed') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-50 to-emerald-50 flex items-center justify-center p-4 w-full overflow-x-hidden">
        <div className="card max-w-md w-full text-center shadow-xl">
          <div className="w-16 h-16 bg-green-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="w-8 h-8 text-green-600" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">You're booked! 🎉</h2>
          <p className="text-gray-500 mb-4">Looking forward to talking with you, {name.split(' ')[0]}.</p>
          <div className="bg-green-50 rounded-xl p-4 mb-4 text-left">
            <p className="text-sm text-green-700 font-medium mb-2">Appointment details</p>
            <p className="font-bold text-green-900">
              {format(parseISO(selectedDate), 'EEEE, MMMM d, yyyy')}
            </p>
            <p className="text-green-700 font-medium">{fmtTime(selectedTime)}</p>
            <p className="text-green-600 text-sm mt-1">with {displayName}</p>
          </div>
          <p className="text-sm text-gray-400">A confirmation email has been sent to {email}.</p>
        </div>
      </div>
    );
  }

  // ── Header (shared between steps) ────────────────────────────────────────────
  const PageHeader = () => (
    <div className="text-center mb-8">
      <img src="/probook-icon-128.png" alt="Tractify" className="w-12 h-12 rounded-2xl shadow-lg mb-3 mx-auto" />
      <h1 className="text-2xl font-bold text-gray-900">Book a call with {displayName}</h1>
      <p className="text-gray-500 text-sm mt-1">Pick a time that works for you. No back-and-forth.</p>
    </div>
  );

  // ── Step 1: Contact form ──────────────────────────────────────────────────────
  if (step === 'form') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-brand-50 via-white to-purple-50 py-8 px-4 w-full overflow-x-hidden">
        <div className="max-w-md mx-auto">
          <PageHeader />
          <div className="card shadow-lg">
            <h3 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
              <User className="w-5 h-5 text-brand-500" />
              Your info
            </h3>
            <form onSubmit={handleFormSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Name <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="Your full name"
                  className="input w-full"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Email <span className="text-red-400">*</span>
                </label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="input w-full"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                <input
                  type="tel"
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  placeholder="(optional)"
                  className="input w-full"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Anything you'd like to share ahead of the call?
                </label>
                <textarea
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  placeholder="Optional"
                  rows={3}
                  className="input w-full resize-none"
                />
              </div>
              <button type="submit" className="btn-primary w-full justify-center py-3 text-base mt-2">
                Pick a Time
                <ArrowRight className="w-5 h-5" />
              </button>
            </form>
          </div>
          <p className="text-center text-xs text-gray-400 mt-4">Powered by Tractify</p>
        </div>
      </div>
    );
  }

  // ── Step 2: Date + time picker ────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-50 via-white to-purple-50 py-8 px-4 w-full overflow-x-hidden">
      <div className="max-w-2xl mx-auto">
        <PageHeader />
        <div className="card shadow-lg">
          {/* Back + date header */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <button
                onClick={() => { setStep('form'); setSelectedDate(null); setSelectedTime(null); }}
                className="btn-secondary p-1.5"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <h3 className="font-semibold flex items-center gap-2">
                <Calendar className="w-5 h-5 text-brand-500" />
                Select a Date
              </h3>
            </div>
            <div className="flex gap-1">
              <button
                onClick={() => setWeekOffset(w => Math.max(0, w - 1))}
                disabled={weekOffset === 0}
                className="btn-secondary p-1.5 disabled:opacity-30"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button onClick={() => setWeekOffset(w => w + 1)} className="btn-secondary p-1.5">
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Booking summary pill */}
          <div className="bg-brand-50 rounded-xl px-4 py-2 mb-4 flex items-center gap-3 text-sm">
            <User className="w-4 h-4 text-brand-400 shrink-0" />
            <span className="text-brand-700 font-medium truncate">{name}</span>
            <span className="text-brand-400">·</span>
            <Mail className="w-4 h-4 text-brand-400 shrink-0" />
            <span className="text-brand-600 truncate">{email}</span>
          </div>

          {slotsLoading ? (
            <div className="flex justify-center py-8">
              <div className="w-8 h-8 border-4 border-brand-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : availableDates.length === 0 ? (
            <div className="text-center py-8 text-gray-400">
              <Calendar className="w-10 h-10 mx-auto mb-2 opacity-40" />
              <p>No available slots in this period. Try the next week.</p>
            </div>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 mb-6">
              {availableDates.map(date => {
                const d = parseISO(date);
                const isSelected = date === selectedDate;
                return (
                  <button
                    key={date}
                    onClick={() => { setSelectedDate(date); setSelectedTime(null); }}
                    className={`p-3 rounded-xl text-center transition-all border-2 ${
                      isSelected
                        ? 'border-brand-500 bg-brand-500 text-white shadow-md'
                        : 'border-gray-100 bg-white hover:border-brand-300 text-gray-700'
                    }`}
                  >
                    <p className={`text-xs font-medium ${isSelected ? 'text-brand-100' : 'text-gray-400'}`}>
                      {format(d, 'EEE')}
                    </p>
                    <p className="text-lg font-bold">{format(d, 'd')}</p>
                    <p className={`text-xs ${isSelected ? 'text-brand-100' : 'text-gray-400'}`}>
                      {format(d, 'MMM')}
                    </p>
                  </button>
                );
              })}
            </div>
          )}

          {/* Time picker */}
          {selectedDate && slotsByDate[selectedDate] && (
            <>
              <hr className="border-gray-100 mb-5" />
              <h3 className="font-semibold flex items-center gap-2 mb-4">
                <Clock className="w-5 h-5 text-brand-500" />
                Select a Time for {format(parseISO(selectedDate), 'MMMM d')}
              </h3>
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 mb-6">
                {slotsByDate[selectedDate].map(time => {
                  const isSelected = time === selectedTime;
                  return (
                    <button
                      key={time}
                      onClick={() => setSelectedTime(time)}
                      className={`py-2.5 rounded-xl text-sm font-medium transition-all border-2 ${
                        isSelected
                          ? 'border-brand-500 bg-brand-500 text-white shadow-md'
                          : 'border-gray-100 bg-white hover:border-brand-300 text-gray-700'
                      }`}
                    >
                      {fmtTime(time)}
                    </button>
                  );
                })}
              </div>
            </>
          )}

          {/* Confirm panel */}
          {selectedDate && selectedTime && (
            <>
              <hr className="border-gray-100 mb-5" />
              <div className="bg-brand-50 rounded-xl p-4 mb-4">
                <p className="text-sm text-brand-700 font-medium">Selected time:</p>
                <p className="font-bold text-brand-900">
                  {format(parseISO(selectedDate), 'EEEE, MMMM d, yyyy')} at {fmtTime(selectedTime)}
                </p>
                <p className="text-brand-600 text-sm mt-0.5">with {displayName}</p>
              </div>
              <button
                onClick={() => bookMutation.mutate()}
                disabled={bookMutation.isPending}
                className="btn-primary w-full justify-center py-3 text-base"
              >
                <CheckCircle className="w-5 h-5" />
                {bookMutation.isPending ? 'Confirming...' : 'Confirm Booking'}
              </button>
            </>
          )}
        </div>
        <p className="text-center text-xs text-gray-400 mt-4">Powered by Tractify</p>
      </div>
    </div>
  );
}
