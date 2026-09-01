/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { safeStorage } from './safeStorage';

export interface AppBrandingConfig {
  appName: string;
  shortName: string;
  tagline: string;
  logoType: 'default_crest' | 'custom_upload' | 'url' | 'preset_emblem';
  customLogoData?: string;
  presetEmblem: 'crown' | 'shield' | 'mortarboard' | 'book' | 'torch' | 'crest' | 'star' | 'building' | 'globe' | 'feather' | 'laurel' | 'compass';
  emblemColor: string;
  primaryColor: string;
  schoolAddress: string;
  schoolPhone: string;
  schoolEmail: string;
  taxOrRegNo: string;
  bursarTitle: string;
  currencySymbol: string;
  receiptFooterText: string;
  enableWatermark: boolean;
}

const BRANDING_STORAGE_KEY = 'eminent_app_branding_v1';

export const DEFAULT_BRANDING: AppBrandingConfig = {
  appName: (import.meta as any).env?.VITE_APP_NAME || 'Eminent Royal Crown Academy',
  shortName: (import.meta as any).env?.VITE_APP_SHORT_NAME || 'EMINENT A/C',
  tagline: (import.meta as any).env?.VITE_APP_TAGLINE || 'Automated School Fee & Bursary Management System',
  logoType: (import.meta as any).env?.VITE_APP_LOGO_URL ? 'url' : 'default_crest',
  customLogoData: (import.meta as any).env?.VITE_APP_LOGO_URL || '',
  presetEmblem: 'crown',
  emblemColor: (import.meta as any).env?.VITE_PRIMARY_COLOR || '#0044B5',
  primaryColor: (import.meta as any).env?.VITE_PRIMARY_COLOR || '#0044B5',
  schoolAddress: (import.meta as any).env?.VITE_SCHOOL_ADDRESS || 'Keffi, Nasarawa State, Nigeria',
  schoolPhone: (import.meta as any).env?.VITE_SCHOOL_PHONE || '+234 800 000 0000',
  schoolEmail: (import.meta as any).env?.VITE_SCHOOL_EMAIL || 'bursary@eminentacademy.edu.ng',
  taxOrRegNo: (import.meta as any).env?.VITE_SCHOOL_REG_NO || 'MOE/NAS/SEC/2026/894',
  bursarTitle: 'Authorized Bursar / Accounts Officer',
  currencySymbol: (import.meta as any).env?.VITE_CURRENCY_SYMBOL || '₦',
  receiptFooterText: 'Official School Fee & Bursary Computerized Payment Receipt. Valid only with authorized bursar signature & stamp.',
  enableWatermark: true,
};

type BrandingChangeListener = (branding: AppBrandingConfig) => void;
const listeners: Set<BrandingChangeListener> = new Set();

/**
 * Retrieves the currently active school branding configuration
 */
export function getStoredBranding(): AppBrandingConfig {
  try {
    const raw = safeStorage.getItem(BRANDING_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_BRANDING };
    const parsed = JSON.parse(raw);
    return {
      ...DEFAULT_BRANDING,
      ...parsed,
    };
  } catch (err) {
    console.warn('[Branding] Failed to parse stored branding, using default:', err);
    return { ...DEFAULT_BRANDING };
  }
}

/**
 * Saves and broadcasts new school branding configuration
 */
export function saveStoredBranding(config: Partial<AppBrandingConfig>): AppBrandingConfig {
  const current = getStoredBranding();
  const updated: AppBrandingConfig = {
    ...current,
    ...config,
  };

  try {
    safeStorage.setItem(BRANDING_STORAGE_KEY, JSON.stringify(updated));
  } catch (err) {
    console.error('[Branding] Failed to save branding config:', err);
  }

  // Update HTML document title dynamically
  if (typeof document !== 'undefined') {
    document.title = `${updated.appName} - Bursar Management System`;
  }

  // Notify active listeners
  listeners.forEach((listener) => {
    try {
      listener(updated);
    } catch (e) {
      console.warn('[Branding Listener Error]', e);
    }
  });

  return updated;
}

/**
 * Reset branding to default preset
 */
export function resetStoredBranding(): AppBrandingConfig {
  safeStorage.removeItem(BRANDING_STORAGE_KEY);
  const def = { ...DEFAULT_BRANDING };
  if (typeof document !== 'undefined') {
    document.title = `${def.appName} - Bursar Management System`;
  }
  listeners.forEach((l) => l(def));
  return def;
}

/**
 * Subscribe to branding updates across the app
 */
export function subscribeBranding(listener: BrandingChangeListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
