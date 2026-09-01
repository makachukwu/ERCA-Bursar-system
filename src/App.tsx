/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { 
  StudentPaymentRecord, 
  BursarSession, 
  PaymentReceipt,
  TabType,
  SchoolProfile,
  ScholarshipRecord,
  ExpenseItem,
  SchoolFeeSchedule,
  SheetApiConfig
} from './types';
import { 
  recordStudentPayment
} from './services/paymentService';
import { 
  safeStorage, 
  getStoredStudents, 
  saveStoredStudents,
  getStoredScholarships,
  saveStoredScholarships,
  getStoredApiConfig,
  saveApiConfig,
  markStudentDeleted,
  isStudentDeleted,
  unmarkStudentDeleted,
  isLegacyMockStudent
} from './services/storage';
import {
  saveStoredStaff,
  saveStoredPayrollRecords
} from './services/payrollService';
import {
  saveStoredExpenses
} from './services/expenseService';
import { 
  getStoredSchools,
  saveStoredSchools,
  getActiveSchoolId,
  setActiveSchoolId,
  addSchool,
  updateSchool,
  deleteSchool,
  updateSchoolFeeSchedule
} from './services/schoolService';
import { 
  calculateBalance, 
  calculateStatus, 
  generateReceiptNumber, 
  getTodayDateString,
  getClassFeeSchedule,
  deriveFeeBreakdown
} from './services/calculations';
import { updateStudentInSheet } from './services/sheetApi';
import { Header } from './components/Header';
import { BottomNav } from './components/BottomNav';
import { StudentList } from './components/StudentList';
import { RecordPaymentView } from './components/RecordPaymentView';
import { AnalyticsView } from './components/AnalyticsView';
import { CollectionView } from './components/CollectionView';
import { BackupRolloverModal } from './components/BackupRolloverModal';
import { EndTermModal } from './components/EndTermModal';
import { StudentDetailsModal } from './components/StudentDetailsModal';
import { AddExistingStudentModal } from './components/AddExistingStudentModal';
import { ScholarshipModal } from './components/ScholarshipModal';
import { AdmissionView } from './components/AdmissionView';
import { SettingsModal } from './components/SettingsModal';
import { SchoolModal } from './components/SchoolModal';
import { LoginModal } from './components/LoginModal';
import { DuplicateCleanerModal } from './components/DuplicateCleanerModal';
import { PayrollView } from './components/PayrollView';
import { StudentUploadModal } from './components/StudentUploadModal';
import { SheetToFirebaseMigratorModal } from './components/SheetToFirebaseMigratorModal';
import { OfflineIndicator } from './components/OfflineIndicator';
import { recordAuditLog } from './services/auditLoggerService';
import {
  testConnection,
  subscribeAuthState,
  saveStudentToFirestore,
  batchSaveStudentsToFirestore,
  getStudentsFromFirestore,
  subscribeStudentsFromFirestore,
  deleteStudentFromFirestore,
  saveScholarshipToFirestore,
  batchSaveScholarshipsToFirestore,
  getScholarshipsFromFirestore,
  subscribeScholarshipsFromFirestore,
  deleteScholarshipFromFirestore,
  saveAuditLogToFirestore,
  subscribeExpensesFromFirestore,
  subscribeStaffFromFirestore,
  subscribePayrollFromFirestore,
  getSyncStatus,
  subscribeSyncStatus,
  recordSheetsSyncStart,
  recordSheetsSyncSuccess,
  recordSheetsSyncError,
  recordFirebaseSyncSuccess,
  SyncStatus,
} from './services/firebase';

const STORAGE_SESSION_KEY = 'bursar_session_profile';

export default function App() {
  // Navigation
  const [activeTab, setActiveTab] = useState<TabType>('students');

  // Multi-School Management
  const [schools, setSchools] = useState<SchoolProfile[]>(() => getStoredSchools());
  const [activeSchoolId, setActiveSchoolIdState] = useState<string>(() => getActiveSchoolId());

  // Derive active school safely
  const activeSchool: SchoolProfile = useMemo(() => {
    const found = schools.find((s) => s.id === activeSchoolId);
    return found || schools[0] || {
      id: 'eminent-academy',
      name: 'Eminent Royal Crown Academy',
      type: 'combined',
      currencySymbol: '₦',
      classes: ['Kg1', 'Kg2', 'Nur1', 'Nur2', 'Pri1', 'Pri2', 'Pri3', 'Pri4', 'Pri5', 'Jss1', 'Jss2', 'Jss3', 'Ss1', 'Ss2', 'Ss3'],
      feeSchedule: {
        tuitionFee: 15000,
        admissionFee: 5000,
        examFee: 1500,
        lessonFeeMonthly: 2500,
        lessonFeeTermly: 7000,
      },
      sheetConfig: {
        apiUrl: '',
        apiKey: '',
        provider: 'generic',
      },
      createdAt: new Date().toISOString(),
    };
  }, [schools, activeSchoolId]);

  // Sheet API Configuration & Bursar Profile
  const [apiConfig, setApiConfig] = useState<SheetApiConfig>(() => {
    const currentSchool = schools.find((s) => s.id === activeSchoolId) || schools[0];
    if (currentSchool?.sheetConfig?.apiUrl) {
      return currentSchool.sheetConfig;
    }
    return getStoredApiConfig();
  });

  const [session, setSession] = useState<BursarSession>(() => {
    try {
      const stored = safeStorage.getItem(STORAGE_SESSION_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        return {
          ...parsed,
          isAuthenticated: Boolean(parsed.isAuthenticated),
          schoolName: activeSchool?.name || parsed.schoolName || 'Eminent Royal Crown Academy',
          currencySymbol: activeSchool?.currencySymbol || parsed.currencySymbol || '₦',
          schoolId: activeSchool?.id || 'eminent-academy',
        };
      }
    } catch (e) {
      console.error(e);
    }
    return {
      isAuthenticated: false,
      bursarName: 'Bursar',
      role: 'bursar',
      schoolName: activeSchool?.name || 'Eminent Royal Crown Academy',
      currencySymbol: activeSchool?.currencySymbol || '₦',
      schoolId: activeSchool?.id || 'eminent-academy',
    };
  });

  // Data & Network States
  const [students, setStudents] = useState<StudentPaymentRecord[]>(() => getStoredStudents(activeSchoolId));
  const [scholarships, setScholarships] = useState<ScholarshipRecord[]>(() => getStoredScholarships(activeSchoolId));
  const [syncStatus, setSyncStatus] = useState<SyncStatus>(() => getSyncStatus());
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [isOnline, setIsOnline] = useState<boolean>(() => 
    typeof navigator !== 'undefined' && 'onLine' in navigator ? navigator.onLine : true
  );

  // Cloud Database Sync: Instant Firestore real-time listener & fast initial fetch
  useEffect(() => {
    const currentSchoolId = activeSchool?.id || 'eminent-academy';
    let isCancelled = false;

    // Test Firestore connection on boot
    testConnection().then((res) => {
      if (res.success) {
        console.log(`[Firebase Cloud] Connected to Firestore (${res.latencyMs}ms latency)`);
      } else {
        console.warn(`[Firebase Cloud Status] ${res.message}`);
      }
    });

    // Listen to Auth State
    const unsubAuth = subscribeAuthState((firebaseUser) => {
      if (!isCancelled && firebaseUser && firebaseUser.displayName) {
        setSession((prev) => ({
          ...prev,
          bursarName: firebaseUser.displayName || prev.bursarName,
        }));
      }
    });

    // Listen to sync status
    const unsubStatus = subscribeSyncStatus((s) => {
      if (!isCancelled) setSyncStatus(s);
    });

    // 1. Instantly query Firestore cache
    getStudentsFromFirestore(currentSchoolId)
      .then((cloudStudents) => {
        if (!isCancelled && cloudStudents && cloudStudents.length > 0) {
          setStudents(cloudStudents);
          saveStoredStudents(cloudStudents, currentSchoolId);
          recordFirebaseSyncSuccess();
        }
      })
      .catch((err) => {
        console.warn('[Firestore] Fast student load note:', err);
      });

    getScholarshipsFromFirestore(currentSchoolId)
      .then((cloudScholarships) => {
        if (!isCancelled && cloudScholarships && cloudScholarships.length > 0) {
          setScholarships(cloudScholarships);
          saveStoredScholarships(cloudScholarships, currentSchoolId);
        }
      })
      .catch(() => {});

    // 2. Real-time Firestore subscription for instant multi-device / multi-tab synchronization
    const unsubscribeStudents = subscribeStudentsFromFirestore(currentSchoolId, (liveStudents) => {
      if (!isCancelled && liveStudents && liveStudents.length > 0) {
        setStudents(liveStudents);
        recordFirebaseSyncSuccess();
      }
    });

    const unsubscribeScholarships = subscribeScholarshipsFromFirestore(currentSchoolId, (liveSch) => {
      if (!isCancelled && liveSch && liveSch.length > 0) {
        setScholarships(liveSch);
      }
    });

    const unsubscribeExpenses = subscribeExpensesFromFirestore(currentSchoolId, (liveExp) => {
      if (!isCancelled && liveExp && liveExp.length > 0) {
        saveStoredExpenses(liveExp, currentSchoolId);
      }
    });

    const unsubscribeStaff = subscribeStaffFromFirestore(currentSchoolId, (liveStaff) => {
      if (!isCancelled && liveStaff && liveStaff.length > 0) {
        saveStoredStaff(liveStaff, currentSchoolId);
      }
    });

    const unsubscribePayroll = subscribePayrollFromFirestore(currentSchoolId, (livePayroll) => {
      if (!isCancelled && livePayroll && livePayroll.length > 0) {
        saveStoredPayrollRecords(livePayroll, currentSchoolId);
      }
    });

    return () => {
      isCancelled = true;
      if (unsubAuth) unsubAuth();
      if (unsubStatus) unsubStatus();
      if (unsubscribeStudents) unsubscribeStudents();
      if (unsubscribeScholarships) unsubscribeScholarships();
      if (unsubscribeExpenses) unsubscribeExpenses();
      if (unsubscribeStaff) unsubscribeStaff();
      if (unsubscribePayroll) unsubscribePayroll();
    };
  }, [activeSchool?.id]);

  // Modals & Interactive States
  const [selectedStudentForDetails, setSelectedStudentForDetails] = useState<StudentPaymentRecord | null>(null);
  const [studentForPayment, setStudentForPayment] = useState<StudentPaymentRecord | null>(null);
  const [studentToGrantScholarship, setStudentToGrantScholarship] = useState<StudentPaymentRecord | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const [isAddStudentOpen, setIsAddStudentOpen] = useState<boolean>(false);
  const [isScholarshipModalOpen, setIsScholarshipModalOpen] = useState<boolean>(false);
  const [isRolloverModalOpen, setIsRolloverModalOpen] = useState<boolean>(false);
  const [isEndTermOpen, setIsEndTermOpen] = useState<boolean>(false);
  const [isDuplicateCleanerOpen, setIsDuplicateCleanerOpen] = useState<boolean>(false);
  const [isSheetUploadOpen, setIsSheetUploadOpen] = useState<boolean>(false);
  const [isMigratorOpen, setIsMigratorOpen] = useState<boolean>(false);
  
  // School Modal state
  const [isSchoolModalOpen, setIsSchoolModalOpen] = useState<boolean>(false);
  const [schoolModalMode, setSchoolModalMode] = useState<'add' | 'edit'>('add');
  const [schoolToEdit, setSchoolToEdit] = useState<SchoolProfile | null>(null);

  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const handleUpdateStudentsFromDuplicateCleaner = (updated: StudentPaymentRecord[], message?: string) => {
    const currentSchoolId = activeSchool?.id || 'eminent-academy';
    setStudents(updated);
    saveStoredStudents(updated, currentSchoolId);
    if (message) {
      showToast(message);
    }
  };

  // Clean up legacy mock data on initial load
  useEffect(() => {
    try {
      const mockIds = new Set(['ERCA/0001', 'ERCA/0002', 'ERCA/0003', 'ERCA/0004', 'ERCA/0005', 'ERCA/0010']);
      const currentSchoolId = activeSchool?.id || 'eminent-academy';
      const raw = getStoredStudents(currentSchoolId);
      const cleaned = raw.filter((s) => !mockIds.has(String(s.id || '').trim()));
      if (cleaned.length !== raw.length) {
        saveStoredStudents(cleaned, currentSchoolId);
        setStudents(cleaned);
      }
    } catch (e) {
      console.warn('[Startup Clean] Legacy purge error:', e);
    }
  }, [activeSchool?.id]);

  // Track online/offline status
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4000);
  };

  // Instant local-first student & scholarship loader with Firestore cloud sync
  const loadStudents = useCallback(async (isManualRefresh = false) => {
    const currentSchoolId = activeSchoolId || 'eminent-academy';

    if (isManualRefresh) {
      setIsLoading(true);
    }

    try {
      const cachedStudents = getStoredStudents(currentSchoolId);
      const cachedSch = getStoredScholarships(currentSchoolId);
      
      // Update local state if currently empty or manual refresh
      setStudents((prev) => (prev.length === 0 || isManualRefresh ? cachedStudents : prev));
      setScholarships((prev) => (prev.length === 0 || isManualRefresh ? cachedSch : prev));
      setError(null);

      // Fetch fresh updates from Firestore cloud database without blocking UI
      const [cloudStudents, cloudScholarships] = await Promise.all([
        getStudentsFromFirestore(currentSchoolId, 3000),
        getScholarshipsFromFirestore(currentSchoolId, 3000),
      ]);

      if (cloudStudents && cloudStudents.length > 0) {
        setStudents(cloudStudents);
        saveStoredStudents(cloudStudents, currentSchoolId);
      }
      if (cloudScholarships && cloudScholarships.length > 0) {
        setScholarships(cloudScholarships);
        saveStoredScholarships(cloudScholarships, currentSchoolId);
      }
      recordFirebaseSyncSuccess();
      if (isManualRefresh) {
        const count = cloudStudents && cloudStudents.length > 0 ? cloudStudents.length : cachedStudents.length;
        showToast(`Cloud Database Synced: ${count} student records active.`);
      }
    } catch (err: any) {
      console.warn('[Firestore Sync Notice]:', err);
      if (isManualRefresh) {
        const cached = getStoredStudents(currentSchoolId);
        showToast(`Loaded ${cached.length} students from local storage.`);
      }
    } finally {
      if (isManualRefresh) {
        setIsLoading(false);
      }
    }
  }, [activeSchoolId]);

  // Load students when active school changes
  useEffect(() => {
    loadStudents();
  }, [activeSchoolId, loadStudents]);

  // Switch Active School
  const handleSelectSchool = (schoolId: string) => {
    const target = schools.find((s) => s.id === schoolId);
    if (!target) return;

    // Save active school pointer
    setActiveSchoolId(schoolId);
    setActiveSchoolIdState(schoolId);

    // Update API config to target school's sheet
    const targetConfig: SheetApiConfig = target.sheetConfig || getStoredApiConfig(target.id) || {
      apiUrl: '',
      apiKey: '',
      provider: 'generic',
    };
    saveApiConfig(targetConfig, target.id);
    setApiConfig(targetConfig);

    // Update session
    const updatedSession: BursarSession = {
      ...session,
      schoolName: target.name,
      currencySymbol: target.currencySymbol,
      schoolId: target.id,
    };
    setSession(updatedSession);
    try {
      safeStorage.setItem(STORAGE_SESSION_KEY, JSON.stringify(updatedSession));
    } catch (e) {
      console.error(e);
    }

    // Load scholarships for selected school
    const schoolSch = getStoredScholarships(schoolId);
    setScholarships(schoolSch);

    // Reset preselected student & student details
    setSelectedStudentForDetails(null);
    setStudentForPayment(null);

    showToast(`Switched to ${target.name} dashboard.`);
  };

  // Open Add School Modal
  const handleOpenAddSchool = () => {
    setSchoolModalMode('add');
    setSchoolToEdit(null);
    setIsSchoolModalOpen(true);
  };

  // Open Edit School Modal
  const handleOpenEditSchool = (school: SchoolProfile) => {
    setSchoolModalMode('edit');
    setSchoolToEdit(school);
    setIsSchoolModalOpen(true);
  };

  // Save School (Add or Edit)
  const handleSaveSchool = (schoolData: Omit<SchoolProfile, 'id' | 'createdAt'>, schoolId?: string) => {
    if (schoolId) {
      // Edit existing
      const updated = updateSchool(schoolId, schoolData);
      const allSchools = getStoredSchools();
      setSchools(allSchools);

      if (schoolId === activeSchoolId) {
        setSession((prev) => ({
          ...prev,
          schoolName: updated.name,
          currencySymbol: updated.currencySymbol,
        }));
      }

      showToast(`Updated ${updated.name} profile & fee schedule.`);
    } else {
      // Add new school
      const created = addSchool(schoolData);
      const allSchools = getStoredSchools();
      setSchools(allSchools);

      // Automatically switch to the newly created school dashboard
      handleSelectSchool(created.id);
      showToast(`Created & switched to ${created.name} dashboard!`);
    }
    setIsSchoolModalOpen(false);
  };

  // Update fee schedule across all enrolled students
  const handleUpdateStudentsFee = (
    newScheduleOrTuition: SchoolFeeSchedule | number,
    classFeeSchedulesOverride?: Record<string, SchoolFeeSchedule>
  ) => {
    const currentSchoolId = activeSchool?.id || 'eminent-academy';
    const baseSchedule: SchoolFeeSchedule = typeof newScheduleOrTuition === 'number'
      ? {
          tuitionFee: newScheduleOrTuition,
          admissionFee: activeSchool?.feeSchedule?.admissionFee ?? 2000,
          examFee: activeSchool?.feeSchedule?.examFee ?? 1000,
          lessonFeeMonthly: activeSchool?.feeSchedule?.lessonFeeMonthly ?? 2000,
          lessonFeeTermly: activeSchool?.feeSchedule?.lessonFeeTermly ?? 6000,
        }
      : newScheduleOrTuition;

    const currentClassSchedules = classFeeSchedulesOverride !== undefined
      ? classFeeSchedulesOverride
      : activeSchool?.classFeeSchedules;

    // Update the school profile fee schedule permanently
    updateSchoolFeeSchedule(currentSchoolId, baseSchedule, currentClassSchedules);
    setSchools(getStoredSchools());

    const schoolContext: SchoolProfile = {
      ...activeSchool,
      feeSchedule: baseSchedule,
      classFeeSchedules: currentClassSchedules,
    };

    setStudents((prev) => {
      const updated = prev.map((st) => {
        const bd = deriveFeeBreakdown(st, schoolContext);

        const nextTuition = st.is_exempt_from_school_fee ? 0 : bd.tuitionFee;
        const nextTuitionPaid = Number(st.tuition_paid || 0);

        const nextAdmission = (st.is_new_admission === true)
          ? bd.admissionFee
          : (st.is_new_admission === false || st.admission_fee === 0)
          ? 0
          : (Number(st.admission_fee) || 0);
        const nextAdmissionPaid = Number(st.admission_paid || 0);

        const nextExam = bd.examFee;
        const nextExamPaid = Number(st.exam_paid || 0);

        const nextLesson = bd.lessonFee;
        const nextLessonPaid = Number(st.lesson_paid || 0);

        const totalFee = nextTuition + nextAdmission + nextExam + nextLesson;
        const totalPaid = Number(st.amount_paid || 0);

        return {
          ...st,
          tuition_fee: nextTuition,
          tuition_status: st.is_exempt_from_school_fee ? 'fully_paid' : calculateStatus(nextTuition, nextTuitionPaid),
          admission_fee: nextAdmission,
          admission_status: nextAdmission > 0 ? calculateStatus(nextAdmission, nextAdmissionPaid) : 'unpaid',
          exam_fee: nextExam,
          exam_status: nextExam > 0 ? calculateStatus(nextExam, nextExamPaid) : 'unpaid',
          lesson_fee: nextLesson,
          lesson_status: nextLesson > 0 ? calculateStatus(nextLesson, nextLessonPaid) : 'unpaid',
          fee_amount: totalFee,
          balance: calculateBalance(totalFee, totalPaid),
          status: calculateStatus(totalFee, totalPaid),
        };
      });
      saveStoredStudents(updated, currentSchoolId);
      batchSaveStudentsToFirestore(updated, currentSchoolId).catch(() => {});
      return updated;
    });

    recordAuditLog(
      'SETTINGS',
      'MODIFY_FEE_SCHEDULE',
      `Updated fee schedules across all enrolled students - Base Tuition: ${session.currencySymbol}${baseSchedule.tuitionFee.toLocaleString()}, Admission: ${session.currencySymbol}${baseSchedule.admissionFee.toLocaleString()}, Exam: ${session.currencySymbol}${baseSchedule.examFee.toLocaleString()}, Lesson: ${session.currencySymbol}${baseSchedule.lessonFeeTermly.toLocaleString()}${currentClassSchedules && Object.keys(currentClassSchedules).length > 0 ? ` with ${Object.keys(currentClassSchedules).length} class-specific override(s)` : ''}`,
      { schedule: baseSchedule, classFeeSchedules: currentClassSchedules },
      session.bursarName,
      currentSchoolId,
      'SUCCESS'
    );

    showToast(`Updated fee schedule across all enrolled students.`);
  };

  // Delete School
  const handleDeleteSchool = (schoolId: string) => {
    const success = deleteSchool(schoolId);
    if (!success) {
      showToast('Cannot delete the only remaining school.');
      return;
    }

    const allSchools = getStoredSchools();
    setSchools(allSchools);

    if (schoolId === activeSchoolId && allSchools.length > 0) {
      handleSelectSchool(allSchools[0].id);
    }
    setIsSchoolModalOpen(false);
    showToast('School dashboard removed.');
  };

  // Handle saving new API Config (including Secondary & Primary schools)
  const handleSaveApiConfig = (newConfig: SheetApiConfig, allSchoolConfigs?: Record<string, SheetApiConfig>) => {
    const currentSchoolId = activeSchool?.id || 'eminent-academy';
    saveApiConfig(newConfig, currentSchoolId);
    setApiConfig(newConfig);

    if (allSchoolConfigs) {
      const currentSchools = getStoredSchools();
      const updated = currentSchools.map((s) => {
        if (allSchoolConfigs[s.id]) {
          saveApiConfig(allSchoolConfigs[s.id], s.id);
          return { ...s, sheetConfig: allSchoolConfigs[s.id] };
        }
        return s;
      });
      saveStoredSchools(updated);
      setSchools(updated);
    } else if (activeSchool) {
      updateSchool(activeSchool.id, { sheetConfig: newConfig });
      setSchools(getStoredSchools());
    }

    showToast('Configurations saved successfully.');
  };

  // Handle saving Bursar Session
  const handleSaveSession = (newSession: BursarSession) => {
    try {
      safeStorage.setItem(STORAGE_SESSION_KEY, JSON.stringify(newSession));
    } catch (e) {
      console.error(e);
    }
    setSession(newSession);

    // Also sync active school name & currency
    if (activeSchool) {
      updateSchool(activeSchool.id, {
        name: newSession.schoolName,
        currencySymbol: newSession.currencySymbol,
      });
      setSchools(getStoredSchools());
    }
  };

  const handleLogin = (sessionUpdates: { bursarName: string; username?: string; role?: 'admin' | 'bursar'; userTitle?: string } | string) => {
    if (typeof sessionUpdates === 'string') {
      const updated: BursarSession = {
        ...session,
        isAuthenticated: true,
        bursarName: sessionUpdates,
      };
      handleSaveSession(updated);
    } else {
      const updated: BursarSession = {
        ...session,
        isAuthenticated: true,
        bursarName: sessionUpdates.bursarName,
        username: sessionUpdates.username || session.username,
        role: sessionUpdates.role || session.role || 'bursar',
        userTitle: sessionUpdates.userTitle || session.userTitle,
      };
      handleSaveSession(updated);
    }
  };

  const handleLogout = () => {
    const updated: BursarSession = {
      ...session,
      isAuthenticated: false,
    };
    handleSaveSession(updated);
    showToast('Logged out securely.');
  };

  // Handle adding new student (Write)
  const handleAddStudent = async (newStudent: StudentPaymentRecord) => {
    const currentSchoolId = activeSchool?.id || 'eminent-academy';

    // Unmark in case it was previously tombstoned
    if (newStudent.id) {
      unmarkStudentDeleted(newStudent.id, currentSchoolId);
    }

    // 1. Optimistic local state update
    setStudents((prev) => {
      const filtered = prev.filter((s) => s.id !== newStudent.id);
      const updated = [newStudent, ...filtered];
      saveStoredStudents(updated, currentSchoolId);
      return updated;
    });

    // 2. Persist to Firebase Cloud Firestore (Primary)
    saveStudentToFirestore(newStudent, currentSchoolId).catch((fErr) => {
      console.warn('[Firestore] Student save note:', fErr);
    });

    showToast(`Enrolled ${newStudent.full_name} (${newStudent.class}) and saved to Firebase Cloud.`);

    recordAuditLog(
      'STUDENT',
      'ENROLL_STUDENT',
      `Enrolled new student ${newStudent.full_name} (${newStudent.class}) with fee ${session.currencySymbol}${newStudent.fee_amount}`,
      { studentId: newStudent.id, fullName: newStudent.full_name, class: newStudent.class, feeAmount: newStudent.fee_amount },
      session.bursarName,
      currentSchoolId,
      'SUCCESS'
    );
  };

  // Handle editing student record (Rewrite)
  const handleSaveStudentEdits = async (
    id: string,
    updatedFields: Partial<StudentPaymentRecord> & {
      fee_amount: number;
      amount_paid: number;
      full_name: string;
      class: string;
      term: string;
      session: string;
      receipt_no?: string;
    },
    originalStudent: StudentPaymentRecord
  ) => {
    const currentSchoolId = activeSchool?.id || 'eminent-academy';
    const fee = Math.max(0, updatedFields.fee_amount);
    const paid = Math.max(0, updatedFields.amount_paid);
    const updated: StudentPaymentRecord = {
      ...originalStudent,
      ...updatedFields,
      balance: calculateBalance(fee, paid),
      status: calculateStatus(fee, paid),
    };

    setStudents((prev) => {
      const next = prev.map((s) => (s.id === id ? updated : s));
      saveStoredStudents(next, currentSchoolId);
      return next;
    });
    setSelectedStudentForDetails(updated);

    // Save to Firebase Cloud Firestore (Primary)
    saveStudentToFirestore(updated, currentSchoolId).catch((fErr) => {
      console.warn('[Firestore] Student edit note:', fErr);
    });

    recordAuditLog(
      'STUDENT',
      'UPDATE_STUDENT',
      `Updated student record for ${updated.full_name} (${updated.class}) - Fee: ${session.currencySymbol}${updated.fee_amount}, Paid: ${session.currencySymbol}${updated.amount_paid}`,
      { studentId: id, updatedFields },
      session.bursarName,
      currentSchoolId,
      'INFO'
    );

    showToast(`Updated ${updated.full_name}'s record successfully.`);
  };

  // Handle deleting student record
  const handleDeleteStudent = async (id: string, student: StudentPaymentRecord) => {
    const currentSchoolId = activeSchool?.id || 'eminent-academy';
    const targetIdLower = (id || '').trim().toLowerCase();
    const targetNameLower = (student.full_name || '').trim().toLowerCase();

    // 0. Immediately record in persistent tombstone registry
    markStudentDeleted(id, student.full_name, currentSchoolId);

    // 1. Calculate remaining students first
    const next = students.filter((s) => {
      const sIdLower = (s.id || '').trim().toLowerCase();
      const sNameLower = (s.full_name || '').trim().toLowerCase();
      const matchId = targetIdLower && sIdLower === targetIdLower;
      const matchName = targetNameLower && targetNameLower.length > 2 && sNameLower === targetNameLower;
      return !matchId && !matchName;
    });

    // 2. Immediately update local state & storage
    setStudents(next);
    saveStoredStudents(next, currentSchoolId);

    // Delete from Firebase Cloud Firestore (Primary)
    deleteStudentFromFirestore(id, currentSchoolId).catch((fErr) => {
      console.warn('[Firestore] Delete note:', fErr);
    });

    if (selectedStudentForDetails?.id === id || (student.full_name && selectedStudentForDetails?.full_name?.toLowerCase().trim() === targetNameLower)) {
      setSelectedStudentForDetails(null);
    }
    if (studentForPayment?.id === id || (student.full_name && studentForPayment?.full_name?.toLowerCase().trim() === targetNameLower)) {
      setStudentForPayment(null);
    }

    recordAuditLog(
      'STUDENT',
      'DELETE_STUDENT',
      `Deleted student ${student.full_name} (${student.class}) [ID: ${id}]`,
      { studentId: id, fullName: student.full_name, class: student.class },
      session.bursarName,
      currentSchoolId,
      'WARNING'
    );

    showToast(`Deleted ${student.full_name}'s record successfully.`);
  };

  // Handle granting or editing scholarship for a student
  const handleSaveScholarship = async (scholarshipData: {
    studentId: string;
    fullName: string;
    studentClass: string;
    term: string;
    session: string;
    scholarshipType: string;
    scholarshipPercentage: number;
    exemptSchoolFee: boolean;
    scholarshipNotes: string;
    awardDate: string;
    awardedBy: string;
    isNewStudent: boolean;
  }) => {
    const currentSchoolId = activeSchool?.id || 'eminent-academy';
    const existingStudent = students.find((s) => s.id === scholarshipData.studentId);

    let updatedRecord: StudentPaymentRecord;

    if (existingStudent) {
      // Update existing student with scholarship exemption
      const tuitionFee = scholarshipData.exemptSchoolFee ? 0 : (existingStudent.tuition_fee || activeSchool?.feeSchedule?.tuitionFee || existingStudent.fee_amount || 5000);
      const admissionFee = existingStudent.admission_fee || 0;
      const lessonFee = Number(existingStudent.lesson_fee) || 0;
      const examFee = Number(existingStudent.exam_fee) || 0;
      const totalFee = tuitionFee + admissionFee + lessonFee + examFee;
      const balance = calculateBalance(totalFee, existingStudent.amount_paid);
      const status = calculateStatus(totalFee, existingStudent.amount_paid);

      updatedRecord = {
        ...existingStudent,
        full_name: scholarshipData.fullName || existingStudent.full_name,
        class: scholarshipData.studentClass || existingStudent.class,
        term: scholarshipData.term || existingStudent.term,
        session: scholarshipData.session || existingStudent.session,
        is_exempt_from_school_fee: scholarshipData.exemptSchoolFee,
        scholarship_notes: scholarshipData.scholarshipNotes,
        tuition_fee: tuitionFee,
        lesson_fee: lessonFee,
        exam_fee: examFee,
        fee_amount: totalFee,
        balance,
        status,
      };

      if (apiConfig.apiUrl && apiConfig.apiUrl.trim()) {
        try {
          await updateStudentInSheet(apiConfig, existingStudent.id, updatedRecord, existingStudent);
        } catch (err) {
          console.warn('Sheet update note:', err);
        }
      }

      setStudents((prev) => {
        const updated = prev.map((s) => (s.id === existingStudent.id ? updatedRecord : s));
        saveStoredStudents(updated, currentSchoolId);
        return updated;
      });
    } else {
      // Create new student on scholarship
      const tuitionFee = scholarshipData.exemptSchoolFee ? 0 : (activeSchool?.feeSchedule?.tuitionFee || 15000);
      const lessonFee = 0;
      const examFee = 0;
      const totalFee = tuitionFee + lessonFee + examFee;
      const balance = calculateBalance(totalFee, 0);
      const status = calculateStatus(totalFee, 0);

      updatedRecord = {
        id: scholarshipData.studentId,
        full_name: scholarshipData.fullName,
        class: scholarshipData.studentClass,
        term: scholarshipData.term,
        session: scholarshipData.session,
        fee_amount: totalFee,
        amount_paid: 0,
        balance,
        status,
        payment_date: getTodayDateString(),
        is_exempt_from_school_fee: scholarshipData.exemptSchoolFee,
        scholarship_notes: scholarshipData.scholarshipNotes,
        tuition_fee: tuitionFee,
        tuition_paid: 0,
        admission_fee: 0,
        admission_paid: 0,
        lesson_fee: lessonFee,
        lesson_paid: 0,
        exam_fee: examFee,
        exam_paid: 0,
        total_remitted: 0,
      };

      setStudents((prev) => {
        const updated = [updatedRecord, ...prev];
        saveStoredStudents(updated, currentSchoolId);
        return updated;
      });
    }

    // Formulate complete Scholarship Record with all copied student details from Students tab
    const scholarshipRecordToStore: ScholarshipRecord = {
      id: scholarshipData.studentId,
      student_name: scholarshipData.fullName,
      class: scholarshipData.studentClass,
      term: scholarshipData.term,
      session: scholarshipData.session,
      scholarship_type: scholarshipData.scholarshipType,
      scholarship_percentage: scholarshipData.scholarshipPercentage,
      exempt_school_fee: scholarshipData.exemptSchoolFee,
      scholarship_notes: scholarshipData.scholarshipNotes,
      award_date: scholarshipData.awardDate,
      awarded_by: scholarshipData.awardedBy,
      status: 'active',
      created_at: new Date().toISOString(),
      // Copied student details from Students tab
      fee_amount: updatedRecord.fee_amount,
      amount_paid: updatedRecord.amount_paid,
      balance: updatedRecord.balance,
      payment_status: updatedRecord.status,
      tuition_fee: updatedRecord.tuition_fee,
      tuition_paid: updatedRecord.tuition_paid,
      admission_fee: updatedRecord.admission_fee,
      admission_paid: updatedRecord.admission_paid,
      lesson_fee: updatedRecord.lesson_fee,
      lesson_paid: updatedRecord.lesson_paid,
      lesson_months: updatedRecord.lesson_months,
      exam_fee: updatedRecord.exam_fee,
      exam_paid: updatedRecord.exam_paid,
      receipt_no: updatedRecord.receipt_no,
      payment_date: updatedRecord.payment_date,
    };

    // Save to local scholarship store and state
    const storedScholarships = getStoredScholarships(currentSchoolId);
    const updatedScholarships = [
      scholarshipRecordToStore,
      ...storedScholarships.filter((s) => s.id !== scholarshipData.studentId),
    ];
    saveStoredScholarships(updatedScholarships, currentSchoolId);
    setScholarships(updatedScholarships);

    // Save to Firebase Cloud Firestore (Scholarship & Student)
    saveScholarshipToFirestore(scholarshipRecordToStore, currentSchoolId).catch((fErr) => {
      console.warn('[Firestore] Scholarship save note:', fErr);
    });
    saveStudentToFirestore(updatedRecord, currentSchoolId).catch((fErr) => {
      console.warn('[Firestore] Scholarship student update note:', fErr);
    });

    recordAuditLog(
      'STUDENT',
      'SCHOLARSHIP_GRANT',
      `Granted scholarship (${scholarshipData.scholarshipType}) to ${scholarshipData.fullName} (${scholarshipData.studentId})`,
      { studentId: scholarshipData.studentId, scholarshipType: scholarshipData.scholarshipType },
      session.bursarName,
      currentSchoolId,
      'SUCCESS'
    );

    showToast(`Scholarship granted to ${scholarshipData.fullName}!`);
  };

  // Handle revoking scholarship exemption
  const handleRevokeScholarship = async (student: StudentPaymentRecord) => {
    const currentSchoolId = activeSchool?.id || 'eminent-academy';
    const standardTuition = student.tuition_fee > 0 ? student.tuition_fee : (student.fee_amount > 0 ? student.fee_amount : (activeSchool?.feeSchedule?.tuitionFee || 5000));
    const admissionFee = Number(student.admission_fee) || 0;
    const lessonFee = Number(student.lesson_fee) || 0;
    const examFee = Number(student.exam_fee) || 0;
    const totalFee = standardTuition + admissionFee + lessonFee + examFee;
    const balance = calculateBalance(totalFee, student.amount_paid);
    const status = calculateStatus(totalFee, student.amount_paid);

    const updatedRecord: StudentPaymentRecord = {
      ...student,
      is_exempt_from_school_fee: false,
      scholarship_notes: '',
      tuition_fee: standardTuition,
      lesson_fee: lessonFee,
      exam_fee: examFee,
      fee_amount: totalFee,
      balance,
      status,
    };

    setStudents((prev) => {
      const updated = prev.map((s) => (s.id === student.id ? updatedRecord : s));
      saveStoredStudents(updated, currentSchoolId);
      return updated;
    });

    // Remove from local scholarship store and state
    const storedScholarships = getStoredScholarships(currentSchoolId);
    const updatedScholarships = storedScholarships.filter((s) => s.id !== student.id);
    saveStoredScholarships(updatedScholarships, currentSchoolId);
    setScholarships(updatedScholarships);

    // Remove from Firebase Cloud Firestore
    deleteScholarshipFromFirestore(student.id, currentSchoolId).catch((fErr) => {
      console.warn('[Firestore] Scholarship delete note:', fErr);
    });
    saveStudentToFirestore(updatedRecord, currentSchoolId).catch((fErr) => {
      console.warn('[Firestore] Student restore note:', fErr);
    });

    recordAuditLog(
      'STUDENT',
      'SCHOLARSHIP_REVOKE',
      `Revoked scholarship for ${student.full_name} (${student.id})`,
      { studentId: student.id, fullName: student.full_name },
      session.bursarName,
      currentSchoolId,
      'WARNING'
    );

    showToast(`Revoked scholarship for ${student.full_name}. Regular fees restored.`);
  };

  // Handle merging duplicate student records into a verified primary record
  const handleMergeDuplicateGroup = async (
    primaryId: string,
    mergedRecord: StudentPaymentRecord,
    deletedIds: string[]
  ) => {
    const currentSchoolId = activeSchool?.id || 'eminent-academy';

    // 1. Update local state and persistent storage first
    const next = students
      .filter((s) => !deletedIds.includes(s.id))
      .map((s) => (s.id === primaryId ? mergedRecord : s));
    setStudents(next);
    saveStoredStudents(next, currentSchoolId);

    // Persist merge & deletes to Firebase Cloud Firestore
    saveStudentToFirestore(mergedRecord, currentSchoolId).catch(() => {});
    deletedIds.forEach((delId) => {
      deleteStudentFromFirestore(delId, currentSchoolId).catch(() => {});
    });

    if (selectedStudentForDetails && (selectedStudentForDetails.id === primaryId || deletedIds.includes(selectedStudentForDetails.id))) {
      setSelectedStudentForDetails(mergedRecord);
    }

    showToast(`Resolved & merged duplicates for "${mergedRecord.full_name}" into ID: ${mergedRecord.id}`);
  };

  // Handle batch resolving all verified duplicate groups
  const handleBatchResolveDuplicates = async (
    mergedRecords: StudentPaymentRecord[],
    deletedIds: string[]
  ) => {
    const currentSchoolId = activeSchool?.id || 'eminent-academy';
    const deletedSet = new Set(deletedIds);
    const mergedMap = new Map(mergedRecords.map((m) => [m.id, m]));

    // Update local state and persistent storage
    setStudents((prev) => {
      const next = prev
        .filter((s) => !deletedSet.has(s.id))
        .map((s) => (mergedMap.has(s.id) ? mergedMap.get(s.id)! : s));
      saveStoredStudents(next, currentSchoolId);
      // Batch sync to Firebase Cloud Firestore
      batchSaveStudentsToFirestore(next, currentSchoolId).catch(() => {});
      return next;
    });

    // Clean up firestore deleted records
    deletedIds.forEach((delId) => {
      deleteStudentFromFirestore(delId, currentSchoolId).catch(() => {});
    });

    showToast(`Successfully merged and cleaned ${mergedRecords.length} duplicate groups.`);
  };

  // Handle recording payment (Pay & Collect)
  const handleSubmitPayment = async (
    student: StudentPaymentRecord,
    paymentAmount: number,
    paymentMethod: string,
    feeCategory?: {
      categoryType?: 'tuition' | 'lesson' | 'exam' | 'custom';
      lessonMonth?: string;
      isPartPayment?: boolean;
      feeDescription?: string;
      receiptNumber?: string;
    }
  ): Promise<PaymentReceipt> => {
    const currentSchoolId = activeSchool?.id || 'eminent-academy';
    const res = await recordStudentPayment(
      student,
      paymentAmount,
      paymentMethod,
      feeCategory
    );
    const updatedRecord = res.updatedRecord;
    const receipt = res.receipt;

    setStudents((prev) => {
      const next = prev.map((s) => (s.id === student.id ? updatedRecord : s));
      saveStoredStudents(next, currentSchoolId);
      return next;
    });

    // Save payment update to Firebase Cloud Firestore
    saveStudentToFirestore(updatedRecord, currentSchoolId).catch((fErr) => {
      console.warn('[Firestore] Payment record save note:', fErr);
    });

    if (selectedStudentForDetails?.id === student.id) {
      setSelectedStudentForDetails(updatedRecord);
    }

    recordAuditLog(
      'PAYMENT',
      'RECORD_PAYMENT',
      `Recorded payment of ${session.currencySymbol}${paymentAmount.toLocaleString()} for ${student.full_name} (${student.class}) - Method: ${paymentMethod}`,
      {
        studentId: student.id,
        studentName: student.full_name,
        class: student.class,
        amount: paymentAmount,
        receiptNo: receipt?.receiptNumber,
        category: feeCategory?.categoryType || 'tuition',
        isPartPayment: feeCategory?.isPartPayment,
        newBalance: updatedRecord.balance,
      },
      session.bursarName,
      currentSchoolId,
      'SUCCESS'
    );

    showToast(`Recorded payment of ${session.currencySymbol}${paymentAmount.toLocaleString()} successfully.`);
    return receipt;
  };

  // Transition from Student Details to Record Payment
  const handleRecordPaymentForStudent = (student: StudentPaymentRecord) => {
    setSelectedStudentForDetails(null);
    setStudentForPayment(student);
    setActiveTab('record_payment');
  };

  // Handle Rollover completion
  const handleRolloverComplete = (newStudents: StudentPaymentRecord[], message: string) => {
    const currentSchoolId = activeSchool?.id || 'eminent-academy';
    setStudents(newStudents);
    saveStoredStudents(newStudents, currentSchoolId);
    batchSaveStudentsToFirestore(newStudents, currentSchoolId).catch(() => {});
    showToast(message);
    setActiveTab('students');
  };

  // Handle End Term completion
  const handleEndTermComplete = (updatedStudents: StudentPaymentRecord[], message: string) => {
    const currentSchoolId = activeSchool?.id || 'eminent-academy';
    setStudents(updatedStudents);
    saveStoredStudents(updatedStudents, currentSchoolId);
    batchSaveStudentsToFirestore(updatedStudents, currentSchoolId).catch(() => {});
    showToast(message);
    setActiveTab('students');
    loadStudents();
  };

  if (!session.isAuthenticated) {
    return (
      <LoginModal 
        session={session} 
        schools={schools}
        activeSchool={activeSchool}
        onSelectSchool={handleSelectSchool}
        onLogin={handleLogin} 
      />
    );
  }

  const isConfigured = Boolean(apiConfig.apiUrl && apiConfig.apiUrl.trim());

  return (
    <div className="h-[100dvh] w-full bg-slate-900/5 sm:bg-slate-100 flex flex-col overflow-hidden items-center justify-center">
      {/* Offline Status & Cloud Reconnect Banner */}
      <OfflineIndicator />

      {/* Mobile-first PWA layout on small screens + Responsive Full Dashboard Canvas on Desktop */}
      <div className="w-full max-w-7xl mx-auto h-full md:my-3 md:h-[calc(100dvh-1.5rem)] bg-white shadow-2xl flex flex-col relative md:rounded-3xl border-x md:border border-slate-200/80 overflow-hidden">
        
        {/* Top Sticky Header */}
        <Header
          session={session}
          isOnline={isOnline}
          isLoading={isLoading}
          onRefresh={() => loadStudents(true)}
          onOpenSettings={() => setIsSettingsOpen(true)}
          onOpenAddStudent={() => setIsAddStudentOpen(true)}
          onOpenSheetUpload={() => setIsSheetUploadOpen(true)}
          onOpenMigrator={() => setIsMigratorOpen(true)}
          onLogout={handleLogout}
          studentCount={students.length}
          activeSchool={activeSchool}
          syncStatus={syncStatus}
        />

        {/* Toast feedback banner */}
        {toastMessage && (
          <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 bg-slate-900 text-white text-xs font-semibold px-4 py-2.5 rounded-full shadow-lg border border-slate-700 animate-in fade-in slide-in-from-top-2 duration-200 pointer-events-none max-w-xs text-center">
            {toastMessage}
          </div>
        )}

        {/* Dynamic Tab Content Views */}
        <main className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
          {activeTab === 'students' && (
            <StudentList
              students={students}
              isLoading={isLoading}
              error={error}
              currencySymbol={session.currencySymbol}
              feeSchedule={activeSchool?.feeSchedule}
              activeSchool={activeSchool}
              onRefresh={() => loadStudents(true)}
              onSelectStudent={(stu) => setSelectedStudentForDetails(stu)}
              onOpenAddStudent={() => setIsAddStudentOpen(true)}
              onOpenScholarships={() => setIsScholarshipModalOpen(true)}
              onOpenSheetUpload={() => setIsSheetUploadOpen(true)}
              onOpenBackup={() => setIsRolloverModalOpen(true)}
              onOpenSettings={() => setIsSettingsOpen(true)}
              onOpenDuplicateCleaner={() => setIsDuplicateCleanerOpen(true)}
              onOpenMigrator={() => setIsMigratorOpen(true)}
              onDeleteStudent={handleDeleteStudent}
              isConfigured={isConfigured}
            />
          )}

          {activeTab === 'record_payment' && (
            <RecordPaymentView
              students={students}
              currencySymbol={session.currencySymbol}
              preselectedStudent={studentForPayment}
              onClearPreselectedStudent={() => setStudentForPayment(null)}
              onSubmitPayment={handleSubmitPayment}
              onViewStudentInList={(stu) => {
                setSelectedStudentForDetails(stu);
                setActiveTab('students');
              }}
              onOpenAddStudent={() => setIsAddStudentOpen(true)}
              activeSchool={activeSchool}
            />
          )}

          {activeTab === 'admission' && (
            <AdmissionView
              currencySymbol={session.currencySymbol}
              existingCount={students.length}
              students={students}
              onAddStudent={handleAddStudent}
              onViewStudent={(stu) => {
                setSelectedStudentForDetails(stu);
                setActiveTab('students');
              }}
              activeSchool={activeSchool}
            />
          )}

          {activeTab === 'payroll' && (
            <PayrollView
              session={session}
              activeSchool={activeSchool}
              students={students}
              onOpenSettings={() => setIsSettingsOpen(true)}
            />
          )}

          {activeTab === 'analytics' && (
            <AnalyticsView
              students={students}
              session={session}
              activeSchool={activeSchool}
              onSelectStudent={(stu) => setSelectedStudentForDetails(stu)}
              onFilterByClassInList={(className) => {
                setActiveTab('students');
              }}
              onOpenPayroll={() => setActiveTab('payroll')}
            />
          )}

          {activeTab === 'collection' && (
            <CollectionView
              students={students}
              session={session}
              onUpdateStudents={setStudents}
              onSelectStudent={(stu) => setSelectedStudentForDetails(stu)}
              onOpenRecordPayment={() => setActiveTab('record_payment')}
            />
          )}
        </main>

        {/* Bottom 5-Tab Navigation */}
        <BottomNav
          activeTab={activeTab}
          onTabChange={(tab) => {
            setSelectedStudentForDetails(null);
            setActiveTab(tab);
            if (tab === 'students') {
              setStudentForPayment(null);
            }
          }}
          studentCount={students.length}
        />

        {/* Student Full Details Modal with Confirmation */}
        <StudentDetailsModal
          student={selectedStudentForDetails}
          currencySymbol={session.currencySymbol}
          isOpen={Boolean(selectedStudentForDetails)}
          onClose={() => setSelectedStudentForDetails(null)}
          onRecordPaymentForStudent={handleRecordPaymentForStudent}
          onSaveStudentEdits={handleSaveStudentEdits}
          onDeleteStudent={handleDeleteStudent}
          activeSchool={activeSchool}
          onGrantScholarship={(student) => {
            setSelectedStudentForDetails(null);
            setStudentToGrantScholarship(student);
            setIsScholarshipModalOpen(true);
          }}
          onRevokeScholarship={handleRevokeScholarship}
        />

        {/* Add Existing Student Modal */}
        <AddExistingStudentModal
          isOpen={isAddStudentOpen}
          onClose={() => setIsAddStudentOpen(false)}
          currencySymbol={session.currencySymbol}
          existingCount={students.length}
          students={students}
          onAddStudent={handleAddStudent}
          activeSchool={activeSchool}
        />

        {/* Sheet API & Settings Modal */}
        <SettingsModal
          isOpen={isSettingsOpen}
          onClose={() => setIsSettingsOpen(false)}
          apiConfig={apiConfig}
          session={session}
          students={students}
          schools={schools}
          activeSchool={activeSchool}
          onSelectSchool={handleSelectSchool}
          onOpenAddSchool={handleOpenAddSchool}
          onOpenEditSchool={handleOpenEditSchool}
          onSaveSchool={handleSaveSchool}
          onUpdateStudentsFee={handleUpdateStudentsFee}
          onSaveConfig={handleSaveApiConfig}
          onSaveSession={handleSaveSession}
          onOpenEndTerm={() => setIsEndTermOpen(true)}
          onOpenRollover={() => setIsRolloverModalOpen(true)}
          onOpenDuplicateCleaner={() => setIsDuplicateCleanerOpen(true)}
          onOpenMigrator={() => setIsMigratorOpen(true)}
          onLogout={handleLogout}
        />

        {/* Duplicate Cleaner Modal */}
        <DuplicateCleanerModal
          isOpen={isDuplicateCleanerOpen}
          onClose={() => setIsDuplicateCleanerOpen(false)}
          students={students}
          session={session}
          activeSchool={activeSchool}
          onUpdateStudents={handleUpdateStudentsFromDuplicateCleaner}
        />

        {/* Add / Edit School & Fee Configuration Modal */}
        <SchoolModal
          isOpen={isSchoolModalOpen}
          onClose={() => setIsSchoolModalOpen(false)}
          onSave={handleSaveSchool}
          onDelete={handleDeleteSchool}
          schoolToEdit={schoolToEdit}
          mode={schoolModalMode}
          canDelete={schools.length > 1}
        />

        {/* End Term & Duplicate Sheet Backup Modal */}
        <EndTermModal
          isOpen={isEndTermOpen}
          onClose={() => setIsEndTermOpen(false)}
          students={students}
          session={session}
          activeSchool={activeSchool}
          onEndTermComplete={handleEndTermComplete}
        />

        {/* Next Term Backup & Rollover Modal */}
        <BackupRolloverModal
          isOpen={isRolloverModalOpen}
          onClose={() => setIsRolloverModalOpen(false)}
          students={students}
          session={session}
          onRolloverComplete={handleRolloverComplete}
        />

        {/* Student Upload via Google Sheet / Excel / CSV Modal */}
        <StudentUploadModal
          isOpen={isSheetUploadOpen}
          onClose={() => setIsSheetUploadOpen(false)}
          activeSchool={activeSchool}
          existingStudents={students}
          onUploadSuccess={(newStudents, message) => {
            setStudents(newStudents);
            saveStoredStudents(newStudents, activeSchool.id);
            showToast(message);
          }}
        />

        {/* Scholarships Management Modal */}
        <ScholarshipModal
          isOpen={isScholarshipModalOpen}
          onClose={() => {
            setIsScholarshipModalOpen(false);
            setStudentToGrantScholarship(null);
          }}
          students={students}
          scholarships={scholarships}
          onRefreshScholarships={() => loadStudents(true)}
          currencySymbol={session.currencySymbol}
          activeSchool={activeSchool}
          apiConfig={apiConfig}
          initialStudentToGrant={studentToGrantScholarship}
          onSaveScholarship={handleSaveScholarship}
          onRevokeScholarship={handleRevokeScholarship}
          onSelectStudent={(student) => {
            setSelectedStudentForDetails(student);
            setActiveTab('students');
          }}
        />

        {/* 1-Click Instant Sheet to Firebase Migrator Modal */}
        <SheetToFirebaseMigratorModal
          isOpen={isMigratorOpen}
          onClose={() => setIsMigratorOpen(false)}
          activeSchool={activeSchool}
          currentStudents={students}
          currentScholarships={scholarships}
          onMigrationComplete={(summary) => {
            setIsMigratorOpen(false);
            loadStudents(true);
            showToast(summary.message || `Migration to Firebase Cloud complete!`);
          }}
        />
      </div>
    </div>
  );
}
