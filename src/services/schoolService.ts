/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { SchoolProfile, SchoolFeeSchedule } from '../types';
import { safeStorage } from './safeStorage';
import { saveSchoolProfileToFirestore } from './firebase';

export const STORAGE_SCHOOLS_KEY = 'EMINENT_BURSAR_SCHOOLS_PROFILES_V2';
export const STORAGE_ACTIVE_SCHOOL_ID_KEY = 'EMINENT_BURSAR_ACTIVE_SCHOOL_ID_V2';

// Legacy keys for seamless migration
const LEGACY_STORAGE_SCHOOLS_KEY = 'DGOS_BURSAR_SCHOOLS_PROFILES_V1';
const LEGACY_STORAGE_ACTIVE_SCHOOL_ID_KEY = 'DGOS_BURSAR_ACTIVE_SCHOOL_ID_V1';

export const DEFAULT_EMINENT_CLASSES = [
  'Kg1',
  'Kg2',
  'Nur1',
  'Nur2',
  'Pri1',
  'Pri2',
  'Pri3',
  'Pri4',
  'Pri5',
  'Jss1',
  'Jss2',
  'Jss3',
  'Ss1',
  'Ss2',
  'Ss3',
];

export const DEFAULT_PRIMARY_CLASSES = [
  'Kg1',
  'Kg2',
  'Nur1',
  'Nur2',
  'Pri1',
  'Pri2',
  'Pri3',
  'Pri4',
  'Pri5',
];

export const DEFAULT_SECONDARY_CLASSES = [
  'Jss1',
  'Jss2',
  'Jss3',
  'Ss1',
  'Ss2',
  'Ss3',
];

export const DEFAULT_PRIMARY_FEES: SchoolFeeSchedule = {
  tuitionFee: 15000,
  admissionFee: 5000,
  examFee: 1500,
  lessonFeeMonthly: 2500,
  lessonFeeTermly: 7000,
};

export const DEFAULT_SECONDARY_FEES: SchoolFeeSchedule = {
  tuitionFee: 15000,
  admissionFee: 5000,
  examFee: 1500,
  lessonFeeMonthly: 3000,
  lessonFeeTermly: 8000,
};

export const DEFAULT_COMPREHENSIVE_FEES: SchoolFeeSchedule = {
  tuitionFee: 15000,
  admissionFee: 5000,
  examFee: 1500,
  lessonFeeMonthly: 2500,
  lessonFeeTermly: 7000,
};

export const INITIAL_SCHOOLS: SchoolProfile[] = [
  {
    id: 'eminent-academy',
    name: 'Eminent Royal Crown Academy',
    type: 'combined',
    currencySymbol: '₦',
    feeSchedule: { ...DEFAULT_COMPREHENSIVE_FEES },
    classes: [...DEFAULT_EMINENT_CLASSES],
    createdAt: '2026-08-01',
  },
];

/**
 * Loads stored school or initializes Eminent Royal Crown Academy (Combined Kg1 - Ss3)
 */
export function getStoredSchools(): SchoolProfile[] {
  try {
    const raw = safeStorage.getItem(STORAGE_SCHOOLS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.map((s: SchoolProfile) => {
          return {
            ...s,
            currencySymbol: s.currencySymbol || '₦',
            classes: Array.isArray(s.classes) && s.classes.length > 0 ? s.classes : DEFAULT_EMINENT_CLASSES,
            feeSchedule: s.feeSchedule || DEFAULT_COMPREHENSIVE_FEES,
            classFeeSchedules: s.classFeeSchedules || undefined,
          };
        });
      }
    }
  } catch (e) {
    console.error('Error loading stored schools:', e);
  }

  // First time initialization
  const initial: SchoolProfile[] = [
    {
      ...INITIAL_SCHOOLS[0],
    },
  ];

  saveStoredSchools(initial);
  return initial;
}

/**
 * Saves schools list to persistent storage
 */
export function saveStoredSchools(schools: SchoolProfile[]): void {
  try {
    safeStorage.setItem(STORAGE_SCHOOLS_KEY, JSON.stringify(schools));
  } catch (e) {
    console.error('Error saving schools:', e);
  }
}

/**
 * Gets currently selected active school ID
 */
export function getActiveSchoolId(): string {
  try {
    if (typeof window !== 'undefined' && window.location?.search) {
      const params = new URLSearchParams(window.location.search);
      const schoolParam = params.get('school');
      if (schoolParam) {
        safeStorage.setItem(STORAGE_ACTIVE_SCHOOL_ID_KEY, schoolParam);
        return schoolParam;
      }
    }
    const id = safeStorage.getItem(STORAGE_ACTIVE_SCHOOL_ID_KEY);
    if (id && !id.includes('dgos')) return id;
  } catch (e) {}
  return 'eminent-academy';
}

/**
 * Gets a direct shareable URL for a specific school profile
 */
export function getSchoolDirectLink(schoolId: string): string {
  try {
    if (typeof window !== 'undefined') {
      const baseUrl = window.location.origin + window.location.pathname;
      return `${baseUrl}?school=${encodeURIComponent(schoolId)}`;
    }
  } catch (e) {}
  return `?school=${encodeURIComponent(schoolId)}`;
}

/**
 * Sets active school ID
 */
export function setActiveSchoolId(id: string): void {
  try {
    safeStorage.setItem(STORAGE_ACTIVE_SCHOOL_ID_KEY, id);
  } catch (e) {
    console.error('Error setting active school ID:', e);
  }
}

/**
 * Gets full active school profile
 */
export function getActiveSchool(): SchoolProfile {
  const schools = getStoredSchools();
  const activeId = getActiveSchoolId();
  const found = schools.find((s) => s.id === activeId);
  return found || schools[0] || INITIAL_SCHOOLS[0];
}

/**
 * Adds a new school profile
 */
export function addSchool(newSchoolData: Omit<SchoolProfile, 'id' | 'createdAt'>): SchoolProfile {
  const schools = getStoredSchools();
  const id = `school-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  const newSchool: SchoolProfile = {
    ...newSchoolData,
    id,
    createdAt: new Date().toISOString().split('T')[0],
  };

  const updatedSchools = [...schools, newSchool];
  saveStoredSchools(updatedSchools);
  saveSchoolProfileToFirestore(newSchool).catch(() => {});
  return newSchool;
}

/**
 * Updates an existing school profile
 */
export function updateSchool(id: string, updates: Partial<SchoolProfile>): SchoolProfile {
  const schools = getStoredSchools();
  let updatedSchool: SchoolProfile | null = null;

  const updatedList = schools.map((s) => {
    if (s.id === id) {
      updatedSchool = { ...s, ...updates };
      return updatedSchool;
    }
    return s;
  });

  if (!updatedSchool) {
    throw new Error(`School with ID ${id} not found.`);
  }

  saveStoredSchools(updatedList);
  saveSchoolProfileToFirestore(updatedSchool).catch(() => {});

  return updatedSchool;
}

/**
 * Deletes a school profile (cannot delete if it's the only one left)
 */
export function deleteSchool(id: string): SchoolProfile[] {
  const schools = getStoredSchools();
  if (schools.length <= 1) {
    throw new Error('You must have at least one school profile configured.');
  }

  const updated = schools.filter((s) => s.id !== id);
  saveStoredSchools(updated);

  if (getActiveSchoolId() === id) {
    setActiveSchoolId(updated[0].id);
  }

  return updated;
}

/**
 * Updates both base and class-specific fee schedules on a school profile
 */
export function updateSchoolFeeSchedule(
  id: string,
  feeSchedule: SchoolFeeSchedule,
  classFeeSchedules?: Record<string, SchoolFeeSchedule>
): SchoolProfile {
  return updateSchool(id, {
    feeSchedule,
    classFeeSchedules: classFeeSchedules && Object.keys(classFeeSchedules).length > 0 ? classFeeSchedules : undefined,
  });
}

