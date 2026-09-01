/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { 
  UserPlus, 
  Receipt, 
  ShieldCheck, 
  CheckCircle2, 
  AlertCircle, 
  BookOpen, 
  Award, 
  GraduationCap, 
  Printer, 
  ArrowRight,
  RotateCcw,
  Sparkles,
  Layers,
  Calendar
} from 'lucide-react';
import { StudentPaymentRecord, PaymentReceipt } from '../types';
import { 
  FEE_SCHEDULE, 
  formatCurrency, 
  calculateBalance, 
  calculateStatus, 
  getTodayDateString,
  getClassFeeSchedule
} from '../services/calculations';

interface AdmissionViewProps {
  currencySymbol: string;
  existingCount: number;
  students?: StudentPaymentRecord[];
  onAddStudent: (student: StudentPaymentRecord) => Promise<void> | void;
  onViewStudent?: (student: StudentPaymentRecord) => void;
  activeSchool?: import('../types').SchoolProfile;
}

const DEFAULT_FALLBACK_CLASSES = [
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

const TERM_OPTIONS = ['First Term', 'Second Term', 'Third Term'];

export const AdmissionView: React.FC<AdmissionViewProps> = ({
  currencySymbol,
  existingCount,
  students,
  onAddStudent,
  onViewStudent,
  activeSchool,
}) => {
  const classOptions = activeSchool?.classes && activeSchool.classes.length > 0
    ? activeSchool.classes
    : DEFAULT_FALLBACK_CLASSES;

  const initialClass = classOptions[0] || 'Primary 1';
  const initialSchedule = getClassFeeSchedule(activeSchool, initialClass);

  const [studentId, setStudentId] = useState<string>('');
  const [fullName, setFullName] = useState('');
  const [studentClass, setStudentClass] = useState(initialClass);
  const [term, setTerm] = useState('First Term');
  const [session, setSession] = useState('2025-2026');

  // Admission Fee
  const [admissionFee, setAdmissionFee] = useState<string>(String(initialSchedule.admissionFee));
  const [admissionPaid, setAdmissionPaid] = useState<string>(String(initialSchedule.admissionFee));

  // Exam Fee
  const [examFee, setExamFee] = useState<string>(String(initialSchedule.examFee));
  const [examPaid, setExamPaid] = useState<string>(String(initialSchedule.examFee));

  // School Fee (Tuition)
  const [schoolFee, setSchoolFee] = useState<string>(String(initialSchedule.tuitionFee));
  const [schoolPaid, setSchoolPaid] = useState<string>(String(initialSchedule.tuitionFee));

  // Lesson Fee (Optional)
  const [lessonOption, setLessonOption] = useState<'none' | '1_month' | '2_months' | 'termly' | 'custom'>('none');
  const [lessonFeeCustom, setLessonFeeCustom] = useState<string>('0');
  const [lessonPaid, setLessonPaid] = useState<string>('0');

  const handleClassChange = (newClass: string) => {
    setStudentClass(newClass);
    const sched = getClassFeeSchedule(activeSchool, newClass);
    setAdmissionFee(String(sched.admissionFee));
    setAdmissionPaid(String(sched.admissionFee));
    setExamFee(String(sched.examFee));
    setExamPaid(String(sched.examFee));
    setSchoolFee(String(sched.tuitionFee));
    setSchoolPaid(String(sched.tuitionFee));
    if (lessonOption === '1_month') {
      setLessonFeeCustom(String(sched.lessonFeeMonthly));
      setLessonPaid(String(sched.lessonFeeMonthly));
    } else if (lessonOption === '2_months') {
      setLessonFeeCustom(String(sched.lessonFeeMonthly * 2));
      setLessonPaid(String(sched.lessonFeeMonthly * 2));
    } else if (lessonOption === 'termly') {
      setLessonFeeCustom(String(sched.lessonFeeTermly));
      setLessonPaid(String(sched.lessonFeeTermly));
    }
  };

  const lastSchoolIdRef = React.useRef<string | undefined>(activeSchool?.id);

  // Update defaults when activeSchool actually changes (Leave student ID blank for manual filling)
  React.useEffect(() => {
    if (lastSchoolIdRef.current !== activeSchool?.id) {
      lastSchoolIdRef.current = activeSchool?.id;
      const cls = (activeSchool?.classes && activeSchool.classes.length > 0) ? activeSchool.classes[0] : (classOptions[0] || 'Primary 1');
      const sched = getClassFeeSchedule(activeSchool, cls);
      setStudentId('');
      setFullName('');
      setStudentClass(cls);
      setAdmissionFee(String(sched.admissionFee));
      setAdmissionPaid(String(sched.admissionFee));
      setExamFee(String(sched.examFee));
      setExamPaid(String(sched.examFee));
      setSchoolFee(String(sched.tuitionFee));
      setSchoolPaid(String(sched.tuitionFee));
      setLessonOption('none');
      setLessonFeeCustom('0');
      setLessonPaid('0');
      setReceiptNo('');
      setHasAgreedPayment(false);
      setErrorMessage(null);
    }
  }, [activeSchool?.id]);

  // Receipt & Payment Agreement
  const [receiptNo, setReceiptNo] = useState<string>('');
  const [hasAgreedPayment, setHasAgreedPayment] = useState<boolean>(false);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [enrolledStudent, setEnrolledStudent] = useState<StudentPaymentRecord | null>(null);

  // Derived values
  const currentFeeSchedule = getClassFeeSchedule(activeSchool, studentClass);
  const numAdmissionFee = Math.max(0, Number(admissionFee) || 0);
  const numAdmissionPaid = Math.max(0, Number(admissionPaid) || 0);

  const numExamFee = Math.max(0, Number(examFee) || 0);
  const numExamPaid = Math.max(0, Number(examPaid) || 0);

  const numSchoolFee = Math.max(0, Number(schoolFee) || 0);
  const numSchoolPaid = Math.max(0, Number(schoolPaid) || 0);

  let numLessonFee = 0;
  if (lessonOption === '1_month') numLessonFee = currentFeeSchedule.lessonFeeMonthly;
  else if (lessonOption === '2_months') numLessonFee = currentFeeSchedule.lessonFeeMonthly * 2;
  else if (lessonOption === 'termly') numLessonFee = currentFeeSchedule.lessonFeeTermly;
  else if (lessonOption === 'custom') numLessonFee = Math.max(0, Number(lessonFeeCustom) || 0);

  const numLessonPaid = Math.max(0, Number(lessonPaid) || 0);

  // Grand Total Fee Calculation
  const grandTotalFee = numSchoolFee + numAdmissionFee + numExamFee + numLessonFee;
  const grandTotalPaid = numSchoolPaid + numAdmissionPaid + numExamPaid + numLessonPaid;
  const grandTotalBalance = Math.max(0, grandTotalFee - grandTotalPaid);

  const resetForm = () => {
    setFullName('');
    setStudentClass(classOptions[0] || 'Primary 1');
    setTerm('First Term');
    setSession('2025-2026');
    setAdmissionFee(String(currentFeeSchedule.admissionFee));
    setAdmissionPaid(String(currentFeeSchedule.admissionFee));
    setExamFee(String(currentFeeSchedule.examFee));
    setExamPaid(String(currentFeeSchedule.examFee));
    setSchoolFee(String(currentFeeSchedule.tuitionFee));
    setSchoolPaid(String(currentFeeSchedule.tuitionFee));
    setLessonOption('none');
    setLessonFeeCustom('0');
    setLessonPaid('0');
    setReceiptNo('');
    setHasAgreedPayment(false);
    setErrorMessage(null);
    setEnrolledStudent(null);
  };

  const handleLessonOptionChange = (option: 'none' | '1_month' | '2_months' | 'termly' | 'custom') => {
    setLessonOption(option);
    if (option === 'none') {
      setLessonFeeCustom('0');
      setLessonPaid('0');
    } else if (option === '1_month') {
      setLessonFeeCustom(String(currentFeeSchedule.lessonFeeMonthly));
      setLessonPaid(String(currentFeeSchedule.lessonFeeMonthly));
    } else if (option === '2_months') {
      setLessonFeeCustom(String(currentFeeSchedule.lessonFeeMonthly * 2));
      setLessonPaid(String(currentFeeSchedule.lessonFeeMonthly * 2));
    } else if (option === 'termly') {
      setLessonFeeCustom(String(currentFeeSchedule.lessonFeeTermly));
      setLessonPaid(String(currentFeeSchedule.lessonFeeTermly));
    }
  };

  const handleQuickPayAll = () => {
    setAdmissionPaid(String(numAdmissionFee));
    setExamPaid(String(numExamFee));
    setSchoolPaid(String(numSchoolFee));
    setLessonPaid(String(numLessonFee));
    setHasAgreedPayment(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!studentId.trim()) {
      setErrorMessage('Please enter or verify the student ID.');
      return;
    }

    if (!fullName.trim()) {
      setErrorMessage('Please enter the student\'s full name.');
      return;
    }

    if (numAdmissionFee <= 0) {
      setErrorMessage('Admission fee amount cannot be 0 for new admissions.');
      return;
    }

    setIsSubmitting(true);

    try {
      // Statuses
      const schoolStatus = calculateStatus(numSchoolFee, numSchoolPaid);
      const overallStatus = calculateStatus(grandTotalFee, grandTotalPaid);

      let lessonMonths = 'Unpaid';
      if (numLessonPaid >= FEE_SCHEDULE.LESSON_FEE_TERMLY) {
        lessonMonths = 'Termly (Paid)';
      } else if (numLessonPaid >= FEE_SCHEDULE.LESSON_FEE_MONTHLY) {
        lessonMonths = `${Math.floor(numLessonPaid / FEE_SCHEDULE.LESSON_FEE_MONTHLY)} Mo Paid`;
      }

      const newRecord: StudentPaymentRecord = {
        id: studentId.trim(),
        full_name: fullName.trim(),
        class: studentClass,
        term,
        session,
        fee_amount: grandTotalFee,
        amount_paid: grandTotalPaid,
        balance: calculateBalance(grandTotalFee, grandTotalPaid),
        status: overallStatus,
        payment_date: getTodayDateString(),

        // Granular Fee Columns & Statuses
        tuition_fee: numSchoolFee,
        tuition_paid: numSchoolPaid,
        tuition_status: schoolStatus,

        admission_fee: numAdmissionFee,
        admission_paid: numAdmissionPaid,
        admission_status: numAdmissionPaid >= numAdmissionFee ? 'fully_paid' : numAdmissionPaid > 0 ? 'part_payment' : 'unpaid',
        is_new_admission: true,

        lesson_fee: numLessonFee,
        lesson_paid: numLessonPaid,
        lesson_status: numLessonPaid >= numLessonFee && numLessonFee > 0 ? 'fully_paid' : numLessonPaid > 0 ? 'part_payment' : 'unpaid',
        lesson_months: lessonMonths,

        exam_fee: numExamFee,
        exam_paid: numExamPaid,
        exam_status: numExamPaid >= numExamFee && numExamFee > 0 ? 'fully_paid' : numExamPaid > 0 ? 'part_payment' : 'unpaid',

        receipt_no: receiptNo.trim() || undefined,
      };

      await onAddStudent(newRecord);
      setEnrolledStudent(newRecord);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to complete admission.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePrint = () => {
    try {
      if (typeof window !== 'undefined' && typeof window.print === 'function') {
        window.print();
      }
    } catch (e) {
      console.warn('Print error:', e);
    }
  };

  // If successfully enrolled, show the completed admission view with receipt
  if (enrolledStudent) {
    return (
      <div className="flex-1 px-4 py-5 space-y-4 pb-28">
        <div className="bg-emerald-50 border border-emerald-200 rounded-3xl p-6 text-center space-y-4 shadow-sm">
          <div className="w-14 h-14 bg-emerald-600 text-white rounded-2xl flex items-center justify-center mx-auto shadow-md shadow-emerald-600/20">
            <CheckCircle2 className="w-7 h-7" />
          </div>
          <div>
            <span className="text-[10px] font-black tracking-wider uppercase text-emerald-800 bg-emerald-100/80 px-2.5 py-0.5 rounded-full border border-emerald-200">
              Admission Successful
            </span>
            <h2 className="text-xl font-black text-emerald-950 mt-1.5">
              {enrolledStudent.full_name}
            </h2>
            <p className="text-xs text-emerald-800 mt-0.5 font-mono">
              Student ID: <span className="font-bold text-emerald-950">{enrolledStudent.id}</span> • {enrolledStudent.class}
            </p>
          </div>

          {/* Admission Financial Summary Card */}
          <div className="bg-white rounded-2xl p-4 border border-emerald-100 text-left space-y-2.5 shadow-xs">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <span className="text-xs font-bold text-slate-600">Admission Fee:</span>
              <span className="text-xs font-black text-slate-900 font-mono">
                {formatCurrency(enrolledStudent.admission_fee ?? 4000, currencySymbol)} (Paid: {formatCurrency(enrolledStudent.admission_paid ?? 0, currencySymbol)})
              </span>
            </div>
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <span className="text-xs font-bold text-slate-600">School Fee (Tuition):</span>
              <span className="text-xs font-black text-slate-900 font-mono">
                {formatCurrency(enrolledStudent.fee_amount, currencySymbol)} (Paid: {formatCurrency(enrolledStudent.amount_paid, currencySymbol)})
              </span>
            </div>
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <span className="text-xs font-bold text-slate-600">Exam Fee:</span>
              <span className="text-xs font-black text-slate-900 font-mono">
                {formatCurrency(enrolledStudent.exam_fee ?? 1000, currencySymbol)} (Paid: {formatCurrency(enrolledStudent.exam_paid ?? 0, currencySymbol)})
              </span>
            </div>
            {enrolledStudent.lesson_fee && enrolledStudent.lesson_fee > 0 ? (
              <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                <span className="text-xs font-bold text-slate-600">Lesson Fee:</span>
                <span className="text-xs font-black text-slate-900 font-mono">
                  {formatCurrency(enrolledStudent.lesson_fee, currencySymbol)} (Paid: {formatCurrency(enrolledStudent.lesson_paid ?? 0, currencySymbol)})
                </span>
              </div>
            ) : null}
            {enrolledStudent.receipt_no && (
              <div className="flex items-center justify-between pt-1">
                <span className="text-xs font-bold text-slate-600">Receipt No (School Fee):</span>
                <span className="text-xs font-black text-blue-600 font-mono">
                  {enrolledStudent.receipt_no}
                </span>
              </div>
            )}
          </div>

          <div className="flex flex-col sm:flex-row gap-2 pt-2">
            <button
              onClick={handlePrint}
              id="print-admission-slip-btn"
              className="flex-1 py-3 px-4 rounded-2xl bg-white hover:bg-slate-50 text-slate-800 font-bold text-xs border border-slate-200 flex items-center justify-center gap-2 active:scale-98 transition-all shadow-xs"
            >
              <Printer className="w-4 h-4 text-slate-600" />
              <span>Print Slip</span>
            </button>
            <button
              onClick={resetForm}
              id="enrol-another-admission-btn"
              className="flex-1 py-3 px-4 rounded-2xl bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs flex items-center justify-center gap-2 active:scale-98 transition-all shadow-sm"
            >
              <UserPlus className="w-4 h-4" />
              <span>Enrol Another Student</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 px-4 py-4 space-y-4 pb-28 bg-slate-50/50">
      {/* Header Banner */}
      <div className="bg-gradient-to-br from-blue-700 via-blue-800 to-indigo-900 text-white rounded-3xl p-5 shadow-lg relative overflow-hidden">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-white/10 border border-white/20 flex items-center justify-center text-white shrink-0">
            <UserPlus className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-blue-500/30 text-blue-200 border border-blue-400/30">
                New Enrolment
              </span>
            </div>
            <h2 className="text-lg font-black tracking-tight text-white mt-0.5">
              New Student Admission
            </h2>
            <p className="text-xs text-blue-200/90 leading-tight">
              Enrol new admission with admission fee column, mandatory exam, and school fees.
            </p>
          </div>
        </div>
      </div>

      {errorMessage && (
        <div className="bg-rose-50 border border-rose-200 rounded-2xl p-3.5 flex items-start gap-2.5 text-xs text-rose-900">
          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
          <div className="flex-1 font-semibold">{errorMessage}</div>
        </div>
      )}

      {/* Main Admission Form */}
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Card 1: Student Bio */}
        <div className="bg-white rounded-3xl p-4 sm:p-5 border border-slate-200 shadow-xs space-y-3.5">
          <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
            <GraduationCap className="w-4 h-4 text-blue-600" />
            <h3 className="text-xs font-black text-slate-900 uppercase tracking-wider">
              Student Bio & Academic Info
            </h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-1">
              <div className="flex items-center justify-between mb-1">
                <label className="text-[11px] font-bold text-slate-700 uppercase block">
                  Student ID *
                </label>
                <span className="text-[9px] text-slate-500 font-semibold">Fill Manually</span>
              </div>
              <input
                type="text"
                id="admission-student-id"
                required
                value={studentId}
                onChange={(e) => setStudentId(e.target.value)}
                placeholder="Enter ID manually (e.g. DNPS/0171)"
                className="w-full px-3.5 py-2.5 text-xs font-mono font-bold bg-slate-50 rounded-xl border border-slate-200 text-slate-900 focus:ring-2 focus:ring-blue-600 focus:bg-white focus:outline-none transition-all"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="text-[11px] font-bold text-slate-700 uppercase block mb-1">
                Student Full Name *
              </label>
              <input
                type="text"
                id="admission-full-name"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="e.g. Adeleke Emmanuel"
                className="w-full px-3.5 py-2.5 text-xs font-bold bg-slate-50 rounded-xl border border-slate-200 text-slate-900 focus:ring-2 focus:ring-blue-600 focus:bg-white focus:outline-none transition-all placeholder:text-slate-400"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="text-[10px] font-bold text-slate-600 uppercase block mb-1">
                Class / Grade
              </label>
              <select
                id="admission-class-select"
                value={studentClass}
                onChange={(e) => handleClassChange(e.target.value)}
                className="w-full px-3 py-2 text-xs font-bold bg-slate-50 rounded-xl border border-slate-200 text-slate-900 focus:ring-2 focus:ring-blue-600 focus:outline-none"
              >
                {classOptions.map((cls) => (
                  <option key={cls} value={cls}>
                    {cls}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-[10px] font-bold text-slate-600 uppercase block mb-1">
                Academic Term
              </label>
              <select
                id="admission-term-select"
                value={term}
                onChange={(e) => setTerm(e.target.value)}
                className="w-full px-3 py-2 text-xs font-bold bg-slate-50 rounded-xl border border-slate-200 text-slate-900 focus:ring-2 focus:ring-blue-600 focus:outline-none"
              >
                {TERM_OPTIONS.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-[10px] font-bold text-slate-600 uppercase block mb-1">
                Academic Session
              </label>
              <input
                type="text"
                id="admission-session-input"
                value={session}
                onChange={(e) => setSession(e.target.value)}
                placeholder="2025-2026"
                className="w-full px-3 py-2 text-xs font-bold bg-slate-50 rounded-xl border border-slate-200 text-slate-900 focus:ring-2 focus:ring-blue-600 focus:outline-none"
              />
            </div>
          </div>
        </div>

        {/* Card 2: Section 1 - Admission Fee Column */}
        <div className="bg-white rounded-3xl p-4 sm:p-5 border border-slate-200 shadow-xs space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-slate-100">
            <div className="flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              <h3 className="text-xs font-black text-slate-900 uppercase tracking-wider">
                1. Admission Fee Column (admission_fee)
              </h3>
            </div>
            <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
              ₦4,000 Standard
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <span className="text-[10px] text-slate-500 uppercase font-bold block mb-1">
                Admission Fee ({currencySymbol})
              </span>
              <input
                type="number"
                min="0"
                id="admission-fee-amount"
                value={admissionFee}
                onChange={(e) => setAdmissionFee(e.target.value)}
                placeholder="4000"
                className="w-full px-3 py-2 text-xs font-bold bg-slate-50 rounded-xl border border-slate-200 text-slate-900 focus:ring-2 focus:ring-blue-600 focus:outline-none"
              />
            </div>
            <div>
              <span className="text-[10px] text-emerald-800 uppercase font-bold block mb-1">
                Amount Paid ({currencySymbol})
              </span>
              <input
                type="number"
                min="0"
                id="admission-fee-paid"
                value={admissionPaid}
                onChange={(e) => setAdmissionPaid(e.target.value)}
                placeholder="4000"
                className="w-full px-3 py-2 text-xs font-black bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-900 focus:ring-2 focus:ring-emerald-500 focus:outline-none"
              />
            </div>
          </div>
        </div>

        {/* Card 3: Section 2 - Exam Fee */}
        <div className="bg-white rounded-3xl p-4 sm:p-5 border border-slate-200 shadow-xs space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-slate-100">
            <div className="flex items-center gap-1.5">
              <Award className="w-4 h-4 text-amber-600" />
              <h3 className="text-xs font-black text-slate-900 uppercase tracking-wider">
                2. Exam Fee (exam_fee)
              </h3>
            </div>
            <span className="text-[10px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
              ₦1,000 Required
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <span className="text-[10px] text-slate-500 uppercase font-bold block mb-1">
                Exam Fee ({currencySymbol})
              </span>
              <input
                type="number"
                min="0"
                id="admission-exam-fee"
                value={examFee}
                onChange={(e) => setExamFee(e.target.value)}
                placeholder="1000"
                className="w-full px-3 py-2 text-xs font-bold bg-slate-50 rounded-xl border border-slate-200 text-slate-900 focus:ring-2 focus:ring-blue-600 focus:outline-none"
              />
            </div>
            <div>
              <span className="text-[10px] text-amber-800 uppercase font-bold block mb-1">
                Exam Paid ({currencySymbol})
              </span>
              <input
                type="number"
                min="0"
                id="admission-exam-paid"
                value={examPaid}
                onChange={(e) => setExamPaid(e.target.value)}
                placeholder="1000"
                className="w-full px-3 py-2 text-xs font-black bg-amber-50 border border-amber-200 rounded-xl text-amber-900 focus:ring-2 focus:ring-amber-500 focus:outline-none"
              />
            </div>
          </div>
        </div>

        {/* Card 4: Section 3 - School Fee (Tuition) */}
        <div className="bg-white rounded-3xl p-4 sm:p-5 border border-slate-200 shadow-xs space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-slate-100">
            <div className="flex items-center gap-1.5">
              <GraduationCap className="w-4 h-4 text-blue-600" />
              <h3 className="text-xs font-black text-slate-900 uppercase tracking-wider">
                3. School Fee / Tuition (fee_amount)
              </h3>
            </div>
            <span className="text-[10px] font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-200">
              ₦5,000 Standard
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <span className="text-[10px] text-slate-500 uppercase font-bold block mb-1">
                School Fee ({currencySymbol})
              </span>
              <input
                type="number"
                min="0"
                id="admission-school-fee"
                value={schoolFee}
                onChange={(e) => setSchoolFee(e.target.value)}
                placeholder="5000"
                className="w-full px-3 py-2 text-xs font-bold bg-slate-50 rounded-xl border border-slate-200 text-slate-900 focus:ring-2 focus:ring-blue-600 focus:outline-none"
              />
            </div>
            <div>
              <span className="text-[10px] text-blue-800 uppercase font-bold block mb-1">
                Amount Paid ({currencySymbol})
              </span>
              <input
                type="number"
                min="0"
                id="admission-school-paid"
                value={schoolPaid}
                onChange={(e) => setSchoolPaid(e.target.value)}
                placeholder="5000"
                className="w-full px-3 py-2 text-xs font-black bg-blue-50 border border-blue-200 rounded-xl text-blue-900 focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
            </div>
          </div>
        </div>

        {/* Card 5: Section 4 - Optional Lesson Fee */}
        <div className="bg-white rounded-3xl p-4 sm:p-5 border border-slate-200 shadow-xs space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-slate-100">
            <div className="flex items-center gap-1.5">
              <BookOpen className="w-4 h-4 text-emerald-600" />
              <h3 className="text-xs font-black text-slate-900 uppercase tracking-wider">
                4. Lesson Fee (Optional)
              </h3>
            </div>
            <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
              Optional Extra
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {[
              { id: 'none', label: 'No Lesson', fee: 0 },
              { id: '1_month', label: '1 Month', fee: 2000 },
              { id: '2_months', label: '2 Months', fee: 4000 },
              { id: 'termly', label: 'Full Term', fee: 6000 },
            ].map((item) => (
              <button
                type="button"
                key={item.id}
                onClick={() => handleLessonOptionChange(item.id as any)}
                className={`py-2 px-2.5 rounded-xl border text-center transition-all cursor-pointer ${
                  lessonOption === item.id
                    ? 'border-emerald-600 bg-emerald-50/80 text-emerald-950 font-bold shadow-xs'
                    : 'border-slate-200 bg-slate-50/60 text-slate-700 hover:bg-slate-100 text-xs'
                }`}
              >
                <div className="text-[11px] font-bold">{item.label}</div>
                <div className="text-[10px] text-slate-500 font-mono">
                  {item.fee > 0 ? formatCurrency(item.fee, currencySymbol) : '₦0'}
                </div>
              </button>
            ))}
          </div>

          {lessonOption !== 'none' && (
            <div className="grid grid-cols-2 gap-3 pt-2">
              <div>
                <span className="text-[10px] text-slate-500 uppercase font-bold block mb-1">
                  Lesson Fee ({currencySymbol})
                </span>
                <input
                  type="number"
                  min="0"
                  value={lessonFeeCustom}
                  onChange={(e) => setLessonFeeCustom(e.target.value)}
                  className="w-full px-3 py-2 text-xs font-bold bg-slate-50 rounded-xl border border-slate-200 text-slate-900"
                />
              </div>
              <div>
                <span className="text-[10px] text-emerald-800 uppercase font-bold block mb-1">
                  Lesson Paid ({currencySymbol})
                </span>
                <input
                  type="number"
                  min="0"
                  value={lessonPaid}
                  onChange={(e) => setLessonPaid(e.target.value)}
                  className="w-full px-3 py-2 text-xs font-black bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-900"
                />
              </div>
            </div>
          )}
        </div>

        {/* Card 6: Section 5 - Manual Receipt Number (for School Fee) */}
        <div className="bg-white rounded-3xl p-4 sm:p-5 border border-slate-200 shadow-xs space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <Receipt className="w-4 h-4 text-blue-600" />
              <label className="text-xs font-black text-slate-900 uppercase">
                Manual Receipt Number (School Fee)
              </label>
            </div>
            <span className="text-[9px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md">
              receipt_no column
            </span>
          </div>
          <p className="text-[10px] text-slate-500">
            Enter the manual receipt / physical slip number issued for this school fee payment.
          </p>
          <input
            type="text"
            id="admission-receipt-no"
            value={receiptNo}
            onChange={(e) => setReceiptNo(e.target.value)}
            placeholder="e.g. 004821 or Booklet Slip No. (leave blank if not yet issued)"
            className="w-full px-3.5 py-2.5 text-xs font-mono font-bold bg-slate-50 rounded-xl border border-slate-200 text-slate-900 focus:ring-2 focus:ring-blue-600 focus:bg-white focus:outline-none transition-all placeholder:text-slate-400 placeholder:font-sans"
          />
        </div>

        {/* Card 7: Grand Totals Summary & Quick Pay */}
        <div className="p-4 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-950 text-white rounded-3xl shadow-xl space-y-3.5">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-[10px] uppercase tracking-wider text-slate-400 font-bold block">
                Total Enrolment Package Fee
              </span>
              <p className="text-xl font-black font-mono text-white mt-0.5">
                {formatCurrency(grandTotalFee, currencySymbol)}
              </p>
            </div>
            <div className="text-right">
              <span className="text-[10px] uppercase tracking-wider text-slate-400 font-bold block">
                Total Paid Now
              </span>
              <p className="text-xl font-black font-mono text-emerald-400 mt-0.5">
                {formatCurrency(grandTotalPaid, currencySymbol)}
              </p>
            </div>
          </div>

          <div className="flex items-center justify-between text-xs pt-2 border-t border-slate-700/60 font-mono">
            <span className="text-slate-400">Total Outstanding Balance:</span>
            <span className={`font-black ${grandTotalBalance > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
              {formatCurrency(grandTotalBalance, currencySymbol)}
            </span>
          </div>

          <div className="pt-1 flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={handleQuickPayAll}
              className="text-[11px] font-bold text-blue-300 bg-blue-500/20 hover:bg-blue-500/30 px-3 py-1.5 rounded-xl border border-blue-400/30 flex items-center gap-1 active:scale-95 transition-all"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Mark All Paid in Full</span>
            </button>
            
            <label className="flex items-center gap-1.5 text-[11px] text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={hasAgreedPayment}
                onChange={(e) => setHasAgreedPayment(e.target.checked)}
                className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 focus:ring-offset-slate-900"
              />
              <span>Payment confirmed</span>
            </label>
          </div>
        </div>

        {/* Submit Button */}
        <button
          type="submit"
          disabled={isSubmitting || !fullName.trim()}
          id="submit-new-admission-btn"
          className="w-full py-4 px-6 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white font-black text-sm tracking-wide shadow-lg shadow-blue-600/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 active:scale-98 transition-all cursor-pointer"
        >
          {isSubmitting ? (
            <>
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              <span>Enrolling Student & Syncing Sheet...</span>
            </>
          ) : (
            <>
              <UserPlus className="w-5 h-5" />
              <span>Complete New Student Admission</span>
            </>
          )}
        </button>
      </form>
    </div>
  );
};
