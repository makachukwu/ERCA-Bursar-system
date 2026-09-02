/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import { 
  Wallet, 
  ArrowUpRight, 
  ArrowDownLeft, 
  Building, 
  CheckCircle2, 
  Plus, 
  Trash2, 
  Printer, 
  Download, 
  Calendar, 
  FileText, 
  Clock, 
  AlertCircle, 
  ShieldCheck, 
  X, 
  DollarSign, 
  Layers, 
  UserCheck, 
  Landmark,
  HandCoins,
  History,
  Receipt,
  CloudCheck,
  RefreshCw,
  Edit2,
  AlertTriangle,
  RotateCcw
} from 'lucide-react';
import { StudentPaymentRecord, RemittanceRecord, BursarSession } from '../types';
import { 
  getSavedRemittances, 
  saveRemittances,
  addRemittance, 
  deleteRemittance, 
  updateRemittance,
  approveRemittance,
  rejectRemittance,
  clearAllRemittances,
  calculateCollectionMetrics,
  mergeRemittanceRecords
} from '../services/remittanceService';
import { formatCurrency, formatDate, getTodayDateString } from '../services/calculations';
import { recordAuditLog } from '../services/auditLoggerService';
import { 
  batchSaveStudentsToFirestore,
  saveRemittanceToFirestore,
  getRemittancesFromFirestore,
  subscribeRemittancesFromFirestore,
  deleteRemittanceFromFirestore,
  wipeSchoolRemittancesFromFirestore,
  recordFirebaseSyncSuccess
} from '../services/firebase';

interface CollectionViewProps {
  students: StudentPaymentRecord[];
  session: BursarSession;
  onUpdateStudents?: (students: StudentPaymentRecord[]) => void;
  onSelectStudent?: (student: StudentPaymentRecord) => void;
  onOpenRecordPayment?: () => void;
}

export const CollectionView: React.FC<CollectionViewProps> = ({
  students,
  session,
  onUpdateStudents,
  onSelectStudent,
  onOpenRecordPayment,
}) => {
  const [remittances, setRemittances] = useState<RemittanceRecord[]>([]);
  const [isRecordModalOpen, setIsRecordModalOpen] = useState(false);
  const [activeSubTab, setActiveSubTab] = useState<'remittances' | 'collections' | 'reconciliation'>('remittances');
  
  // Deletion & Editing Modals State
  const [remittanceToDelete, setRemittanceToDelete] = useState<RemittanceRecord | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isClearAllModalOpen, setIsClearAllModalOpen] = useState(false);
  const [isClearingAll, setIsClearingAll] = useState(false);
  const [remittanceToEdit, setRemittanceToEdit] = useState<RemittanceRecord | null>(null);
  const [isEditing, setIsEditing] = useState(false);

  // Approval & RBAC State
  const isAdmin = session.role === 'admin';
  const [remittanceFilter, setRemittanceFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all');
  const [remittanceToReject, setRemittanceToReject] = useState<RemittanceRecord | null>(null);
  const [rejectionReasonInput, setRejectionReasonInput] = useState('');
  const [isApprovingId, setIsApprovingId] = useState<string | null>(null);

  // Remittance form state
  const [amountInput, setAmountInput] = useState('');
  const [dateInput, setDateInput] = useState(getTodayDateString());
  const [remittedToInput, setRemittedToInput] = useState('First Bank (School Main Account)');
  const [customRecipient, setCustomRecipient] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'bank_deposit' | 'bank_transfer' | 'cash_handover' | 'pos_settlement' | 'other'>('bank_deposit');
  const [referenceNotes, setReferenceNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [successToast, setSuccessToast] = useState<string | null>(null);
  const [errorToast, setErrorToast] = useState<string | null>(null);
  const [isSyncingRemittances, setIsSyncingRemittances] = useState(false);

  const currentSchoolId = session.schoolId || 'eminent-academy';

  // 1. Load initial local remittances immediately for zero-wait display
  useEffect(() => {
    const loaded = getSavedRemittances(currentSchoolId);
    setRemittances(loaded);
  }, [currentSchoolId]);

  // 2. Real-time Firestore synchronization & automatic cloud reconciliation
  useEffect(() => {
    let isCancelled = false;

    // Fast initial query + automatic reconciliation of unsynced local records
    getRemittancesFromFirestore(currentSchoolId)
      .then(async (cloudRemittances) => {
        if (isCancelled) return;
        const local = getSavedRemittances(currentSchoolId);

        // Upload any local remittances that are not yet in Firestore (e.g. created on bursar device before online sync)
        const cloudIds = new Set(cloudRemittances.map((r) => r.id));
        const unsynced = local.filter((r) => r.id && !cloudIds.has(r.id));
        if (unsynced.length > 0) {
          for (const item of unsynced) {
            await saveRemittanceToFirestore(item, currentSchoolId).catch((err) => {
              console.warn('[Remittance Sync] Background upload note:', err);
            });
          }
        }

        const merged = mergeRemittanceRecords(local, cloudRemittances);
        setRemittances(merged);
        saveRemittances(merged, currentSchoolId);
        recordFirebaseSyncSuccess();
      })
      .catch((err) => {
        console.warn('[Firestore] Initial remittance load note:', err);
      });

    // Real-time snapshot listener: when bursar adds or admin approves, all connected devices update instantly
    const unsubscribe = subscribeRemittancesFromFirestore(currentSchoolId, (liveRemittances) => {
      if (isCancelled) return;
      setRemittances((prevLocal) => {
        const merged = mergeRemittanceRecords(prevLocal, liveRemittances);
        saveRemittances(merged, currentSchoolId);
        return merged;
      });
    });

    return () => {
      isCancelled = true;
      if (unsubscribe) unsubscribe();
    };
  }, [currentSchoolId]);

  // Manual cloud refresh handler
  const handleManualCloudSync = async () => {
    setIsSyncingRemittances(true);
    try {
      const cloudRemittances = await getRemittancesFromFirestore(currentSchoolId);
      const local = getSavedRemittances(currentSchoolId);

      // Reconcile
      const cloudIds = new Set(cloudRemittances.map((r) => r.id));
      const unsynced = local.filter((r) => r.id && !cloudIds.has(r.id));
      for (const item of unsynced) {
        await saveRemittanceToFirestore(item, currentSchoolId).catch(console.warn);
      }

      const merged = mergeRemittanceRecords(local, cloudRemittances);
      setRemittances(merged);
      saveRemittances(merged, currentSchoolId);
      recordFirebaseSyncSuccess();

      setSuccessToast(`✓ Cloud synchronized! Loaded ${merged.length} remittance records.`);
      setTimeout(() => setSuccessToast(null), 3500);
    } catch (err: any) {
      setErrorToast('Cloud sync error: ' + (err?.message || 'Check connection'));
      setTimeout(() => setErrorToast(null), 4000);
    } finally {
      setIsSyncingRemittances(false);
    }
  };

  const [visibleCollectionsCount, setVisibleCollectionsCount] = useState(30);

  const metrics = useMemo(() => {
    return calculateCollectionMetrics(students, remittances);
  }, [students, remittances]);

  const pendingRemittances = useMemo(() => {
    return remittances.filter((r) => r.status === 'pending' || r.approvalStatus === 'pending');
  }, [remittances]);

  const approvedRemittances = useMemo(() => {
    return remittances.filter((r) => r.status === 'approved' || r.approvalStatus === 'approved' || (!r.status && !r.approvalStatus));
  }, [remittances]);

  const rejectedRemittances = useMemo(() => {
    return remittances.filter((r) => r.status === 'rejected' || r.approvalStatus === 'rejected');
  }, [remittances]);

  const totalPendingAmount = useMemo(() => {
    return pendingRemittances.reduce((acc, r) => acc + (Number(r.amount) || 0), 0);
  }, [pendingRemittances]);

  const totalApprovedAmount = useMemo(() => {
    return approvedRemittances.reduce((acc, r) => acc + (Number(r.amount) || 0), 0);
  }, [approvedRemittances]);

  const currentTerm = students[0]?.term || 'Current Term';
  const currentSession = students[0]?.session || '2025-2026';

  const handleOpenRemitModal = (prefillAmount?: number) => {
    setAmountInput(prefillAmount !== undefined ? String(prefillAmount) : metrics.cashInHand > 0 ? String(metrics.cashInHand) : '');
    setDateInput(getTodayDateString());
    setRemittedToInput('First Bank (School Main Account)');
    setCustomRecipient('');
    setPaymentMethod('bank_deposit');
    setReferenceNotes('');
    setFormError(null);
    setIsRecordModalOpen(true);
  };

  const handleOpenEditModal = (remittance: RemittanceRecord) => {
    setRemittanceToEdit(remittance);
    setAmountInput(String(remittance.amount));
    setDateInput(remittance.date || getTodayDateString());
    const standardRecipients = [
      'First Bank (School Main Account)',
      'Zenith Bank (School Ops Account)',
      'GTBank (Tuition Account)',
      'Principal / Proprietor Handover',
      'School Management Committee',
      'School Cash Vault / Safe',
    ];
    if (standardRecipients.includes(remittance.remittedTo)) {
      setRemittedToInput(remittance.remittedTo);
      setCustomRecipient('');
    } else {
      setRemittedToInput('Custom');
      setCustomRecipient(remittance.remittedTo);
    }
    setPaymentMethod(remittance.paymentMethod || 'bank_deposit');
    setReferenceNotes(remittance.notes || '');
    setFormError(null);
  };

  const handleSaveRemittance = async (e: React.FormEvent) => {
    e.preventDefault();
    const numAmount = Number(amountInput);

    if (isNaN(numAmount) || numAmount <= 0) {
      setFormError('Please enter a valid remittance amount greater than 0.');
      return;
    }

    const finalRecipient = remittedToInput === 'Custom' ? customRecipient.trim() : remittedToInput;
    if (!finalRecipient) {
      setFormError('Please select or specify where the funds were remitted/handed over.');
      return;
    }

    setIsSubmitting(true);
    try {
      const userRole = session.role || (isAdmin ? 'admin' : 'bursar');
      const isAutoApproved = userRole === 'admin';

      const { newRecord, allRecords } = addRemittance(
        {
          amount: numAmount,
          date: dateInput || getTodayDateString(),
          remittedTo: finalRecipient,
          bursarName: session.bursarName || (isAutoApproved ? 'Administrator' : 'Bursar'),
          term: currentTerm,
          session: currentSession,
          notes: referenceNotes.trim() || undefined,
          paymentMethod,
          submittedBy: session.bursarName || (isAutoApproved ? 'Administrator' : 'Bursar'),
          submittedByRole: (userRole === 'admin' || userRole === 'bursar' ? userRole : 'bursar') as 'admin' | 'bursar',
          status: isAutoApproved ? 'approved' : 'pending',
          approvalStatus: isAutoApproved ? 'approved' : 'pending',
          approvedBy: isAutoApproved ? (session.bursarName || 'Administrator') : undefined,
          approvedAt: isAutoApproved ? new Date().toISOString() : undefined,
        },
        remittances,
        currentSchoolId
      );

      setRemittances(allRecords);
      setIsRecordModalOpen(false);

      // Persist to Cloud Firestore immediately for multi-device sync
      try {
        await saveRemittanceToFirestore(newRecord, currentSchoolId);
      } catch (cloudErr) {
        console.warn('[Remittance] Cloud sync note:', cloudErr);
      }

      // Only approved remittances update total_remitted in official student books
      const newTotalApprovedRemitted = allRecords
        .filter((r) => r.status === 'approved' || r.approvalStatus === 'approved' || (!r.status && !r.approvalStatus))
        .reduce((acc, r) => acc + (Number(r.amount) || 0), 0);

      // Update in-memory student roster
      if (onUpdateStudents && students.length > 0) {
        const updated = students.map((s) => ({
          ...s,
          total_remitted: newTotalApprovedRemitted,
        }));
        onUpdateStudents(updated);
      }

      const refCode = referenceNotes.trim() || `RMT-${Date.now().toString().slice(-6)}`;

      if (isAutoApproved) {
        recordAuditLog(
          'REMITTANCE',
          'RECORD_REMITTANCE',
          `Admin [${session.bursarName}] recorded and auto-approved remittance of ${formatCurrency(numAmount, session.currencySymbol)} handed over to "${finalRecipient}" [Ref: ${refCode}]`,
          { amount: numAmount, remittedTo: finalRecipient, ref: refCode, paymentMethod, status: 'approved' },
          session.bursarName,
          session.schoolId,
          'SUCCESS'
        );
        setSuccessToast(`✓ Remittance of ${formatCurrency(numAmount, session.currencySymbol)} recorded & approved into the official ledger!`);
      } else {
        recordAuditLog(
          'REMITTANCE',
          'SUBMIT_REMITTANCE',
          `Bursar [${session.bursarName}] submitted remittance of ${formatCurrency(numAmount, session.currencySymbol)} to "${finalRecipient}" [Ref: ${refCode}] for Admin Approval`,
          { amount: numAmount, remittedTo: finalRecipient, ref: refCode, paymentMethod, status: 'pending' },
          session.bursarName,
          session.schoolId,
          'INFO'
        );
        setSuccessToast(`📋 Remittance of ${formatCurrency(numAmount, session.currencySymbol)} submitted for Admin Approval. It will enter the official books once approved.`);
      }

      setTimeout(() => setSuccessToast(null), 5000);
    } catch (err: any) {
      setFormError(err.message || 'Failed to record remittance.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleApproveRemittanceItem = async (remittance: RemittanceRecord) => {
    if (!isAdmin) {
      setErrorToast('Permission Denied: Only School Administrator / Proprietor can approve remittances into the official book.');
      setTimeout(() => setErrorToast(null), 4000);
      return;
    }

    setIsApprovingId(remittance.id);
    try {
      const { approvedRecord, allRecords } = approveRemittance(
        remittance.id,
        session.bursarName || 'Administrator',
        remittances,
        currentSchoolId
      );

      setRemittances(allRecords);

      // Persist approval status to Cloud Firestore immediately
      if (approvedRecord) {
        try {
          await saveRemittanceToFirestore(approvedRecord, currentSchoolId);
        } catch (cloudErr) {
          console.warn('[Remittance Approval] Cloud sync note:', cloudErr);
        }
      }

      const newTotalApprovedRemitted = allRecords
        .filter((r) => r.status === 'approved' || r.approvalStatus === 'approved' || (!r.status && !r.approvalStatus))
        .reduce((acc, r) => acc + (Number(r.amount) || 0), 0);

      if (onUpdateStudents && students.length > 0) {
        const updated = students.map((s) => ({
          ...s,
          total_remitted: newTotalApprovedRemitted,
        }));
        onUpdateStudents(updated);
      }

      recordAuditLog(
        'REMITTANCE',
        'APPROVE_REMITTANCE',
        `Admin [${session.bursarName}] APPROVED remittance of ${formatCurrency(remittance.amount, session.currencySymbol)} [Ref: ${remittance.referenceNumber}] to "${remittance.remittedTo}" — Posted to Official Ledger`,
        { id: remittance.id, amount: remittance.amount, ref: remittance.referenceNumber, approvedBy: session.bursarName },
        session.bursarName,
        session.schoolId,
        'SUCCESS'
      );

      setSuccessToast(`✓ Approved remittance ${remittance.referenceNumber} (${formatCurrency(remittance.amount, session.currencySymbol)})! Official books updated.`);
      setTimeout(() => setSuccessToast(null), 4500);
    } catch (err: any) {
      setErrorToast(err.message || 'Failed to approve remittance.');
      setTimeout(() => setErrorToast(null), 4000);
    } finally {
      setIsApprovingId(null);
    }
  };

  const handleConfirmReject = async () => {
    if (!remittanceToReject) return;
    if (!isAdmin) {
      setErrorToast('Permission Denied: Only School Administrator can reject remittances.');
      setTimeout(() => setErrorToast(null), 4000);
      return;
    }

    const reason = rejectionReasonInput.trim() || 'Rejected by Administrator during book reconciliation';
    try {
      const { rejectedRecord, allRecords } = rejectRemittance(
        remittanceToReject.id,
        session.bursarName || 'Administrator',
        reason,
        remittances,
        currentSchoolId
      );

      setRemittances(allRecords);

      // Persist rejection to Cloud Firestore
      if (rejectedRecord) {
        try {
          await saveRemittanceToFirestore(rejectedRecord, currentSchoolId);
        } catch (cloudErr) {
          console.warn('[Remittance Rejection] Cloud sync note:', cloudErr);
        }
      }

      const newTotalApprovedRemitted = allRecords
        .filter((r) => r.status === 'approved' || r.approvalStatus === 'approved' || (!r.status && !r.approvalStatus))
        .reduce((acc, r) => acc + (Number(r.amount) || 0), 0);

      if (onUpdateStudents && students.length > 0) {
        const updated = students.map((s) => ({
          ...s,
          total_remitted: newTotalApprovedRemitted,
        }));
        onUpdateStudents(updated);
      }

      recordAuditLog(
        'REMITTANCE',
        'REJECT_REMITTANCE',
        `Admin [${session.bursarName}] REJECTED remittance submission [Ref: ${remittanceToReject.referenceNumber}] for ${formatCurrency(remittanceToReject.amount, session.currencySymbol)}. Reason: ${reason}`,
        { id: remittanceToReject.id, amount: remittanceToReject.amount, ref: remittanceToReject.referenceNumber, reason },
        session.bursarName,
        session.schoolId,
        'WARNING'
      );

      setSuccessToast(`Remittance [${remittanceToReject.referenceNumber}] returned with review note.`);
      setRemittanceToReject(null);
      setRejectionReasonInput('');
      setTimeout(() => setSuccessToast(null), 4000);
    } catch (err: any) {
      setErrorToast(err.message || 'Failed to reject remittance.');
      setTimeout(() => setErrorToast(null), 4000);
    }
  };

  const handleSaveEditRemittance = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!remittanceToEdit) return;
    const numAmount = Number(amountInput);

    if (isNaN(numAmount) || numAmount <= 0) {
      setFormError('Please enter a valid remittance amount greater than 0.');
      return;
    }

    const finalRecipient = remittedToInput === 'Custom' ? customRecipient.trim() : remittedToInput;
    if (!finalRecipient) {
      setFormError('Please select or specify where the funds were remitted/handed over.');
      return;
    }

    setIsEditing(true);
    try {
      const updated = updateRemittance(
        remittanceToEdit.id,
        {
          amount: numAmount,
          date: dateInput || getTodayDateString(),
          remittedTo: finalRecipient,
          notes: referenceNotes.trim() || undefined,
          paymentMethod,
        },
        remittances,
        currentSchoolId
      );

      setRemittances(updated);
      setRemittanceToEdit(null);

      // Persist edited record to Cloud Firestore
      const updatedItem = updated.find((r) => r.id === remittanceToEdit.id);
      if (updatedItem) {
        try {
          await saveRemittanceToFirestore(updatedItem, currentSchoolId);
        } catch (cloudErr) {
          console.warn('[Remittance Edit] Cloud sync note:', cloudErr);
        }
      }

      const newTotalRemitted = updated.reduce((acc, r) => acc + (Number(r.amount) || 0), 0);

      if (onUpdateStudents && students.length > 0) {
        const updatedStudents = students.map((s) => ({
          ...s,
          total_remitted: newTotalRemitted,
        }));
        onUpdateStudents(updatedStudents);
      }

      recordAuditLog(
        'REMITTANCE',
        'UPDATE_REMITTANCE',
        `Updated remittance [${remittanceToEdit.referenceNumber}] to ${formatCurrency(numAmount, session.currencySymbol)} (Recipient: ${finalRecipient})`,
        { id: remittanceToEdit.id, amount: numAmount, remittedTo: finalRecipient },
        session.bursarName,
        session.schoolId,
        'INFO'
      );

      setSuccessToast(`Remittance updated to ${formatCurrency(numAmount, session.currencySymbol)}.`);
      setTimeout(() => setSuccessToast(null), 3000);
    } catch (err: any) {
      setFormError(err.message || 'Failed to update remittance.');
    } finally {
      setIsEditing(false);
    }
  };

  const confirmDeleteRemittance = async () => {
    if (!remittanceToDelete) return;
    setIsDeleting(true);
    try {
      const deletedAmount = remittanceToDelete.amount;
      const updated = deleteRemittance(remittanceToDelete.id, remittances, currentSchoolId);
      setRemittances(updated);
      setRemittanceToDelete(null);

      // Delete from Cloud Firestore
      try {
        await deleteRemittanceFromFirestore(remittanceToDelete.id, currentSchoolId);
      } catch (cloudErr) {
        console.warn('[Remittance Delete] Cloud sync note:', cloudErr);
      }

      const newTotalRemitted = updated.reduce((acc, r) => acc + (Number(r.amount) || 0), 0);

      if (onUpdateStudents && students.length > 0) {
        const updatedStudents = students.map((s) => ({
          ...s,
          total_remitted: newTotalRemitted,
        }));
        onUpdateStudents(updatedStudents);
      }

      recordAuditLog(
        'REMITTANCE',
        'DELETE_REMITTANCE',
        `Deleted remittance of ${formatCurrency(deletedAmount, session.currencySymbol)} [Ref: ${remittanceToDelete.referenceNumber}]`,
        { id: remittanceToDelete.id, amount: deletedAmount, ref: remittanceToDelete.referenceNumber },
        session.bursarName,
        session.schoolId,
        'WARNING'
      );

      setSuccessToast(`Remittance record (${formatCurrency(deletedAmount, session.currencySymbol)}) deleted and balance updated.`);
      setTimeout(() => setSuccessToast(null), 3000);
    } catch (err: any) {
      setFormError(err?.message || 'Failed to delete remittance');
    } finally {
      setIsDeleting(false);
    }
  };

  const confirmClearAllRemittances = async () => {
    setIsClearingAll(true);
    try {
      const updated = clearAllRemittances(currentSchoolId);
      setRemittances(updated);
      setIsClearAllModalOpen(false);

      // Wipe from Cloud Firestore
      try {
        await wipeSchoolRemittancesFromFirestore(currentSchoolId);
      } catch (cloudErr) {
        console.warn('[Remittance Wipe] Cloud sync note:', cloudErr);
      }

      const newTotalRemitted = 0;

      recordAuditLog(
        'REMITTANCE',
        'CLEAR_ALL_REMITTANCES',
        `Cleared and reset all remittance transactions`,
        {},
        session.bursarName,
        session.schoolId,
        'CRITICAL'
      );

      if (onUpdateStudents && students.length > 0) {
        const updatedStudents = students.map((s) => ({
          ...s,
          total_remitted: newTotalRemitted,
        }));
        onUpdateStudents(updatedStudents);
      }

      setSuccessToast('All remittance records cleared. Total remitted reset to 0.');
      setTimeout(() => setSuccessToast(null), 3000);
    } catch (err: any) {
      setFormError(err?.message || 'Failed to clear remittances');
    } finally {
      setIsClearingAll(false);
    }
  };

  const [isSyncingCloud, setIsSyncingCloud] = useState(false);

  const handleSyncTotalToCloud = async () => {
    setIsSyncingCloud(true);
    try {
      if (students.length > 0) {
        const updated = students.map((s, idx) => idx === 0 ? { ...s, total_remitted: metrics.totalRemitted } : s);
        if (onUpdateStudents) {
          onUpdateStudents(updated);
        }
        await batchSaveStudentsToFirestore(updated, session.schoolId || 'eminent-academy');
      }
      setSuccessToast(`Synced ${formatCurrency(metrics.totalRemitted, session.currencySymbol)} across records and Firebase!`);
      setTimeout(() => setSuccessToast(null), 3000);
    } catch (e: any) {
      setErrorToast('Failed to sync remittance: ' + (e?.message || 'Network error'));
      setTimeout(() => setErrorToast(null), 4000);
    } finally {
      setIsSyncingCloud(false);
    }
  };

  const handlePrintAudit = () => {
    window.print();
  };

  const handleExportCsv = () => {
    const headers = ['Reference', 'Date', 'Amount Remitted', 'Remitted To', 'Method', 'Bursar', 'Notes'];
    const rows = remittances.map((r) => [
      r.referenceNumber,
      r.date,
      r.amount,
      `"${r.remittedTo.replace(/"/g, '""')}"`,
      r.paymentMethod || '',
      `"${(r.bursarName || '').replace(/"/g, '""')}"`,
      `"${(r.notes || '').replace(/"/g, '""')}"`,
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Bursar_Remittances_${getTodayDateString()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Student collections list (students with amount_paid > 0 or admission_paid > 0 or lesson_paid > 0 or exam_paid > 0)
  const paidStudents = useMemo(() => {
    return students
      .filter((s) => {
        const admissionFee = Number(s.admission_fee) || 0;
        const admissionPaid = Number(s.admission_paid) || (admissionFee > 0 && s.is_new_admission ? admissionFee : 0);
        return (
          (Number(s.amount_paid) || 0) > 0 ||
          admissionPaid > 0 ||
          (Number(s.lesson_paid) || 0) > 0 ||
          (Number(s.exam_paid) || 0) > 0
        );
      })
      .sort((a, b) => (b.payment_date || '').localeCompare(a.payment_date || ''));
  }, [students]);

  return (
    <div className="px-4 py-4 space-y-4 pb-28">
      {/* Printable Audit Header (Hidden on screen, visible when printing) */}
      <div className="hidden print:block p-4 border-b-2 border-black text-center space-y-1 mb-4">
        <h1 className="text-xl font-black uppercase tracking-tight">{session.schoolName || 'Dominion College'}</h1>
        <h2 className="text-sm font-bold uppercase tracking-wider text-slate-700">
          Bursar Collection & Remittance Reconciliation Statement
        </h2>
        <p className="text-xs text-slate-600 font-mono">
          Term: {currentTerm} | Session: {currentSession} | Generated: {formatDate(getTodayDateString())} | Bursar: {session.bursarName}
        </p>
      </div>

      {/* Success Notification Banner */}
      {successToast && (
        <div className="p-3 bg-emerald-600 text-white rounded-2xl shadow-md text-xs font-bold flex items-center justify-between animate-in fade-in slide-in-from-top-2">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4" />
            <span>{successToast}</span>
          </div>
          <button onClick={() => setSuccessToast(null)} className="p-1 hover:bg-emerald-700 rounded-lg cursor-pointer">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Error Notification Banner */}
      {errorToast && (
        <div className="p-3 bg-rose-600 text-white rounded-2xl shadow-md text-xs font-bold flex items-center justify-between animate-in fade-in slide-in-from-top-2">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4" />
            <span>{errorToast}</span>
          </div>
          <button onClick={() => setErrorToast(null)} className="p-1 hover:bg-rose-700 rounded-lg cursor-pointer">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Top Banner: Overview & Fast Actions */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-blue-600 text-white flex items-center justify-center shadow-xs">
            <HandCoins className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-slate-900">Bursar Collections & Remittances</h2>
            <p className="text-[11px] text-slate-500 font-medium">
              Accountability ledger for fee collections, bank deposits, and cash in hand
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleManualCloudSync}
            disabled={isSyncingRemittances}
            id="sync-remittances-top-btn"
            title="Synchronize with Cloud Firestore to fetch records from other devices"
            className="p-2 bg-slate-50 hover:bg-slate-100 text-slate-700 rounded-xl border border-slate-200 text-xs font-bold flex items-center gap-1 active:scale-95 transition-all shadow-2xs cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 text-slate-600 ${isSyncingRemittances ? 'animate-spin text-blue-600' : ''}`} />
            <span className="hidden sm:inline">Sync Cloud</span>
          </button>

          <button
            onClick={() => handleOpenRemitModal()}
            id="record-remittance-top-btn"
            className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 active:scale-95 transition-all shadow-xs cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Record Remittance</span>
          </button>

          <button
            onClick={handlePrintAudit}
            id="print-remittance-statement-btn"
            title="Print Remittance Statement"
            className="p-2 bg-slate-50 hover:bg-slate-100 text-slate-700 rounded-xl border border-slate-200 text-xs font-bold flex items-center gap-1 active:scale-95 transition-all shadow-2xs cursor-pointer"
          >
            <Printer className="w-4 h-4 text-slate-600" />
            <span className="hidden sm:inline">Print Voucher</span>
          </button>
        </div>
      </div>

      {/* PRIMARY 3 FINANCIAL METRICS CARDS */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {/* Card 1: How Much Bursar Has Collected */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs relative overflow-hidden flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
              Total Collected (Overall)
            </span>
            <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <ArrowDownLeft className="w-4 h-4" />
            </div>
          </div>

          <div className="my-2">
            <div className="text-2xl font-black tracking-tight text-slate-900 font-mono">
              {formatCurrency(metrics.totalCollected, session.currencySymbol)}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-1 mt-2 text-[9px] font-bold">
              <div className="bg-blue-50 text-blue-900 px-1.5 py-1 rounded-lg truncate">
                <span className="text-blue-600 block text-[8px] uppercase">School Fee</span>
                {formatCurrency(metrics.totalTuitionCollected, session.currencySymbol)}
              </div>
              <div className="bg-purple-50 text-purple-900 px-1.5 py-1 rounded-lg truncate">
                <span className="text-purple-600 block text-[8px] uppercase">Admission</span>
                {formatCurrency(metrics.totalAdmissionCollected, session.currencySymbol)}
              </div>
              <div className="bg-emerald-50 text-emerald-900 px-1.5 py-1 rounded-lg truncate">
                <span className="text-emerald-600 block text-[8px] uppercase">Lesson Fee</span>
                {formatCurrency(metrics.totalLessonCollected, session.currencySymbol)}
              </div>
              <div className="bg-amber-50 text-amber-900 px-1.5 py-1 rounded-lg truncate">
                <span className="text-amber-600 block text-[8px] uppercase">Exam Fee</span>
                {formatCurrency(metrics.totalExamCollected, session.currencySymbol)}
              </div>
            </div>
          </div>

          <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[10px] text-slate-500 font-medium">
            <span className="truncate">{metrics.collectionCount} student payments</span>
            <span className="font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">
              Received
            </span>
          </div>
        </div>

        {/* Card 2: How Much Bursar Has Remitted */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs relative overflow-hidden flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
              Total Remitted
            </span>
            <div className="flex items-center gap-1.5">
              {metrics.totalRemitted > 0 && (
                <button
                  type="button"
                  onClick={() => setIsClearAllModalOpen(true)}
                  title="Reset or Clear All Remitted Amount"
                  className="px-2 py-1 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 transition-colors text-[10px] font-bold flex items-center gap-1 cursor-pointer border border-rose-200"
                >
                  <Trash2 className="w-3 h-3 text-rose-600" />
                  <span>Reset</span>
                </button>
              )}
              <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
                <ArrowUpRight className="w-4 h-4" />
              </div>
            </div>
          </div>

          <div className="my-2">
            <div className="text-2xl font-black tracking-tight text-blue-600 font-mono">
              {formatCurrency(metrics.totalRemitted, session.currencySymbol)}
            </div>
            <p className="text-[11px] text-slate-500 font-medium mt-0.5">
              Deposited across <span className="font-bold text-slate-700">{metrics.remittanceCount}</span> remittances
            </p>
          </div>

          <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[10px] text-slate-500 font-medium">
            <span className="truncate flex items-center gap-1 font-mono text-[9px] text-blue-800 bg-blue-50/80 px-2 py-0.5 rounded-md border border-blue-100/60">
              <CheckCircle2 className="w-3 h-3 text-blue-600 shrink-0" />
              Cloud: <strong className="font-bold">total_remitted</strong>
            </span>
            <button
              onClick={handleSyncTotalToCloud}
              disabled={isSyncingCloud}
              title="Sync Total Remitted to Firestore"
              className="font-bold text-blue-600 hover:text-blue-800 text-[10px] flex items-center gap-1 cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-3 h-3 ${isSyncingCloud ? 'animate-spin' : ''}`} />
              <span>Sync</span>
            </button>
          </div>
        </div>

        {/* Card 3: How Much Is With Her Currently (Cash at Hand) */}
        <div className={`p-4 rounded-2xl border shadow-xs relative overflow-hidden flex flex-col justify-between ${
          metrics.cashInHand > 0
            ? 'bg-amber-50/60 border-amber-300'
            : 'bg-white border-slate-200'
        }`}>
          <div className="flex items-center justify-between">
            <span className={`text-[11px] font-bold uppercase tracking-wider ${
              metrics.cashInHand > 0 ? 'text-amber-900' : 'text-slate-500'
            }`}>
              Cash With Bursar (Currently)
            </span>
            <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${
              metrics.cashInHand > 0 ? 'bg-amber-200 text-amber-900' : 'bg-emerald-50 text-emerald-600'
            }`}>
              <Wallet className="w-4 h-4" />
            </div>
          </div>

          <div className="my-2">
            <div className={`text-2xl font-black tracking-tight font-mono ${
              metrics.cashInHand > 0 ? 'text-amber-950' : 'text-slate-900'
            }`}>
              {formatCurrency(metrics.cashInHand, session.currencySymbol)}
            </div>
            <p className={`text-[11px] font-medium mt-0.5 ${
              metrics.cashInHand > 0 ? 'text-amber-800' : 'text-slate-500'
            }`}>
              {metrics.cashInHand > 0 
                ? 'Pending deposit or handover'
                : '100% reconciled & deposited'}
            </p>
          </div>

          <div className="pt-2 border-t border-slate-200/60 flex items-center justify-between text-[10px]">
            {metrics.cashInHand > 0 ? (
              <>
                <span className="font-bold text-amber-900">In Hand / Custody</span>
                <button
                  onClick={() => handleOpenRemitModal(metrics.cashInHand)}
                  className="font-bold text-amber-800 hover:text-amber-950 underline cursor-pointer"
                >
                  Remit All Now →
                </button>
              </>
            ) : (
              <>
                <span className="text-slate-500 font-medium">All collections remitted</span>
                <span className="font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" />
                  Balanced
                </span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* PENDING APPROVAL NOTIFICATION FOR OTHER TABS */}
      {pendingRemittances.length > 0 && activeSubTab !== 'remittances' && (
        <div className="p-3.5 sm:p-4 rounded-2xl border bg-amber-50 border-amber-300 shadow-xs flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-amber-200 text-amber-900 flex items-center justify-center font-bold text-xs shrink-0">
              <Clock className="w-4 h-4" />
            </div>
            <div>
              <span className="text-xs font-bold text-amber-950 block">
                {isAdmin
                  ? `⚡ ${pendingRemittances.length} Remittance(s) Awaiting Your Approval (${formatCurrency(totalPendingAmount, session.currencySymbol)})`
                  : `⏳ You have ${pendingRemittances.length} Remittance(s) Pending Admin Approval (${formatCurrency(totalPendingAmount, session.currencySymbol)})`}
              </span>
              <p className="text-[11px] text-amber-800">
                {isAdmin ? 'Click below to review and approve into the official ledger.' : 'Funds remain in custody until the administrator reviews and approves.'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setActiveSubTab('remittances')}
            className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold shadow-2xs active:scale-95 transition-all cursor-pointer"
          >
            Review Remittances →
          </button>
        </div>
      )}

      {/* SUB-TABS: Remittances vs. Student Fee Collections Stream vs. Reconciliation */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="border-b border-slate-200 px-4 pt-3 flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveSubTab('remittances')}
              id="subtab-remittances"
              className={`pb-3 text-xs font-bold border-b-2 flex items-center gap-1.5 transition-all cursor-pointer ${
                activeSubTab === 'remittances'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-slate-500 hover:text-slate-900'
              }`}
            >
              <History className="w-4 h-4" />
              <span>Remittances ({remittances.length})</span>
            </button>

            <button
              onClick={() => setActiveSubTab('collections')}
              id="subtab-collections"
              className={`pb-3 text-xs font-bold border-b-2 flex items-center gap-1.5 transition-all cursor-pointer ${
                activeSubTab === 'collections'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-slate-500 hover:text-slate-900'
              }`}
            >
              <Receipt className="w-4 h-4" />
              <span>Student Collections ({paidStudents.length})</span>
            </button>

            <button
              onClick={() => setActiveSubTab('reconciliation')}
              id="subtab-reconciliation"
              className={`pb-3 text-xs font-bold border-b-2 flex items-center gap-1.5 transition-all cursor-pointer ${
                activeSubTab === 'reconciliation'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-slate-500 hover:text-slate-900'
              }`}
            >
              <ShieldCheck className="w-4 h-4" />
              <span>Audit Summary</span>
            </button>
          </div>

          <div className="flex items-center gap-2">
            {activeSubTab === 'remittances' && remittances.length > 0 && (
              <>
                {isAdmin && (
                  <button
                    type="button"
                    onClick={() => setIsClearAllModalOpen(true)}
                    className="pb-3 text-[11px] font-bold text-rose-600 hover:text-rose-700 flex items-center gap-1 cursor-pointer transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Clear All ({remittances.length})</span>
                  </button>
                )}
                <button
                  onClick={handleExportCsv}
                  className="pb-3 text-[11px] font-bold text-slate-600 hover:text-slate-900 flex items-center gap-1 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Export CSV</span>
                </button>
              </>
            )}
          </div>
        </div>

        {/* Tab 1 Content: Remittances (Two-Sided Pending & Approved with Add Remittance Above) */}
        {activeSubTab === 'remittances' && (
          <div className="p-4 space-y-4">
            {/* ACTION & OVERVIEW BAR (PLACED DIRECTLY ABOVE PENDING & APPROVED SIDES) */}
            <div className="p-4 sm:p-5 bg-gradient-to-r from-blue-950 via-slate-900 to-indigo-950 text-white rounded-2xl shadow-sm border border-slate-800">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-blue-500/20 text-blue-300 border border-blue-400/30 flex items-center justify-center shrink-0 mt-0.5">
                    <Landmark className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-sm sm:text-base font-black tracking-tight text-white">
                        Fund Remittances & Ledger
                      </h3>
                      <span className={`text-[10px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider ${
                        isAdmin ? 'bg-amber-400 text-slate-950' : 'bg-blue-400 text-slate-950'
                      }`}>
                        {isAdmin ? 'Administrator Mode' : 'Bursar Mode'}
                      </span>
                    </div>
                    <p className="text-xs text-blue-200/90 font-medium mt-1 max-w-2xl leading-relaxed">
                      {isAdmin
                        ? 'When Bursar records a remittance, it goes to Pending. Review and click "Approve" to move it into Approved and book into the official cash balance.'
                        : 'Record fee deposits or handovers below. New remittances go to the Pending side until verified and approved by the School Administrator.'}
                    </p>
                  </div>
                </div>

                {/* Prominent Action Buttons Above */}
                <div className="flex items-center gap-2 flex-wrap sm:shrink-0">
                  <button
                    type="button"
                    onClick={handleManualCloudSync}
                    disabled={isSyncingRemittances}
                    title="Synchronize with Cloud Firestore to fetch remittances from other devices"
                    className="px-3 py-2.5 bg-slate-800 hover:bg-slate-700 text-blue-200 border border-slate-700 rounded-xl text-xs font-bold shadow-xs flex items-center gap-1.5 active:scale-95 transition-all cursor-pointer disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isSyncingRemittances ? 'animate-spin text-blue-400' : 'text-blue-300'}`} />
                    <span>{isSyncingRemittances ? 'Syncing...' : 'Sync Cloud'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleOpenRemitModal()}
                    id="record-remittance-main-btn"
                    className="px-4 py-2.5 bg-blue-500 hover:bg-blue-400 text-white rounded-xl text-xs font-black shadow-md flex items-center gap-2 active:scale-95 transition-all cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                    <span>+ Record Remittance</span>
                  </button>

                  {metrics.cashInHand > 0 && (
                    <button
                      type="button"
                      onClick={() => handleOpenRemitModal(metrics.cashInHand)}
                      className="px-3 py-2.5 bg-amber-400 hover:bg-amber-300 text-slate-950 rounded-xl text-xs font-black shadow-xs flex items-center gap-1.5 active:scale-95 transition-all cursor-pointer"
                      title="Quick remit all remaining cash in hand"
                    >
                      <Wallet className="w-4 h-4" />
                      <span>Remit Cash ({formatCurrency(metrics.cashInHand, session.currencySymbol)})</span>
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* TWO SIDES: PENDING (LEFT) AND APPROVED (RIGHT) */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-5">
              {/* ================= LEFT SIDE: ⏳ PENDING REMITTANCES ================= */}
              <div className="bg-amber-50/30 rounded-2xl border-2 border-amber-200/80 overflow-hidden flex flex-col shadow-xs">
                {/* Pending Column Header */}
                <div className="p-3.5 sm:p-4 bg-gradient-to-r from-amber-100 to-amber-50 border-b border-amber-200 flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-xl bg-amber-200 text-amber-900 flex items-center justify-center font-bold">
                      <Clock className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="text-xs sm:text-sm font-black text-amber-950 uppercase tracking-wider">
                          Pending Remittances
                        </h4>
                        <span className="px-2 py-0.5 rounded-full bg-amber-200 text-amber-950 text-[11px] font-black font-mono">
                          {pendingRemittances.length}
                        </span>
                      </div>
                      <p className="text-[11px] text-amber-800 font-medium">
                        Awaiting School Administrator review & approval
                      </p>
                    </div>
                  </div>

                  <div className="text-right">
                    <span className="text-[10px] text-amber-800 font-bold uppercase block">Pending Total</span>
                    <span className="text-sm sm:text-base font-black font-mono text-amber-950">
                      {formatCurrency(totalPendingAmount, session.currencySymbol)}
                    </span>
                  </div>
                </div>

                {/* Pending List */}
                <div className="p-3 space-y-2.5 flex-1">
                  {pendingRemittances.length === 0 ? (
                    <div className="py-12 px-4 text-center space-y-2">
                      <div className="w-10 h-10 rounded-2xl bg-amber-100/60 text-amber-800 flex items-center justify-center mx-auto">
                        <CheckCircle2 className="w-5 h-5 text-amber-600" />
                      </div>
                      <p className="text-xs font-bold text-slate-800">No Pending Remittances</p>
                      <p className="text-[11px] text-slate-500 max-w-xs mx-auto">
                        When the Bursar records a fund deposit or handover, it will appear here in pending status.
                      </p>
                      <button
                        type="button"
                        onClick={() => handleOpenRemitModal()}
                        className="mt-2 px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold inline-flex items-center gap-1 cursor-pointer transition-all shadow-2xs"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Record Remittance</span>
                      </button>
                    </div>
                  ) : (
                    pendingRemittances.map((remittance) => (
                      <div
                        key={remittance.id}
                        className="p-3.5 bg-white rounded-2xl border border-amber-200 shadow-2xs space-y-2.5 hover:border-amber-300 transition-all"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-xs font-black text-slate-900 truncate">
                                {remittance.remittedTo}
                              </span>
                              <span className="text-[10px] font-mono bg-amber-50 text-amber-900 border border-amber-200 px-1.5 py-0.2 rounded font-semibold">
                                {remittance.referenceNumber}
                              </span>
                            </div>
                            <div className="flex items-center gap-1.5 text-[11px] text-slate-500 mt-1 flex-wrap font-medium">
                              <span>{formatDate(remittance.date)}</span>
                              <span>•</span>
                              <span className="capitalize">{remittance.paymentMethod?.replace('_', ' ') || 'Bank Deposit'}</span>
                              <span>•</span>
                              <span>Recorded by: <strong className="text-slate-800">{remittance.submittedBy || remittance.bursarName || 'Bursar'}</strong></span>
                            </div>
                            {remittance.notes && (
                              <p className="text-[11px] text-slate-600 italic mt-1 bg-slate-50 px-2 py-0.5 rounded border border-slate-100">
                                "{remittance.notes}"
                              </p>
                            )}
                          </div>

                          <div className="text-right shrink-0">
                            <div className="text-sm sm:text-base font-black font-mono text-amber-900">
                              {formatCurrency(remittance.amount, session.currencySymbol)}
                            </div>
                            <span className="inline-block text-[9px] font-black uppercase px-2 py-0.5 rounded-full bg-amber-100 text-amber-900">
                              ⏳ Pending Approval
                            </span>
                          </div>
                        </div>

                        {/* Action Footer for Pending Item */}
                        <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => handleOpenEditModal(remittance)}
                              title="Edit remittance record"
                              className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors cursor-pointer"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => setRemittanceToDelete(remittance)}
                              title="Delete remittance record"
                              className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>

                          {isAdmin ? (
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => {
                                  setRemittanceToReject(remittance);
                                  setRejectionReasonInput('');
                                }}
                                title="Reject / Return submission to Bursar"
                                className="px-2.5 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-xl text-xs font-bold flex items-center gap-1 cursor-pointer transition-all"
                              >
                                <X className="w-3.5 h-3.5" />
                                <span>Reject</span>
                              </button>

                              <button
                                type="button"
                                onClick={() => handleApproveRemittanceItem(remittance)}
                                disabled={isApprovingId === remittance.id}
                                title="Approve and move to Approved side"
                                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black flex items-center gap-1.5 shadow-xs active:scale-95 transition-all cursor-pointer disabled:opacity-50"
                              >
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                <span>{isApprovingId === remittance.id ? 'Approving...' : 'Approve & Move →'}</span>
                              </button>
                            </div>
                          ) : (
                            <span className="text-[10px] text-amber-800 font-bold bg-amber-50 px-2 py-1 rounded-lg border border-amber-200">
                              Awaiting Administrator Verification
                            </span>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* ================= RIGHT SIDE: ✅ APPROVED REMITTANCES ================= */}
              <div className="bg-emerald-50/30 rounded-2xl border-2 border-emerald-200/80 overflow-hidden flex flex-col shadow-xs">
                {/* Approved Column Header */}
                <div className="p-3.5 sm:p-4 bg-gradient-to-r from-emerald-100 to-emerald-50 border-b border-emerald-200 flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-xl bg-emerald-200 text-emerald-900 flex items-center justify-center font-bold">
                      <CheckCircle2 className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="text-xs sm:text-sm font-black text-emerald-950 uppercase tracking-wider">
                          Approved Remittances
                        </h4>
                        <span className="px-2 py-0.5 rounded-full bg-emerald-200 text-emerald-950 text-[11px] font-black font-mono">
                          {approvedRemittances.length}
                        </span>
                      </div>
                      <p className="text-[11px] text-emerald-800 font-medium">
                        Booked directly into official bank ledger & cash balance
                      </p>
                    </div>
                  </div>

                  <div className="text-right">
                    <span className="text-[10px] text-emerald-800 font-bold uppercase block">Approved Total</span>
                    <span className="text-sm sm:text-base font-black font-mono text-emerald-950">
                      {formatCurrency(totalApprovedAmount, session.currencySymbol)}
                    </span>
                  </div>
                </div>

                {/* Approved List */}
                <div className="p-3 space-y-2.5 flex-1">
                  {approvedRemittances.length === 0 ? (
                    <div className="py-12 px-4 text-center space-y-2">
                      <div className="w-10 h-10 rounded-2xl bg-emerald-100/60 text-emerald-800 flex items-center justify-center mx-auto">
                        <Landmark className="w-5 h-5 text-emerald-600" />
                      </div>
                      <p className="text-xs font-bold text-slate-800">No Approved Remittances Yet</p>
                      <p className="text-[11px] text-slate-500 max-w-xs mx-auto">
                        When pending remittances are approved by the School Administrator, they will be posted here and counted into the official ledger.
                      </p>
                    </div>
                  ) : (
                    approvedRemittances.map((remittance) => (
                      <div
                        key={remittance.id}
                        className="p-3.5 bg-white rounded-2xl border border-emerald-200 shadow-2xs space-y-2.5 hover:border-emerald-300 transition-all"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-xs font-black text-slate-900 truncate">
                                {remittance.remittedTo}
                              </span>
                              <span className="text-[10px] font-mono bg-slate-100 text-slate-700 px-1.5 py-0.2 rounded font-semibold">
                                {remittance.referenceNumber}
                              </span>
                              <span className="text-[10px] bg-emerald-100 text-emerald-900 font-black px-2 py-0.2 rounded-full flex items-center gap-1">
                                <CheckCircle2 className="w-3 h-3 text-emerald-700" />
                                <span>Booked</span>
                              </span>
                            </div>

                            <div className="flex items-center gap-1.5 text-[11px] text-slate-500 mt-1 flex-wrap font-medium">
                              <span>{formatDate(remittance.date)}</span>
                              <span>•</span>
                              <span className="capitalize">{remittance.paymentMethod?.replace('_', ' ') || 'Bank Deposit'}</span>
                              <span>•</span>
                              <span>Recorded by: <strong className="text-slate-800">{remittance.submittedBy || remittance.bursarName || 'Bursar'}</strong></span>
                              {remittance.approvedBy && (
                                <>
                                  <span>•</span>
                                  <span className="text-emerald-700 font-bold">
                                    Approved by {remittance.approvedBy}
                                  </span>
                                </>
                              )}
                            </div>

                            {remittance.notes && (
                              <p className="text-[11px] text-slate-600 italic mt-1 bg-slate-50 px-2 py-0.5 rounded border border-slate-100">
                                "{remittance.notes}"
                              </p>
                            )}
                          </div>

                          <div className="text-right shrink-0">
                            <div className="text-sm sm:text-base font-black font-mono text-emerald-700">
                              {formatCurrency(remittance.amount, session.currencySymbol)}
                            </div>
                            <span className="inline-block text-[9px] font-black uppercase px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200">
                              ✓ In Ledger
                            </span>
                          </div>
                        </div>

                        {/* Action Footer for Approved Item */}
                        <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => handleOpenEditModal(remittance)}
                              title="Edit remittance record"
                              className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors cursor-pointer"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => setRemittanceToDelete(remittance)}
                              title="Delete remittance record"
                              className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>

                          <div className="text-[10px] text-emerald-700 font-semibold flex items-center gap-1 bg-emerald-50 px-2.5 py-1 rounded-lg">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                            <span>Reconciled in Official Balance</span>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            {/* REJECTED / RETURNED SUBMISSIONS (IF ANY) */}
            {rejectedRemittances.length > 0 && (
              <div className="p-4 bg-rose-50/80 rounded-2xl border border-rose-200 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-rose-100 text-rose-700 flex items-center justify-center font-bold">
                      <X className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-rose-950 uppercase tracking-wider">
                        Rejected / Returned Submissions ({rejectedRemittances.length})
                      </h4>
                      <p className="text-[11px] text-rose-700">
                        These remittances were returned by the School Administrator and excluded from official totals.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {rejectedRemittances.map((remittance) => (
                    <div key={remittance.id} className="p-3 bg-white rounded-xl border border-rose-200 shadow-2xs space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-900">{remittance.remittedTo}</span>
                        <span className="text-xs font-mono font-bold text-rose-700 line-through">
                          {formatCurrency(remittance.amount, session.currencySymbol)}
                        </span>
                      </div>
                      {remittance.rejectionReason && (
                        <p className="text-[11px] text-rose-800 bg-rose-50 p-1.5 rounded border border-rose-200/60 font-medium">
                          <strong>Note:</strong> {remittance.rejectionReason}
                        </p>
                      )}
                      <div className="flex items-center justify-between pt-1 border-t border-slate-100">
                        <span className="text-[10px] text-slate-500 font-mono">{remittance.referenceNumber}</span>
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => handleOpenEditModal(remittance)}
                            className="text-[10px] text-blue-600 font-bold hover:underline cursor-pointer"
                          >
                            Edit & Resubmit
                          </button>
                          <span className="text-slate-300">•</span>
                          <button
                            onClick={() => setRemittanceToDelete(remittance)}
                            className="text-[10px] text-rose-600 font-bold hover:underline cursor-pointer"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Tab 2 Content: Student Collections Stream */}
        {activeSubTab === 'collections' && (
          <div className="divide-y divide-slate-100">
            {paidStudents.length === 0 ? (
              <div className="p-8 text-center space-y-2">
                <p className="text-xs text-slate-500 font-medium">No student fee collections recorded yet.</p>
                {onOpenRecordPayment && (
                  <button
                    onClick={onOpenRecordPayment}
                    className="px-3 py-1.5 bg-slate-900 text-white rounded-xl text-xs font-bold"
                  >
                    Record Student Payment
                  </button>
                )}
              </div>
            ) : (
              <>
                {paidStudents.slice(0, visibleCollectionsCount).map((student) => {
                  const sTuitionPaid = Math.max(0, Number(student.amount_paid) || 0);
                  const sAdmissionFee = Number(student.admission_fee) || 0;
                  const sAdmissionPaid = Number(student.admission_paid) || (sAdmissionFee > 0 && student.is_new_admission ? sAdmissionFee : 0);
                  const sLessonPaid = Math.max(0, Number(student.lesson_paid) || 0);
                  const sExamPaid = Math.max(0, Number(student.exam_paid) || 0);
                  const sTotalPaid = sTuitionPaid + sAdmissionPaid + sLessonPaid + sExamPaid;

                  return (
                    <div
                      key={student.id}
                      onClick={() => onSelectStudent && onSelectStudent(student)}
                      className="p-3.5 hover:bg-slate-50 transition-colors flex items-center justify-between gap-3 cursor-pointer"
                    >
                      <div className="flex items-start gap-3 min-w-0">
                        <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0 mt-0.5">
                          <Receipt className="w-4 h-4" />
                        </div>

                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs font-bold text-slate-900 truncate">
                              {student.full_name}
                            </span>
                            <span className="text-[10px] font-bold bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded">
                              {student.class}
                            </span>
                            {sAdmissionPaid > 0 && (
                              <span className="text-[9px] font-black uppercase tracking-wider px-1.5 py-0.2 rounded bg-purple-100 text-purple-800">
                                New Admission
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-1.5 text-[10px] text-slate-500 mt-1 font-medium flex-wrap">
                            <span>Paid Date: {formatDate(student.payment_date)}</span>
                            {sTuitionPaid > 0 && (
                              <span className="px-1.5 py-0.2 rounded bg-blue-50 text-blue-700 font-semibold">
                                School: {formatCurrency(sTuitionPaid, session.currencySymbol)}
                              </span>
                            )}
                            {sAdmissionPaid > 0 && (
                              <span className="px-1.5 py-0.2 rounded bg-purple-50 text-purple-700 font-semibold">
                                Admission: {formatCurrency(sAdmissionPaid, session.currencySymbol)}
                              </span>
                            )}
                            {sLessonPaid > 0 && (
                              <span className="px-1.5 py-0.2 rounded bg-emerald-50 text-emerald-700 font-semibold">
                                Lesson: {formatCurrency(sLessonPaid, session.currencySymbol)}
                              </span>
                            )}
                            {sExamPaid > 0 && (
                              <span className="px-1.5 py-0.2 rounded bg-amber-50 text-amber-700 font-semibold">
                                Exam: {formatCurrency(sExamPaid, session.currencySymbol)}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <div className="text-xs font-black text-emerald-700 font-mono">
                          +{formatCurrency(sTotalPaid, session.currencySymbol)}
                        </div>
                        <span className="text-[10px] text-slate-500 font-medium">
                          Bal: {formatCurrency(student.balance, session.currencySymbol)}
                        </span>
                      </div>
                    </div>
                  );
                })}

                {paidStudents.length > visibleCollectionsCount && (
                  <div className="p-3 text-center bg-slate-50 border-t border-slate-100">
                    <button
                      type="button"
                      id="load-more-collections-btn"
                      onClick={() => setVisibleCollectionsCount((prev) => prev + 30)}
                      className="px-4 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 hover:bg-slate-100 shadow-2xs cursor-pointer"
                    >
                      Show More Collections ({paidStudents.length - visibleCollectionsCount} remaining)
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* Tab 3 Content: Audit & Reconciliation Ledger */}
        {activeSubTab === 'reconciliation' && (
          <div className="p-4 space-y-4 text-xs">
            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-2.5">
              <h4 className="font-bold text-slate-900 text-xs uppercase tracking-tight flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-blue-600" />
                <span>Financial Reconciliation Formula</span>
              </h4>

              <div className="space-y-1.5 font-mono text-xs pt-1">
                <div className="flex items-center justify-between text-slate-700">
                  <span>(A) Total Student Collections:</span>
                  <span className="font-bold text-emerald-700">+{formatCurrency(metrics.totalCollected, session.currencySymbol)}</span>
                </div>
                
                {/* Itemized Sub-Breakdown of Total Collected */}
                <div className="pl-3 py-1 space-y-1 border-l-2 border-slate-200 text-[11px] text-slate-600">
                  <div className="flex justify-between">
                    <span>• School Tuition Collected:</span>
                    <span className="font-semibold text-slate-800">{formatCurrency(metrics.totalTuitionCollected, session.currencySymbol)}</span>
                  </div>
                  {metrics.totalAdmissionCollected > 0 && (
                    <div className="flex justify-between text-purple-700">
                      <span>• New Admission Fees:</span>
                      <span className="font-semibold">{formatCurrency(metrics.totalAdmissionCollected, session.currencySymbol)}</span>
                    </div>
                  )}
                  {metrics.totalLessonCollected > 0 && (
                    <div className="flex justify-between text-emerald-700">
                      <span>• Lesson Fees Collected:</span>
                      <span className="font-semibold">{formatCurrency(metrics.totalLessonCollected, session.currencySymbol)}</span>
                    </div>
                  )}
                  {metrics.totalExamCollected > 0 && (
                    <div className="flex justify-between text-amber-700">
                      <span>• Exam Fees Collected:</span>
                      <span className="font-semibold">{formatCurrency(metrics.totalExamCollected, session.currencySymbol)}</span>
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between text-slate-700 pt-1">
                  <span>(B) Total Bank/Management Remittances:</span>
                  <span className="font-bold text-blue-700">-{formatCurrency(metrics.totalRemitted, session.currencySymbol)}</span>
                </div>
                <div className="border-t border-slate-300 pt-1.5 flex items-center justify-between font-black text-sm">
                  <span>(C) Net Cash in Bursar Custody:</span>
                  <span className={metrics.cashInHand > 0 ? 'text-amber-900' : 'text-emerald-700'}>
                    {formatCurrency(metrics.cashInHand, session.currencySymbol)}
                  </span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-1">
              <div className="p-3 bg-white rounded-xl border border-slate-200">
                <span className="text-[10px] text-slate-500 uppercase font-bold block mb-1">Bursar In Charge</span>
                <span className="font-bold text-slate-900">{session.bursarName || 'Bursar'}</span>
              </div>
              <div className="p-3 bg-white rounded-xl border border-slate-200">
                <span className="text-[10px] text-slate-500 uppercase font-bold block mb-1">Academic Session</span>
                <span className="font-bold text-slate-900">{currentTerm} ({currentSession})</span>
              </div>
            </div>

            {/* Print Voucher Button */}
            <button
              onClick={handlePrintAudit}
              className="w-full py-3 bg-slate-900 hover:bg-black text-white font-bold text-xs rounded-xl shadow-xs flex items-center justify-center gap-2 cursor-pointer active:scale-98 transition-all"
            >
              <Printer className="w-4 h-4" />
              <span>Print Official Reconciliation Statement</span>
            </button>
          </div>
        )}
      </div>

      {/* RECORD REMITTANCE MODAL */}
      {isRecordModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh]">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-2xl bg-blue-600 text-white flex items-center justify-center shadow-xs">
                  <Landmark className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Record Fund Remittance</h3>
                  <p className="text-[11px] text-slate-500 font-medium">
                    Log money deposited to bank or handed to management
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsRecordModalOpen(false)}
                className="p-1.5 rounded-full hover:bg-slate-200 text-slate-500 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveRemittance} className="p-5 space-y-4 overflow-y-auto">
              {/* Role-based Workflow Info Badge */}
              <div className={`p-3 rounded-2xl border text-xs flex items-start gap-2.5 ${
                isAdmin 
                  ? 'bg-emerald-50/80 border-emerald-200 text-emerald-900'
                  : 'bg-amber-50/80 border-amber-200 text-amber-900'
              }`}>
                <div className="mt-0.5">
                  {isAdmin ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : <Clock className="w-4 h-4 text-amber-600" />}
                </div>
                <div>
                  <span className="font-bold block">
                    {isAdmin ? 'Administrator Mode (Auto-Approved)' : 'Bursar Mode (Requires Admin Approval)'}
                  </span>
                  <p className="text-[11px] opacity-90 mt-0.5">
                    {isAdmin 
                      ? 'This remittance will be auto-approved and booked directly into the financial ledger.'
                      : 'This remittance will be submitted to the School Administrator for review & approval before posting into the official cash balance.'}
                  </p>
                </div>
              </div>

              {formError && (
                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-900 rounded-xl text-xs flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  <span>{formError}</span>
                </div>
              )}

              {/* Amount Input with Quick Helpers */}
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  Remittance Amount ({session.currencySymbol})
                </label>
                <div className="relative">
                  <span className="absolute left-3.5 top-2.5 font-bold text-slate-400">
                    {session.currencySymbol}
                  </span>
                  <input
                    type="number"
                    step="any"
                    required
                    min="1"
                    id="remittance-amount-input"
                    value={amountInput}
                    onChange={(e) => setAmountInput(e.target.value)}
                    placeholder="0.00"
                    className="w-full pl-8 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-mono font-bold text-slate-900 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>

                {/* Quick amount shortcuts */}
                {metrics.cashInHand > 0 && (
                  <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                    <span className="text-[10px] text-slate-500 font-semibold">Shortcuts:</span>
                    <button
                      type="button"
                      onClick={() => setAmountInput(String(metrics.cashInHand))}
                      className="px-2 py-0.5 bg-amber-100 hover:bg-amber-200 text-amber-900 rounded text-[10px] font-bold transition-colors cursor-pointer"
                    >
                      All In Hand ({formatCurrency(metrics.cashInHand, session.currencySymbol)})
                    </button>
                    <button
                      type="button"
                      onClick={() => setAmountInput(String(Math.floor(metrics.cashInHand / 2)))}
                      className="px-2 py-0.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded text-[10px] font-bold transition-colors cursor-pointer"
                    >
                      50% ({formatCurrency(Math.floor(metrics.cashInHand / 2), session.currencySymbol)})
                    </button>
                  </div>
                )}
              </div>

              {/* Destination / Remitted To */}
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  Remitted To / Destination Account
                </label>
                <select
                  value={remittedToInput}
                  onChange={(e) => setRemittedToInput(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-900 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                >
                  <option value="First Bank (School Main Account)">First Bank (School Main Account)</option>
                  <option value="Zenith Bank (School Ops Account)">Zenith Bank (School Ops Account)</option>
                  <option value="GTBank (Tuition Account)">GTBank (Tuition Account)</option>
                  <option value="Principal / Proprietor Handover">Principal / Proprietor Direct Handover</option>
                  <option value="School Management Committee">School Management Committee</option>
                  <option value="School Cash Vault / Safe">School Cash Vault / Safe</option>
                  <option value="Custom">Other Destination (Type Below)</option>
                </select>

                {remittedToInput === 'Custom' && (
                  <input
                    type="text"
                    required
                    value={customRecipient}
                    onChange={(e) => setCustomRecipient(e.target.value)}
                    placeholder="Specify bank or person name"
                    className="w-full mt-2 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                )}
              </div>

              {/* Date & Payment Method */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Remittance Date
                  </label>
                  <input
                    type="date"
                    required
                    value={dateInput}
                    onChange={(e) => setDateInput(e.target.value)}
                    className="w-full px-2.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Channel / Method
                  </label>
                  <select
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value as any)}
                    className="w-full px-2 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  >
                    <option value="bank_deposit">Bank Deposit</option>
                    <option value="bank_transfer">Bank Transfer</option>
                    <option value="cash_handover">Cash Handover</option>
                    <option value="pos_settlement">POS Settlement</option>
                    <option value="other">Other</option>
                  </select>
                </div>
              </div>

              {/* Reference Number / Notes */}
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  Teller No / Reference / Slip Notes <span className="text-slate-400 font-normal">(Optional)</span>
                </label>
                <input
                  type="text"
                  value={referenceNotes}
                  onChange={(e) => setReferenceNotes(e.target.value)}
                  placeholder="e.g. Teller #893412 or Handed to Mr. Principal"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>

              {/* Submit Buttons */}
              <div className="pt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => setIsRecordModalOpen(false)}
                  className="flex-1 py-2.5 px-3 rounded-xl bg-slate-100 text-slate-700 text-xs font-bold hover:bg-slate-200 border border-slate-200 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  id="confirm-record-remittance-btn"
                  className="flex-1 py-2.5 px-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-xs flex items-center justify-center gap-1.5 active:scale-98 transition-all cursor-pointer"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Save Remittance</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DELETE REMITTANCE CONFIRMATION MODAL */}
      {remittanceToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col animate-in zoom-in-95 duration-150">
            <div className="px-5 py-4 border-b border-rose-100 flex items-center justify-between bg-rose-50/70">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-2xl bg-rose-600 text-white flex items-center justify-center shadow-xs">
                  <Trash2 className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Delete Remittance Record?</h3>
                  <p className="text-[11px] text-rose-700 font-medium">
                    This will remove the remitted funds entry
                  </p>
                </div>
              </div>
              <button
                onClick={() => setRemittanceToDelete(null)}
                disabled={isDeleting}
                className="p-1.5 rounded-full hover:bg-slate-200 text-slate-500 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-500 font-medium">Remitted Amount</span>
                  <span className="text-base font-black text-rose-600 font-mono">
                    {formatCurrency(remittanceToDelete.amount, session.currencySymbol)}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-500 font-medium">Destination</span>
                  <span className="font-bold text-slate-800 truncate max-w-[200px]">
                    {remittanceToDelete.remittedTo}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-500 font-medium">Reference</span>
                  <span className="font-mono text-slate-700">{remittanceToDelete.referenceNumber}</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-500 font-medium">Date</span>
                  <span className="text-slate-700">{formatDate(remittanceToDelete.date)}</span>
                </div>
              </div>

              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 space-y-1">
                <p className="font-semibold flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                  What happens next:
                </p>
                <ul className="list-disc list-inside text-[11px] text-amber-800 space-y-0.5 pl-1">
                  <li>This amount will be deducted from <strong>Total Remitted</strong>.</li>
                  <li>Funds will return to <strong>Cash With Bursar</strong> balance.</li>
                  <li>Updated total will auto-sync to the Google Sheet.</li>
                </ul>
              </div>

              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setRemittanceToDelete(null)}
                  disabled={isDeleting}
                  className="flex-1 py-2.5 px-3 rounded-xl bg-slate-100 text-slate-700 text-xs font-bold hover:bg-slate-200 border border-slate-200 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={confirmDeleteRemittance}
                  disabled={isDeleting}
                  className="flex-1 py-2.5 px-3 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold shadow-xs flex items-center justify-center gap-1.5 active:scale-98 transition-all cursor-pointer disabled:opacity-50"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>{isDeleting ? 'Deleting...' : 'Yes, Delete Record'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* CLEAR ALL REMITTANCES / RESET TOTAL REMITTED MODAL */}
      {isClearAllModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col animate-in zoom-in-95 duration-150">
            <div className="px-5 py-4 border-b border-rose-100 flex items-center justify-between bg-rose-50/70">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-2xl bg-rose-600 text-white flex items-center justify-center shadow-xs">
                  <RotateCcw className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Reset Total Remitted to 0?</h3>
                  <p className="text-[11px] text-rose-700 font-medium">
                    Clear all {remittances.length} remittance {remittances.length === 1 ? 'record' : 'records'}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsClearAllModalOpen(false)}
                disabled={isClearingAll}
                className="p-1.5 rounded-full hover:bg-slate-200 text-slate-500 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div className="bg-rose-50/50 p-3.5 rounded-2xl border border-rose-200 space-y-1.5 text-center">
                <span className="text-xs text-rose-800 font-semibold block">Total Amount to be Cleared</span>
                <span className="text-2xl font-black text-rose-700 font-mono block">
                  {formatCurrency(metrics.totalRemitted, session.currencySymbol)}
                </span>
                <span className="text-[11px] text-slate-600 font-medium">
                  {remittances.length} logged remittance {remittances.length === 1 ? 'transaction' : 'transactions'}
                </span>
              </div>

              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 space-y-1">
                <p className="font-semibold flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                  Warning:
                </p>
                <p className="text-[11px] text-amber-800">
                  All remittance records will be permanently removed. The full fee collection amount ({formatCurrency(metrics.totalCollected, session.currencySymbol)}) will be restored as currently in hand with the Bursar.
                </p>
              </div>

              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setIsClearAllModalOpen(false)}
                  disabled={isClearingAll}
                  className="flex-1 py-2.5 px-3 rounded-xl bg-slate-100 text-slate-700 text-xs font-bold hover:bg-slate-200 border border-slate-200 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={confirmClearAllRemittances}
                  disabled={isClearingAll}
                  className="flex-1 py-2.5 px-3 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold shadow-xs flex items-center justify-center gap-1.5 active:scale-98 transition-all cursor-pointer disabled:opacity-50"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>{isClearingAll ? 'Clearing...' : 'Clear All Remittances'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* EDIT REMITTANCE MODAL */}
      {remittanceToEdit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh] animate-in zoom-in-95 duration-150">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-2xl bg-blue-600 text-white flex items-center justify-center shadow-xs">
                  <Edit2 className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Edit Remittance Record</h3>
                  <p className="text-[11px] text-slate-500 font-medium">
                    Ref: {remittanceToEdit.referenceNumber}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setRemittanceToEdit(null)}
                className="p-1.5 rounded-full hover:bg-slate-200 text-slate-500 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveEditRemittance} className="p-5 space-y-4 overflow-y-auto">
              {formError && (
                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-900 rounded-xl text-xs flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  <span>{formError}</span>
                </div>
              )}

              {/* Amount Input */}
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  Remittance Amount ({session.currencySymbol})
                </label>
                <div className="relative">
                  <span className="absolute left-3.5 top-2.5 font-bold text-slate-400">
                    {session.currencySymbol}
                  </span>
                  <input
                    type="number"
                    step="any"
                    required
                    min="1"
                    value={amountInput}
                    onChange={(e) => setAmountInput(e.target.value)}
                    className="w-full pl-8 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-mono font-bold text-slate-900 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>
              </div>

              {/* Destination / Remitted To */}
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  Remitted To / Destination Account
                </label>
                <select
                  value={remittedToInput}
                  onChange={(e) => setRemittedToInput(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-900 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                >
                  <option value="First Bank (School Main Account)">First Bank (School Main Account)</option>
                  <option value="Zenith Bank (School Ops Account)">Zenith Bank (School Ops Account)</option>
                  <option value="GTBank (Tuition Account)">GTBank (Tuition Account)</option>
                  <option value="Principal / Proprietor Handover">Principal / Proprietor Direct Handover</option>
                  <option value="School Management Committee">School Management Committee</option>
                  <option value="School Cash Vault / Safe">School Cash Vault / Safe</option>
                  <option value="Custom">Other Destination (Type Below)</option>
                </select>

                {remittedToInput === 'Custom' && (
                  <input
                    type="text"
                    required
                    value={customRecipient}
                    onChange={(e) => setCustomRecipient(e.target.value)}
                    placeholder="Specify bank or person name"
                    className="w-full mt-2 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                )}
              </div>

              {/* Date & Payment Method */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Remittance Date
                  </label>
                  <input
                    type="date"
                    required
                    value={dateInput}
                    onChange={(e) => setDateInput(e.target.value)}
                    className="w-full px-2.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Channel / Method
                  </label>
                  <select
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value as any)}
                    className="w-full px-2 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  >
                    <option value="bank_deposit">Bank Deposit</option>
                    <option value="bank_transfer">Bank Transfer</option>
                    <option value="cash_handover">Cash Handover</option>
                    <option value="pos_settlement">POS Settlement</option>
                    <option value="other">Other</option>
                  </select>
                </div>
              </div>

              {/* Reference Number / Notes */}
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  Teller No / Notes
                </label>
                <input
                  type="text"
                  value={referenceNotes}
                  onChange={(e) => setReferenceNotes(e.target.value)}
                  placeholder="e.g. Teller #893412"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>

              {/* Submit Buttons */}
              <div className="pt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => setRemittanceToEdit(null)}
                  className="flex-1 py-2.5 px-3 rounded-xl bg-slate-100 text-slate-700 text-xs font-bold hover:bg-slate-200 border border-slate-200 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isEditing}
                  className="flex-1 py-2.5 px-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-xs flex items-center justify-center gap-1.5 active:scale-98 transition-all cursor-pointer"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>{isEditing ? 'Saving...' : 'Update Remittance'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* REJECT REMITTANCE MODAL */}
      {remittanceToReject && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col animate-in zoom-in-95 duration-150">
            <div className="px-5 py-4 border-b border-rose-100 flex items-center justify-between bg-rose-50/70">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-2xl bg-rose-600 text-white flex items-center justify-center shadow-xs">
                  <X className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Reject Remittance Submission</h3>
                  <p className="text-[11px] text-rose-700 font-medium">
                    Return remittance back to Bursar with note
                  </p>
                </div>
              </div>
              <button
                onClick={() => setRemittanceToReject(null)}
                className="p-1.5 rounded-full hover:bg-slate-200 text-slate-500 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-500 font-medium">Submitted Amount</span>
                  <span className="text-base font-black text-rose-600 font-mono">
                    {formatCurrency(remittanceToReject.amount, session.currencySymbol)}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-500 font-medium">Destination</span>
                  <span className="font-bold text-slate-800 truncate max-w-[200px]">
                    {remittanceToReject.remittedTo}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-500 font-medium">Reference</span>
                  <span className="font-mono text-slate-700">{remittanceToReject.referenceNumber}</span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Reason for Rejection / Correction Note <span className="text-rose-600">*</span>
                </label>
                <textarea
                  rows={3}
                  value={rejectionReasonInput}
                  onChange={(e) => setRejectionReasonInput(e.target.value)}
                  placeholder="e.g. Bank teller slip is illegible, please re-upload or re-check amount..."
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-rose-500 focus:outline-none"
                />
              </div>

              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setRemittanceToReject(null)}
                  className="flex-1 py-2.5 px-3 rounded-xl bg-slate-100 text-slate-700 text-xs font-bold hover:bg-slate-200 border border-slate-200 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmReject}
                  className="flex-1 py-2.5 px-3 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold shadow-xs flex items-center justify-center gap-1.5 active:scale-98 transition-all cursor-pointer"
                >
                  <X className="w-4 h-4" />
                  <span>Confirm Rejection</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
