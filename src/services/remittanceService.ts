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
  data: Omit<RemittanceRecord, 'id' | 'referenceNumber' | 'timestamp'> & { submittedByRole?: 'bursar' | 'admin' },
  existingList?: RemittanceRecord[],
  schoolId?: string
): { newRecord: RemittanceRecord; allRecords: RemittanceRecord[] } {
  const current = existingList ?? getSavedRemittances(schoolId);
  const isAutoApproved = data.submittedByRole === 'admin' || data.status === 'approved';
  const approvalStatus: 'pending' | 'approved' | 'rejected' = isAutoApproved ? 'approved' : 'pending';

  const newRecord: RemittanceRecord = {
    ...data,
    id: `rmt-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    referenceNumber: generateRemittanceRef(),
    timestamp: new Date().toISOString(),
    amount: Math.max(0, Number(data.amount) || 0),
    status: approvalStatus,
    approvalStatus: approvalStatus,
    submittedBy: data.submittedBy || data.bursarName,
    submittedByRole: data.submittedByRole || 'bursar',
    approvedBy: isAutoApproved ? (data.approvedBy || data.bursarName) : undefined,
    approvedAt: isAutoApproved ? new Date().toISOString() : undefined,
  };

  const updated = [newRecord, ...current];
  saveRemittances(updated, schoolId);
  return { newRecord, allRecords: updated };
}

/**
 * Approves a pending remittance record (Admin only)
 */
export function approveRemittance(
  id: string,
  adminName: string,
  existingList?: RemittanceRecord[],
  schoolId?: string
): { approvedRecord: RemittanceRecord | null; allRecords: RemittanceRecord[] } {
  const current = existingList ?? getSavedRemittances(schoolId);
  let approvedRecord: RemittanceRecord | null = null;

  const updated = current.map((r) => {
    if (r.id === id) {
      approvedRecord = {
        ...r,
        status: 'approved',
        approvalStatus: 'approved',
        approvedBy: adminName,
        approvedAt: new Date().toISOString(),
        rejectedBy: undefined,
        rejectedAt: undefined,
        rejectionReason: undefined,
      };
      return approvedRecord;
    }
    return r;
  });

  saveRemittances(updated, schoolId);
  return { approvedRecord, allRecords: updated };
}

/**
 * Rejects a pending remittance record (Admin only)
 */
export function rejectRemittance(
  id: string,
  adminName: string,
  reason: string = 'Requires review by Bursar',
  existingList?: RemittanceRecord[],
  schoolId?: string
): { rejectedRecord: RemittanceRecord | null; allRecords: RemittanceRecord[] } {
  const current = existingList ?? getSavedRemittances(schoolId);
  let rejectedRecord: RemittanceRecord | null = null;

  const updated = current.map((r) => {
    if (r.id === id) {
      rejectedRecord = {
        ...r,
        status: 'rejected',
        approvalStatus: 'rejected',
        rejectedBy: adminName,
        rejectedAt: new Date().toISOString(),
        rejectionReason: reason,
      };
      return rejectedRecord;
    }
    return r;
  });

  saveRemittances(updated, schoolId);
  return { rejectedRecord, allRecords: updated };
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
 * Calculates collection, remittance, and cash-in-hand totals.
 * ONLY approved remittances are committed to the official ledger / cash-in-hand deduction.
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
  pendingRemitted: number;
  rejectedRemitted: number;
  cashInHand: number;
  collectionCount: number;
  remittanceCount: number;
  pendingRemittanceCount: number;
  approvedRemittanceCount: number;
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

  let totalApprovedRemitted = 0;
  let pendingRemitted = 0;
  let rejectedRemitted = 0;
  let pendingRemittanceCount = 0;
  let approvedRemittanceCount = 0;

  if (Array.isArray(remittances)) {
    remittances.forEach((r) => {
      const amt = Math.max(0, Number(r.amount) || 0);
      const isApproved = r.status === 'approved' || r.approvalStatus === 'approved' || (!r.status && !r.approvalStatus);
      const isPending = r.status === 'pending' || r.approvalStatus === 'pending';
      const isRejected = r.status === 'rejected' || r.approvalStatus === 'rejected';

      if (isApproved) {
        totalApprovedRemitted += amt;
        approvedRemittanceCount += 1;
      } else if (isPending) {
        pendingRemitted += amt;
        pendingRemittanceCount += 1;
      } else if (isRejected) {
        rejectedRemitted += amt;
      }
    });
  } else if (Array.isArray(students) && students.length > 0) {
    const sheetRemitted = students.reduce((max, s) => {
      const val = Number(s.total_remitted) || 0;
      return Math.max(max, val);
    }, 0);
    totalApprovedRemitted = sheetRemitted;
  }

  // Cash in hand is total collected minus ONLY approved remittances in the books
  const cashInHand = Math.max(0, totalCollected - totalApprovedRemitted);

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
    totalRemitted: totalApprovedRemitted,
    pendingRemitted,
    rejectedRemitted,
    cashInHand,
    collectionCount,
    remittanceCount: (remittances || []).length,
    pendingRemittanceCount,
    approvedRemittanceCount,
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
