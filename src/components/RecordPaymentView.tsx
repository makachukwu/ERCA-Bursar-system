/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect, useDeferredValue } from 'react';
import { 
  Search, 
  CreditCard, 
  CheckCircle2, 
  AlertCircle, 
  ArrowRight, 
  Receipt, 
  X, 
  Sparkles,
  Calendar,
  Wallet,
  Printer,
  Share2,
  RotateCcw,
  ShieldCheck,
  BookOpen,
  FileCheck2,
  GraduationCap,
  Coins,
  Edit3
} from 'lucide-react';
import { StudentPaymentRecord, PaymentReceipt } from '../types';
import { StatusBadge } from './StatusBadge';
import { 
  calculateBalance, 
  calculateStatus, 
  formatCurrency, 
  getTodayDateString,
  formatDate,
  deriveFeeBreakdown,
  getClassFeeSchedule,
  computeStudentLiveFees,
  ACADEMIC_MONTHS,
  FEE_SCHEDULE
} from '../services/calculations';
import { DGOSLogo, EminentLogo } from './DGOSLogo';
import { getStoredBranding } from '../services/brandingService';

interface RecordPaymentViewProps {
  students: StudentPaymentRecord[];
  currencySymbol: string;
  preselectedStudent?: StudentPaymentRecord | null;
  onClearPreselectedStudent: () => void;
  onSubmitPayment: (
    student: StudentPaymentRecord,
    paymentAmount: number,
    paymentMethod: string,
    feeCategory?: {
      categoryType?: 'tuition' | 'admission' | 'lesson' | 'exam' | 'custom';
      lessonMonth?: string;
      isPartPayment?: boolean;
      feeDescription?: string;
      receiptNumber?: string;
    }
  ) => Promise<PaymentReceipt>;
  onViewStudentInList: (student: StudentPaymentRecord) => void;
  onOpenAddStudent: () => void;
  activeSchool?: import('../types').SchoolProfile;
}

export const RecordPaymentView: React.FC<RecordPaymentViewProps> = ({
  students,
  currencySymbol,
  preselectedStudent,
  onClearPreselectedStudent,
  onSubmitPayment,
  onViewStudentInList,
  onOpenAddStudent,
  activeSchool,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStudent, setSelectedStudent] = useState<StudentPaymentRecord | null>(
    preselectedStudent || null
  );
  const [paymentAmount, setPaymentAmount] = useState<string>('');
  const [receiptNumber, setReceiptNumber] = useState<string>('');
  const [receiptError, setReceiptError] = useState<boolean>(false);
  const [paymentMethod, setPaymentMethod] = useState<string>('Cash / Bank Transfer');
  const [feeCategoryLabel, setFeeCategoryLabel] = useState<string>('Tuition Fee (Full Payment)');
  const [categoryType, setCategoryType] = useState<'tuition' | 'admission' | 'lesson' | 'exam' | 'custom'>('tuition');
  const [isPartPayment, setIsPartPayment] = useState<boolean>(false);
  const [selectedLessonMonth, setSelectedLessonMonth] = useState<string>('September');
  const [lessonOption, setLessonOption] = useState<'1_month' | 'termly'>('1_month');

  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [completedReceipt, setCompletedReceipt] = useState<PaymentReceipt | null>(null);

  const prevPreselectedIdRef = React.useRef<string | undefined>(undefined);

  // Sync if preselectedStudent prop actually changes
  useEffect(() => {
    if (preselectedStudent && preselectedStudent.id !== prevPreselectedIdRef.current) {
      prevPreselectedIdRef.current = preselectedStudent.id;
      setSelectedStudent(preselectedStudent);
      setSearchQuery('');
      setCompletedReceipt(null);
      setErrorMessage(null);
      setReceiptError(false);
      setReceiptNumber('');
      setShowConfirmModal(false);

      const breakdown = deriveFeeBreakdown(preselectedStudent, activeSchool);
      const tuitionDue = Math.max(0, breakdown.tuitionFee - breakdown.tuitionPaid);
      setCategoryType('tuition');
      setIsPartPayment(false);
      setPaymentAmount(String(tuitionDue > 0 ? tuitionDue : preselectedStudent.balance || 0));
      setFeeCategoryLabel('Tuition Fee (Full Payment)');
    } else if (!preselectedStudent) {
      prevPreselectedIdRef.current = undefined;
    }
  }, [preselectedStudent?.id]);

  // Autocomplete matching students with deferred value for instant input typing
  const deferredSearch = useDeferredValue(searchQuery);
  const matchingStudents = useMemo(() => {
    if (!students || !Array.isArray(students)) return [];
    if (!deferredSearch.trim()) return [];
    const q = deferredSearch.toLowerCase().trim();
    return students
      .filter(
        (s) =>
          (s?.full_name || '').toLowerCase().includes(q) ||
          (s?.id || '').toLowerCase().includes(q) ||
          (s?.class || '').toLowerCase().includes(q)
      )
      .slice(0, 6);
  }, [students, deferredSearch]);

  // Live resolved calculations for selected student
  const liveStudentFees = useMemo(() => {
    return selectedStudent ? computeStudentLiveFees(selectedStudent, activeSchool) : null;
  }, [selectedStudent, activeSchool]);

  const selectedClassSchedule = useMemo(() => {
    return getClassFeeSchedule(activeSchool, selectedStudent?.class);
  }, [activeSchool, selectedStudent?.class]);

  const studentBreakdown = liveStudentFees?.breakdown || null;

  // Numerical calculations for live preview
  const numAmount = Math.max(0, Number(paymentAmount) || 0);

  // Derive preview based on currently active category
  let previewFee = liveStudentFees?.breakdown.tuitionFee ?? (selectedStudent?.fee_amount || 0);
  let previewCurrentPaid = liveStudentFees?.breakdown.tuitionPaid ?? (selectedStudent?.amount_paid || 0);
  let previewNewPaid = previewCurrentPaid + numAmount;
  let previewNewBalance = calculateBalance(previewFee, previewNewPaid);
  let previewNewStatus = calculateStatus(previewFee, previewNewPaid);
  let previewCategoryName = 'School Fee (Tuition)';

  if (selectedStudent && studentBreakdown) {
    if (categoryType === 'admission') {
      previewCategoryName = 'Admission Fee (New Student)';
      previewFee = studentBreakdown.admissionFee > 0 ? studentBreakdown.admissionFee : selectedClassSchedule.admissionFee;
      previewCurrentPaid = studentBreakdown.admissionPaid;
      previewNewPaid = previewCurrentPaid + numAmount;
      previewNewBalance = Math.max(0, previewFee - previewNewPaid);
      previewNewStatus = calculateStatus(previewFee, previewNewPaid);
    } else if (categoryType === 'lesson') {
      previewCategoryName = 'Lesson Fee';
      previewFee = studentBreakdown.lessonFee > 0 ? studentBreakdown.lessonFee : selectedClassSchedule.lessonFeeMonthly;
      previewCurrentPaid = studentBreakdown.lessonPaid;
      previewNewPaid = previewCurrentPaid + numAmount;
      previewNewBalance = Math.max(0, previewFee - previewNewPaid);
      previewNewStatus = calculateStatus(previewFee, previewNewPaid);
    } else if (categoryType === 'exam') {
      previewCategoryName = 'Exam Fee';
      previewFee = studentBreakdown.examFee > 0 ? studentBreakdown.examFee : selectedClassSchedule.examFee;
      previewCurrentPaid = studentBreakdown.examPaid;
      previewNewPaid = previewCurrentPaid + numAmount;
      previewNewBalance = Math.max(0, previewFee - previewNewPaid);
      previewNewStatus = calculateStatus(previewFee, previewNewPaid);
    }
  }

  const newTotalPaid = previewNewPaid;
  const newCalculatedBalance = previewNewBalance;
  const newCalculatedStatus = previewNewStatus;

  // Check if current selection is a School Fee payment and whether it is a Full Payment
  const isSchoolFee = categoryType === 'tuition' || categoryType === 'custom';
  const isSchoolFeeFullPayment = isSchoolFee && (!isPartPayment || newCalculatedBalance <= 0 || newCalculatedStatus === 'fully_paid');

  const handleSelectStudent = (student: StudentPaymentRecord) => {
    setSelectedStudent(student);
    setSearchQuery('');
    setErrorMessage(null);
    setReceiptError(false);
    setReceiptNumber(student.receipt_no || '');

    const breakdown = deriveFeeBreakdown(student, activeSchool);
    const tuitionDue = Math.max(0, breakdown.tuitionFee - breakdown.tuitionPaid);
    setCategoryType('tuition');
    setIsPartPayment(false);
    setPaymentAmount(String(tuitionDue > 0 ? tuitionDue : student.balance || 0));
    setFeeCategoryLabel('School Fee (Full Payment)');
  };

  const handleClearStudent = () => {
    setSelectedStudent(null);
    setSearchQuery('');
    setPaymentAmount('');
    setReceiptNumber('');
    setReceiptError(false);
    setErrorMessage(null);
    setShowConfirmModal(false);
    onClearPreselectedStudent();
  };

  // Fee Selection Handlers
  const handleSelectTuitionFull = () => {
    if (!selectedStudent) return;
    const breakdown = deriveFeeBreakdown(selectedStudent, activeSchool);
    const tuitionDue = Math.max(0, breakdown.tuitionFee - breakdown.tuitionPaid);
    const amt = tuitionDue > 0 ? tuitionDue : selectedStudent.balance > 0 ? selectedStudent.balance : breakdown.tuitionFee;
    setCategoryType('tuition');
    setIsPartPayment(false);
    setPaymentAmount(String(amt));
    setFeeCategoryLabel(`School Fee (Full Payment - ${formatCurrency(amt, currencySymbol)})`);
    setErrorMessage(null);
    setReceiptError(false);
  };

  const handleSelectTuitionPart = (customPartAmount?: number) => {
    if (!selectedStudent) return;
    const breakdown = deriveFeeBreakdown(selectedStudent, activeSchool);
    const tuitionDue = Math.max(0, breakdown.tuitionFee - breakdown.tuitionPaid);
    const partAmt = customPartAmount !== undefined 
      ? customPartAmount 
      : tuitionDue > 0 ? Math.round(tuitionDue / 2) : 2500;

    setCategoryType('tuition');
    setIsPartPayment(true);
    setPaymentAmount(String(partAmt));
    setFeeCategoryLabel(`School Fee (Part Payment - ${formatCurrency(partAmt, currencySymbol)})`);
    setErrorMessage(null);
    setReceiptError(false);
  };

  const handleSelectLessonMonth = (monthName: string) => {
    const classSchedule = getClassFeeSchedule(activeSchool, selectedStudent?.class);
    const monthlyLessonAmt = classSchedule.lessonFeeMonthly || FEE_SCHEDULE.LESSON_FEE_MONTHLY;

    setSelectedLessonMonth(monthName);
    setLessonOption('1_month');
    setCategoryType('lesson');
    setIsPartPayment(false);
    setPaymentAmount(String(monthlyLessonAmt));
    setFeeCategoryLabel(`Lesson Fee - ${monthName} (${formatCurrency(monthlyLessonAmt, currencySymbol)})`);
    setErrorMessage(null);
    setReceiptError(false);
  };

  const handleSelectLessonTermly = () => {
    const classSchedule = getClassFeeSchedule(activeSchool, selectedStudent?.class);
    const termlyLessonAmt = classSchedule.lessonFeeTermly || FEE_SCHEDULE.LESSON_FEE_TERMLY;

    setLessonOption('termly');
    setCategoryType('lesson');
    setIsPartPayment(false);
    setPaymentAmount(String(termlyLessonAmt));
    setFeeCategoryLabel(`Lesson Fee - Full Term (${formatCurrency(termlyLessonAmt, currencySymbol)})`);
    setErrorMessage(null);
    setReceiptError(false);
  };

  const handleSelectExamFee = () => {
    if (!selectedStudent) return;
    const classSchedule = getClassFeeSchedule(activeSchool, selectedStudent.class);
    const defaultExam = classSchedule.examFee > 0 ? classSchedule.examFee : FEE_SCHEDULE.EXAM_FEE;
    const breakdown = deriveFeeBreakdown(selectedStudent, activeSchool);
    const examDue = Math.max(0, breakdown.examFee - breakdown.examPaid);
    const amt = examDue > 0 ? examDue : breakdown.examFee > 0 ? breakdown.examFee : defaultExam;
    setCategoryType('exam');
    setIsPartPayment(false);
    setPaymentAmount(String(amt));
    setFeeCategoryLabel(`Exam Fee (Full Payment - ${formatCurrency(amt, currencySymbol)})`);
    setErrorMessage(null);
    setReceiptError(false);
  };

  const handleSelectExamPart = (customPartAmount?: number) => {
    if (!selectedStudent) return;
    const classSchedule = getClassFeeSchedule(activeSchool, selectedStudent.class);
    const defaultExam = classSchedule.examFee > 0 ? classSchedule.examFee : FEE_SCHEDULE.EXAM_FEE;
    const breakdown = deriveFeeBreakdown(selectedStudent, activeSchool);
    const examDue = Math.max(0, breakdown.examFee - breakdown.examPaid);
    const defaultPart = examDue > 0 ? Math.round(examDue / 2) : Math.round(defaultExam / 2);
    const partAmt = customPartAmount !== undefined ? customPartAmount : defaultPart;

    setCategoryType('exam');
    setIsPartPayment(true);
    setPaymentAmount(String(partAmt));
    setFeeCategoryLabel(`Exam Fee (Part Payment - ${formatCurrency(partAmt, currencySymbol)})`);
    setErrorMessage(null);
    setReceiptError(false);
  };

  const handleSelectAdmissionFull = () => {
    if (!selectedStudent) return;
    const classSchedule = getClassFeeSchedule(activeSchool, selectedStudent.class);
    const defaultAdmission = classSchedule.admissionFee > 0 ? classSchedule.admissionFee : FEE_SCHEDULE.ADMISSION_FEE;
    const breakdown = deriveFeeBreakdown(selectedStudent, activeSchool);
    const admissionFeeAmt = breakdown.admissionFee > 0 ? breakdown.admissionFee : defaultAdmission;
    const admissionDue = Math.max(0, admissionFeeAmt - breakdown.admissionPaid);
    const amt = admissionDue > 0 ? admissionDue : admissionFeeAmt;

    setCategoryType('admission');
    setIsPartPayment(false);
    setPaymentAmount(String(amt));
    setFeeCategoryLabel(`Admission Fee (New Student - ${formatCurrency(amt, currencySymbol)})`);
    setErrorMessage(null);
    setReceiptError(false);
  };

  const handleSelectAdmissionPart = (customPartAmount?: number) => {
    if (!selectedStudent) return;
    const classSchedule = getClassFeeSchedule(activeSchool, selectedStudent.class);
    const defaultAdmission = classSchedule.admissionFee > 0 ? classSchedule.admissionFee : FEE_SCHEDULE.ADMISSION_FEE;
    const breakdown = deriveFeeBreakdown(selectedStudent, activeSchool);
    const admissionFeeAmt = breakdown.admissionFee > 0 ? breakdown.admissionFee : defaultAdmission;
    const admissionDue = Math.max(0, admissionFeeAmt - breakdown.admissionPaid);
    const defaultPart = admissionDue > 0 ? Math.round(admissionDue / 2) : Math.round(defaultAdmission / 2);
    const partAmt = customPartAmount !== undefined ? customPartAmount : defaultPart;

    setCategoryType('admission');
    setIsPartPayment(true);
    setPaymentAmount(String(partAmt));
    setFeeCategoryLabel(`Admission Fee (Part Payment - ${formatCurrency(partAmt, currencySymbol)})`);
    setErrorMessage(null);
    setReceiptError(false);
  };

  const handleSelectFullBalance = () => {
    if (!selectedStudent) return;
    setCategoryType('custom');
    setIsPartPayment(false);
    setPaymentAmount(String(selectedStudent.balance));
    setFeeCategoryLabel('Full Outstanding School Fee');
    setErrorMessage(null);
    setReceiptError(false);
  };

  // Open confirmation prompt before completing payment
  const handleOpenConfirmation = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setReceiptError(false);

    if (!selectedStudent) {
      setErrorMessage('Please search and select a student first.');
      return;
    }

    if (numAmount <= 0 || isNaN(numAmount)) {
      setErrorMessage('Please enter a valid payment amount greater than zero.');
      return;
    }

    // Validation: Require receipt number specifically for school fee full payments
    if (isSchoolFeeFullPayment && !receiptNumber.trim()) {
      setReceiptError(true);
      setErrorMessage('Receipt No. is required when recording a School Fee Full Payment. Please enter the receipt number before proceeding.');
      const input = document.getElementById('payment-receipt-no-input');
      if (input) {
        input.focus();
      }
      return;
    }

    setShowConfirmModal(true);
  };

  // Bursar confirms payment in modal
  const handleConfirmAndSubmit = async () => {
    if (!selectedStudent || numAmount <= 0) return;

    // Double check full school fee requirement
    if (isSchoolFeeFullPayment && !receiptNumber.trim()) {
      setReceiptError(true);
      setErrorMessage('Receipt No. is required for full School Fee payments.');
      setShowConfirmModal(false);
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const receipt = await onSubmitPayment(
        selectedStudent, 
        numAmount, 
        `${paymentMethod} (${feeCategoryLabel})`,
        {
          categoryType,
          lessonMonth: categoryType === 'lesson' 
            ? (lessonOption === 'termly' ? 'Termly (Paid)' : selectedLessonMonth)
            : undefined,
          isPartPayment,
          feeDescription: feeCategoryLabel,
          receiptNumber: receiptNumber.trim() || undefined,
        }
      );
      // Attach category to completed receipt
      receipt.feeItemDescription = feeCategoryLabel;
      receipt.feeCategory = categoryType === 'tuition' ? 'school_fee' : categoryType;
      setCompletedReceipt(receipt);
      setShowConfirmModal(false);
    } catch (err: any) {
      setErrorMessage(err.message || 'Payment submission failed. Check network or sheet connection.');
      setShowConfirmModal(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResetForNextPayment = () => {
    setCompletedReceipt(null);
    setSelectedStudent(null);
    setPaymentAmount('');
    setReceiptNumber('');
    setReceiptError(false);
    setFeeCategoryLabel('Tuition Fee (Full Payment)');
    setCategoryType('tuition');
    setIsPartPayment(false);
    setSearchQuery('');
    setErrorMessage(null);
    setShowConfirmModal(false);
    onClearPreselectedStudent();
  };

  const handlePrintReceipt = () => {
    try {
      if (typeof window !== 'undefined' && typeof window.print === 'function') {
        window.print();
      }
    } catch (e) {
      console.warn('Print action blocked or not supported in iframe context:', e);
    }
  };

  return (
    <div className="flex-1 pb-28 px-5 pt-4 space-y-4">
      {/* State A: Completed Payment Receipt Screen */}
      {completedReceipt ? (
        <div className="space-y-4">
          <div className="bg-[#dcfce7] border border-[#bbf7d0] rounded-3xl p-5 text-center space-y-2 animate-in fade-in zoom-in-95 duration-200">
            <div className="w-12 h-12 rounded-2xl bg-[#166534] text-white flex items-center justify-center mx-auto shadow-xs">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <h3 className="text-base font-black text-[#166534] uppercase tracking-tight">Payment Recorded Successfully</h3>
            <p className="text-xs text-[#166534]/90 font-medium">
              Updated Google Sheet with recalculated balance and status.
            </p>
          </div>

            {/* Printable Digital Receipt Card */}
          <div
            id="printable-receipt"
            className="bg-white rounded-3xl p-6 border border-[#f0f0f0] shadow-sm space-y-4 font-sans relative overflow-hidden"
          >
            <div className="flex justify-between items-start border-b border-[#f0f0f0] pb-3">
              <div className="flex items-start gap-3">
                <DGOSLogo size="sm" />
                <div>
                  <div className="flex items-center gap-1.5">
                    <p className="text-[10px] uppercase font-black text-[#2563eb] tracking-wider">Official Payment Receipt</p>
                    <span className="text-[10px] text-slate-500 font-bold truncate max-w-[200px]">
                      • {activeSchool?.name || getStoredBranding().appName}
                    </span>
                  </div>
                  <h4 className="text-base font-black text-[#1a1a1a]">{completedReceipt.studentName}</h4>
                  <p className="text-xs text-[#a0a0a0] font-mono">
                    #{completedReceipt.studentId} • {completedReceipt.studentClass}
                  </p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-xs font-mono font-bold text-[#1a1a1a]">{completedReceipt.receiptNumber || 'Official Record'}</p>
                <p className="text-[11px] text-[#a0a0a0]">{completedReceipt.paymentDate}</p>
              </div>
            </div>

            <div className="space-y-2 text-xs">
              <div className="flex justify-between py-1 border-b border-[#f0f0f0]">
                <span className="text-[#666]">Term / Session:</span>
                <span className="font-bold text-[#1a1a1a]">
                  {completedReceipt.term} {completedReceipt.session && `(${completedReceipt.session})`}
                </span>
              </div>
              {completedReceipt.feeItemDescription && (
                <div className="flex justify-between py-1 border-b border-[#f0f0f0]">
                  <span className="text-[#666]">Payment Purpose:</span>
                  <span className="font-bold text-[#2563eb]">{completedReceipt.feeItemDescription}</span>
                </div>
              )}
              <div className="flex justify-between py-1 border-b border-[#f0f0f0]">
                <span className="text-[#666]">Payment Channel:</span>
                <span className="font-bold text-[#1a1a1a]">{completedReceipt.paymentMethod}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-[#f0f0f0]">
                <span className="text-[#666]">
                  {completedReceipt.feeCategory === 'lesson' 
                    ? 'Lesson Fee Payable:' 
                    : completedReceipt.feeCategory === 'exam' 
                    ? 'Exam Fee Payable:' 
                    : 'School Fee Payable:'}
                </span>
                <span className="font-bold text-[#1a1a1a]">
                  {formatCurrency(completedReceipt.totalFee, currencySymbol)}
                </span>
              </div>
              <div className="flex justify-between py-2 border-b border-[#f0f0f0] bg-[#f4f4f7] px-3 rounded-2xl">
                <span className="font-bold text-[#1a1a1a]">Amount Paid Now:</span>
                <span className="font-black text-[#2563eb] text-sm">
                  {formatCurrency(completedReceipt.amountPaidNow, currencySymbol)}
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-[#f0f0f0]">
                <span className="text-[#666]">Total Cumulative Paid:</span>
                <span className="font-bold text-[#1a1a1a]">
                  {formatCurrency(completedReceipt.totalPaid, currencySymbol)}
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-[#f0f0f0]">
                <span className="text-[#666]">Remaining Balance:</span>
                <span
                  className={`font-bold ${
                    completedReceipt.remainingBalance > 0 ? 'text-[#ef4444]' : 'text-[#10b981]'
                  }`}
                >
                  {formatCurrency(completedReceipt.remainingBalance, currencySymbol)}
                </span>
              </div>
              <div className="flex justify-between py-1 items-center">
                <span className="text-[#666]">Current Status:</span>
                <StatusBadge status={completedReceipt.status} size="sm" />
              </div>
            </div>

            <div className="pt-2 text-[10px] text-center text-[#a0a0a0] border-t border-[#f0f0f0] space-y-0.5">
              <p>{getStoredBranding().receiptFooterText || 'Official payment record • Verified Bursary Access'}</p>
              <p className="text-[9px] text-slate-400 font-mono">Verified Bursary Access • {getTodayDateString()}</p>
            </div>
          </div>

          {/* Action Buttons for Receipt */}
          <div className="space-y-2 no-print">
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={handlePrintReceipt}
                id="print-receipt-btn"
                className="py-3 px-4 rounded-2xl bg-[#f4f4f7] text-[#1a1a1a] text-xs font-bold hover:bg-slate-200 active:scale-95 flex items-center justify-center gap-1.5 transition-all border border-[#eee]"
              >
                <Printer className="w-4 h-4" />
                <span>Print Receipt</span>
              </button>

              <button
                onClick={handleResetForNextPayment}
                id="record-another-payment-btn"
                className="py-3 px-4 rounded-2xl bg-[#2563eb] text-white text-xs font-black hover:bg-blue-700 active:scale-95 flex items-center justify-center gap-1.5 shadow-md shadow-blue-500/20 transition-all"
              >
                <CreditCard className="w-4 h-4" />
                <span>Record Next</span>
              </button>
            </div>

            {selectedStudent && (
              <button
                type="button"
                onClick={() => onViewStudentInList(selectedStudent)}
                className="w-full py-2.5 px-4 rounded-2xl bg-white border border-[#ddd] text-slate-700 text-xs font-bold hover:bg-slate-50 flex items-center justify-center gap-1.5 transition-all shadow-2xs"
              >
                <Edit3 className="w-3.5 h-3.5 text-blue-600" />
                <span>Edit Student Fees (Exam, Lesson, Tuition)</span>
              </button>
            )}
          </div>
        </div>
      ) : (
        /* State B: Payment Recording Form */
        <form onSubmit={handleOpenConfirmation} className="space-y-4">
          <div className="bg-white rounded-3xl p-5 border border-[#f0f0f0] shadow-xs space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-black uppercase tracking-wider text-[#1a1a1a]">Step 1: Select Student</h2>
              <span className="text-[10px] font-bold text-[#a0a0a0] uppercase">Required</span>
            </div>

            {/* If Student Selected */}
            {selectedStudent ? (
              <div className="bg-[#f4f4f7] rounded-2xl p-4 border border-[#eee] space-y-2 relative">
                <button
                  type="button"
                  onClick={handleClearStudent}
                  id="change-selected-student-btn"
                  className="absolute right-3 top-3 text-xs text-[#1a1a1a] hover:bg-slate-200 bg-white border border-[#eee] px-2.5 py-1 rounded-full font-bold shadow-2xs"
                >
                  Change
                </button>
                <div>
                  <span className="text-[10px] font-mono font-bold text-[#a0a0a0] uppercase">
                    #{selectedStudent.id}
                  </span>
                  <h3 className="text-base font-bold text-[#1a1a1a] pr-16">{selectedStudent.full_name}</h3>
                  <p className="text-xs text-[#666] mt-0.5">
                    {selectedStudent.class || 'No Class'} • {selectedStudent.term || 'No Term'}
                  </p>
                </div>

                {/* Financial Summary */}
                <div className="grid grid-cols-3 gap-2 text-center pt-2.5 border-t border-[#eee] text-xs">
                  <div>
                    <span className="text-[9px] text-[#a0a0a0] uppercase font-bold">Fee</span>
                    <p className="font-bold text-[#1a1a1a]">
                      {formatCurrency(liveStudentFees?.totalFee ?? selectedStudent.fee_amount, currencySymbol)}
                    </p>
                  </div>
                  <div>
                    <span className="text-[9px] text-[#a0a0a0] uppercase font-bold">Paid</span>
                    <p className="font-bold text-[#10b981]">
                      {formatCurrency(liveStudentFees?.amountPaid ?? selectedStudent.amount_paid, currencySymbol)}
                    </p>
                  </div>
                  <div>
                    <span className="text-[9px] text-[#a0a0a0] uppercase font-bold">Balance</span>
                    <p
                      className={`font-bold ${
                        (liveStudentFees?.balance ?? selectedStudent.balance) > 0 ? 'text-[#ef4444]' : 'text-[#10b981]'
                      }`}
                    >
                      {formatCurrency(liveStudentFees?.balance ?? selectedStudent.balance, currencySymbol)}
                    </p>
                  </div>
                </div>

                {/* Shortcut to view/edit student fee details */}
                <div className="pt-2 border-t border-[#eee] flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => onViewStudentInList(selectedStudent)}
                    className="text-[11px] font-bold text-[#2563eb] hover:text-blue-800 hover:underline flex items-center gap-1 transition-colors cursor-pointer"
                  >
                    <Edit3 className="w-3 h-3" />
                    <span>Edit Fees (Exam, Lesson, Tuition)</span>
                  </button>
                  <span className="text-[10px] text-[#a0a0a0]">
                    Editable after payment
                  </span>
                </div>
              </div>
            ) : (
              /* Student Search Box */
              <div className="space-y-2">
                <div className="relative">
                  <input
                    type="text"
                    id="payment-search-student-input"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search student..."
                    className="w-full bg-[#f4f4f7] border-none rounded-2xl py-3 pl-11 pr-9 text-sm text-[#1a1a1a] placeholder:text-[#a0a0a0] focus:ring-2 focus:ring-[#2563eb] focus:outline-none transition-all"
                  />
                  <Search className="w-4 h-4 text-[#a0a0a0] absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery('')}
                      id="clear-payment-search-btn"
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[#a0a0a0] hover:text-[#1a1a1a] p-0.5"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>

                {/* Autocomplete Dropdown List */}
                {matchingStudents.length > 0 && (
                  <div className="bg-white border border-[#f0f0f0] rounded-2xl shadow-lg divide-y divide-[#f0f0f0] overflow-hidden">
                    {matchingStudents.map((stu) => (
                      <button
                        key={stu.id}
                        type="button"
                        onClick={() => handleSelectStudent(stu)}
                        id={`select-stu-${stu.id}`}
                        className="w-full p-3 text-left hover:bg-[#f4f4f7] flex items-center justify-between gap-2 transition-colors"
                      >
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-[#1a1a1a] truncate">{stu.full_name}</p>
                          <p className="text-[10px] text-[#a0a0a0] font-mono">
                            #{stu.id} • {stu.class} • Balance: {formatCurrency(stu.balance, currencySymbol)}
                          </p>
                        </div>
                        <StatusBadge status={stu.status} size="sm" />
                      </button>
                    ))}
                  </div>
                )}

                {searchQuery.trim() && matchingStudents.length === 0 && (
                  <div className="p-3 text-center text-xs text-[#666] bg-[#f4f4f7] rounded-2xl border border-[#eee]">
                    No students match &quot;{searchQuery}&quot;.{' '}
                    <button
                      type="button"
                      onClick={onOpenAddStudent}
                      className="text-[#2563eb] font-bold underline"
                    >
                      Enroll as new student?
                    </button>
                  </div>
                )}

                {!searchQuery && students.length === 0 && (
                  <div className="p-3 text-center text-xs text-[#666] bg-[#f4f4f7] rounded-2xl">
                    No student records found in Google Sheet. Enroll students first.
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Step 2: Enter Payment Details (Enabled when student selected) */}
          <div
            className={`bg-white rounded-3xl p-5 border border-[#f0f0f0] shadow-xs space-y-4 transition-opacity ${
              !selectedStudent ? 'opacity-40 pointer-events-none' : 'opacity-100'
            }`}
          >
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-black uppercase tracking-wider text-[#1a1a1a]">Step 2: Choose Fee & Amount</h2>
              <span className="text-[10px] font-bold text-[#2563eb] uppercase">Step 2 of 2</span>
            </div>

            {/* Standard Fee Quick Presets */}
            {selectedStudent && (
              <div className="space-y-3">
                <label className="block text-[10px] font-black uppercase tracking-wider text-[#a0a0a0]">
                  Select Fee Category
                </label>

                {/* Primary Fee Category Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                  {/* 1. Tuition Fee (Full) */}
                  <button
                    type="button"
                    onClick={handleSelectTuitionFull}
                    id="preset-tuition-full-btn"
                    className={`p-3 rounded-2xl border text-left flex flex-col justify-between transition-all ${
                      categoryType === 'tuition' && !isPartPayment
                        ? 'bg-[#2563eb] text-white border-[#2563eb] shadow-xs'
                        : 'bg-[#f4f4f7] text-[#1a1a1a] border-[#eee] hover:bg-slate-200'
                    }`}
                  >
                    <div className="flex items-center justify-between w-full">
                      <span className="text-[10px] uppercase font-bold tracking-tight opacity-80">Tuition (Full)</span>
                      <GraduationCap className="w-4 h-4 opacity-70" />
                    </div>
                    <p className="text-xs font-black mt-1.5 truncate">
                      {formatCurrency(
                        Math.max(0, (studentBreakdown?.tuitionFee || 0) - (studentBreakdown?.tuitionPaid || 0)) || selectedStudent.balance, 
                        currencySymbol
                      )}
                    </p>
                  </button>

                  {/* 2. Tuition Fee (Part Payment) */}
                  <button
                    type="button"
                    onClick={() => handleSelectTuitionPart()}
                    id="preset-tuition-part-btn"
                    className={`p-3 rounded-2xl border text-left flex flex-col justify-between transition-all ${
                      categoryType === 'tuition' && isPartPayment
                        ? 'bg-[#2563eb] text-white border-[#2563eb] shadow-xs'
                        : 'bg-[#f4f4f7] text-[#1a1a1a] border-[#eee] hover:bg-slate-200'
                    }`}
                  >
                    <div className="flex items-center justify-between w-full">
                      <span className="text-[10px] uppercase font-bold tracking-tight opacity-80">Tuition (Part)</span>
                      <Coins className="w-4 h-4 opacity-70" />
                    </div>
                    <p className="text-xs font-black mt-1.5">
                      Part Payment
                    </p>
                  </button>

                  {/* 3. Admission Fee (Only New Students) */}
                  <button
                    type="button"
                    onClick={handleSelectAdmissionFull}
                    id="preset-admission-fee-btn"
                    className={`p-3 rounded-2xl border text-left flex flex-col justify-between transition-all ${
                      categoryType === 'admission'
                        ? 'bg-[#2563eb] text-white border-[#2563eb] shadow-xs'
                        : 'bg-[#f4f4f7] text-[#1a1a1a] border-[#eee] hover:bg-slate-200'
                    }`}
                  >
                    <div className="flex items-center justify-between w-full">
                      <span className="text-[10px] uppercase font-bold tracking-tight opacity-80">Admission (New)</span>
                      <ShieldCheck className="w-4 h-4 opacity-70" />
                    </div>
                    <p className="text-xs font-black mt-1.5">
                      {formatCurrency(
                        studentBreakdown?.admissionFee || selectedClassSchedule.admissionFee, 
                        currencySymbol
                      )}
                    </p>
                  </button>

                  {/* 4. Lesson Fee */}
                  <button
                    type="button"
                    onClick={() => handleSelectLessonMonth(selectedLessonMonth || 'September')}
                    id="preset-lesson-btn"
                    className={`p-3 rounded-2xl border text-left flex flex-col justify-between transition-all ${
                      categoryType === 'lesson'
                        ? 'bg-[#2563eb] text-white border-[#2563eb] shadow-xs'
                        : 'bg-[#f4f4f7] text-[#1a1a1a] border-[#eee] hover:bg-slate-200'
                    }`}
                  >
                    <div className="flex items-center justify-between w-full">
                      <span className="text-[10px] uppercase font-bold tracking-tight opacity-80">Lesson Fee</span>
                      <BookOpen className="w-4 h-4 opacity-70" />
                    </div>
                    <p className="text-xs font-black mt-1.5">
                      {formatCurrency(selectedClassSchedule.lessonFeeMonthly, currencySymbol)}/mo • {formatCurrency(selectedClassSchedule.lessonFeeTermly, currencySymbol)}/term
                    </p>
                  </button>

                  {/* 5. Exam Fee */}
                  <button
                    type="button"
                    onClick={handleSelectExamFee}
                    id="preset-exam-fee-btn"
                    className={`p-3 rounded-2xl border text-left flex flex-col justify-between transition-all ${
                      categoryType === 'exam'
                        ? 'bg-[#2563eb] text-white border-[#2563eb] shadow-xs'
                        : 'bg-[#f4f4f7] text-[#1a1a1a] border-[#eee] hover:bg-slate-200'
                    }`}
                  >
                    <div className="flex items-center justify-between w-full">
                      <span className="text-[10px] uppercase font-bold tracking-tight opacity-80">Exam Fee</span>
                      <FileCheck2 className="w-4 h-4 opacity-70" />
                    </div>
                    <p className="text-xs font-black mt-1.5">
                      {formatCurrency(selectedClassSchedule.examFee, currencySymbol)}
                    </p>
                  </button>
                </div>

                {/* Sub-Panel: If Tuition Part Payment selected */}
                {categoryType === 'tuition' && isPartPayment && (
                  <div className="p-3.5 bg-blue-50/70 border border-blue-200 rounded-2xl space-y-2 animate-in fade-in duration-150">
                    <p className="text-[10px] font-bold text-blue-900 uppercase">
                      Quick School Fee Part Payment Presets:
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {selectedStudent.balance > 1000 && (
                        <button
                          type="button"
                          onClick={() => handleSelectTuitionPart(Math.round(selectedStudent.balance / 2))}
                          id="tuition-part-50-btn"
                          className="px-2.5 py-1 text-xs font-bold rounded-lg bg-white border border-blue-200 text-blue-900 hover:bg-blue-100"
                        >
                          50% Balance ({formatCurrency(Math.round(selectedStudent.balance / 2), currencySymbol)})
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => handleSelectTuitionPart(1000)}
                        id="tuition-part-1k-btn"
                        className="px-2.5 py-1 text-xs font-bold rounded-lg bg-white border border-blue-200 text-blue-900 hover:bg-blue-100"
                      >
                        +₦1,000
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSelectTuitionPart(2000)}
                        id="tuition-part-2k-btn"
                        className="px-2.5 py-1 text-xs font-bold rounded-lg bg-white border border-blue-200 text-blue-900 hover:bg-blue-100"
                      >
                        +₦2,000
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSelectTuitionPart(2500)}
                        id="tuition-part-2500-btn"
                        className="px-2.5 py-1 text-xs font-bold rounded-lg bg-white border border-blue-200 text-blue-900 hover:bg-blue-100"
                      >
                        +₦2,500
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSelectTuitionPart(3000)}
                        id="tuition-part-3k-btn"
                        className="px-2.5 py-1 text-xs font-bold rounded-lg bg-white border border-blue-200 text-blue-900 hover:bg-blue-100"
                      >
                        +₦3,000
                      </button>
                    </div>
                  </div>
                )}

                {/* Sub-Panel: If Admission Fee selected -> Full or Part Payment */}
                {categoryType === 'admission' && (
                  <div className="p-3.5 bg-blue-50/70 border border-blue-200 rounded-2xl space-y-2.5 animate-in fade-in duration-150">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold text-blue-900 uppercase">
                        Admission Fee Options (Only New Students):
                      </span>
                      {(() => {
                        const breakdown = deriveFeeBreakdown(selectedStudent, activeSchool);
                        const classSched = getClassFeeSchedule(activeSchool, selectedStudent.class);
                        const admissionFeeAmt = breakdown.admissionFee > 0 
                          ? breakdown.admissionFee 
                          : (classSched.admissionFee || FEE_SCHEDULE.ADMISSION_FEE);
                        const admissionDue = Math.max(0, admissionFeeAmt - breakdown.admissionPaid);
                        return (
                          <span className="text-[10px] font-semibold text-blue-700">
                            Fee: {formatCurrency(admissionFeeAmt, currencySymbol)} • Paid: {formatCurrency(breakdown.admissionPaid, currencySymbol)}
                            {admissionDue > 0 ? ` (Due: ${formatCurrency(admissionDue, currencySymbol)})` : ' (Fully Paid)'}
                          </span>
                        );
                      })()}
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={handleSelectAdmissionFull}
                        id="admission-full-payment-btn"
                        className={`px-3 py-1.5 text-xs font-bold rounded-xl transition-all border ${
                          !isPartPayment
                            ? 'bg-[#2563eb] text-white border-[#2563eb]'
                            : 'bg-white text-[#1a1a1a] border-blue-200 hover:bg-blue-100'
                        }`}
                      >
                        Full Admission ({(() => {
                          const bd = deriveFeeBreakdown(selectedStudent, activeSchool);
                          const classSched = getClassFeeSchedule(activeSchool, selectedStudent.class);
                          const defaultAdm = classSched.admissionFee || FEE_SCHEDULE.ADMISSION_FEE;
                          const effectiveAdm = bd.admissionFee > 0 ? bd.admissionFee : defaultAdm;
                          const admDue = Math.max(0, effectiveAdm - bd.admissionPaid);
                          return formatCurrency(admDue > 0 ? admDue : effectiveAdm, currencySymbol);
                        })()})
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSelectAdmissionPart()}
                        id="admission-part-payment-btn"
                        className={`px-3 py-1.5 text-xs font-bold rounded-xl transition-all border ${
                          isPartPayment
                            ? 'bg-[#2563eb] text-white border-[#2563eb]'
                            : 'bg-white text-[#1a1a1a] border-blue-200 hover:bg-blue-100'
                        }`}
                      >
                        Part Payment
                      </button>
                    </div>

                    {isPartPayment && (
                      <div className="space-y-1.5 pt-1">
                        <span className="text-[10px] text-blue-800 font-semibold block">
                          Admission Fee Installment Presets:
                        </span>
                        <div className="flex flex-wrap gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleSelectAdmissionPart(1000)}
                            id="admission-part-1k-btn"
                            className="px-2.5 py-1 text-xs font-bold rounded-lg bg-white border border-blue-200 text-blue-900 hover:bg-blue-100"
                          >
                            ₦1,000
                          </button>
                          <button
                            type="button"
                            onClick={() => handleSelectAdmissionPart(2000)}
                            id="admission-part-2k-btn"
                            className="px-2.5 py-1 text-xs font-bold rounded-lg bg-white border border-blue-200 text-blue-900 hover:bg-blue-100"
                          >
                            ₦2,000 (50%)
                          </button>
                          <button
                            type="button"
                            onClick={() => handleSelectAdmissionPart(3000)}
                            id="admission-part-3k-btn"
                            className="px-2.5 py-1 text-xs font-bold rounded-lg bg-white border border-blue-200 text-blue-900 hover:bg-blue-100"
                          >
                            ₦3,000
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Sub-Panel: If Lesson Fee selected -> Indicate Month / Term */}
                {categoryType === 'lesson' && (
                  <div className="p-3.5 bg-blue-50/70 border border-blue-200 rounded-2xl space-y-2.5 animate-in fade-in duration-150">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold text-blue-900 uppercase">
                        Lesson Duration & Month Selection:
                      </span>
                      <span className="text-[10px] font-semibold text-blue-700">
                        {formatCurrency(selectedClassSchedule.lessonFeeMonthly, currencySymbol)} / month or {formatCurrency(selectedClassSchedule.lessonFeeTermly, currencySymbol)} / term
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleSelectLessonMonth(selectedLessonMonth)}
                        className={`px-3 py-1.5 text-xs font-bold rounded-xl transition-all border ${
                          lessonOption === '1_month'
                            ? 'bg-[#2563eb] text-white border-[#2563eb]'
                            : 'bg-white text-[#1a1a1a] border-blue-200 hover:bg-blue-100'
                        }`}
                      >
                        1 Month ({formatCurrency(selectedClassSchedule.lessonFeeMonthly, currencySymbol)})
                      </button>
                      <button
                        type="button"
                        onClick={handleSelectLessonTermly}
                        className={`px-3 py-1.5 text-xs font-bold rounded-xl transition-all border ${
                          lessonOption === 'termly'
                            ? 'bg-[#2563eb] text-white border-[#2563eb]'
                            : 'bg-white text-[#1a1a1a] border-blue-200 hover:bg-blue-100'
                        }`}
                      >
                        Complete Term ({formatCurrency(selectedClassSchedule.lessonFeeTermly, currencySymbol)})
                      </button>
                    </div>

                    {/* Month Chips for 1 Month selection */}
                    {lessonOption === '1_month' && (
                      <div className="space-y-1.5 pt-1">
                        <span className="text-[10px] text-blue-800 font-semibold block">
                          Indicate which month the student is paying for:
                        </span>
                        <div className="grid grid-cols-3 sm:grid-cols-4 gap-1.5">
                          {ACADEMIC_MONTHS.map((month) => (
                            <button
                              key={month}
                              type="button"
                              onClick={() => handleSelectLessonMonth(month)}
                              id={`lesson-month-${month.toLowerCase()}-btn`}
                              className={`py-1.5 px-2 rounded-lg text-xs font-bold border transition-all text-center ${
                                selectedLessonMonth === month
                                  ? 'bg-[#2563eb] text-white border-[#2563eb] shadow-xs'
                                  : 'bg-white text-[#333] border-blue-200 hover:bg-blue-100'
                              }`}
                            >
                              {month}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Sub-Panel: If Exam Fee selected -> Full Payment or Part Payment */}
                {categoryType === 'exam' && (
                  <div className="p-3.5 bg-blue-50/70 border border-blue-200 rounded-2xl space-y-2.5 animate-in fade-in duration-150">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold text-blue-900 uppercase">
                        Exam Fee Payment Options:
                      </span>
                      {(() => {
                        const breakdown = deriveFeeBreakdown(selectedStudent, activeSchool);
                        const examDue = Math.max(0, breakdown.examFee - breakdown.examPaid);
                        return (
                          <span className="text-[10px] font-semibold text-blue-700">
                            Fee: {formatCurrency(breakdown.examFee, currencySymbol)} • Paid: {formatCurrency(breakdown.examPaid, currencySymbol)}
                            {examDue > 0 ? ` (Due: ${formatCurrency(examDue, currencySymbol)})` : ' (Fully Paid)'}
                          </span>
                        );
                      })()}
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={handleSelectExamFee}
                        id="exam-full-payment-toggle-btn"
                        className={`px-3 py-1.5 text-xs font-bold rounded-xl transition-all border ${
                          !isPartPayment
                            ? 'bg-[#2563eb] text-white border-[#2563eb]'
                            : 'bg-white text-[#1a1a1a] border-blue-200 hover:bg-blue-100'
                        }`}
                      >
                        Full Exam Fee ({(() => {
                          const bd = deriveFeeBreakdown(selectedStudent, activeSchool);
                          const classSched = getClassFeeSchedule(activeSchool, selectedStudent.class);
                          const defaultExam = classSched.examFee || FEE_SCHEDULE.EXAM_FEE;
                          const effectiveExam = bd.examFee > 0 ? bd.examFee : defaultExam;
                          const examDue = Math.max(0, effectiveExam - bd.examPaid);
                          return formatCurrency(examDue > 0 ? examDue : effectiveExam, currencySymbol);
                        })()})
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSelectExamPart()}
                        id="exam-part-payment-toggle-btn"
                        className={`px-3 py-1.5 text-xs font-bold rounded-xl transition-all border ${
                          isPartPayment
                            ? 'bg-[#2563eb] text-white border-[#2563eb]'
                            : 'bg-white text-[#1a1a1a] border-blue-200 hover:bg-blue-100'
                        }`}
                      >
                        Part Payment (Installment)
                      </button>
                    </div>

                    {/* Part Payment Preset Quick Chips */}
                    {isPartPayment && (
                      <div className="space-y-1.5 pt-1">
                        <span className="text-[10px] text-blue-800 font-semibold block">
                          Choose quick Exam part payment installment amount:
                        </span>
                        <div className="flex flex-wrap gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleSelectExamPart(500)}
                            id="exam-part-500-btn"
                            className="px-2.5 py-1 text-xs font-bold rounded-lg bg-white border border-blue-200 text-blue-900 hover:bg-blue-100"
                          >
                            +₦500 (50%)
                          </button>
                          <button
                            type="button"
                            onClick={() => handleSelectExamPart(300)}
                            id="exam-part-300-btn"
                            className="px-2.5 py-1 text-xs font-bold rounded-lg bg-white border border-blue-200 text-blue-900 hover:bg-blue-100"
                          >
                            +₦300
                          </button>
                          <button
                            type="button"
                            onClick={() => handleSelectExamPart(200)}
                            id="exam-part-200-btn"
                            className="px-2.5 py-1 text-xs font-bold rounded-lg bg-white border border-blue-200 text-blue-900 hover:bg-blue-100"
                          >
                            +₦200
                          </button>
                          <button
                            type="button"
                            onClick={() => handleSelectExamPart(100)}
                            id="exam-part-100-btn"
                            className="px-2.5 py-1 text-xs font-bold rounded-lg bg-white border border-blue-200 text-blue-900 hover:bg-blue-100"
                          >
                            +₦100
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            <div className="pt-1">
              <label className="block text-[10px] font-black uppercase tracking-wider text-[#a0a0a0] mb-1">
                Payment Amount ({currencySymbol})
              </label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 font-black text-[#a0a0a0] text-lg">
                  {currencySymbol}
                </span>
                <input
                  type="number"
                  min="1"
                  step="any"
                  id="payment-amount-input"
                  value={paymentAmount}
                  onChange={(e) => {
                    setPaymentAmount(e.target.value);
                    setFeeCategoryLabel('Custom Fee Payment');
                    setCategoryType('custom');
                  }}
                  placeholder="0.00"
                  disabled={!selectedStudent}
                  className="w-full pl-9 pr-4 py-3 bg-[#f4f4f7] rounded-2xl border-none text-xl font-black text-[#1a1a1a] placeholder:text-[#a0a0a0] focus:ring-2 focus:ring-[#2563eb] focus:outline-none transition-all"
                />
              </div>

              {/* Full Balance Alternative */}
              {selectedStudent && selectedStudent.balance > 0 && (
                <div className="mt-2 flex items-center justify-between">
                  <button
                    type="button"
                    onClick={handleSelectFullBalance}
                    id="preset-full-balance-btn"
                    className="text-xs font-semibold px-3 py-1 rounded-full bg-[#f4f4f7] text-[#666] hover:bg-slate-200 border border-[#eee] transition-all"
                  >
                    Pay Full Balance ({formatCurrency(selectedStudent.balance, currencySymbol)})
                  </button>
                </div>
              )}
            </div>

            {/* Purpose & Channel */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
              <div>
                <label className="block text-[10px] font-black uppercase tracking-wider text-[#a0a0a0] mb-1">
                  Payment Purpose / Fee Label
                </label>
                <input
                  type="text"
                  id="payment-purpose-input"
                  value={feeCategoryLabel}
                  onChange={(e) => setFeeCategoryLabel(e.target.value)}
                  placeholder="e.g. Tuition Fee / Lesson Fee / Exam Fee"
                  className="w-full bg-[#f4f4f7] rounded-2xl border border-[#eee] px-3.5 py-2.5 text-xs font-semibold text-[#1a1a1a] focus:ring-2 focus:ring-[#2563eb] focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-[10px] font-black uppercase tracking-wider text-[#a0a0a0] mb-1">
                  Payment Channel
                </label>
                <select
                  id="payment-method-select"
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                  className="w-full bg-[#f4f4f7] rounded-2xl border border-[#eee] px-3.5 py-2.5 text-xs font-semibold text-[#1a1a1a] focus:ring-2 focus:ring-[#2563eb] focus:outline-none"
                >
                  <option value="Cash / Direct Bank Transfer">Cash / Direct Bank Transfer</option>
                  <option value="POS / Debit Card">POS / Debit Card</option>
                  <option value="Bank Deposit / Teller">Bank Deposit / Teller</option>
                  <option value="Cheque / Draft">Cheque / Draft</option>
                  <option value="Online Portal">Online Portal</option>
                </select>
              </div>
            </div>

            {/* Dedicated Slot for Receipt No (Required for School Fee Full Payment, Optional for Part Payment) */}
            <div className="pt-1">
              <div className="flex items-center justify-between mb-1.5">
                <label
                  htmlFor="payment-receipt-no-input"
                  className="text-[10px] font-black uppercase tracking-wider text-[#1a1a1a] flex items-center gap-1.5"
                >
                  <Receipt className={`w-3.5 h-3.5 ${isSchoolFeeFullPayment ? 'text-[#2563eb]' : 'text-slate-500'}`} />
                  <span>
                    Receipt No.
                    {isSchoolFeeFullPayment && <span className="text-rose-600 font-black ml-0.5">*</span>}
                  </span>
                </label>
                {isSchoolFeeFullPayment ? (
                  <span className="text-[9px] font-black tracking-wider uppercase px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 border border-rose-200 shadow-2xs">
                    Required for Full Payment
                  </span>
                ) : (
                  <span className="text-[9px] font-bold tracking-wider uppercase px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
                    Optional for Part Payment
                  </span>
                )}
              </div>

              <div className="relative">
                <input
                  type="text"
                  id="payment-receipt-no-input"
                  value={receiptNumber}
                  onChange={(e) => {
                    setReceiptNumber(e.target.value);
                    if (receiptError) setReceiptError(false);
                    if (errorMessage) setErrorMessage(null);
                  }}
                  placeholder={
                    isSchoolFeeFullPayment
                      ? "Enter official physical receipt number (e.g. 004821 or booklet no.)"
                      : "Enter manual receipt number (e.g. 004821 or booklet no.)"
                  }
                  className={`w-full rounded-2xl border px-3.5 py-3 text-xs font-mono font-bold text-[#1a1a1a] focus:ring-2 focus:outline-none transition-all placeholder:font-sans ${
                    receiptError
                      ? 'border-rose-400 bg-rose-50/70 focus:ring-rose-400 text-rose-950 placeholder:text-rose-400'
                      : isSchoolFeeFullPayment && !receiptNumber.trim()
                      ? 'border-amber-300 bg-amber-50/40 focus:ring-[#2563eb]'
                      : 'border-[#eee] bg-[#f4f4f7] focus:ring-[#2563eb]'
                  }`}
                />
              </div>

              <div className="text-[11px] mt-1.5 flex items-center gap-1.5">
                {isSchoolFeeFullPayment ? (
                  <p className="text-[#666] flex items-center gap-1">
                    <ShieldCheck className="w-3.5 h-3.5 text-[#2563eb] shrink-0" />
                    <span>School fee paid in full: Enter manual receipt number to save on the receipt number column.</span>
                  </p>
                ) : (
                  <p className="text-[#888]">
                    Manual receipt number will be stored in the receipt number column for school fee.
                  </p>
                )}
              </div>
            </div>

            {/* Live Recalculation Preview Card */}
            {selectedStudent && numAmount > 0 && (
              <div className="p-4 bg-[#2563eb] rounded-2xl text-white space-y-2 shadow-md shadow-blue-500/10">
                <div className="flex justify-between items-center text-white/80 text-[10px] font-bold uppercase tracking-wider">
                  <span>{previewCategoryName} Impact:</span>
                  <span>Date: {getTodayDateString()}</span>
                </div>
                <div className="grid grid-cols-2 gap-2 pt-1 border-t border-white/20 font-mono">
                  <div>
                    <span className="text-[9px] text-white/80 uppercase">New {previewCategoryName} Paid</span>
                    <p className="text-sm font-black text-white">
                      {formatCurrency(newTotalPaid, currencySymbol)}
                    </p>
                  </div>
                  <div>
                    <span className="text-[9px] text-white/80 uppercase">Remaining Due</span>
                    <p className="text-sm font-black text-amber-200">
                      {formatCurrency(newCalculatedBalance, currencySymbol)}
                    </p>
                  </div>
                </div>
                <div className="flex justify-between items-center pt-2 border-t border-white/20">
                  <span className="text-xs font-bold text-white/90">Category Status:</span>
                  <StatusBadge status={newCalculatedStatus} size="sm" />
                </div>
              </div>
            )}
          </div>

          {errorMessage && (
            <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl text-xs text-rose-900 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Trigger Confirmation Prompt */}
          <button
            type="submit"
            disabled={!selectedStudent || numAmount <= 0 || isSubmitting}
            id="proceed-to-payment-confirm-btn"
            className="w-full py-4 px-4 rounded-2xl bg-[#2563eb] text-white font-black text-sm hover:bg-blue-700 active:scale-[0.99] disabled:opacity-50 transition-all flex items-center justify-center gap-2 shadow-lg shadow-blue-500/20"
          >
            <CreditCard className="w-4 h-4" />
            <span>Review & Record Payment</span>
          </button>
        </form>
      )}

      {/* Confirmation Prompt Modal */}
      {showConfirmModal && selectedStudent && (
        <div 
          className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/70 backdrop-blur-xs animate-in fade-in duration-150"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-lg bg-white rounded-t-[28px] sm:rounded-3xl max-h-[90dvh] sm:max-h-[90vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden animate-in slide-in-from-bottom duration-200">
            {/* Header */}
            <div className="shrink-0 flex items-center justify-between px-5 py-3.5 sm:px-6 sm:py-4 border-b border-slate-100 bg-slate-50/80 backdrop-blur-xs">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-xs">
                  <ShieldCheck className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm sm:text-base font-black text-slate-900 uppercase tracking-tight">Confirm Payment</h3>
                  <p className="text-[10px] sm:text-[11px] text-slate-500 font-medium">Verify before writing to ledger</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="hidden sm:inline-block px-2.5 py-0.5 rounded-full bg-blue-100 text-blue-800 text-xs font-black">
                  {formatCurrency(numAmount, currencySymbol)}
                </span>
                <button
                  type="button"
                  onClick={() => setShowConfirmModal(false)}
                  id="close-confirm-modal-btn"
                  className="w-8 h-8 rounded-full bg-white text-slate-700 hover:bg-slate-200 flex items-center justify-center border border-slate-200 shadow-2xs"
                  aria-label="Close modal"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Modal Body (Scrollable with compact, clean mobile layout) */}
            <div className="p-4 sm:p-6 overflow-y-auto space-y-3 sm:space-y-4 flex-1 min-h-0">
              {/* Highlight Amount Card */}
              <div className="bg-gradient-to-br from-blue-50 to-indigo-50/60 border border-blue-200/80 rounded-2xl p-3.5 sm:p-4 text-center space-y-1">
                <span className="text-[10px] font-black uppercase tracking-wider text-blue-700">
                  Payment Amount to Collect
                </span>
                <p className="text-2xl sm:text-3xl font-black text-blue-700 tracking-tight">
                  {formatCurrency(numAmount, currencySymbol)}
                </p>
                <div className="inline-flex items-center px-2.5 py-0.5 rounded-full bg-white/90 border border-blue-200 text-[11px] font-bold text-blue-900 shadow-2xs">
                  {feeCategoryLabel}
                </div>
              </div>

              {/* Student Summary */}
              <div className="bg-slate-50 rounded-2xl p-3 sm:p-4 border border-slate-200/80 space-y-1.5 text-xs">
                <div className="flex justify-between items-center pb-1.5 border-b border-slate-200">
                  <span className="text-slate-500 font-medium">Student Name:</span>
                  <span className="font-bold text-slate-900 text-sm truncate max-w-[180px] sm:max-w-none">{selectedStudent.full_name}</span>
                </div>
                <div className="flex justify-between items-center py-1 border-b border-slate-200">
                  <span className="text-slate-500 font-medium">Student ID / Class:</span>
                  <span className="font-bold text-slate-800">
                    #{selectedStudent.id} • {selectedStudent.class}
                  </span>
                </div>
                <div className="flex justify-between items-center py-1 border-b border-slate-200">
                  <span className="text-slate-500 font-medium">Term / Session:</span>
                  <span className="font-bold text-slate-800">
                    {selectedStudent.term} ({selectedStudent.session})
                  </span>
                </div>
                <div className="flex justify-between items-center py-1 border-b border-slate-200">
                  <span className="text-slate-500 font-medium">Channel:</span>
                  <span className="font-bold text-slate-800">{paymentMethod}</span>
                </div>
                <div className="flex justify-between items-center pt-1">
                  <span className="text-slate-500 font-medium">Receipt Number:</span>
                  <span className={`font-mono font-bold text-xs ${receiptNumber.trim() ? 'text-blue-600' : 'text-slate-400'}`}>
                    {receiptNumber.trim() || 'Auto-generated on submit'}
                  </span>
                </div>
              </div>

              {/* Balance & Ledger Changes */}
              <div className="border border-slate-200 rounded-2xl p-3 sm:p-3.5 space-y-2 text-xs bg-white">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                    Ledger Impact
                  </span>
                  <div className="flex items-center gap-1">
                    <span className="text-[10px] text-slate-500">New Status:</span>
                    <StatusBadge status={newCalculatedStatus} size="sm" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 text-center">
                  <div className="p-2 bg-slate-50 rounded-xl border border-slate-100">
                    <span className="text-[9px] text-slate-500 uppercase block font-semibold">Total Paid</span>
                    <p className="text-xs font-black text-emerald-600 mt-0.5">
                      {formatCurrency(previewCurrentPaid, currencySymbol)} → {formatCurrency(newTotalPaid, currencySymbol)}
                    </p>
                  </div>
                  <div className="p-2 bg-slate-50 rounded-xl border border-slate-100">
                    <span className="text-[9px] text-slate-500 uppercase block font-semibold">Balance Due</span>
                    <p className={`text-xs font-black mt-0.5 ${newCalculatedBalance > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                      {formatCurrency(Math.max(0, previewFee - previewCurrentPaid), currencySymbol)} → {formatCurrency(newCalculatedBalance, currencySymbol)}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Modal Actions (Fixed/Sticky Footer docked with safe bottom padding) */}
            <div className="shrink-0 p-3.5 sm:p-4 bg-white border-t border-slate-100 shadow-[0_-4px_16px_rgba(0,0,0,0.04)] flex gap-2.5 z-10 pb-6 sm:pb-4">
              <button
                type="button"
                onClick={() => setShowConfirmModal(false)}
                disabled={isSubmitting}
                id="cancel-payment-confirm-btn"
                className="flex-1 py-3.5 px-3 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs sm:text-sm font-bold border border-slate-200 active:scale-95 transition-all flex items-center justify-center"
              >
                Modify / Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmAndSubmit}
                disabled={isSubmitting}
                id="final-confirm-payment-btn"
                className="flex-[1.5] py-3.5 px-4 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white text-xs sm:text-sm font-black disabled:opacity-50 shadow-md shadow-blue-500/25 flex items-center justify-center gap-2 active:scale-95 transition-all"
              >
                {isSubmitting ? (
                  <span>Recording Payment...</span>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Confirm & Pay</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
