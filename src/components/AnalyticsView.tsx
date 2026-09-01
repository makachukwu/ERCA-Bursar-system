/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import { 
  TrendingUp, 
  DollarSign, 
  Filter, 
  Download, 
  Printer, 
  Calendar, 
  WalletCards, 
  PieChart as PieChartIcon, 
  BarChart3, 
  Layers, 
  ArrowUpRight, 
  ArrowDownRight, 
  CheckCircle2, 
  Percent, 
  Coins, 
  Receipt,
  Sparkles
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
  ComposedChart,
  Line
} from 'recharts';
import { StudentPaymentRecord, BursarSession, SchoolProfile, ExpenseItem } from '../types';
import { 
  formatCurrency, 
  calculateClassSummaries, 
  calculateOverallAnalytics,
  deriveFeeBreakdown
} from '../services/calculations';
import { downloadCsvBackup } from '../services/backupService';
import { getStoredPayrollRecords } from '../services/payrollService';
import { getStoredExpenses, calculateNetFinancials, EXPENSE_CATEGORIES, normalizeExpenseTerm } from '../services/expenseService';
import { getStoredTermSchedule, getFeeCollectionTimelineStatus } from '../services/termScheduleService';
import { ExpenseTrackerCard } from './ExpenseTrackerCard';

interface AnalyticsViewProps {
  students: StudentPaymentRecord[];
  session: BursarSession;
  activeSchool?: SchoolProfile;
  onSelectStudent?: (student: StudentPaymentRecord) => void;
  onFilterByClassInList?: (className: string) => void;
  onOpenRollover?: () => void;
  onOpenPayroll?: () => void;
}

// Chart color palette
const COLORS = [
  '#0f172a', // Slate 900
  '#059669', // Emerald 600
  '#2563eb', // Blue 600
  '#d97706', // Amber 600
  '#7c3aed', // Violet 600
  '#db2777', // Pink 600
  '#0891b2', // Cyan 600
  '#ea580c', // Orange 600
  '#4f46e5', // Indigo 600
  '#16a34a', // Green 600
  '#9333ea', // Purple 600
];

export const AnalyticsView: React.FC<AnalyticsViewProps> = ({
  students,
  session,
  activeSchool,
  onOpenPayroll,
}) => {
  const [selectedTerm, setSelectedTerm] = useState<string>('all');
  const [chartTab, setChartTab] = useState<'overview' | 'classes' | 'breakdowns'>('overview');

  const schoolId = activeSchool?.id || session.schoolId || 'eminent-academy';
  const currencySymbol = activeSchool?.currencySymbol || session.currencySymbol || '₦';

  const [allExpenses, setAllExpenses] = useState<ExpenseItem[]>(() => getStoredExpenses(schoolId));

  // Extract available unique terms
  const availableTerms = useMemo(() => {
    const set = new Set<string>();
    students.forEach((s) => {
      if (s?.term && s.term.trim()) set.add(s.term.trim());
    });
    return Array.from(set).sort();
  }, [students]);

  // Filtered student records according to term selection
  const scopedStudents = useMemo(() => {
    if (selectedTerm === 'all') return students;
    return students.filter((s) => (s?.term || '').trim().toLowerCase() === selectedTerm.toLowerCase());
  }, [students, selectedTerm]);

  // High-level analytics
  const analytics = useMemo(() => {
    return calculateOverallAnalytics(scopedStudents);
  }, [scopedStudents]);

  // Specific Fee category totals for expense calculation
  const feeIncomeTotals = useMemo(() => {
    let tuitionCollected = 0;
    let tuitionTotal = 0;
    let admissionCollected = 0;
    let admissionTotal = 0;
    let lessonCollected = 0;
    let lessonTotal = 0;
    let examCollected = 0;
    let examTotal = 0;

    scopedStudents.forEach((s) => {
      const bd = deriveFeeBreakdown(s, activeSchool);
      tuitionTotal += bd.tuitionFee;
      tuitionCollected += bd.tuitionPaid;
      admissionTotal += bd.admissionFee;
      admissionCollected += bd.admissionPaid;
      lessonTotal += bd.lessonFee;
      lessonCollected += bd.lessonPaid;
      examTotal += bd.examFee;
      examCollected += bd.examPaid;
    });

    return {
      schoolFeeCollected: tuitionCollected,
      schoolFeeTotal: tuitionTotal,
      admissionFeeCollected: admissionCollected,
      admissionFeeTotal: admissionTotal,
      lessonFeeCollected: lessonCollected,
      lessonFeeTotal: lessonTotal,
      examFeeCollected: examCollected,
      examFeeTotal: examTotal,
    };
  }, [scopedStudents, activeSchool?.feeSchedule]);

  // Stored expenses normalized by term
  const storedExpenses = useMemo(() => {
    if (selectedTerm === 'all') return allExpenses;
    const targetNorm = normalizeExpenseTerm(selectedTerm);
    return allExpenses.filter((e) => {
      if (!e.term || e.term.toLowerCase().trim() === 'all terms') return true;
      return normalizeExpenseTerm(e.term) === targetNorm;
    });
  }, [allExpenses, selectedTerm]);

  // Payroll disbursed calculation
  const payrollDisbursed = useMemo(() => {
    const records = getStoredPayrollRecords(schoolId);
    if (selectedTerm === 'all') {
      return records.reduce((acc, r) => acc + (r.amountPaid || 0), 0);
    }
    const termRecords = records.filter(
      (r) => (r.term || '').toLowerCase().trim() === selectedTerm.toLowerCase().trim()
    );
    return termRecords.reduce((acc, r) => acc + (r.amountPaid || 0), 0);
  }, [schoolId, selectedTerm]);

  // Complete Net Financials: Income vs Expenses vs Net Income (Income - Expenses)
  const netFinancials = useMemo(() => {
    return calculateNetFinancials(feeIncomeTotals, payrollDisbursed, storedExpenses);
  }, [feeIncomeTotals, payrollDisbursed, storedExpenses]);

  // Term schedule & fee collection timeline status
  const currentSchedule = useMemo(() => {
    const termKey = selectedTerm === 'all' ? (availableTerms[0] || 'First Term') : selectedTerm;
    return getStoredTermSchedule(termKey, session.schoolName, schoolId);
  }, [selectedTerm, availableTerms, session.schoolName, schoolId]);

  const collectionStatus = useMemo(() => {
    return getFeeCollectionTimelineStatus(currentSchedule);
  }, [currentSchedule]);

  // Class summaries for class charts
  const classSummaries = useMemo(() => {
    const raw = calculateClassSummaries(scopedStudents);
    return [...raw].sort((a, b) => b.totalPaid - a.totalPaid);
  }, [scopedStudents]);

  // Data for Cashflow Comparison Chart: Income, Expenses, Net Income
  const cashflowComparisonData = useMemo(() => {
    return [
      {
        name: 'Total Income',
        amount: netFinancials.totalIncomeCollected,
        fill: '#059669', // Emerald
      },
      {
        name: 'Total Expenses',
        amount: netFinancials.totalExpenses,
        fill: '#e11d48', // Rose
      },
      {
        name: 'Net Income (Profit)',
        amount: netFinancials.netOperatingSurplus,
        fill: netFinancials.netOperatingSurplus >= 0 ? '#0f172a' : '#dc2626', // Slate or Red
      },
    ];
  }, [netFinancials]);

  // Data for School Fee Payment Per Class Chart
  const classFeeChartData = useMemo(() => {
    return classSummaries.map((c) => ({
      className: c.className,
      paid: c.totalPaid,
      balance: c.totalBalance,
      expected: c.totalFees,
      collectionRate: c.collectionRate,
      students: c.studentCount,
    }));
  }, [classSummaries]);

  // Data for Income Streams Distribution
  const incomeBreakdownData = useMemo(() => {
    const items = [
      { name: 'Tuition / School Fees', value: netFinancials.schoolFeeIncome },
      { name: 'Admission Fees', value: netFinancials.admissionFeeIncome },
      { name: 'Lesson Fees', value: netFinancials.lessonFeeIncome },
      { name: 'Exam Fees', value: netFinancials.examFeeIncome },
    ].filter((item) => item.value > 0);

    return items.length > 0 ? items : [{ name: 'Tuition Fees', value: 1 }];
  }, [netFinancials]);

  // Data for Operating Expense Categories Distribution
  const expenseBreakdownData = useMemo(() => {
    const map = new Map<string, number>();

    if (payrollDisbursed > 0) {
      map.set('Staff Salaries & Payroll', payrollDisbursed);
    }

    storedExpenses.forEach((exp) => {
      const catLabel = exp.categoryLabel || exp.category || 'Other Operating Expense';
      const prev = map.get(catLabel) || 0;
      map.set(catLabel, prev + (Number(exp.amount) || 0));
    });

    const list: { name: string; value: number }[] = [];
    map.forEach((value, name) => {
      if (value > 0) list.push({ name, value });
    });

    return list.sort((a, b) => b.value - a.value);
  }, [storedExpenses, payrollDisbursed]);

  const handlePrintAuditReport = () => {
    try {
      if (typeof window !== 'undefined' && typeof window.print === 'function') {
        window.print();
      }
    } catch (e) {
      console.warn('Print error:', e);
    }
  };

  const handleDownloadCsv = () => {
    downloadCsvBackup(scopedStudents, session, { term: selectedTerm !== 'all' ? selectedTerm : undefined });
  };

  // Custom Chart Tooltip
  const CustomCurrencyTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-slate-900 text-white p-3 rounded-xl shadow-xl text-xs border border-slate-700">
          <p className="font-bold text-slate-200 mb-1">{label || payload[0]?.name}</p>
          {payload.map((entry: any, index: number) => (
            <div key={`item-${index}`} className="flex items-center justify-between gap-4 font-mono">
              <span style={{ color: entry.color || entry.fill }}>{entry.name}:</span>
              <span className="font-bold">{formatCurrency(entry.value, currencySymbol)}</span>
            </div>
          ))}
        </div>
      );
    }
    return null;
  };

  return (
    <div className="px-4 py-4 space-y-6 pb-28">
      {/* Top Controls & Filter Bar */}
      <div className="flex items-center justify-between gap-2 flex-wrap no-print">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 bg-white p-1 rounded-2xl border border-slate-200 shadow-xs">
            <Filter className="w-3.5 h-3.5 text-slate-400 ml-2" />
            <select
              id="analytics-term-filter"
              value={selectedTerm}
              onChange={(e) => setSelectedTerm(e.target.value)}
              className="text-xs font-bold text-slate-800 bg-transparent pr-3 py-1 focus:outline-none cursor-pointer"
            >
              <option value="all">All Terms Combined</option>
              {availableTerms.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>

          <div className="hidden sm:flex items-center bg-white p-1 rounded-2xl border border-slate-200 shadow-xs">
            <button
              onClick={() => setChartTab('overview')}
              className={`px-3 py-1 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                chartTab === 'overview'
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Income vs Expenses
            </button>
            <button
              onClick={() => setChartTab('classes')}
              className={`px-3 py-1 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                chartTab === 'classes'
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Class Payments
            </button>
            <button
              onClick={() => setChartTab('breakdowns')}
              className={`px-3 py-1 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                chartTab === 'breakdowns'
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Category Shares
            </button>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            onClick={handleDownloadCsv}
            id="analytics-export-csv-btn"
            title="Download CSV Backup"
            className="p-2 bg-white hover:bg-slate-100 text-slate-700 rounded-xl border border-slate-200 text-xs font-semibold flex items-center gap-1.5 active:scale-95 transition-all shadow-xs cursor-pointer"
          >
            <Download className="w-3.5 h-3.5 text-slate-500" />
            <span className="hidden sm:inline">Export CSV</span>
          </button>
          
          <button
            onClick={handlePrintAuditReport}
            id="analytics-print-btn"
            title="Print Financial Audit Report"
            className="p-2 bg-white hover:bg-slate-100 text-slate-700 rounded-xl border border-slate-200 text-xs font-semibold flex items-center gap-1.5 active:scale-95 transition-all shadow-xs cursor-pointer"
          >
            <Printer className="w-3.5 h-3.5 text-slate-500" />
            <span className="hidden sm:inline">Print Audit</span>
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 1. EXPENSE TRACKER CARD (Retained as requested)                           */}
      {/* ========================================================================= */}
      <ExpenseTrackerCard
        session={session}
        activeSchool={activeSchool}
        selectedTerm={selectedTerm}
        incomeTotals={feeIncomeTotals}
        payrollDisbursed={payrollDisbursed}
        onOpenPayroll={onOpenPayroll}
        onExpensesChange={setAllExpenses}
      />

      {/* ========================================================================= */}
      {/* 2. MAIN CASHFLOW DASHBOARD: Total Expenses, Total Income & Net Income     */}
      {/* ========================================================================= */}
      <section className="bg-white rounded-3xl p-5 border border-slate-200 shadow-xs space-y-5">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
              Financial Cashflow Dashboard
            </span>
            <h2 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
              <span>Total Income, Total Expenses & Net Operating Income</span>
            </h2>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-slate-500 font-semibold">
              {selectedTerm === 'all' ? 'All Academic Terms' : selectedTerm}
            </span>
          </div>
        </div>

        {/* 3 Prominent Cashflow Metric Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
          {/* 1. Total Income */}
          <div className="bg-emerald-50/60 border border-emerald-200/80 rounded-2xl p-4 flex flex-col justify-between">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold uppercase text-emerald-800 tracking-wider">
                Total Income Collected
              </span>
              <div className="w-7 h-7 rounded-lg bg-emerald-600 text-white flex items-center justify-center">
                <ArrowUpRight className="w-4 h-4" />
              </div>
            </div>
            <div>
              <div className="text-2xl font-black text-emerald-950 font-mono tracking-tight">
                {formatCurrency(netFinancials.totalIncomeCollected, currencySymbol)}
              </div>
              <p className="text-[11px] text-emerald-700 mt-1 font-medium">
                Tuition, lessons, admissions & exam fees
              </p>
            </div>
          </div>

          {/* 2. Total Expenses */}
          <div className="bg-rose-50/60 border border-rose-200/80 rounded-2xl p-4 flex flex-col justify-between">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold uppercase text-rose-800 tracking-wider">
                Total Expenses
              </span>
              <div className="w-7 h-7 rounded-lg bg-rose-600 text-white flex items-center justify-center">
                <ArrowDownRight className="w-4 h-4" />
              </div>
            </div>
            <div>
              <div className="text-2xl font-black text-rose-950 font-mono tracking-tight">
                {formatCurrency(netFinancials.totalExpenses, currencySymbol)}
              </div>
              <p className="text-[11px] text-rose-700 mt-1 font-medium">
                Operating expenses + Staff salaries paid
              </p>
            </div>
          </div>

          {/* 3. Net Income (Expenses minus Income / Net Operating Surplus) */}
          <div className={`border rounded-2xl p-4 flex flex-col justify-between ${
            netFinancials.netOperatingSurplus >= 0
              ? 'bg-slate-900 text-white border-slate-800'
              : 'bg-rose-900 text-white border-rose-800'
          }`}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-300">
                Net Operating Income (Income - Expenses)
              </span>
              <div className="w-7 h-7 rounded-lg bg-white/10 text-white flex items-center justify-center">
                <Coins className="w-4 h-4" />
              </div>
            </div>
            <div>
              <div className="text-2xl font-black font-mono tracking-tight">
                {formatCurrency(netFinancials.netOperatingSurplus, currencySymbol)}
              </div>
              <div className="flex items-center gap-2 mt-1">
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                  netFinancials.netOperatingSurplus >= 0
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                    : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                }`}>
                  {netFinancials.netOperatingSurplus >= 0 ? 'Surplus / Profit' : 'Operating Deficit'}
                </span>
                <span className="text-[11px] text-slate-300 font-mono">
                  {netFinancials.netMarginPercentage}% margin
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Visual Chart: Income vs Expenses vs Net Income */}
        <div className="pt-2">
          <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-3 flex items-center gap-1.5">
            <BarChart3 className="w-4 h-4 text-slate-500" />
            <span>Cashflow Comparison Visual Chart</span>
          </h3>

          <div className="h-72 w-full bg-slate-50/70 border border-slate-100 rounded-2xl p-3">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={cashflowComparisonData} margin={{ top: 20, right: 30, left: 20, bottom: 10 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis 
                  dataKey="name" 
                  tick={{ fill: '#475569', fontSize: 12, fontWeight: 700 }}
                  axisLine={{ stroke: '#cbd5e1' }}
                />
                <YAxis 
                  tick={{ fill: '#64748b', fontSize: 11 }}
                  tickFormatter={(val) => `${currencySymbol}${Number(val).toLocaleString()}`}
                  axisLine={{ stroke: '#cbd5e1' }}
                />
                <Tooltip content={<CustomCurrencyTooltip />} />
                <Bar 
                  dataKey="amount" 
                  radius={[8, 8, 0, 0]}
                  barSize={64}
                >
                  {cashflowComparisonData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </section>

      {/* ========================================================================= */}
      {/* 3. SCHOOL FEE PAYMENT PER CLASS (CHARTS)                                  */}
      {/* ========================================================================= */}
      <section className="bg-white rounded-3xl p-5 border border-slate-200 shadow-xs space-y-5">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
              Class Breakdown & Collections
            </span>
            <h2 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
              <span>School Fee Payment Per Class</span>
            </h2>
            <p className="text-xs text-slate-500">
              Visual comparisons of fee payments, collected revenue, and balances across {classSummaries.length} classes
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700">
              <span className="w-3 h-3 rounded-full bg-emerald-600 inline-block" />
              <span>Collected</span>
            </div>
            <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700">
              <span className="w-3 h-3 rounded-full bg-rose-500 inline-block" />
              <span>Balance</span>
            </div>
          </div>
        </div>

        {/* Main Class Fee Payment Bar Chart */}
        <div className="h-80 w-full bg-slate-50/70 border border-slate-100 rounded-2xl p-3">
          {classFeeChartData.length === 0 ? (
            <div className="h-full flex items-center justify-center text-xs text-slate-400">
              No class payment data available
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={classFeeChartData} margin={{ top: 20, right: 30, left: 20, bottom: 40 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis 
                  dataKey="className" 
                  angle={-25}
                  textAnchor="end"
                  interval={0}
                  tick={{ fill: '#334155', fontSize: 11, fontWeight: 700 }}
                  axisLine={{ stroke: '#cbd5e1' }}
                />
                <YAxis 
                  tick={{ fill: '#64748b', fontSize: 11 }}
                  tickFormatter={(val) => `${currencySymbol}${Number(val).toLocaleString()}`}
                  axisLine={{ stroke: '#cbd5e1' }}
                />
                <Tooltip content={<CustomCurrencyTooltip />} />
                <Legend 
                  verticalAlign="top" 
                  align="right" 
                  wrapperStyle={{ paddingBottom: '10px' }}
                />
                <Bar 
                  dataKey="paid" 
                  name="Fee Collected" 
                  fill="#059669" 
                  radius={[4, 4, 0, 0]} 
                  barSize={24}
                />
                <Bar 
                  dataKey="balance" 
                  name="Outstanding Balance" 
                  fill="#f43f5e" 
                  radius={[4, 4, 0, 0]} 
                  barSize={24}
                />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Class Collection Efficiency Rate (%) Chart */}
        <div className="pt-2">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
              <TrendingUp className="w-4 h-4 text-slate-500" />
              <span>Collection Efficiency Rate Per Class (%)</span>
            </h3>
            <span className="text-[11px] text-slate-400 font-medium">100% Target</span>
          </div>

          <div className="h-64 w-full bg-slate-50/70 border border-slate-100 rounded-2xl p-3">
            {classFeeChartData.length === 0 ? (
              <div className="h-full flex items-center justify-center text-xs text-slate-400">
                No class data
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={classFeeChartData} margin={{ top: 10, right: 30, left: 10, bottom: 30 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis 
                    dataKey="className" 
                    angle={-20}
                    textAnchor="end"
                    interval={0}
                    tick={{ fill: '#334155', fontSize: 11, fontWeight: 700 }}
                  />
                  <YAxis 
                    domain={[0, 100]}
                    tick={{ fill: '#64748b', fontSize: 11 }}
                    tickFormatter={(val) => `${val}%`}
                  />
                  <Tooltip 
                    formatter={(value: any) => [`${value}% Cleared`, 'Collection Rate']}
                    contentStyle={{ backgroundColor: '#0f172a', borderRadius: '0.75rem', color: '#fff', border: 'none' }}
                  />
                  <Bar 
                    dataKey="collectionRate" 
                    name="Collection Rate (%)" 
                    fill="#2563eb"
                    radius={[6, 6, 0, 0]}
                    barSize={28}
                  >
                    {classFeeChartData.map((entry, index) => (
                      <Cell 
                        key={`rate-cell-${index}`} 
                        fill={entry.collectionRate >= 80 ? '#059669' : entry.collectionRate >= 50 ? '#2563eb' : '#e11d48'} 
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </section>

      {/* ========================================================================= */}
      {/* 4. COMPOSITION & CATEGORY SHARES (PIE & DONUT CHARTS)                     */}
      {/* ========================================================================= */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Income Sources Distribution */}
        <section className="bg-white rounded-3xl p-5 border border-slate-200 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
                Revenue Streams
              </span>
              <h3 className="text-sm font-extrabold text-slate-900">
                Income Sources Breakdown
              </h3>
            </div>
            <div className="p-1.5 rounded-xl bg-emerald-50 text-emerald-700">
              <PieChartIcon className="w-4 h-4" />
            </div>
          </div>

          <div className="h-64 w-full flex items-center justify-center">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={incomeBreakdownData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={85}
                  paddingAngle={4}
                  dataKey="value"
                >
                  {incomeBreakdownData.map((entry, index) => (
                    <Cell key={`income-cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip content={<CustomCurrencyTooltip />} />
                <Legend 
                  verticalAlign="bottom" 
                  layout="horizontal"
                  formatter={(value) => <span className="text-[11px] font-bold text-slate-700">{value}</span>}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </section>

        {/* Operating Expense Distribution */}
        <section className="bg-white rounded-3xl p-5 border border-slate-200 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
                Cost Allocation
              </span>
              <h3 className="text-sm font-extrabold text-slate-900">
                Expenses by Category
              </h3>
            </div>
            <div className="p-1.5 rounded-xl bg-rose-50 text-rose-700">
              <Layers className="w-4 h-4" />
            </div>
          </div>

          <div className="h-64 w-full flex items-center justify-center">
            {expenseBreakdownData.length === 0 ? (
              <div className="text-xs text-slate-400 text-center">
                No recorded expense categories yet
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={expenseBreakdownData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={85}
                    paddingAngle={4}
                    dataKey="value"
                  >
                    {expenseBreakdownData.map((entry, index) => (
                      <Cell key={`expense-cell-${index}`} fill={COLORS[(index + 3) % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip content={<CustomCurrencyTooltip />} />
                  <Legend 
                    verticalAlign="bottom" 
                    layout="horizontal"
                    formatter={(value) => <span className="text-[11px] font-bold text-slate-700">{value}</span>}
                  />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </section>
      </div>

      {/* Printable Audit Sheet (Only visible when printing or in print preview) */}
      <div id="printable-audit-report" className="hidden print:block text-black bg-white p-6 space-y-4">
        <div className="border-b-2 border-black pb-3 text-center">
          <h1 className="text-xl font-bold uppercase">{session.schoolName}</h1>
          <p className="text-sm font-semibold">BURSAR FINANCIAL AUDIT & REVENUE PROGRESS REPORT</p>
          <p className="text-xs text-gray-600">
            Term: {selectedTerm === 'all' ? 'All Terms' : selectedTerm} • Academic Session: {session.schoolName} • Date: {new Date().toLocaleDateString()}
          </p>
        </div>

        <div className="grid grid-cols-3 gap-4 border p-3 text-xs font-mono">
          <div>Total Income: {formatCurrency(netFinancials.totalIncomeCollected, currencySymbol)}</div>
          <div>Total Expenses: {formatCurrency(netFinancials.totalExpenses, currencySymbol)}</div>
          <div>Net Operating Surplus: {formatCurrency(netFinancials.netOperatingSurplus, currencySymbol)}</div>
        </div>

        <h3 className="text-sm font-bold mt-4">Class-by-Class Financial Summary</h3>
        <table className="w-full text-xs border-collapse border border-gray-300">
          <thead>
            <tr className="bg-gray-100">
              <th className="border p-1.5 text-left">Class</th>
              <th className="border p-1.5 text-center">Students</th>
              <th className="border p-1.5 text-right">Expected</th>
              <th className="border p-1.5 text-right">Collected</th>
              <th className="border p-1.5 text-right">Outstanding</th>
              <th className="border p-1.5 text-center">Rate</th>
            </tr>
          </thead>
          <tbody>
            {classSummaries.map((c) => (
              <tr key={c.className}>
                <td className="border p-1.5 font-bold">{c.className}</td>
                <td className="border p-1.5 text-center">{c.studentCount}</td>
                <td className="border p-1.5 text-right font-mono">{formatCurrency(c.totalFees, currencySymbol)}</td>
                <td className="border p-1.5 text-right font-mono">{formatCurrency(c.totalPaid, currencySymbol)}</td>
                <td className="border p-1.5 text-right font-mono">{formatCurrency(c.totalBalance, currencySymbol)}</td>
                <td className="border p-1.5 text-center font-bold font-mono">{c.collectionRate}%</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="pt-8 flex justify-between text-xs">
          <div>
            <div className="w-48 border-b border-black mb-1"></div>
            <p>Bursar Signature: {session.bursarName}</p>
          </div>
          <div>
            <div className="w-48 border-b border-black mb-1"></div>
            <p>Principal / Auditor Signature</p>
          </div>
        </div>
      </div>
    </div>
  );
};
