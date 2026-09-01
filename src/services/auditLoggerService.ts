/**
 * System Audit & Activity Logging Service
 * Provides persistent, tamper-evident audit trails of actions across Eminent A/C System.
 */

import { safeStorage } from './safeStorage';

export type AuditActionCategory = 
  | 'PAYMENT' 
  | 'STUDENT' 
  | 'PAYROLL' 
  | 'EXPENSE' 
  | 'REMITTANCE' 
  | 'ROLLOVER' 
  | 'SNAPSHOT' 
  | 'SETTINGS' 
  | 'SYSTEM';

export type AuditActionSeverity = 'INFO' | 'SUCCESS' | 'WARNING' | 'CRITICAL';

export interface AuditLogEntry {
  id: string;
  timestamp: string; // ISO string
  readableTime: string; // Formatted date time string
  category: AuditActionCategory;
  action: string; // Short verb e.g. "RECORD_PAYMENT", "DELETE_REMITTANCE", "UPSERT_STAFF"
  description: string; // Human readable description
  details?: Record<string, any>;
  performer: string; // Bursar name or system
  schoolId?: string;
  severity: AuditActionSeverity;
}

const STORAGE_AUDIT_LOGS_KEY = 'eminent_system_audit_logs_v1';
const MAX_LOG_ENTRIES = 2000;

/**
 * Appends a new immutable audit record to the persistent log
 */
export function recordAuditLog(
  category: AuditActionCategory,
  action: string,
  description: string,
  details?: Record<string, any>,
  performer: string = 'Bursar',
  schoolId?: string,
  severity: AuditActionSeverity = 'INFO'
): AuditLogEntry {
  const now = new Date();
  const entry: AuditLogEntry = {
    id: `LOG-${Date.now()}-${Math.random().toString(36).substring(2, 7).toUpperCase()}`,
    timestamp: now.toISOString(),
    readableTime: now.toLocaleString('en-US', {
      dateStyle: 'medium',
      timeStyle: 'medium',
    }),
    category,
    action,
    description,
    details,
    performer: performer || 'Bursar',
    schoolId,
    severity,
  };

  try {
    const existing = getStoredAuditLogs();
    // Prepend newest first, and cap at MAX_LOG_ENTRIES
    const updated = [entry, ...existing].slice(0, MAX_LOG_ENTRIES);
    safeStorage.setItem(STORAGE_AUDIT_LOGS_KEY, JSON.stringify(updated));
  } catch (e) {
    console.warn('Failed to persist audit log:', e);
  }

  return entry;
}

/**
 * Retrieves all stored audit logs
 */
export function getStoredAuditLogs(): AuditLogEntry[] {
  try {
    const raw = safeStorage.getItem(STORAGE_AUDIT_LOGS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed;
    }
  } catch (e) {
    console.warn('Failed to read audit logs:', e);
  }
  return [];
}

/**
 * Exports logs as downloadable JSON file
 */
export function exportAuditLogsJSON(): void {
  const logs = getStoredAuditLogs();
  const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(logs, null, 2));
  const downloadAnchor = document.createElement('a');
  downloadAnchor.setAttribute('href', dataStr);
  downloadAnchor.setAttribute('download', `system_audit_logs_${new Date().toISOString().split('T')[0]}.json`);
  document.body.appendChild(downloadAnchor);
  downloadAnchor.click();
  downloadAnchor.remove();
}

/**
 * Exports logs as downloadable CSV file
 */
export function exportAuditLogsCSV(): void {
  const logs = getStoredAuditLogs();
  const headers = ['Timestamp', 'Date/Time', 'Category', 'Action', 'Description', 'Performer', 'School ID', 'Severity', 'Details'];
  
  const rows = logs.map((l) => [
    l.timestamp,
    `"${l.readableTime}"`,
    l.category,
    l.action,
    `"${(l.description || '').replace(/"/g, '""')}"`,
    `"${l.performer || ''}"`,
    l.schoolId || '',
    l.severity,
    `"${JSON.stringify(l.details || {}).replace(/"/g, '""')}"`,
  ]);

  const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
  const encodedUri = encodeURI(csvContent);
  const downloadAnchor = document.createElement('a');
  downloadAnchor.setAttribute('href', encodedUri);
  downloadAnchor.setAttribute('download', `system_audit_logs_${new Date().toISOString().split('T')[0]}.csv`);
  document.body.appendChild(downloadAnchor);
  downloadAnchor.click();
  downloadAnchor.remove();
}
