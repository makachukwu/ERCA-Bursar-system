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
  Sparkles,
  KeyRound,
  Building2,
  Zap,
} from 'lucide-react';
import { BursarSession, SchoolProfile } from '../types';
import { DGOSLogo } from './DGOSLogo';
import { signInWithGoogle, getCurrentFirebaseUser, subscribeAuthState } from '../services/firebase';
import { getStoredBranding, subscribeBranding, AppBrandingConfig } from '../services/brandingService';

interface LoginModalProps {
  session: BursarSession;
  schools?: SchoolProfile[];
  activeSchool?: SchoolProfile;
  onSelectSchool?: (schoolId: string) => void;
  onLogin: (bursarName: string) => void;
}

const QUICK_ROLES = [
  'Head Bursar',
  'Account Officer',
  'Revenue Bursar',
  'School Principal',
];

export const LoginModal: React.FC<LoginModalProps> = ({ 
  session, 
  schools = [], 
  activeSchool, 
  onSelectSchool, 
  onLogin 
}) => {
  const [branding, setBranding] = useState<AppBrandingConfig>(() => getStoredBranding());
  const [bursarName, setBursarName] = useState(session.bursarName || 'Head Bursar');
  const [passcode, setPasscode] = useState('');
  const [showPasscode, setShowPasscode] = useState(false);
  const [selectedSchoolId, setSelectedSchoolId] = useState(activeSchool?.id || session.schoolId || 'eminent-academy');
  const [error, setError] = useState<string | null>(null);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [isGoogleSigningIn, setIsGoogleSigningIn] = useState(false);
  const [firebaseUser, setFirebaseUser] = useState(getCurrentFirebaseUser());

  useEffect(() => {
    const unsubBranding = subscribeBranding((updated) => setBranding(updated));
    const unsubAuth = subscribeAuthState((u) => {
      setFirebaseUser(u);
      if (u && u.displayName) {
        setBursarName(u.displayName);
      }
    });
    return () => {
      unsubBranding();
      unsubAuth();
    };
  }, []);

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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!bursarName.trim()) {
      setError('Please provide a Bursar Name or Officer Title.');
      return;
    }

    setIsAuthenticating(true);

    // Smooth subtle authentication transition
    setTimeout(() => {
      onLogin(bursarName.trim());
      setIsAuthenticating(false);
    }, 250);
  };

  const handleGoogleSignIn = async () => {
    setError(null);
    setIsGoogleSigningIn(true);
    try {
      const user = await signInWithGoogle();
      if (user) {
        const name = user.displayName || user.email?.split('@')[0] || 'Bursar Officer';
        setBursarName(name);
        setTimeout(() => {
          onLogin(name);
        }, 300);
      }
    } catch (err: any) {
      console.warn('Google sign-in status:', err);
      setError(err?.message || 'Google Sign-in failed. Please try again.');
    } finally {
      setIsGoogleSigningIn(false);
    }
  };

  const handleQuickLogin = (role: string) => {
    setBursarName(role);
    setIsAuthenticating(true);
    setTimeout(() => {
      onLogin(role);
      setIsAuthenticating(false);
    }, 200);
  };

  return (
    <div className="min-h-screen w-full bg-[#0b1120] text-slate-100 flex flex-col justify-center items-center p-4 relative overflow-hidden selection:bg-blue-600 selection:text-white">
      {/* Ambient background glows */}
      <div className="absolute top-1/4 -left-32 w-96 h-96 bg-blue-600/20 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 -right-32 w-96 h-96 bg-indigo-600/20 rounded-full blur-3xl pointer-events-none" />

      {/* Subtle geometric grid backdrop */}
      <div 
        className="absolute inset-0 opacity-[0.03] pointer-events-none bg-[radial-gradient(#fff_1px,transparent_1px)] [background-size:24px_24px]"
      />

      <div className="w-full max-w-md relative z-10 space-y-6">
        {/* School Logo & System Emblem Card */}
        <div className="bg-slate-900/90 backdrop-blur-xl border border-slate-800 rounded-3xl p-6 sm:p-7 shadow-2xl shadow-black/60 space-y-6">
          <div className="flex flex-col items-center text-center space-y-3">
            <div className="relative">
              <DGOSLogo size="lg" />
              <div className="absolute -bottom-1 -right-1 p-1 bg-emerald-500 rounded-full border-2 border-slate-900" title="System Ready">
                <CheckCircle2 className="w-3.5 h-3.5 text-white" />
              </div>
            </div>

            <div>
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-[10px] font-black uppercase tracking-wider mb-1.5">
                <Sparkles className="w-3 h-3" />
                <span>Financial & Fee Accounting Portal</span>
              </div>
              <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight">
                {currentSchool.name}
              </h1>
              <p className="text-xs text-slate-400 font-medium italic mt-0.5">
                {currentSchool.motto || 'Knowledge and achievements'}
              </p>
            </div>
          </div>

          {/* School Selector (If multi-school) */}
          {schools.length > 1 && (
            <div className="space-y-1.5">
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                Select School Dashboard
              </label>
              <div className="grid grid-cols-2 gap-2">
                {schools.map((school) => {
                  const isSelected = school.id === selectedSchoolId;
                  return (
                    <button
                      key={school.id}
                      type="button"
                      onClick={() => handleSchoolChange(school.id)}
                      className={`flex items-center gap-2 p-2.5 rounded-2xl border text-left text-xs font-bold transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-blue-600/20 border-blue-500 text-white shadow-sm'
                          : 'bg-slate-800/60 border-slate-700/80 text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                      }`}
                    >
                      <Building2 className={`w-4 h-4 shrink-0 ${isSelected ? 'text-blue-400' : 'text-slate-500'}`} />
                      <span className="truncate">{school.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Login Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-[11px] font-bold text-slate-300 uppercase tracking-wider mb-1.5">
                Bursar / Officer Title
              </label>
              <div className="relative">
                <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  required
                  id="bursar-login-name-input"
                  value={bursarName}
                  onChange={(e) => setBursarName(e.target.value)}
                  placeholder="e.g. Head Bursar"
                  className="w-full pl-10 pr-3.5 py-3 text-sm font-medium bg-slate-800/80 text-white rounded-2xl border border-slate-700 focus:bg-slate-800 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 focus:outline-none transition-all placeholder:text-slate-500"
                />
              </div>
            </div>

            {/* Quick Role Badges */}
            <div className="space-y-1.5">
              <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider block">
                Quick Access Profiles
              </span>
              <div className="flex flex-wrap gap-1.5">
                {QUICK_ROLES.map((role) => (
                  <button
                    key={role}
                    type="button"
                    onClick={() => setBursarName(role)}
                    className={`px-2.5 py-1 rounded-xl text-[11px] font-semibold border transition-all cursor-pointer ${
                      bursarName === role
                        ? 'bg-blue-600 text-white border-blue-500 shadow-xs'
                        : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700 hover:text-white'
                    }`}
                  >
                    {role}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-[11px] font-bold text-slate-300 uppercase tracking-wider">
                  Passcode / PIN <span className="text-slate-500 font-normal lowercase">(optional)</span>
                </label>
              </div>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type={showPasscode ? 'text' : 'password'}
                  id="bursar-login-passcode-input"
                  value={passcode}
                  onChange={(e) => setPasscode(e.target.value)}
                  placeholder="Leave empty or enter PIN"
                  className="w-full pl-10 pr-10 py-3 text-sm font-mono bg-slate-800/80 text-white rounded-2xl border border-slate-700 focus:bg-slate-800 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 focus:outline-none transition-all placeholder:text-slate-500"
                />
                <button
                  type="button"
                  onClick={() => setShowPasscode(!showPasscode)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 transition-colors p-1"
                >
                  {showPasscode ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {error && (
              <div className="p-3 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs font-semibold">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={isAuthenticating || isGoogleSigningIn}
              id="bursar-login-submit-btn"
              className="w-full py-3.5 px-4 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 active:scale-[0.99] text-white font-black text-sm tracking-wide transition-all flex items-center justify-center gap-2 shadow-lg shadow-blue-600/30 cursor-pointer disabled:opacity-50"
            >
              <span>{isAuthenticating ? 'Authenticating Session...' : 'Enter Bursary Fee Portal'}</span>
              <ArrowRight className="w-4 h-4" />
            </button>

            <div className="relative flex py-1 items-center">
              <div className="flex-grow border-t border-slate-800"></div>
              <span className="flex-shrink mx-3 text-[10px] uppercase font-bold text-slate-500 tracking-wider">or sign in with</span>
              <div className="flex-grow border-t border-slate-800"></div>
            </div>

            {/* Google Authentication via Firebase */}
            <button
              type="button"
              onClick={handleGoogleSignIn}
              disabled={isGoogleSigningIn || isAuthenticating}
              id="firebase-google-login-btn"
              className="w-full py-3 px-4 rounded-2xl bg-slate-800 hover:bg-slate-750 active:scale-[0.99] text-slate-200 border border-slate-700 font-bold text-xs tracking-wide transition-all flex items-center justify-center gap-2.5 shadow-sm cursor-pointer disabled:opacity-50"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                />
              </svg>
              <span>{isGoogleSigningIn ? 'Connecting to Google...' : firebaseUser ? `Continue as ${firebaseUser.displayName || firebaseUser.email}` : 'Sign in with Google Account'}</span>
            </button>
          </form>

          {/* Security & Audit Footer */}
          <div className="pt-4 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-500">
            <div className="flex items-center gap-1.5 text-emerald-400 font-semibold">
              <ShieldCheck className="w-4 h-4" />
              <span>Firebase Cloud Auth</span>
            </div>
            <div className="flex items-center gap-1 text-slate-400">
              <Zap className="w-3.5 h-3.5 text-amber-400" />
              <span>Sub-Second Sync</span>
            </div>
          </div>
        </div>

        {/* Brand System Subtext */}
        <p className="text-center text-xs text-slate-500 font-medium">
          DGOS School Accounting & Management OS • Version 2026.1
        </p>
      </div>
    </div>
  );
};
