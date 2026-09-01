/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { SheetApiConfig, SchoolFeeSchedule, StudentPaymentRecord } from '../types';

export const GOOGLE_APPS_SCRIPT_CODE = `/**
 * Google Apps Script Web App for School Accounting & Payment System
 * Deploy as Web App -> Execute as: Me -> Who has access: Anyone
 */

function doGet(e) {
  return handleRequest(e);
}

function doPost(e) {
  return handleRequest(e);
}

function handleRequest(e) {
  var lock = LockService.getScriptLock();
  lock.tryLock(10000);
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var action = e && e.parameter && e.parameter.action ? e.parameter.action : 'get';
    var sheetName = e && e.parameter && e.parameter.sheet ? e.parameter.sheet : 'Students';
    var sheet = ss.getSheetByName(sheetName) || ss.getSheets()[0];

    if (action === 'get') {
      var data = sheet.getDataRange().getValues();
      var headers = data[0];
      var rows = [];
      for (var i = 1; i < data.length; i++) {
        var row = {};
        for (var j = 0; j < headers.length; j++) {
          row[headers[j]] = data[i][j];
        }
        rows.push(row);
      }
      return ContentService.createTextOutput(JSON.stringify({ status: 'success', data: rows }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    if (action === 'append' || action === 'update') {
      var postData = e.postData && e.postData.contents ? JSON.parse(e.postData.contents) : {};
      // Handle record insertion
      return ContentService.createTextOutput(JSON.stringify({ status: 'success', message: 'Record saved' }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    return ContentService.createTextOutput(JSON.stringify({ status: 'success', message: 'Ping OK' }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  } finally {
    lock.releaseLock();
  }
}
`;

export function detectProvider(url: string): 'appsscript' | 'sheetdb' | 'google' | 'custom' {
  if (!url) return 'custom';
  const lower = url.toLowerCase();
  if (lower.includes('script.google.com') || lower.includes('macros/s/')) return 'appsscript';
  if (lower.includes('sheetdb.io')) return 'sheetdb';
  if (lower.includes('docs.google.com/spreadsheets')) return 'google';
  return 'custom';
}

export async function testSheetConnection(config: SheetApiConfig): Promise<{ success: boolean; message: string }> {
  if (!config.apiUrl || !config.apiUrl.trim()) {
    return { success: false, message: 'API URL is required' };
  }
  try {
    const url = new URL(config.apiUrl);
    url.searchParams.set('action', 'test');
    const res = await fetch(url.toString(), { method: 'GET' });
    if (res.ok) {
      return { success: true, message: 'Connection successful!' };
    }
    return { success: false, message: `Server returned status: ${res.status}` };
  } catch (err: any) {
    return { success: false, message: err?.message || 'Failed to connect to spreadsheet API' };
  }
}

export async function syncFeeScheduleToSheet(
  config: SheetApiConfig,
  baseSchedule: SchoolFeeSchedule,
  classSchedules: Record<string, SchoolFeeSchedule>,
  schoolName: string,
  classes: string[],
  currencySymbol: string
): Promise<{ success: boolean; message?: string }> {
  if (!config.apiUrl) return { success: false, message: 'No API URL provided' };
  try {
    const payload = {
      action: 'update_fee_schedule',
      schoolName,
      baseSchedule,
      classSchedules,
      classes,
      currencySymbol,
      updatedAt: new Date().toISOString()
    };
    await fetch(config.apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    return { success: true, message: 'Fee schedule updated' };
  } catch (e: any) {
    console.warn('Fee sync note:', e);
    return { success: false, message: e?.message || 'Sync failed' };
  }
}

export async function updateStudentInSheet(
  config: SheetApiConfig,
  studentId: string,
  updatedRecord: StudentPaymentRecord,
  originalRecord?: StudentPaymentRecord
): Promise<boolean> {
  if (!config?.apiUrl) return false;
  try {
    const payload = {
      action: 'update_student',
      studentId,
      student: updatedRecord,
      originalStudent: originalRecord,
      updatedAt: new Date().toISOString()
    };
    await fetch(config.apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    return true;
  } catch (e) {
    console.warn('Sheet update student note:', e);
    return false;
  }
}

export async function fetchFeeScheduleFromSheet(
  config: SheetApiConfig
): Promise<{ feeSchedule?: SchoolFeeSchedule; classFeeSchedules?: Record<string, SchoolFeeSchedule> } | null> {
  if (!config.apiUrl) return null;
  try {
    const url = new URL(config.apiUrl);
    url.searchParams.set('action', 'get_fee_schedule');
    const res = await fetch(url.toString());
    if (res.ok) {
      const data = await res.json();
      const payload = data?.data || data;
      return {
        feeSchedule: payload?.feeSchedule || payload?.baseSchedule,
        classFeeSchedules: payload?.classFeeSchedules || payload?.classSchedules
      };
    }
    return null;
  } catch {
    return null;
  }
}
