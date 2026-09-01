/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { 
  RotateCw, 
  Settings, 
  WifiOff, 
  CheckCircle2, 
  AlertTriangle,
  UserCheck,
  Zap,
  Cloud,
  FileSpreadsheet,
  Database,
  LogOut,
  Shield,
  User
} from 'lucide-react';
import { BursarSession, SchoolProfile } from '../types';
import { DGOSLogo } from './DGOSLogo';
import { SyncStatus } from '../services/firebase';
import { getStoredBranding, subscribeBranding, AppBrandingConfig } from '../services/brandingService';
import { PWAInstallButton } from './PWAInstallButton';

interface HeaderProps {
  session: BursarSession;
  isOnline: boolean;
  isLoading: boolean;
  onRefresh: () => void;
  onOpenSettings: () => void;
  onOpenAddStudent: () => void;
  onOpenSheetUpload?: () => void;
  onOpenMigrator?: () => void;
  onLogout?: () => void;
  studentCount: number;
  activeSchool?: SchoolProfile;
  syncStatus?: SyncStatus;
}

export const Header: React.FC<HeaderProps> = ({
  session,
  isOnline,
  isLoading,
  onRefresh,
  onOpenSettings,
  onOpenAddStudent,
  onOpenSheetUpload,
  onOpenMigrator,
  onLogout,
  studentCount,
  syncStatus,
}) => {
  const [branding, setBranding] = useState<AppBrandingConfig>(() => getStoredBranding());

  useEffect(() => {
    const unsub = subscribeBranding((updated) => setBranding(updated));
    return unsub;
  }, []);

  const isAdmin = session.role === 'admin';

  return (
    <header className="shrink-0 bg-white border-b border-[#f0f0f0] px-4 sm:px-5 py-3.5 z-30">
      <div className="flex items-center justify-between gap-2">
        
        {/* Branding */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2.5 flex-wrap">
            <div className="flex items-center gap-2.5">
              <DGOSLogo size="sm" />
              <div className="flex flex-col min-w-0">
                <div className="flex items-center gap-2">
                  <h1 className="text-base sm:text-lg font-black tracking-tight text-[#0f172a] uppercase leading-none truncate max-w-[200px] sm:max-w-xs md:max-w-md">
                    {branding.shortName || branding.appName.substring(0, 15)}
                  </h1>
                </div>
                <span className="text-[10px] font-bold text-slate-600 tracking-wider uppercase mt-0.5 truncate max-w-[220px] sm:max-w-sm md:max-w-lg">
                  {branding.appName || session.schoolName}
                </span>
              </div>
            </div>
          </div>

          {/* Status Indicators */}
          <div className="flex items-center gap-2 text-[11px] text-[#a0a0a0] mt-1 font-medium flex-wrap">
            {/* User Role Badge */}
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-black text-[10px] uppercase tracking-wider ${
              isAdmin ? 'bg-purple-100 text-purple-900 border border-purple-200' : 'bg-blue-100 text-blue-900 border border-blue-200'
            }`}>
              {isAdmin ? <Shield className="w-3 h-3 text-purple-700" /> : <User className="w-3 h-3 text-blue-700" />}
              <span>{isAdmin ? 'Admin' : 'Bursar'}: {session.bursarName}</span>
            </span>

            <span>•</span>

            <span className="flex items-center gap-1">
              {isOnline ? (
                <span className="inline-flex items-center gap-1 text-[#10b981] font-bold">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#10b981] animate-pulse"></span>
                  Online
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-[#ef4444] font-bold">
                  <WifiOff className="w-3 h-3" />
                  Offline
                </span>
              )}
            </span>

            <span>•</span>

            {/* Cloud Firestore Fast Engine indicator */}
            <button
              onClick={onOpenSettings}
              id="firebase-cloud-indicator"
              title={syncStatus?.lastFirebaseSyncTime ? `Last synced with Firestore at: ${syncStatus.lastFirebaseSyncTime}` : 'Cloud Database: Real-time Firestore synchronization active'}
              className="inline-flex items-center gap-1.5 text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full font-semibold hover:bg-emerald-100 transition-colors cursor-pointer border border-emerald-200"
            >
              <Zap className="w-3.5 h-3.5 text-emerald-600 fill-emerald-500" />
              <span>Firebase Cloud Live</span>
            </button>

            {onOpenMigrator && (
              <>
                <span>•</span>
                <button
                  onClick={onOpenMigrator}
                  id="header-migrate-now-btn"
                  title="Migrate Google Sheets data to Firebase Cloud"
                  className="inline-flex items-center gap-1 text-blue-700 bg-blue-50 hover:bg-blue-100 px-2 py-0.5 rounded-full font-bold transition-all border border-blue-200 cursor-pointer"
                >
                  <Zap className="w-3 h-3 text-blue-600 fill-blue-500" />
                  <span>Migrate Sheets</span>
                </button>
              </>
            )}

            <span>•</span>
            <span className="text-slate-600 font-bold">{studentCount} Students</span>
          </div>
        </div>

        {/* Circular Action Controls */}
        <div className="flex items-center gap-1.5 shrink-0">
          {/* PWA 1-Tap App Install Button */}
          <PWAInstallButton variant="header" />

          {/* Migrate Button */}
          {onOpenMigrator && (
            <button
              onClick={onOpenMigrator}
              id="header-action-migrator-btn"
              title="1-Click Google Sheet to Firebase Migrator"
              className="hidden sm:flex items-center gap-1.5 px-3 py-2 rounded-full bg-gradient-to-r from-blue-600 to-indigo-700 hover:from-blue-700 hover:to-indigo-800 text-white font-black text-xs shadow-xs cursor-pointer active:scale-95 transition-all"
            >
              <Zap className="w-3.5 h-3.5 fill-white" />
              <span>Migrate to Firebase</span>
            </button>
          )}

          {/* Upload Excel / CSV File */}
          {onOpenSheetUpload && (
            <button
              onClick={onOpenSheetUpload}
              id="header-sheet-upload-btn"
              title="Import Student Roster from Excel / CSV"
              className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-emerald-50 text-emerald-700 hover:bg-emerald-100 active:scale-95 flex items-center justify-center transition-all border border-emerald-200 cursor-pointer"
            >
              <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
            </button>
          )}

          {/* Quick Add Existing Student */}
          <button
            onClick={onOpenAddStudent}
            id="quick-add-student-btn"
            title="Add Existing Student"
            className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-[#1a1a1a] text-white flex items-center justify-center hover:bg-black active:scale-95 transition-all shadow-xs cursor-pointer"
          >
            <UserCheck className="w-4 h-4 text-emerald-400" />
          </button>

          {/* Sync / Refresh */}
          <button
            onClick={onRefresh}
            disabled={isLoading}
            id="sync-refresh-btn"
            title="Refresh & Synchronize with Firebase Firestore"
            className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-[#f4f4f7] text-[#1a1a1a] flex items-center justify-center hover:bg-slate-200 active:scale-95 disabled:opacity-50 transition-all border border-[#eee] cursor-pointer"
          >
            <RotateCw className={`w-4 h-4 ${isLoading ? 'animate-spin text-[#2563eb]' : ''}`} />
          </button>

          {/* Settings */}
          <button
            onClick={onOpenSettings}
            id="open-settings-btn"
            title="Settings & Cloud Database"
            className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-[#f4f4f7] text-[#1a1a1a] flex items-center justify-center hover:bg-slate-200 active:scale-95 transition-all border border-[#eee] relative cursor-pointer"
          >
            <Settings className="w-4 h-4" />
          </button>

          {/* Logout / Lock System */}
          {onLogout && (
            <button
              onClick={onLogout}
              id="header-lock-logout-btn"
              title="Lock System / Log Out"
              className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-rose-50 text-rose-700 flex items-center justify-center hover:bg-rose-100 active:scale-95 transition-all border border-rose-200 cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </header>
  );
};
