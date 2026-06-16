/**
 * Find comment by Cesar to Daniel at 11am in SO comments
 * 
 * This script queries the Supabase notifications table for mention notifications
 * from Cesar Jurado to Daniel Matos around 11am.
 * 
 * Run with: node scripts/find-cesar-daniel-comment.mjs
 * Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in environment
 */

import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://cjmhfagkkayelcsprbai.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ SUPABASE_SERVICE_ROLE_KEY not set in environment');
  console.log('Set it in .env.local or export it before running');
  process.exit(1);
}

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

// Known user emails
const CESAR_EMAIL = 'cesar.jurado@conexsol.us';
const DANIEL_EMAIL = 'daniel.matos@conexsol.us';

async function findDanielUserId() {
  // Look up Daniel's Supabase UUID by email
  let allUsers = [];
  let page = 1;
  while (page <= 10) {
    const { data: { users: batch }, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 100 });
    if (error) throw error;
    allUsers = allUsers.concat(batch);
    if (batch.length < 100) break;
    page++;
  }
  const daniel = allUsers.find(u => u.email?.toLowerCase() === DANIEL_EMAIL.toLowerCase());
  if (!daniel) throw new Error(`Daniel Matos (${DANIEL_EMAIL}) not found in Supabase Auth`);
  return daniel.id;
}

async function findCesarUserId() {
  let allUsers = [];
  let page = 1;
  while (page <= 10) {
    const { data: { users: batch }, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 100 });
    if (error) throw error;
    allUsers = allUsers.concat(batch);
    if (batch.length < 100) break;
    page++;
  }
  const cesar = allUsers.find(u => u.email?.toLowerCase() === CESAR_EMAIL.toLowerCase());
  if (!cesar) throw new Error(`Cesar Jurado (${CESAR_EMAIL}) not found in Supabase Auth`);
  return cesar.id;
}

async function findNotifications(danielUserId, cesarUserId) {
  // Query notifications for Daniel where title mentions Cesar
  // Look at last 48 hours
  const since = new Date();
  since.setHours(since.getHours() - 48);
  const sinceISO = since.toISOString();

  const { data, error } = await supabaseAdmin
    .from('notifications')
    .select('*')
    .eq('user_id', danielUserId)
    .eq('type', 'mention')
    .gte('created_at', sinceISO)
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) throw error;

  // Filter for notifications where Cesar is the notifier
  // Title format: "Cesar Jurado mentioned you" or similar
  const cesarNotifications = data?.filter(n => 
    n.title?.toLowerCase().includes('cesar') ||
    n.message?.toLowerCase().includes('cesar')
  ) || [];

  return cesarNotifications;
}

async function main() {
  console.log('🔍 Finding Cesar → Daniel comment at ~11am...\n');

  try {
    const danielUserId = await findDanielUserId();
    const cesarUserId = await findCesarUserId();

    console.log(`✅ Daniel Matos UUID: ${danielUserId}`);
    console.log(`✅ Cesar Jurado UUID: ${cesarUserId}\n`);

    const notifications = await findNotifications(danielUserId, cesarUserId);

    if (notifications.length === 0) {
      console.log('❌ No mention notifications from Cesar to Daniel found in last 48 hours');
      console.log('\n💡 The comment may have been:');
      console.log('   - Made before the 48-hour window');
      console.log('   - Made by a different user (not Cesar Jurado)');
      console.log('   - Made to a different user (not Daniel Matos)');
      console.log('   - Not an @mention (so no notification was created)');
      return;
    }

    console.log(`✅ Found ${notifications.length} mention notification(s) from Cesar to Daniel:\n`);

    for (const n of notifications) {
      const createdAt = new Date(n.created_at);
      const timeStr = createdAt.toLocaleString('en-US', {
        timeZone: 'America/New_York',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
        month: 'short',
        day: 'numeric',
        year: 'numeric'
      });

      console.log('─'.repeat(60));
      console.log(`🕐 Time: ${timeStr} (${n.created_at})`);
      console.log(`📋 Title: ${n.title}`);
      console.log(`💬 Message: ${n.message}`);
      console.log(`🔗 Related Customer: ${n.related_customer_id || 'N/A'}`);
      console.log(`🔗 Related Job: ${n.related_job_id || 'N/A'}`);
      console.log(`📖 Read: ${n.read ? 'Yes' : 'No'}`);
      console.log(`🆔 Notification ID: ${n.id}`);
    }

    // Also check for notifications around 11am specifically
    console.log('\n🎯 Filtering for ~11am ET (15:00-16:00 UTC)...');
    const elevenAmNotifications = notifications.filter(n => {
      const d = new Date(n.created_at);
      const hourUTC = d.getUTCHours();
      // 11am ET = 15:00 UTC (EDT) or 16:00 UTC (EST)
      return hourUTC === 15 || hourUTC === 16;
    });

    if (elevenAmNotifications.length > 0) {
      console.log(`\n✅ Found ${elevenAmNotifications.length} notification(s) around 11am ET:`);
      for (const n of elevenAmNotifications) {
        const createdAt = new Date(n.created_at);
        const timeStr = createdAt.toLocaleString('en-US', {
          timeZone: 'America/New_York',
          hour: 'numeric',
          minute: '2-digit',
          hour12: true,
          month: 'short',
          day: 'numeric',
          year: 'numeric'
        });
        console.log(`  🕐 ${timeStr} - ${n.message?.slice(0, 100)}...`);
      }
    } else {
      console.log('\n❌ No notifications found around 11am ET');
    }

  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  }
}

main();