/**
 * Trace the specific 11:07 AM comment for Meagen Murphy, SO-2606-82754
 * (Values from Supabase are already parsed objects, not JSON strings)
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

async function main() {
  console.log('🔍 Tracing 11:07 AM comment: Meagen Murphy, SO-2606-82754\n');
  
  // 1. Find all jobs - values are already objects
  const { data: jobData, error: jobError } = await supabaseAdmin
    .from('app_data')
    .select('key, value')
    .ilike('key', 'job:job-%')
    .limit(500);
  
  if (jobError) throw jobError;
  
  const jobs = jobData || [];
  console.log(`✅ Loaded ${jobs.length} jobs`);
  
  // 2. Find the job with SO-2606-82754
  const targetJob = jobs.find(j => 
    j.value.woNumber?.includes('2606-82754') || 
    j.value.serviceOrderNo?.includes('2606-82754') ||
    j.value.id?.includes('2606-82754')
  );
  
  if (!targetJob) {
    console.log('❌ Job with SO-2606-82754 NOT FOUND in jobs table');
    // Search more broadly
    const broad = jobs.filter(j => 
      j.value.woNumber?.includes('2606') || j.value.serviceOrderNo?.includes('2606')
    );
    console.log(`\nJobs with 2606 in number (${broad.length} found):`);
    broad.forEach(j => console.log(`  ${j.key}: woNumber=${j.value.woNumber}, serviceOrderNo=${j.value.serviceOrderNo}, customerId=${j.value.customerId}`));
  } else {
    console.log(`\n✅ Found target job: ${targetJob.key}`);
    const j = targetJob.value;
    console.log(`   woNumber: ${j.woNumber}`);
    console.log(`   serviceOrderNo: ${j.serviceOrderNo}`);
    console.log(`   customerId: ${j.customerId}`);
    console.log(`   status: ${j.status}`);
    console.log(`   technicianId: ${j.technicianId}`);
    console.log(`   title: ${j.title}`);
    console.log(`   serviceType: ${j.serviceType}`);
    
    // Check job.activityHistory
    const jobActivities = j.activityHistory || [];
    console.log(`\n📝 Job.activityHistory (${jobActivities.length} entries):`);
    jobActivities.forEach((a, i) => {
      const desc = a.description || '';
      if (desc.toLowerCase().includes('dmatos') || desc.toLowerCase().includes('quote preview') || desc.toLowerCase().includes('cesar')) {
        console.log(`  ✅ [${i}] ${a.timestamp} [${a.type}]: ${desc.slice(0, 120)}`);
        if (a.mentions) console.log(`      Mentions: ${a.mentions.join(', ')}`);
      }
    });
    if (jobActivities.length > 0 && !jobActivities.some(a => (a.description||'').toLowerCase().includes('dmatos'))) {
      console.log(`  (No mentions of @dmatos/quote preview found. Showing last 5:)`);
      jobActivities.slice(-5).forEach((a, i) => console.log(`  [${jobActivities.length-5+i}] ${a.timestamp}: ${a.description?.slice(0, 80)}`));
    }
  }
  
  // 3. Find customer Meagen Murphy (cust-97)
  const { data: custData, error: custError } = await supabaseAdmin
    .from('app_data')
    .select('key, value')
    .eq('key', 'customer:cust-97')
    .single();
  
  if (custError) throw custError;
  
  const meagen = custData?.value;
  if (!meagen) {
    console.log('❌ cust-97 not found');
  } else {
    console.log(`\n✅ Found customer: ${meagen.name} (${meagen.clientId}) [${meagen.id}]`);
    
    const activities = meagen.activityHistory || [];
    console.log(`\n📝 Customer.activityHistory (${activities.length} entries):`);
    
    const matching = activities.filter(a => {
      const desc = (a.description || '').toLowerCase();
      return desc.includes('dmatos') || desc.includes('daniel') || desc.includes('quote preview') || desc.includes('cesar') || desc.includes('2606-82754');
    });
    
    if (matching.length > 0) {
      matching.forEach((a, i) => {
        console.log(`  ✅ [MATCH ${i}] ${a.timestamp} [${a.type}]: ${a.description?.slice(0, 150)}`);
        if (a.mentions) console.log(`      Mentions: ${a.mentions.join(', ')}`);
      });
    } else {
      console.log(`  ❌ NO matching activities for @dmatos/quote preview/Cesar/SO-2606-82754`);
      console.log(`  Recent activities:`);
      activities.slice(-15).forEach((a, i) => console.log(`  [${activities.length-15+i}] ${a.timestamp} [${a.type}]: ${a.description?.slice(0, 100)}`));
    }
    
    // Also show all activities for full context
    console.log(`\n  ALL activities (for context):`);
    activities.forEach((a, i) => {
      console.log(`  [${i}] ${a.timestamp} [${a.type}]: ${a.description?.slice(0, 120)}`);
      if (a.mentions && a.mentions.length > 0) console.log(`      Mentions: ${a.mentions.join(', ')}`);
    });
  }
  
  // 4. Check notifications table for this specific comment
  console.log('\n--- Checking notifications table for this comment ---');
  const danielId = '6ca5ea58-4107-40cf-867c-6227469295dd';
  const { data: notifs, error: notifError } = await supabaseAdmin
    .from('notifications')
    .select('*')
    .eq('user_id', danielId)
    .eq('type', 'mention')
    .ilike('message', '%Meagen Murphy%')
    .order('created_at', { ascending: false })
    .limit(10);
  
  if (notifError) throw notifError;
  
  console.log(`Notifications for Meagen Murphy mention: ${notifs?.length || 0}`);
  notifs?.forEach(n => {
    console.log(`  🕐 ${n.created_at}: ${n.message}`);
    console.log(`     related_customer_id: ${n.related_customer_id}`);
    console.log(`     related_job_id: ${n.related_job_id}`);
  });
  
  // 5. Find all jobs for customer cust-97
  console.log('\n--- All jobs for customer cust-97 ---');
  const meagenJobs = jobs.filter(j => j.value.customerId === 'cust-97');
  meagenJobs.forEach(j => {
    const v = j.value;
    console.log(`  ${j.key}: woNumber=${v.woNumber}, serviceOrderNo=${v.serviceOrderNo}, status=${v.status}, title=${v.title}`);
  });
  
  // 6. Check if there's a job with serviceOrderNo SO-2606-82754
  console.log('\n--- Searching for SO-2606-82754 in serviceOrderNo ---');
  const soJobs = jobs.filter(j => j.value.serviceOrderNo === 'SO-2606-82754' || j.value.woNumber === 'WO-2606-82754');
  if (soJobs.length > 0) {
    soJobs.forEach(j => console.log(`  ${j.key}: ${JSON.stringify(j.value, null, 2).slice(0, 500)}`));
  } else {
    console.log('  No job found with serviceOrderNo=SO-2606-82754 or woNumber=WO-2606-82754');
    // Check all serviceOrderNo values
    const allSONums = jobs.map(j => j.value.serviceOrderNo).filter(Boolean);
    const matches = allSONums.filter(s => s.includes('2606-82754') || s.includes('82754'));
    console.log(`  serviceOrderNo containing 82754: ${matches.join(', ') || 'none'}`);
  }
}

main().catch(console.error);