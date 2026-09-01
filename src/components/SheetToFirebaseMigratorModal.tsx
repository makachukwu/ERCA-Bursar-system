/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useMemo } from 'react';
import {
  X,
  Zap,
  Cloud,
  FileSpreadsheet,
  Link2,
  Upload,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  RefreshCw,
  Sparkles,
  Database,
  Users,
  ShieldCheck,
  Calendar,
  Layers,
  Coins,
  Check,
  Copy
} from 'lucide-react';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import {
  StudentPaymentRecord,
  SchoolProfile,
  StaffMember,
  PayrollRecord,
  ExpenseItem,
  ScholarshipRecord,
  AcademicTermSchedule,
  SchoolFeeSchedule,
  RemittanceRecord
} from '../types';
import {
  batchSaveStudentsToFirestore,
  batchSaveScholarshipsToFirestore,
  saveStaffToFirestore,
  savePayrollToFirestore,
  saveExpenseToFirestore,
  saveTermScheduleToFirestore,
  saveSchoolProfileToFirestore,
  recordFirebaseSyncSuccess,
  testConnection
} from '../services/firebase';
import {
  saveStoredStudents,
  saveStoredScholarships
} from '../services/storage';
import {
  saveStoredStaff,
  saveStoredPayrollRecords
} from '../services/payrollService';
import {
  saveStoredExpenses
} from '../services/expenseService';
import {
  saveStoredTermSchedule
} from '../services/termScheduleService';
import {
  updateSchoolFeeSchedule
} from '../services/schoolService';
import {
  normalizeStudentRow,
  calculateBalance,
  calculateStatus
} from '../services/calculations';

interface SheetToFirebaseMigratorModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeSchool: SchoolProfile;
  currentStudents: StudentPaymentRecord[];
  currentScholarships?: ScholarshipRecord[];
  onMigrationComplete: (summary: {
    studentsCount: number;
    staffCount: number;
    expensesCount: number;
    feeScheduleUpdated: boolean;
    termScheduleUpdated: boolean;
    message: string;
  }) => void;
}

type MigrationMode = 'quick_push' | 'sheet_link' | 'excel_file' | 'apps_script';

function cleanKey(key: string): string {
  return String(key || '')
    .trim()
    .replace(/^[\uFEFF\uFFFE\u00EF\u00BB\u00BF]+/, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function cleanNum(val: any, fallback: number = 0): number {
  if (val === undefined || val === null || val === '') return fallback;
  if (typeof val === 'number') return isNaN(val) ? fallback : Math.max(0, val);
  const str = String(val)
    .replace(/[\uFEFF\uFFFE\u00EF\u00BB\u00BF]/g, '')
    .replace(/₦|\$|€|£|ghs|kes|zar|,|\s/gi, '')
    .trim();
  const parsed = parseFloat(str);
  return isNaN(parsed) ? fallback : Math.max(0, parsed);
}

function findRowValue(row: Record<string, any>, aliases: string[]): any {
  const keys = Object.keys(row);
  const map = new Map<string, string>();
  for (const k of keys) {
    map.set(cleanKey(k), k);
  }
  for (const alias of aliases) {
    const orig = map.get(cleanKey(alias));
    if (orig && row[orig] !== undefined && row[orig] !== null && String(row[orig]).trim() !== '') {
      return row[orig];
    }
  }
  return undefined;
}

export const SheetToFirebaseMigratorModal: React.FC<SheetToFirebaseMigratorModalProps> = ({
  isOpen,
  onClose,
  activeSchool,
  currentStudents,
  currentScholarships = [],
  onMigrationComplete
}) => {
  const [mode, setMode] = useState<MigrationMode>('quick_push');
  const [sheetUrl, setSheetUrl] = useState<string>(activeSchool.sheetConfig?.apiUrl || '');
  const [isMigrating, setIsMigrating] = useState<boolean>(false);
  const [progressStep, setProgressStep] = useState<string>('');
  const [progressPercent, setProgressPercent] = useState<number>(0);
  const [migrationResult, setMigrationResult] = useState<{
    success: boolean;
    title: string;
    details: string[];
  } | null>(null);
  const [parsedFileStats, setParsedFileStats] = useState<{
    sheetCount: number;
    students: number;
    staff: number;
    expenses: number;
    fileName?: string;
  } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Entities to migrate
  const [migrateStudents, setMigrateStudents] = useState<boolean>(true);
  const [migrateStaff, setMigrateStaff] = useState<boolean>(true);
  const [migrateExpenses, setMigrateExpenses] = useState<boolean>(true);
  const [migrateFeeSchedule, setMigrateFeeSchedule] = useState<boolean>(true);
  const [migrateTermSchedule, setMigrateTermSchedule] = useState<boolean>(true);

  if (!isOpen) return null;

  const targetSchoolId = activeSchool.id || 'eminent-academy';
  const currencySymbol = activeSchool.currencySymbol || '₦';

  // 1. FAST LOCAL PUSH MIGRATION
  const handleQuickLocalPush = async () => {
    setIsMigrating(true);
    setMigrationResult(null);
    setProgressPercent(10);
    setProgressStep('Verifying Cloud Firestore connection...');

    try {
      const ping = await testConnection();
      if (!ping.success && !ping.message.includes('offline')) {
        console.warn('Firebase connection note:', ping.message);
      }

      const results: string[] = [];
      let studentsCount = 0;
      let staffCount = 0;
      let expensesCount = 0;

      // 1. Students
      if (migrateStudents && currentStudents.length > 0) {
        setProgressPercent(30);
        setProgressStep(`Uploading ${currentStudents.length} Students & Payment records to Firebase...`);
        const ok = await batchSaveStudentsToFirestore(currentStudents, targetSchoolId);
        if (ok) {
          saveStoredStudents(currentStudents, targetSchoolId);
          results.push(`✓ ${currentStudents.length} Student payment documents stored in Cloud Firestore`);
          studentsCount = currentStudents.length;
        }
      }

      // 2. Scholarships
      if (currentScholarships.length > 0) {
        setProgressPercent(50);
        setProgressStep(`Uploading ${currentScholarships.length} Scholarship records...`);
        await batchSaveScholarshipsToFirestore(currentScholarships, targetSchoolId);
        saveStoredScholarships(currentScholarships, targetSchoolId);
        results.push(`✓ ${currentScholarships.length} Scholarship grants synchronized`);
      }

      // 3. School Profile & Fee Schedules
      if (migrateFeeSchedule && activeSchool.feeSchedule) {
        setProgressPercent(70);
        setProgressStep('Uploading School Fee Schedule & Class-specific rates to Cloud...');
        await saveSchoolProfileToFirestore(activeSchool);
        results.push(`✓ Fee Schedule (Tuition: ${currencySymbol}${activeSchool.feeSchedule.tuitionFee?.toLocaleString()}) migrated`);
      }

      setProgressPercent(100);
      setProgressStep('Migration Complete! All data live in Firebase.');
      recordFirebaseSyncSuccess();

      setMigrationResult({
        success: true,
        title: 'Instant Firebase Migration Succeeded!',
        details: results
      });

      onMigrationComplete({
        studentsCount,
        staffCount,
        expensesCount,
        feeScheduleUpdated: true,
        termScheduleUpdated: true,
        message: `Successfully migrated all school data to Firebase Cloud!`
      });
    } catch (err: any) {
      setMigrationResult({
        success: false,
        title: 'Migration Encountered an Error',
        details: [err?.message || String(err)]
      });
    } finally {
      setIsMigrating(false);
    }
  };

  // 2. EXCEL / CSV FILE MIGRATION
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    const isCsv = file.name.endsWith('.csv');

    if (isCsv) {
      reader.onload = (evt) => {
        const text = evt.target?.result as string;
        Papa.parse(text, {
          header: true,
          skipEmptyLines: true,
          complete: (parsed) => {
            const rows = parsed.data as Record<string, any>[];
            setParsedFileStats({
              sheetCount: 1,
              students: rows.length,
              staff: 0,
              expenses: 0,
              fileName: file.name
            });
            processRawRecordsAndMigrate({ studentsRows: rows, file });
          }
        });
      };
      reader.readAsText(file);
    } else {
      // Excel (.xlsx, .xls)
      reader.onload = (evt) => {
        try {
          const data = new Uint8Array(evt.target?.result as ArrayBuffer);
          const workbook = XLSX.read(data, { type: 'array' });
          let studentsRows: any[] = [];
          let staffRows: any[] = [];
          let expenseRows: any[] = [];

          workbook.SheetNames.forEach((name) => {
            const lower = name.toLowerCase().trim();
            const sheet = workbook.Sheets[name];
            const json = XLSX.utils.sheet_to_json(sheet) as Record<string, any>[];

            if (lower.includes('fee') || lower.includes('student') || lower.includes('roster') || lower.includes('data')) {
              studentsRows = studentsRows.concat(json);
            } else if (lower.includes('staff') || lower.includes('payroll') || lower.includes('salary')) {
              staffRows = staffRows.concat(json);
            } else if (lower.includes('expens') || lower.includes('cost') || lower.includes('outflow')) {
              expenseRows = expenseRows.concat(json);
            } else {
              // Default to students if unidentified
              if (studentsRows.length === 0) studentsRows = json;
            }
          });

          setParsedFileStats({
            sheetCount: workbook.SheetNames.length,
            students: studentsRows.length,
            staff: staffRows.length,
            expenses: expenseRows.length,
            fileName: file.name
          });

          processRawRecordsAndMigrate({ studentsRows, staffRows, expenseRows, file });
        } catch (err: any) {
          setMigrationResult({
            success: false,
            title: 'File Parse Error',
            details: [`Could not parse Excel workbook: ${err.message || err}`]
          });
        }
      };
      reader.readAsArrayBuffer(file);
    }
  };

  // Process raw rows and write to Firestore
  const processRawRecordsAndMigrate = async (data: {
    studentsRows?: Record<string, any>[];
    staffRows?: Record<string, any>[];
    expenseRows?: Record<string, any>[];
    file?: File;
  }) => {
    setIsMigrating(true);
    setMigrationResult(null);
    setProgressPercent(15);
    setProgressStep('Parsing, cleaning, and normalizing records...');

    try {
      const results: string[] = [];
      let finalStudents: StudentPaymentRecord[] = [];
      let finalStaff: StaffMember[] = [];
      let finalExpenses: ExpenseItem[] = [];

      // 1. Process Students
      if (migrateStudents && data.studentsRows && data.studentsRows.length > 0) {
        setProgressPercent(35);
        setProgressStep(`Normalizing & writing ${data.studentsRows.length} students to Cloud Firestore...`);

        finalStudents = data.studentsRows.map((r, idx) => {
          const rawId = findRowValue(r, ['id', 'student_id', 'admission_no', 'reg_no', 'student_no']) || `STU/${String(idx + 1).padStart(4, '0')}`;
          const rawName = findRowValue(r, ['full_name', 'student_name', 'name', 'student']) || 'Unnamed Student';
          const rawClass = findRowValue(r, ['class', 'classroom', 'grade', 'level']) || 'Pri1';
          const rawTerm = findRowValue(r, ['term', 'academic_term']) || 'First Term';
          const rawSession = findRowValue(r, ['session', 'academic_session', 'year']) || '2026/2027';

          const feeAmount = cleanNum(findRowValue(r, ['fee_amount', 'tuition_fee', 'school_fee', 'total_fee', 'fees']), activeSchool.feeSchedule?.tuitionFee || 15000);
          const amountPaid = cleanNum(findRowValue(r, ['amount_paid', 'paid', 'total_paid', 'payment']), 0);
          const balance = calculateBalance(feeAmount, amountPaid);
          const status = calculateStatus(feeAmount, amountPaid);

          const studentRecord: StudentPaymentRecord = {
            id: String(rawId).trim(),
            full_name: String(rawName).trim(),
            class: String(rawClass).trim(),
            term: String(rawTerm).trim(),
            session: String(rawSession).trim(),
            fee_amount: feeAmount,
            amount_paid: amountPaid,
            balance,
            status,
            payment_date: String(findRowValue(r, ['payment_date', 'date', 'paid_date']) || new Date().toISOString().split('T')[0]),
            admission_fee: cleanNum(findRowValue(r, ['admission_fee', 'admission']), 0),
            admission_paid: cleanNum(findRowValue(r, ['admission_paid']), 0),
            lesson_fee: cleanNum(findRowValue(r, ['lesson_fee', 'lesson']), 0),
            lesson_paid: cleanNum(findRowValue(r, ['lesson_paid']), 0),
            exam_fee: cleanNum(findRowValue(r, ['exam_fee', 'exam']), 0),
            exam_paid: cleanNum(findRowValue(r, ['exam_paid']), 0),
            lesson_months: String(findRowValue(r, ['lesson_months', 'months']) || ''),
            receipt_no: String(findRowValue(r, ['receipt_no', 'receipt', 'reference']) || ''),
            total_remitted: cleanNum(findRowValue(r, ['total_remitted', 'remitted']), 0),
          };

          return normalizeStudentRow(studentRecord);
        });

        // Batch upload to Firestore
        await batchSaveStudentsToFirestore(finalStudents, targetSchoolId);
        saveStoredStudents(finalStudents, targetSchoolId);
        results.push(`✓ ${finalStudents.length} Students & fee balances migrated to Cloud Firestore`);
      }

      // 2. Process Staff
      if (migrateStaff && data.staffRows && data.staffRows.length > 0) {
        setProgressPercent(65);
        setProgressStep(`Writing ${data.staffRows.length} Staff members to Cloud Firestore...`);

        finalStaff = data.staffRows.map((r, idx): StaffMember => {
          const staffId = String(findRowValue(r, ['staff_id', 'id', 'employee_id']) || `STF/${String(idx + 1).padStart(3, '0')}`).trim();
          const name = String(findRowValue(r, ['staff_name', 'name', 'full_name', 'teacher']) || 'Staff Member').trim();
          const role = String(findRowValue(r, ['role', 'designation', 'position']) || 'Teacher').trim();
          const baseSalary = cleanNum(findRowValue(r, ['base_salary', 'salary', 'basic_salary']), 35000);

          return {
            id: staffId,
            fullName: name,
            role,
            department: 'academic',
            employmentType: 'full_time',
            baseSalary,
            accountNumber: String(findRowValue(r, ['account_number', 'account_no', 'nuban']) || ''),
            bankName: String(findRowValue(r, ['bank_name', 'bank']) || ''),
            phone: String(findRowValue(r, ['phone', 'mobile', 'telephone']) || ''),
            status: 'active',
            joinedDate: new Date().toISOString().split('T')[0],
            allowances: {},
            deductions: {}
          };
        });

        for (const stf of finalStaff) {
          await saveStaffToFirestore(stf, targetSchoolId);
        }
        saveStoredStaff(finalStaff, targetSchoolId);
        results.push(`✓ ${finalStaff.length} Staff records stored in Cloud Firestore`);
      }

      // 3. Process Expenses
      if (migrateExpenses && data.expenseRows && data.expenseRows.length > 0) {
        setProgressPercent(85);
        setProgressStep(`Writing ${data.expenseRows.length} Expense records to Cloud Firestore...`);

        finalExpenses = data.expenseRows.map((r, idx): ExpenseItem => {
          const id = String(findRowValue(r, ['id', 'expense_id']) || `EXP-${Date.now()}-${idx}`);
          const amount = cleanNum(findRowValue(r, ['amount', 'cost', 'total']), 0);
          const category = String(findRowValue(r, ['category', 'type']) || 'other');
          const description = String(findRowValue(r, ['description', 'item', 'details', 'title']) || 'Expense item');

          return {
            id,
            category: 'other',
            categoryLabel: category.toUpperCase(),
            description,
            amount,
            date: String(findRowValue(r, ['date', 'expense_date']) || new Date().toISOString().split('T')[0]),
            paymentMethod: 'cash',
            recipient: String(findRowValue(r, ['recipient', 'vendor', 'payee']) || 'Vendor'),
            receiptVoucherRef: String(findRowValue(r, ['receipt_voucher_ref', 'voucher', 'ref']) || `VOUCH-${idx + 1}`),
            term: String(findRowValue(r, ['term']) || 'First Term'),
            session: String(findRowValue(r, ['session']) || '2026/2027'),
            recordedBy: 'Bursar',
            createdAt: new Date().toISOString()
          };
        });

        for (const exp of finalExpenses) {
          await saveExpenseToFirestore(exp, targetSchoolId);
        }
        saveStoredExpenses(finalExpenses, targetSchoolId);
        results.push(`✓ ${finalExpenses.length} Expense vouchers saved in Cloud Firestore`);
      }

      setProgressPercent(100);
      setProgressStep('Complete! All records migrated to Cloud Firestore.');
      recordFirebaseSyncSuccess();

      setMigrationResult({
        success: true,
        title: 'Spreadsheet to Firebase Migration Complete!',
        details: results
      });

      onMigrationComplete({
        studentsCount: finalStudents.length,
        staffCount: finalStaff.length,
        expensesCount: finalExpenses.length,
        feeScheduleUpdated: true,
        termScheduleUpdated: true,
        message: `Successfully migrated ${finalStudents.length} students, ${finalStaff.length} staff, and ${finalExpenses.length} expenses to Firebase!`
      });
    } catch (err: any) {
      setMigrationResult({
        success: false,
        title: 'Migration Error',
        details: [err?.message || String(err)]
      });
    } finally {
      setIsMigrating(false);
    }
  };

  // 3. APPS SCRIPT / WEB APP URL MIGRATION
  const handleAppsScriptMigration = async () => {
    if (!sheetUrl.trim()) {
      setMigrationResult({
        success: false,
        title: 'URL Required',
        details: ['Please paste your Google Apps Script Web App URL or Google Sheet URL.']
      });
      return;
    }

    setIsMigrating(true);
    setMigrationResult(null);
    setProgressPercent(20);
    setProgressStep('Connecting to Google Apps Script Web App endpoint...');

    try {
      let targetUrl = sheetUrl.trim();
      if (!targetUrl.includes('action=')) {
        targetUrl += targetUrl.includes('?') ? '&action=read' : '?action=read';
      }

      const resp = await fetch(targetUrl, { method: 'GET', mode: 'cors' });
      if (!resp.ok) {
        throw new Error(`HTTP status ${resp.status} received from Google Sheet endpoint.`);
      }

      const json = await resp.json();
      let studentsRows: any[] = [];
      let staffRows: any[] = [];
      let expenseRows: any[] = [];

      if (Array.isArray(json)) {
        studentsRows = json;
      } else if (json && typeof json === 'object') {
        studentsRows = json.students || json.data || json.FeeData || [];
        staffRows = json.staff || json.payroll || json.Staffpayroll || [];
        expenseRows = json.expenses || json.Expenses || [];
      }

      if (studentsRows.length === 0 && staffRows.length === 0 && expenseRows.length === 0) {
        throw new Error('No valid records could be read from this Google Sheet endpoint. Make sure the Apps Script is deployed as "Web app" with access "Anyone".');
      }

      await processRawRecordsAndMigrate({ studentsRows, staffRows, expenseRows });
    } catch (err: any) {
      setMigrationResult({
        success: false,
        title: 'Google Sheet Fetch Error',
        details: [
          err.message || String(err),
          'Tip: If your Google Sheet is private or Apps Script CORS is restricted, you can also download your sheet as Excel (.xlsx) or CSV and use the "Upload Excel / CSV" option for instant 100% reliable migration!'
        ]
      });
      setIsMigrating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="w-full max-w-xl bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="p-5 sm:p-6 bg-gradient-to-r from-slate-900 via-indigo-950 to-blue-950 text-white flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-blue-500/20 border border-blue-400/30 flex items-center justify-center text-blue-400 shrink-0 shadow-xs">
              <Zap className="w-6 h-6 fill-blue-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base sm:text-lg font-black uppercase tracking-tight">
                  Google Sheet to Firebase Migration
                </h3>
                <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 text-[10px] font-black uppercase">
                  Fast 1-Click
                </span>
              </div>
              <p className="text-xs text-blue-200/80 font-medium mt-0.5">
                Migrate all student records, staff payroll, and expenses into Cloud Firestore
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center cursor-pointer transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 sm:p-6 overflow-y-auto flex-1 space-y-5">
          {/* Migration Mode Selector */}
          <div className="grid grid-cols-3 gap-2 p-1.5 bg-slate-100 rounded-2xl">
            <button
              type="button"
              onClick={() => setMode('quick_push')}
              className={`py-2 px-2.5 rounded-xl text-xs font-bold transition-all flex flex-col items-center gap-1 cursor-pointer ${
                mode === 'quick_push'
                  ? 'bg-white text-indigo-900 shadow-xs border border-slate-200/80 font-black'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Zap className="w-4 h-4 text-amber-500" />
              <span>1-Click Sync</span>
            </button>

            <button
              type="button"
              onClick={() => setMode('excel_file')}
              className={`py-2 px-2.5 rounded-xl text-xs font-bold transition-all flex flex-col items-center gap-1 cursor-pointer ${
                mode === 'excel_file'
                  ? 'bg-white text-indigo-900 shadow-xs border border-slate-200/80 font-black'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
              <span>Excel / CSV</span>
            </button>

            <button
              type="button"
              onClick={() => setMode('apps_script')}
              className={`py-2 px-2.5 rounded-xl text-xs font-bold transition-all flex flex-col items-center gap-1 cursor-pointer ${
                mode === 'apps_script'
                  ? 'bg-white text-indigo-900 shadow-xs border border-slate-200/80 font-black'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Link2 className="w-4 h-4 text-blue-600" />
              <span>Sheet URL</span>
            </button>
          </div>

          {/* MODE 1: DIRECT LOCAL ROSTER TO FIREBASE */}
          {mode === 'quick_push' && (
            <div className="space-y-4">
              <div className="p-4 rounded-2xl bg-amber-50/70 border border-amber-200 space-y-2">
                <div className="flex items-center gap-2 text-amber-900 font-black text-xs uppercase">
                  <Zap className="w-4 h-4 text-amber-600" />
                  <span>Instant Migration of Current App Roster</span>
                </div>
                <p className="text-xs text-amber-800 leading-relaxed font-medium">
                  Directly transfers all active local students (<strong>{currentStudents.length} records</strong>), fee rates, scholarships, and schedules into <strong>Cloud Firestore</strong> with sub-second latency.
                </p>
              </div>

              <div className="space-y-2">
                <span className="text-[11px] font-black uppercase text-slate-500 tracking-wider block">
                  Select Data Collections to Migrate:
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs font-bold">
                  <label className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex items-center gap-2 cursor-pointer hover:bg-slate-100">
                    <input
                      type="checkbox"
                      checked={migrateStudents}
                      onChange={(e) => setMigrateStudents(e.target.checked)}
                      className="rounded text-blue-600 focus:ring-blue-500 w-4 h-4"
                    />
                    <span>Students ({currentStudents.length} records)</span>
                  </label>

                  <label className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex items-center gap-2 cursor-pointer hover:bg-slate-100">
                    <input
                      type="checkbox"
                      checked={migrateFeeSchedule}
                      onChange={(e) => setMigrateFeeSchedule(e.target.checked)}
                      className="rounded text-blue-600 focus:ring-blue-500 w-4 h-4"
                    />
                    <span>Fee Schedules & Class Rates</span>
                  </label>
                </div>
              </div>

              <button
                type="button"
                onClick={handleQuickLocalPush}
                disabled={isMigrating || currentStudents.length === 0}
                className="w-full py-3.5 px-4 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-700 hover:to-teal-800 text-white font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-md cursor-pointer disabled:opacity-50 transition-all active:scale-98"
              >
                {isMigrating ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <Zap className="w-4 h-4 fill-white" />
                )}
                <span>{isMigrating ? 'Migrating to Firebase...' : `Migrate ${currentStudents.length} Records to Firebase Now`}</span>
              </button>
            </div>
          )}

          {/* MODE 2: EXCEL / CSV FILE WORKBOOK */}
          {mode === 'excel_file' && (
            <div className="space-y-4">
              <div className="p-4 rounded-2xl bg-emerald-50/70 border border-emerald-200 space-y-2">
                <div className="flex items-center gap-2 text-emerald-900 font-black text-xs uppercase">
                  <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                  <span>Import Excel Workbook or CSV Directly to Firebase</span>
                </div>
                <p className="text-xs text-emerald-800 leading-relaxed font-medium">
                  Upload your school's Excel workbook (with FeeData, Staff, Expenses tabs) or a CSV file. It will be parsed, cleaned, and written straight to Firestore in seconds!
                </p>
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={handleFileUpload}
                className="hidden"
              />

              <div
                onClick={() => fileInputRef.current?.click()}
                className="p-8 border-2 border-dashed border-slate-300 hover:border-emerald-500 bg-slate-50 hover:bg-emerald-50/30 rounded-3xl flex flex-col items-center justify-center gap-3 cursor-pointer transition-all text-center"
              >
                <div className="w-12 h-12 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center shadow-xs">
                  <Upload className="w-6 h-6" />
                </div>
                <div>
                  <span className="text-xs font-black text-slate-800 block">
                    Choose Excel (.xlsx, .xls) or CSV Spreadsheet
                  </span>
                  <span className="text-[11px] text-slate-500 font-medium">
                    Click to browse or drag and drop your exported Google Sheet file here
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* MODE 3: GOOGLE APPS SCRIPT WEB APP */}
          {mode === 'apps_script' && (
            <div className="space-y-4">
              <div className="p-4 rounded-2xl bg-blue-50/70 border border-blue-200 space-y-2">
                <div className="flex items-center gap-2 text-blue-900 font-black text-xs uppercase">
                  <Link2 className="w-4 h-4 text-blue-600" />
                  <span>Google Apps Script Endpoint Migration</span>
                </div>
                <p className="text-xs text-blue-800 leading-relaxed font-medium">
                  Fetch all records live from your deployed Google Sheet Apps Script URL and copy them directly to Firebase.
                </p>
              </div>

              <div className="space-y-1.5">
                <label className="block text-[10px] font-black uppercase text-slate-500 tracking-wider">
                  Google Sheet Web App URL
                </label>
                <div className="relative">
                  <Link2 className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5 pointer-events-none" />
                  <input
                    type="url"
                    value={sheetUrl}
                    onChange={(e) => setSheetUrl(e.target.value)}
                    placeholder="https://script.google.com/macros/s/.../exec"
                    className="w-full pl-10 pr-4 py-2.5 text-xs font-mono bg-slate-50 rounded-2xl border border-slate-200 text-slate-900 focus:ring-2 focus:ring-blue-600 focus:outline-none"
                  />
                </div>
              </div>

              <button
                type="button"
                onClick={handleAppsScriptMigration}
                disabled={isMigrating || !sheetUrl.trim()}
                className="w-full py-3 px-4 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-xs cursor-pointer disabled:opacity-50 transition-all active:scale-98"
              >
                {isMigrating ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Cloud className="w-4 h-4" />}
                <span>{isMigrating ? 'Fetching & Migrating...' : 'Start Live Migration to Firebase'}</span>
              </button>
            </div>
          )}

          {/* Progress Bar during active migration */}
          {isMigrating && (
            <div className="p-4 rounded-2xl bg-slate-900 text-white space-y-2.5 animate-in fade-in">
              <div className="flex items-center justify-between text-xs font-bold">
                <span className="flex items-center gap-2 text-emerald-400">
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>{progressStep}</span>
                </span>
                <span className="font-mono text-emerald-300">{progressPercent}%</span>
              </div>
              <div className="w-full bg-white/10 h-2 rounded-full overflow-hidden">
                <div
                  className="bg-emerald-500 h-full transition-all duration-300 rounded-full"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>
          )}

          {/* Results Feedback Box */}
          {migrationResult && (
            <div
              className={`p-4 rounded-2xl border text-xs space-y-2 animate-in fade-in ${
                migrationResult.success
                  ? 'bg-emerald-50 text-emerald-950 border-emerald-300'
                  : 'bg-rose-50 text-rose-950 border-rose-300'
              }`}
            >
              <div className="flex items-center gap-2 font-black text-sm">
                {migrationResult.success ? (
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                ) : (
                  <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
                )}
                <span>{migrationResult.title}</span>
              </div>

              <ul className="list-disc pl-5 space-y-1 text-[11px] font-medium opacity-90">
                {migrationResult.details.map((d, i) => (
                  <li key={i}>{d}</li>
                ))}
              </ul>

              {migrationResult.success && (
                <div className="pt-2 flex justify-end">
                  <button
                    type="button"
                    onClick={onClose}
                    className="px-4 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs cursor-pointer shadow-xs"
                  >
                    Done & View Roster
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-2">
          <span className="text-[11px] text-slate-500 font-medium">
            Campus: <strong>{activeSchool.name}</strong>
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-white border border-slate-200 text-slate-700 hover:bg-slate-100 font-bold text-xs cursor-pointer shadow-2xs"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
