import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import api from '../api/client';
import { Link } from 'react-router-dom';
import { LogIn, Eye, EyeOff } from 'lucide-react';

export default function LoginPage() {
  const [role, setRole] = useState('contractor');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const navigate = useNavigate();
  const { register, handleSubmit, formState: { errors } } = useForm();

  const onSubmit = async (data) => {
    setLoading(true);
    try {
      const endpoint = role === 'admin' ? '/auth/admin/login' : '/auth/contractor/login';
      const res = await api.post(endpoint, data);
      localStorage.setItem('token', res.data.token);
      localStorage.setItem('user', JSON.stringify(res.data.user));
      toast.success(`Welcome back, ${res.data.user.name}!`);
      navigate(role === 'admin' ? '/admin' : '/contractor');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-50 via-white to-purple-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <img src="/probook-icon-128.png" alt="ProBook" className="w-14 h-14 rounded-2xl shadow-lg mb-4 mx-auto" />
          <h1 className="text-2xl font-bold text-gray-900">ProBook</h1>
          <p className="text-gray-500 text-sm mt-1">Smart contractor scheduling</p>
        </div>

        <div className="card shadow-lg border-gray-100">
          {/* Role Toggle */}
          <div className="flex rounded-xl overflow-hidden border border-gray-200 mb-6">
            {['contractor', 'admin'].map(r => (
              <button
                key={r}
                onClick={() => setRole(r)}
                className={`flex-1 py-2.5 text-sm font-semibold capitalize transition-all ${
                  role === r ? 'bg-brand-500 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'
                }`}
              >
                {r}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <label className="label">Email address</label>
              <input
                {...register('email', { required: 'Email required', pattern: { value: /\S+@\S+\.\S+/, message: 'Invalid email' } })}
                type="email"
                className="input"
                placeholder="you@example.com"
              />
              {errors.email && <p className="text-red-500 text-xs mt-1">{errors.email.message}</p>}
            </div>

            <div>
              <label className="label">Password</label>
              <div className="relative">
                <input
                  {...register('password', { required: 'Password required' })}
                  type={showPassword ? 'text' : 'password'}
                  className="input pr-10"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(p => !p)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {errors.password && <p className="text-red-500 text-xs mt-1">{errors.password.message}</p>}
            </div>

            <button type="submit" disabled={loading} className="btn-primary w-full justify-center mt-2">
              <LogIn className="w-4 h-4" />
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>

          {role === 'contractor' && (
            <p className="text-center text-sm mt-4">
              <Link to="/forgot-password" className="text-gray-400 hover:text-brand-500 text-xs transition-colors">
                Forgot your password?
              </Link>
            </p>
          )}
        </div>

        {role === 'contractor' && (
          <p className="text-center text-sm text-gray-500 mt-4">
            Want to partner with us?{' '}
            <Link to="/apply" className="text-brand-500 font-semibold hover:underline">
              Apply here
            </Link>
          </p>
        )}

        <p className="text-center text-xs text-gray-400 mt-4">
          Powered by ProBook — Lead Generation & Scheduling
        </p>
      </div>
    </div>
  );
}
