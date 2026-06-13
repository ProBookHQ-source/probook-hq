import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format, parseISO } from 'date-fns';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import api from '../api/client';
import {
  LayoutDashboard, Users, FileText, Calendar, LogOut, Zap,
  Plus, RefreshCw, TrendingUp, Clock, CheckCircle, XCircle,
  ChevronDown, Search, Filter, Trash2
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
  const [leadFilter, setLeadFilter] = useState('');
  const qc = useQueryClient();

  const { data: leads = [] } = useQuery({
    queryKey: ['admin-leads'],
    queryFn: () => api.get('/leads').then(r => r.data),
  });

  const { data: contractors = [] } = useQuery({
    queryKey: ['admin-contractors'],
    queryFn: () => api.get('/contractors').then(r => r.data),
  });

  const { data: appointments = [] } = useQuery({
    queryKey: ['admin-appointments'],
    queryFn: () => api.get('/bookings').then(r => r.data),
  });

  const { data: niches = [] } = useQuery({
    queryKey: ['niches'],
    queryFn: () => api.get('/leads/meta/niches').then(r => r.data),
  });

  const matchLead = useMutation({
    mutationFn: (id) => api.post(`/leads/${id}/match`),
    onSuccess: (res) => {
      toast.success(res.data.message);
      qc.invalidateQueries(['admin-leads']);
    },
    onError: (err) => toast.error(err.response?.data?.error || 'Match failed'),
  });

  const deleteLead = useMutation({
    mutationFn: (id) => api.delete(`/leads/${id}`),
    onSuccess: () => {
      toast.success('Lead deleted');
      qc.invalidateQueries(['admin-leads']);
    },
    onError: (err) => toast.error(err.response?.data?.error || 'Delete failed'),
  });

  const deleteContractor = useMutation({
    mutationFn: (id) => api.delete(`/contractors/${id}`),
    onSuccess: () => {
      toast.success('Contractor deleted');
      qc.invalidateQueries(['admin-contractors']);
      qc.invalidateQueries(['admin-leads']);
    },
    onError: (err) => toast.error(err.response?.data?.error || 'Delete failed'),
  });

  const addContractor = useMutation({
    mutationFn: (data) => api.post('/contractors', data),
    onSuccess: () => {
      toast.success('Contractor added!');
      qc.invalidateQueries(['admin-contractors']);
      setShowAddContractor(false);
      contractorForm.reset();
    },
    onError: (err) => toast.error(err.response?.data?.error || 'Failed to add contractor'),
  });

  const contractorForm = useForm();
  const onAddContractor = (data) => {
    const zips = data.service_zip_codes.split(',').map(z => z.trim()).filter(Boolean);
    addContractor.mutate({ ...data, service_zip_codes: zips });
  };

  const logout = () => { localStorage.clear(); window.location.href = '/login'; };

  // Stats
  const stats = [
    { label: 'Total Leads',      value: leads.length,                                  icon: FileText,  color: 'text-blue-600',   bg: 'bg-blue-50' },
    { label: 'Active Bookings',  value: appointments.filter(a => a.status === 'confirmed').length, icon: Calendar,  color: 'text-purple-600', bg: 'bg-purple-50' },
    { label: 'Contractors',      value: contractors.filter(c => c.is_active).length,   icon: Users,     color: 'text-green-600',  bg: 'bg-green-50' },
    { label: 'Completed',        value: leads.filter(l => l.status === 'completed').length, icon: CheckCircle, color: 'text-emerald-600', bg: 'bg-emerald-50' },
  ];

  const filteredLeads = leads.filter(l =>
    !leadFilter || l.name?.toLowerCase().includes(leadFilter.toLowerCase()) ||
    l.email?.toLowerCase().includes(leadFilter.toLowerCase()) ||
    l.zip_code?.includes(leadFilter) || l.niche_name?.toLowerCase().includes(leadFilter.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Sidebar */}
      <div className="fixed inset-y-0 left-0 w-56 bg-white border-r border-gray-100 flex flex-col z-10">
        <div className="p-5 border-b border-gray-100">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-brand-500 rounded-lg flex items-center justify-center">
              <Zap className="w-4 h-4 text-white" />
            </div>
            <div>
              <p className="font-bold text-gray-900 text-sm">ProBook</p>
              <p className="text-xs text-gray-400">Admin</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 p-3 space-y-1">
          {[
            { id: 'overview', label: 'Overview', icon: LayoutDashboard },
            { id: 'leads', label: 'Leads', icon: FileText, badge: leads.filter(l => l.status === 'new').length },
            { id: 'contractors', label: 'Contractors', icon: Users },
            { id: 'appointments', label: 'Appointments', icon: Calendar },
          ].map(({ id, label, icon: Icon, badge }) => (
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

      {/* Main content */}
      <div className="ml-56 p-6">

        {/* ── OVERVIEW ── */}
        {tab === 'overview' && (
          <div>
            <h1 className="text-2xl font-bold text-gray-900 mb-6">Dashboard</h1>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
              {stats.map(({ label, value, icon: Icon, color, bg }) => (
                <div key={label} className="card">
                  <div className={`inline-flex items-center justify-center w-10 h-10 ${bg} rounded-xl mb-3`}>
                    <Icon className={`w-5 h-5 ${color}`} />
                  </div>
                  <p className="text-2xl font-bold text-gray-900">{value}</p>
                  <p className="text-sm text-gray-500">{label}</p>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="card">
                <h3 className="font-semibold mb-4">Recent Leads</h3>
                <div className="space-y-3">
                  {leads.slice(0, 5).map(lead => (
                    <div key={lead.id} className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-gray-900">{lead.name}</p>
                        <p className="text-xs text-gray-400">{lead.niche_name} · {lead.zip_code}</p>
                      </div>
                      <span className={`badge ${STATUS_BADGE[lead.status]}`}>{lead.status}</span>
                    </div>
                  ))}
                  {leads.length === 0 && <p className="text-sm text-gray-400 text-center py-4">No leads yet</p>}
                </div>
              </div>

              <div className="card">
                <h3 className="font-semibold mb-4">Upcoming Appointments</h3>
                <div className="space-y-3">
                  {appointments.filter(a => a.status === 'confirmed').slice(0, 5).map(appt => (
                    <div key={appt.id} className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-gray-900">{appt.lead_name}</p>
                        <p className="text-xs text-gray-400">{format(parseISO(appt.scheduled_date), 'MMM d')} at {appt.scheduled_time} · {appt.contractor_name}</p>
                      </div>
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
            <div className="flex items-center justify-between mb-6">
              <h1 className="text-2xl font-bold text-gray-900">Leads</h1>
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  value={leadFilter}
                  onChange={e => setLeadFilter(e.target.value)}
                  placeholder="Search leads..."
                  className="input pl-9 w-56"
                />
              </div>
            </div>
            <div className="card p-0 overflow-hidden">
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
                    <tr key={lead.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <p className="text-sm font-medium text-gray-900">{lead.name}</p>
                        <p className="text-xs text-gray-400">{lead.email}</p>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">{lead.niche_name}</td>
                      <td className="px-4 py-3 text-sm text-gray-600">{lead.zip_code}</td>
                      <td className="px-4 py-3">
                        <span className={`badge ${STATUS_BADGE[lead.status]}`}>{lead.status}</span>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">{lead.contractor_name || '—'}</td>
                      <td className="px-4 py-3 text-xs text-gray-400">{format(parseISO(lead.created_at), 'MMM d')}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          {(lead.status === 'new' || lead.status === 'matched') && (
                            <button
                              onClick={() => matchLead.mutate(lead.id)}
                              disabled={matchLead.isPending}
                              className="flex items-center gap-1 text-xs text-brand-600 hover:text-brand-700 font-medium"
                            >
                              <RefreshCw className="w-3 h-3" />
                              {lead.status === 'new' ? 'Match' : 'Re-match'}
                            </button>
                          )}
                          <button
                            onClick={() => {
                              if (confirm(`Delete lead "${lead.name}"?`)) deleteLead.mutate(lead.id);
                            }}
                            className="flex items-center gap-1 text-xs text-red-500 hover:text-red-700 font-medium"
                          >
                            <Trash2 className="w-3 h-3" />
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
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
            <div className="flex items-center justify-between mb-6">
              <h1 className="text-2xl font-bold text-gray-900">Contractors</h1>
              <button onClick={() => setShowAddContractor(true)} className="btn-primary">
                <Plus className="w-4 h-4" /> Add Contractor
              </button>
            </div>

            {showAddContractor && (
              <div className="card mb-6 border-brand-100 border-2">
                <h3 className="font-semibold mb-4">Add New Contractor</h3>
                <form onSubmit={contractorForm.handleSubmit(onAddContractor)} className="grid grid-cols-2 gap-4">
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
                    <input {...contractorForm.register('phone')} className="input" placeholder="(555) 000-0000" />
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
                    <input {...contractorForm.register('service_zip_codes', { required: true })} className="input" placeholder="10001, 10002, 10003 (or * for all)" />
                    <p className="text-xs text-gray-400 mt-1">Comma-separated. Use * to serve all zips.</p>
                  </div>
                  <div>
                    <label className="label">Temporary Password *</label>
                    <input {...contractorForm.register('password', { required: true })} type="password" className="input" placeholder="They can change this later" />
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
              {contractors.map(c => (
                <div key={c.id} className={`card ${!c.is_active ? 'opacity-60' : ''}`}>
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <p className="font-semibold text-gray-900">{c.name}</p>
                      {c.company_name && <p className="text-sm text-gray-500">{c.company_name}</p>}
                    </div>
                    <span className={`badge ${c.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                      {c.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 mb-1">{c.email}</p>
                  <p className="text-xs text-gray-500 mb-2">{c.phone}</p>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="badge bg-brand-100 text-brand-700">{c.niche_name}</span>
                    <span className="text-xs text-gray-400">
                      {(() => { try { const z = JSON.parse(c.service_zip_codes); return z.length > 3 ? `${z.slice(0,3).join(', ')}…` : z.join(', '); } catch { return c.service_zip_codes; } })()}
                    </span>
                  </div>
                  {c.google_refresh_token && (
                    <p className="text-xs text-green-600 mt-2 flex items-center gap-1"><CheckCircle className="w-3 h-3" /> Google Calendar linked</p>
                  )}
                  <div className="mt-3 pt-3 border-t border-gray-100">
                    <button
                      onClick={() => {
                        if (confirm(`Delete contractor "${c.name}"? This cannot be undone.`)) deleteContractor.mutate(c.id);
                      }}
                      className="flex items-center gap-1 text-xs text-red-500 hover:text-red-700 font-medium"
                    >
                      <Trash2 className="w-3 h-3" />
                      Delete Contractor
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── APPOINTMENTS ── */}
        {tab === 'appointments' && (
          <div>
            <h1 className="text-2xl font-bold text-gray-900 mb-6">Appointments</h1>
            <div className="card p-0 overflow-hidden">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    {['Homeowner', 'Contractor', 'Niche', 'Date & Time', 'Status'].map(h => (
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
                        <p className="text-xs text-gray-400">{appt.scheduled_time}</p>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`badge ${STATUS_BADGE[appt.status] || 'bg-gray-100 text-gray-600'}`}>{appt.status}</span>
                      </td>
                    </tr>
                  ))}
                  {appointments.length === 0 && (
                    <tr><td colSpan={5} className="text-center py-10 text-gray-400 text-sm">No appointments yet</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
