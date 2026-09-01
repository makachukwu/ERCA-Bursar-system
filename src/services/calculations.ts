/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { PaymentStatus, StudentPaymentRecord, ClassPaymentSummary, SchoolFeeSchedule, SchoolProfile, PaymentReceipt } from '../types';

/**
 * Standard Fee Schedule Configuration:
 * - Admission Fee: ₦4,000 (Mandatory for new student enrollment)
 * - School Fee: Termly based on class level (₦5,000 standard)
 * - Lesson Fee: ₦2,000 / month (or complete ₦6,000 for a term)
 * - Exam Fee: ₦1,000 / term
 */
export const FEE_SCHEDULE = {
  ADMISSION_FEE: 5000,
  EXAM_FEE: 1500,
  LESSON_FEE_MONTHLY: 2500,
  LESSON_FEE_TERMLY: 7000, // Termly lesson fee
  DEFAULT_SCHOOL_FEE: 15000, // Base default School Fee
  DEFAULT_BASE_SCHOOL_FEES: {
    'JSS 1': 15000,
    'JSS 2': 15000,
    'JSS 3': 15000,
    'SSS 1': 15000,
    'SSS 2': 15000,
    'SSS 3': 15000,
    'Primary': 15000,
    'Nursery': 15000,
    'Default': 15000,
  } as Record<string, number>,
};

export const ACADEMIC_MONTHS = [
  'September',
  'October',
  'November',
  'December',
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
];

/**
 * Standard School Class Hierarchy:
 * Kg1 -> Kg2 -> Nur1 -> Nur2 -> Pri1 -> Pri2 -> Pri3 -> Pri4 -> Pri5 -> Jss1 -> Jss2 -> Jss3 -> Ss1 -> Ss2 -> Ss3
 */
export const STANDARD_CLASSES = [
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
] as const;

/**
 * Normalizes any class string into standard canonical format (e.g. "ss3", "SS3", "SSS 3" -> "Ss3")
 */
export function normalizeClassName(cls?: string): string {
  if (!cls || typeof cls !== 'string') return '';
  const clean = cls.trim();
  if (!clean) return '';
  const lower = clean.toLowerCase().replace(/[\s_-]+/g, '');

  if (lower === 'kg1' || lower === 'kindergarten1' || lower === 'creche' || lower === 'playgroup') return 'Kg1';
  if (lower === 'kg2' || lower === 'kindergarten2') return 'Kg2';
  if (lower === 'nur1' || lower === 'nursery1' || lower === 'reception') return 'Nur1';
  if (lower === 'nur2' || lower === 'nursery2' || lower === 'nursery' || lower === 'transition') return 'Nur2';
  if (lower === 'pri1' || lower === 'primary1' || lower === 'basic1' || lower === 'grade1') return 'Pri1';
  if (lower === 'pri2' || lower === 'primary2' || lower === 'basic2' || lower === 'grade2') return 'Pri2';
  if (lower === 'pri3' || lower === 'primary3' || lower === 'basic3' || lower === 'grade3') return 'Pri3';
  if (lower === 'pri4' || lower === 'primary4' || lower === 'basic4' || lower === 'grade4') return 'Pri4';
  if (lower === 'pri5' || lower === 'primary5' || lower === 'basic5' || lower === 'grade5') return 'Pri5';
  if (lower === 'pri6' || lower === 'primary6' || lower === 'basic6' || lower === 'grade6') return 'Pri6';
  if (lower === 'jss1' || lower === 'js1' || lower === 'junior1' || lower === 'juniorsecondary1') return 'Jss1';
  if (lower === 'jss2' || lower === 'js2' || lower === 'junior2' || lower === 'juniorsecondary2') return 'Jss2';
  if (lower === 'jss3' || lower === 'js3' || lower === 'junior3' || lower === 'juniorsecondary3') return 'Jss3';
  if (lower === 'ss1' || lower === 'sss1' || lower === 'senior1' || lower === 'seniorsecondary1') return 'Ss1';
  if (lower === 'ss2' || lower === 'sss2' || lower === 'senior2' || lower === 'seniorsecondary2') return 'Ss2';
  if (lower === 'ss3' || lower === 'sss3' || lower === 'senior3' || lower === 'seniorsecondary3') return 'Ss3';
  if (lower === 'graduated') return 'Graduated';

  return clean;
}

/**
 * Promotes a student class to the next academic grade for Session Upgrade:
 * Kg1 -> Kg2 -> Nur1 -> Nur2 -> Pri1 -> Pri2 -> Pri3 -> Pri4 -> Pri5 -> Jss1 -> Jss2 -> Jss3 -> Ss1 -> Ss2 -> Ss3 -> Graduated
 */
export function promoteSchoolClass(currentClass: string): string {
  if (!currentClass || typeof currentClass !== 'string') return 'Kg1';
  const clean = currentClass.trim();
  const normalized = clean.toLowerCase().replace(/\s+/g, '');

  if (normalized === 'kg1' || normalized === 'kindergarten1' || normalized === 'creche' || normalized === 'playgroup') {
    return 'Kg2';
  }
  if (normalized === 'kg2' || normalized === 'kindergarten2') {
    return 'Nur1';
  }
  if (normalized === 'nur1' || normalized === 'nursery1' || normalized === 'reception') {
    return 'Nur2';
  }
  if (normalized === 'nur2' || normalized === 'nursery2' || normalized === 'nursery' || normalized === 'transition') {
    return 'Pri1';
  }
  if (normalized === 'pri1' || normalized === 'primary1' || normalized === 'basic1' || normalized === 'grade1') {
    return 'Pri2';
  }
  if (normalized === 'pri2' || normalized === 'primary2' || normalized === 'basic2' || normalized === 'grade2') {
    return 'Pri3';
  }
  if (normalized === 'pri3' || normalized === 'primary3' || normalized === 'basic3' || normalized === 'grade3') {
    return 'Pri4';
  }
  if (normalized === 'pri4' || normalized === 'primary4' || normalized === 'basic4' || normalized === 'grade4') {
    return 'Pri5';
  }
  if (normalized === 'pri5' || normalized === 'primary5' || normalized === 'basic5' || normalized === 'grade5') {
    return 'Jss1';
  }
  if (normalized === 'pri6' || normalized === 'primary6' || normalized === 'basic6' || normalized === 'grade6') {
    return 'Jss1';
  }
  if (normalized === 'jss1' || normalized === 'js1' || normalized === 'junior1') {
    return 'Jss2';
  }
  if (normalized === 'jss2' || normalized === 'js2' || normalized === 'junior2') {
    return 'Jss3';
  }
  if (normalized === 'jss3' || normalized === 'js3' || normalized === 'junior3') {
    return 'Ss1';
  }
  if (normalized === 'ss1' || normalized === 'sss1' || normalized === 'senior1') {
    return 'Ss2';
  }
  if (normalized === 'ss2' || normalized === 'sss2' || normalized === 'senior2') {
    return 'Ss3';
  }
  if (normalized === 'ss3' || normalized === 'sss3' || normalized === 'senior3') {
    return 'Graduated';
  }

  return clean;
}

/**
 * Sorts an array of class name strings in academic progression order
 */
export function sortClassesInAcademicOrder(classes: string[]): string[] {
  const orderRank: Record<string, number> = {
    'kg1': 1,
    'kg2': 2,
    'nur1': 3,
    'nursery1': 3,
    'nur2': 4,
    'nursery2': 4,
    'nursery': 4,
    'pri1': 5,
    'primary1': 5,
    'basic1': 5,
    'pri2': 6,
    'primary2': 6,
    'basic2': 6,
    'pri3': 7,
    'primary3': 7,
    'basic3': 7,
    'pri4': 8,
    'primary4': 8,
    'basic4': 8,
    'pri5': 9,
    'primary5': 9,
    'basic5': 9,
    'pri6': 10,
    'primary6': 10,
    'basic6': 10,
    'jss1': 11,
    'js1': 11,
    'jss2': 12,
    'js2': 12,
    'jss3': 13,
    'js3': 13,
    'ss1': 14,
    'sss1': 14,
    'ss2': 15,
    'sss2': 15,
    'ss3': 16,
    'sss3': 16,
    'graduated': 17,
  };

  return [...classes].sort((a, b) => {
    const rankA = orderRank[a.toLowerCase().replace(/\s+/g, '')] ?? 99;
    const rankB = orderRank[b.toLowerCase().replace(/\s+/g, '')] ?? 99;
    if (rankA !== rankB) return rankA - rankB;
    return a.localeCompare(b);
  });
}

/**
 * Calculates total payable fee from breakdown:
 * baseSchoolFee + lessonFee + examFee
 */
export function calculateItemizedTotalFee(
  baseSchoolFee: number,
  lessonOption: 'none' | '1_month' | '2_months' | 'termly' | 'custom',
  includeExamFee: boolean,
  customLessonAmount: number = 0
): {
  totalFee: number;
  schoolFee: number;
  lessonFee: number;
  examFee: number;
} {
  const schoolFee = Math.max(0, Number(baseSchoolFee) || 0);
  let lessonFee = 0;
  if (lessonOption === '1_month') lessonFee = FEE_SCHEDULE.LESSON_FEE_MONTHLY;
  else if (lessonOption === '2_months') lessonFee = FEE_SCHEDULE.LESSON_FEE_MONTHLY * 2;
  else if (lessonOption === 'termly') lessonFee = FEE_SCHEDULE.LESSON_FEE_TERMLY;
  else if (lessonOption === 'custom') lessonFee = Math.max(0, Number(customLessonAmount) || 0);

  const examFee = includeExamFee ? FEE_SCHEDULE.EXAM_FEE : 0;
  const totalFee = schoolFee + lessonFee + examFee;

  return {
    totalFee,
    schoolFee,
    lessonFee,
    examFee,
  };
}

/**
 * Resolves the precise fee schedule for a given class, checking class-specific
 * overrides first before falling back to the school's general fee schedule.
 */
export function getClassFeeSchedule(
  schoolOrSchedule?: SchoolProfile | SchoolFeeSchedule | {
    tuitionFee?: number;
    admissionFee?: number;
    examFee?: number;
    lessonFeeMonthly?: number;
    lessonFeeTermly?: number;
    classFeeSchedules?: Record<string, SchoolFeeSchedule>;
  } | null,
  studentClass?: string
): SchoolFeeSchedule {
  const fallbackSchedule: SchoolFeeSchedule = {
    tuitionFee: FEE_SCHEDULE.DEFAULT_SCHOOL_FEE,
    admissionFee: FEE_SCHEDULE.ADMISSION_FEE,
    examFee: FEE_SCHEDULE.EXAM_FEE,
    lessonFeeMonthly: FEE_SCHEDULE.LESSON_FEE_MONTHLY,
    lessonFeeTermly: FEE_SCHEDULE.LESSON_FEE_TERMLY,
  };

  if (!schoolOrSchedule) {
    return fallbackSchedule;
  }

  let baseSchedule: SchoolFeeSchedule = fallbackSchedule;
  let classSchedules: Record<string, SchoolFeeSchedule> | undefined;

  if ('feeSchedule' in schoolOrSchedule && schoolOrSchedule.feeSchedule) {
    baseSchedule = {
      tuitionFee: schoolOrSchedule.feeSchedule.tuitionFee ?? fallbackSchedule.tuitionFee,
      admissionFee: schoolOrSchedule.feeSchedule.admissionFee ?? fallbackSchedule.admissionFee,
      examFee: schoolOrSchedule.feeSchedule.examFee ?? fallbackSchedule.examFee,
      lessonFeeMonthly: schoolOrSchedule.feeSchedule.lessonFeeMonthly ?? fallbackSchedule.lessonFeeMonthly,
      lessonFeeTermly: schoolOrSchedule.feeSchedule.lessonFeeTermly ?? fallbackSchedule.lessonFeeTermly,
    };
    classSchedules = (schoolOrSchedule as any).classFeeSchedules;
  } else {
    baseSchedule = {
      tuitionFee: (schoolOrSchedule as any).tuitionFee ?? fallbackSchedule.tuitionFee,
      admissionFee: (schoolOrSchedule as any).admissionFee ?? fallbackSchedule.admissionFee,
      examFee: (schoolOrSchedule as any).examFee ?? fallbackSchedule.examFee,
      lessonFeeMonthly: (schoolOrSchedule as any).lessonFeeMonthly ?? fallbackSchedule.lessonFeeMonthly,
      lessonFeeTermly: (schoolOrSchedule as any).lessonFeeTermly ?? fallbackSchedule.lessonFeeTermly,
    };
    classSchedules = (schoolOrSchedule as any).classFeeSchedules;
  }

  if (studentClass && classSchedules && typeof classSchedules === 'object') {
    const cleanStr = (s: string) => {
      let r = s.trim().toLowerCase().replace(/[\s_\.-]+/g, '');
      if (r === 'sss1') r = 'ss1';
      if (r === 'sss2') r = 'ss2';
      if (r === 'sss3') r = 'ss3';
      return r;
    };
    const target = cleanStr(studentClass);
    const matchedKey = Object.keys(classSchedules).find((k) => cleanStr(k) === target);
    if (matchedKey && classSchedules[matchedKey]) {
      const classSpec = classSchedules[matchedKey];
      return {
        tuitionFee: classSpec.tuitionFee !== undefined && !isNaN(Number(classSpec.tuitionFee)) ? Number(classSpec.tuitionFee) : baseSchedule.tuitionFee,
        admissionFee: classSpec.admissionFee !== undefined && !isNaN(Number(classSpec.admissionFee)) ? Number(classSpec.admissionFee) : baseSchedule.admissionFee,
        examFee: classSpec.examFee !== undefined && !isNaN(Number(classSpec.examFee)) ? Number(classSpec.examFee) : baseSchedule.examFee,
        lessonFeeMonthly: classSpec.lessonFeeMonthly !== undefined && !isNaN(Number(classSpec.lessonFeeMonthly)) ? Number(classSpec.lessonFeeMonthly) : baseSchedule.lessonFeeMonthly,
        lessonFeeTermly: classSpec.lessonFeeTermly !== undefined && !isNaN(Number(classSpec.lessonFeeTermly)) ? Number(classSpec.lessonFeeTermly) : baseSchedule.lessonFeeTermly,
      };
    }
  }

  return baseSchedule;
}

/**
 * Sanitizes and normalizes fee category breakdown for a student record
 */
export function deriveFeeBreakdown(
  student: Partial<StudentPaymentRecord>,
  schedule?: SchoolProfile | SchoolFeeSchedule | {
    tuitionFee?: number;
    admissionFee?: number;
    examFee?: number;
    lessonFeeMonthly?: number;
    lessonFeeTermly?: number;
    classFeeSchedules?: Record<string, SchoolFeeSchedule>;
  }
): {
  tuitionFee: number;
  tuitionPaid: number;
  tuitionStatus: PaymentStatus;
  admissionFee: number;
  admissionPaid: number;
  admissionStatus: PaymentStatus;
  lessonFee: number;
  lessonPaid: number;
  lessonStatus: PaymentStatus;
  lessonMonths: string;
  examFee: number;
  examPaid: number;
  examStatus: PaymentStatus;
} {
  const resolved = getClassFeeSchedule(schedule, (student as any).class_name || student.class);
  const defaultAdmission = resolved.admissionFee;
  const defaultExam = resolved.examFee > 0 ? resolved.examFee : FEE_SCHEDULE.EXAM_FEE;
  const defaultLessonTermly = resolved.lessonFeeTermly > 0 ? resolved.lessonFeeTermly : FEE_SCHEDULE.LESSON_FEE_TERMLY;
  const defaultLessonMonthly = resolved.lessonFeeMonthly > 0 ? resolved.lessonFeeMonthly : FEE_SCHEDULE.LESSON_FEE_MONTHLY;
  const defaultTuition = resolved.tuitionFee > 0 ? resolved.tuitionFee : FEE_SCHEDULE.DEFAULT_SCHOOL_FEE;

  // 1. Admission Fee Breakdown
  // CRITICAL RULE: Existing students NEVER pay admission fees.
  // Admission fee is ONLY applied if is_new_admission is explicitly true,
  // or if student has an explicit positive admission_fee and is_new_admission is not false.
  const isExplicitExisting = student.is_new_admission === false;
  let admissionFee = 0;
  if (!isExplicitExisting) {
    if (student.is_new_admission === true) {
      admissionFee = (student.admission_fee !== undefined && Number(student.admission_fee) > 0)
        ? Math.max(0, Number(student.admission_fee) || 0)
        : defaultAdmission;
    } else if (student.admission_fee !== undefined && student.admission_fee !== null && Number(student.admission_fee) > 0) {
      admissionFee = Math.max(0, Number(student.admission_fee) || 0);
    }
  }

  // 2. Exam Fee Breakdown (Strictly equals exam fee amount from settings unless overridden on student)
  const hasExplicitExamFee = student.exam_fee !== undefined && student.exam_fee !== null && Number(student.exam_fee) >= 0;
  const examFee = hasExplicitExamFee
    ? Math.max(0, Number(student.exam_fee) || 0)
    : defaultExam;

  // 3. Lesson Fee Breakdown (Strictly equals lesson fee amount from settings unless overridden on student)
  const hasExplicitLessonFee = student.lesson_fee !== undefined && student.lesson_fee !== null && Number(student.lesson_fee) >= 0;
  let lessonFee = defaultLessonTermly;
  if (hasExplicitLessonFee) {
    lessonFee = Math.max(0, Number(student.lesson_fee) || 0);
  } else if (student.lesson_months) {
    if (student.lesson_months.includes('1 Month')) {
      lessonFee = defaultLessonMonthly;
    } else if (student.lesson_months.includes('2 Month')) {
      lessonFee = defaultLessonMonthly * 2;
    } else if (student.lesson_months.includes('None') || student.lesson_months === '0') {
      lessonFee = 0;
    }
  }

  // 4. School Fee (Tuition) (Strictly equals tuition fee value added in settings unless overridden on student)
  const isExempt = student.is_exempt_from_school_fee === true;
  let tuitionFee = 0;

  if (!isExempt) {
    if (student.tuition_fee !== undefined && student.tuition_fee !== null && Number(student.tuition_fee) >= 0) {
      tuitionFee = Math.max(0, Number(student.tuition_fee) || 0);
    } else if (defaultTuition > 0) {
      tuitionFee = defaultTuition;
    } else if (student.fee_amount !== undefined && student.fee_amount !== null && Number(student.fee_amount) > 0) {
      tuitionFee = Math.max(0, Number(student.fee_amount) || 0);
    } else {
      tuitionFee = FEE_SCHEDULE.DEFAULT_SCHOOL_FEE;
    }
  }

  // 5. Payment Allocation & Reconciliation
  const hasExplicitTuitionPaid = student.tuition_paid !== undefined && student.tuition_paid !== null;
  const hasExplicitExamPaid = student.exam_paid !== undefined && student.exam_paid !== null;
  const hasExplicitLessonPaid = student.lesson_paid !== undefined && student.lesson_paid !== null;
  const hasExplicitAdmissionPaid = student.admission_paid !== undefined && student.admission_paid !== null;

  let finalTuitionPaid = 0;
  let finalAdmissionPaid = 0;
  let finalExamPaid = 0;
  let finalLessonPaid = 0;

  if (hasExplicitTuitionPaid || hasExplicitExamPaid || hasExplicitLessonPaid || hasExplicitAdmissionPaid) {
    finalTuitionPaid = hasExplicitTuitionPaid ? Math.max(0, Number(student.tuition_paid) || 0) : 0;
    finalAdmissionPaid = hasExplicitAdmissionPaid ? Math.max(0, Number(student.admission_paid) || 0) : 0;
    finalExamPaid = hasExplicitExamPaid ? Math.max(0, Number(student.exam_paid) || 0) : 0;
    finalLessonPaid = hasExplicitLessonPaid ? Math.max(0, Number(student.lesson_paid) || 0) : 0;

    // Only if total amount_paid has surplus beyond explicit components, allocate surplus cleanly
    const explicitSum = finalTuitionPaid + finalAdmissionPaid + finalExamPaid + finalLessonPaid;
    const totalPaid = Math.max(0, Number(student.amount_paid) || 0);
    if (totalPaid > explicitSum) {
      let surplus = totalPaid - explicitSum;
      if (finalTuitionPaid < tuitionFee && surplus > 0) {
        const add = Math.min(surplus, tuitionFee - finalTuitionPaid);
        finalTuitionPaid += add;
        surplus -= add;
      }
      if (finalLessonPaid < lessonFee && surplus > 0) {
        const add = Math.min(surplus, lessonFee - finalLessonPaid);
        finalLessonPaid += add;
        surplus -= add;
      }
      if (finalExamPaid < examFee && surplus > 0) {
        const add = Math.min(surplus, examFee - finalExamPaid);
        finalExamPaid += add;
        surplus -= add;
      }
      if (finalAdmissionPaid < admissionFee && surplus > 0) {
        const add = Math.min(surplus, admissionFee - finalAdmissionPaid);
        finalAdmissionPaid += add;
        surplus -= add;
      }
    }
  } else {
    // If only total amount_paid is available without individual columns:
    // Sequential allocation: Tuition (School fee) -> Lesson Fee -> Exam Fee -> Admission Fee
    const totalPaid = Math.max(0, Number(student.amount_paid) || 0);
    let unallocated = totalPaid;

    finalTuitionPaid = Math.min(tuitionFee, unallocated);
    unallocated = Math.max(0, unallocated - finalTuitionPaid);

    finalLessonPaid = Math.min(lessonFee, unallocated);
    unallocated = Math.max(0, unallocated - finalLessonPaid);

    finalExamPaid = Math.min(examFee, unallocated);
    unallocated = Math.max(0, unallocated - finalExamPaid);

    finalAdmissionPaid = Math.min(admissionFee, unallocated);
    unallocated = Math.max(0, unallocated - finalAdmissionPaid);
  }

  let lessonMonths = (student.lesson_months || '').trim();
  if (!lessonMonths) {
    if (finalLessonPaid >= lessonFee && lessonFee > 0) {
      lessonMonths = 'Termly (Paid)';
    } else if (finalLessonPaid >= defaultLessonMonthly && defaultLessonMonthly > 0) {
      const months = Math.floor(finalLessonPaid / defaultLessonMonthly);
      lessonMonths = months > 1 ? `${months} Months Paid` : '1 Month Paid';
    } else if (finalLessonPaid > 0) {
      lessonMonths = 'Part Payment';
    } else {
      lessonMonths = 'None';
    }
  }

  const tuitionStatus: PaymentStatus = isExempt
    ? 'fully_paid'
    : (tuitionFee > 0 ? calculateStatus(tuitionFee, finalTuitionPaid) : (finalTuitionPaid > 0 ? 'fully_paid' : 'unpaid'));

  const admissionStatus: PaymentStatus = admissionFee > 0
    ? calculateStatus(admissionFee, finalAdmissionPaid)
    : (finalAdmissionPaid > 0 ? 'fully_paid' : 'unpaid');

  const examStatus: PaymentStatus = examFee > 0
    ? calculateStatus(examFee, finalExamPaid)
    : (finalExamPaid > 0 ? 'fully_paid' : 'unpaid');

  const lessonStatus: PaymentStatus = lessonFee > 0
    ? calculateStatus(lessonFee, finalLessonPaid)
    : (finalLessonPaid > 0 ? 'fully_paid' : 'unpaid');

  return {
    tuitionFee,
    tuitionPaid: finalTuitionPaid,
    tuitionStatus,
    admissionFee,
    admissionPaid: finalAdmissionPaid,
    admissionStatus,
    lessonFee,
    lessonPaid: finalLessonPaid,
    lessonStatus,
    lessonMonths,
    examFee,
    examPaid: finalExamPaid,
    examStatus,
  };
}

/**
 * Canonical helper to compute a student's LIVE fee amounts, balance, status, and breakdown
 * from the active school/class fee schedule.
 * ALWAYS checks classFeeSchedules[student.class] first, then falls back to school feeSchedule.
 */
export function computeStudentLiveFees(
  student: Partial<StudentPaymentRecord>,
  schoolOrSchedule?: SchoolProfile | SchoolFeeSchedule | {
    tuitionFee?: number;
    admissionFee?: number;
    examFee?: number;
    lessonFeeMonthly?: number;
    lessonFeeTermly?: number;
    classFeeSchedules?: Record<string, SchoolFeeSchedule>;
  } | null
): {
  totalFee: number;
  balance: number;
  status: PaymentStatus;
  amountPaid: number;
  breakdown: ReturnType<typeof deriveFeeBreakdown>;
} {
  const breakdown = deriveFeeBreakdown(student, schoolOrSchedule);
  const totalFee = breakdown.tuitionFee + breakdown.admissionFee + breakdown.examFee + breakdown.lessonFee;
  const amountPaid = Math.max(0, Number(student.amount_paid) || 0);
  const balance = Math.max(0, totalFee - amountPaid);
  const status = calculateStatus(totalFee, amountPaid);

  return {
    totalFee,
    balance,
    status,
    amountPaid,
    breakdown,
  };
}

/**
 * Returns the live total fee for a student based on their class fee schedule.
 */
export function getStudentTotalFee(
  student: Partial<StudentPaymentRecord>,
  schoolOrSchedule?: SchoolProfile | SchoolFeeSchedule | null
): number {
  return computeStudentLiveFees(student, schoolOrSchedule).totalFee;
}

/**
 * Returns the live remaining balance for a student.
 */
export function getStudentLiveBalance(
  student: Partial<StudentPaymentRecord>,
  schoolOrSchedule?: SchoolProfile | SchoolFeeSchedule | null
): number {
  return computeStudentLiveFees(student, schoolOrSchedule).balance;
}

/**
 * Returns the live payment status for a student.
 */
export function getStudentLiveStatus(
  student: Partial<StudentPaymentRecord>,
  schoolOrSchedule?: SchoolProfile | SchoolFeeSchedule | null
): PaymentStatus {
  return computeStudentLiveFees(student, schoolOrSchedule).status;
}

/**
 * Calculates remaining balance: fee_amount - amount_paid
 */
export function calculateBalance(feeAmount: number | string, amountPaid: number | string): number {
  const fee = Math.max(0, Number(feeAmount) || 0);
  const paid = Math.max(0, Number(amountPaid) || 0);
  const balance = fee - paid;
  // If paid >= fee, balance is 0 or negative (overpaid), we return Math.max(0, balance) or actual remaining
  return balance;
}

/**
 * Calculates payment status strictly based on amount_paid vs fee_amount:
 * - amount_paid <= 0 -> "unpaid"
 * - amount_paid < fee_amount -> "part_payment"
 * - amount_paid >= fee_amount -> "fully_paid"
 */
export function calculateStatus(feeAmount: number | string, amountPaid: number | string): PaymentStatus {
  const fee = Math.max(0, Number(feeAmount) || 0);
  const paid = Math.max(0, Number(amountPaid) || 0);

  if (paid <= 0) {
    return 'unpaid';
  }
  if (paid < fee) {
    return 'part_payment';
  }
  return 'fully_paid';
}

/**
 * Generates today's date in YYYY-MM-DD format
 */
export function getTodayDateString(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Formats a currency number with symbol and comma separation
 */
export function formatCurrency(amount: number | string | undefined | null, symbol: string = '₦'): string {
  const num = Number(amount);
  if (isNaN(num)) return `${symbol}0`;
  return `${symbol}${num.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

/**
 * Formats a date string (YYYY-MM-DD or ISO) into readable localized format
 */
export function formatDate(dateString?: string | null): string {
  if (!dateString || typeof dateString !== 'string') return '—';
  try {
    const trimmed = dateString.trim();
    if (!trimmed) return '—';
    const parts = trimmed.split('-');
    if (parts.length === 3 && parts[0].length === 4) {
      const date = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
      if (!isNaN(date.getTime())) {
        return date.toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
        });
      }
    }
    const d = new Date(trimmed);
    if (!isNaN(d.getTime())) {
      return d.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });
    }
    return trimmed;
  } catch {
    return String(dateString || '—');
  }
}

/**
 * Sanitizes and parses raw row data from Google Sheet REST API to ensure exact types
 */
export function normalizeStudentRow(row: Record<string, any>): StudentPaymentRecord {
  const feeAmount = Number(
    row.fee_amount ?? 
    row['fee_amount'] ?? 
    row['Fee Amount'] ?? 
    row['Fee_Amount'] ?? 
    row.feeAmount ?? 
    row.total_fee ?? 
    row['Total Fee'] ?? 
    row.fee ?? 
    row.Fee ?? 
    0
  ) || 0;

  const amountPaid = Number(
    row.amount_paid ?? 
    row['amount_paid'] ?? 
    row['Amount Paid'] ?? 
    row['Amount_Paid'] ?? 
    row.amountPaid ?? 
    row.total_paid ?? 
    row['Total Paid'] ?? 
    row.paid ?? 
    row.Paid ?? 
    0
  ) || 0;
  
  // App recalculates balance and status to guarantee correctness even if sheet has inconsistent entries
  const balance = calculateBalance(feeAmount, amountPaid);
  const status = calculateStatus(feeAmount, amountPaid);

  // Parse breakdown columns if present (with aliases for spreadsheet columns)
  const tuitionFee = (row.tuition_fee ?? row['tuition_fee'] ?? row['Tuition Fee'] ?? row['Tuition_Fee'] ?? row.tuitionFee ?? row.school_fee ?? row['School Fee']) !== undefined 
    ? Number(row.tuition_fee ?? row['tuition_fee'] ?? row['Tuition Fee'] ?? row['Tuition_Fee'] ?? row.tuitionFee ?? row.school_fee ?? row['School Fee']) 
    : undefined;

  const tuitionPaid = (row.tuition_paid ?? row['tuition_paid'] ?? row['Tuition Paid'] ?? row['Tuition_Paid'] ?? row.tuitionPaid) !== undefined 
    ? Number(row.tuition_paid ?? row['tuition_paid'] ?? row['Tuition Paid'] ?? row['Tuition_Paid'] ?? row.tuitionPaid) 
    : undefined;

  const lessonFee = (row.lesson_fee ?? row['lesson_fee'] ?? row['Lesson Fee'] ?? row['Lesson_Fee'] ?? row.lessonFee ?? row.lesson_amount) !== undefined 
    ? Number(row.lesson_fee ?? row['lesson_fee'] ?? row['Lesson Fee'] ?? row['Lesson_Fee'] ?? row.lessonFee ?? row.lesson_amount) 
    : undefined;

  const lessonPaid = (row.lesson_paid ?? row['lesson_paid'] ?? row['Lesson Paid'] ?? row['Lesson_Paid'] ?? row.lessonPaid) !== undefined 
    ? Number(row.lesson_paid ?? row['lesson_paid'] ?? row['Lesson Paid'] ?? row['Lesson_Paid'] ?? row.lessonPaid) 
    : undefined;

  const lessonMonths = (row.lesson_months ?? row['lesson_months'] ?? row['Lesson Months'] ?? row['Lesson_Months'] ?? row.lessonMonths ?? row.lesson_month ?? row['Lesson Month']) !== undefined 
    ? String(row.lesson_months ?? row['lesson_months'] ?? row['Lesson Months'] ?? row['Lesson_Months'] ?? row.lessonMonths ?? row.lesson_month ?? row['Lesson Month']) 
    : undefined;

  const lessonStatusRaw = row.lesson_status ?? row['lesson_status'] ?? row['Lesson Status'] ?? row['Lesson_Status'] ?? row.lessonStatus;
  let lessonStatus: PaymentStatus | undefined = undefined;
  if (lessonPaid !== undefined) {
    lessonStatus = calculateStatus(lessonFee !== undefined && lessonFee > 0 ? lessonFee : FEE_SCHEDULE.LESSON_FEE_TERMLY, lessonPaid);
  } else if (lessonStatusRaw) {
    const rawStr = String(lessonStatusRaw).toLowerCase().trim();
    lessonStatus = rawStr === 'fully_paid' || rawStr === 'paid' || rawStr === 'complete' ? 'fully_paid' : rawStr === 'part_payment' || rawStr === 'part' ? 'part_payment' : 'unpaid';
  }

  const examFee = (row.exam_fee ?? row['exam_fee'] ?? row['Exam Fee'] ?? row['Exam_Fee'] ?? row.examFee ?? row.exam_amount) !== undefined 
    ? Number(row.exam_fee ?? row['exam_fee'] ?? row['Exam Fee'] ?? row['Exam_Fee'] ?? row.examFee ?? row.exam_amount) 
    : undefined;

  const examPaid = (row.exam_paid ?? row['exam_paid'] ?? row['Exam Paid'] ?? row['Exam_Paid'] ?? row.examPaid) !== undefined 
    ? Number(row.exam_paid ?? row['exam_paid'] ?? row['Exam Paid'] ?? row['Exam_Paid'] ?? row.examPaid) 
    : undefined;

  const examStatusRaw = row.exam_status ?? row['exam_status'] ?? row['Exam Status'] ?? row['Exam_Status'] ?? row.examStatus;
  let examStatus: PaymentStatus | undefined = undefined;
  if (examPaid !== undefined) {
    // Strict accounting rule: payment amount dictates status
    examStatus = calculateStatus(examFee !== undefined && examFee > 0 ? examFee : FEE_SCHEDULE.EXAM_FEE, examPaid);
  } else if (examStatusRaw) {
    const rawStr = String(examStatusRaw).toLowerCase().trim();
    examStatus = rawStr === 'fully_paid' || rawStr === 'paid' || rawStr === 'complete' ? 'fully_paid' : rawStr === 'part_payment' || rawStr === 'part' ? 'part_payment' : 'unpaid';
  }

  const admissionFee = (row.admission_fee ?? row['admission_fee'] ?? row['Admission Fee'] ?? row['Admission_Fee'] ?? row.admissionFee ?? row.admission_amount) !== undefined
    ? Number(row.admission_fee ?? row['admission_fee'] ?? row['Admission Fee'] ?? row['Admission_Fee'] ?? row.admissionFee ?? row.admission_amount)
    : undefined;

  const admissionPaid = (row.admission_paid ?? row['admission_paid'] ?? row['Admission Paid'] ?? row['Admission_Paid'] ?? row.admissionPaid) !== undefined
    ? Number(row.admission_paid ?? row['admission_paid'] ?? row['Admission Paid'] ?? row['Admission_Paid'] ?? row.admissionPaid)
    : undefined;

  const admissionStatusRaw = row.admission_status ?? row['admission_status'] ?? row['Admission Status'] ?? row['Admission_Status'] ?? row.admissionStatus;
  let admissionStatus: PaymentStatus | undefined = undefined;
  if (admissionPaid !== undefined && admissionFee !== undefined) {
    admissionStatus = calculateStatus(admissionFee, admissionPaid);
  } else if (admissionStatusRaw) {
    const rawStr = String(admissionStatusRaw).toLowerCase().trim();
    admissionStatus = rawStr === 'fully_paid' || rawStr === 'paid' || rawStr === 'complete' ? 'fully_paid' : rawStr === 'part_payment' || rawStr === 'part' ? 'part_payment' : 'unpaid';
  }

  const totalRemittedRaw = row.total_remitted ?? 
    row['total_remitted'] ?? 
    row['Total Remitted'] ?? 
    row['Total_Remitted'] ?? 
    row.totalRemitted ?? 
    row.remitted ?? 
    row['remitted'] ?? 
    row['Remitted'] ?? 
    row.remitted_amount ?? 
    row['Remitted Amount'] ?? 
    row.bank_remitted ?? 
    row['Bank Remitted'];

  const totalRemitted = totalRemittedRaw !== undefined && totalRemittedRaw !== null && totalRemittedRaw !== ''
    ? Number(totalRemittedRaw) || 0
    : undefined;

  const receiptNoRaw = row.receipt_no ?? 
    row['receipt_no'] ?? 
    row['Receipt No'] ?? 
    row['Receipt_No'] ?? 
    row['Receipt Number'] ?? 
    row['receipt_number'] ?? 
    row.receiptNo ?? 
    row.receiptNumber ??
    row.ReceiptNo ??
    row['Receipt'];

  const receiptNo = receiptNoRaw !== undefined && receiptNoRaw !== null && String(receiptNoRaw).trim() !== ''
    ? String(receiptNoRaw).trim()
    : undefined;

  const rawExemptCandidate = row.is_exempt_from_school_fee ?? 
    row['is_exempt_from_school_fee'] ?? 
    row['exempt_school_fee'] ??
    row.exempt_school_fee ??
    row['Exempt School Fee'] ??
    row['Exempt_School_Fee'] ??
    row.is_scholarship ??
    row['is_scholarship'] ??
    row.is_exempt ??
    row['is_exempt'] ??
    row['Is Exempt'];

  let isExempt = false;
  if (rawExemptCandidate === true || rawExemptCandidate === 1) {
    isExempt = true;
  } else if (typeof rawExemptCandidate === 'string') {
    const s = rawExemptCandidate.toLowerCase().trim();
    if (['true', 'yes', 'y', '1', 'exempt', 'scholarship', '100%', 'full scholarship', 'full tuition exemption'].includes(s)) {
      isExempt = true;
    }
  } else if (rawExemptCandidate === undefined || rawExemptCandidate === null) {
    // Only check general scholarship / grant column if it contains an explicit affirmation of exemption
    const schCol = row.scholarship ?? row['Scholarship'] ?? row.scholarship_type ?? row['scholarship_type'] ?? row['Scholarship Type'] ?? row.grant_type ?? row['Grant Type'];
    if (schCol === true || schCol === 1) {
      isExempt = true;
    } else if (typeof schCol === 'string') {
      const s = schCol.toLowerCase().trim();
      if (['true', 'yes', 'y', '1', 'exempt', 'scholarship', '100%', 'full scholarship', 'full tuition exemption'].includes(s)) {
        isExempt = true;
      }
    }
  }

  let scholarshipNotes: string | undefined = undefined;
  if (isExempt) {
    const notesRaw = row.scholarship_notes ?? 
      row['scholarship_notes'] ?? 
      row['Scholarship Notes'] ?? 
      row['Scholarship_Notes'] ??
      row.scholarshipNotes ??
      row.scholarship_type ??
      row['scholarship_type'] ??
      row['Scholarship Type'] ??
      row.grant_type ??
      row['Grant Type'] ??
      row.scholarship ??
      row['Scholarship'];
    if (notesRaw !== undefined && notesRaw !== null && String(notesRaw).trim().length > 0) {
      const str = String(notesRaw).trim();
      const lower = str.toLowerCase();
      if (!['false', 'no', '0', 'none', 'null', 'undefined', 'n/a', '-', 'nil'].includes(lower)) {
        scholarshipNotes = str;
      }
    }
    if (!scholarshipNotes) {
      scholarshipNotes = 'Full Tuition Exemption';
    }
  }

  const rawClass = String(row.class || row.Class || row.className || row['Class Name'] || row['class_name'] || '').trim();
  const normalizedClass = normalizeClassName(rawClass);

  const isNewAdmRaw = row.is_new_admission ?? row['is_new_admission'] ?? row['New Admission'] ?? row['new_admission'] ?? row['Is New Admission'];
  let parsedIsNewAdmission: boolean | undefined = undefined;
  if (isNewAdmRaw === true || isNewAdmRaw === 1) {
    parsedIsNewAdmission = true;
  } else if (isNewAdmRaw === false || isNewAdmRaw === 0) {
    parsedIsNewAdmission = false;
  } else if (typeof isNewAdmRaw === 'string') {
    const lower = isNewAdmRaw.toLowerCase().trim();
    if (['true', 'yes', 'y', '1', 'new', 'new admission'].includes(lower)) {
      parsedIsNewAdmission = true;
    } else if (['false', 'no', 'n', '0', 'existing', 'returning', 'existing student'].includes(lower)) {
      parsedIsNewAdmission = false;
    }
  }

  const derived = deriveFeeBreakdown({
    class: normalizedClass,
    fee_amount: feeAmount,
    amount_paid: amountPaid,
    is_exempt_from_school_fee: isExempt,
    is_new_admission: parsedIsNewAdmission,
    tuition_fee: tuitionFee,
    tuition_paid: tuitionPaid,
    admission_fee: admissionFee,
    admission_paid: admissionPaid,
    admission_status: admissionStatus,
    lesson_fee: lessonFee,
    lesson_paid: lessonPaid,
    lesson_status: lessonStatus,
    lesson_months: lessonMonths,
    exam_fee: examFee,
    exam_paid: examPaid,
    exam_status: examStatus,
  }, row.school_context || row.schedule);

  // Calculate the overall total due per student:
  // Total Fee = Tuition Fee + Admission Fee + Lesson Fee + Exam Fee
  const calculatedTotalFee = derived.tuitionFee + (derived.admissionFee || 0) + (derived.lessonFee || 0) + (derived.examFee || 0);
  const effectiveFeeAmount = calculatedTotalFee;

  const effectiveAmountPaid = derived.tuitionPaid + (derived.admissionPaid || 0) + (derived.lessonPaid || 0) + (derived.examPaid || 0);
  const effectiveBalance = Math.max(0, effectiveFeeAmount - effectiveAmountPaid);
  const effectiveStatus = calculateStatus(effectiveFeeAmount, effectiveAmountPaid);

  return {
    id: String(row.id || row.ID || row.student_id || row['Student ID'] || '').trim(),
    full_name: String(row.full_name || row['full_name'] || row['Full Name'] || row.fullName || row.name || row.Name || '').trim(),
    class: normalizedClass,
    term: String(row.term || row.Term || '').trim(),
    session: String(row.session || row.Session || row.academic_session || '').trim(),
    fee_amount: effectiveFeeAmount,
    amount_paid: effectiveAmountPaid,
    balance: effectiveBalance,
    status: effectiveStatus,
    payment_date: String(row.payment_date || row['payment_date'] || row['Payment Date'] || row.paymentDate || row.date || '').trim(),
    is_exempt_from_school_fee: isExempt,
    scholarship_notes: scholarshipNotes,
    tuition_fee: derived.tuitionFee,
    tuition_paid: derived.tuitionPaid,
    tuition_status: derived.tuitionStatus,
    admission_fee: derived.admissionFee,
    admission_paid: derived.admissionPaid,
    admission_status: derived.admissionStatus,
    is_new_admission: parsedIsNewAdmission !== undefined ? parsedIsNewAdmission : derived.admissionFee > 0,
    lesson_fee: derived.lessonFee,
    lesson_paid: derived.lessonPaid,
    lesson_status: derived.lessonStatus,
    lesson_months: derived.lessonMonths,
    exam_fee: derived.examFee,
    exam_paid: derived.examPaid,
    exam_status: derived.examStatus,
    receipt_no: receiptNo,
    total_remitted: totalRemitted,
  };
}

/**
 * Examines existing student IDs in ascending order, parses the numeric component,
 * and generates the next sequential student ID starting from DNPS/0001 (e.g., DNPS/0170 -> DNPS/0171).
 */
export function generateNextStudentId(
  studentsOrCount?: StudentPaymentRecord[] | { id?: string }[] | number,
  customPrefix: string = 'DNPS/'
): string {
  let maxNumber = 0;

  if (Array.isArray(studentsOrCount)) {
    for (const s of studentsOrCount) {
      if (!s || !s.id) continue;
      const idStr = String(s.id).trim();

      // 1. Direct DNPS format: DNPS/0001, DNPS/0170, DNPS-0045, etc.
      const dnpsMatch = idStr.match(/DNPS[/_\-\s]?0*(\d+)/i);
      if (dnpsMatch && dnpsMatch[1]) {
        const num = parseInt(dnpsMatch[1], 10);
        if (!isNaN(num) && num > maxNumber && num < 100000) {
          maxNumber = num;
          continue;
        }
      }

      // 2. Legacy DOM format: DOM-2025-001-948 -> sequential part is 001
      const legacyMatch = idStr.match(/DOM-\d{4}-(\d+)/i);
      if (legacyMatch && legacyMatch[1]) {
        const num = parseInt(legacyMatch[1], 10);
        if (!isNaN(num) && num > maxNumber && num < 100000) {
          maxNumber = num;
          continue;
        }
      }

      // 3. Other prefix formats: STU/001, SCH-045, etc.
      const prefixMatch = idStr.match(/^[A-Za-z]+[/_\-\s]?0*(\d+)/);
      if (prefixMatch && prefixMatch[1]) {
        const num = parseInt(prefixMatch[1], 10);
        if (!isNaN(num) && num > maxNumber && num < 100000) {
          maxNumber = num;
          continue;
        }
      }

      // 4. Standalone sequential integer
      const digitsMatch = idStr.match(/(\d+)/);
      if (digitsMatch && digitsMatch[1]) {
        const num = parseInt(digitsMatch[1], 10);
        if (!isNaN(num) && num > maxNumber && num < 100000) {
          maxNumber = num;
        }
      }
    }
  } else if (typeof studentsOrCount === 'number' && !isNaN(studentsOrCount)) {
    maxNumber = Math.max(0, studentsOrCount);
  }

  const nextNumber = maxNumber + 1;
  const paddedNumber = String(nextNumber).padStart(4, '0');
  return `${customPrefix}${paddedNumber}`;
}

/**
 * Generates a unique Student ID in ascending order (starts at DNPS/0001)
 */
export function generateStudentId(studentsOrCount: StudentPaymentRecord[] | number = 0): string {
  return generateNextStudentId(studentsOrCount);
}

/**
 * Generates a unique Receipt Number
 */
export function generateReceiptNumber(): string {
  const dateStr = getTodayDateString().replace(/-/g, '');
  const randomSuffix = Math.floor(1000 + Math.random() * 9000);
  return `REC-${dateStr}-${randomSuffix}`;
}

/**
 * Computes class-by-class aggregated financial summaries
 */
export function calculateClassSummaries(
  students: StudentPaymentRecord[],
  schedule?: SchoolFeeSchedule | SchoolProfile
): ClassPaymentSummary[] {
  if (!students || !Array.isArray(students) || students.length === 0) {
    return [];
  }

  const classMap = new Map<string, {
    studentCount: number;
    totalFees: number;
    totalPaid: number;
    totalBalance: number;
    fullyPaidCount: number;
    partPaidCount: number;
    unpaidCount: number;
  }>();

  for (const s of students) {
    if (!s) continue;
    const cName = (s.class && s.class.trim()) ? s.class.trim() : 'Unassigned Class';
    const existing = classMap.get(cName) || {
      studentCount: 0,
      totalFees: 0,
      totalPaid: 0,
      totalBalance: 0,
      fullyPaidCount: 0,
      partPaidCount: 0,
      unpaidCount: 0,
    };

    const live = computeStudentLiveFees(s, schedule);
    const fee = live.totalFee;
    const paid = live.amountPaid;
    const bal = live.balance;
    const status = live.status;

    existing.studentCount += 1;
    existing.totalFees += fee;
    existing.totalPaid += paid;
    existing.totalBalance += bal;

    if (status === 'fully_paid') {
      existing.fullyPaidCount += 1;
    } else if (status === 'part_payment') {
      existing.partPaidCount += 1;
    } else {
      existing.unpaidCount += 1;
    }

    classMap.set(cName, existing);
  }

  const result: ClassPaymentSummary[] = [];

  classMap.forEach((stats, className) => {
    const collectionRate = stats.totalFees > 0
      ? Math.min(100, Math.round((stats.totalPaid / stats.totalFees) * 1000) / 10)
      : (stats.totalPaid > 0 ? 100 : 0);

    result.push({
      className,
      studentCount: stats.studentCount,
      totalFees: stats.totalFees,
      totalPaid: stats.totalPaid,
      totalBalance: stats.totalBalance,
      collectionRate,
      fullyPaidCount: stats.fullyPaidCount,
      partPaidCount: stats.partPaidCount,
      unpaidCount: stats.unpaidCount,
    });
  });

  // Default sort: highest total paid first
  return result.sort((a, b) => b.totalPaid - a.totalPaid);
}

/**
 * Computes global overall analytics and KPIs
 */
export function calculateOverallAnalytics(students: StudentPaymentRecord[], schedule?: SchoolFeeSchedule | SchoolProfile) {
  if (!students || !Array.isArray(students) || students.length === 0) {
    return {
      studentCount: 0,
      newAdmissionsCount: 0,
      scholarshipCount: 0,
      totalFees: 0,
      totalPaid: 0,
      totalBalance: 0,
      schoolFeeCollected: 0,
      admissionFeeCollected: 0,
      admissionFeeTotal: 0,
      admissionFeeBalance: 0,
      lessonFeeCollected: 0,
      examFeeCollected: 0,
      overallCollected: 0,
      schoolFeeTotal: 0,
      lessonFeeTotal: 0,
      examFeeTotal: 0,
      overallTotal: 0,
      overallBalance: 0,
      collectionRate: 0,
      fullyPaidCount: 0,
      partPaidCount: 0,
      unpaidCount: 0,
      fullyPaidPercentage: 0,
      partPaidPercentage: 0,
      unpaidPercentage: 0,
      topClassByAmount: null as string | null,
      topClassByRate: null as string | null,
      averageFee: 0,
      averagePaidPerStudent: 0,
    };
  }

  let totalFees = 0;
  let totalPaid = 0;
  let totalBalance = 0;
  let fullyPaidCount = 0;
  let partPaidCount = 0;
  let unpaidCount = 0;
  let newAdmissionsCount = 0;
  let scholarshipCount = 0;

  let schoolFeeCollected = 0;
  let admissionFeeCollected = 0;
  let admissionFeeTotal = 0;
  let lessonFeeCollected = 0;
  let examFeeCollected = 0;
  let schoolFeeTotal = 0;
  let lessonFeeTotal = 0;
  let examFeeTotal = 0;

  for (const s of students) {
    if (!s) continue;
    const isExempt = Boolean(s.is_exempt_from_school_fee);
    if (isExempt) {
      scholarshipCount += 1;
    }

    const live = computeStudentLiveFees(s, schedule);
    const fee = live.totalFee;
    const paid = live.amountPaid;
    const bal = live.balance;
    const status = live.status;

    totalFees += fee;
    totalPaid += paid;
    totalBalance += bal;

    const bd = live.breakdown;
    const sFee = bd.tuitionFee;
    const sPaid = bd.tuitionPaid;
    const aFee = bd.admissionFee;
    const aPaid = bd.admissionPaid;
    if (aFee > 0 || s.is_new_admission) {
      newAdmissionsCount += 1;
    }
    const lFee = bd.lessonFee;
    const lPaid = bd.lessonPaid;
    const eFee = bd.examFee;
    const ePaid = bd.examPaid;

    schoolFeeTotal += sFee;
    schoolFeeCollected += sPaid;
    admissionFeeTotal += aFee;
    admissionFeeCollected += aPaid;
    lessonFeeTotal += lFee;
    lessonFeeCollected += lPaid;
    examFeeTotal += eFee;
    examFeeCollected += ePaid;

    if (status === 'fully_paid') {
      fullyPaidCount += 1;
    } else if (status === 'part_payment') {
      partPaidCount += 1;
    } else {
      unpaidCount += 1;
    }
  }

  const count = students.length;
  const overallCollected = schoolFeeCollected + admissionFeeCollected + lessonFeeCollected + examFeeCollected;
  const overallTotal = schoolFeeTotal + admissionFeeTotal + lessonFeeTotal + examFeeTotal;
  const overallBalance = Math.max(0, overallTotal - overallCollected);
  const admissionFeeBalance = Math.max(0, admissionFeeTotal - admissionFeeCollected);

  const collectionRate = totalFees > 0 
    ? Math.min(100, Math.round((totalPaid / totalFees) * 1000) / 10) 
    : (totalPaid > 0 ? 100 : 0);

  const fullyPaidPercentage = count > 0 ? Math.round((fullyPaidCount / count) * 1000) / 10 : 0;
  const partPaidPercentage = count > 0 ? Math.round((partPaidCount / count) * 1000) / 10 : 0;
  const unpaidPercentage = count > 0 ? Math.round((unpaidCount / count) * 1000) / 10 : 0;

  const classSummaries = calculateClassSummaries(students);
  const topClassByAmount = classSummaries.length > 0 ? classSummaries[0].className : null;
  
  const sortedByRate = [...classSummaries].sort((a, b) => b.collectionRate - a.collectionRate);
  const topClassByRate = sortedByRate.length > 0 ? sortedByRate[0].className : null;

  return {
    studentCount: count,
    newAdmissionsCount,
    scholarshipCount,
    totalFees,
    totalPaid,
    totalBalance,
    schoolFeeCollected,
    admissionFeeCollected,
    admissionFeeTotal,
    admissionFeeBalance,
    lessonFeeCollected,
    examFeeCollected,
    overallCollected,
    schoolFeeTotal,
    lessonFeeTotal,
    examFeeTotal,
    overallTotal,
    overallBalance,
    collectionRate,
    fullyPaidCount,
    partPaidCount,
    unpaidCount,
    fullyPaidPercentage,
    partPaidPercentage,
    unpaidPercentage,
    topClassByAmount,
    topClassByRate,
    averageFee: count > 0 ? Math.round(totalFees / count) : 0,
    averagePaidPerStudent: count > 0 ? Math.round(totalPaid / count) : 0,
  };
}

/**
 * Canonical processor for student payments across tuition, admission, lesson, exam, and custom categories.
 * Correctly computes category breakdowns, cumulative paid amounts, live balance, and digital receipt.
 */
export function processStudentPayment(
  student: StudentPaymentRecord,
  paymentAmount: number,
  paymentMethod: string = 'Cash / Direct Transfer',
  feeCategory?: {
    categoryType?: 'tuition' | 'admission' | 'lesson' | 'exam' | 'custom';
    lessonMonth?: string;
    isPartPayment?: boolean;
    feeDescription?: string;
    receiptNumber?: string;
  },
  schoolProfile?: SchoolProfile
): { updatedRecord: StudentPaymentRecord; receipt: PaymentReceipt } {
  if (paymentAmount <= 0) {
    throw new Error('Payment amount must be greater than zero.');
  }

  const today = getTodayDateString();
  const breakdown = deriveFeeBreakdown(student, schoolProfile);
  const categoryType = feeCategory?.categoryType || 'tuition';
  const enteredReceiptNo = feeCategory?.receiptNumber?.trim();
  const effectiveReceiptNumber = enteredReceiptNo || student.receipt_no || generateReceiptNumber();

  let updatedTuitionFee = breakdown.tuitionFee;
  let updatedTuitionPaid = breakdown.tuitionPaid;
  let updatedTuitionStatus = breakdown.tuitionStatus;

  let updatedAdmissionFee = breakdown.admissionFee;
  let updatedAdmissionPaid = breakdown.admissionPaid;
  let updatedAdmissionStatus = breakdown.admissionStatus;

  let updatedLessonFee = breakdown.lessonFee;
  let updatedLessonPaid = breakdown.lessonPaid;
  let updatedLessonMonths = breakdown.lessonMonths;
  let updatedLessonStatus = breakdown.lessonStatus;

  let updatedExamFee = breakdown.examFee;
  let updatedExamPaid = breakdown.examPaid;
  let updatedExamStatus = breakdown.examStatus;

  let receiptFee = updatedTuitionFee;
  let receiptPaid = updatedTuitionPaid;
  let receiptBalance = Math.max(0, updatedTuitionFee - updatedTuitionPaid);
  let receiptStatus = updatedTuitionStatus;

  if (categoryType === 'admission') {
    updatedAdmissionPaid = breakdown.admissionPaid + paymentAmount;
    updatedAdmissionStatus = calculateStatus(updatedAdmissionFee, updatedAdmissionPaid);

    receiptFee = updatedAdmissionFee;
    receiptPaid = updatedAdmissionPaid;
    receiptBalance = Math.max(0, updatedAdmissionFee - updatedAdmissionPaid);
    receiptStatus = updatedAdmissionStatus;

  } else if (categoryType === 'lesson') {
    updatedLessonPaid = breakdown.lessonPaid + paymentAmount;
    updatedLessonStatus = calculateStatus(updatedLessonFee, updatedLessonPaid);
    
    if (feeCategory?.lessonMonth) {
      if (!updatedLessonMonths || updatedLessonMonths === 'Unpaid' || updatedLessonMonths === 'None') {
        updatedLessonMonths = feeCategory.lessonMonth;
      } else if (!updatedLessonMonths.includes(feeCategory.lessonMonth)) {
        updatedLessonMonths = `${updatedLessonMonths}, ${feeCategory.lessonMonth}`;
      }
    } else if (updatedLessonStatus === 'fully_paid' && (!updatedLessonMonths || updatedLessonMonths === 'Unpaid')) {
      updatedLessonMonths = 'Termly (Paid)';
    }

    receiptFee = updatedLessonFee;
    receiptPaid = updatedLessonPaid;
    receiptBalance = Math.max(0, updatedLessonFee - updatedLessonPaid);
    receiptStatus = updatedLessonStatus;

  } else if (categoryType === 'exam') {
    updatedExamPaid = breakdown.examPaid + paymentAmount;
    updatedExamStatus = calculateStatus(updatedExamFee, updatedExamPaid);

    receiptFee = updatedExamFee;
    receiptPaid = updatedExamPaid;
    receiptBalance = Math.max(0, updatedExamFee - updatedExamPaid);
    receiptStatus = updatedExamStatus;

  } else {
    // Tuition / School Fee
    updatedTuitionPaid = breakdown.tuitionPaid + paymentAmount;
    updatedTuitionStatus = calculateStatus(updatedTuitionFee, updatedTuitionPaid);

    receiptFee = updatedTuitionFee;
    receiptPaid = updatedTuitionPaid;
    receiptBalance = Math.max(0, updatedTuitionFee - updatedTuitionPaid);
    receiptStatus = updatedTuitionStatus;
  }

  // Calculate student's overall totals across all fees
  const overallFeeAmount = updatedTuitionFee + updatedAdmissionFee + updatedLessonFee + updatedExamFee;
  const overallAmountPaid = updatedTuitionPaid + updatedAdmissionPaid + updatedLessonPaid + updatedExamPaid;
  const overallBalance = Math.max(0, overallFeeAmount - overallAmountPaid);
  const overallStatus = calculateStatus(overallFeeAmount, overallAmountPaid);

  const updatedReceiptNo = enteredReceiptNo !== undefined && enteredReceiptNo !== ''
    ? enteredReceiptNo
    : effectiveReceiptNumber;

  const updatedRecord: StudentPaymentRecord = {
    ...student,
    fee_amount: overallFeeAmount,
    amount_paid: overallAmountPaid,
    balance: overallBalance,
    status: overallStatus,
    payment_date: today,
    tuition_fee: updatedTuitionFee,
    tuition_paid: updatedTuitionPaid,
    tuition_status: updatedTuitionStatus,
    admission_fee: updatedAdmissionFee,
    admission_paid: updatedAdmissionPaid,
    admission_status: updatedAdmissionStatus,
    lesson_fee: updatedLessonFee,
    lesson_paid: updatedLessonPaid,
    lesson_status: updatedLessonStatus,
    lesson_months: updatedLessonMonths,
    exam_fee: updatedExamFee,
    exam_paid: updatedExamPaid,
    exam_status: updatedExamStatus,
    receipt_no: updatedReceiptNo,
    total_remitted: student.total_remitted || 0,
  };

  const receipt: PaymentReceipt = {
    receiptNumber: effectiveReceiptNumber,
    studentId: student.id,
    studentName: student.full_name,
    studentClass: student.class,
    term: student.term,
    session: student.session || '2026/2027',
    amountPaidNow: paymentAmount,
    paymentDate: today,
    paymentMethod,
    totalPaid: overallAmountPaid,
    totalFee: overallFeeAmount,
    remainingBalance: overallBalance,
    status: overallStatus,
    timestamp: new Date().toISOString(),
    feeCategory: categoryType === 'tuition' ? 'school_fee' : (categoryType as any),
    feeItemDescription: feeCategory?.feeDescription || (categoryType === 'lesson' ? `Lesson Fee (${updatedLessonMonths || 'General'})` : categoryType === 'exam' ? 'Exam Fee' : categoryType === 'admission' ? 'Admission (New)' : 'Tuition Fee'),
  };

  return { updatedRecord, receipt };
}
