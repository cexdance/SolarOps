// SolarFlow MVP - Xero Integration Service
import { Job, Customer } from '../types';

const XERO_CLIENT_ID = 'demo_client_id'; // Replace with actual client ID
const XERO_REDIRECT_URI = `${window.location.origin}/xero-callback`;

export interface XeroInvoiceRequest {
  customer: Customer;
  job: Job;
}

export interface XeroInvoiceResponse {
  success: boolean;
  invoiceId?: string;
  invoiceNumber?: string;
  error?: string;
}

// Mock Xero API for demo purposes
export const createXeroInvoice = async (
  request: XeroInvoiceRequest
): Promise<XeroInvoiceResponse> => {
  // Simulate API delay
  await new Promise((resolve) => setTimeout(resolve, 1000));

  const { customer, job } = request;

  // Generate mock invoice
  const invoiceNumber = `INV-${Date.now().toString().slice(-6)}`;

  console.log('Creating Xero Invoice:', {
    contact: customer.name,
    email: customer.email,
    lineItems: [
      {
        description: `${job.serviceType.charAt(0).toUpperCase() + job.serviceType.slice(1)} Service`,
        quantity: job.laborHours,
        unitAmount: job.laborRate,
        lineAmount: job.laborHours * job.laborRate,
      },
      ...(job.partsCost > 0
        ? [
            {
              description: 'Parts & Materials',
              quantity: 1,
              unitAmount: job.partsCost,
              lineAmount: job.partsCost,
            },
          ]
        : []),
    ],
    total: job.totalAmount,
  });

  return {
    success: true,
    invoiceId: `xero-${Date.now()}`,
    invoiceNumber,
  };
};

export const getXeroAuthUrl = (): string => {
  const scopes = 'openid profile email accounting.contacts accounting.transactions offline_access';
  return `https://login.xero.com/identity/connect/authorize?response_type=code&client_id=${XERO_CLIENT_ID}&redirect_uri=${encodeURIComponent(
    XERO_REDIRECT_URI
  )}&scope=${encodeURIComponent(scopes)}&state=demo`;
};

export const checkXeroConnection = async (): Promise<boolean> => {
  // In production, this would check the stored token validity
  return false;
};

// Real Xero API implementation (for when credentials are provided)
export const xeroApi = {
  async createInvoice(request: XeroInvoiceRequest): Promise<XeroInvoiceResponse> {
    // This is where the real Xero API call would go
    // Using the SDK: xero.accountingApi.createInvoice(...)
    return createXeroInvoice(request);
  },

  async getOrganisation(): Promise<{ name: string } | null> {
    // Would call xero.accountingApi.getOrganisation()
    return { name: 'Conexsol LLC' };
  },

  async syncCustomer(customer: Customer): Promise<boolean> {
    console.log('Syncing customer to Xero:', customer.name);
    return true;
  },
};
