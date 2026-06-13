import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format, addDays, startOfWeek, parseISO, isBefore, startOfDay } from 'date-fns';
import toast from 'react-hot-toast';
import api from '../api/client';
import {
  Calendar, Clock, CheckCircle, XCircle, LogOut, Zap,
  ChevronLeft, ChevronRight, Phone, Mail,
  Link as LinkIcon, Settings, Lock, User
} from 'lucide-react';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const HOURS = Array.from({ length: 18 }, (_, i) => {
  const h = i + 6; // 6am–11pm
  return `${String(h).padStart(2, '0')}:00`;
});

const STATUS_COLORS = {
  confirmed: 'bg-green-100 text-green-700',
  pending: 'bg-yellow-100 text-yellow-700',
  cancelled: 'bg-red-100 text-red-700',
  completed: 'bg-gray-100 text-gray-600',
};

export default function ContractorPortal() {
  const user = JSON.parse(localStorage.getItem('user'));
  const qc = useQueryClient();
  const [tab, setTab] = useState('calendar');
  const [weekStart, setWeekStart] = useState(startOfWeek(new Date()));
  const [confirmCancelId, setConfirmCancelId] = useState(null);
  const [pwForm, setPwForm] = useState({ current: '', next: '', confirm: '' });
  const [profileForm, setProfileForm] = useState({ name: user.name || '', phone: user.phone || '', company_name: user.company_name || '' });

  const from = format(weekStart, 'yyyy-MM-dd');
  const to   = format(addDays(weekStart, 6), 'yyyy-MM-dd');

  const { data: appointments = [] } = useQuery({
    queryKey: ['appointments', user.id, from, to],
    queryFn: () => api.get(`/bookings/contractor/${user.id}?from=${from}&to=${to}`).then(r => r.data),
  });

  const { data: slots = [] } = useQuery({
    queryKey: ['slots', user.id],
    queryFn: () => api.get(`/availability/${user.id}/slots`).then(r => r.data),
  });

  const [availability, setAvailability] = useState({});

  useEffect(() => {
    // Build map: dayOfWeek -> { startTime, endTime }
    const map = {};
    slots.forEach(s => { map[s.day_of_week] = { start: s.start_time, end: s.end_time }; });
    setAvailability(map);
  }, [slots]);

  const saveAvailability = useMutation({
    mutationFn: () => {
      const payload = Object.entries(availability).map(([day, val]) => ({
        day_of_week: Number(day),
        start_time: val.start,
        end_time: val.end,
      }));
      return api.put(`/availability/${user.id}/slots`, payload);
    },
    onSuccess: () => { toast.success('Availability saved!'); qc.invalidateQueries(['slots']); },
    onError: () => toast.error('Failed to save availability'),
  });

  const cancelAppt = useMutation({
    mutationFn: (id) => api.put(`/bookings/${id}/cancel`),
    onSuccess: () => { toast.success('Appointment cancelled — homeowner notified'); qc.invalidateQueries(['appointments']); setConfirmCancelId(null); },
    onError: () => toast.error('Failed to cancel'),
  });

  const completeAppt = useMutation({
    mutationFn: (id) => api.put(`/bookings/${id}/complete`),
    onSuccess: () => { toast.success('Marked as complete!'); qc.invalidateQueries(['appointments']); },
    onError: () => toast.error('Failed to update'),
  });

  const updateProfile = useMutation({
    mutationFn: (data) => api.put(`/contractors/${user.id}`, data),
    onSuccess: () => { toast.success('Profile updated!'); },
    onError: () => toast.error('Failed to update profile'),
  });

  const changePassword = useMutation({
    mutationFn: (data) => api.put(`/contractors/${user.id}/password`, data),
    onSuccess: () => { toast.success('Password changed!'); setPwForm({ current: '', next: '', confirm: '' }); },
    onError: (err) => toast.error(err.response?.data?.error || 'Failed to change password'),
  });

  const handleChangePassword = () => {
    if (pwForm.next.length < 6) return toast.error('Password must be at least 6 characters');
    if (pwForm.next !== pwForm.confirm) return toast.error('Passwords do not match');
    changePassword.mutate({ current_password: pwForm.current, new_password: pwForm.next });
  };

  const connectGoogle = async () => {
    try {
      const res = await api.get(`/auth/google/connect/${user.id}`);
      window.location.href = res.data.url;
    } catch { toast.error('Failed to connect Google Calendar'); }
  };

  const logout = () => {
    localStorage.clear();
    window.location.href = '/login';
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-100 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-brand-500 rounded-xl flex items-center justify-center">
              <Zap className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="font-semibold text-gray-900 leading-none">ProBook</p>
              <p className="text-xs text-gray-400">{user.company_name || user.name}</p>
            </div>
          </div>

          <nav className="flex gap-1">
            {[
              { id: 'calendar', label: 'Calendar', icon: Calendar },
              { id: 'availability', label: 'Availability', icon: Clock },
              { id: 'settings', label: 'Settings', icon: Settings },
            ].map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setTab(id)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                  tab === id ? 'bg-brand-50 text-brand-600' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span className="hidden sm:inline">{label}</span>
              </button>
            ))}
          </nav>

          <button onClick={logout} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 px-3 py-2 rounded-lg hover:bg-gray-50">
            <LogOut className="w-4 h-4" />
            <span className="hidden sm:inline">Logout</span>
          </button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6">
        {/* ── CALENDAR TAB ── */}
        {tab === 'calendar' && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">
                {format(weekStart, 'MMMM d')} – {format(addDays(weekStart, 6), 'MMMM d, yyyy')}
              </h2>
              <div className="flex gap-2">
                <button onClick={() => setWeekStart(d => addDays(d, -7))} className="btn-secondary p-2">
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button onClick={() => setWeekStart(startOfWeek(new Date()))} className="btn-secondary px-3 py-2 text-sm">Today</button>
                <button onClick={() => setWeekStart(d => addDays(d, 7))} className="btn-secondary p-2">
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Week grid */}
            <div className="card p-0 overflow-hidden">
              <div className="grid grid-cols-8 border-b border-gray-100">
                <div className="p-3 text-xs text-gray-400 font-medium border-r border-gray-100">Time</div>
                {Array.from({ length: 7 }, (_, i) => {
                  const day = addDays(weekStart, i);
                  const isToday = format(day, 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd');
                  const isPast = isBefore(startOfDay(day), startOfDay(new Date()));
                  return (
                    <div key={i} className={`p-3 text-center border-r border-gray-100 last:border-r-0 ${isToday ? 'bg-brand-50' : isPast ? 'bg-gray-50' : ''}`}>
                      <p className={`text-xs font-medium ${isToday ? 'text-brand-600' : isPast ? 'text-gray-300' : 'text-gray-500'}`}>{DAYS[day.getDay()]}</p>
                      <p className={`text-sm font-bold ${isToday ? 'text-brand-600' : isPast ? 'text-gray-300' : 'text-gray-800'}`}>{format(day, 'd')}</p>
                    </div>
                  );
                })}
              </div>

              <div className="overflow-y-auto max-h-[520px]">
                {HOURS.map(hour => (
                  <div key={hour} className="grid grid-cols-8 border-b border-gray-50 last:border-b-0 min-h-[52px]">
                    <div className="p-2 text-xs text-gray-400 border-r border-gray-100 flex items-start pt-2">{hour}</div>
                    {Array.from({ length: 7 }, (_, i) => {
                      const day = addDays(weekStart, i);
                      const isPast = isBefore(startOfDay(day), startOfDay(new Date()));
                      const dateStr = format(day, 'yyyy-MM-dd');
                      const appt = appointments.find(a => a.scheduled_date === dateStr && a.scheduled_time === hour);
                      return (
                        <div key={i} className={`p-1 border-r border-gray-50 last:border-r-0 ${isPast ? 'bg-gray-50/60' : ''}`}>
                          {appt && (
                            <div className={`rounded-lg p-1.5 text-xs cursor-pointer hover:opacity-80 ${STATUS_COLORS[appt.status] || 'bg-brand-100 text-brand-700'}`}>
                              <p className="font-semibold truncate">{appt.lead_name}</p>
                              <p className="opacity-70 truncate">{appt.niche_name}</p>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>

            {/* Appointment list */}
            <div className="mt-6">
              {appointments.filter(a => a.status !== 'cancelled').length === 0 ? (
                <div className="card text-center py-10">
                  <Calendar className="w-10 h-10 text-gray-200 mx-auto mb-3" />
                  <p className="text-gray-400 font-medium">No appointments this week</p>
                  <p className="text-gray-300 text-sm mt-1">New bookings will appear here automatically.</p>
                </div>
              ) : (
                <>
                  <h3 className="font-semibold text-gray-700 mb-3">This Week's Appointments</h3>
                  <div className="space-y-3">
                    {appointments.filter(a => a.status !== 'cancelled').map(appt => (
                      <div key={appt.id} className="card flex items-start justify-between gap-4">
                        <div className="flex gap-4 flex-1 min-w-0">
                          <div className="text-center min-w-[56px]">
                            <p className="text-xs text-gray-500">{format(parseISO(appt.scheduled_date), 'EEE')}</p>
                            <p className="text-xl font-bold text-brand-600">{format(parseISO(appt.scheduled_date), 'd')}</p>
                            <p className="text-xs font-medium text-gray-600">{appt.scheduled_time}</p>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-gray-900">{appt.lead_name}</p>
                            <p className="text-sm text-gray-500 mb-2">{appt.niche_name}</p>
                            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
                              {appt.lead_email && <span className="flex items-center gap-1"><Mail className="w-3 h-3" />{appt.lead_email}</span>}
                              {appt.lead_phone && <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{appt.lead_phone}</span>}
                            </div>
                            {appt.lead_description && <p className="text-xs text-gray-400 mt-1">{appt.lead_description}</p>}
                          </div>
                        </div>
                        <div className="flex flex-col gap-2 shrink-0 items-end">
                          <span className={`badge ${STATUS_COLORS[appt.status]}`}>{appt.status}</span>
                          {appt.status === 'confirmed' && (
                            <div className="flex gap-1">
                              <button
                                onClick={() => completeAppt.mutate(appt.id)}
                                disabled={completeAppt.isPending}
                                className="p-1.5 text-green-600 hover:bg-green-50 rounded-lg disabled:opacity-50"
                                title="Mark complete"
                              >
                                <CheckCircle className="w-4 h-4" />
                              </button>
                              {confirmCancelId === appt.id ? (
                                <div className="flex items-center gap-1">
                                  <button
                                    onClick={() => cancelAppt.mutate(appt.id)}
                                    disabled={cancelAppt.isPending}
                                    className="text-xs bg-red-500 text-white px-2 py-1 rounded font-medium hover:bg-red-600 disabled:opacity-50"
                                  >
                                    {cancelAppt.isPending ? '...' : 'Confirm'}
                                  </button>
                                  <button onClick={() => setConfirmCancelId(null)} className="text-xs text-gray-400 hover:text-gray-600 px-1">✕</button>
                                </div>
                              ) : (
                                <button
                                  onClick={() => setConfirmCancelId(appt.id)}
                                  className="p-1.5 text-red-400 hover:bg-red-50 rounded-lg"
                                  title="Cancel"
                                >
                                  <XCircle className="w-4 h-4" />
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* ── AVAILABILITY TAB ── */}
        {tab === 'availability' && (
          <div className="max-w-2xl">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-lg font-semibold">Weekly Availability</h2>
                <p className="text-sm text-gray-500">Set the days and hours you're available for appointments</p>
              </div>
              <button onClick={() => saveAvailability.mutate()} disabled={saveAvailability.isPending} className="btn-primary">
                {saveAvailability.isPending ? 'Saving...' : 'Save Changes'}
              </button>
            </div>

            <div className="card space-y-4">
              {DAYS.map((day, idx) => {
                const active = !!availability[idx];
                const val = availability[idx] || { start: '09:00', end: '17:00' };
                return (
                  <div key={idx} className={`flex items-center gap-4 p-3 rounded-xl transition-all ${active ? 'bg-brand-50' : 'bg-gray-50'}`}>
                    <label className="flex items-center gap-3 w-24 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={active}
                        onChange={e => {
                          if (e.target.checked) setAvailability(p => ({ ...p, [idx]: { start: '09:00', end: '17:00' } }));
                          else setAvailability(p => { const n = { ...p }; delete n[idx]; return n; });
                        }}
                        className="w-4 h-4 accent-brand-500"
                      />
                      <span className={`text-sm font-medium ${active ? 'text-brand-700' : 'text-gray-400'}`}>{day}</span>
                    </label>

                    {active ? (
                      <div className="flex items-center gap-2 flex-1">
                        <select
                          value={val.start}
                          onChange={e => setAvailability(p => ({ ...p, [idx]: { ...val, start: e.target.value } }))}
                          className="input py-1.5 w-auto"
                        >
                          {HOURS.map(h => <option key={h}>{h}</option>)}
                        </select>
                        <span className="text-gray-400 text-sm">to</span>
                        <select
                          value={val.end}
                          onChange={e => setAvailability(p => ({ ...p, [idx]: { ...val, end: e.target.value } }))}
                          className="input py-1.5 w-auto"
                        >
                          {HOURS.map(h => <option key={h}>{h}</option>)}
                        </select>
                      </div>
                    ) : (
                      <span className="text-sm text-gray-400">Not available</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── SETTINGS TAB ── */}
        {tab === 'settings' && (
          <div className="max-w-lg space-y-6">
            <h2 className="text-lg font-semibold">Settings</h2>

            {/* Profile */}
            <div className="card">
              <div className="flex items-center gap-2 mb-4">
                <User className="w-4 h-4 text-brand-500" />
                <h3 className="font-semibold text-gray-900">Profile</h3>
              </div>
              <div className="space-y-3">
                <div>
                  <label className="label">Full Name</label>
                  <input className="input" value={profileForm.name} onChange={e => setProfileForm(p => ({ ...p, name: e.target.value }))} />
                </div>
                <div>
                  <label className="label">Company Name</label>
                  <input className="input" value={profileForm.company_name} onChange={e => setProfileForm(p => ({ ...p, company_name: e.target.value }))} />
                </div>
                <div>
                  <label className="label">Phone</label>
                  <input className="input" value={profileForm.phone} onChange={e => setProfileForm(p => ({ ...p, phone: e.target.value }))} />
                </div>
                <div>
                  <label className="label">Email</label>
                  <input className="input bg-gray-50 cursor-not-allowed" value={user.email} disabled />
                  <p className="text-xs text-gray-400 mt-1">Contact admin to change your email.</p>
                </div>
                <button
                  onClick={() => updateProfile.mutate(profileForm)}
                  disabled={updateProfile.isPending}
                  className="btn-primary"
                >
                  {updateProfile.isPending ? 'Saving...' : 'Save Profile'}
                </button>
              </div>
            </div>

            {/* Password */}
            <div className="card">
              <div className="flex items-center gap-2 mb-4">
                <Lock className="w-4 h-4 text-brand-500" />
                <h3 className="font-semibold text-gray-900">Change Password</h3>
              </div>
              <div className="space-y-3">
                <div>
                  <label className="label">Current Password</label>
                  <input type="password" className="input" value={pwForm.current} onChange={e => setPwForm(p => ({ ...p, current: e.target.value }))} />
                </div>
                <div>
                  <label className="label">New Password</label>
                  <input type="password" className="input" value={pwForm.next} onChange={e => setPwForm(p => ({ ...p, next: e.target.value }))} />
                </div>
                <div>
                  <label className="label">Confirm New Password</label>
                  <input type="password" className="input" value={pwForm.confirm} onChange={e => setPwForm(p => ({ ...p, confirm: e.target.value }))} />
                </div>
                <button
                  onClick={handleChangePassword}
                  disabled={changePassword.isPending}
                  className="btn-primary"
                >
                  {changePassword.isPending ? 'Updating...' : 'Update Password'}
                </button>
              </div>
            </div>

            {/* Google Calendar */}
            <div className="card">
              <div className="flex items-center gap-2 mb-4">
                <LinkIcon className="w-4 h-4 text-brand-500" />
                <h3 className="font-semibold text-gray-900">Google Calendar Sync</h3>
              </div>
              <p className="text-sm text-gray-500 mb-3">Connect your Google Calendar so booked appointments are added automatically.</p>
              <button onClick={connectGoogle} className="btn-secondary gap-2">
                <LinkIcon className="w-4 h-4" />
                Connect Google Calendar
              </button>
              {new URLSearchParams(window.location.search).get('gcal') === 'success' && (
                <p className="text-green-600 text-sm mt-2 flex items-center gap-1"><CheckCircle className="w-4 h-4" /> Connected!</p>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
