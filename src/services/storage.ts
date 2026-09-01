/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { StudentPaymentRecord, ScholarshipRecord, SheetApiConfig } from '../types';
import { normalizeStudentRow } from './calculations';
import { safeStorage } from './safeStorage';
import {
  batchSaveStudentsToFirestore,
  deleteStudentFromFirestore,
  batchSaveScholarshipsToFirestore,
  deleteScholarshipFromFirestore,
} from './firebase';

export { safeStorage };

export const STORAGE_STUDENTS_KEY = 'EMINENT_BURSAR_STUDENTS_ROSTER_V1';
export const STORAGE_API_CONFIG_KEY = 'EMINENT_BURSAR_API_CONFIG_V1';

export function getStoredApiConfig(schoolId?: string): SheetApiConfig {
  const key = schoolId ? `${STORAGE_API_CONFIG_KEY}_${schoolId.trim().toLowerCase()}` : STORAGE_API_CONFIG_KEY;
  try {
    const raw = safeStorage.getItem(key) || safeStorage.getItem(STORAGE_API_CONFIG_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.warn(e);
  }
  return { apiUrl: '', apiKey: '', provider: 'appsscript', autoSync: false };
}

export function saveApiConfig(config: SheetApiConfig, schoolId?: string): void {
  const key = schoolId ? `${STORAGE_API_CONFIG_KEY}_${schoolId.trim().toLowerCase()}` : STORAGE_API_CONFIG_KEY;
  try {
    safeStorage.setItem(key, JSON.stringify(config));
    if (!schoolId) {
      safeStorage.setItem(STORAGE_API_CONFIG_KEY, JSON.stringify(config));
    }
  } catch (e) {
    console.warn(e);
  }
}

export const INITIAL_SAMPLE_STUDENTS: StudentPaymentRecord[] = [];

// Set of legacy mock student IDs & names to automatically purge from storage and syncs
export const LEGACY_MOCK_STUDENT_IDS = new Set([
  'ERCA/0001',
  'ERCA/0002',
  'ERCA/0003',
  'ERCA/0004',
  'ERCA/0005',
  'ERCA/0010',
]);

export const LEGACY_MOCK_STUDENT_NAMES = new Set([
  'adeyemi oluwaseun',
  'chukwuebuka daniel',
  'ibrahim fatima zahra',
  'okonkwo grace chioma',
  'bello farouk usman',
  'mohammed sadiq',
]);

export function isLegacyMockStudent(id?: string, name?: string): boolean {
  if (id && LEGACY_MOCK_STUDENT_IDS.has(id.trim().toUpperCase())) return true;
  if (name && LEGACY_MOCK_STUDENT_NAMES.has(name.trim().toLowerCase())) return true;
  return false;
}

/**
 * Computes a strictly isolated local storage key for a specific school
 */
export function getSchoolStudentsStorageKey(schoolId?: string): string {
  const normalizedId = (schoolId && schoolId.trim()) ? schoolId.trim().toLowerCase() : 'eminent-academy';
  return `${STORAGE_STUDENTS_KEY}_${normalizedId}`;
}

/**
 * Loads stored student records or returns empty roster for a specific school
 */
export function getStoredStudents(schoolId?: string): StudentPaymentRecord[] {
  const targetSchoolId = (schoolId && schoolId.trim()) ? schoolId.trim().toLowerCase() : 'eminent-academy';
  const strictKey = getSchoolStudentsStorageKey(targetSchoolId);

  try {
    const raw = safeStorage.getItem(strictKey);
    if (raw !== null) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        // Filter out any legacy mock demo student records
        const filtered = parsed
          .filter((item) => !LEGACY_MOCK_STUDENT_IDS.has(String(item?.id || '').trim()))
          .map((item) => normalizeStudentRow(item));
        return filtered;
      }
    }
    return [];
  } catch (e) {
    console.error(`[Storage Boundary Error] Failed loading roster for school '${targetSchoolId}':`, e);
    return [];
  }
}

/**
 * Saves student records strictly to the specified school's isolated storage partition.
 */
export function saveStoredStudents(students: StudentPaymentRecord[], schoolId?: string): void {
  const targetSchoolId = (schoolId && schoolId.trim()) ? schoolId.trim().toLowerCase() : 'eminent-academy';
  const strictKey = getSchoolStudentsStorageKey(targetSchoolId);

  try {
    safeStorage.setItem(strictKey, JSON.stringify(students));
    // Asynchronously update Firestore cloud database
    batchSaveStudentsToFirestore(students, targetSchoolId).catch((err) => {
      console.warn('[Firestore] Background batch sync note:', err);
    });
  } catch (e) {
    console.error(`[Storage Boundary Error] Failed saving students for school '${targetSchoolId}':`, e);
  }
}

/**
 * Clears student records partition strictly for a specific school
 */
export function clearStoredStudentsForSchool(schoolId: string): void {
  const targetSchoolId = (schoolId && schoolId.trim()) ? schoolId.trim().toLowerCase() : 'eminent-academy';
  const strictKey = getSchoolStudentsStorageKey(targetSchoolId);
  try {
    safeStorage.setItem(strictKey, JSON.stringify([]));
  } catch (e) {
    console.error(`[Storage Boundary Error] Failed clearing partition for school '${targetSchoolId}':`, e);
  }
}

export const STORAGE_SCHOLARSHIPS_KEY = 'EMINENT_BURSAR_SCHOLARSHIPS_V1';

export function getSchoolScholarshipsStorageKey(schoolId?: string): string {
  const normalizedId = (schoolId && schoolId.trim()) ? schoolId.trim().toLowerCase() : 'eminent-academy';
  return `${STORAGE_SCHOLARSHIPS_KEY}_${normalizedId}`;
}

export const INITIAL_SAMPLE_SCHOLARSHIPS: ScholarshipRecord[] = [];

export function getStoredScholarships(schoolId?: string): ScholarshipRecord[] {
  const targetSchoolId = (schoolId && schoolId.trim()) ? schoolId.trim().toLowerCase() : 'eminent-academy';
  const key = getSchoolScholarshipsStorageKey(targetSchoolId);
  try {
    const raw = safeStorage.getItem(key);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.filter((s) => !LEGACY_MOCK_STUDENT_IDS.has(String(s?.id || '').trim()));
      }
    }
  } catch (e) {
    console.error(`Failed loading scholarships for school '${targetSchoolId}':`, e);
  }
  return [];
}

export function saveStoredScholarships(records: ScholarshipRecord[], schoolId?: string): void {
  const targetSchoolId = (schoolId && schoolId.trim()) ? schoolId.trim().toLowerCase() : 'eminent-academy';
  const key = getSchoolScholarshipsStorageKey(targetSchoolId);
  try {
    safeStorage.setItem(key, JSON.stringify(records));
    // Asynchronously update Firestore cloud database
    batchSaveScholarshipsToFirestore(records, targetSchoolId).catch((err) => {
      console.warn('[Firestore] Scholarship sync note:', err);
    });
  } catch (e) {
    console.error(`Failed saving scholarships for school '${targetSchoolId}':`, e);
  }
}

/**
 * =========================================================================
 * DELETION TOMBSTONE REGISTRY
 * Prevents deleted students, scholarships, expenses, or staff from ever
 * resurrecting or reappearing when background fetches or caching occurs.
 * =========================================================================
 */

interface DeletedRecordEntry {
  id: string;
  name?: string;
  deletedAt: string;
}

const DELETED_STUDENTS_STORAGE_PREFIX = 'bursar_deleted_students_';
const DELETED_SCHOLARSHIPS_STORAGE_PREFIX = 'bursar_deleted_scholarships_';
const DELETED_EXPENSES_STORAGE_PREFIX = 'bursar_deleted_expenses_';
const DELETED_STAFF_STORAGE_PREFIX = 'bursar_deleted_staff_';

function getStorageKey(prefix: string, schoolId?: string): string {
  const targetSchoolId = (schoolId && schoolId.trim()) ? schoolId.trim().toLowerCase() : 'eminent-academy';
  return `${prefix}${targetSchoolId}`;
}

export function getDeletedStudentRecords(schoolId?: string): DeletedRecordEntry[] {
  const key = getStorageKey(DELETED_STUDENTS_STORAGE_PREFIX, schoolId);
  try {
    const raw = safeStorage.getItem(key);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (e) {
    console.warn('Error reading deleted students registry:', e);
  }
  return [];
}

export function markStudentDeleted(id: string, fullName?: string, schoolId?: string): void {
  if (!id && !fullName) return;
  const key = getStorageKey(DELETED_STUDENTS_STORAGE_PREFIX, schoolId);
  const current = getDeletedStudentRecords(schoolId);
  const cleanId = (id || '').trim().toLowerCase();
  const cleanName = (fullName || '').trim().toLowerCase();

  const filtered = current.filter((item) => {
    const matchId = cleanId && item.id.toLowerCase() === cleanId;
    const matchName = cleanName && item.name && item.name.toLowerCase() === cleanName;
    return !matchId && !matchName;
  });

  filtered.push({
    id: id || `NAME_${cleanName}`,
    name: fullName || '',
    deletedAt: new Date().toISOString(),
  });

  // Keep last 500 tombstones
  const trimmed = filtered.slice(-500);
  try {
    safeStorage.setItem(key, JSON.stringify(trimmed));
  } catch (e) {
    console.warn('Error saving deleted student tombstone:', e);
  }

  // Delete from Firestore
  if (id) {
    deleteStudentFromFirestore(id, schoolId).catch(() => {});
  }
}

export function isStudentDeleted(id?: string, fullName?: string, schoolId?: string): boolean {
  if (!id && !fullName) return false;
  const records = getDeletedStudentRecords(schoolId);
  if (records.length === 0) return false;

  const cleanId = (id || '').trim().toLowerCase();
  const cleanName = (fullName || '').trim().toLowerCase();

  return records.some((item) => {
    if (cleanId && item.id && item.id.toLowerCase() === cleanId) return true;
    if (cleanName && cleanName.length >= 3 && item.name && item.name.toLowerCase().trim() === cleanName) return true;
    return false;
  });
}

export function unmarkStudentDeleted(id: string, schoolId?: string): void {
  if (!id) return;
  const key = getStorageKey(DELETED_STUDENTS_STORAGE_PREFIX, schoolId);
  const current = getDeletedStudentRecords(schoolId);
  const cleanId = id.trim().toLowerCase();
  const filtered = current.filter((item) => item.id.toLowerCase() !== cleanId);
  try {
    safeStorage.setItem(key, JSON.stringify(filtered));
  } catch (e) {
    console.warn('Error unmarking deleted student:', e);
  }
}

// Scholarship tombstones
export function markScholarshipDeleted(id: string, schoolId?: string): void {
  if (!id) return;
  const key = getStorageKey(DELETED_SCHOLARSHIPS_STORAGE_PREFIX, schoolId);
  try {
    const raw = safeStorage.getItem(key);
    const set: string[] = raw ? JSON.parse(raw) : [];
    const cleanId = id.trim().toLowerCase();
    if (!set.includes(cleanId)) {
      set.push(cleanId);
      safeStorage.setItem(key, JSON.stringify(set.slice(-500)));
    }
  } catch (e) {
    console.warn('Error marking scholarship deleted:', e);
  }

  // Delete from Firestore
  deleteScholarshipFromFirestore(id, schoolId).catch(() => {});
}

export function isScholarshipDeleted(id?: string, schoolId?: string): boolean {
  if (!id) return false;
  const key = getStorageKey(DELETED_SCHOLARSHIPS_STORAGE_PREFIX, schoolId);
  try {
    const raw = safeStorage.getItem(key);
    if (!raw) return false;
    const set: string[] = JSON.parse(raw);
    return set.includes(id.trim().toLowerCase());
  } catch {
    return false;
  }
}

export function unmarkScholarshipDeleted(id: string, schoolId?: string): void {
  if (!id) return;
  const key = getStorageKey(DELETED_SCHOLARSHIPS_STORAGE_PREFIX, schoolId);
  try {
    const raw = safeStorage.getItem(key);
    if (raw) {
      const set: string[] = JSON.parse(raw);
      const filtered = set.filter((x) => x !== id.trim().toLowerCase());
      safeStorage.setItem(key, JSON.stringify(filtered));
    }
  } catch (e) {
    console.warn('Error unmarking scholarship deleted:', e);
  }
}

// Expense tombstones
export function markExpenseDeleted(id: string, schoolId?: string): void {
  if (!id) return;
  const key = getStorageKey(DELETED_EXPENSES_STORAGE_PREFIX, schoolId);
  try {
    const raw = safeStorage.getItem(key);
    const set: string[] = raw ? JSON.parse(raw) : [];
    const cleanId = id.trim().toLowerCase();
    if (!set.includes(cleanId)) {
      set.push(cleanId);
      safeStorage.setItem(key, JSON.stringify(set.slice(-500)));
    }
  } catch (e) {
    console.warn('Error marking expense deleted:', e);
  }
}

export function isExpenseDeleted(id?: string, schoolId?: string): boolean {
  if (!id) return false;
  const key = getStorageKey(DELETED_EXPENSES_STORAGE_PREFIX, schoolId);
  try {
    const raw = safeStorage.getItem(key);
    if (!raw) return false;
    const set: string[] = JSON.parse(raw);
    return set.includes(id.trim().toLowerCase());
  } catch {
    return false;
  }
}

export function unmarkExpenseDeleted(id: string, schoolId?: string): void {
  if (!id) return;
  const key = getStorageKey(DELETED_EXPENSES_STORAGE_PREFIX, schoolId);
  try {
    const raw = safeStorage.getItem(key);
    if (raw) {
      const set: string[] = JSON.parse(raw);
      const filtered = set.filter((x) => x !== id.trim().toLowerCase());
      safeStorage.setItem(key, JSON.stringify(filtered));
    }
  } catch (e) {
    console.warn('Error unmarking expense deleted:', e);
  }
}

// Staff tombstones
export function markStaffDeleted(id: string, schoolId?: string): void {
  if (!id) return;
  const key = getStorageKey(DELETED_STAFF_STORAGE_PREFIX, schoolId);
  try {
    const raw = safeStorage.getItem(key);
    const set: string[] = raw ? JSON.parse(raw) : [];
    const cleanId = id.trim().toLowerCase();
    if (!set.includes(cleanId)) {
      set.push(cleanId);
      safeStorage.setItem(key, JSON.stringify(set.slice(-500)));
    }
  } catch (e) {
    console.warn('Error marking staff deleted:', e);
  }
}

export function isStaffDeleted(id?: string, schoolId?: string): boolean {
  if (!id) return false;
  const key = getStorageKey(DELETED_STAFF_STORAGE_PREFIX, schoolId);
  try {
    const raw = safeStorage.getItem(key);
    if (!raw) return false;
    const set: string[] = JSON.parse(raw);
    return set.includes(id.trim().toLowerCase());
  } catch {
    return false;
  }
}

export function unmarkStaffDeleted(id: string, schoolId?: string): void {
  if (!id) return;
  const key = getStorageKey(DELETED_STAFF_STORAGE_PREFIX, schoolId);
  try {
    const raw = safeStorage.getItem(key);
    if (raw) {
      const set: string[] = JSON.parse(raw);
      const filtered = set.filter((x) => x !== id.trim().toLowerCase());
      safeStorage.setItem(key, JSON.stringify(filtered));
    }
  } catch (e) {
    console.warn('Error unmarking staff deleted:', e);
  }
}
