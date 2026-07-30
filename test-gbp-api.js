/**
 * Google Business Profile API — Verification Script
 * Run this BEFORE building the full automation to confirm the API works.
 *
 * Usage:
 *   1. Complete the Google Cloud Console steps below first
 *   2. Add your credentials to the constants at the top
 *   3. Run: node test-gbp-api.js
 *
 * What this tests:
 *   - OAuth authentication works
 *   - GBP API is enabled and accessible
 *   - Can list accounts Tractify's Google account manages
 *   - Can list locations (contractor GBP listings)
 *   - Can fetch reviews for a location
 *   - Can reply to a review (only fires if ACTUALLY_REPLY = true)
 */

// ─── FILL THESE IN AFTER GOOGLE CLOUD CONSOLE STEPS ───────────────────────
const CLIENT_ID     = process.env.GOOGLE_CLIENT_ID     || 'PASTE_CLIENT_ID_HERE';
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || 'PASTE_CLIENT_SECRET_HERE';
const REFRESH_TOKEN = process.env.GBP_REFRESH_TOKEN    || 'PASTE_REFRESH_TOKEN_HERE';

// Set to true ONLY if you want to actually post a real reply to a review
// Leave false for the initial verification run
const ACTUALLY_REPLY = false;

// Evergreen's place_id from the DB — used to find their location
const TEST_PLACE_ID = ''; // paste Evergreen's place_id here if you have it
// ────────────────────────────────────────────────────────────────────────────

const { google } = require('googleapis');

function getAuthClient() {
  const auth = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET);
  auth.setCredentials({ refresh_token: REFRESH_TOKEN });
  return auth;
}

async function run() {
  const auth = getAuthClient();

  // Step 1 — verify auth works
  console.log('\n[1] Testing OAuth authentication...');
  try {
    const { token } = await auth.getAccessToken();
    console.log('    ✅ Auth works. Access token obtained.');
  } catch (e) {
    console.log('    ❌ Auth failed:', e.message);
    console.log('    → Check CLIENT_ID, CLIENT_SECRET, and REFRESH_TOKEN');
    process.exit(1);
  }

  // Step 2 — list accounts
  console.log('\n[2] Listing GBP accounts...');
  const accountsUrl = 'https://mybusinessaccountmanagement.googleapis.com/v1/accounts';
  try {
    const res = await fetch(accountsUrl, {
      headers: { Authorization: `Bearer ${(await auth.getAccessToken()).token}` }
    });
    const data = await res.json();
    if (data.accounts && data.accounts.length > 0) {
      console.log(`    ✅ Found ${data.accounts.length} account(s):`);
      data.accounts.forEach(a => console.log(`       - ${a.name} (${a.accountName})`));
      global.accountName = data.accounts[0].name; // e.g. "accounts/123456789"
    } else if (data.error) {
      console.log('    ❌ API error:', data.error.message);
      console.log('    → Make sure "My Business Account Management API" is enabled in Cloud Console');
      process.exit(1);
    } else {
      console.log('    ⚠️  No accounts found. Make sure the Google account has been added');
      console.log('       as GBP Manager on at least one business listing.');
    }
  } catch (e) {
    console.log('    ❌ Request failed:', e.message);
    process.exit(1);
  }

  if (!global.accountName) {
    console.log('\n⚠️  No account to continue with. Add setup@tractifyhq.com as GBP Manager');
    console.log('   on Evergreen\'s listing, then re-run this script.');
    process.exit(0);
  }

  // Step 3 — list locations under first account
  console.log('\n[3] Listing locations...');
  const locationsUrl = `https://mybusinessbusinessinformation.googleapis.com/v1/${global.accountName}/locations?readMask=name,title,storefrontAddress,websiteUri`;
  try {
    const res = await fetch(locationsUrl, {
      headers: { Authorization: `Bearer ${(await auth.getAccessToken()).token}` }
    });
    const data = await res.json();
    if (data.locations && data.locations.length > 0) {
      console.log(`    ✅ Found ${data.locations.length} location(s):`);
      data.locations.forEach(l => console.log(`       - ${l.title} (${l.name})`));
      global.locationName = data.locations[0].name; // e.g. "accounts/123/locations/456"
    } else if (data.error) {
      console.log('    ❌ API error:', data.error.message);
    } else {
      console.log('    ⚠️  No locations found under this account.');
    }
  } catch (e) {
    console.log('    ❌ Request failed:', e.message);
  }

  if (!global.locationName) {
    console.log('\n⚠️  No location to test reviews on. Stopping here.');
    process.exit(0);
  }

  // Step 4 — fetch reviews
  console.log('\n[4] Fetching reviews...');
  const reviewsUrl = `https://mybusinessreviews.googleapis.com/v1/${global.locationName}/reviews`;
  let reviews = [];
  try {
    const res = await fetch(reviewsUrl, {
      headers: { Authorization: `Bearer ${(await auth.getAccessToken()).token}` }
    });
    const data = await res.json();
    if (data.reviews && data.reviews.length > 0) {
      reviews = data.reviews;
      console.log(`    ✅ Found ${reviews.length} review(s):`);
      reviews.slice(0, 3).forEach(r => {
        console.log(`       - ${r.reviewer.displayName} (${r.starRating}): "${(r.comment || '').slice(0, 60)}..."`);
      });
    } else if (data.error) {
      console.log('    ❌ API error:', data.error.message);
      console.log('    → Make sure "My Business Reviews API" is enabled in Cloud Console');
    } else {
      console.log('    ⚠️  No reviews found for this location.');
    }
  } catch (e) {
    console.log('    ❌ Request failed:', e.message);
  }

  // Step 5 — test reply (only if ACTUALLY_REPLY = true AND there are reviews)
  if (ACTUALLY_REPLY && reviews.length > 0) {
    const testReview = reviews.find(r => !r.reviewReply); // find one without a reply
    if (testReview) {
      console.log('\n[5] Posting test reply...');
      const replyUrl = `https://mybusinessreviews.googleapis.com/v1/${testReview.name}/reply`;
      try {
        const res = await fetch(replyUrl, {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${(await auth.getAccessToken()).token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ comment: 'Thank you so much for the kind review! Book again anytime: https://tractifyhq.com/schedule/test' })
        });
        const data = await res.json();
        if (data.comment) {
          console.log('    ✅ Reply posted successfully.');
        } else {
          console.log('    ❌ Reply failed:', JSON.stringify(data));
        }
      } catch (e) {
        console.log('    ❌ Request failed:', e.message);
      }
    } else {
      console.log('\n[5] All reviews already have replies — skipping reply test.');
    }
  } else if (!ACTUALLY_REPLY) {
    console.log('\n[5] Reply test skipped (ACTUALLY_REPLY = false). Set to true when ready to test posting.');
  }

  console.log('\n─────────────────────────────────────────');
  console.log('Verification complete. If all steps show ✅ the GBP automation build is a go.');
  console.log('─────────────────────────────────────────\n');
}

run().catch(e => {
  console.error('Unexpected error:', e);
  process.exit(1);
});
