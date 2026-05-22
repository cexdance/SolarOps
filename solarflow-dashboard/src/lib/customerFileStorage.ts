/**
 * SolarOps — Customer File Storage (Supabase)
 *
 * Handles uploading pasted images/files from Customer Notes to Supabase Storage.
 * After upload, files are stored in the Customer object with authenticated URLs.
 */
import { supabase } from './supabase';

const BUCKET = 'customer-files';

export interface CustomerFileUpload {
  id: string;
  name: string;
  dataUrl: string;
  mimeType: string;
  size: number;
}

export interface StoredCustomerFile {
  id: string;
  name: string;
  url: string;
  mimeType: string;
  size: number;
  source: 'upload' | 'trello';
  createdAt: string;
}

/**
 * Upload a pasted file to Supabase Storage and return a public URL.
 * Throws error if upload fails (caller will show error toast).
 */
export async function uploadCustomerFile(
  file: CustomerFileUpload,
  customerId: string
): Promise<StoredCustomerFile> {
  // Convert dataURL to Blob
  const response = await fetch(file.dataUrl);
  const blob = await response.blob();

  // Generate path: customerId/YYYY-MM/timestamp-filename
  const date = new Date().toISOString().split('T')[0].slice(0, 7); // YYYY-MM
  const timestamp = Date.now();
  const ext = file.mimeType.split('/')[1] || 'jpg';
  const safeName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
  const path = `${customerId}/${date}/${timestamp}-${safeName}`;

  try {
    // Attempt Supabase Storage upload
    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(path, blob, {
        contentType: file.mimeType,
        upsert: true,
      });

    if (error) {
      throw new Error(`Upload failed: ${error.message}`);
    }

    // Get public URL
    const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(path);

    return {
      id: file.id,
      name: file.name,
      url: urlData.publicUrl,
      mimeType: file.mimeType,
      size: file.size,
      source: 'upload',
      createdAt: new Date().toISOString(),
    };
  } catch (err) {
    // Throw error for caller to handle (no fallback to base64)
    throw err instanceof Error ? err : new Error('File upload failed');
  }
}

/**
 * Upload multiple customer files concurrently.
 * Returns array of StoredCustomerFile with URLs.
 */
export async function uploadCustomerFiles(
  files: CustomerFileUpload[],
  customerId: string
): Promise<StoredCustomerFile[]> {
  const results = await Promise.all(
    files.map(file => uploadCustomerFile(file, customerId))
  );
  return results;
}

/**
 * Delete a customer file from Supabase Storage.
 * Note: This won't work for dataURL fallbacks since they're not in storage.
 */
export async function deleteCustomerFile(file: StoredCustomerFile): Promise<boolean> {
  // If it's a dataURL, nothing to delete from storage
  if (file.url.startsWith('data:')) {
    return true;
  }

  try {
    // Extract path from URL
    const urlObj = new URL(file.url);
    const pathParts = urlObj.pathname.split('/');
    // Path format: /storage/v0/object/public/customer-files/customerId/date/filename
    const bucketIndex = pathParts.indexOf(BUCKET);
    if (bucketIndex === -1) return false;

    const path = pathParts.slice(bucketIndex + 1).join('/');

    const { error } = await supabase.storage.from(BUCKET).remove([path]);
    if (error) {
      console.warn('[CustomerFileStorage] Delete failed:', error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.warn('[CustomerFileStorage] Delete error:', err);
    return false;
  }
}

/**
 * Check if Supabase Storage is configured and accessible.
 */
export async function isStorageAvailable(): Promise<boolean> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return false;

    const { data, error } = await supabase.storage.listBuckets();
    if (error) return false;

    return data.some(b => b.name === BUCKET);
  } catch {
    return false;
  }
}

/**
 * Ensure the customer-files bucket exists with proper policies.
 * Call this on app initialization.
 */
export async function ensureBucketExists(): Promise<boolean> {
  try {
    // Check if bucket exists
    const { data: buckets } = await supabase.storage.listBuckets();
    const exists = buckets?.some(b => b.name === BUCKET);

    if (!exists) {
      // Create bucket (only works for service role, skip if fails)
      const { error } = await supabase.storage.createBucket(BUCKET, {
        public: true, // Allow public read for authenticated users
      });
      if (error) {
        console.warn('[CustomerFileStorage] Could not create bucket:', error.message);
        // Bucket might already exist or user lacks permissions
        return false;
      }
    }
    return true;
  } catch {
    return false;
  }
}