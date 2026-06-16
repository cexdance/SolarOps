/**
 * Check activityHistory in Supabase for specific SOs
 * to see if comments from Cesar are actually saved there
 */

import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://cjmhfagkkayelcsprbai.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ SUPABASE_SERVICE_ROLE_KEY not set');
  process.exit(1);
}

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

async function getAllJobs() {
  const { data, error } = await supabaseAdmin
    .from('app_data')
    .select('key, value')
    .ilike('key', 'job:%')
    .limit(500);
  
  if (error) throw error;
  
  const jobs = [];
  for (const d of data || []) {
    try {
      jobs.push({ key: d.key, value: JSON.parse(d.value) });
    } catch {
      // Skip invalid JSON
    }
  }
  return jobs;
}

async function getAllCustomers() {
  const { data, error } = await supabaseAdmin
    .from('app_data')
    .select('key, value')
    .ilike('key', 'customer:%')
    .limit(500);
  
  if (error) throw error;
  
  const customers = [];
  for (const d of data || []) {
    try {
      customers.push({ key: d.key, value: JSON.parse(d.value) });
    } catch {
      // Skip invalid JSON
    }
  }
  return customers;
}

function findJobsBySONumber(jobs, soNumber) {
  const num = soNumber.replace('SO-', '').replace('WO-', '');
  return jobs.filter(j => 
    j.value.woNumber?.includes(num) ||
    j.value.serviceOrderNo?.includes(num) ||
    j.value.id?.includes(num)
  );
}

function findCustomerById(customers, customerId) {
  return customers.find(c => c.value.id === customerId);
}

async function main() {
  console.log('🔍 Fetching all jobs and customers...\n');
  
  const [jobs, customers] = await Promise.all([getAllJobs(), getAllCustomers()]);
  console.log(`✅ Loaded ${jobs.length} jobs, ${customers.length} customers\n`);
  
  // Target SOs from notifications
  const TARGET_SOS = [
    'SO-2606-82754', // Meagen Murphy - 11:07 AM
    'SO-2605-89113', // Omar Resto - 11:29/11:31 AM
    'SO-2605-97694', // Zoila Posada - 11:31/11:42 AM
    'SO-2606-38009', // Alfredo Alfonso - 12:26 PM
  ];
  
  for (const so of TARGET_SOS) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`📋 Checking ${so}`);
    console.log(`${'='.repeat(60)}`);
    
    const matchingJobs = findJobsBySONumber(jobs, so);
    
    if (matchingJobs.length === 0) {
      console.log(`  ❌ No job found with ${so}`);
      continue;
    }
    
    for (const job of matchingJobs) {
      const j = job.value;
      console.log(`  ✅ Job: ${job.key}`);
      console.log(`     Customer: ${j.customerId}`);
      console.log(`     woNumber: ${j.woNumber}`);
      console.log(`     serviceOrderNo: ${j.serviceOrderNo}`);
      console.log(`     status: ${j.status}`);
      
      // Check customer activityHistory
      const customer = findCustomerById(customers, j.customerId);
      if (customer) {
        const c = customer.value;
        console.log(`     Customer name: ${c.name} (${c.clientId})`);
        
        const activities = c.activityHistory || [];
        const matching = activities.filter(a => {
          const desc = (a.description || '').toLowerCase();
          return desc.includes('@dmatos') || 
                 desc.includes('@daniel') || 
                 desc.includes('cesar') ||
                 desc.includes(so.toLowerCase()) ||
                 (a.mentions && a.mentions.some(m => m.includes('dmatos') || m.includes('6ca5ea58')));
        });
        
        console.log(`  📝 Customer.activityHistory matching: ${matching.length} / ${activities.length} total`);
        if (matching.length === 0 && activities.length > 0) {
          console.log(`     ⚠️  NO matching activities! Recent:`);
          activities.slice(-3).forEach(a => {
            console.log(`       - ${a.timestamp} [${a.type}]: ${a.description?.slice(0, 80)}`);
          });
        } else {
          matching.forEach(a => {
            console.log(`     ✅ ${a.timestamp} [${a.type}]: ${a.description?.slice(0, 100)}`);
            if (a.mentions) console.log(`        Mentions: ${a.mentions.join(', ')}`);
          });
        }
      } else {
        console.log(`     ❌ Customer ${j.customerId} not found!`);
      }
      
      // Check job.activityHistory
      const jobActivities = j.activityHistory || [];
      const matchingJob = jobActivities.filter(a => {
        const desc = (a.description || '').toLowerCase();
        return desc.includes('@dmatos') || desc.includes('@daniel') || desc.includes('cesar');
      });
      console.log(`  📝 Job.activityHistory matching: ${matchingJob.length} / ${jobActivities.length} total`);
      if (matchingJob.length === 0 && jobActivities.length > 0) {
        console.log(`     Recent job activities:`);
        jobActivities.slice(-3).forEach(a => {
          console.log(`       - ${a.timestamp} [${a.type}]: ${a.description?.slice(0, 80)}`);
        });
      } else {
        matchingJob.forEach(a => {
          console.log(`     ✅ ${a.timestamp} [${a.type}]: ${a.description?.slice(0, 100)}`);
        });
      }
    }
  }
  
  // Check US-15397 (Jarrod Hollander)
  console.log('\n' + '='.repeat(60));
  console.log('📋 Checking US-15397 (Jarrod Hollander) - 11:03 AM comment');
  console.log('='.repeat(60));
  
  const hollander = customers.find(c => 
    c.value.clientId === 'US-15397' || 
    c.value.name?.toLowerCase().includes('hollander')
  );
  
  if (hollander) {
    const c = hollander.value;
    console.log(`  ✅ Found: ${c.name} (${c.id}) [${c.clientId}]`);
    const activities = c.activityHistory || [];
    const matching = activities.filter(a => {
      const desc = (a.description || '').toLowerCase();
      return desc.includes('@dmatos') || desc.includes('27 optim') || desc.includes('800') || desc.includes('900');
    });
    console.log(`  📝 Matching activities: ${matching.length} / ${activities.length} total`);
    if (matching.length === 0) {
      console.log(`  ⚠️  NO matching activities! Recent:`);
      activities.slice(-5).forEach(a => console.log(`       - ${a.timestamp}: ${a.description?.slice(0, 80)}`));
    } else {
      matching.forEach(a => console.log(`     ✅ ${a.timestamp}: ${a.description?.slice(0, 100)}`));
    }
  } else {
    console.log(`  ❌ US-15397 not found`);
  }
  
  // Also check for any jobs with "Zoila" or "Posada" or "Omar" or "Resto" or "Alfredo" or "Meagen"
  console.log('\n' + '='.repeat(60));
  console.log('🔍 Searching for customers by name...');
  console.log('='.repeat(60));
  
  const searchNames = ['zoila', 'posada', 'omar', 'resto', 'alfredo', 'meagen', 'murphy'];
  for (const name of searchNames) {
    const found = customers.filter(c => 
      c.value.name?.toLowerCase().includes(name)
    );
    if (found.length > 0) {
      console.log(`  "${name}": ${found.map(f => `${f.value.name} (${f.value.clientId})`).join(', ')}`);
    }
  }
}

main().catch(console.error);