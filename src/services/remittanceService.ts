/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { RemittanceRecord, StudentPaymentRecord, BursarSession } from '../types';
import { safeStorage } from './storage';
import { getTodayDateString } from './calculations';

const REMITTANCE_STORAGE_KEY = 'EMINENT_BURSAR_REMITTANCES_V1';

/**
 * Computes a strictly isolated local storage key for school remittances
 */
export function getSchoolRemittanceStorageKey(schoolId?: string): string {
  const normalizedId = (schoolId && schoolId.trim()) ? schoolId.trim().toLowerCase() : 'eminent-academy';
  return `${REMITTANCE_STORAGE_KEY}_${normalizedId}`;
}

/**
 * Generates a unique Remittance Reference Number (e.g. RMT-20260826-4821)
 */
export function generateRemittanceRef(): string {
  const dateStr = getTodayDateString().replace(/-/g, '');
  const random = Math.floor(1000 + Math.random() * 9000);
  return `RMT-${dateStr}-${random}`;
}

/**
 * Loads all saved remittance records strictly from the school's partition
 */
export function getSavedRemittances(schoolId?: string): RemittanceRecord[] {
  const targetSchoolId = (schoolId && schoolId.trim()) ? schoolId.trim().toLowerCase() : 'eminent-academy';
  const strictKey = getSchoolRemittanceStorageKey(targetSchoolId);

  try {
    const raw = safeStorage.getItem(strictKey);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    console.error(`[Remittance Boundary Error] Failed loading remittances for '${targetSchoolId}':`, e);
    return [];
  }
}

/**
 * Saves remittance records strictly to the school's partition
 */
export function saveRemittances(records: RemittanceRecord[], schoolId?: string): void {
  const targetSchoolId = (schoolId && schoolId.trim()) ? schoolId.trim().toLowerCase() : 'eminent-academy';
  const strictKey = getSchoolRemittanceStorageKey(targetSchoolId);

  try {
    safeStorage.setItem(strictKey, JSON.stringify(records));
  } catch (e) {
    console.error(`[Remittance Boundary Error] Failed saving remittances for '${targetSchoolId}':`, e);
  }
}

/**
 * Adds a new remittance record and returns the updated list
 */
export function addRemittance(
  data: Omit<RemittanceRecord, 'id' | 'referenceNumber' | 'timestamp'>,
  existingList?: RemittanceRecord[],
  schoolId?: string
): { newRecord: RemittanceRecord; allRecords: RemittanceRecord[] } {
  const current = existingList ?? getSavedRemittances(schoolId);
  const newRecord: RemittanceRecord = {
    ...data,
    id: `rmt-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    referenceNumber: generateRemittanceRef(),
    timestamp: new Date().toISOString(),
    amount: Math.max(0, Number(data.amount) || 0),
  };

  const updated = [newRecord, ...current];
  saveRemittances(updated, schoolId);
  return { newRecord, allRecords: updated };
}

/**
 * Deletes a remittance record by ID
 */
export function deleteRemittance(
  id: string,
  existingList?: RemittanceRecord[],
  schoolId?: string
): RemittanceRecord[] {
  const current = existingList ?? getSavedRemittances(schoolId);
  const updated = current.filter((r) => r.id !== id);
  saveRemittances(updated, schoolId);
  return updated;
}

/**
 * Updates an existing remittance record by ID
 */
export function updateRemittance(
  id: string,
  data: Partial<Omit<RemittanceRecord, 'id' | 'referenceNumber' | 'timestamp'>>,
  existingList?: RemittanceRecord[],
  schoolId?: string
): RemittanceRecord[] {
  const current = existingList ?? getSavedRemittances(schoolId);
  const updated = current.map((r) => {
    if (r.id === id) {
      return {
        ...r,
        ...data,
        amount: data.amount !== undefined ? Math.max(0, Number(data.amount) || 0) : r.amount,
      };
    }
    return r;
  });
  saveRemittances(updated, schoolId);
  return updated;
}

/**
 * Clears all remittance records for the specified school
 */
export function clearAllRemittances(
  schoolId?: string
): RemittanceRecord[] {
  saveRemittances([], schoolId);
  return [];
}

/**
 * Calculates collection, remittance, and cash-in-hand totals
 */
export function calculateCollectionMetrics(
  students: StudentPaymentRecord[],
  remittances?: RemittanceRecord[]
): {
  totalCollected: number;
  totalTuitionCollected: number;
  totalAdmissionCollected: number;
  totalLessonCollected: number;
  totalExamCollected: number;
  totalRemitted: number;
  cashInHand: number;
  collectionCount: number;
  remittanceCount: number;
} {
  let totalTuitionCollected = 0;
  let totalAdmissionCollected = 0;
  let totalLessonCollected = 0;
  let totalExamCollected = 0;

  (students || []).forEach((s) => {
    totalTuitionCollected += Math.max(0, Number(s.amount_paid) || 0);
    const admissionPaid = Math.max(0, Number(s.admission_paid) || 0);
    totalAdmissionCollected += admissionPaid;
    totalLessonCollected += Math.max(0, Number(s.lesson_paid) || 0);
    totalExamCollected += Math.max(0, Number(s.exam_paid) || 0);
  });

  const totalCollected = totalTuitionCollected + totalAdmissionCollected + totalLessonCollected + totalExamCollected;

  // 1. Calculate from local remittance list if defined
  let totalRemitted = 0;
  if (Array.isArray(remittances)) {
    totalRemitted = remittances.reduce((acc, r) => {
      const amt = Number(r.amount) || 0;
      return acc + (amt > 0 ? amt : 0);
    }, 0);
  } else if (Array.isArray(students) && students.length > 0) {
    // Only fallback to student total_remitted if remittances argument was omitted entirely
    const sheetRemitted = students.reduce((max, s) => {
      const val = Number(s.total_remitted) || 0;
      return Math.max(max, val);
    }, 0);
    totalRemitted = sheetRemitted;
  }

  const cashInHand = Math.max(0, totalCollected - totalRemitted);
  const collectionCount = (students || []).filter((s) => {
    const admissionPaid = Math.max(0, Number(s.admission_paid) || 0);
    return (
      (Number(s.amount_paid) || 0) > 0 || 
      admissionPaid > 0 ||
      (Number(s.lesson_paid) || 0) > 0 || 
      (Number(s.exam_paid) || 0) > 0
    );
  }).length;

  return {
    totalCollected,
    totalTuitionCollected,
    totalAdmissionCollected,
    totalLessonCollected,
    totalExamCollected,
    totalRemitted,
    cashInHand,
    collectionCount,
    remittanceCount: (remittances || []).length,
  };
}

/**
 * Extracts total remitted value stored in student sheet records
 */
export function getSheetTotalRemitted(students: StudentPaymentRecord[]): number {
  if (!Array.isArray(students) || students.length === 0) return 0;
  return students.reduce((max, s) => {
    const val = Number(s.total_remitted) || 0;
    return Math.max(max, val);
  }, 0);
}
