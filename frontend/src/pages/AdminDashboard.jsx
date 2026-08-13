import { useState, useRef, useEffect } from 'react';
import { formatPhone } from '../utils/formatPhone';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

function fmtTime(t) {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
}
import { format, parseISO } from 'date-fns';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import api from '../api/client';
import {
  LayoutDashboard, Users, FileText, Calendar, LogOut, Zap,
  Plus, RefreshCw, CheckCircle, XCircle, Search, Trash2, Send, Phone, AlignLeft, KeyRound,
  Eye, EyeOff, Copy, ShieldCheck, BarChart2, Shuffle
} from 'lucide-react';

const STATUS_BADGE = {
  new:      'bg-blue-100 text-blue-700',
  matched:  'bg-yellow-100 text-yellow-700',
  booked:   'bg-purple-100 text-purple-700',
  completed:'bg-green-100 text-green-700',
  cancelled:'bg-red-100 text-red-700',
};

export default function AdminDashboard() {
  const user = JSON.parse(localStorage.getItem('user'));
  const [tab, setTab] = useState('overview');
  const [showAddContractor, setShowAddContractor] = useState(false);
  const [showDeclined, setShowDeclined] = useState(false);
  const [leadFilter, setLeadFilter] = useState('');
  const [confirmDeleteLead, setConfirmDeleteLead] = useState(null);
  const [confirmDeleteContractor, setConfirmDeleteContractor] = useState(null);
  const [expandedLead, setExpandedLead] = useState(null);
  const [confirmCancelAppt, setConfirmCancelAppt] = useState(null);
  const [confirmDeleteAppt, setConfirmDeleteAppt] = useState(null);
  const [setPasswordFor, setSetPasswordFor] = useState(null);
  const [newPwValue, setNewPwValue] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [setTwilioFor, setSetTwilioFor] = useState(null);
  const [twilioNumberInput, setTwilioNumberInput] = useState('');
  const [showTempPw, setShowTempPw] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [newKeySlug, setNewKeySlug] = useState('');
  const [newKeyContractor, setNewKeyContractor] = useState('');
  const [newKeyOrigins, setNewKeyOrigins] = useState('');
  const [createdKey, setCreatedKey] = useState(null);
  const [confirmDeleteKey, setConfirmDeleteKey] = useState(null);
  const [showMoreMenu, setShowMoreMenu] = useState(false);

  // ── Admin AI brain chat ──────────────────────────────────────────────────
  const [brainOpen, setBrainOpen] = useState(false);
  const [brainMessages, setBrainMessages] = useState([
    { role: 'assistant', content: "Hey Jose — I have full visibility into the business. What do you want to know? Ask me anything: which contractors are stalled, which channels are converting, which ads drove signups, where to spend today." }
  ]);
  const [brainInput, setBrainInput] = useState('');
  const [brainLoading, setBrainLoading] = useState(false);
  const brainBottomRef = useRef(null);

  useEffect(() => {
    if (brainOpen) brainBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [brainMessages, brainLoading, brainOpen]);

  const sendBrainMessage = async (text) => {
    const msg = (text || brainInput).trim();
    if (!msg || brainLoading) return;
    setBrainInput('');
    const userMsg = { role: 'user', content: msg };
    setBrainMessages(prev => [...prev, userMsg]);
    setBrainLoading(true);
    try {
      const history = brainMessages.map(m => ({ role: m.role, content: m.content }));
      const { data } = await api.post('/admin/ai-chat', { message: msg, history });
      setBrainMessages(prev => [...prev, { role: 'assistant', content: data.reply }]);
      // If brain took an action, refresh affected data automatically
      if (data.action) {
        const t = data.action.type;
        if (t === 'approve_contractor' || t === 'decline_contractor' || t === 'update_contractor' || t === 'set_twilio_number') {
          qc.invalidateQueries({ queryKey: ['admin-contractors'] });
        }
        if (t === 'assign_lead' || t === 'delete_lead') {
          qc.invalidateQueries({ queryKey: ['admin-leads'] });
        }
        if (t === 'cancel_appointment' || t === 'delete_appointment') {
          qc.invalidateQueries({ queryKey: ['admin-appointments'] });
        }
      }
    } catch (err) {
      setBrainMessages(prev => [...prev, { role: 'assistant', content: 'Error reaching the brain. Check Railway logs.' }]);
    } finally {
      setBrainLoading(false);
    }
  };

  const qc = useQueryClient();

  const { data: leads = [] } = useQuery({
    queryKey: ['admin-leads'],
    queryFn: () => api.get('/leads').then(r => r.data),
  });

  const { data: contractors = [] } = useQuery({
    queryKey: ['admin-contractors'],
    queryFn: () => api.get('/contractors').then(r => r.data),
  });

  const pendingContractors  = contractors.filter(c => !c.is_active && c.applied_at && !c.declined_at);
  const declinedContractors = contractors.filter(c => !c.is_active && c.applied_at && c.declined_at);

  const { data: appointments = [] } = useQuery({
    queryKey: ['admin-appointments'],
    queryFn: () => api.get('/bookings').then(r => r.data),
  });

  const { data: niches = [] } = useQuery({
    queryKey: ['niches'],
    queryFn: () => api.get('/leads/meta/niches').then(r => r.data),
  });

  const { data: apiKeys = [] } = useQuery({
    queryKey: ['apikeys'],
    queryFn: () => api.get('/apikeys').then(r => r.data),
  });

  const { data: performance = [] } = useQuery({
    queryKey: ['performance'],
    queryFn: () => api.get('/contractors/admin/performance').then(r => r.data),
    enabled: tab === 'performance',
  });

  const [newNicheName, setNewNicheName] = useState('');
  const [newNicheDesc, setNewNicheDesc] = useState('');
  const [editingNiche, setEditingNiche] = useState(null);
  const [confirmDeleteNiche, setConfirmDeleteNiche] = useState(null);

  const createNiche = useMutation({
    mutationFn: (data) => api.post('/niches', data),
    onSuccess: () => { toast.success('Niche created'); setNewNicheName(''); setNewNicheDesc(''); qc.invalidateQueries(['niches']); },
    onError: (err) => toast.error(err.response?.data?.error || 'Failed to create niche'),
  });

  const updateNiche = useMutation({
    mutationFn: ({ id, ...data }) => api.put(`/niches/${id}`, data),
    onSuccess: () => { toast.success('Niche updated'); setEditingNiche(null); qc.invalidateQueries(['niches']); },
    onError: (err) => toast.error(err.response?.data?.error || 'Failed to update niche'),
  });

  const deleteNiche = useMutation({
    mutationFn: (id) => api.delete(`/niches/${id}`),
    onSuccess: () => { toast.success('Niche deleted'); setConfirmDeleteNiche(null); qc.invalidateQueries(['niches']); },
    onError: (err) => toast.error(err.response?.data?.error || 'Cannot delete — niche is in use'),
  });

  const createApiKey = useMutation({
    mutationFn: (data) => api.post('/apikeys', data),
    onSuccess: (res) => { setCreatedKey(res.data); setNewKeyName(''); setNewKeySlug(''); setNewKeyContractor(''); setNewKeyOrigins(''); qc.invalidateQueries(['apikeys']); },
    onError: (err) => toast.error(err.response?.data?.error || 'Failed to create key'),
  });

  const deactivateKey = useMutation({
    mutationFn: (id) => api.put(`/apikeys/${id}/deactivate`),
    onSuccess: () => { toast.success('Key deactivated'); qc.invalidateQueries(['apikeys']); },
    onError: (err) => toast.error(err.response?.data?.error || 'Failed'),
  });

  const activateKey = useMutation({
    mutationFn: (id) => api.put(`/apikeys/${id}/activate`),
    onSuccess: () => { toast.success('Key activated'); qc.invalidateQueries(['apikeys']); },
    onError: (err) => toast.error(err.response?.data?.error || 'Failed'),
  });

  const deleteKey = useMutation({
    mutationFn: (id) => api.delete(`/apikeys/${id}`),
    onSuccess: () => { toast.success('Key deleted'); qc.invalidateQueries(['apikeys']); setConfirmDeleteKey(null); },
    onError: (err) => toast.error(err.response?.data?.error || 'Failed'),
  });

  const matchLead = useMutation({
    mutationFn: (id) => api.post(`/leads/${id}/match`),
    onSuccess: (res) => { toast.success(res.data.message); qc.invalidateQueries(['admin-leads']); },
    onError: (err) => toast.error(err.response?.data?.error || 'Match failed'),
  });

  const resendLink = useMutation({
    mutationFn: (id) => api.post(`/leads/${id}/resend-link`),
    onSuccess: () => { toast.success('Booking link resent!'); qc.invalidateQueries(['admin-leads']); },
    onError: (err) => toast.error(err.response?.data?.error || 'Failed to resend'),
  });

  const reassignLead = useMutation({
    mutationFn: (id) => api.post(`/leads/${id}/reassign`),
    onSuccess: () => { toast.success('Lead reassigned — new booking link sent'); qc.invalidateQueries(['admin-leads']); },
    onError: (err) => toast.error(err.response?.data?.error || 'No other contractors available'),
  });

  const adminCancelAppt = useMutation({
    mutationFn: (id) => api.put(`/bookings/${id}/admin-cancel`),
    onSuccess: () => { toast.success('Appointment cancelled'); qc.invalidateQueries(['admin-appointments']); qc.invalidateQueries(['admin-leads']); },
    onError: (err) => toast.error(err.response?.data?.error || 'Failed to cancel'),
  });

  const adminCompleteAppt = useMutation({
    mutationFn: (id) => api.put(`/bookings/${id}/admin-complete`),
    onSuccess: () => { toast.success('Marked complete'); qc.invalidateQueries(['admin-appointments']); qc.invalidateQueries(['admin-leads']); },
    onError: (err) => toast.error(err.response?.data?.error || 'Failed to complete'),
  });

  const deleteAppt = useMutation({
    mutationFn: (id) => api.delete(`/bookings/${id}`),
    onSuccess: () => { toast.success('Appointment deleted'); qc.invalidateQueries(['admin-appointments']); },
    onError: (err) => toast.error(err.response?.data?.error || 'Failed to delete'),
  });

  const deleteLead = useMutation({
    mutationFn: (id) => api.delete(`/leads/${id}`),
    onSuccess: () => { toast.success('Lead deleted'); qc.invalidateQueries(['admin-leads']); },
    onError: (err) => toast.error(err.response?.data?.error || 'Delete failed'),
  });

  const setContractorPassword = useMutation({
    mutationFn: ({ id, password }) => api.put(`/contractors/${id}/password`, { new_password: password }),
    onSuccess: () => { toast.success('Password updated'); setSetPasswordFor(null); setNewPwValue(''); },
    onError: (err) => toast.error(err.response?.data?.error || 'Failed to set password'),
  });

  const deleteContractor = useMutation({
    mutationFn: (id) => api.delete(`/contractors/${id}`),
    onSuccess: () => { toast.success('Contractor deleted'); qc.invalidateQueries(['admin-contractors']); qc.invalidateQueries(['admin-leads']); },
    onError: (err) => toast.error(err.response?.data?.error || 'Delete failed'),
  });

  const addContractor = useMutation({
    mutationFn: (data) => api.post('/contractors', data),
    onSuccess: () => { toast.success('Contractor added!'); qc.invalidateQueries(['admin-contractors']); setShowAddContractor(false); contractorForm.reset(); },
    onError: (err) => toast.error(err.response?.data?.error || 'Failed to add contractor'),
  });

  const setContractorTwilio = useMutation({
    mutationFn: ({ id, twilio_number }) => api.put(`/contractors/${id}`, { twilio_number }),
    onSuccess: () => { toast.success('Twilio number saved'); setSetTwilioFor(null); setTwilioNumberInput(''); qc.invalidateQueries(['admin-contractors']); },
    onError: (err) => toast.error(err.response?.data?.error || 'Failed to save Twilio number'),
  });

  const viewContractorCalendar = useMutation({
    mutationFn: (id) => api.post(`/auth/admin/impersonate-contractor/${id}`),
    onSuccess: ({ data }) => {
      const url = `/contractor?impersonate_token=${encodeURIComponent(data.token)}&impersonate_user=${encodeURIComponent(JSON.stringify(data.user))}`;
      window.open(url, '_blank');
    },
    onError: (err) => toast.error(err.response?.data?.error || 'Failed to open contractor portal'),
  });

  const approveContractor = useMutation({
    mutationFn: (id) => api.put(`/auth/contractor/${id}/approve`),
    onSuccess: () => { toast.success('Contractor approved!'); qc.invalidateQueries(['admin-contractors']); },
    onError: (err) => toast.error(err.response?.data?.error || 'Approval failed'),
  });

  const declineContractor = useMutation({
    mutationFn: (id) => api.put(`/auth/contractor/${id}/decline`),
    onSuccess: () => { toast.success('Application declined.'); qc.invalidateQueries(['admin-contractors']); },
    onError: (err) => toast.error(err.response?.data?.error || 'Failed to decline'),
  });

  const deleteApplication = useMutation({
    mutationFn: (id) => api.delete(`/auth/contractor/${id}/application`),
    onSuccess: () => { toast.success('Application removed.'); qc.invalidateQueries(['admin-contractors']); },
    onError: (err) => toast.error(err.response?.data?.error || 'Failed to delete'),
  });

  const contractorForm = useForm();
  const onAddContractor = (data) => {
    const zips = data.service_zip_codes.split(',').map(z => z.trim()).filter(Boolean);
    addContractor.mutate({ ...data, service_zip_codes: zips });
  };

  const logout = () => { localStorage.clear(); window.location.href = '/login'; };

  const stats = [
    { label: 'Total Leads',     value: leads.length,                                                  icon: FileText,    color: 'text-blue-600',   bg: 'bg-blue-50' },
    { label: 'Active Bookings', value: appointments.filter(a => a.status === 'confirmed').length,      icon: Calendar,    color: 'text-purple-600', bg: 'bg-purple-50' },
    { label: 'Contractors',     value: contractors.filter(c => c.is_active).length,                   icon: Users,       color: 'text-green-600',  bg: 'bg-green-50' },
    { label: 'Completed',       value: leads.filter(l => l.status === 'completed').length,             icon: CheckCircle, color: 'text-emerald-600',bg: 'bg-emerald-50' },
  ];

  const filteredLeads = leads.filter(l =>
    !leadFilter || l.name?.toLowerCase().includes(leadFilter.toLowerCase()) ||
    l.email?.toLowerCase().includes(leadFilter.toLowerCase()) ||
    l.zip_code?.includes(leadFilter) || l.niche_name?.toLowerCase().includes(leadFilter.toLowerCase())
  );

  const TABS = [
    { id: 'overview',      label: 'Overview',      icon: LayoutDashboard },
    { id: 'leads',         label: 'Leads',         icon: FileText,    badge: leads.filter(l => l.status === 'new').length },
    { id: 'contractors',   label: 'Contractors',   icon: Users,       badge: pendingContractors.length },
    { id: 'appointments',  label: 'Appointments',  icon: Calendar },
    { id: 'apikeys',       label: 'API Keys',      icon: ShieldCheck },
    { id: 'performance',   label: 'Performance',   icon: BarChart2 },
    { id: 'niches',        label: 'Niches',        icon: Zap },
  ];

  return (
    <div className="min-h-screen bg-gray-50 w-full max-w-full">

      {/* ── Sidebar (desktop only) ──────────────────────────────────────────── */}
      <div className="hidden md:flex fixed inset-y-0 left-0 w-56 bg-white border-r border-gray-100 flex-col z-10">
        <div className="p-5 border-b border-gray-100">
          <div className="flex items-center gap-2.5">
            <img src="/probook-icon-128.png" alt="Tractify" className="w-8 h-8 rounded-lg" />
            <div>
              <p className="font-bold text-gray-900 text-sm">Tractify</p>
              <p className="text-xs text-gray-400">Admin</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 p-3 space-y-1">
          {TABS.map(({ id, label, icon: Icon, badge }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium transition-all text-left ${
                tab === id ? 'bg-brand-50 text-brand-600' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span className="flex-1">{label}</span>
              {badge > 0 && (
                <span className="bg-brand-500 text-white text-xs font-bold px-1.5 py-0.5 rounded-full">{badge}</span>
              )}
            </button>
          ))}
        </nav>

        <div className="p-3 border-t border-gray-100">
          <div className="px-3 py-2 mb-1">
            <p className="text-xs font-medium text-gray-700">{user?.name}</p>
            <p className="text-xs text-gray-400 truncate">{user?.email}</p>
          </div>
          <button onClick={logout} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-500 hover:text-gray-700 hover:bg-gray-50 rounded-xl">
            <LogOut className="w-4 h-4" />
            Logout
          </button>
        </div>
      </div>

      {/* ── Mobile header ───────────────────────────────────────────────────── */}
      <div className="md:hidden sticky top-0 z-10 bg-white border-b border-gray-100 px-4 py-3 flex items-center gap-3 w-full max-w-full">
        <img src="/probook-icon-128.png" alt="Tractify" className="w-7 h-7 rounded-lg" />
        <div className="flex-1">
          <p className="font-bold text-gray-900 text-sm leading-none">Tractify</p>
          <p className="text-[11px] text-gray-400">Admin</p>
        </div>
        <button onClick={logout} className="flex items-center gap-1.5 text-xs font-medium text-gray-500 hover:text-gray-700 bg-gray-100 hover:bg-gray-200 px-3 py-1.5 rounded-lg transition-all">
          <LogOut className="w-3.5 h-3.5" />
          Logout
        </button>
      </div>

      {/* ── Main content ─────────────────────────────────────────────────────── */}
      <div
        className="md:ml-56 p-4 md:p-6 pb-24 md:pb-6 min-w-0 overflow-x-hidden"
        style={{ marginRight: brainOpen ? '364px' : '0', transition: 'margin-right 0.25s cubic-bezier(0.4,0,0.2,1)' }}
      >

        {/* ── OVERVIEW ── */}
        {tab === 'overview' && (
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-gray-900 mb-5">Dashboard</h1>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 mb-6">
              {stats.map(({ label, value, icon: Icon, color, bg }) => (
                <div key={label} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
                  <div className={`inline-flex items-center justify-center w-8 h-8 md:w-10 md:h-10 ${bg} rounded-xl mb-2`}>
                    <Icon className={`w-4 h-4 ${color}`} />
                  </div>
                  <p className="text-xl md:text-2xl font-bold text-gray-900">{value}</p>
                  <p className="text-xs text-gray-500 leading-tight">{label}</p>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="card">
                <h3 className="font-semibold mb-4">Recent Leads</h3>
                <div className="space-y-3">
                  {leads.slice(0, 5).map(lead => (
                    <div key={lead.id} className="flex items-center justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{lead.name}</p>
                        <p className="text-xs text-gray-400 truncate">{lead.niche_name} · {lead.zip_code}</p>
                      </div>
                      <span className={`badge shrink-0 ${STATUS_BADGE[lead.status]}`}>{lead.status}</span>
                    </div>
                  ))}
                  {leads.length === 0 && <p className="text-sm text-gray-400 text-center py-4">No leads yet</p>}
                </div>
              </div>

              <div className="card">
                <h3 className="font-semibold mb-4">Upcoming Appointments</h3>
                <div className="space-y-3">
                  {appointments.filter(a => a.status === 'confirmed').slice(0, 5).map(appt => (
                    <div key={appt.id} className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{appt.lead_name}</p>
                      <p className="text-xs text-gray-400 truncate">{format(parseISO(appt.scheduled_date), 'MMM d')} at {fmtTime(appt.scheduled_time)} · {appt.contractor_name}</p>
                    </div>
                  ))}
                  {appointments.filter(a => a.status === 'confirmed').length === 0 && (
                    <p className="text-sm text-gray-400 text-center py-4">No upcoming appointments</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── LEADS ── */}
        {tab === 'leads' && (
          <div>
            <div className="flex items-center justify-between mb-5">
              <h1 className="text-xl md:text-2xl font-bold text-gray-900">Leads</h1>
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  value={leadFilter}
                  onChange={e => setLeadFilter(e.target.value)}
                  placeholder="Search..."
                  className="input pl-9 w-40 md:w-56"
                />
              </div>
            </div>

            {/* Mobile cards */}
            <div className="md:hidden space-y-3">
              {filteredLeads.map(lead => (
                <div key={lead.id} className="card p-4">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-900 truncate">{lead.name}</p>
                      <p className="text-xs text-gray-400 truncate">{lead.email}</p>
                      {lead.phone && <p className="text-xs text-gray-400 flex items-center gap-1 mt-0.5"><Phone className="w-3 h-3" />{lead.phone}</p>}
                    </div>
                    <span className={`badge ml-2 shrink-0 ${STATUS_BADGE[lead.status]}`}>{lead.status}</span>
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500 mb-3">
                    <span>{lead.niche_name}</span>
                    <span>ZIP {lead.zip_code}</span>
                    {lead.contractor_name && <span>→ {lead.contractor_name}</span>}
                    <span>{format(parseISO(lead.created_at), 'MMM d')}</span>
                  </div>
                  {lead.description && (
                    <button
                      onClick={() => setExpandedLead(expandedLead === lead.id ? null : lead.id)}
                      className="text-xs text-brand-500 mb-2"
                    >
                      {expandedLead === lead.id ? 'Hide notes ▲' : 'Show notes ▼'}
                    </button>
                  )}
                  {expandedLead === lead.id && lead.description && (
                    <p className="text-xs text-gray-600 bg-brand-50 rounded-lg px-3 py-2 mb-2">{lead.description}</p>
                  )}
                  <div className="flex flex-wrap gap-3">
                    {lead.status === 'new' && (
                      <button onClick={() => matchLead.mutate(lead.id)} disabled={matchLead.isPending} className="flex items-center gap-1 text-xs text-brand-600 font-medium">
                        <RefreshCw className="w-3 h-3" /> Match
                      </button>
                    )}
                    {lead.status === 'matched' && (
                      <button onClick={() => resendLink.mutate(lead.id)} disabled={resendLink.isPending} className="flex items-center gap-1 text-xs text-brand-600 font-medium">
                        <Send className="w-3 h-3" /> Resend Link
                      </button>
                    )}
                    {['matched', 'booked'].includes(lead.status) && lead.assigned_contractor_id && (
                      <button onClick={() => reassignLead.mutate(lead.id)} disabled={reassignLead.isPending} className="flex items-center gap-1 text-xs text-orange-500 font-medium">
                        <Shuffle className="w-3 h-3" /> Reassign
                      </button>
                    )}
                    {confirmDeleteLead === lead.id ? (
                      <div className="flex items-center gap-2">
                        <button onClick={() => { deleteLead.mutate(lead.id); setConfirmDeleteLead(null); }} className="text-xs bg-red-500 text-white px-2 py-0.5 rounded font-medium">Confirm</button>
                        <button onClick={() => setConfirmDeleteLead(null)} className="text-xs text-gray-500 font-medium">Cancel</button>
                      </div>
                    ) : (
                      <button onClick={() => setConfirmDeleteLead(lead.id)} className="flex items-center gap-1 text-xs text-red-400 font-medium">
                        <Trash2 className="w-3 h-3" /> Delete
                      </button>
                    )}
                  </div>
                </div>
              ))}
              {filteredLeads.length === 0 && <p className="text-center py-10 text-gray-400 text-sm">No leads found</p>}
            </div>

            {/* Desktop table */}
            <div className="hidden md:block card p-0 overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    {['Name', 'Niche', 'Zip', 'Status', 'Contractor', 'Date', 'Actions'].map(h => (
                      <th key={h} className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-3">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {filteredLeads.map(lead => (
                    <>
                    <tr key={lead.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => setExpandedLead(expandedLead === lead.id ? null : lead.id)}>
                      <td className="px-4 py-3">
                        <p className="text-sm font-medium text-gray-900">{lead.name}</p>
                        <p className="text-xs text-gray-400">{lead.email}</p>
                        {lead.phone && <p className="text-xs text-gray-400 flex items-center gap-1 mt-0.5"><Phone className="w-2.5 h-2.5" />{lead.phone}</p>}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">{lead.niche_name}</td>
                      <td className="px-4 py-3 text-sm text-gray-600">{lead.zip_code}</td>
                      <td className="px-4 py-3"><span className={`badge ${STATUS_BADGE[lead.status]}`}>{lead.status}</span></td>
                      <td className="px-4 py-3 text-sm text-gray-600">{lead.contractor_name || '—'}</td>
                      <td className="px-4 py-3 text-xs text-gray-400">{format(parseISO(lead.created_at), 'MMM d')}</td>
                      <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center gap-3 flex-wrap">
                          {lead.status === 'new' && (
                            <button onClick={() => matchLead.mutate(lead.id)} disabled={matchLead.isPending} className="flex items-center gap-1 text-xs text-brand-600 hover:text-brand-700 font-medium">
                              <RefreshCw className="w-3 h-3" /> Match
                            </button>
                          )}
                          {lead.status === 'matched' && (
                            <button onClick={() => resendLink.mutate(lead.id)} disabled={resendLink.isPending} className="flex items-center gap-1 text-xs text-brand-600 hover:text-brand-700 font-medium">
                              <Send className="w-3 h-3" /> Resend Link
                            </button>
                          )}
                          {['matched', 'booked'].includes(lead.status) && lead.assigned_contractor_id && (
                            <button onClick={() => reassignLead.mutate(lead.id)} disabled={reassignLead.isPending} className="flex items-center gap-1 text-xs text-orange-500 hover:text-orange-700 font-medium" title="Skip current contractor and assign to next available">
                              <Shuffle className="w-3 h-3" /> Reassign
                            </button>
                          )}
                          {confirmDeleteLead === lead.id ? (
                            <div className="flex items-center gap-2">
                              <button onClick={() => { deleteLead.mutate(lead.id); setConfirmDeleteLead(null); }} className="text-xs bg-red-500 text-white px-2 py-0.5 rounded font-medium hover:bg-red-600">Confirm</button>
                              <button onClick={() => setConfirmDeleteLead(null)} className="text-xs text-gray-500 hover:text-gray-700 font-medium">Cancel</button>
                            </div>
                          ) : (
                            <button onClick={() => setConfirmDeleteLead(lead.id)} className="flex items-center gap-1 text-xs text-red-400 hover:text-red-600 font-medium">
                              <Trash2 className="w-3 h-3" /> Delete
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                    {expandedLead === lead.id && lead.description && (
                      <tr key={`${lead.id}-exp`} className="bg-brand-50">
                        <td colSpan={7} className="px-4 py-2">
                          <div className="flex items-start gap-2 text-xs text-brand-700">
                            <AlignLeft className="w-3 h-3 mt-0.5 shrink-0" />
                            <p>{lead.description}</p>
                          </div>
                        </td>
                      </tr>
                    )}
                    </>
                  ))}
                  {filteredLeads.length === 0 && (
                    <tr><td colSpan={7} className="text-center py-10 text-gray-400 text-sm">No leads found</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── CONTRACTORS ── */}
        {tab === 'contractors' && (
          <div>
            <div className="flex items-center justify-between mb-5">
              <h1 className="text-xl md:text-2xl font-bold text-gray-900">Contractors</h1>
              <button onClick={() => setShowAddContractor(true)} className="btn-primary text-sm">
                <Plus className="w-4 h-4" /> Add
              </button>
            </div>

            {/* Pending Applications */}
            {pendingContractors.length > 0 && (
              <div className="card mb-6 border-amber-200 border-2">
                <h3 className="font-semibold text-amber-800 mb-4 flex items-center gap-2">
                  <span className="inline-flex items-center justify-center w-5 h-5 bg-amber-500 text-white text-xs font-bold rounded-full">{pendingContractors.length}</span>
                  Pending Applications
                </h3>
                <div className="space-y-3">
                  {pendingContractors.map(c => (
                    <div key={c.id} className="flex flex-col sm:flex-row sm:items-center gap-3 py-2 border-b border-amber-100 last:border-0">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-3 flex-wrap">
                          <div>
                            <p className="text-sm font-semibold text-gray-900">{c.name}</p>
                            {c.company_name && <p className="text-xs text-gray-500">{c.company_name}</p>}
                          </div>
                          <span className="badge bg-brand-100 text-brand-700">{c.niche_name}</span>
                        </div>
                        <div className="flex items-center gap-3 mt-1 flex-wrap">
                          <p className="text-xs text-gray-500 truncate max-w-[200px]">{c.email}</p>
                          {c.phone && <p className="text-xs text-gray-500">{c.phone}</p>}
                          <p className="text-xs text-gray-400">
                            {(() => { try { const z = JSON.parse(c.service_zip_codes); return z.join(', '); } catch { return c.service_zip_codes; } })()}
                          </p>
                          {c.applied_at && <p className="text-xs text-gray-400">Applied {format(parseISO(c.applied_at), 'MMM d, yyyy')}</p>}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button onClick={() => approveContractor.mutate(c.id)} disabled={approveContractor.isPending} className="flex items-center gap-1.5 text-sm font-semibold text-white bg-green-500 hover:bg-green-600 disabled:opacity-50 px-3 py-1.5 rounded-lg transition-all">
                          <CheckCircle className="w-4 h-4" /> Approve
                        </button>
                        <button onClick={() => declineContractor.mutate(c.id)} disabled={declineContractor.isPending} className="flex items-center gap-1.5 text-sm font-semibold text-gray-600 bg-gray-100 hover:bg-gray-200 disabled:opacity-50 px-3 py-1.5 rounded-lg transition-all">
                          <XCircle className="w-4 h-4" /> Decline
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Declined Applications */}
            {declinedContractors.length > 0 && (
              <div className="card mb-6 border-gray-200 border">
                <button onClick={() => setShowDeclined(v => !v)} className="w-full flex items-center justify-between text-sm font-semibold text-gray-500 hover:text-gray-700">
                  <span>Declined Applications ({declinedContractors.length})</span>
                  <span className="text-xs">{showDeclined ? '▲ Hide' : '▼ Show'}</span>
                </button>
                {showDeclined && (
                  <div className="space-y-3 mt-4 pt-4 border-t border-gray-100">
                    {declinedContractors.map(c => (
                      <div key={c.id} className="flex flex-col sm:flex-row sm:items-center gap-3 py-2 border-b border-gray-100 last:border-0 opacity-60">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-3 flex-wrap">
                            <div>
                              <p className="text-sm font-semibold text-gray-900">{c.name}</p>
                              {c.company_name && <p className="text-xs text-gray-500">{c.company_name}</p>}
                            </div>
                            <span className="badge bg-brand-100 text-brand-700">{c.niche_name}</span>
                          </div>
                          <div className="flex items-center gap-3 mt-1 flex-wrap">
                            <p className="text-xs text-gray-500">{c.email}</p>
                            <p className="text-xs text-gray-400">
                              {(() => { try { const z = JSON.parse(c.service_zip_codes); return z.join(', '); } catch { return c.service_zip_codes; } })()}
                            </p>
                            {c.declined_at && <p className="text-xs text-red-400">Declined {format(parseISO(c.declined_at), 'MMM d, yyyy')}</p>}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <button onClick={() => approveContractor.mutate(c.id)} disabled={approveContractor.isPending} className="flex items-center gap-1.5 text-sm font-semibold text-white bg-green-500 hover:bg-green-600 disabled:opacity-50 px-3 py-1.5 rounded-lg transition-all">
                            <CheckCircle className="w-4 h-4" /> Approve
                          </button>
                          <button onClick={() => deleteApplication.mutate(c.id)} disabled={deleteApplication.isPending} className="flex items-center gap-1.5 text-sm font-semibold text-red-500 hover:text-red-700 hover:bg-red-50 disabled:opacity-50 px-3 py-1.5 rounded-lg transition-all">
                            <Trash2 className="w-4 h-4" /> Delete
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {showAddContractor && (
              <div className="card mb-6 border-brand-100 border-2">
                <h3 className="font-semibold mb-4">Add New Contractor</h3>
                <form onSubmit={contractorForm.handleSubmit(onAddContractor)} className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="label">Full Name *</label>
                    <input {...contractorForm.register('name', { required: true })} className="input" placeholder="John Smith" />
                  </div>
                  <div>
                    <label className="label">Company Name</label>
                    <input {...contractorForm.register('company_name')} className="input" placeholder="Smith Roofing LLC" />
                  </div>
                  <div>
                    <label className="label">Email *</label>
                    <input {...contractorForm.register('email', { required: true })} type="email" className="input" placeholder="john@example.com" />
                  </div>
                  <div>
                    <label className="label">Phone</label>
                    <input
                      type="tel"
                      className="input"
                      placeholder="(555) 000-0000"
                      value={contractorForm.watch('phone') || ''}
                      onChange={e => contractorForm.setValue('phone', formatPhone(e.target.value))}
                    />
                  </div>
                  <div>
                    <label className="label">Niche *</label>
                    <select {...contractorForm.register('niche_id', { required: true })} className="input">
                      <option value="">Select a niche</option>
                      {niches.map(n => <option key={n.id} value={n.id}>{n.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="label">Service Zip Codes *</label>
                    <input {...contractorForm.register('service_zip_codes', { required: true })} className="input" placeholder="10001, 10002 (or * for all)" />
                    <p className="text-xs text-gray-400 mt-1">Comma-separated. Use * for all zips.</p>
                  </div>
                  <div>
                    <label className="label">Temporary Password *</label>
                    <div className="relative">
                      <input {...contractorForm.register('password', { required: true })} type={showTempPw ? 'text' : 'password'} className="input pr-10" placeholder="They can change this later" />
                      <button type="button" onClick={() => setShowTempPw(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                        {showTempPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                  <div className="flex items-end gap-2">
                    <button type="submit" disabled={addContractor.isPending} className="btn-primary">
                      {addContractor.isPending ? 'Adding...' : 'Add Contractor'}
                    </button>
                    <button type="button" onClick={() => setShowAddContractor(false)} className="btn-secondary">Cancel</button>
                  </div>
                </form>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {contractors.filter(c => !(c.applied_at && !c.is_active)).map(c => (
                <div key={c.id} className={`card ${!c.is_active ? 'opacity-60' : ''}`}>
                  <div className="flex items-start justify-between mb-3 gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-gray-900 truncate">{c.name}</p>
                      {c.company_name && <p className="text-sm text-gray-500 truncate">{c.company_name}</p>}
                    </div>
                    <span className={`badge ${c.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                      {c.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 mb-1 truncate">{c.email}</p>
                  <p className={`text-xs text-gray-500 truncate ${c.address ? 'mb-1' : 'mb-2'}`}>{c.phone}</p>
                  {c.address && <p className="text-xs text-gray-400 mb-2 truncate">{c.address}</p>}
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="badge bg-brand-100 text-brand-700">{c.niche_name}</span>
                    <span className="text-xs text-gray-400">
                      {(() => { try { const z = JSON.parse(c.service_zip_codes); return z.length > 3 ? `${z.slice(0,3).join(', ')}…` : z.join(', '); } catch { return c.service_zip_codes; } })()}
                    </span>
                  </div>
                  {c.google_refresh_token && (
                    <p className="text-xs text-green-600 mt-2 flex items-center gap-1"><CheckCircle className="w-3 h-3" /> Google Calendar linked</p>
                  )}
                  {c.twilio_number && (
                    <p className="text-xs text-indigo-600 mt-1 flex items-center gap-1"><Phone className="w-3 h-3" /> {c.twilio_number}</p>
                  )}
                  <div className="mt-3 pt-3 border-t border-gray-100 space-y-2">
                    {setTwilioFor === c.id ? (
                      <div className="flex items-center gap-2">
                        <input
                          type="tel"
                          value={twilioNumberInput}
                          onChange={e => setTwilioNumberInput(e.target.value)}
                          placeholder="+12065551234"
                          className="input text-xs py-1 px-2 h-7 flex-1"
                          autoFocus
                        />
                        <button onClick={() => twilioNumberInput && setContractorTwilio.mutate({ id: c.id, twilio_number: twilioNumberInput })} disabled={!twilioNumberInput || setContractorTwilio.isPending} className="text-xs bg-brand-500 text-white px-2 py-0.5 rounded font-medium hover:bg-brand-600 disabled:opacity-40">Save</button>
                        <button onClick={() => { setSetTwilioFor(null); setTwilioNumberInput(''); }} className="text-xs text-gray-500 hover:text-gray-700 font-medium">Cancel</button>
                      </div>
                    ) : (
                      <button onClick={() => { setSetTwilioFor(c.id); setTwilioNumberInput(c.twilio_number || ''); setSetPasswordFor(null); setConfirmDeleteContractor(null); }} className="flex items-center gap-1 text-xs text-indigo-500 hover:text-indigo-700 font-medium">
                        <Phone className="w-3 h-3" /> {c.twilio_number ? 'Change Twilio #' : 'Set Twilio #'}
                      </button>
                    )}
                    <button onClick={() => viewContractorCalendar.mutate(c.id)} disabled={viewContractorCalendar.isPending} className="flex items-center gap-1 text-xs text-teal-600 hover:text-teal-800 font-medium disabled:opacity-40">
                      <Calendar className="w-3 h-3" /> View Calendar
                    </button>
                    {setPasswordFor === c.id ? (
                      <div className="flex items-center gap-2">
                        <div className="relative flex-1">
                          <input
                            type={showPw ? 'text' : 'password'}
                            value={newPwValue}
                            onChange={e => setNewPwValue(e.target.value)}
                            placeholder="New password"
                            className="input text-xs py-1 px-2 h-7 w-full pr-7"
                            autoFocus
                          />
                          <button type="button" onClick={() => setShowPw(v => !v)} className="absolute right-1.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                            {showPw ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                        <button onClick={() => newPwValue && setContractorPassword.mutate({ id: c.id, password: newPwValue })} disabled={!newPwValue || setContractorPassword.isPending} className="text-xs bg-brand-500 text-white px-2 py-0.5 rounded font-medium hover:bg-brand-600 disabled:opacity-40">Save</button>
                        <button onClick={() => { setSetPasswordFor(null); setNewPwValue(''); setShowPw(false); }} className="text-xs text-gray-500 hover:text-gray-700 font-medium">Cancel</button>
                      </div>
                    ) : (
                      <button onClick={() => { setSetPasswordFor(c.id); setConfirmDeleteContractor(null); }} className="flex items-center gap-1 text-xs text-brand-500 hover:text-brand-700 font-medium">
                        <KeyRound className="w-3 h-3" /> Set Password
                      </button>
                    )}
                    {confirmDeleteContractor === c.id ? (
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-red-600 font-medium">Are you sure?</span>
                        <button onClick={() => { deleteContractor.mutate(c.id); setConfirmDeleteContractor(null); }} className="text-xs bg-red-500 text-white px-2 py-0.5 rounded font-medium hover:bg-red-600">Confirm</button>
                        <button onClick={() => setConfirmDeleteContractor(null)} className="text-xs text-gray-500 hover:text-gray-700 font-medium">Cancel</button>
                      </div>
                    ) : (
                      <button onClick={() => { setConfirmDeleteContractor(c.id); setSetPasswordFor(null); }} className="flex items-center gap-1 text-xs text-red-400 hover:text-red-600 font-medium">
                        <Trash2 className="w-3 h-3" /> Delete Contractor
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── API KEYS ── */}
        {tab === 'apikeys' && (
          <div>
            <div className="mb-5">
              <h1 className="text-xl md:text-2xl font-bold text-gray-900">API Keys</h1>
              <p className="text-sm text-gray-500 mt-1">One key per website. Each site uses its key to send leads to Tractify.</p>
            </div>

            <div className="card mb-6">
              <h3 className="font-semibold mb-4 flex items-center gap-2"><Plus className="w-4 h-4" /> Create New Key</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="label">Key Name *</label>
                  <input value={newKeyName} onChange={e => setNewKeyName(e.target.value)} className="input" placeholder="e.g. OilToHeatRebate.com" />
                </div>
                <div>
                  <label className="label">Site Slug *</label>
                  <input value={newKeySlug} onChange={e => setNewKeySlug(e.target.value)} className="input" placeholder="e.g. oil-to-heat-rebate" />
                  <p className="text-xs text-gray-400 mt-1">Short identifier, lowercase, no spaces</p>
                </div>
              </div>
              <div className="mb-4">
                <label className="label">Dedicated Contractor <span className="text-gray-400 font-normal">(optional)</span></label>
                <select value={newKeyContractor} onChange={e => setNewKeyContractor(e.target.value)} className="input max-w-md">
                  <option value="">Shared marketplace (round-robin)</option>
                  {contractors.filter(c => c.is_active).map(c => (
                    <option key={c.id} value={c.id}>{c.name} — {c.company_name}</option>
                  ))}
                </select>
                <p className="text-xs text-gray-400 mt-1">Link to one contractor to route all leads from this site directly to them</p>
              </div>
              <div className="mb-4">
                <label className="label">Allowed Domains <span className="text-gray-400 font-normal">(optional — recommended)</span></label>
                <input value={newKeyOrigins} onChange={e => setNewKeyOrigins(e.target.value)} className="input max-w-md" placeholder="https://clientsite.com, https://www.clientsite.com" />
                <p className="text-xs text-gray-400 mt-1">Comma-separated. If set, this key only accepts requests from these domains — prevents key theft.</p>
              </div>
              <button disabled={!newKeyName || !newKeySlug || createApiKey.isPending} onClick={() => createApiKey.mutate({ name: newKeyName, source_slug: newKeySlug, contractor_id: newKeyContractor || undefined, allowed_origins: newKeyOrigins || undefined })} className="btn-primary disabled:opacity-40">
                {createApiKey.isPending ? 'Creating...' : 'Generate Key'}
              </button>
            </div>

            {createdKey && (
              <div className="card mb-6 border-2 border-green-200 bg-green-50">
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-green-800 mb-1">Key created for {createdKey.name}</p>
                    <p className="text-xs text-green-600 mb-3">Copy this now — it won't be shown again.</p>
                    <div className="flex items-center gap-2">
                      <code className="text-xs md:text-sm font-mono bg-white border border-green-200 px-3 py-1.5 rounded-lg text-gray-800 select-all break-all">
                        {createdKey.key}
                      </code>
                      <button onClick={() => { navigator.clipboard.writeText(createdKey.key); toast.success('Copied!'); }} className="p-1.5 text-green-700 hover:bg-green-100 rounded-lg shrink-0">
                        <Copy className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                  <button onClick={() => setCreatedKey(null)} className="text-xs text-green-600 hover:text-green-800 font-medium mt-1 ml-3 shrink-0">Dismiss</button>
                </div>
              </div>
            )}

            {/* Mobile cards */}
            <div className="md:hidden space-y-3">
              {apiKeys.map(k => (
                <div key={k.id} className="card p-4">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <p className="text-sm font-semibold text-gray-900">{k.name}</p>
                      <code className="text-xs bg-gray-100 px-1.5 py-0.5 rounded text-gray-600">{k.source_slug}</code>
                    </div>
                    <span className={`badge ml-2 shrink-0 ${k.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                      {k.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                  {k.contractor_name && (
                    <p className="text-xs text-indigo-600 font-medium mb-1">→ {k.contractor_name} ({k.contractor_company})</p>
                  )}
                  <p className="text-xs text-gray-400 mb-3">Last used: {k.last_used_at ? format(parseISO(k.last_used_at), 'MMM d, yyyy') : 'Never'}</p>
                  <div className="flex items-center gap-3">
                    {k.is_active ? (
                      <button onClick={() => deactivateKey.mutate(k.id)} className="text-xs text-yellow-600 font-medium flex items-center gap-1"><EyeOff className="w-3 h-3" /> Deactivate</button>
                    ) : (
                      <button onClick={() => activateKey.mutate(k.id)} className="text-xs text-green-600 font-medium flex items-center gap-1"><Eye className="w-3 h-3" /> Activate</button>
                    )}
                    {confirmDeleteKey === k.id ? (
                      <div className="flex items-center gap-1">
                        <button onClick={() => deleteKey.mutate(k.id)} className="text-xs bg-red-500 text-white px-2 py-0.5 rounded font-medium">Confirm</button>
                        <button onClick={() => setConfirmDeleteKey(null)} className="text-xs text-gray-500 font-medium">Cancel</button>
                      </div>
                    ) : (
                      <button onClick={() => setConfirmDeleteKey(k.id)} className="flex items-center gap-1 text-xs text-red-400 font-medium"><Trash2 className="w-3 h-3" /> Delete</button>
                    )}
                  </div>
                </div>
              ))}
              {apiKeys.length === 0 && <p className="text-center py-10 text-gray-400 text-sm">No API keys yet — create one above</p>}
            </div>

            {/* Desktop table */}
            <div className="hidden md:block card p-0 overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    {['Name', 'Slug', 'Dedicated Contractor', 'Status', 'Last Used', 'Actions'].map(h => (
                      <th key={h} className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-3">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {apiKeys.map(k => (
                    <tr key={k.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3"><p className="text-sm font-medium text-gray-900">{k.name}</p></td>
                      <td className="px-4 py-3"><code className="text-xs bg-gray-100 px-2 py-0.5 rounded text-gray-600">{k.source_slug}</code></td>
                      <td className="px-4 py-3">
                        {k.contractor_name
                          ? <span className="text-xs text-indigo-600 font-medium">{k.contractor_name}</span>
                          : <span className="text-xs text-gray-400">Shared marketplace</span>
                        }
                      </td>
                      <td className="px-4 py-3">
                        <span className={`badge ${k.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>{k.is_active ? 'Active' : 'Inactive'}</span>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-400">{k.last_used_at ? format(parseISO(k.last_used_at), 'MMM d, yyyy h:mm a') : 'Never'}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          {k.is_active ? (
                            <button onClick={() => deactivateKey.mutate(k.id)} className="text-xs text-yellow-600 hover:text-yellow-700 font-medium flex items-center gap-1"><EyeOff className="w-3 h-3" /> Deactivate</button>
                          ) : (
                            <button onClick={() => activateKey.mutate(k.id)} className="text-xs text-green-600 hover:text-green-700 font-medium flex items-center gap-1"><Eye className="w-3 h-3" /> Activate</button>
                          )}
                          {confirmDeleteKey === k.id ? (
                            <div className="flex items-center gap-1">
                              <button onClick={() => deleteKey.mutate(k.id)} className="text-xs bg-red-500 text-white px-2 py-0.5 rounded font-medium">Confirm</button>
                              <button onClick={() => setConfirmDeleteKey(null)} className="text-xs text-gray-500 font-medium">Cancel</button>
                            </div>
                          ) : (
                            <button onClick={() => setConfirmDeleteKey(k.id)} className="flex items-center gap-1 text-xs text-red-400 hover:text-red-600 font-medium"><Trash2 className="w-3 h-3" /> Delete</button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {apiKeys.length === 0 && (
                    <tr><td colSpan={6} className="text-center py-10 text-gray-400 text-sm">No API keys yet — create one above</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── APPOINTMENTS ── */}
        {tab === 'appointments' && (
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-gray-900 mb-5">Appointments</h1>

            {/* Mobile cards */}
            <div className="md:hidden space-y-3">
              {appointments.map(appt => (
                <div key={appt.id} className="card p-4">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-900 truncate">{appt.lead_name}</p>
                      <p className="text-xs text-gray-400 truncate">{appt.lead_email}</p>
                    </div>
                    <span className={`badge ml-2 shrink-0 ${STATUS_BADGE[appt.status] || 'bg-gray-100 text-gray-600'}`}>{appt.status}</span>
                  </div>
                  <p className="text-xs text-gray-600 mb-1 truncate">→ {appt.contractor_name}{appt.company_name ? ` · ${appt.company_name}` : ''}</p>
                  <p className="text-xs text-gray-500 mb-3">
                    {format(parseISO(appt.scheduled_date), 'EEE, MMM d')} at {fmtTime(appt.scheduled_time)} · {appt.niche_name}
                  </p>
                  <div className="flex items-center gap-3">
                    {appt.status === 'confirmed' && (
                      <>
                        <button onClick={() => adminCompleteAppt.mutate(appt.id)} className="flex items-center gap-1 text-xs text-green-600 font-medium">
                          <CheckCircle className="w-3 h-3" /> Complete
                        </button>
                        {confirmCancelAppt === appt.id ? (
                          <div className="flex items-center gap-1">
                            <button onClick={() => { adminCancelAppt.mutate(appt.id); setConfirmCancelAppt(null); }} className="text-xs bg-red-500 text-white px-2 py-0.5 rounded font-medium">Confirm</button>
                            <button onClick={() => setConfirmCancelAppt(null)} className="text-xs text-gray-500 font-medium">No</button>
                          </div>
                        ) : (
                          <button onClick={() => setConfirmCancelAppt(appt.id)} className="flex items-center gap-1 text-xs text-red-400 font-medium">
                            <XCircle className="w-3 h-3" /> Cancel
                          </button>
                        )}
                      </>
                    )}
                    {(appt.status === 'cancelled' || appt.status === 'completed') && (
                      confirmDeleteAppt === appt.id ? (
                        <div className="flex items-center gap-1">
                          <button onClick={() => { deleteAppt.mutate(appt.id); setConfirmDeleteAppt(null); }} className="text-xs bg-red-500 text-white px-2 py-0.5 rounded font-medium">Delete</button>
                          <button onClick={() => setConfirmDeleteAppt(null)} className="text-xs text-gray-500 font-medium">No</button>
                        </div>
                      ) : (
                        <button onClick={() => setConfirmDeleteAppt(appt.id)} className="flex items-center gap-1 text-xs text-gray-400 font-medium">
                          <Trash2 className="w-3 h-3" /> Delete
                        </button>
                      )
                    )}
                  </div>
                </div>
              ))}
              {appointments.length === 0 && <p className="text-center py-10 text-gray-400 text-sm">No appointments yet</p>}
            </div>

            {/* Desktop table */}
            <div className="hidden md:block card p-0 overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    {['Homeowner', 'Contractor', 'Niche', 'Date & Time', 'Status', 'Actions'].map(h => (
                      <th key={h} className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-3">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {appointments.map(appt => (
                    <tr key={appt.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <p className="text-sm font-medium text-gray-900">{appt.lead_name}</p>
                        <p className="text-xs text-gray-400">{appt.lead_email}</p>
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-sm text-gray-700">{appt.contractor_name}</p>
                        <p className="text-xs text-gray-400">{appt.company_name}</p>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">{appt.niche_name}</td>
                      <td className="px-4 py-3">
                        <p className="text-sm font-medium text-gray-900">{format(parseISO(appt.scheduled_date), 'MMM d, yyyy')}</p>
                        <p className="text-xs text-gray-400">{fmtTime(appt.scheduled_time)}</p>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`badge ${STATUS_BADGE[appt.status] || 'bg-gray-100 text-gray-600'}`}>{appt.status}</span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {appt.status === 'confirmed' && (
                            <>
                              <button onClick={() => adminCompleteAppt.mutate(appt.id)} className="flex items-center gap-1 text-xs text-green-600 hover:text-green-700 font-medium">
                                <CheckCircle className="w-3 h-3" /> Complete
                              </button>
                              {confirmCancelAppt === appt.id ? (
                                <div className="flex items-center gap-1">
                                  <button onClick={() => { adminCancelAppt.mutate(appt.id); setConfirmCancelAppt(null); }} className="text-xs bg-red-500 text-white px-2 py-0.5 rounded font-medium">Confirm</button>
                                  <button onClick={() => setConfirmCancelAppt(null)} className="text-xs text-gray-500 font-medium">No</button>
                                </div>
                              ) : (
                                <button onClick={() => setConfirmCancelAppt(appt.id)} className="flex items-center gap-1 text-xs text-red-400 hover:text-red-600 font-medium">
                                  <XCircle className="w-3 h-3" /> Cancel
                                </button>
                              )}
                            </>
                          )}
                          {(appt.status === 'cancelled' || appt.status === 'completed') && (
                            confirmDeleteAppt === appt.id ? (
                              <div className="flex items-center gap-1">
                                <button onClick={() => { deleteAppt.mutate(appt.id); setConfirmDeleteAppt(null); }} className="text-xs bg-red-500 text-white px-2 py-0.5 rounded font-medium">Delete</button>
                                <button onClick={() => setConfirmDeleteAppt(null)} className="text-xs text-gray-500 font-medium">No</button>
                              </div>
                            ) : (
                              <button onClick={() => setConfirmDeleteAppt(appt.id)} className="flex items-center gap-1 text-xs text-gray-400 hover:text-red-500 font-medium transition-colors">
                                <Trash2 className="w-3 h-3" /> Delete
                              </button>
                            )
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {appointments.length === 0 && (
                    <tr><td colSpan={6} className="text-center py-10 text-gray-400 text-sm">No appointments yet</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── NICHES ── */}
        {tab === 'niches' && (
          <div>
            <div className="mb-5">
              <h1 className="text-xl md:text-2xl font-bold text-gray-900">Niches</h1>
              <p className="text-sm text-gray-500 mt-1">The service categories contractors specialize in. Leads are matched by niche.</p>
            </div>

            <div className="card mb-6">
              <h3 className="font-semibold mb-4 flex items-center gap-2"><Plus className="w-4 h-4" /> Add Niche</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="label">Name *</label>
                  <input value={newNicheName} onChange={e => setNewNicheName(e.target.value)} className="input" placeholder="e.g. Heat Pump Installation" />
                </div>
                <div>
                  <label className="label">Description</label>
                  <input value={newNicheDesc} onChange={e => setNewNicheDesc(e.target.value)} className="input" placeholder="Short description (optional)" />
                </div>
              </div>
              <button disabled={!newNicheName || createNiche.isPending} onClick={() => createNiche.mutate({ name: newNicheName, description: newNicheDesc })} className="btn-primary disabled:opacity-40">
                {createNiche.isPending ? 'Creating…' : 'Create Niche'}
              </button>
            </div>

            {/* Mobile list */}
            <div className="md:hidden space-y-3">
              {niches.map(n => (
                <div key={n.id} className="card p-4">
                  {editingNiche?.id === n.id ? (
                    <div className="space-y-2">
                      <input className="input text-sm" value={editingNiche.name} onChange={e => setEditingNiche(p => ({ ...p, name: e.target.value }))} />
                      <input className="input text-sm" value={editingNiche.description || ''} onChange={e => setEditingNiche(p => ({ ...p, description: e.target.value }))} placeholder="Description" />
                      <div className="flex gap-2">
                        <button onClick={() => updateNiche.mutate(editingNiche)} className="text-xs text-green-600 font-medium">Save</button>
                        <button onClick={() => setEditingNiche(null)} className="text-xs text-gray-500 font-medium">Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-900">{n.name}</p>
                        {n.description && <p className="text-xs text-gray-500 mt-0.5">{n.description}</p>}
                      </div>
                      <div className="flex items-center gap-3 ml-3 shrink-0">
                        <button onClick={() => setEditingNiche({ id: n.id, name: n.name, description: n.description || '' })} className="text-xs text-brand-600 font-medium">Edit</button>
                        {confirmDeleteNiche === n.id ? (
                          <div className="flex items-center gap-1">
                            <button onClick={() => deleteNiche.mutate(n.id)} className="text-xs bg-red-500 text-white px-2 py-0.5 rounded font-medium">Confirm</button>
                            <button onClick={() => setConfirmDeleteNiche(null)} className="text-xs text-gray-500 font-medium">No</button>
                          </div>
                        ) : (
                          <button onClick={() => setConfirmDeleteNiche(n.id)} className="flex items-center gap-1 text-xs text-red-400 font-medium"><Trash2 className="w-3 h-3" /></button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))}
              {niches.length === 0 && <p className="text-center py-10 text-gray-400 text-sm">No niches yet</p>}
            </div>

            {/* Desktop table */}
            <div className="hidden md:block card p-0 overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    {['Name', 'Description', 'Actions'].map(h => (
                      <th key={h} className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-3">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {niches.map(n => (
                    <tr key={n.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        {editingNiche?.id === n.id ? (
                          <input className="input text-sm py-1" value={editingNiche.name} onChange={e => setEditingNiche(p => ({ ...p, name: e.target.value }))} />
                        ) : (
                          <p className="text-sm font-medium text-gray-900">{n.name}</p>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {editingNiche?.id === n.id ? (
                          <input className="input text-sm py-1" value={editingNiche.description || ''} onChange={e => setEditingNiche(p => ({ ...p, description: e.target.value }))} />
                        ) : (
                          <p className="text-sm text-gray-500">{n.description || '—'}</p>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          {editingNiche?.id === n.id ? (
                            <>
                              <button onClick={() => updateNiche.mutate(editingNiche)} className="text-xs text-green-600 hover:text-green-700 font-medium">Save</button>
                              <button onClick={() => setEditingNiche(null)} className="text-xs text-gray-500 font-medium">Cancel</button>
                            </>
                          ) : (
                            <button onClick={() => setEditingNiche({ id: n.id, name: n.name, description: n.description || '' })} className="text-xs text-brand-600 hover:text-brand-700 font-medium">Edit</button>
                          )}
                          {confirmDeleteNiche === n.id ? (
                            <div className="flex items-center gap-1">
                              <button onClick={() => deleteNiche.mutate(n.id)} className="text-xs bg-red-500 text-white px-2 py-0.5 rounded font-medium">Confirm</button>
                              <button onClick={() => setConfirmDeleteNiche(null)} className="text-xs text-gray-500 font-medium">Cancel</button>
                            </div>
                          ) : (
                            <button onClick={() => setConfirmDeleteNiche(n.id)} className="flex items-center gap-1 text-xs text-red-400 hover:text-red-600 font-medium">
                              <Trash2 className="w-3 h-3" /> Delete
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {niches.length === 0 && (
                    <tr><td colSpan={3} className="text-center py-10 text-gray-400 text-sm">No niches yet</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── PERFORMANCE ── */}
        {tab === 'performance' && (
          <div>
            <div className="mb-5">
              <h1 className="text-xl md:text-2xl font-bold text-gray-900">Performance</h1>
              <p className="text-sm text-gray-500 mt-1">Conversion stats for each active contractor.</p>
            </div>

            {/* Mobile cards */}
            <div className="md:hidden space-y-3">
              {performance.map(p => (
                <div key={p.id} className="card p-4">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <p className="text-sm font-semibold text-gray-900">{p.name}</p>
                      {p.company_name && <p className="text-xs text-gray-400">{p.company_name}</p>}
                    </div>
                    <span className={`text-sm font-bold ml-2 shrink-0 ${parseFloat(p.conversion_pct) >= 50 ? 'text-green-600' : parseFloat(p.conversion_pct) >= 25 ? 'text-yellow-600' : 'text-red-500'}`}>
                      {p.conversion_pct}%
                    </span>
                  </div>
                  <span className="badge bg-brand-100 text-brand-700 mb-3">{p.niche_name}</span>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="bg-gray-50 rounded-lg py-2">
                      <p className="text-sm font-bold text-gray-900">{p.leads_matched}</p>
                      <p className="text-[10px] text-gray-400">Matched</p>
                    </div>
                    <div className="bg-green-50 rounded-lg py-2">
                      <p className="text-sm font-bold text-green-700">{p.appts_completed}</p>
                      <p className="text-[10px] text-gray-400">Completed</p>
                    </div>
                    <div className="bg-red-50 rounded-lg py-2">
                      <p className="text-sm font-bold text-red-500">{p.appts_cancelled}</p>
                      <p className="text-[10px] text-gray-400">Cancelled</p>
                    </div>
                  </div>
                  <div className="mt-3 flex items-center gap-2">
                    <div className="flex-1 bg-gray-100 rounded-full h-1.5">
                      <div className="bg-brand-500 h-1.5 rounded-full" style={{ width: `${Math.min(parseFloat(p.conversion_pct), 100)}%` }} />
                    </div>
                    <span className="text-xs text-gray-500">conversion</span>
                  </div>
                </div>
              ))}
              {performance.length === 0 && <p className="text-center py-10 text-gray-400 text-sm">No data yet — stats appear once leads are matched</p>}
            </div>

            {/* Desktop table */}
            <div className="hidden md:block card p-0 overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    {['Contractor', 'Niche', 'Leads Matched', 'Booked', 'Completed', 'Cancelled', 'Conversion %'].map(h => (
                      <th key={h} className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-3">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {performance.map(p => (
                    <tr key={p.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <p className="text-sm font-medium text-gray-900">{p.name}</p>
                        {p.company_name && <p className="text-xs text-gray-400">{p.company_name}</p>}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">{p.niche_name}</td>
                      <td className="px-4 py-3 text-sm font-medium text-gray-800">{p.leads_matched}</td>
                      <td className="px-4 py-3 text-sm text-gray-600">{p.leads_booked}</td>
                      <td className="px-4 py-3"><span className="text-sm font-medium text-green-600">{p.appts_completed}</span></td>
                      <td className="px-4 py-3"><span className="text-sm text-red-500">{p.appts_cancelled}</span></td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-20 bg-gray-100 rounded-full h-1.5">
                            <div className="bg-brand-500 h-1.5 rounded-full" style={{ width: `${Math.min(parseFloat(p.conversion_pct), 100)}%` }} />
                          </div>
                          <span className={`text-sm font-semibold ${parseFloat(p.conversion_pct) >= 50 ? 'text-green-600' : parseFloat(p.conversion_pct) >= 25 ? 'text-yellow-600' : 'text-red-500'}`}>
                            {p.conversion_pct}%
                          </span>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {performance.length === 0 && (
                    <tr><td colSpan={7} className="text-center py-10 text-gray-400 text-sm">No data yet — stats appear once leads are matched</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

      </div>

      {/* ── Mobile bottom nav ───────────────────────────────────────────────── */}
      {/* "More" backdrop */}
      {showMoreMenu && (
        <div
          className="md:hidden fixed inset-0 z-40 bg-black/30"
          onClick={() => setShowMoreMenu(false)}
        />
      )}

      {/* "More" sheet */}
      {showMoreMenu && (
        <div className="md:hidden fixed bottom-16 left-0 right-0 z-50 bg-white border-t border-gray-100 shadow-2xl rounded-t-2xl px-4 py-3">
          <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-4" />
          {[
            { id: 'apikeys',     label: 'API Keys',   icon: ShieldCheck },
            { id: 'performance', label: 'Performance', icon: BarChart2 },
            { id: 'niches',      label: 'Niches',      icon: Zap },
          ].map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => { setTab(id); setShowMoreMenu(false); }}
              className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-medium transition-all mb-1 ${
                tab === id ? 'bg-brand-50 text-brand-600' : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              <Icon className="w-5 h-5" />
              {label}
            </button>
          ))}
          <div className="border-t border-gray-100 mt-2 pt-2">
            <button
              onClick={logout}
              className="w-full flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-medium text-red-500 hover:bg-red-50 transition-all"
            >
              <LogOut className="w-5 h-5" />
              Logout
            </button>
          </div>
        </div>
      )}

      {/* ── Admin AI Brain — right-side drawer ──────────────────────────────── */}

      {/* Backdrop (mobile only) */}
      {brainOpen && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 9998, background: 'rgba(0,0,0,0.3)' }}
          className="md:hidden"
          onClick={() => setBrainOpen(false)}
        />
      )}

      {/* Slide-out panel */}
      <div style={{
        position: 'fixed',
        top: 0,
        right: brainOpen ? 0 : '-380px',
        width: '360px',
        height: '100vh',
        zIndex: 9999,
        background: '#fff',
        boxShadow: brainOpen ? '-4px 0 32px rgba(0,0,0,0.15)' : 'none',
        display: 'flex',
        flexDirection: 'column',
        transition: 'right 0.25s cubic-bezier(0.4,0,0.2,1)',
        borderLeft: '1px solid #e5e7eb',
      }}>
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '16px 20px',
          background: 'linear-gradient(135deg, #4f46e5, #7c3aed)',
          color: '#fff',
          flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '20px' }}>🧠</span>
            <div>
              <div style={{ fontWeight: 600, fontSize: '14px' }}>Tractify Brain</div>
              <div style={{ fontSize: '11px', opacity: 0.75 }}>Ask questions · Take actions</div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            {brainMessages.length > 1 && (
              <button
                onClick={() => setBrainMessages([{ role: 'assistant', content: "Hey Jose — I have full visibility into the business. What do you want to know? Ask me anything: which contractors are stalled, which channels are converting, which ads drove signups, where to spend today." }])}
                style={{ fontSize: '12px', opacity: 0.75, background: 'none', border: 'none', color: '#fff', cursor: 'pointer' }}
              >
                Clear
              </button>
            )}
            <button onClick={() => setBrainOpen(false)} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', opacity: 0.75 }}>
              <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Messages */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {brainMessages.map((msg, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
              <div style={{
                maxWidth: '88%',
                padding: '10px 14px',
                borderRadius: msg.role === 'user' ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
                fontSize: '13px',
                lineHeight: '1.5',
                whiteSpace: 'pre-wrap',
                background: msg.role === 'user' ? '#4f46e5' : '#f9fafb',
                color: msg.role === 'user' ? '#fff' : '#1f2937',
                border: msg.role === 'user' ? 'none' : '1px solid #e5e7eb',
              }}>
                {msg.content}
              </div>
            </div>
          ))}
          {brainLoading && (
            <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
              <div style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '18px 18px 18px 4px', padding: '10px 14px' }}>
                <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                  {[0, 150, 300].map(delay => (
                    <div key={delay} className="animate-bounce" style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#6366f1', animationDelay: `${delay}ms` }} />
                  ))}
                </div>
              </div>
            </div>
          )}
          <div ref={brainBottomRef} />
        </div>

        {/* Quick prompts */}
        {brainMessages.length === 1 && (
          <div style={{ padding: '0 16px 12px' }}>
            <p style={{ fontSize: '10px', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>Ask or command</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {[
                'What should I do today?',
                'Which contractors are stalled?',
                'Which channels convert fastest?',
                'How close am I to first Stripe?',
                'Delete all test leads',
                'Approve all pending contractors',
              ].map(s => (
                <button key={s} onClick={() => sendBrainMessage(s)} style={{
                  fontSize: '12px', padding: '5px 11px', borderRadius: '20px',
                  background: '#eef2ff', color: '#4338ca', border: '1px solid #c7d2fe',
                  cursor: 'pointer', lineHeight: 1.4,
                }}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Input */}
        <form onSubmit={e => { e.preventDefault(); sendBrainMessage(); }} style={{
          display: 'flex', gap: '8px', padding: '12px 16px',
          borderTop: '1px solid #e5e7eb', flexShrink: 0,
        }}>
          <input
            type="text"
            value={brainInput}
            onChange={e => setBrainInput(e.target.value)}
            placeholder="Ask anything or give a command…"
            disabled={brainLoading}
            style={{
              flex: 1, fontSize: '13px', border: '1px solid #d1d5db',
              borderRadius: '10px', padding: '8px 12px',
              outline: 'none', fontFamily: 'inherit',
            }}
          />
          <button type="submit" disabled={!brainInput.trim() || brainLoading} style={{
            width: '36px', height: '36px', borderRadius: '10px',
            background: '#4f46e5', border: 'none', color: '#fff',
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
            opacity: !brainInput.trim() || brainLoading ? 0.4 : 1,
          }}>
            <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} style={{ transform: 'rotate(90deg)' }}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 19l9-7-9-7v14z" />
            </svg>
          </button>
        </form>
      </div>

      {/* Right-edge tab trigger */}
      <button
        onClick={() => setBrainOpen(v => !v)}
        style={{
          position: 'fixed',
          top: '50%',
          right: brainOpen ? '360px' : 0,
          transform: 'translateY(-50%)',
          zIndex: 9999,
          background: 'linear-gradient(180deg, #4f46e5, #7c3aed)',
          color: '#fff',
          border: 'none',
          borderRadius: '8px 0 0 8px',
          padding: '14px 8px',
          cursor: 'pointer',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '6px',
          boxShadow: '-2px 2px 12px rgba(79,70,229,0.4)',
          transition: 'right 0.25s cubic-bezier(0.4,0,0.2,1)',
          fontSize: '18px',
          lineHeight: 1,
        }}
        title="Tractify Brain"
      >
        🧠
      </button>

      {/* Bottom tab bar — 4 primary tabs + More */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 z-50 shadow-lg">
        <div className="flex">
          {[
            { id: 'overview',     label: 'Overview',     icon: LayoutDashboard },
            { id: 'leads',        label: 'Leads',         icon: FileText,   badge: leads.filter(l => l.status === 'new').length },
            { id: 'contractors',  label: 'Contractors',   icon: Users,      badge: pendingContractors.length },
            { id: 'appointments', label: 'Appointments',  icon: Calendar },
          ].map(({ id, label, icon: Icon, badge }) => (
            <button
              key={id}
              onClick={() => { setTab(id); setShowMoreMenu(false); }}
              className={`flex-1 flex flex-col items-center gap-0.5 py-2.5 text-[10px] font-medium transition-all ${
                tab === id ? 'text-brand-500' : 'text-gray-400'
              }`}
            >
              <div className="relative">
                <Icon className="w-5 h-5" />
                {badge > 0 && (
                  <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-brand-500 rounded-full text-[8px] text-white flex items-center justify-center font-bold leading-none">{badge}</span>
                )}
              </div>
              {label}
            </button>
          ))}
          <button
            onClick={() => setShowMoreMenu(v => !v)}
            className={`flex-1 flex flex-col items-center gap-0.5 py-2.5 text-[10px] font-medium transition-all ${
              ['apikeys','performance','niches'].includes(tab) ? 'text-brand-500' : 'text-gray-400'
            }`}
          >
            <div className="relative">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <circle cx="5" cy="12" r="1.5" fill="currentColor" />
                <circle cx="12" cy="12" r="1.5" fill="currentColor" />
                <circle cx="19" cy="12" r="1.5" fill="currentColor" />
              </svg>
              {['apikeys','performance','niches'].includes(tab) && (
                <span className="absolute -top-1 -right-1 w-2 h-2 bg-brand-500 rounded-full" />
              )}
            </div>
            More
          </button>
        </div>
      </nav>

    </div>
  );
}
