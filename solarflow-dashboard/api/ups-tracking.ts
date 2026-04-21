/**
 * SolarOps — UPS Tracking Status API
 *
 * Checks UPS tracking status for PowerCare shipments.
 * Server-side to:
 *   1. Keep UPS credentials secure (not in client JS)
 *   2. Avoid CORS issues with UPS API
 *   3. Cache results to minimize API calls
 *
 * Mock implementation for MVP — can be upgraded to real UPS API later
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';

export interface UPSTrackingResponse {
  status: 'pending' | 'delivered' | 'error';
  trackingNumber: string;
  lastDeliveryAttempt?: string;
  estimatedDelivery?: string;
  signature?: string;
  message?: string;
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse<UPSTrackingResponse>
) {
  // Only POST is allowed for tracking checks
  if (req.method !== 'POST') {
    return res.status(405).json({
      status: 'error',
      trackingNumber: '',
      message: 'Method not allowed. Use POST.'
    });
  }

  const { trackingNumber } = req.body as { trackingNumber?: string };

  if (!trackingNumber || typeof trackingNumber !== 'string' || trackingNumber.trim().length === 0) {
    return res.status(400).json({
      status: 'error',
      trackingNumber: '',
      message: 'Tracking number is required'
    });
  }

  try {
    // MVP: Mock UPS tracking response
    // In production, replace with real UPS API call:
    // const response = await fetch('https://onlinetools.ups.com/track/v1/details/' + trackingNumber, {
    //   headers: { 'Authorization': `Bearer ${process.env.UPS_ACCESS_TOKEN}` }
    // });

    // For now, simulate realistic responses based on tracking number pattern
    const cleanTracking = trackingNumber.toUpperCase().trim();

    // Mock delivery status based on first character
    // This allows testing different scenarios without a real UPS account
    let mockStatus: 'pending' | 'delivered' = 'pending';
    let mockDeliveryDate: string | undefined;

    if (cleanTracking.startsWith('Z')) {
      // 'Z' prefix = delivered
      mockStatus = 'delivered';
      mockDeliveryDate = new Date().toISOString().split('T')[0];
    } else if (cleanTracking.startsWith('X')) {
      // 'X' prefix = error/not found
      return res.status(404).json({
        status: 'error',
        trackingNumber: cleanTracking,
        message: `Tracking number ${cleanTracking} not found in UPS system`,
      });
    } else {
      // Everything else = pending
      mockStatus = 'pending';
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      mockDeliveryDate = tomorrow.toISOString().split('T')[0];
    }

    // Return standardized response
    return res.status(200).json({
      status: mockStatus,
      trackingNumber: cleanTracking,
      estimatedDelivery: mockStatus === 'pending' ? mockDeliveryDate : undefined,
      lastDeliveryAttempt: mockStatus === 'delivered' ? mockDeliveryDate : undefined,
      signature: mockStatus === 'delivered' ? 'CLIENT' : undefined,
    });

  } catch (error) {
    console.error('[UPS Tracking] Error:', error);
    return res.status(500).json({
      status: 'error',
      trackingNumber: trackingNumber || '',
      message: 'Failed to check UPS tracking. Please try again later.',
    });
  }
}
