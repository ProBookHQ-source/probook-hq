import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { format, addDays, parseISO } from 'date-fns';
import toast from 'react-hot-toast';
import api from '../api/client';
import { Calendar, Clock, CheckCircle, ChevronLeft, ChevronRight } from 'lucide-react';

const LOOKAHEAD_DAYS = 14;

function groupByDate(slots) {
  return slots.reduce((acc, s) => {
    if (!acc[s.date]) acc[s.date] = [];
    acc[s.date].push(s.time);
    return acc;
  }, {});
}

export default function BookingFlow() {
  const { token } = useParams();
  const [selectedDate, setSelectedDate] = useState(null);
  const [selectedTime, setSelectedTime] = useState(null);
  const [confirmed, setConfirmed] = useState(false);
  const [weekOffset, setWeekOffset] = useState(0);

  const now  = new Date();
  const from = format(addDays(now, weekOffset * 7), 'yyyy-MM-dd');
  const to   = format(addDays(now, weekOffset * 7 + LOOKAHEAD_DAYS - 1), 'yyyy-MM-dd');
  // Send client's local date + time so the backend can correctly filter past slots
  const clientDate = format(now, 'yyyy-MM-dd');
  const clientTime = format(now, 'HH:mm');

  // Validate the token and get lead info
  const { data: tokenData, isLoading: tokenLoading, isError: tokenError } = useQuery({
    queryKey: ['booking-token', token],
    queryFn: () => api.get(`/bookings/validate-token/${token}`).then(r => r.data),
    retry: false,
  });

  // Get open slots for the matched contractor
  const { data: slots = [], isLoading: slotsLoading } = useQuery({
    queryKey: ['open-slots', tokenData?.contractor_id, from, to],
    queryFn: () => api.get(`/availability/${tokenData.contractor_id}/open-slots?from=${from}&to=${to}&clientDate=${clientDate}&clientTime=${clientTime}`).then(r => r.data),
    enabled: !!tokenData?.contractor_id,
  });

  const slotsByDate = groupByDate(slots);
  const availableDates = Object.keys(slotsByDate).sort();

  const bookMutation = useMutation({
    mutationFn: () => api.post('/bookings/book', { token, date: selectedDate, time: selectedTime }),
    onSuccess: () => setConfirmed(true),
    onError: (err) => toast.error(err.response?.data?.error || 'Booking failed. Please try another time.'),
  });

  if (tokenLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-brand-50 to-purple-50 flex items-center justify-center w-full max-w-full overflow-x-hidden">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-brand-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-500">Loading your booking page...</p>
        </div>
      </div>
    );
  }

  if (tokenError) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-brand-50 to-purple-50 flex items-center justify-center p-4 w-full max-w-full overflow-x-hidden">
        <div className="card max-w-md w-full text-center">
          <div className="w-14 h-14 bg-red-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <span className="text-2xl">⚠️</span>
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">Link Expired</h2>
          <p className="text-gray-500 text-sm">This booking link has expired or already been used. Please contact us for a new one.</p>
        </div>
      </div>
    );
  }

  if (confirmed) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-50 to-emerald-50 flex items-center justify-center p-4 w-full max-w-full overflow-x-hidden">
        <div className="card max-w-md w-full text-center shadow-xl">
          <div className="w-16 h-16 bg-green-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="w-8 h-8 text-green-600" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">You're booked! 🎉</h2>
          <p className="text-gray-500 mb-4">Your appointment is confirmed for</p>
          <div className="bg-green-50 rounded-xl p-4 mb-4">
            <p className="text-lg font-bold text-green-700">
              {format(parseISO(selectedDate), 'EEEE, MMMM d, yyyy')}
            </p>
            <p className="text-green-600 font-medium">
              {(() => {
                const [h, m] = selectedTime.split(':').map(Number);
                const period = h >= 12 ? 'PM' : 'AM';
                const hour = h % 12 || 12;
                return `${hour}:${String(m).padStart(2,'0')} ${period}`;
              })()}
            </p>
          </div>
          <p className="text-sm text-gray-400">A confirmation email has been sent to you and the contractor.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-50 via-white to-purple-50 py-8 px-4 w-full max-w-full overflow-x-hidden">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <img src="/probook-icon-128.png" alt="ProAppt" className="w-12 h-12 rounded-2xl shadow-lg mb-3 mx-auto" />
          <h1 className="text-2xl font-bold text-gray-900">Book Your Appointment</h1>
          {tokenData?.lead_name && (
            <p className="text-gray-500 text-sm mt-1">Hi {tokenData.lead_name}! Pick a time that works for you.</p>
          )}
          {tokenData?.contractor_name && (
            <p className="text-brand-600 font-medium text-sm mt-1">with {tokenData.contractor_company || tokenData.contractor_name}</p>
          )}
        </div>

        <div className="card shadow-lg">
          {/* Date picker */}
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold flex items-center gap-2">
              <Calendar className="w-5 h-5 text-brand-500" />
              Select a Date
            </h3>
            <div className="flex gap-1">
              <button onClick={() => setWeekOffset(w => Math.max(0, w - 1))} disabled={weekOffset === 0} className="btn-secondary p-1.5 disabled:opacity-30">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button onClick={() => setWeekOffset(w => w + 1)} className="btn-secondary p-1.5">
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
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
                  const [h] = time.split(':').map(Number);
                  const label = h >= 12 ? `${h === 12 ? 12 : h - 12}:00 PM` : `${h}:00 AM`;
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
                      {label}
                    </button>
                  );
                })}
              </div>
            </>
          )}

          {/* Confirm */}
          {selectedDate && selectedTime && (
            <>
              <hr className="border-gray-100 mb-5" />
              <div className="bg-brand-50 rounded-xl p-4 mb-4">
                <p className="text-sm text-brand-700 font-medium">Selected appointment:</p>
                <p className="font-bold text-brand-900">
                  {format(parseISO(selectedDate), 'EEEE, MMMM d, yyyy')} at {(() => {
                    const [h, m] = selectedTime.split(':').map(Number);
                    const period = h >= 12 ? 'PM' : 'AM';
                    const hour = h % 12 || 12;
                    return `${hour}:${String(m).padStart(2,'0')} ${period}`;
                  })()}
                </p>
              </div>
              <button
                onClick={() => bookMutation.mutate()}
                disabled={bookMutation.isPending}
                className="btn-primary w-full justify-center py-3 text-base"
              >
                <CheckCircle className="w-5 h-5" />
                {bookMutation.isPending ? 'Confirming...' : 'Confirm Appointment'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
