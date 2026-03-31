#!/usr/bin/env node

/**
 * SimpleFIN setup token → access URL converter.
 * 
 * Run this ONCE after getting your setup token from SimpleFIN:
 *   node scripts/claim-token.mjs
 * 
 * It will output the access URL to add to your .env.local file.
 * The setup token is single-use — store the access URL securely.
 */

import readline from 'readline';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

rl.question('Paste your SimpleFIN setup token: ', async (token) => {
  rl.close();

  try {
    // Decode the base64 setup token to get the claim URL
    const claimUrl = Buffer.from(token.trim(), 'base64').toString('utf-8');
    console.log(`\nClaiming access URL from: ${claimUrl}\n`);

    // POST to the claim URL to get the access URL
    const response = await fetch(claimUrl, { method: 'POST' });

    if (!response.ok) {
      throw new Error(`Claim failed: ${response.status} ${response.statusText}`);
    }

    const accessUrl = await response.text();

    console.log('✓ Success! Add this to your .env.local:\n');
    console.log(`SIMPLEFIN_ACCESS_URL=${accessUrl}`);
    console.log('\n⚠ Keep this URL secret — it has your credentials embedded.');
    console.log('  The setup token is now used up and cannot be reused.');
  } catch (err) {
    console.error('✗ Failed to claim access URL:', err.message);
    process.exit(1);
  }
});
