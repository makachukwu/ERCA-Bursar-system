/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { StudentPaymentRecord, PaymentReceipt, PaymentStatus } from '../types';
import { calculateBalance, calculateStatus, generateReceiptNumber, getTodayDateString } from './calculations';

export interface RecordPaymentResult {
  updatedRecord: StudentPaymentRecord;
  receipt: PaymentReceipt;
}

export interface PaymentFeeCategoryOptions {
  categoryType?: 'tuition' | 'lesson' | 'exam' | 'custom' | 'admission';
  lessonMonth?: string;
  isPartPayment?: boolean;
  feeDescription?: string;
  receiptNumber?: string;
}

/**
 * Records a student payment transaction and calculates updated balances and fee breakdowns.
 */
export function recordStudentPaymentLocally(
  student: StudentPaymentRecord,
  paymentAmount: number,
  paymentMethod: string = 'Cash',
  feeCategory?: PaymentFeeCategoryOptions
): RecordPaymentResult {
  const amountPaidNum = Number(paymentAmount) || 0;
  const currentTotalPaid = Number(student.amount_paid) || 0;
  const newTotalPaid = currentTotalPaid + amountPaidNum;
  const totalFee = Number(student.fee_amount) || 0;

  const newBalance = calculateBalance(totalFee, newTotalPaid);
  const newStatus = calculateStatus(totalFee, newTotalPaid);
  const today = getTodayDateString();
  const receiptNo = feeCategory?.receiptNumber || student.receipt_no || generateReceiptNumber();

  // Breakdown adjustments based on category
  const updatedStudent: StudentPaymentRecord = {
    ...student,
    amount_paid: newTotalPaid,
    balance: newBalance,
    status: newStatus,
    payment_date: today,
    receipt_no: receiptNo,
  };

  const catType = feeCategory?.categoryType;

  if (catType === 'lesson') {
    const curLessonPaid = Number(student.lesson_paid) || 0;
    const nextLessonPaid = curLessonPaid + amountPaidNum;
    const lessonFee = Number(student.lesson_fee) || 0;
    updatedStudent.lesson_paid = nextLessonPaid;
    updatedStudent.lesson_status = lessonFee > 0 ? calculateStatus(lessonFee, nextLessonPaid) : 'fully_paid';
    if (feeCategory?.lessonMonth) {
      const existingMonths = student.lesson_months ? student.lesson_months.split(', ') : [];
      if (!existingMonths.includes(feeCategory.lessonMonth)) {
        existingMonths.push(feeCategory.lessonMonth);
      }
      updatedStudent.lesson_months = existingMonths.join(', ');
    }
  } else if (catType === 'exam') {
    const curExamPaid = Number(student.exam_paid) || 0;
    const nextExamPaid = curExamPaid + amountPaidNum;
    const examFee = Number(student.exam_fee) || 0;
    updatedStudent.exam_paid = nextExamPaid;
    updatedStudent.exam_status = examFee > 0 ? calculateStatus(examFee, nextExamPaid) : 'fully_paid';
  } else if (catType === 'admission') {
    const curAdmPaid = Number(student.admission_paid) || 0;
    const nextAdmPaid = curAdmPaid + amountPaidNum;
    const admFee = Number(student.admission_fee) || 0;
    updatedStudent.admission_paid = nextAdmPaid;
    updatedStudent.admission_status = admFee > 0 ? calculateStatus(admFee, nextAdmPaid) : 'fully_paid';
  } else {
    // Default to tuition / school fee
    const curTuitionPaid = Number(student.tuition_paid) || 0;
    const nextTuitionPaid = curTuitionPaid + amountPaidNum;
    const tuitionFee = Number(student.tuition_fee) || 0;
    updatedStudent.tuition_paid = nextTuitionPaid;
    updatedStudent.tuition_status = student.is_exempt_from_school_fee ? 'fully_paid' : calculateStatus(tuitionFee, nextTuitionPaid);
  }

  let mappedReceiptCat: 'school_fee' | 'admission' | 'lesson' | 'exam' | 'custom' = 'school_fee';
  if (catType === 'lesson') mappedReceiptCat = 'lesson';
  else if (catType === 'exam') mappedReceiptCat = 'exam';
  else if (catType === 'admission') mappedReceiptCat = 'admission';
  else if (catType === 'custom') mappedReceiptCat = 'custom';

  const receipt: PaymentReceipt = {
    receiptNumber: receiptNo,
    studentId: student.id,
    studentName: student.full_name,
    studentClass: student.class,
    term: student.term,
    session: student.session,
    amountPaidNow: amountPaidNum,
    totalFee: totalFee,
    totalPaid: newTotalPaid,
    remainingBalance: newBalance,
    status: newStatus,
    paymentDate: today,
    timestamp: new Date().toISOString(),
    paymentMethod: paymentMethod,
    feeCategory: mappedReceiptCat,
    feeItemDescription: feeCategory?.feeDescription || (catType === 'lesson' ? `Lesson Fee (${feeCategory?.lessonMonth || 'Term'})` : 'School Tuition Fee'),
  };

  return {
    updatedRecord: updatedStudent,
    receipt,
  };
}

export const recordStudentPayment = recordStudentPaymentLocally;

