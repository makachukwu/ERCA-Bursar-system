/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { safeStorage } from './safeStorage';
import { AppBrandingConfig } from '../types';
import { saveBrandingToFirestore, getBrandingFromFirestore } from './firebase';

export type { AppBrandingConfig };

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
export function getStoredBranding(schoolId?: string): AppBrandingConfig {
  try {
    const key = schoolId ? `${BRANDING_STORAGE_KEY}_${schoolId.toLowerCase()}` : BRANDING_STORAGE_KEY;
    const raw = safeStorage.getItem(key) || safeStorage.getItem(BRANDING_STORAGE_KEY);
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
 * Applies branding received from Cloud Firestore into local storage and notifies components
 */
export function applyCloudBranding(cloudConfig: AppBrandingConfig, schoolId?: string): AppBrandingConfig {
  const updated: AppBrandingConfig = {
    ...DEFAULT_BRANDING,
    ...cloudConfig,
  };

  try {
    const key = schoolId ? `${BRANDING_STORAGE_KEY}_${schoolId.toLowerCase()}` : BRANDING_STORAGE_KEY;
    safeStorage.setItem(key, JSON.stringify(updated));
    safeStorage.setItem(BRANDING_STORAGE_KEY, JSON.stringify(updated));
  } catch (err) {
    console.warn('[Branding] Failed to cache cloud branding:', err);
  }

  // Update HTML document title dynamically
  if (typeof document !== 'undefined' && updated.appName) {
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
 * Saves and broadcasts new school branding configuration to local cache and Firestore
 */
export function saveStoredBranding(
  config: Partial<AppBrandingConfig>,
  schoolId: string = 'eminent-academy',
  syncToCloud: boolean = true
): AppBrandingConfig {
  const current = getStoredBranding(schoolId);
  const updated: AppBrandingConfig = {
    ...current,
    ...config,
    schoolId: schoolId.toLowerCase(),
    updatedAt: new Date().toISOString(),
  };

  try {
    const key = schoolId ? `${BRANDING_STORAGE_KEY}_${schoolId.toLowerCase()}` : BRANDING_STORAGE_KEY;
    safeStorage.setItem(key, JSON.stringify(updated));
    safeStorage.setItem(BRANDING_STORAGE_KEY, JSON.stringify(updated));
  } catch (err) {
    console.error('[Branding] Failed to save branding config locally:', err);
  }

  // Update HTML document title dynamically
  if (typeof document !== 'undefined' && updated.appName) {
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

  // Asynchronously synchronize with Firestore
  if (syncToCloud) {
    saveBrandingToFirestore(updated, schoolId).catch((err) => {
      console.warn('[Branding Cloud Sync Note]:', err);
    });
  }

  return updated;
}

/**
 * Fetches latest branding from Cloud Firestore and updates local state
 */
export async function syncBrandingFromCloud(schoolId: string = 'eminent-academy'): Promise<AppBrandingConfig | null> {
  try {
    const cloudBranding = await getBrandingFromFirestore(schoolId);
    if (cloudBranding && cloudBranding.appName) {
      return applyCloudBranding(cloudBranding, schoolId);
    }
    return null;
  } catch (err) {
    console.warn('[Branding] Error syncing branding from cloud:', err);
    return null;
  }
}

/**
 * Reset branding to default preset
 */
export function resetStoredBranding(schoolId: string = 'eminent-academy'): AppBrandingConfig {
  const key = schoolId ? `${BRANDING_STORAGE_KEY}_${schoolId.toLowerCase()}` : BRANDING_STORAGE_KEY;
  safeStorage.removeItem(key);
  safeStorage.removeItem(BRANDING_STORAGE_KEY);
  const def: AppBrandingConfig = {
    ...DEFAULT_BRANDING,
    schoolId: schoolId.toLowerCase(),
    updatedAt: new Date().toISOString(),
  };
  if (typeof document !== 'undefined') {
    document.title = `${def.appName} - Bursar Management System`;
  }
  listeners.forEach((l) => l(def));

  // Sync reset to Firestore
  saveBrandingToFirestore(def, schoolId).catch((err) => {
    console.warn('[Branding] Error syncing reset to cloud:', err);
  });

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

