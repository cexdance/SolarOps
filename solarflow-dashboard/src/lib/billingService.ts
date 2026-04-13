// SolarOps - Billing Timer Service
// Runs on app load to apply late fees, contractor bonuses, and auto-pay triggers.
import { Job, AppNotification } from '../types';

const LATE_FEE_1_DAYS = 14;         // Days after invoiced before first late fee
const LATE_FEE_2_DAYS = 21;         // Days after invoiced before second late fee + disconnect warning
const CONTRACTOR_BONUS_DAYS = 14;   // Days after completed before delay bonus
const CONTRACTOR_AUTOPAY_DAYS = 28; // Days after completed before auto-pay

const LATE_FEE_1_RATE = 0.015;      // 1.5% of invoice
const LATE_FEE_2_RATE = 0.025;      // 2.5% of invoice
const CONTRACTOR_DELAY_BONUS_RATE = 0.05; // 5% of job amount

// Admin user IDs: Cesar Jurado, Daniel Matos, Anthony Lopez
const ADMIN_USER_IDS = ['user-1', 'user-3', 'user-4'];

export interface BillingResult {
  jobs: Job[];
  newNotifications: AppNotification[];
}

function addDays(isoDate: string, days: number): string {
  const d = new Date(isoDate);
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

function isPastDays(isoDate: string | undefined, days: number): boolean {
  if (!isoDate) return false;
  const cutoff = new Date(isoDate);
  cutoff.setDate(cutoff.getDate() + days);
  return new Date() >= cutoff;
}

function makeNotif(
  userId: string,
  type: AppNotification['type'],
  title: string,
  message: string,
  jobId: string,
  contractorId?: string,
): AppNotification {
  return {
    id: `notif-${Date.now()}-${userId}-${Math.random().toString(36).slice(2, 6)}`,
    userId,
    type,
    title,
    message,
    relatedJobId: jobId,
    relatedContractorId: contractorId,
    read: false,
    createdAt: new Date().toISOString(),
  };
}

export function processBillingTimers(jobs: Job[]): BillingResult {
  const newNotifications: AppNotification[] = [];

  const updatedJobs = jobs.map(job => {
    let j = { ...job };
    const label = j.woNumber || j.id;

    // ── Client billing timers (invoiced, unpaid) ─────────────────────────────
    if (j.status === 'invoiced' && j.invoicedAt && !j.clientPaidAt) {
      // Set payment due date (one-time)
      if (!j.clientPaymentDueAt) {
        j.clientPaymentDueAt = addDays(j.invoicedAt, LATE_FEE_1_DAYS);
      }

      // Late fee 1: 14 days overdue
      if (!j.lateFee1AppliedAt && isPastDays(j.invoicedAt, LATE_FEE_1_DAYS)) {
        const fee = Math.round((j.totalAmount || 0) * LATE_FEE_1_RATE * 100) / 100;
        j.lateFee1AppliedAt = new Date().toISOString();
        j.lateFee1Amount = fee;
        ADMIN_USER_IDS.forEach(uid => newNotifications.push(makeNotif(
          uid, 'late_fee_1', 'Late Fee Applied',
          `WO ${label}: Client invoice 14 days overdue. Late fee of $${fee.toFixed(2)} applied.`,
          job.id,
        )));
      }

      // Late fee 2 + disconnect warning: 21 days overdue (only after fee 1)
      if (j.lateFee1AppliedAt && !j.lateFee2AppliedAt && isPastDays(j.invoicedAt, LATE_FEE_2_DAYS)) {
        const fee = Math.round((j.totalAmount || 0) * LATE_FEE_2_RATE * 100) / 100;
        j.lateFee2AppliedAt = new Date().toISOString();
        j.lateFee2Amount = fee;
        j.serviceDisconnectWarningAt = new Date().toISOString();
        ADMIN_USER_IDS.forEach(uid => {
          newNotifications.push(makeNotif(
            uid, 'late_fee_2', 'Second Late Fee Applied',
            `WO ${label}: Invoice 21 days overdue. Second late fee $${fee.toFixed(2)} applied.`,
            job.id,
          ));
          newNotifications.push(makeNotif(
            uid, 'service_disconnect', 'Service Disconnect Warning',
            `WO ${label}: Client warned of service disconnection. Invoice unpaid at 21+ days.`,
            job.id,
          ));
        });
      }
    }

    // ── Contractor payment timers ────────────────────────────────────────────
    const contractorPaid = j.status === 'paid';
    if (j.completedAt && j.contractorId && !contractorPaid) {
      // Delay bonus: 14 days after completed
      if (!j.contractorPayDelayBonusAt && isPastDays(j.completedAt, CONTRACTOR_BONUS_DAYS)) {
        const bonus = Math.round((j.totalAmount || 0) * CONTRACTOR_DELAY_BONUS_RATE * 100) / 100;
        j.contractorPayDelayBonusAt = new Date().toISOString();
        j.contractorPayDelayBonusAmount = bonus;
        ADMIN_USER_IDS.forEach(uid => newNotifications.push(makeNotif(
          uid, 'late_fee_1', 'Contractor Delay Bonus Due',
          `WO ${label}: Payment delayed 14+ days. Contractor delay bonus of $${bonus.toFixed(2)} applied.`,
          job.id, j.contractorId,
        )));
      }

      // Auto-pay: 28 days after completed
      if (!j.contractorAutoPayAt && isPastDays(j.completedAt, CONTRACTOR_AUTOPAY_DAYS)) {
        j.contractorAutoPayAt = new Date().toISOString();
        ADMIN_USER_IDS.forEach(uid => newNotifications.push(makeNotif(
          uid, 'contractor_autopay', 'Contractor Auto-Pay Triggered',
          `WO ${label}: 28 days since completion — contractor auto-pay triggered regardless of client payment status.`,
          job.id, j.contractorId,
        )));
      }
    }

    return j;
  });

  return { jobs: updatedJobs, newNotifications };
}
