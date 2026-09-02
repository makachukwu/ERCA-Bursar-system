/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  Settings,
  Database,
  Key,
  Check,
  Copy,
  AlertCircle,
  CheckCircle2,
  ExternalLink,
  Shield,
  HelpCircle,
  School,
  Archive,
  ArrowRight,
  RefreshCw,
  Download,
  FileSpreadsheet,
  Building2,
  Plus,
  Sliders,
  GraduationCap,
  BookOpen,
  Code2,
  Sparkles,
  Zap,
  Users,
  Search,
  ArrowLeft,
  ChevronRight,
  Coins,
  UserCheck,
  Layers,
  LayoutGrid,
  ShieldCheck,
  Wallet,
  Calendar,
  Clock,
  Save,
  RotateCcw,
  Trash2,
  Edit3,
  Cloud,
  Printer,
  Calculator,
  TrendingUp,
  Filter,
  Percent,
  Palette,
} from 'lucide-react';
import { BursarSession, StudentPaymentRecord, SchoolProfile, AcademicTermSchedule, SchoolFeeSchedule, SheetApiConfig } from '../types';
import { downloadCsvBackup, downloadJsonBackup } from '../services/backupService';
import { formatCurrency, getClassFeeSchedule } from '../services/calculations';
import { updateSchoolFeeSchedule, getStoredSchools } from '../services/schoolService';
import { syncFeeScheduleToSheet, fetchFeeScheduleFromSheet, detectProvider, testSheetConnection, GOOGLE_APPS_SCRIPT_CODE } from '../services/sheetApi';
import { DuplicateCleanerView } from './DuplicateCleanerView';
import { AuditLogsView } from './AuditLogsView';
import { SchoolBrandingCustomizer } from './SchoolBrandingCustomizer';
import { UserCredentialManager } from './UserCredentialManager';
import { PWAInstallButton } from './PWAInstallButton';
import { findDuplicateGroups } from '../services/deduplicationService';
import {
  getStoredTermSchedule,
  saveStoredTermSchedule,
  deriveMonthsBetweenDates,
  getMonthlyPaymentDueStatus,
  getFeeCollectionTimelineStatus,
} from '../services/termScheduleService';
import { formatMonthLabel } from '../services/payrollService';
import {
  testConnection as testFirebaseConnection,
  signInWithGoogle,
  signOutFirebase,
  getCurrentFirebaseUser,
  subscribeAuthState,
  batchSaveStudentsToFirestore,
  getStudentsFromFirestore,
  getSyncStatus,
  subscribeSyncStatus,
  saveTermScheduleToFirestore,
  saveSchoolProfileToFirestore,
  getSchoolProfilesFromFirestore,
  SyncStatus,
} from '../services/firebase';

export type AppToolId =
  | 'user_credentials'
  | 'school_branding'
  | 'fee_update'
  | 'school_profiles'
  | 'duplicate_cleaner'
  | 'term_schedule'
  | 'bursar_settings'
  | 'term_rollover'
  | 'end_term'
  | 'backups'
  | 'data_inspector'
  | 'audit_logs'
  | 'sheet_sync'
  | 'apps_script_code';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  apiConfig?: SheetApiConfig;
  session: BursarSession;
  students?: StudentPaymentRecord[];
  schools?: SchoolProfile[];
  activeSchool?: SchoolProfile;
  onSelectSchool?: (schoolId: string) => void;
  onOpenAddSchool?: () => void;
  onOpenEditSchool?: (school: SchoolProfile) => void;
  onSaveSchool?: (schoolData: Omit<SchoolProfile, 'id' | 'createdAt'>, schoolId?: string) => void;
  onUpdateStudentsFee?: (newSchedule: SchoolFeeSchedule, classFeeSchedulesOverride?: Record<string, SchoolFeeSchedule>) => void;
  onSaveConfig?: (config: SheetApiConfig, allConfigs?: Record<string, SheetApiConfig>) => void;
  onSaveSession: (session: BursarSession) => void;
  onOpenEndTerm?: () => void;
  onOpenRollover?: () => void;
  onOpenDuplicateCleaner?: () => void;
  onOpenMigrator?: () => void;
  onLogout?: () => void;
  onMergeDuplicateGroup?: (primaryId: string, mergedRecord: StudentPaymentRecord, deletedIds: string[]) => Promise<void> | void;
  onDeleteStudent?: (id: string, student: StudentPaymentRecord) => Promise<void> | void;
  onBatchResolveDuplicates?: (mergedRecords: StudentPaymentRecord[], deletedIds: string[]) => Promise<void> | void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  apiConfig,
  session,
  students = [],
  schools = [],
  activeSchool,
  onSelectSchool,
  onOpenAddSchool,
  onOpenEditSchool,
  onSaveSchool,
  onUpdateStudentsFee,
  onSaveConfig,
  onSaveSession,
  onOpenEndTerm,
  onOpenRollover,
  onOpenDuplicateCleaner,
  onOpenMigrator,
  onLogout,
  onMergeDuplicateGroup,
  onDeleteStudent,
  onBatchResolveDuplicates,
}) => {
  // Navigation: null = Gallery View, string = active sub-app view
  const [activeAppId, setActiveAppId] = useState<AppToolId | null>(null);
  const [gallerySearch, setGallerySearch] = useState('');

  // Currently viewed school in the Sheet API section
  const [selectedApiSchoolId, setSelectedApiSchoolId] = useState<string>(activeSchool?.id || schools[0]?.id || 'eminent-academy');

  // Map of API settings per school: { [schoolId]: { apiUrl: string, apiKey: string } }
  const [schoolApiMap, setSchoolApiMap] = useState<Record<string, { apiUrl: string; apiKey: string }>>({});

  const [schoolName, setSchoolName] = useState(session.schoolName || 'Eminent Royal Crown Academy');
  const [bursarName, setBursarName] = useState(session.bursarName || 'Bursar');
  const [currencySymbol, setCurrencySymbol] = useState(session.currencySymbol || '₦');

  // Base Fee schedule modification state
  const [tuitionFee, setTuitionFee] = useState<string>(() => String(activeSchool?.feeSchedule?.tuitionFee ?? 15000));
  const [admissionFee, setAdmissionFee] = useState<string>(() => String(activeSchool?.feeSchedule?.admissionFee ?? 5000));
  const [examFee, setExamFee] = useState<string>(() => String(activeSchool?.feeSchedule?.examFee ?? 1500));
  const [lessonFeeMonthly, setLessonFeeMonthly] = useState<string>(() => String(activeSchool?.feeSchedule?.lessonFeeMonthly ?? 2500));
  const [lessonFeeTermly, setLessonFeeTermly] = useState<string>(() => String(activeSchool?.feeSchedule?.lessonFeeTermly ?? 7000));
  
  // Class-specific fee schedule state
  const [classFeeSchedules, setClassFeeSchedules] = useState<Record<string, SchoolFeeSchedule>>({});
  const [selectedFeeClass, setSelectedFeeClass] = useState<string>('');
  const [classTuition, setClassTuition] = useState<string>('');
  const [classAdmission, setClassAdmission] = useState<string>('');
  const [classExam, setClassExam] = useState<string>('');
  const [classLessonMonthly, setClassLessonMonthly] = useState<string>('');
  const [classLessonTermly, setClassLessonTermly] = useState<string>('');
  const [classOverrideSuccess, setClassOverrideSuccess] = useState<string | null>(null);

  // Custom Fee tab filtering, batch actions, and modal states
  const [feeSectionFilter, setFeeSectionFilter] = useState<'all' | 'nursery' | 'primary' | 'jss' | 'sss'>('all');
  const [feeSearchTerm, setFeeSearchTerm] = useState<string>('');
  const [showBulkAdjustModal, setShowBulkAdjustModal] = useState<boolean>(false);
  const [bulkSurchargeAmount, setBulkSurchargeAmount] = useState<string>('1000');
  const [bulkSurchargeType, setBulkSurchargeType] = useState<'fixed' | 'percent'>('fixed');
  const [bulkSurchargeTarget, setBulkSurchargeTarget] = useState<'all' | 'nursery' | 'primary' | 'jss' | 'sss'>('all');
  const [bulkSurchargeField, setBulkSurchargeField] = useState<'tuitionFee' | 'examFee' | 'lessonFeeTermly' | 'admissionFee'>('tuitionFee');

  const [applyToEnrolledStudents, setApplyToEnrolledStudents] = useState<boolean>(true);
  const [feeSaveSuccess, setFeeSaveSuccess] = useState<string | null>(null);

  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [copiedType, setCopiedType] = useState<'itemized' | 'staff' | 'expenses' | 'basic' | 'appscript' | null>(null);
  const [showAppsScriptGuide, setShowAppsScriptGuide] = useState(false);
  const [headerTab, setHeaderTab] = useState<'students' | 'staff' | 'expenses'>('students');

  // Firebase Cloud State & Handlers
  const [firebaseUser, setFirebaseUser] = useState(getCurrentFirebaseUser());
  const [isFirebaseTesting, setIsFirebaseTesting] = useState(false);
  const [firebasePingResult, setFirebasePingResult] = useState<{ success: boolean; latencyMs: number; message: string } | null>(null);
  const [isFirebasePushing, setIsFirebasePushing] = useState(false);
  const [isFirebasePulling, setIsFirebasePulling] = useState(false);
  const [firebaseSyncMsg, setFirebaseSyncMsg] = useState<{ success: boolean; message: string } | null>(null);
  const [activeSyncLiveStatus, setActiveSyncLiveStatus] = useState<SyncStatus>(getSyncStatus());

  useEffect(() => {
    const unsubAuth = subscribeAuthState((u) => setFirebaseUser(u));
    const unsubSync = subscribeSyncStatus((s) => setActiveSyncLiveStatus(s));
    return () => {
      unsubAuth();
      unsubSync();
    };
  }, []);

  const handleTestFirebasePing = async () => {
    setIsFirebaseTesting(true);
    setFirebasePingResult(null);
    try {
      const res = await testFirebaseConnection();
      setFirebasePingResult(res);
    } catch (err: any) {
      setFirebasePingResult({
        success: false,
        latencyMs: 0,
        message: err?.message || 'Failed connecting to Firestore',
      });
    } finally {
      setIsFirebaseTesting(false);
    }
  };

  const handleFirebaseGoogleSignIn = async () => {
    try {
      const user = await signInWithGoogle();
      if (user) {
        setFirebaseSyncMsg({ success: true, message: `Connected as ${user.displayName || user.email}` });
        setTimeout(() => setFirebaseSyncMsg(null), 4000);
      }
    } catch (err: any) {
      setFirebaseSyncMsg({ success: false, message: `Sign in error: ${err?.message || err}` });
      setTimeout(() => setFirebaseSyncMsg(null), 5000);
    }
  };

  const handleFirebaseSignOut = async () => {
    try {
      await signOutFirebase();
      setFirebaseSyncMsg({ success: true, message: 'Signed out from Google account' });
      setTimeout(() => setFirebaseSyncMsg(null), 3000);
    } catch (err: any) {
      setFirebaseSyncMsg({ success: false, message: `Sign out error: ${err?.message || err}` });
    }
  };

  const handlePushAllToFirebase = async () => {
    if (!students || students.length === 0) {
      setFirebaseSyncMsg({ success: false, message: 'No student records to push.' });
      setTimeout(() => setFirebaseSyncMsg(null), 3000);
      return;
    }
    const currentSchoolId = activeSchool?.id || 'eminent-academy';
    setIsFirebasePushing(true);
    setFirebaseSyncMsg(null);
    try {
      const ok = await batchSaveStudentsToFirestore(students, currentSchoolId);
      if (ok) {
        setFirebaseSyncMsg({
          success: true,
          message: `✓ Successfully synced ${students.length} student records to Cloud Firestore!`,
        });
      } else {
        setFirebaseSyncMsg({
          success: false,
          message: 'Could not push all records. Please check cloud connection.',
        });
      }
    } catch (err: any) {
      setFirebaseSyncMsg({ success: false, message: `Push failed: ${err?.message || err}` });
    } finally {
      setIsFirebasePushing(false);
      setTimeout(() => setFirebaseSyncMsg(null), 5000);
    }
  };

  const handlePullAllFromFirebase = async () => {
    const currentSchoolId = activeSchool?.id || 'eminent-academy';
    setIsFirebasePulling(true);
    setFirebaseSyncMsg(null);
    try {
      const cloudStudents = await getStudentsFromFirestore(currentSchoolId);
      if (cloudStudents && cloudStudents.length > 0) {
        if (onBatchResolveDuplicates) {
          onBatchResolveDuplicates(cloudStudents, []);
        }
        setFirebaseSyncMsg({
          success: true,
          message: `✓ Successfully retrieved ${cloudStudents.length} student records from Cloud Firestore!`,
        });
      } else {
        setFirebaseSyncMsg({
          success: false,
          message: 'No student records found in Cloud Firestore for this campus.',
        });
      }
    } catch (err: any) {
      setFirebaseSyncMsg({ success: false, message: `Pull failed: ${err?.message || err}` });
    } finally {
      setIsFirebasePulling(false);
      setTimeout(() => setFirebaseSyncMsg(null), 5000);
    }
  };

  // Term Schedule Configuration within Settings
  const settingsSchoolId = activeSchool?.id || session.schoolId || 'eminent-academy';
  const [scheduleTerm, setScheduleTerm] = useState<string>('First Term');
  const [termScheduleData, setTermScheduleData] = useState<AcademicTermSchedule>(() =>
    getStoredTermSchedule('First Term', session.schoolName, settingsSchoolId)
  );
  const [scheduleStartDate, setScheduleStartDate] = useState(termScheduleData.termStartDate);
  const [scheduleEndDate, setScheduleEndDate] = useState(termScheduleData.termEndDate);
  const [scheduleSalaryDueDay, setScheduleSalaryDueDay] = useState(termScheduleData.salaryDueDay || 25);
  const [scheduleFeeStart, setScheduleFeeStart] = useState(termScheduleData.feeCollectionStartDate);
  const [scheduleFeeDue, setScheduleFeeDue] = useState(termScheduleData.feeDueDate);
  const [scheduleSavedMsg, setScheduleSavedMsg] = useState(false);

  const derivedScheduleMonths = useMemo(() => {
    return deriveMonthsBetweenDates(scheduleStartDate, scheduleEndDate);
  }, [scheduleStartDate, scheduleEndDate]);

  const scheduleTimelineStatus = useMemo(() => {
    return getFeeCollectionTimelineStatus({
      term: scheduleTerm,
      session: session.schoolName || '2026/2027',
      termStartDate: scheduleStartDate,
      termEndDate: scheduleEndDate,
      salaryDueDay: Number(scheduleSalaryDueDay) || 25,
      feeCollectionStartDate: scheduleFeeStart,
      feeDueDate: scheduleFeeDue,
      monthsInTerm: derivedScheduleMonths,
    });
  }, [scheduleTerm, session.schoolName, scheduleStartDate, scheduleEndDate, scheduleSalaryDueDay, scheduleFeeStart, scheduleFeeDue, derivedScheduleMonths]);

  // Sync state when props change or modal opens
  useEffect(() => {
    if (isOpen) {
      const initialMap: Record<string, { apiUrl: string; apiKey: string }> = {};
      schools.forEach((sch) => {
        initialMap[sch.id] = {
          apiUrl: sch.sheetConfig?.apiUrl || (sch.id === activeSchool?.id ? apiConfig.apiUrl : '') || '',
          apiKey: sch.sheetConfig?.apiKey || (sch.id === activeSchool?.id ? apiConfig.apiKey : '') || '',
        };
      });

      if (activeSchool && !initialMap[activeSchool.id]) {
        initialMap[activeSchool.id] = {
          apiUrl: apiConfig.apiUrl || '',
          apiKey: apiConfig.apiKey || '',
        };
      }

      setSchoolApiMap(initialMap);
      setSelectedApiSchoolId(activeSchool?.id || schools[0]?.id || 'eminent-academy');
      setSchoolName(activeSchool?.name || session.schoolName || 'Eminent Royal Crown Academy');
      setBursarName(session.bursarName || 'Bursar');
      setCurrencySymbol(activeSchool?.currencySymbol || session.currencySymbol || '₦');
      setTestResult(null);
      setSaveSuccess(false);

      // Refresh schedule on open
      const sch = getStoredTermSchedule(scheduleTerm, session.schoolName, settingsSchoolId);
      setTermScheduleData(sch);
      setScheduleStartDate(sch.termStartDate);
      setScheduleEndDate(sch.termEndDate);
      setScheduleSalaryDueDay(sch.salaryDueDay || 25);
      setScheduleFeeStart(sch.feeCollectionStartDate);
      setScheduleFeeDue(sch.feeDueDate);

      // Refresh fee schedule inputs & class-specific schedules
      const baseT = String(activeSchool?.feeSchedule?.tuitionFee ?? 15000);
      const baseA = String(activeSchool?.feeSchedule?.admissionFee ?? 5000);
      const baseE = String(activeSchool?.feeSchedule?.examFee ?? 1500);
      const baseLM = String(activeSchool?.feeSchedule?.lessonFeeMonthly ?? 2500);
      const baseLT = String(activeSchool?.feeSchedule?.lessonFeeTermly ?? 7000);

      setTuitionFee(baseT);
      setAdmissionFee(baseA);
      setExamFee(baseE);
      setLessonFeeMonthly(baseLM);
      setLessonFeeTermly(baseLT);

      const initialClassSchedules = activeSchool?.classFeeSchedules ? { ...activeSchool.classFeeSchedules } : {};
      setClassFeeSchedules(initialClassSchedules);

      const schoolClasses = activeSchool?.classes && activeSchool.classes.length > 0
        ? activeSchool.classes
        : ['Kg1', 'Kg2', 'Nur1', 'Nur2', 'Pri1', 'Pri2', 'Pri3', 'Pri4', 'Pri5', 'Jss1', 'Jss2', 'Jss3', 'Ss1', 'Ss2', 'Ss3'];
      
      const firstClass = schoolClasses[0] || 'Pri1';
      setSelectedFeeClass(firstClass);

      const firstClassSchedule = initialClassSchedules[firstClass];
      if (firstClassSchedule) {
        setClassTuition(String(firstClassSchedule.tuitionFee ?? baseT));
        setClassAdmission(String(firstClassSchedule.admissionFee ?? baseA));
        setClassExam(String(firstClassSchedule.examFee ?? baseE));
        setClassLessonMonthly(String(firstClassSchedule.lessonFeeMonthly ?? baseLM));
        setClassLessonTermly(String(firstClassSchedule.lessonFeeTermly ?? baseLT));
      } else {
        setClassTuition(baseT);
        setClassAdmission(baseA);
        setClassExam(baseE);
        setClassLessonMonthly(baseLM);
        setClassLessonTermly(baseLT);
      }
    }
  }, [isOpen, apiConfig, session, activeSchool, schools, settingsSchoolId]);

  const [isSyncingFeeToSheet, setIsSyncingFeeToSheet] = useState(false);
  const [feeSheetSyncMsg, setFeeSheetSyncMsg] = useState<{ success: boolean; message: string } | null>(null);

  // Switch selected fee class and load its values
  const handleSelectFeeClass = (cls: string) => {
    setSelectedFeeClass(cls);
    const existing = classFeeSchedules[cls];
    if (existing) {
      setClassTuition(String(existing.tuitionFee ?? tuitionFee));
      setClassAdmission(String(existing.admissionFee ?? admissionFee));
      setClassExam(String(existing.examFee ?? examFee));
      setClassLessonMonthly(String(existing.lessonFeeMonthly ?? lessonFeeMonthly));
      setClassLessonTermly(String(existing.lessonFeeTermly ?? lessonFeeTermly));
    } else {
      setClassTuition(tuitionFee);
      setClassAdmission(admissionFee);
      setClassExam(examFee);
      setClassLessonMonthly(lessonFeeMonthly);
      setClassLessonTermly(lessonFeeTermly);
    }
  };

  // Set / update custom rates for the selected class and apply immediately
  const handleApplyClassOverride = () => {
    if (!selectedFeeClass || !activeSchool) return;
    const newClassSchedule: SchoolFeeSchedule = {
      tuitionFee: Math.max(0, Number(classTuition) || 0),
      admissionFee: Math.max(0, Number(classAdmission) || 0),
      examFee: Math.max(0, Number(classExam) || 0),
      lessonFeeMonthly: Math.max(0, Number(classLessonMonthly) || 0),
      lessonFeeTermly: Math.max(0, Number(classLessonTermly) || 0),
    };

    const nextClassSchedules = {
      ...classFeeSchedules,
      [selectedFeeClass]: newClassSchedule,
    };

    setClassFeeSchedules(nextClassSchedules);

    const parsedTuition = Math.max(0, Number(tuitionFee) || 0);
    const parsedAdmission = Math.max(0, Number(admissionFee) || 0);
    const parsedExam = Math.max(0, Number(examFee) || 0);
    const parsedLessonMonthly = Math.max(0, Number(lessonFeeMonthly) || 0);
    const parsedLessonTermly = Math.max(0, Number(lessonFeeTermly) || 0);

    const baseSchedule: SchoolFeeSchedule = {
      tuitionFee: parsedTuition,
      admissionFee: parsedAdmission,
      examFee: parsedExam,
      lessonFeeMonthly: parsedLessonMonthly,
      lessonFeeTermly: parsedLessonTermly,
    };

    // 1. Direct LocalStorage persistence
    updateSchoolFeeSchedule(activeSchool.id, baseSchedule, nextClassSchedules);

    // 2. Parent state notification
    if (onSaveSchool) {
      const payload: Omit<SchoolProfile, 'id' | 'createdAt'> = {
        name: activeSchool.name,
        type: activeSchool.type,
        currencySymbol: activeSchool.currencySymbol || currencySymbol || '₦',
        feeSchedule: baseSchedule,
        classFeeSchedules: Object.keys(nextClassSchedules).length > 0 ? nextClassSchedules : undefined,
        classes: activeSchool.classes,
        sheetConfig: activeSchool.sheetConfig,
      };
      onSaveSchool(payload, activeSchool.id);
    }

    // 3. Update enrolled students if enabled
    if (applyToEnrolledStudents && onUpdateStudentsFee) {
      onUpdateStudentsFee(baseSchedule, nextClassSchedules);
    }

    // 4. Background Google Sheets sync if configured
    if (apiConfig?.apiUrl && apiConfig.apiUrl.trim()) {
      syncFeeScheduleToSheet(
        apiConfig,
        baseSchedule,
        nextClassSchedules,
        activeSchool.name,
        activeSchool.classes,
        activeSchool.currencySymbol || currencySymbol || '₦'
      ).catch((err) => console.warn('Background fee sync to sheet notice:', err));
    }

    setClassOverrideSuccess(`✓ Modified rates for ${selectedFeeClass} saved permanently & applied across the app!`);
    setTimeout(() => setClassOverrideSuccess(null), 4000);
  };

  // Remove override for a class (revert to base rates) and apply immediately
  const handleResetClassOverride = (cls: string) => {
    if (!activeSchool) return;
    const nextClassSchedules = { ...classFeeSchedules };
    delete nextClassSchedules[cls];
    setClassFeeSchedules(nextClassSchedules);

    if (cls === selectedFeeClass) {
      setClassTuition(tuitionFee);
      setClassAdmission(admissionFee);
      setClassExam(examFee);
      setClassLessonMonthly(lessonFeeMonthly);
      setClassLessonTermly(lessonFeeTermly);
    }

    const parsedTuition = Math.max(0, Number(tuitionFee) || 0);
    const parsedAdmission = Math.max(0, Number(admissionFee) || 0);
    const parsedExam = Math.max(0, Number(examFee) || 0);
    const parsedLessonMonthly = Math.max(0, Number(lessonFeeMonthly) || 0);
    const parsedLessonTermly = Math.max(0, Number(lessonFeeTermly) || 0);

    const baseSchedule: SchoolFeeSchedule = {
      tuitionFee: parsedTuition,
      admissionFee: parsedAdmission,
      examFee: parsedExam,
      lessonFeeMonthly: parsedLessonMonthly,
      lessonFeeTermly: parsedLessonTermly,
    };

    // 1. Direct LocalStorage persistence
    updateSchoolFeeSchedule(activeSchool.id, baseSchedule, nextClassSchedules);

    // 2. Parent state notification
    if (onSaveSchool) {
      const payload: Omit<SchoolProfile, 'id' | 'createdAt'> = {
        name: activeSchool.name,
        type: activeSchool.type,
        currencySymbol: activeSchool.currencySymbol || currencySymbol || '₦',
        feeSchedule: baseSchedule,
        classFeeSchedules: Object.keys(nextClassSchedules).length > 0 ? nextClassSchedules : undefined,
        classes: activeSchool.classes,
        sheetConfig: activeSchool.sheetConfig,
      };
      onSaveSchool(payload, activeSchool.id);
    }

    // 3. Update enrolled students if enabled
    if (applyToEnrolledStudents && onUpdateStudentsFee) {
      onUpdateStudentsFee(baseSchedule, nextClassSchedules);
    }

    // 4. Background Google Sheets sync if configured
    if (apiConfig?.apiUrl && apiConfig.apiUrl.trim()) {
      syncFeeScheduleToSheet(
        apiConfig,
        baseSchedule,
        nextClassSchedules,
        activeSchool.name,
        activeSchool.classes,
        activeSchool.currencySymbol || currencySymbol || '₦'
      ).catch((err) => console.warn('Background fee sync to sheet notice:', err));
    }

    setClassOverrideSuccess(`✓ Reverted ${cls} to Base Academy Rates across the app`);
    setTimeout(() => setClassOverrideSuccess(null), 4000);
  };

  // Copy base rates into class inputs
  const handleCopyBaseToClass = () => {
    setClassTuition(tuitionFee);
    setClassAdmission(admissionFee);
    setClassExam(examFee);
    setClassLessonMonthly(lessonFeeMonthly);
    setClassLessonTermly(lessonFeeTermly);
  };

  // Helper to categorize classes into educational tiers
  const getClassSection = (cls: string): 'nursery' | 'primary' | 'jss' | 'sss' | 'other' => {
    const c = cls.toLowerCase().trim();
    if (c.startsWith('kg') || c.startsWith('nur') || c.includes('creche') || c.includes('play')) return 'nursery';
    if (c.startsWith('pri') || c.startsWith('basic') || c.startsWith('grade')) return 'primary';
    if (c.startsWith('jss') || c.startsWith('j.s')) return 'jss';
    if (c.startsWith('ss') || c.startsWith('s.s')) return 'sss';
    return 'other';
  };

  const schoolClassesList = useMemo(() => {
    return activeSchool?.classes && activeSchool.classes.length > 0
      ? activeSchool.classes
      : ['Kg1', 'Kg2', 'Nur1', 'Nur2', 'Pri1', 'Pri2', 'Pri3', 'Pri4', 'Pri5', 'Jss1', 'Jss2', 'Jss3', 'Ss1', 'Ss2', 'Ss3'];
  }, [activeSchool]);

  // Enrolled student counts and projected revenue calculations
  const classEnrollmentStats = useMemo(() => {
    const counts: Record<string, number> = {};
    const revenue: Record<string, number> = {};
    let totalEnrolled = 0;
    let totalProjected = 0;

    if (Array.isArray(students)) {
      students.forEach((s) => {
        if (!s) return;
        const cls = s.class || 'Unassigned';
        counts[cls] = (counts[cls] || 0) + 1;
        totalEnrolled += 1;
      });
    }

    schoolClassesList.forEach((cls) => {
      const count = counts[cls] || 0;
      const sched = classFeeSchedules[cls] || {
        tuitionFee: Number(tuitionFee) || 15000,
        examFee: Number(examFee) || 1500,
        lessonFeeTermly: Number(lessonFeeTermly) || 7000,
      };
      const termPkg = (sched.tuitionFee || 0) + (sched.examFee || 0) + (sched.lessonFeeTermly || 0);
      const rev = count * termPkg;
      revenue[cls] = rev;
      totalProjected += rev;
    });

    return { counts, revenue, totalEnrolled, totalProjected };
  }, [students, schoolClassesList, classFeeSchedules, tuitionFee, examFee, lessonFeeTermly]);

  // Batch apply current form rates to an entire educational tier/section
  const handleBatchApplyToSection = (section: 'nursery' | 'primary' | 'jss' | 'sss' | 'all') => {
    if (!activeSchool) return;
    const targetClasses = schoolClassesList.filter(
      (cls) => section === 'all' || getClassSection(cls) === section
    );
    if (targetClasses.length === 0) return;

    const newScheduleForSection: SchoolFeeSchedule = {
      tuitionFee: Math.max(0, Number(classTuition) || 0),
      admissionFee: Math.max(0, Number(classAdmission) || 0),
      examFee: Math.max(0, Number(classExam) || 0),
      lessonFeeMonthly: Math.max(0, Number(classLessonMonthly) || 0),
      lessonFeeTermly: Math.max(0, Number(classLessonTermly) || 0),
    };

    const nextClassSchedules = { ...classFeeSchedules };
    targetClasses.forEach((cls) => {
      nextClassSchedules[cls] = { ...newScheduleForSection };
    });

    setClassFeeSchedules(nextClassSchedules);

    const baseSchedule: SchoolFeeSchedule = {
      tuitionFee: Math.max(0, Number(tuitionFee) || 0),
      admissionFee: Math.max(0, Number(admissionFee) || 0),
      examFee: Math.max(0, Number(examFee) || 0),
      lessonFeeMonthly: Math.max(0, Number(lessonFeeMonthly) || 0),
      lessonFeeTermly: Math.max(0, Number(lessonFeeTermly) || 0),
    };

    updateSchoolFeeSchedule(activeSchool.id, baseSchedule, nextClassSchedules);
    if (onSaveSchool) {
      onSaveSchool(
        {
          name: activeSchool.name,
          type: activeSchool.type,
          currencySymbol: activeSchool.currencySymbol || currencySymbol || '₦',
          feeSchedule: baseSchedule,
          classFeeSchedules: nextClassSchedules,
          classes: activeSchool.classes,
          sheetConfig: activeSchool.sheetConfig,
        },
        activeSchool.id
      );
    }
    if (applyToEnrolledStudents && onUpdateStudentsFee) {
      onUpdateStudentsFee(baseSchedule, nextClassSchedules);
    }

    if (apiConfig?.apiUrl && apiConfig.apiUrl.trim()) {
      syncFeeScheduleToSheet(
        apiConfig,
        baseSchedule,
        nextClassSchedules,
        activeSchool.name,
        activeSchool.classes,
        activeSchool.currencySymbol || currencySymbol || '₦'
      ).catch((err) => console.warn('Background fee sync to sheet notice:', err));
    }

    setClassOverrideSuccess(
      `✓ Applied rates to all ${targetClasses.length} classes in ${section.toUpperCase()}!`
    );
    setTimeout(() => setClassOverrideSuccess(null), 4000);
  };

  // Reset all class fee overrides back to the base academy schedule
  const handleResetAllClassOverrides = () => {
    if (!activeSchool) return;
    setClassFeeSchedules({});

    const baseSchedule: SchoolFeeSchedule = {
      tuitionFee: Math.max(0, Number(tuitionFee) || 0),
      admissionFee: Math.max(0, Number(admissionFee) || 0),
      examFee: Math.max(0, Number(examFee) || 0),
      lessonFeeMonthly: Math.max(0, Number(lessonFeeMonthly) || 0),
      lessonFeeTermly: Math.max(0, Number(lessonFeeTermly) || 0),
    };

    updateSchoolFeeSchedule(activeSchool.id, baseSchedule, {});
    if (onSaveSchool) {
      onSaveSchool(
        {
          name: activeSchool.name,
          type: activeSchool.type,
          currencySymbol: activeSchool.currencySymbol || currencySymbol || '₦',
          feeSchedule: baseSchedule,
          classFeeSchedules: undefined,
          classes: activeSchool.classes,
          sheetConfig: activeSchool.sheetConfig,
        },
        activeSchool.id
      );
    }
    if (applyToEnrolledStudents && onUpdateStudentsFee) {
      onUpdateStudentsFee(baseSchedule, {});
    }

    if (apiConfig?.apiUrl && apiConfig.apiUrl.trim()) {
      syncFeeScheduleToSheet(
        apiConfig,
        baseSchedule,
        {},
        activeSchool.name,
        activeSchool.classes,
        activeSchool.currencySymbol || currencySymbol || '₦'
      ).catch((err) => console.warn('Background fee sync to sheet notice:', err));
    }

    setClassTuition(tuitionFee);
    setClassAdmission(admissionFee);
    setClassExam(examFee);
    setClassLessonMonthly(lessonFeeMonthly);
    setClassLessonTermly(lessonFeeTermly);

    setClassOverrideSuccess('✓ Reverted all classes to Base Academy Rates across the entire app!');
    setTimeout(() => setClassOverrideSuccess(null), 4000);
  };

  // Bulk rate adjuster (surcharge or discount)
  const handleApplyBulkAdjust = () => {
    const val = Number(bulkSurchargeAmount);
    if (isNaN(val) || val === 0 || !activeSchool) return;

    const targetClasses = schoolClassesList.filter(
      (cls) => bulkSurchargeTarget === 'all' || getClassSection(cls) === bulkSurchargeTarget
    );
    const nextClassSchedules = { ...classFeeSchedules };

    targetClasses.forEach((cls) => {
      const current = classFeeSchedules[cls] || {
        tuitionFee: Number(tuitionFee) || 0,
        admissionFee: Number(admissionFee) || 0,
        examFee: Number(examFee) || 0,
        lessonFeeMonthly: Number(lessonFeeMonthly) || 0,
        lessonFeeTermly: Number(lessonFeeTermly) || 0,
      };

      const originalAmt = current[bulkSurchargeField] || 0;
      const delta =
        bulkSurchargeType === 'percent' ? Math.round((originalAmt * val) / 100) : val;

      nextClassSchedules[cls] = {
        ...current,
        [bulkSurchargeField]: Math.max(0, originalAmt + delta),
      };
    });

    setClassFeeSchedules(nextClassSchedules);

    const baseSchedule: SchoolFeeSchedule = {
      tuitionFee: Math.max(0, Number(tuitionFee) || 0),
      admissionFee: Math.max(0, Number(admissionFee) || 0),
      examFee: Math.max(0, Number(examFee) || 0),
      lessonFeeMonthly: Math.max(0, Number(lessonFeeMonthly) || 0),
      lessonFeeTermly: Math.max(0, Number(lessonFeeTermly) || 0),
    };

    updateSchoolFeeSchedule(activeSchool.id, baseSchedule, nextClassSchedules);
    if (onSaveSchool) {
      onSaveSchool(
        {
          name: activeSchool.name,
          type: activeSchool.type,
          currencySymbol: activeSchool.currencySymbol || currencySymbol || '₦',
          feeSchedule: baseSchedule,
          classFeeSchedules: nextClassSchedules,
          classes: activeSchool.classes,
          sheetConfig: activeSchool.sheetConfig,
        },
        activeSchool.id
      );
    }
    if (applyToEnrolledStudents && onUpdateStudentsFee) {
      onUpdateStudentsFee(baseSchedule, nextClassSchedules);
    }

    if (apiConfig?.apiUrl && apiConfig.apiUrl.trim()) {
      syncFeeScheduleToSheet(
        apiConfig,
        baseSchedule,
        nextClassSchedules,
        activeSchool.name,
        activeSchool.classes,
        activeSchool.currencySymbol || currencySymbol || '₦'
      ).catch((err) => console.warn('Background fee sync to sheet notice:', err));
    }

    // Refresh currently edited inputs if in target list
    if (selectedFeeClass && targetClasses.includes(selectedFeeClass)) {
      const updated = nextClassSchedules[selectedFeeClass];
      if (updated) {
        setClassTuition(String(updated.tuitionFee));
        setClassAdmission(String(updated.admissionFee));
        setClassExam(String(updated.examFee));
        setClassLessonMonthly(String(updated.lessonFeeMonthly));
        setClassLessonTermly(String(updated.lessonFeeTermly));
      }
    }

    setShowBulkAdjustModal(false);
    setClassOverrideSuccess(
      `✓ Adjusted ${bulkSurchargeField} for ${targetClasses.length} classes by ${
        bulkSurchargeType === 'percent' ? `${val}%` : `${currencySymbol}${val.toLocaleString()}`
      }!`
    );
    setTimeout(() => setClassOverrideSuccess(null), 4000);
  };

  // Export fee schedule to CSV
  const handleExportFeeScheduleCsv = () => {
    const headers = [
      'Class',
      'Section',
      'Tuition Fee',
      'Admission Fee (New)',
      'Exam Fee',
      'Lesson Monthly',
      'Lesson Termly',
      'Total Term Package (Tuition+Exam+Lesson)',
      'Enrolled Students',
      'Projected Revenue',
      'Rate Status',
    ];
    const rows = schoolClassesList.map((cls) => {
      const override = classFeeSchedules[cls];
      const t = override?.tuitionFee ?? (Number(tuitionFee) || 15000);
      const a = override?.admissionFee ?? (Number(admissionFee) || 5000);
      const e = override?.examFee ?? (Number(examFee) || 1500);
      const lm = override?.lessonFeeMonthly ?? (Number(lessonFeeMonthly) || 2500);
      const lt = override?.lessonFeeTermly ?? (Number(lessonFeeTermly) || 7000);
      const totalTerm = t + e + lt;
      const count = classEnrollmentStats.counts[cls] || 0;
      const rev = count * totalTerm;
      const sec = getClassSection(cls).toUpperCase();
      const status = override ? 'Custom Rate' : 'Base Rate';
      return [cls, sec, t, a, e, lm, lt, totalTerm, count, rev, status];
    });

    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute(
      'download',
      `${(activeSchool?.name || 'School').replace(/\s+/g, '_')}_Fee_Schedule_${
        new Date().toISOString().split('T')[0]
      }.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Print official school fee schedule
  const handlePrintFeeSchedule = () => {
    window.print();
  };

  const handleSyncFeeScheduleDirectly = async () => {
    if (!activeSchool) return;
    if (!apiConfig?.apiUrl || !apiConfig.apiUrl.trim()) {
      setFeeSheetSyncMsg({ success: false, message: 'Please configure your Google Sheet API URL in Google Sheet Sync tab first.' });
      setTimeout(() => setFeeSheetSyncMsg(null), 4000);
      return;
    }

    setIsSyncingFeeToSheet(true);
    setFeeSheetSyncMsg(null);
    try {
      const parsedTuition = Math.max(0, Number(tuitionFee) || 0);
      const parsedAdmission = Math.max(0, Number(admissionFee) || 0);
      const parsedExam = Math.max(0, Number(examFee) || 0);
      const parsedLessonMonthly = Math.max(0, Number(lessonFeeMonthly) || 0);
      const parsedLessonTermly = Math.max(0, Number(lessonFeeTermly) || 0);

      const baseSchedule: SchoolFeeSchedule = {
        tuitionFee: parsedTuition,
        admissionFee: parsedAdmission,
        examFee: parsedExam,
        lessonFeeMonthly: parsedLessonMonthly,
        lessonFeeTermly: parsedLessonTermly,
      };

      const res = await syncFeeScheduleToSheet(
        apiConfig,
        baseSchedule,
        classFeeSchedules,
        activeSchool.name,
        activeSchool.classes,
        activeSchool.currencySymbol || currencySymbol || '₦'
      );
      setFeeSheetSyncMsg({ success: true, message: `✓ Synced all modified fees to Google Sheet (${res.message || 'CustomFee tab updated'})` });
    } catch (err: any) {
      setFeeSheetSyncMsg({ success: false, message: `Error syncing fee schedule to Sheet: ${err?.message || err}` });
    } finally {
      setIsSyncingFeeToSheet(false);
      setTimeout(() => setFeeSheetSyncMsg(null), 5000);
    }
  };

  const handleFetchFeeScheduleDirectly = async () => {
    if (!activeSchool) return;
    if (!apiConfig?.apiUrl || !apiConfig.apiUrl.trim()) {
      setFeeSheetSyncMsg({ success: false, message: 'Please configure your Google Sheet API URL in Google Sheet Sync tab first.' });
      setTimeout(() => setFeeSheetSyncMsg(null), 4000);
      return;
    }

    setIsSyncingFeeToSheet(true);
    setFeeSheetSyncMsg(null);
    try {
      const res = await fetchFeeScheduleFromSheet(apiConfig);
      if (!res) {
        setFeeSheetSyncMsg({ success: false, message: 'No CustomFee or FeeSchedule tab found in Google Sheet. Click "Sync to Google Sheet" below to create and write it!' });
        return;
      }

      if (res.feeSchedule) {
        setTuitionFee(String(res.feeSchedule.tuitionFee ?? 15000));
        setAdmissionFee(String(res.feeSchedule.admissionFee ?? 5000));
        setExamFee(String(res.feeSchedule.examFee ?? 1500));
        setLessonFeeMonthly(String(res.feeSchedule.lessonFeeMonthly ?? 2500));
        setLessonFeeTermly(String(res.feeSchedule.lessonFeeTermly ?? 7000));
      }

      if (res.classFeeSchedules && Object.keys(res.classFeeSchedules).length > 0) {
        setClassFeeSchedules(res.classFeeSchedules);
        if (selectedFeeClass && res.classFeeSchedules[selectedFeeClass]) {
          const s = res.classFeeSchedules[selectedFeeClass];
          setClassTuition(String(s.tuitionFee ?? tuitionFee));
          setClassAdmission(String(s.admissionFee ?? admissionFee));
          setClassExam(String(s.examFee ?? examFee));
          setClassLessonMonthly(String(s.lessonFeeMonthly ?? lessonFeeMonthly));
          setClassLessonTermly(String(s.lessonFeeTermly ?? lessonFeeTermly));
        }
      }

      updateSchoolFeeSchedule(activeSchool.id, res.feeSchedule || activeSchool.feeSchedule, res.classFeeSchedules);
      if (onSaveSchool && res.feeSchedule) {
        onSaveSchool({
          name: activeSchool.name,
          type: activeSchool.type,
          currencySymbol: activeSchool.currencySymbol || currencySymbol || '₦',
          feeSchedule: res.feeSchedule,
          classFeeSchedules: res.classFeeSchedules,
          classes: activeSchool.classes,
          sheetConfig: activeSchool.sheetConfig,
        }, activeSchool.id);
      }

      setFeeSheetSyncMsg({ success: true, message: `✓ Successfully imported fee schedule and ${Object.keys(res.classFeeSchedules || {}).length} class rates from Google Sheet!` });
    } catch (err: any) {
      setFeeSheetSyncMsg({ success: false, message: `Error importing from Sheet: ${err?.message || err}` });
    } finally {
      setIsSyncingFeeToSheet(false);
      setTimeout(() => setFeeSheetSyncMsg(null), 5000);
    }
  };

  const handleSaveFeeSchedule = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeSchool) return;

    const parsedTuition = Math.max(0, Number(tuitionFee) || 0);
    const parsedAdmission = Math.max(0, Number(admissionFee) || 0);
    const parsedExam = Math.max(0, Number(examFee) || 0);
    const parsedLessonMonthly = Math.max(0, Number(lessonFeeMonthly) || 0);
    const parsedLessonTermly = Math.max(0, Number(lessonFeeTermly) || 0);

    const updatedSchedule: SchoolFeeSchedule = {
      tuitionFee: parsedTuition,
      admissionFee: parsedAdmission,
      examFee: parsedExam,
      lessonFeeMonthly: parsedLessonMonthly,
      lessonFeeTermly: parsedLessonTermly,
    };

    const finalClassSchedules = { ...classFeeSchedules };

    // Auto-merge currently edited selectedFeeClass if modified
    if (selectedFeeClass) {
      const currentClassTuition = Math.max(0, Number(classTuition) || 0);
      const currentClassAdmission = Math.max(0, Number(classAdmission) || 0);
      const currentClassExam = Math.max(0, Number(classExam) || 0);
      const currentClassLessonMonthly = Math.max(0, Number(classLessonMonthly) || 0);
      const currentClassLessonTermly = Math.max(0, Number(classLessonTermly) || 0);

      // If class differs from base, save as class override
      if (
        currentClassTuition !== parsedTuition ||
        currentClassAdmission !== parsedAdmission ||
        currentClassExam !== parsedExam ||
        currentClassLessonMonthly !== parsedLessonMonthly ||
        currentClassLessonTermly !== parsedLessonTermly ||
        finalClassSchedules[selectedFeeClass]
      ) {
        finalClassSchedules[selectedFeeClass] = {
          tuitionFee: currentClassTuition,
          admissionFee: currentClassAdmission,
          examFee: currentClassExam,
          lessonFeeMonthly: currentClassLessonMonthly,
          lessonFeeTermly: currentClassLessonTermly,
        };
      }
    }

    // 1. Direct LocalStorage persistence
    updateSchoolFeeSchedule(activeSchool.id, updatedSchedule, finalClassSchedules);

    // 2. Parent state notification
    if (onSaveSchool) {
      const payload: Omit<SchoolProfile, 'id' | 'createdAt'> = {
        name: activeSchool.name,
        type: activeSchool.type,
        currencySymbol: activeSchool.currencySymbol || currencySymbol || '₦',
        feeSchedule: updatedSchedule,
        classFeeSchedules: Object.keys(finalClassSchedules).length > 0 ? finalClassSchedules : undefined,
        classes: activeSchool.classes,
        sheetConfig: activeSchool.sheetConfig,
      };
      onSaveSchool(payload, activeSchool.id);
    }

    // 3. Update enrolled students if enabled
    if (applyToEnrolledStudents && onUpdateStudentsFee) {
      onUpdateStudentsFee(updatedSchedule, finalClassSchedules);
    }

    // 4. Background Google Sheets sync if configured
    if (apiConfig?.apiUrl && apiConfig.apiUrl.trim()) {
      syncFeeScheduleToSheet(
        apiConfig,
        updatedSchedule,
        finalClassSchedules,
        activeSchool.name,
        activeSchool.classes,
        activeSchool.currencySymbol || currencySymbol || '₦'
      ).catch((err) => console.warn('Background fee sync to sheet notice:', err));
    }

    const sym = activeSchool.currencySymbol || currencySymbol || '₦';
    const customCount = Object.keys(finalClassSchedules).length;
    setFeeSaveSuccess(`✓ All fee schedules saved permanently! Base School Fee: ${sym}${parsedTuition.toLocaleString()}${customCount > 0 ? ` (${customCount} class-specific override${customCount > 1 ? 's' : ''} active)` : ''}. Applied immediately across the entire app!`);
    setTimeout(() => {
      setFeeSaveSuccess(null);
    }, 4500);
  };

  // Count active duplicates for live badge
  const duplicateStats = useMemo(() => {
    if (!students || students.length < 2) return { count: 0, groups: 0 };
    const groups = findDuplicateGroups(students, 'all');
    const redundantCount = groups.reduce((acc, g) => acc + (g.records.length - 1), 0);
    return { count: redundantCount, groups: groups.length };
  }, [students]);

  // Data Health inspection stats
  const healthStats = useMemo(() => {
    let negativeBalances = 0;
    let missingClasses = 0;
    let zeroFees = 0;
    let missingNames = 0;
    students.forEach((s) => {
      if (!s) return;
      if (Number(s.balance) < 0) negativeBalances++;
      if (!s.class || !s.class.trim()) missingClasses++;
      if (Number(s.fee_amount || s.tuition_fee || 0) <= 0) zeroFees++;
      if (!s.full_name || !s.full_name.trim()) missingNames++;
    });

    const totalIssues = negativeBalances + missingClasses + zeroFees + missingNames;
    return {
      negativeBalances,
      missingClasses,
      zeroFees,
      missingNames,
      totalIssues,
      isClean: totalIssues === 0 && duplicateStats.count === 0,
    };
  }, [students, duplicateStats]);

  const currentSelectedSchool = schools.find((s) => s.id === selectedApiSchoolId) || activeSchool || schools[0];
  const currentSchoolApi = schoolApiMap[selectedApiSchoolId] || { apiUrl: '', apiKey: '' };

  const handleUpdateCurrentSchoolApi = (field: 'apiUrl' | 'apiKey', value: string) => {
    setSchoolApiMap((prev) => ({
      ...prev,
      [selectedApiSchoolId]: {
        ...prev[selectedApiSchoolId],
        [field]: value,
      },
    }));
    setTestResult(null);
  };

  const exactHeaders =
    'id,full_name,class,term,session,fee_amount,amount_paid,balance,status,payment_date,admission_fee,admission_paid,lesson_fee,lesson_paid,exam_fee,exam_paid,lesson_months,receipt_no,total_remitted';
  const standardHeaders =
    'id,full_name,class,term,session,fee_amount,amount_paid,balance,status,payment_date,admission_fee,admission_paid,receipt_no,total_remitted';
  const exactStaffHeaders =
    'staff_id,staff_name,role,department,month,term,session,base_salary,allowances,deductions,net_pay,payment_status,amount_paid,payment_date,payment_method,reference_number,bank_name,account_number,phone,remarks';
  const exactExpenseHeaders =
    'id,date,category,category_label,description,amount,payment_method,recipient,receipt_voucher_ref,term,session,recorded_by,notes,created_at';

  const handleCopyHeaders = async (textToCopy: string, type: 'itemized' | 'staff' | 'expenses' | 'basic' | 'appscript') => {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        await navigator.clipboard.writeText(textToCopy);
      } else {
        const textArea = document.createElement('textarea');
        textArea.value = textToCopy;
        textArea.style.position = 'fixed';
        textArea.style.opacity = '0';
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
      }
    } catch (e) {
      console.warn('Clipboard write restricted in iframe:', e);
    }
    setCopiedType(type);
    setTimeout(() => setCopiedType(null), 2500);
  };

  const handleTestConnection = async () => {
    const url = currentSchoolApi.apiUrl || '';
    const key = currentSchoolApi.apiKey || '';

    if (!url.trim()) {
      setTestResult({
        success: false,
        message: `Please enter a Google Sheet or Apps Script URL for ${currentSelectedSchool?.name || 'this school'} first.`,
      });
      return;
    }

    setIsTesting(true);
    setTestResult(null);
    setSaveSuccess(false);

    try {
      const provider = detectProvider(url.trim());

      const result = await testSheetConnection({
        apiUrl: url.trim(),
        apiKey: key.trim(),
        provider,
      });

      setTestResult({
        success: true,
        message: `Connected successfully to ${currentSelectedSchool?.name || 'School'}! ${result.message}`,
      });
    } catch (err: any) {
      setTestResult({
        success: false,
        message: err.message || 'Connection failed. Please check your URL & permissions.',
      });
    } finally {
      setIsTesting(false);
    }
  };

  const handleSaveAll = (e?: React.FormEvent) => {
    if (e) e.preventDefault();

    const allConfigs: Record<string, SheetApiConfig> = {};
    Object.entries(schoolApiMap).forEach(([schId, cfg]) => {
      const provider = detectProvider(cfg.apiUrl.trim());
      allConfigs[schId] = {
        apiUrl: cfg.apiUrl.trim(),
        apiKey: cfg.apiKey.trim(),
        provider,
      };
    });

    const activeConfig = allConfigs[activeSchool?.id || 'eminent-academy'] || {
      apiUrl: currentSchoolApi.apiUrl.trim(),
      apiKey: currentSchoolApi.apiKey.trim(),
      provider: detectProvider(currentSchoolApi.apiUrl.trim()),
    };

    if (onSaveConfig) {
      onSaveConfig(activeConfig, allConfigs);
    }

    onSaveSession({
      ...session,
      schoolName: schoolName.trim() || 'Eminent Royal Crown Academy',
      bursarName: bursarName.trim() || 'Bursar',
      currencySymbol: currencySymbol.trim() || '₦',
    });

    setSaveSuccess(true);
    setTimeout(() => {
      setSaveSuccess(false);
      setActiveAppId(null);
    }, 800);
  };

  const handleTermTabSwitch = (t: string) => {
    setScheduleTerm(t);
    const sch = getStoredTermSchedule(t, session.schoolName, settingsSchoolId);
    setTermScheduleData(sch);
    setScheduleStartDate(sch.termStartDate);
    setScheduleEndDate(sch.termEndDate);
    setScheduleSalaryDueDay(sch.salaryDueDay || 25);
    setScheduleFeeStart(sch.feeCollectionStartDate);
    setScheduleFeeDue(sch.feeDueDate);
  };

  const handleSaveTermSchedule = (e: React.FormEvent) => {
    e.preventDefault();
    const updated: AcademicTermSchedule = {
      term: scheduleTerm,
      session: session.schoolName || '2026/2027',
      termStartDate: scheduleStartDate,
      termEndDate: scheduleEndDate,
      salaryDueDay: Math.min(28, Math.max(1, Number(scheduleSalaryDueDay) || 25)),
      feeCollectionStartDate: scheduleFeeStart,
      feeDueDate: scheduleFeeDue,
      monthsInTerm: derivedScheduleMonths.length > 0 ? derivedScheduleMonths : ['2026-09', '2026-10', '2026-11'],
      updatedAt: new Date().toISOString(),
    };
    saveStoredTermSchedule(updated, settingsSchoolId);
    saveTermScheduleToFirestore(updated, settingsSchoolId).catch((err) =>
      console.warn('[Firestore] Error saving term schedule:', err)
    );
    setTermScheduleData(updated);
    setScheduleSavedMsg(true);
    setTimeout(() => {
      setScheduleSavedMsg(false);
      setActiveAppId(null);
    }, 1000);
  };

  if (!isOpen) return null;

  // List of all Apps in the Gallery (Admins have access to User Credentials & Audit Logs, Bursars do not)
  const isAdmin = session.role === 'admin';

  const primaryApps = [
    ...(isAdmin
      ? [
          {
            id: 'user_credentials' as AppToolId,
            title: '👑 User Credentials & RBAC Security',
            category: 'Security & Access Control',
            description: 'Manage Admin & Bursar usernames, passwords, access privileges & cloud sync',
            icon: ShieldCheck,
            color: 'bg-purple-700 text-white',
            badge: 'Admin Only',
            badgeColor: 'bg-purple-100 text-purple-800 font-bold',
          },
        ]
      : []),
    {
      id: 'school_branding' as AppToolId,
      title: '🎨 School Branding & Customizer',
      category: 'School Customization',
      description: 'Change School Name, Logo (upload/URL/presets), Theme Color, and Official Receipt credentials',
      icon: Palette,
      color: 'bg-purple-600 text-white',
      badge: 'Customizable',
      badgeColor: 'bg-purple-100 text-purple-800 font-bold',
    },
    {
      id: 'fee_update' as AppToolId,
      title: 'Fee Update & Class Rates',
      category: 'Fee Configuration',
      description: 'Set & modify school fees per class with persistent storage & Google Sheets sync',
      icon: Coins,
      color: 'bg-purple-600 text-white',
      badge: `${Object.keys(classFeeSchedules).length} Custom Classes`,
      badgeColor: Object.keys(classFeeSchedules).length > 0 ? 'bg-purple-100 text-purple-800 font-bold' : 'bg-slate-100 text-slate-700',
    },
    {
      id: 'sheet_sync' as AppToolId,
      title: 'Google Sheet Sync & API',
      category: 'Core Integration',
      description: 'Apps Script Web App, SheetDB, REST API & column mappings',
      icon: Database,
      color: 'bg-blue-600 text-white',
      badge: apiConfig?.apiUrl ? 'Connected' : 'Setup Required',
      badgeColor: apiConfig?.apiUrl ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800',
    },
    {
      id: 'school_profiles' as AppToolId,
      title: 'Academy Fees & Campuses',
      category: 'Academy Configuration',
      description: 'Switch school campuses, manage classes, and adjust base & class fee schedules',
      icon: Building2,
      color: 'bg-indigo-600 text-white',
      badge: 'Active',
      badgeColor: 'bg-indigo-100 text-indigo-800 font-bold',
    },
    {
      id: 'duplicate_cleaner' as AppToolId,
      title: 'Duplicate Cleaner Hub',
      category: 'Data Quality',
      description: 'Filter by ID & Name, side-by-side verify, and 1-click merge records',
      icon: Users,
      color: 'bg-rose-600 text-white',
      badge: duplicateStats.count > 0 ? `${duplicateStats.count} Duplicates Found` : 'Clean',
      badgeColor: duplicateStats.count > 0 ? 'bg-rose-100 text-rose-800 font-black animate-pulse' : 'bg-emerald-100 text-emerald-800',
      action: onOpenDuplicateCleaner
        ? () => {
            onClose();
            onOpenDuplicateCleaner();
          }
        : undefined,
    },
    {
      id: 'term_schedule' as AppToolId,
      title: 'Term Duration & Payment Schedule',
      category: 'Academic Schedule',
      description: 'Define term start & end dates, staff salary due day, and fee collection start dates',
      icon: Calendar,
      color: 'bg-emerald-600 text-white',
      badge: 'Payroll & Fees',
      badgeColor: 'bg-emerald-100 text-emerald-800 font-bold',
    },
    {
      id: 'bursar_settings' as AppToolId,
      title: 'Bursar & Currency Profile',
      category: 'Preferences',
      description: 'Bursar officer name, currency symbol, default receipt headers',
      icon: UserCheck,
      color: 'bg-amber-600 text-white',
      badge: currencySymbol,
      badgeColor: 'bg-amber-100 text-amber-800 font-mono',
    },
  ];

  const additionalApps = [
    {
      id: 'term_rollover' as AppToolId,
      title: 'Term Rollover & Promotion',
      category: 'Academic Transition',
      description: 'Advance students to next term, carry forward arrears, & promote classes',
      icon: RefreshCw,
      color: 'bg-teal-600 text-white',
      badge: 'Protected',
      badgeColor: 'bg-teal-100 text-teal-800',
      action: onOpenRollover
        ? () => {
            onClose();
            onOpenRollover();
          }
        : undefined,
    },
    {
      id: 'end_term' as AppToolId,
      title: 'End-of-Term Snapshot',
      category: 'Audit & Archiving',
      description: 'Freeze term financial records, audit lock, & download ledger spreadsheets',
      icon: Archive,
      color: 'bg-purple-600 text-white',
      badge: 'Audit Lock',
      badgeColor: 'bg-purple-100 text-purple-800',
      action: onOpenEndTerm
        ? () => {
            onClose();
            onOpenEndTerm();
          }
        : undefined,
    },
    {
      id: 'backups' as AppToolId,
      title: 'Backup & Restore Center',
      category: 'Data Protection',
      description: 'Export instant offline CSV and JSON emergency backup files',
      icon: Download,
      color: 'bg-emerald-600 text-white',
      badge: 'Offline Safe',
      badgeColor: 'bg-emerald-100 text-emerald-800',
    },
    {
      id: 'apps_script_code' as AppToolId,
      title: 'Google Apps Script Code',
      category: 'Developer Tools',
      description: 'Copy free backend Apps Script code with 4-step deployment instructions',
      icon: Code2,
      color: 'bg-slate-800 text-white',
      badge: '100% Free',
      badgeColor: 'bg-slate-100 text-slate-800',
    },
    {
      id: 'data_inspector' as AppToolId,
      title: 'Data Health & Audit Inspector',
      category: 'Diagnostics',
      description: 'Scan roster for zero fees, negative balances, or unassigned classrooms',
      icon: ShieldCheck,
      color: 'bg-cyan-700 text-white',
      badge: healthStats.isClean ? 'Optimal Health' : `${healthStats.totalIssues} Alerts`,
      badgeColor: healthStats.isClean ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800',
    },
    ...(isAdmin
      ? [
          {
            id: 'audit_logs' as AppToolId,
            title: 'Activity Logs & Audit Trails',
            category: 'Audit & Tracking',
            description: 'Tamper-evident, undeletable logs tracking every payment, staff, expense & system action',
            icon: Shield,
            color: 'bg-indigo-900 text-white',
            badge: 'Admin Only',
            badgeColor: 'bg-indigo-100 text-indigo-800 font-bold',
          },
        ]
      : []),
  ];

  // Filter gallery apps by search
  const filteredPrimary = primaryApps.filter(
    (app) =>
      app.title.toLowerCase().includes(gallerySearch.toLowerCase()) ||
      app.description.toLowerCase().includes(gallerySearch.toLowerCase()) ||
      app.category.toLowerCase().includes(gallerySearch.toLowerCase())
  );

  const filteredAdditional = additionalApps.filter(
    (app) =>
      app.title.toLowerCase().includes(gallerySearch.toLowerCase()) ||
      app.description.toLowerCase().includes(gallerySearch.toLowerCase()) ||
      app.category.toLowerCase().includes(gallerySearch.toLowerCase())
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-0 sm:p-4 bg-black/50 backdrop-blur-xs">
      <div className="w-full max-w-4xl bg-white h-[100dvh] sm:h-auto sm:max-h-[90vh] rounded-none sm:rounded-3xl flex flex-col shadow-2xl border border-slate-200 overflow-hidden animate-in slide-in-from-bottom duration-200">
        {/* Navigation Bar */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-3 border-b border-slate-200 bg-white sticky top-0 z-20 shrink-0">
          <div className="flex items-center gap-2 sm:gap-2.5 min-w-0">
            {activeAppId ? (
              <button
                type="button"
                onClick={() => setActiveAppId(null)}
                className="px-2.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-indigo-700 flex items-center gap-1 transition-colors cursor-pointer mr-0.5 font-bold text-xs shrink-0 border border-slate-200 shadow-2xs active:scale-95"
                title="Back to App Gallery"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Back</span>
              </button>
            ) : (
              <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-2xl bg-[#1a1a1a] text-white flex items-center justify-center shadow-xs shrink-0">
                <LayoutGrid className="w-4 h-4 text-blue-400" />
              </div>
            )}
            <div className="min-w-0">
              <h3 className="text-sm sm:text-base font-black text-[#1a1a1a] uppercase tracking-tight truncate">
                {activeAppId === 'user_credentials'
                  ? 'User Credentials & RBAC Security'
                  : activeAppId === 'school_branding'
                  ? 'School Branding & White-Label Customizer'
                  : activeAppId === 'fee_update'
                  ? 'Fee Update & Class Fee Rates'
                  : activeAppId === 'duplicate_cleaner'
                  ? 'Duplicate Records Cleaner'
                  : activeAppId === 'sheet_sync'
                  ? 'Google Sheet Sync & API'
                  : activeAppId === 'school_profiles'
                  ? 'School Campuses & Fee Schedules'
                  : activeAppId === 'term_schedule'
                  ? 'Term Duration & Payment Schedule'
                  : activeAppId === 'bursar_settings'
                  ? 'Bursar & Currency Settings'
                  : activeAppId === 'backups'
                  ? 'Backup & Data Export'
                  : activeAppId === 'apps_script_code'
                  ? 'Google Apps Script Deployer'
                  : activeAppId === 'data_inspector'
                  ? 'Data Health & Integrity Inspector'
                  : activeAppId === 'audit_logs'
                  ? 'Activity Logs & Immutable Audit Trail'
                  : 'Bursar Tools & App Gallery'}
              </h3>
              <p className="text-[10px] sm:text-[11px] text-[#a0a0a0] font-medium truncate">
                {activeAppId ? 'Tap "Back" to return to App Gallery' : 'Select an app or utility to launch'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            {activeAppId && (
              <button
                type="button"
                onClick={() => setActiveAppId(null)}
                className="text-xs font-bold text-blue-600 hover:text-blue-800 px-2.5 py-1 rounded-lg hover:bg-blue-50 cursor-pointer hidden sm:block border border-blue-100"
              >
                App Gallery
              </button>
            )}
            <button
              onClick={onClose}
              id="close-settings-modal-btn"
              className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-[#f4f4f7] text-[#1a1a1a] hover:bg-slate-200 flex items-center justify-center border border-[#eee] cursor-pointer active:scale-95 transition-all"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Modal Scrollable Container */}
        <div className="p-4 sm:p-6 overflow-y-auto flex-1 space-y-5">
          {/* ========================================================================= */}
          {/* VIEW 0: MAIN APP GALLERY (When activeAppId is null)                      */}
          {/* ========================================================================= */}
          {!activeAppId && (
            <div className="space-y-5">
              {/* PWA & Android Installation Card */}
              <PWAInstallButton variant="settings" />

              {/* Active Campus Quick Indicator Banner */}
              <div className="bg-gradient-to-br from-slate-900 via-blue-950 to-indigo-950 text-white p-4 sm:p-5 rounded-3xl space-y-3 shadow-sm relative overflow-hidden">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-2xl bg-blue-500/20 text-blue-300 flex items-center justify-center border border-blue-400/30">
                      <School className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-black text-white">{activeSchool?.name || session.schoolName}</span>
                        <span className="text-[9px] bg-blue-500 text-white font-black px-1.5 py-0.2 rounded-full uppercase">
                          Active Dashboard
                        </span>
                      </div>
                      <p className="text-[11px] text-blue-200/80 font-medium">
                        Tuition: {currencySymbol}{activeSchool?.feeSchedule?.tuitionFee?.toLocaleString() || '15,000'} • {students.length} Students Enrolled
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setActiveAppId('school_profiles')}
                    className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-bold flex items-center gap-1 transition-all cursor-pointer backdrop-blur-xs"
                  >
                    <Sliders className="w-3.5 h-3.5 text-blue-300" />
                    <span>Switch Campus</span>
                  </button>
                </div>
              </div>

              {/* Quick Search across Tools & Apps */}
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3 pointer-events-none" />
                <input
                  type="text"
                  value={gallerySearch}
                  onChange={(e) => setGallerySearch(e.target.value)}
                  placeholder="Search settings, apps, deduplication, sync, backups..."
                  className="w-full pl-10 pr-4 py-2.5 text-xs font-bold bg-slate-50 rounded-2xl border border-slate-200 text-slate-900 placeholder:text-slate-400 focus:bg-white focus:ring-2 focus:ring-blue-600 focus:outline-none transition-all"
                />
                {gallerySearch && (
                  <button
                    onClick={() => setGallerySearch('')}
                    className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600 p-0.5"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Section 1: Core Daily Apps */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-black text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-blue-600" />
                    <span>Core Management Apps</span>
                  </h4>
                  <span className="text-[10px] text-slate-400 font-bold">Touch an app to launch</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {filteredPrimary.map((app) => {
                    const IconComponent = app.icon;
                    return (
                      <button
                        key={app.id}
                        type="button"
                        onClick={() => setActiveAppId(app.id)}
                        className="p-4 rounded-3xl bg-white hover:bg-blue-50/40 border border-slate-200/90 hover:border-blue-300 transition-all text-left shadow-xs flex flex-col justify-between space-y-3 group cursor-pointer active:scale-[0.99]"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className={`w-10 h-10 rounded-2xl flex items-center justify-center shadow-xs ${app.color} group-hover:scale-105 transition-transform`}>
                            <IconComponent className="w-5 h-5" />
                          </div>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${app.badgeColor}`}>
                            {app.badge}
                          </span>
                        </div>

                        <div className="space-y-1">
                          <div className="text-xs font-black text-slate-900 group-hover:text-blue-700 transition-colors flex items-center justify-between">
                            <span>{app.title}</span>
                            <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-blue-500 group-hover:translate-x-0.5 transition-all" />
                          </div>
                          <p className="text-[11px] text-slate-500 leading-snug">
                            {app.description}
                          </p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Section 2: Additional Apps & Advanced Tools */}
              <div className="space-y-3 pt-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-black text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                    <Layers className="w-3.5 h-3.5 text-indigo-600" />
                    <span>Additional Apps & Advanced Utilities</span>
                  </h4>
                  <span className="text-[10px] text-slate-400 font-bold">{additionalApps.length} Tools</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {filteredAdditional.map((app) => {
                    const IconComponent = app.icon;
                    return (
                      <button
                        key={app.id}
                        type="button"
                        onClick={() => {
                          if (app.action) {
                            app.action();
                          } else {
                            setActiveAppId(app.id);
                          }
                        }}
                        className="p-4 rounded-3xl bg-slate-50/80 hover:bg-indigo-50/40 border border-slate-200 hover:border-indigo-300 transition-all text-left shadow-xs flex flex-col justify-between space-y-3 group cursor-pointer active:scale-[0.99]"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className={`w-9 h-9 rounded-2xl flex items-center justify-center shadow-xs ${app.color} group-hover:scale-105 transition-transform`}>
                            <IconComponent className="w-4 h-4" />
                          </div>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${app.badgeColor}`}>
                            {app.badge}
                          </span>
                        </div>

                        <div className="space-y-1">
                          <div className="text-xs font-black text-slate-900 group-hover:text-indigo-700 transition-colors flex items-center justify-between">
                            <span>{app.title}</span>
                            <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-indigo-500 group-hover:translate-x-0.5 transition-all" />
                          </div>
                          <p className="text-[11px] text-slate-500 leading-snug">
                            {app.description}
                          </p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* VIEW: USER CREDENTIALS & RBAC SECURITY                                    */}
          {/* ========================================================================= */}
          {activeAppId === 'user_credentials' && (
            <UserCredentialManager
              session={session}
              onSessionUpdated={(updatedSession) => {
                onSaveSession(updatedSession);
              }}
            />
          )}

          {/* ========================================================================= */}
          {/* VIEW 1: DUPLICATE CLEANER APP                                             */}
          {/* ========================================================================= */}
          {activeAppId === 'duplicate_cleaner' && (
            <DuplicateCleanerView
              students={students}
              session={session}
              onMergeGroup={async (primaryId, mergedRecord, deletedIds) => {
                if (onMergeDuplicateGroup) {
                  await onMergeDuplicateGroup(primaryId, mergedRecord, deletedIds);
                }
              }}
              onDeleteRecord={async (id, record) => {
                if (onDeleteStudent) {
                  await onDeleteStudent(id, record);
                }
              }}
              onBatchResolve={async (mergedRecords, deletedIds) => {
                if (onBatchResolveDuplicates) {
                  await onBatchResolveDuplicates(mergedRecords, deletedIds);
                }
              }}
              onClose={() => setActiveAppId(null)}
            />
          )}

          {/* ========================================================================= */}
          {/* VIEW 2: GOOGLE SHEET SYNC & API APP                                       */}
          {/* ========================================================================= */}
          {activeAppId === 'sheet_sync' && (
            <form onSubmit={handleSaveAll} className="space-y-5">
              {/* Google Apps Script Feature Box */}
              <div className="bg-gradient-to-br from-emerald-500/10 via-teal-500/5 to-blue-500/10 border border-emerald-500/30 p-4 rounded-3xl space-y-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-xl bg-emerald-600 text-white flex items-center justify-center shadow-xs">
                      <Sparkles className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                        <span>Google Apps Script Web App</span>
                        <span className="text-[9px] bg-emerald-100 text-emerald-800 font-black px-1.5 py-0.2 rounded-full uppercase">
                          Recommended • 100% Free
                        </span>
                      </h4>
                      <p className="text-[10px] text-slate-500">Direct Google Cloud integration without third-party paywalls.</p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleCopyHeaders(GOOGLE_APPS_SCRIPT_CODE, 'appscript')}
                    id="copy-apps-script-code-btn"
                    className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5 transition-all shadow-xs cursor-pointer active:scale-95 shrink-0"
                  >
                    {copiedType === 'appscript' ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-white" />
                        <span>Copied Script!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>Copy Apps Script</span>
                      </>
                    )}
                  </button>
                </div>

                {/* Instructions Toggle */}
                <div className="pt-2 border-t border-emerald-500/20">
                  <button
                    type="button"
                    onClick={() => setShowAppsScriptGuide(!showAppsScriptGuide)}
                    className="text-[11px] font-bold text-emerald-800 hover:text-emerald-950 flex items-center gap-1 cursor-pointer"
                  >
                    <Code2 className="w-3.5 h-3.5 text-emerald-600" />
                    <span>{showAppsScriptGuide ? 'Hide Apps Script 4-Step Setup Guide' : 'How to deploy Apps Script in 60 seconds (4 clicks)'}</span>
                  </button>

                  {showAppsScriptGuide && (
                    <div className="mt-2.5 p-3.5 bg-white rounded-2xl border border-emerald-200 text-[11px] text-slate-700 space-y-2">
                      <ol className="list-decimal pl-4 space-y-1.5 text-slate-800">
                        <li>
                          Open your Google Sheet, click <strong>Extensions</strong> &gt; <strong>Apps Script</strong>.
                        </li>
                        <li>
                          Select and replace all code in <strong>Code.gs</strong> with the copied script (click <strong>"Copy Apps Script"</strong> above), then click <strong>Save (💾)</strong>.
                        </li>
                        <li>
                          Click <strong>Deploy</strong> (top right) &gt; <strong>New deployment</strong> &gt; Select type <strong>Web app</strong>.
                        </li>
                        <li>
                          Set <strong>Execute as: "Me"</strong> and <strong>Who has access: "Anyone"</strong> &gt; Click <strong>Deploy</strong>.
                        </li>
                        <li>
                          Copy the generated <strong>Web app URL</strong> (ending with <code>/exec</code>) and paste it below!
                        </li>
                      </ol>
                    </div>
                  )}
                </div>
              </div>

              {/* Sheet URL Input */}
              <div className="space-y-1.5">
                <label className="block text-[10px] font-black text-[#a0a0a0] uppercase tracking-wider">
                  Google Sheet Web App URL or REST API (Eminent Royal Crown Academy)
                </label>
                <div className="relative">
                  <Database className="w-4 h-4 text-[#a0a0a0] absolute left-3.5 top-3.5 pointer-events-none" />
                  <input
                    type="url"
                    id="settings-sheet-api-url"
                    value={currentSchoolApi.apiUrl}
                    onChange={(e) => handleUpdateCurrentSchoolApi('apiUrl', e.target.value)}
                    placeholder="https://script.google.com/macros/s/.../exec or SheetDB / Sheet.best URL"
                    className="w-full pl-10 pr-4 py-2.5 text-xs font-mono font-bold bg-[#f4f4f7] rounded-2xl border-none text-[#1a1a1a] placeholder:text-[#a0a0a0] focus:ring-2 focus:ring-blue-600 focus:outline-none"
                  />
                </div>
              </div>

              {/* API Key Input */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="block text-[10px] font-black text-[#a0a0a0] uppercase tracking-wider">
                    API Key / Secret Token
                  </label>
                  <span className="text-[9px] text-slate-400 font-medium">Not needed for Apps Script</span>
                </div>
                <div className="relative">
                  <Key className="w-4 h-4 text-[#a0a0a0] absolute left-3.5 top-3.5 pointer-events-none" />
                  <input
                    type="password"
                    id="settings-sheet-api-key"
                    value={currentSchoolApi.apiKey}
                    onChange={(e) => handleUpdateCurrentSchoolApi('apiKey', e.target.value)}
                    placeholder="Leave empty for Apps Script, or enter key for SheetDB / Sheet.best"
                    className="w-full pl-10 pr-4 py-2.5 text-xs font-mono bg-[#f4f4f7] rounded-2xl border-none text-[#1a1a1a] placeholder:text-[#a0a0a0] focus:ring-2 focus:ring-blue-600 focus:outline-none"
                  />
                </div>
              </div>

              {/* Test Connection Button & Result */}
              <div>
                <button
                  type="button"
                  onClick={handleTestConnection}
                  disabled={!currentSchoolApi.apiUrl?.trim() || isTesting}
                  id="test-sheet-connection-btn"
                  className="w-full py-3 px-3 rounded-2xl bg-[#f4f4f7] border border-[#eee] text-[#1a1a1a] text-xs font-bold hover:bg-slate-200 active:scale-[0.99] disabled:opacity-50 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  {isTesting ? (
                    <span>Testing Connection...</span>
                  ) : (
                    <>
                      <Database className="w-4 h-4 text-blue-600" />
                      <span>Test Connection</span>
                    </>
                  )}
                </button>

                {testResult && (
                  <div
                    className={`mt-2 p-3.5 rounded-2xl text-xs flex items-start gap-2.5 ${
                      testResult.success
                        ? 'bg-emerald-50 text-emerald-900 border border-emerald-200'
                        : 'bg-rose-50 text-rose-900 border border-rose-200'
                    }`}
                  >
                    {testResult.success ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    ) : (
                      <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                    )}
                    <div className="leading-tight break-words font-mono text-[11px]">
                      {testResult.message}
                    </div>
                  </div>
                )}
              </div>

              {/* Required Sheet Headers (Students, Staff Payroll & Expenses) */}
              <div className="bg-[#f4f4f7] p-4 rounded-3xl border border-[#eee] space-y-2.5">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-1 bg-white p-1 rounded-xl border border-slate-200">
                    <button
                      type="button"
                      onClick={() => setHeaderTab('students')}
                      className={`px-2.5 py-1 rounded-lg text-[10px] font-black transition-all cursor-pointer ${
                        headerTab === 'students'
                          ? 'bg-blue-600 text-white shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      FeeData (21 cols)
                    </button>
                    <button
                      type="button"
                      onClick={() => setHeaderTab('staff')}
                      className={`px-2.5 py-1 rounded-lg text-[10px] font-black transition-all cursor-pointer ${
                        headerTab === 'staff'
                          ? 'bg-indigo-600 text-white shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Staffpayroll (20 cols)
                    </button>
                    <button
                      type="button"
                      onClick={() => setHeaderTab('expenses')}
                      className={`px-2.5 py-1 rounded-lg text-[10px] font-black transition-all cursor-pointer ${
                        headerTab === 'expenses'
                          ? 'bg-slate-900 text-white shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Expenses (14 cols)
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() =>
                      handleCopyHeaders(
                        headerTab === 'students'
                          ? exactHeaders
                          : headerTab === 'staff'
                          ? exactStaffHeaders
                          : exactExpenseHeaders,
                        headerTab === 'students'
                          ? 'itemized'
                          : headerTab === 'staff'
                          ? 'staff'
                          : 'expenses'
                      )
                    }
                    id="copy-headers-btn"
                    className="font-bold text-blue-600 hover:underline flex items-center gap-1 cursor-pointer text-[10px] px-2 py-1 bg-white rounded-lg border border-slate-200"
                  >
                    {(headerTab === 'students' && copiedType === 'itemized') ||
                    (headerTab === 'staff' && copiedType === 'staff') ||
                    (headerTab === 'expenses' && copiedType === 'expenses') ? (
                      <span className="text-emerald-600 font-bold">Copied!</span>
                    ) : (
                      <span>Copy Headers</span>
                    )}
                  </button>
                </div>

                <div className="p-2.5 bg-white rounded-xl border border-[#eee] text-[10px] font-mono text-slate-800 break-all select-all font-bold">
                  {headerTab === 'students'
                    ? exactHeaders
                    : headerTab === 'staff'
                    ? exactStaffHeaders
                    : exactExpenseHeaders}
                </div>
              </div>

              {/* Save Button */}
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setActiveAppId(null)}
                  className="flex-1 py-3 px-4 rounded-2xl bg-slate-100 text-slate-800 font-bold text-xs hover:bg-slate-200 cursor-pointer"
                >
                  Back to Gallery
                </button>
                <button
                  type="submit"
                  className="flex-1 py-3 px-4 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-sm flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  {saveSuccess ? <Check className="w-4 h-4 text-white" /> : <span>Save API Config</span>}
                </button>
              </div>
            </form>
          )}

          {/* ========================================================================= */}
          {/* VIEW 3: FEE UPDATE & ACADEMY CLASS RATES APP                              */}
          {/* ========================================================================= */}
          {(activeAppId === 'school_profiles' || activeAppId === 'fee_update') && (
            <div className="space-y-5">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <h4 className="text-sm font-black text-slate-900 uppercase tracking-wider flex items-center gap-2">
                    <GraduationCap className="w-5 h-5 text-purple-600" />
                    <span>Fee Update & Class Rates Hub</span>
                  </h4>
                  <p className="text-xs text-slate-500 font-medium mt-0.5">
                    Configure base school rates and customize separate fees per class across all categories. All updates are permanently stored and synchronized to Google Sheets.
                  </p>
                </div>

                {onOpenEditSchool && activeSchool && (
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onOpenEditSchool(activeSchool);
                    }}
                    className="px-3 py-1.5 rounded-xl bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-bold shrink-0 flex items-center gap-1.5 cursor-pointer shadow-xs transition-all"
                  >
                    <Sliders className="w-3.5 h-3.5" />
                    <span>Switch Campus</span>
                  </button>
                )}
              </div>

              {/* GOOGLE SHEETS LIVE FEE SCHEDULE SYNC BANNER */}
              <div className="p-3.5 rounded-2xl border border-emerald-200 bg-emerald-50/50 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-2xs">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                    <Cloud className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-xs font-black text-slate-900 flex items-center gap-1.5">
                      <span>Google Sheets FeeSchedule Sync</span>
                      <span className={`px-1.5 py-0.2 rounded-full text-[9px] font-bold ${apiConfig?.apiUrl ? 'bg-emerald-200 text-emerald-900' : 'bg-slate-200 text-slate-800'}`}>
                        {apiConfig?.apiUrl ? 'Connected' : 'Setup URL in Sheet Sync'}
                      </span>
                    </div>
                    <p className="text-[10px] text-slate-600 font-medium">
                      Writes base fees & custom class rates (KG1 to SS3) into your spreadsheet's FeeSchedule tab.
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <button
                    type="button"
                    onClick={handleFetchFeeScheduleDirectly}
                    disabled={isSyncingFeeToSheet}
                    className="flex-1 sm:flex-initial px-3 py-1.5 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 shadow-2xs transition-all"
                  >
                    <Download className="w-3.5 h-3.5 text-slate-500" />
                    <span>Pull from Sheet</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleSyncFeeScheduleDirectly}
                    disabled={isSyncingFeeToSheet}
                    className="flex-1 sm:flex-initial px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 shadow-xs transition-all active:scale-95"
                  >
                    {isSyncingFeeToSheet ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Cloud className="w-3.5 h-3.5" />
                    )}
                    <span>Sync to Sheet Tab</span>
                  </button>
                </div>
              </div>

              {feeSheetSyncMsg && (
                <div
                  className={`p-3 rounded-2xl text-xs font-bold flex items-center gap-2 ${
                    feeSheetSyncMsg.success
                      ? 'bg-emerald-50 text-emerald-900 border border-emerald-200'
                      : 'bg-rose-50 text-rose-900 border border-rose-200'
                  }`}
                >
                  {feeSheetSyncMsg.success ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                  )}
                  <span>{feeSheetSyncMsg.message}</span>
                </div>
              )}

              {feeSaveSuccess && (
                <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs font-bold flex items-center gap-2.5 animate-fadeIn">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                  <span>{feeSaveSuccess}</span>
                </div>
              )}

              {/* SECTION 1: BASE ACADEMY FEE SCHEDULE */}
              <div className="p-4.5 rounded-3xl border border-blue-200 bg-blue-50/40 space-y-4">
                <div className="flex items-center justify-between gap-3 border-b border-blue-100/80 pb-3">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-xl bg-blue-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                      <Coins className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-xs font-black text-slate-900">
                        1. Base Academy Fee Schedule (Default Rates)
                      </div>
                      <div className="text-[11px] text-slate-600 font-medium">
                        Standard default rates applied to classes without specific overrides
                      </div>
                    </div>
                  </div>

                  <span className="px-2.5 py-1 rounded-lg bg-blue-100/70 border border-blue-200 text-blue-900 text-[10px] font-mono font-bold">
                    {activeSchool?.name || 'Active School'}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[10px] font-black text-slate-600 uppercase tracking-wider mb-1">
                      Base School Fee / Tuition ({currencySymbol})
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="100"
                      value={tuitionFee}
                      onChange={(e) => setTuitionFee(e.target.value)}
                      placeholder="e.g. 15000"
                      className="w-full px-3.5 py-2 text-xs font-mono font-bold bg-white rounded-xl border border-slate-200 text-slate-900 focus:ring-2 focus:ring-blue-600 focus:outline-none"
                    />
                    <span className="text-[10px] text-slate-400 mt-0.5 block">Standard baseline tuition</span>
                  </div>

                  <div>
                    <label className="block text-[10px] font-black text-slate-600 uppercase tracking-wider mb-1">
                      Base Admission Fee ({currencySymbol})
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="100"
                      value={admissionFee}
                      onChange={(e) => setAdmissionFee(e.target.value)}
                      placeholder="e.g. 5000"
                      className="w-full px-3.5 py-2 text-xs font-mono font-bold bg-white rounded-xl border border-slate-200 text-slate-900 focus:ring-2 focus:ring-blue-600 focus:outline-none"
                    />
                    <span className="text-[10px] text-slate-400 mt-0.5 block">New student registration</span>
                  </div>

                  <div>
                    <label className="block text-[10px] font-black text-slate-600 uppercase tracking-wider mb-1">
                      Base Exam Fee ({currencySymbol})
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="100"
                      value={examFee}
                      onChange={(e) => setExamFee(e.target.value)}
                      placeholder="e.g. 1500"
                      className="w-full px-3.5 py-2 text-xs font-mono font-bold bg-white rounded-xl border border-slate-200 text-slate-900 focus:ring-2 focus:ring-blue-600 focus:outline-none"
                    />
                    <span className="text-[10px] text-slate-400 mt-0.5 block">Termly exam charge</span>
                  </div>

                  <div>
                    <label className="block text-[10px] font-black text-slate-600 uppercase tracking-wider mb-1">
                      Base Lesson (Monthly) ({currencySymbol})
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="100"
                      value={lessonFeeMonthly}
                      onChange={(e) => setLessonFeeMonthly(e.target.value)}
                      placeholder="e.g. 2500"
                      className="w-full px-3.5 py-2 text-xs font-mono font-bold bg-white rounded-xl border border-slate-200 text-slate-900 focus:ring-2 focus:ring-blue-600 focus:outline-none"
                    />
                    <span className="text-[10px] text-slate-400 mt-0.5 block">1-Month lesson fee</span>
                  </div>

                  <div>
                    <label className="block text-[10px] font-black text-slate-600 uppercase tracking-wider mb-1">
                      Base Lesson (Full Term) ({currencySymbol})
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="100"
                      value={lessonFeeTermly}
                      onChange={(e) => setLessonFeeTermly(e.target.value)}
                      placeholder="e.g. 7000"
                      className="w-full px-3.5 py-2 text-xs font-mono font-bold bg-white rounded-xl border border-slate-200 text-slate-900 focus:ring-2 focus:ring-blue-600 focus:outline-none"
                    />
                    <span className="text-[10px] text-slate-400 mt-0.5 block">Full term lesson fee</span>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2.5 border-t border-blue-100/80">
                  <div className="text-[11px] text-slate-500 font-medium">
                    Updates base default rates for standard classes without overrides
                  </div>
                  <button
                    type="button"
                    onClick={(e) => handleSaveFeeSchedule(e as any)}
                    className="py-2 px-3.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs flex items-center gap-1.5 cursor-pointer shadow-xs transition-all active:scale-95"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>Update & Apply Base Fees</span>
                  </button>
                </div>
              </div>

              {/* SECTION 2: CLASS-SPECIFIC FEE CUSTOMIZATION & MANAGEMENT */}
              <div className="p-4 sm:p-5 rounded-3xl border border-purple-200 bg-purple-50/40 space-y-4">
                {/* Header & Quick Summary */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-purple-200/70 pb-3">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-2xl bg-purple-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                      <Layers className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="text-xs sm:text-sm font-black text-slate-900 flex items-center gap-2 flex-wrap">
                        <span>2. Class-Specific Fees & Grade Schedule Management</span>
                        <span className="px-2 py-0.5 rounded-full bg-purple-600 text-white text-[10px] font-bold font-mono">
                          {Object.keys(classFeeSchedules).length} Custom / {schoolClassesList.length} Total Classes
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-600 font-medium">
                        Configure customized tuition, admission, exam, and lesson rates for each grade. All changes propagate immediately across cards, receipts, and payment records.
                      </div>
                    </div>
                  </div>

                  {/* Export & Tools Action Buttons */}
                  <div className="flex items-center gap-1.5 self-end sm:self-center flex-wrap">
                    <button
                      type="button"
                      onClick={() => setShowBulkAdjustModal(true)}
                      id="bulk-adjust-fee-btn"
                      className="px-2.5 py-1.5 rounded-xl bg-purple-100 hover:bg-purple-200 text-purple-900 text-[11px] font-bold flex items-center gap-1.5 transition-all cursor-pointer border border-purple-200 shadow-2xs"
                    >
                      <Sparkles className="w-3.5 h-3.5 text-purple-600" />
                      <span>Bulk Adjuster</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleExportFeeScheduleCsv}
                      id="export-fee-csv-btn"
                      className="px-2.5 py-1.5 rounded-xl bg-white hover:bg-slate-50 text-slate-700 text-[11px] font-bold flex items-center gap-1.5 transition-all cursor-pointer border border-slate-200 shadow-2xs"
                      title="Download Fee Schedule as CSV"
                    >
                      <Download className="w-3.5 h-3.5 text-slate-600" />
                      <span>Export CSV</span>
                    </button>
                    <button
                      type="button"
                      onClick={handlePrintFeeSchedule}
                      id="print-fee-schedule-btn"
                      className="px-2.5 py-1.5 rounded-xl bg-white hover:bg-slate-50 text-slate-700 text-[11px] font-bold flex items-center gap-1.5 transition-all cursor-pointer border border-slate-200 shadow-2xs"
                      title="Print Official Fee Schedule"
                    >
                      <Printer className="w-3.5 h-3.5 text-slate-600" />
                      <span>Print</span>
                    </button>
                  </div>
                </div>

                {/* Live Campus Projected Revenue Banner */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  <div className="p-3 rounded-2xl bg-white border border-purple-100 shadow-2xs flex flex-col justify-between">
                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-wider">Total Classes</span>
                    <div className="flex items-baseline gap-1 mt-1">
                      <span className="text-base sm:text-lg font-black text-slate-900">{schoolClassesList.length}</span>
                      <span className="text-[10px] text-slate-500 font-medium">Grades</span>
                    </div>
                  </div>
                  <div className="p-3 rounded-2xl bg-white border border-purple-100 shadow-2xs flex flex-col justify-between">
                    <span className="text-[10px] font-black text-amber-700 uppercase tracking-wider">Customized Rates</span>
                    <div className="flex items-baseline gap-1 mt-1">
                      <span className="text-base sm:text-lg font-black text-amber-900">{Object.keys(classFeeSchedules).length}</span>
                      <span className="text-[10px] text-amber-700 font-medium">Overridden</span>
                    </div>
                  </div>
                  <div className="p-3 rounded-2xl bg-white border border-purple-100 shadow-2xs flex flex-col justify-between">
                    <span className="text-[10px] font-black text-blue-700 uppercase tracking-wider">Enrolled Students</span>
                    <div className="flex items-baseline gap-1 mt-1">
                      <span className="text-base sm:text-lg font-black text-blue-900">{classEnrollmentStats.totalEnrolled}</span>
                      <span className="text-[10px] text-blue-700 font-medium">Total</span>
                    </div>
                  </div>
                  <div className="p-3 rounded-2xl bg-white border border-purple-100 shadow-2xs flex flex-col justify-between">
                    <span className="text-[10px] font-black text-emerald-700 uppercase tracking-wider">Projected Term Fees</span>
                    <div className="flex items-baseline gap-1 mt-1">
                      <span className="text-xs sm:text-sm font-black text-emerald-900 truncate">
                        {currencySymbol}{classEnrollmentStats.totalProjected.toLocaleString()}
                      </span>
                    </div>
                  </div>
                </div>

                {classOverrideSuccess && (
                  <div className="p-3 rounded-2xl bg-purple-100 border border-purple-300 text-purple-900 text-xs font-bold flex items-center gap-2 animate-in fade-in">
                    <Check className="w-4 h-4 text-purple-700 shrink-0" />
                    <span>{classOverrideSuccess}</span>
                  </div>
                )}

                {/* Section Filter Tabs & Quick Section Presets */}
                <div className="space-y-2">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="flex items-center gap-1 overflow-x-auto pb-1 no-scrollbar">
                      <span className="text-[10px] font-black text-slate-500 uppercase tracking-wider mr-1 shrink-0 flex items-center gap-1">
                        <Filter className="w-3 h-3" /> Section:
                      </span>
                      {[
                        { id: 'all', label: 'All Classes' },
                        { id: 'nursery', label: 'Early Years / Nursery' },
                        { id: 'primary', label: 'Primary (Basic 1-5)' },
                        { id: 'jss', label: 'Junior High (JSS)' },
                        { id: 'sss', label: 'Senior High (SSS)' },
                      ].map((tab) => (
                        <button
                          key={tab.id}
                          type="button"
                          onClick={() => setFeeSectionFilter(tab.id as any)}
                          className={`px-3 py-1 rounded-xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
                            feeSectionFilter === tab.id
                              ? 'bg-purple-600 text-white shadow-2xs'
                              : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
                          }`}
                        >
                          {tab.label}
                        </button>
                      ))}
                    </div>

                    {/* Search inside classes */}
                    <div className="relative w-full sm:w-44">
                      <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        value={feeSearchTerm}
                        onChange={(e) => setFeeSearchTerm(e.target.value)}
                        placeholder="Search class..."
                        className="w-full pl-8 pr-2.5 py-1 text-xs bg-white rounded-xl border border-slate-200 text-slate-900 focus:outline-none focus:ring-1 focus:ring-purple-500"
                      />
                    </div>
                  </div>

                  {/* Class Selection Grid */}
                  <div className="flex flex-wrap gap-1.5 p-2 rounded-2xl bg-white/80 border border-purple-100">
                    {schoolClassesList
                      .filter((cls) => {
                        if (feeSectionFilter !== 'all' && getClassSection(cls) !== feeSectionFilter) return false;
                        if (feeSearchTerm.trim() && !cls.toLowerCase().includes(feeSearchTerm.toLowerCase().trim())) return false;
                        return true;
                      })
                      .map((cls) => {
                        const hasOverride = Boolean(classFeeSchedules[cls]);
                        const isSelected = selectedFeeClass === cls;
                        const studentCount = classEnrollmentStats.counts[cls] || 0;
                        return (
                          <button
                            key={cls}
                            type="button"
                            onClick={() => handleSelectFeeClass(cls)}
                            id={`select-fee-class-${cls}`}
                            className={`px-3 py-1.5 rounded-xl text-xs font-mono font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                              isSelected
                                ? 'bg-purple-600 text-white shadow-xs scale-105 ring-2 ring-purple-400'
                                : hasOverride
                                ? 'bg-amber-100 text-amber-950 border border-amber-300 hover:bg-amber-200'
                                : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
                            }`}
                          >
                            <span>{cls}</span>
                            {studentCount > 0 && (
                              <span className={`text-[9px] px-1 py-0.2 rounded font-sans ${isSelected ? 'bg-purple-700 text-purple-100' : 'bg-slate-100 text-slate-600'}`}>
                                {studentCount}
                              </span>
                            )}
                            {hasOverride && (
                              <span
                                className={`w-2 h-2 rounded-full ${isSelected ? 'bg-amber-300' : 'bg-amber-500'}`}
                                title="Custom rates configured"
                              />
                            )}
                          </button>
                        );
                      })}
                  </div>
                </div>

                {/* Selected Class Editor Card */}
                {selectedFeeClass && (
                  <div className="p-4 sm:p-4.5 rounded-2xl bg-white border border-purple-200 shadow-xs space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 border-b border-slate-100 pb-3">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-black text-slate-900 flex items-center gap-1.5">
                          <span>Class:</span>
                          <span className="text-purple-700 font-mono text-sm px-2 py-0.5 bg-purple-50 rounded-lg border border-purple-200">
                            {selectedFeeClass}
                          </span>
                        </span>
                        {classFeeSchedules[selectedFeeClass] ? (
                          <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-200 text-[10px] font-bold">
                            ⚡ Custom Rates Active
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200 text-[10px] font-bold">
                            🏷️ Using Base Academy Rates
                          </span>
                        )}
                        <span className="text-[11px] text-slate-500 font-medium">
                          ({classEnrollmentStats.counts[selectedFeeClass] || 0} enrolled students)
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5 flex-wrap">
                        <button
                          type="button"
                          onClick={handleCopyBaseToClass}
                          className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-bold cursor-pointer transition-all"
                          title="Fill inputs with Base Academy Rates"
                        >
                          Copy Base Rates
                        </button>

                        {/* Batch Apply to Section Button */}
                        {getClassSection(selectedFeeClass) !== 'other' && (
                          <button
                            type="button"
                            onClick={() => handleBatchApplyToSection(getClassSection(selectedFeeClass) as any)}
                            className="px-2.5 py-1 rounded-lg bg-purple-100 hover:bg-purple-200 text-purple-900 border border-purple-200 text-[11px] font-bold flex items-center gap-1 cursor-pointer transition-all"
                            title={`Apply these current rates to all ${getClassSection(selectedFeeClass).toUpperCase()} classes`}
                          >
                            <Copy className="w-3 h-3 text-purple-700" />
                            <span>Apply to All {getClassSection(selectedFeeClass).toUpperCase()}</span>
                          </button>
                        )}

                        {classFeeSchedules[selectedFeeClass] && (
                          <button
                            type="button"
                            onClick={() => handleResetClassOverride(selectedFeeClass)}
                            className="px-2.5 py-1 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-[11px] font-bold flex items-center gap-1 cursor-pointer transition-all"
                          >
                            <RotateCcw className="w-3 h-3" />
                            <span>Reset to Base</span>
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      <div>
                        <label className="block text-[10px] font-black text-slate-600 uppercase tracking-wider mb-1">
                          {selectedFeeClass} Tuition Fee ({currencySymbol})
                        </label>
                        <input
                          type="number"
                          min="0"
                          step="100"
                          value={classTuition}
                          onChange={(e) => setClassTuition(e.target.value)}
                          placeholder="e.g. 18000"
                          className="w-full px-3 py-2 text-xs font-mono font-bold bg-slate-50 focus:bg-white rounded-xl border border-slate-200 text-slate-900 focus:ring-2 focus:ring-purple-600 focus:outline-none"
                        />
                      </div>

                      <div>
                        <label className="block text-[10px] font-black text-slate-600 uppercase tracking-wider mb-1">
                          {selectedFeeClass} Admission Fee ({currencySymbol})
                        </label>
                        <input
                          type="number"
                          min="0"
                          step="100"
                          value={classAdmission}
                          onChange={(e) => setClassAdmission(e.target.value)}
                          placeholder="e.g. 6000"
                          className="w-full px-3 py-2 text-xs font-mono font-bold bg-slate-50 focus:bg-white rounded-xl border border-slate-200 text-slate-900 focus:ring-2 focus:ring-purple-600 focus:outline-none"
                        />
                      </div>

                      <div>
                        <label className="block text-[10px] font-black text-slate-600 uppercase tracking-wider mb-1">
                          {selectedFeeClass} Exam Fee ({currencySymbol})
                        </label>
                        <input
                          type="number"
                          min="0"
                          step="100"
                          value={classExam}
                          onChange={(e) => setClassExam(e.target.value)}
                          placeholder="e.g. 2000"
                          className="w-full px-3 py-2 text-xs font-mono font-bold bg-slate-50 focus:bg-white rounded-xl border border-slate-200 text-slate-900 focus:ring-2 focus:ring-purple-600 focus:outline-none"
                        />
                      </div>

                      <div>
                        <label className="block text-[10px] font-black text-slate-600 uppercase tracking-wider mb-1">
                          {selectedFeeClass} Lesson (Monthly) ({currencySymbol})
                        </label>
                        <input
                          type="number"
                          min="0"
                          step="100"
                          value={classLessonMonthly}
                          onChange={(e) => setClassLessonMonthly(e.target.value)}
                          placeholder="e.g. 3000"
                          className="w-full px-3 py-2 text-xs font-mono font-bold bg-slate-50 focus:bg-white rounded-xl border border-slate-200 text-slate-900 focus:ring-2 focus:ring-purple-600 focus:outline-none"
                        />
                      </div>

                      <div>
                        <label className="block text-[10px] font-black text-slate-600 uppercase tracking-wider mb-1">
                          {selectedFeeClass} Lesson (Full Term) ({currencySymbol})
                        </label>
                        <input
                          type="number"
                          min="0"
                          step="100"
                          value={classLessonTermly}
                          onChange={(e) => setClassLessonTermly(e.target.value)}
                          placeholder="e.g. 8000"
                          className="w-full px-3 py-2 text-xs font-mono font-bold bg-slate-50 focus:bg-white rounded-xl border border-slate-200 text-slate-900 focus:ring-2 focus:ring-purple-600 focus:outline-none"
                        />
                      </div>

                      {/* Calculated Total Term Package */}
                      <div className="p-2.5 rounded-xl bg-purple-50/70 border border-purple-200/80 flex flex-col justify-between">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-black text-purple-900 uppercase">Term Package Due:</span>
                          <span className="text-[10px] text-purple-700 font-medium">Tuition + Exam + Lesson</span>
                        </div>
                        <div className="text-sm font-black font-mono text-purple-950 mt-1">
                          {currencySymbol}
                          {(
                            (Math.max(0, Number(classTuition) || 0)) +
                            (Math.max(0, Number(classExam) || 0)) +
                            (Math.max(0, Number(classLessonTermly) || 0))
                          ).toLocaleString()}
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-col sm:flex-row items-center gap-2 pt-1">
                      <button
                        type="button"
                        onClick={handleApplyClassOverride}
                        id="save-class-rate-btn"
                        className="w-full sm:flex-1 py-2.5 px-4 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs flex items-center justify-center gap-2 cursor-pointer shadow-xs transition-all active:scale-95"
                      >
                        <Check className="w-4 h-4" />
                        <span>Save & Apply Custom Rates for {selectedFeeClass}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleBatchApplyToSection('all')}
                        className="w-full sm:w-auto py-2.5 px-4 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer transition-all"
                        title="Copy these numbers across every class in the academy"
                      >
                        <Layers className="w-3.5 h-3.5 text-slate-600" />
                        <span>Apply to ALL {schoolClassesList.length} Classes</span>
                      </button>
                    </div>
                  </div>
                )}

                {/* All Classes Rates Comparison Matrix Table */}
                <div className="space-y-2.5">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-black text-slate-800 uppercase tracking-wider">
                        All Classes Fee Schedule Matrix:
                      </span>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 font-bold">
                        {schoolClassesList.length} Classes
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      {Object.keys(classFeeSchedules).length > 0 && (
                        <button
                          type="button"
                          onClick={handleResetAllClassOverrides}
                          className="text-[11px] font-bold text-rose-600 hover:text-rose-700 hover:underline flex items-center gap-1 cursor-pointer"
                        >
                          <RotateCcw className="w-3 h-3" />
                          <span>Reset All Custom Overrides</span>
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="overflow-x-auto rounded-2xl border border-purple-200/80 bg-white shadow-2xs">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="bg-slate-100/90 text-slate-700 text-[10px] font-black uppercase tracking-wider border-b border-slate-200">
                          <th className="py-2.5 px-3">Class / Section</th>
                          <th className="py-2.5 px-3">Students</th>
                          <th className="py-2.5 px-3">Tuition / School Fee</th>
                          <th className="py-2.5 px-3">Admission</th>
                          <th className="py-2.5 px-3">Exam</th>
                          <th className="py-2.5 px-3">Lesson (Term)</th>
                          <th className="py-2.5 px-3">Full Term Pkg</th>
                          <th className="py-2.5 px-3">Projected Total</th>
                          <th className="py-2.5 px-3">Rate Status</th>
                          <th className="py-2.5 px-3 text-right">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-mono">
                        {schoolClassesList
                          .filter((cls) => {
                            if (feeSectionFilter !== 'all' && getClassSection(cls) !== feeSectionFilter) return false;
                            if (feeSearchTerm.trim() && !cls.toLowerCase().includes(feeSearchTerm.toLowerCase().trim())) return false;
                            return true;
                          })
                          .map((cls) => {
                            const override = classFeeSchedules[cls];
                            const effectiveTuition = override?.tuitionFee ?? (Number(tuitionFee) || 15000);
                            const effectiveAdmission = override?.admissionFee ?? (Number(admissionFee) || 5000);
                            const effectiveExam = override?.examFee ?? (Number(examFee) || 1500);
                            const effectiveLessonTerm = override?.lessonFeeTermly ?? (Number(lessonFeeTermly) || 7000);
                            const termPkg = effectiveTuition + effectiveExam + effectiveLessonTerm;
                            const studentCount = classEnrollmentStats.counts[cls] || 0;
                            const projectedRev = studentCount * termPkg;
                            const isCustom = Boolean(override);

                            return (
                              <tr
                                key={cls}
                                className={`hover:bg-purple-50/40 transition-colors ${
                                  selectedFeeClass === cls ? 'bg-purple-50/70 font-bold' : ''
                                }`}
                              >
                                <td className="py-2.5 px-3 font-bold text-slate-900 font-sans">
                                  <div className="flex items-center gap-1.5">
                                    <span className="font-mono font-bold text-sm">{cls}</span>
                                    <span className="text-[9px] uppercase px-1.5 py-0.2 rounded bg-slate-100 text-slate-500 font-semibold">
                                      {getClassSection(cls)}
                                    </span>
                                  </div>
                                </td>
                                <td className="py-2.5 px-3 text-slate-600 font-sans">
                                  <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-800 text-[11px] font-bold">
                                    {studentCount}
                                  </span>
                                </td>
                                <td className="py-2.5 px-3 text-blue-900 font-bold">
                                  {currencySymbol}{effectiveTuition.toLocaleString()}
                                </td>
                                <td className="py-2.5 px-3 text-purple-900">
                                  {currencySymbol}{effectiveAdmission.toLocaleString()}
                                </td>
                                <td className="py-2.5 px-3 text-amber-900">
                                  {currencySymbol}{effectiveExam.toLocaleString()}
                                </td>
                                <td className="py-2.5 px-3 text-emerald-900">
                                  {currencySymbol}{effectiveLessonTerm.toLocaleString()}
                                </td>
                                <td className="py-2.5 px-3 text-purple-950 font-black">
                                  {currencySymbol}{termPkg.toLocaleString()}
                                </td>
                                <td className="py-2.5 px-3 text-slate-700 text-[11px]">
                                  {studentCount > 0 ? (
                                    <span className="text-emerald-700 font-bold">
                                      {currencySymbol}{projectedRev.toLocaleString()}
                                    </span>
                                  ) : (
                                    <span className="text-slate-400">—</span>
                                  )}
                                </td>
                                <td className="py-2.5 px-3 font-sans">
                                  {isCustom ? (
                                    <span className="px-2 py-0.5 rounded-md bg-amber-100 text-amber-800 text-[10px] font-bold">
                                      Custom
                                    </span>
                                  ) : (
                                    <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 text-[10px] font-medium">
                                      Base
                                    </span>
                                  )}
                                </td>
                                <td className="py-2.5 px-3 text-right font-sans">
                                  <button
                                    type="button"
                                    onClick={() => handleSelectFeeClass(cls)}
                                    className="px-2.5 py-1 rounded-lg bg-purple-50 hover:bg-purple-100 text-purple-700 text-[11px] font-bold cursor-pointer transition-all"
                                  >
                                    Edit
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              {/* MODAL: BULK RATE ADJUSTER POPOVER */}
              {showBulkAdjustModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in">
                  <div className="bg-white rounded-3xl p-5 max-w-md w-full border border-slate-200 shadow-2xl space-y-4 animate-in zoom-in-95">
                    <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-xl bg-purple-600 text-white flex items-center justify-center">
                          <Sparkles className="w-4 h-4" />
                        </div>
                        <div>
                          <h3 className="text-sm font-bold text-slate-900">Bulk Fee Adjuster / Surcharge</h3>
                          <p className="text-[11px] text-slate-500">Apply uniform increments or % adjustments</p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowBulkAdjustModal(false)}
                        className="w-7 h-7 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>

                    <div className="space-y-3">
                      <div>
                        <label className="block text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1">
                          Target Fee Field:
                        </label>
                        <select
                          value={bulkSurchargeField}
                          onChange={(e) => setBulkSurchargeField(e.target.value as any)}
                          className="w-full px-3 py-2 text-xs font-bold bg-slate-50 rounded-xl border border-slate-200 text-slate-900 focus:outline-none focus:ring-2 focus:ring-purple-600"
                        >
                          <option value="tuitionFee">Tuition / School Fee</option>
                          <option value="examFee">Exam Fee</option>
                          <option value="lessonFeeTermly">Lesson Fee (Termly)</option>
                          <option value="admissionFee">Admission Fee</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1">
                          Apply To Classes In:
                        </label>
                        <select
                          value={bulkSurchargeTarget}
                          onChange={(e) => setBulkSurchargeTarget(e.target.value as any)}
                          className="w-full px-3 py-2 text-xs font-bold bg-slate-50 rounded-xl border border-slate-200 text-slate-900 focus:outline-none focus:ring-2 focus:ring-purple-600"
                        >
                          <option value="all">All Classes ({schoolClassesList.length} classes)</option>
                          <option value="nursery">Early Years / Nursery Only</option>
                          <option value="primary">Primary Classes Only</option>
                          <option value="jss">Junior Secondary (JSS) Only</option>
                          <option value="sss">Senior Secondary (SSS) Only</option>
                        </select>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1">
                            Adjustment Type:
                          </label>
                          <div className="flex rounded-xl bg-slate-100 p-1">
                            <button
                              type="button"
                              onClick={() => setBulkSurchargeType('fixed')}
                              className={`flex-1 py-1 text-xs font-bold rounded-lg transition-all ${
                                bulkSurchargeType === 'fixed' ? 'bg-white shadow-2xs text-purple-700' : 'text-slate-600'
                              }`}
                            >
                              Fixed ({currencySymbol})
                            </button>
                            <button
                              type="button"
                              onClick={() => setBulkSurchargeType('percent')}
                              className={`flex-1 py-1 text-xs font-bold rounded-lg transition-all ${
                                bulkSurchargeType === 'percent' ? 'bg-white shadow-2xs text-purple-700' : 'text-slate-600'
                              }`}
                            >
                              Percentage (%)
                            </button>
                          </div>
                        </div>

                        <div>
                          <label className="block text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1">
                            Value {bulkSurchargeType === 'fixed' ? `(${currencySymbol})` : '(%)'}:
                          </label>
                          <input
                            type="number"
                            value={bulkSurchargeAmount}
                            onChange={(e) => setBulkSurchargeAmount(e.target.value)}
                            placeholder="e.g. 1000 or 10"
                            className="w-full px-3 py-2 text-xs font-mono font-bold bg-slate-50 rounded-xl border border-slate-200 text-slate-900 focus:outline-none focus:ring-2 focus:ring-purple-600"
                          />
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
                      <button
                        type="button"
                        onClick={() => setShowBulkAdjustModal(false)}
                        className="flex-1 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={handleApplyBulkAdjust}
                        className="flex-1 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold shadow-xs transition-all active:scale-95"
                      >
                        Apply Adjustment
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* SAVE FORM & ACTIONS */}
              <form onSubmit={handleSaveFeeSchedule} className="p-4 rounded-3xl border border-slate-200 bg-white space-y-3.5">
                <div className="p-3 rounded-2xl bg-blue-50/70 border border-blue-200/80 flex items-start gap-2.5">
                  <input
                    type="checkbox"
                    id="apply-to-enrolled"
                    checked={applyToEnrolledStudents}
                    onChange={(e) => setApplyToEnrolledStudents(e.target.checked)}
                    className="mt-0.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                  />
                  <label htmlFor="apply-to-enrolled" className="text-xs text-slate-700 font-medium cursor-pointer leading-tight">
                    <span className="font-bold text-slate-900 block">Apply fee updates across entire app & existing students immediately</span>
                    Recalculates tuition, exam, admission, and lesson fee balances for all enrolled students based on their exact class fee schedule.
                  </label>
                </div>

                <div className="flex gap-2.5">
                  <button
                    type="button"
                    onClick={() => setActiveAppId(null)}
                    className="py-3 px-4 rounded-2xl bg-slate-100 text-slate-800 font-bold text-xs hover:bg-slate-200 cursor-pointer"
                  >
                    Back to Gallery
                  </button>

                  <button
                    type="submit"
                    className="flex-1 py-3 px-4 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs flex items-center justify-center gap-2 cursor-pointer shadow-xs transition-all active:scale-95"
                  >
                    <Save className="w-4 h-4" />
                    <span>Save All Fee Schedules & Apply Across App</span>
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* ========================================================================= */}
          {/* VIEW 4: BURSAR & CURRENCY PREFERENCES APP                                 */}
          {/* ========================================================================= */}
          {activeAppId === 'bursar_settings' && (
            <form onSubmit={handleSaveAll} className="space-y-4">
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1">
                  Active School Name
                </label>
                <input
                  type="text"
                  id="settings-school-name"
                  value={schoolName}
                  onChange={(e) => setSchoolName(e.target.value)}
                  placeholder="e.g. Eminent Royal Crown Academy"
                  className="w-full px-4 py-2.5 text-xs font-bold bg-[#f4f4f7] rounded-2xl border-none text-[#1a1a1a] focus:ring-2 focus:ring-blue-600 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1">
                    Bursar / Officer Name
                  </label>
                  <input
                    type="text"
                    id="settings-bursar-name"
                    value={bursarName}
                    onChange={(e) => setBursarName(e.target.value)}
                    className="w-full px-4 py-2.5 text-xs font-bold bg-[#f4f4f7] rounded-2xl border-none text-[#1a1a1a] focus:ring-2 focus:ring-blue-600 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1">
                    Currency Symbol
                  </label>
                  <select
                    id="settings-currency-symbol"
                    value={currencySymbol}
                    onChange={(e) => setCurrencySymbol(e.target.value)}
                    className="w-full px-4 py-2.5 text-xs font-black bg-[#f4f4f7] rounded-2xl border border-[#eee] text-[#1a1a1a] focus:ring-2 focus:ring-blue-600 focus:outline-none"
                  >
                    <option value="₦">₦ (Naira)</option>
                    <option value="$">$ (USD / CAD / AUD)</option>
                    <option value="£">£ (Pound Sterling)</option>
                    <option value="€">€ (Euro)</option>
                    <option value="GH₵">GH₵ (Cedi)</option>
                    <option value="KSh">KSh (Kenyan Shilling)</option>
                    <option value="R">R (Rand)</option>
                    <option value="Rs">Rs (Rupee)</option>
                  </select>
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setActiveAppId(null)}
                  className="flex-1 py-3 px-4 rounded-2xl bg-slate-100 text-slate-800 font-bold text-xs hover:bg-slate-200 cursor-pointer"
                >
                  Back to Gallery
                </button>
                <button
                  type="submit"
                  className="flex-1 py-3 px-4 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-sm flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  {saveSuccess ? <Check className="w-4 h-4 text-white" /> : <span>Save Profile</span>}
                </button>
              </div>

              {onLogout && (
                <div className="pt-4 border-t border-slate-200">
                  <div className="bg-rose-50 border border-rose-200 p-4 rounded-2xl flex items-center justify-between">
                    <div>
                      <h5 className="text-xs font-bold text-rose-950">Active Session Access</h5>
                      <p className="text-[11px] text-rose-700">Lock portal and return to system login screen</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        onClose();
                        onLogout();
                      }}
                      className="px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition-all shadow-xs cursor-pointer"
                    >
                      Sign Out & Lock
                    </button>
                  </div>
                </div>
              )}
            </form>
          )}

          {/* ========================================================================= */}
          {/* VIEW 5: BACKUP & DATA RESTORE APP                                         */}
          {/* ========================================================================= */}
          {activeAppId === 'backups' && (
            <div className="space-y-4">
              <div className="bg-emerald-50 border border-emerald-200 p-4 rounded-3xl space-y-2">
                <div className="flex items-center gap-2">
                  <Download className="w-4 h-4 text-emerald-700" />
                  <h4 className="text-xs font-black text-emerald-950 uppercase">Offline Safety Backups</h4>
                </div>
                <p className="text-xs text-emerald-800/90 leading-snug">
                  Download snapshots of all current student financial records to store securely on your computer or flash drive.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => downloadCsvBackup(students, session)}
                  className="p-4 rounded-3xl bg-white border border-slate-200 hover:border-emerald-500 hover:bg-emerald-50/30 transition-all text-center space-y-2 cursor-pointer shadow-xs"
                >
                  <FileSpreadsheet className="w-8 h-8 text-emerald-600 mx-auto" />
                  <div className="text-xs font-black text-slate-900">Download CSV</div>
                  <p className="text-[10px] text-slate-500">Excel / Spreadsheet compatible</p>
                </button>

                <button
                  type="button"
                  onClick={() => downloadJsonBackup(students, session)}
                  className="p-4 rounded-3xl bg-white border border-slate-200 hover:border-blue-500 hover:bg-blue-50/30 transition-all text-center space-y-2 cursor-pointer shadow-xs"
                >
                  <Download className="w-8 h-8 text-blue-600 mx-auto" />
                  <div className="text-xs font-black text-slate-900">Download JSON</div>
                  <p className="text-[10px] text-slate-500">Complete raw database backup</p>
                </button>
              </div>

              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => setActiveAppId(null)}
                  className="w-full py-3 px-4 rounded-2xl bg-slate-100 text-slate-800 font-bold text-xs hover:bg-slate-200 cursor-pointer"
                >
                  Back to App Gallery
                </button>
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* VIEW 6: GOOGLE APPS SCRIPT CODE APP                                       */}
          {/* ========================================================================= */}
          {activeAppId === 'apps_script_code' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-black text-slate-900 uppercase">Google Apps Script Code.gs</h4>
                <button
                  type="button"
                  onClick={() => handleCopyHeaders(GOOGLE_APPS_SCRIPT_CODE, 'appscript')}
                  className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-xs"
                >
                  {copiedType === 'appscript' ? (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      <span>Copied!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copy Full Script</span>
                    </>
                  )}
                </button>
              </div>

              <pre className="p-4 bg-slate-900 text-emerald-300 font-mono text-[10px] rounded-3xl overflow-x-auto max-h-72 select-all leading-relaxed">
                {GOOGLE_APPS_SCRIPT_CODE}
              </pre>

              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => setActiveAppId(null)}
                  className="w-full py-3 px-4 rounded-2xl bg-slate-100 text-slate-800 font-bold text-xs hover:bg-slate-200 cursor-pointer"
                >
                  Back to App Gallery
                </button>
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* VIEW 7: DATA HEALTH INSPECTOR APP                                         */}
          {/* ========================================================================= */}
          {activeAppId === 'data_inspector' && (
            <div className="space-y-4">
              <div className={`p-4 rounded-3xl border space-y-2 ${healthStats.isClean ? 'bg-emerald-50 border-emerald-200' : 'bg-amber-50 border-amber-200'}`}>
                <div className="flex items-center gap-2">
                  <ShieldCheck className={`w-5 h-5 ${healthStats.isClean ? 'text-emerald-600' : 'text-amber-600'}`} />
                  <h4 className="text-xs font-black uppercase text-slate-900">
                    {healthStats.isClean ? 'Database Health is Excellent' : 'Database Anomalies Detected'}
                  </h4>
                </div>
                <p className="text-xs text-slate-600">
                  {healthStats.isClean
                    ? 'No negative balances, missing names, unassigned classrooms, or duplicate records found.'
                    : `Detected ${healthStats.totalIssues} data consistency alerts that may require attention.`}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200">
                  <div className="text-[10px] text-slate-400 font-bold uppercase">Duplicates:</div>
                  <div className={`text-sm font-black font-mono ${duplicateStats.count > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                    {duplicateStats.count} {duplicateStats.count > 0 ? '(Action needed)' : 'None'}
                  </div>
                </div>

                <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200">
                  <div className="text-[10px] text-slate-400 font-bold uppercase">Negative Balances:</div>
                  <div className={`text-sm font-black font-mono ${healthStats.negativeBalances > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                    {healthStats.negativeBalances}
                  </div>
                </div>

                <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200">
                  <div className="text-[10px] text-slate-400 font-bold uppercase">Unassigned Class:</div>
                  <div className={`text-sm font-black font-mono ${healthStats.missingClasses > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
                    {healthStats.missingClasses}
                  </div>
                </div>

                <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200">
                  <div className="text-[10px] text-slate-400 font-bold uppercase">Zero-Fee Records:</div>
                  <div className={`text-sm font-black font-mono ${healthStats.zeroFees > 0 ? 'text-slate-600' : 'text-emerald-600'}`}>
                    {healthStats.zeroFees}
                  </div>
                </div>
              </div>

              {duplicateStats.count > 0 && (
                <button
                  type="button"
                  onClick={() => setActiveAppId('duplicate_cleaner')}
                  className="w-full py-2.5 px-3 rounded-2xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold flex items-center justify-center gap-2 cursor-pointer shadow-xs"
                >
                  <Users className="w-4 h-4" />
                  <span>Launch Duplicate Cleaner ({duplicateStats.count} Duplicates)</span>
                </button>
              )}

              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => setActiveAppId(null)}
                  className="w-full py-3 px-4 rounded-2xl bg-slate-100 text-slate-800 font-bold text-xs hover:bg-slate-200 cursor-pointer"
                >
                  Back to App Gallery
                </button>
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* VIEW 8: TERM DURATION & PAYMENT SCHEDULE APP                              */}
          {/* ========================================================================= */}
          {activeAppId === 'term_schedule' && (
            <form onSubmit={handleSaveTermSchedule} className="space-y-4">
              {/* Term Switcher */}
              <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-2xl">
                {['First Term', 'Second Term', 'Third Term'].map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => handleTermTabSwitch(t)}
                    className={`flex-1 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                      scheduleTerm === t
                        ? 'bg-white text-indigo-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>

              {scheduleSavedMsg && (
                <div className="p-3 rounded-2xl bg-emerald-50 border border-emerald-200 text-xs font-bold text-emerald-800 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>Academic term duration and payment dates saved!</span>
                </div>
              )}

              {/* 1. Term Duration */}
              <div className="p-4 rounded-3xl bg-slate-50 border border-slate-200 space-y-3">
                <h4 className="text-xs font-black uppercase text-slate-900 flex items-center gap-1.5">
                  <Calendar className="w-4 h-4 text-indigo-600" />
                  <span>1. Term Academic Dates</span>
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-bold uppercase text-slate-600 mb-1">
                      Term Begins (Start Date) *
                    </label>
                    <input
                      type="date"
                      required
                      value={scheduleStartDate}
                      onChange={(e) => setScheduleStartDate(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold uppercase text-slate-600 mb-1">
                      Term Ends (End Date) *
                    </label>
                    <input
                      type="date"
                      required
                      value={scheduleEndDate}
                      onChange={(e) => setScheduleEndDate(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    />
                  </div>
                </div>

                <div>
                  <span className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                    Months in this Term ({derivedScheduleMonths.length} Months):
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {derivedScheduleMonths.map((m) => (
                      <span
                        key={m}
                        className="px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-700 border border-indigo-200 text-[11px] font-bold font-mono"
                      >
                        {formatMonthLabel(m)}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              {/* 2. Salary Due Day */}
              <div className="p-4 rounded-3xl bg-slate-50 border border-slate-200 space-y-3">
                <h4 className="text-xs font-black uppercase text-slate-900 flex items-center gap-1.5">
                  <Clock className="w-4 h-4 text-emerald-600" />
                  <span>2. Staff Salary Monthly Due Day</span>
                </h4>
                <div>
                  <label className="block text-[10px] font-bold uppercase text-slate-600 mb-1">
                    Salary Payment Due Day of Month *
                  </label>
                  <div className="flex items-center gap-3">
                    <input
                      type="number"
                      min="1"
                      max="28"
                      required
                      value={scheduleSalaryDueDay}
                      onChange={(e) => setScheduleSalaryDueDay(Number(e.target.value))}
                      className="w-24 px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-black text-slate-900 focus:ring-2 focus:ring-indigo-500 focus:outline-none text-center"
                    />
                    <span className="text-xs text-slate-600 font-medium">
                      e.g. <strong>{scheduleSalaryDueDay}th</strong> of every month
                    </span>
                  </div>
                </div>
              </div>

              {/* 3. Fee Collection Timeline */}
              <div className="p-4 rounded-3xl bg-slate-50 border border-slate-200 space-y-3">
                <h4 className="text-xs font-black uppercase text-slate-900 flex items-center gap-1.5">
                  <Users className="w-4 h-4 text-blue-600" />
                  <span>3. Student Fee Collection Timeline</span>
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-bold uppercase text-slate-600 mb-1">
                      Collection Starts On *
                    </label>
                    <input
                      type="date"
                      required
                      value={scheduleFeeStart}
                      onChange={(e) => setScheduleFeeStart(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold uppercase text-slate-600 mb-1">
                      School Fee Due Date *
                    </label>
                    <input
                      type="date"
                      required
                      value={scheduleFeeDue}
                      onChange={(e) => setScheduleFeeDue(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    />
                  </div>
                </div>
                <div className="p-2.5 rounded-xl bg-white border border-slate-200 flex items-center justify-between text-xs">
                  <span className="text-slate-600 font-medium">Status Preview:</span>
                  <span className="font-bold text-indigo-700">
                    {scheduleTimelineStatus.statusText}
                  </span>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="pt-2 flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => setActiveAppId(null)}
                  className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold cursor-pointer"
                >
                  Back
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black shadow-xs cursor-pointer"
                >
                  Save Schedule
                </button>
              </div>
            </form>
          )}

          {/* 11. Activity & Immutable Audit Logs Sub-App */}
          {activeAppId === 'audit_logs' && (
            <div className="space-y-4">
              <AuditLogsView session={session} schoolId={activeSchool?.id} />
            </div>
          )}

          {/* 12. School Branding & White-Label Customizer Sub-App */}
          {activeAppId === 'school_branding' && (
            <div className="space-y-4">
              <SchoolBrandingCustomizer schoolId={activeSchool?.id} />
            </div>
          )}
        </div>

        {/* Persistent Sticky Mobile Bottom Navigation Bar when a sub-app is active */}
        {activeAppId && (
          <div className="sm:hidden px-4 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-2 shrink-0 z-10 shadow-lg">
            <button
              type="button"
              onClick={() => setActiveAppId(null)}
              className="flex-1 py-2.5 px-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-black text-xs flex items-center justify-center gap-1.5 shadow-xs cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Back to App Gallery</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="py-2.5 px-4 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold text-xs cursor-pointer"
            >
              Close
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
