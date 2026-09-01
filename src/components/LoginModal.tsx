/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { 
  ShieldCheck, 
  ArrowRight, 
  Lock, 
  User, 
  Eye, 
  EyeOff, 
  CheckCircle2,
  Building2,
  Zap,
  ShieldAlert,
  AlertCircle,
  HelpCircle,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { BursarSession, SchoolProfile } from '../types';
import { DGOSLogo } from './DGOSLogo';
import { signInWithGoogle, getCurrentFirebaseUser, subscribeAuthState } from '../services/firebase';
import { getStoredBranding, subscribeBranding, AppBrandingConfig } from '../services/brandingService';
import { 
  authenticateCredentials, 
  getStoredSystemUsers, 
  fetchSystemUsersFromFirestore, 
  UserRole, 
  SystemUserAccount 
} from '../services/userAccountService';

interface LoginModalProps {
  session: BursarSession;
  schools?: SchoolProfile[];
  activeSchool?: SchoolProfile;
  onSelectSchool?: (schoolId: string) => void;
  onLogin: (sessionUpdates: { bursarName: string; username?: string; role: 'admin' | 'bursar'; userTitle?: string }) => void;
}

export const LoginModal: React.FC<LoginModalProps> = ({ 
  session, 
  schools = [], 
  activeSchool, 
  onSelectSchool, 
  onLogin 
}) => {
  const [branding, setBranding] = useState<AppBrandingConfig>(() => getStoredBranding());
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [selectedSchoolId, setSelectedSchoolId] = useState(activeSchool?.id || session.schoolId || 'eminent-academy');
  const [error, setError] = useState<string | null>(null);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [isGoogleSigningIn, setIsGoogleSigningIn] = useState(false);
  const [showDefaultCredentials, setShowDefaultCredentials] = useState(false);
  const [, setFirebaseUser] = useState(getCurrentFirebaseUser());
  const [systemUsers, setSystemUsers] = useState<Record<UserRole, SystemUserAccount>>(() => getStoredSystemUsers(selectedSchoolId));

  useEffect(() => {
    const unsubBranding = subscribeBranding((updated) => setBranding(updated));
    const unsubAuth = subscribeAuthState((u) => {
      setFirebaseUser(u);
    });

    fetchSystemUsersFromFirestore(selectedSchoolId).then((users) => {
      setSystemUsers(users);
    });

    return () => {
      unsubBranding();
      unsubAuth();
    };
  }, [selectedSchoolId]);

  const currentSchool = schools.find((s) => s.id === selectedSchoolId) || activeSchool || {
    id: 'eminent-academy',
    name: branding.appName || session.schoolName || 'Eminent Royal Crown Academy',
    currencySymbol: branding.currencySymbol || session.currencySymbol || '₦',
    motto: branding.tagline || 'Knowledge and achievements',
  };

  const handleSchoolChange = (schoolId: string) => {
    setSelectedSchoolId(schoolId);
    if (onSelectSchool) {
      onSelectSchool(schoolId);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmedUser = username.trim();
    const trimmedPass = password.trim();

    if (!trimmedUser || !trimmedPass) {
      setError('Please enter both your username and password.');
      return;
    }

    setIsAuthenticating(true);
    try {
      const result = await authenticateCredentials(trimmedUser, trimmedPass, selectedSchoolId);
      if (!result.success || !result.user) {
        setError(result.error || 'Invalid credentials. Please contact the School Administrator.');
        setIsAuthenticating(false);
        return;
      }

      const user = result.user;
      onLogin({
        bursarName: user.fullName,
        username: user.username,
        role: user.role,
        userTitle: user.title,
      });
    } catch (err: any) {
      setError(err?.message || 'Login error occurred. Please try again.');
    } finally {
      setIsAuthenticating(false);
    }
  };

  const handleFillRolePreset = (role: 'admin' | 'bursar') => {
    setError(null);
    const user = systemUsers[role];
    setUsername(user.username);
    setPassword(user.password);
  };

  const handleGoogleSignIn = async () => {
    setError(null);
    setIsGoogleSigningIn(true);
    try {
      const user = await signInWithGoogle();
      if (user) {
        const name = user.displayName || user.email?.split('@')[0] || 'Administrator';
        onLogin({
          bursarName: name,
          username: user.email || 'google_admin',
          role: 'admin',
          userTitle: 'Google Authenticated Admin',
        });
      }
    } catch (err: any) {
      console.warn('Google sign-in status:', err);
      setError(err?.message || 'Google Sign-in failed. Please try username/password login.');
    } finally {
      setIsGoogleSigningIn(false);
    }
  };

  return (
    <div className="min-h-screen w-full bg-[#090d16] text-slate-100 flex flex-col justify-center items-center p-4 sm:p-6 relative overflow-y-auto selection:bg-indigo-600 selection:text-white">
      {/* Ambient background glows */}
      <div className="absolute top-1/4 -left-32 w-96 h-96 bg-purple-600/15 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 -right-32 w-96 h-96 bg-indigo-600/15 rounded-full blur-3xl pointer-events-none" />

      {/* Subtle geometric grid backdrop */}
      <div 
        className="absolute inset-0 opacity-[0.03] pointer-events-none bg-[radial-gradient(#fff_1px,transparent_1px)] [background-size:24px_24px]"
      />

      <div className="w-full max-w-md relative z-10 space-y-4 my-auto py-6">
        
        {/* MANDATORY ACCESS RESTRICTION BANNER */}
        <div className="p-4 rounded-2xl bg-amber-950/40 border border-amber-500/40 shadow-lg shadow-black/40 text-amber-200 flex items-start gap-3.5 backdrop-blur-md">
          <div className="w-9 h-9 rounded-xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center shrink-0 text-amber-400 mt-0.5">
            <ShieldAlert className="w-5 h-5" />
          </div>
          <div className="space-y-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-black uppercase tracking-wider text-amber-300">
                Access Restricted
              </span>
              <span className="text-[9px] font-black px-1.5 py-0.2 rounded bg-amber-400/20 text-amber-300 uppercase">
                Staff Only
              </span>
            </div>
            <p className="text-xs font-bold text-white">
              No public registration allowed.
            </p>
            <p className="text-[11px] text-amber-200/90 leading-relaxed font-medium">
              Please contact the <strong>School Administrator or Proprietor</strong> for your official login credentials.
            </p>
          </div>
        </div>

        {/* Main Login Card */}
        <div className="bg-slate-900/95 backdrop-blur-xl border border-slate-800 rounded-3xl p-6 sm:p-7 shadow-2xl shadow-black/80 space-y-5">
          {/* Logo & School Header */}
          <div className="flex flex-col items-center text-center space-y-3">
            <div className="relative">
              <DGOSLogo size="lg" />
              <div className="absolute -bottom-1 -right-1 p-1 bg-emerald-500 rounded-full border-2 border-slate-900" title="System Security Active">
                <CheckCircle2 className="w-3.5 h-3.5 text-white" />
              </div>
            </div>

            <div>
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-[10px] font-black uppercase tracking-wider mb-1.5">
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>Financial Management Gateway</span>
              </div>
              <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight">
                {currentSchool.name}
              </h1>
              <p className="text-xs text-slate-400 font-medium italic mt-0.5">
                {currentSchool.motto || 'Knowledge and achievements'}
              </p>
            </div>
          </div>

          {/* School Switcher (if multiple schools exist) */}
          {schools.length > 1 && (
            <div className="p-2.5 rounded-2xl bg-slate-800/60 border border-slate-700/60 space-y-1.5">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                <Building2 className="w-3 h-3 text-indigo-400" />
                <span>Target School Branch</span>
              </label>
              <select
                value={selectedSchoolId}
                onChange={(e) => handleSchoolChange(e.target.value)}
                className="w-full bg-slate-800 text-white text-xs font-semibold rounded-xl px-2.5 py-1.5 border border-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
              >
                {schools.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.currencySymbol || '₦'})
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Login Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-[11px] font-bold text-slate-300 uppercase tracking-wider mb-1.5">
                Username or Staff ID
              </label>
              <div className="relative">
                <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  required
                  autoFocus
                  id="system-login-username-input"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Enter your assigned username"
                  className="w-full pl-10 pr-3.5 py-3 text-xs font-mono font-semibold bg-slate-800/90 text-white rounded-2xl border border-slate-700 focus:bg-slate-800 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 focus:outline-none transition-all placeholder:text-slate-500"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-[11px] font-bold text-slate-300 uppercase tracking-wider">
                  Password
                </label>
                <span className="text-[10px] text-slate-400 font-medium">
                  Case-sensitive
                </span>
              </div>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  id="system-login-password-input"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter account password"
                  className="w-full pl-10 pr-10 py-3 text-xs font-mono font-semibold bg-slate-800/90 text-white rounded-2xl border border-slate-700 focus:bg-slate-800 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 focus:outline-none transition-all placeholder:text-slate-500"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 p-1 cursor-pointer"
                  title={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {error && (
              <div className="p-3 rounded-2xl bg-rose-500/15 border border-rose-500/30 text-rose-200 text-xs font-medium flex items-start gap-2.5 animate-in fade-in duration-150">
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                <div className="flex-1 text-[11px] leading-snug">{error}</div>
              </div>
            )}

            <button
              type="submit"
              disabled={isAuthenticating}
              id="system-login-submit-btn"
              className="w-full py-3.5 px-4 rounded-2xl bg-gradient-to-r from-indigo-600 via-indigo-500 to-purple-600 hover:from-indigo-500 hover:to-purple-500 active:scale-[0.99] text-white font-black text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/30 cursor-pointer disabled:opacity-50 mt-2"
            >
              <span>{isAuthenticating ? 'Authenticating Role...' : 'Sign In to Portal'}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>

          {/* Quick role fill for authorized testing */}
          <div className="space-y-2 pt-1 border-t border-slate-800/80">
            <button
              type="button"
              onClick={() => setShowDefaultCredentials(!showDefaultCredentials)}
              className="w-full flex items-center justify-between text-[11px] font-bold text-slate-400 hover:text-slate-300 py-1 transition-colors cursor-pointer"
            >
              <span className="flex items-center gap-1.5">
                <HelpCircle className="w-3.5 h-3.5 text-indigo-400" />
                <span>Initial Staff Setup Presets</span>
              </span>
              {showDefaultCredentials ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>

            {showDefaultCredentials && (
              <div className="p-3 bg-slate-800/50 rounded-2xl border border-slate-700/60 space-y-2.5 animate-in fade-in duration-150">
                <p className="text-[10px] text-slate-400">
                  Click a role to populate credentials, then click <strong>Sign In</strong>:
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => handleFillRolePreset('admin')}
                    className="p-2.5 rounded-xl bg-purple-950/50 hover:bg-purple-900/60 border border-purple-800/60 text-left transition-all cursor-pointer group"
                  >
                    <div className="text-[11px] font-black text-purple-300 group-hover:text-white">👑 Administrator</div>
                    <div className="text-[10px] text-slate-400 font-mono mt-0.5">@{systemUsers.admin.username}</div>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleFillRolePreset('bursar')}
                    className="p-2.5 rounded-xl bg-blue-950/50 hover:bg-blue-900/60 border border-blue-800/60 text-left transition-all cursor-pointer group"
                  >
                    <div className="text-[11px] font-black text-blue-300 group-hover:text-white">💼 Bursar Officer</div>
                    <div className="text-[10px] text-slate-400 font-mono mt-0.5">@{systemUsers.bursar.username}</div>
                  </button>
                </div>
                <p className="text-[9px] text-slate-500 italic">
                  Note: Administrator can customize these passwords anytime in System Settings.
                </p>
              </div>
            )}
          </div>

          {/* Google Sign In option */}
          <div className="pt-1">
            <button
              type="button"
              onClick={handleGoogleSignIn}
              disabled={isGoogleSigningIn}
              id="firebase-google-login-btn"
              className="w-full py-2.5 px-4 rounded-2xl bg-slate-800/80 hover:bg-slate-800 text-slate-300 border border-slate-700/80 font-bold text-xs tracking-wide transition-all flex items-center justify-center gap-2 shadow-xs cursor-pointer disabled:opacity-50"
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
              </svg>
              <span>{isGoogleSigningIn ? 'Connecting to Google...' : 'Sign in as Google Master Admin'}</span>
            </button>
          </div>

          {/* Security details footer */}
          <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between text-[10px] text-slate-400">
            <div className="flex items-center gap-1.5 text-emerald-400 font-semibold">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>RBAC Policy Enforced</span>
            </div>
            <div className="flex items-center gap-1 text-slate-400">
              <Zap className="w-3 h-3 text-amber-400" />
              <span>Cloud Firestore Active</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
