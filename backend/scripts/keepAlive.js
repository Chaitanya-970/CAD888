/**
 * Keep-Alive Script for Glitch / Free Tiers
 * 
 * Run this on your local machine to ping your deployed backend every 4 minutes.
 * This prevents free hosts like Glitch from going to sleep due to inactivity.
 * 
 * Usage: node scripts/keepAlive.js <YOUR_APP_URL>
 */

const targetUrl = process.argv[2];

if (!targetUrl) {
  console.error("❌ Error: Please provide your backend URL.");
  console.error("Usage: node keepAlive.js https://your-project.glitch.me/health");
  process.exit(1);
}

// Ensure it has a protocol
const url = targetUrl.startsWith('http') ? targetUrl : `https://${targetUrl}`;

console.log(`\n🚀 Keep-Alive script started!`);
console.log(`📡 Target: ${url}`);
console.log(`⏱️  Pinging every 4 minutes to prevent sleep...\n`);

let pings = 0;

async function ping() {
  try {
    const res = await fetch(url);
    pings++;
    console.log(`[${new Date().toLocaleTimeString()}] Ping #${pings} sent. Status: ${res.status} ${res.statusText}`);
  } catch (err) {
    console.error(`[${new Date().toLocaleTimeString()}] Ping failed: ${err.message}`);
  }
}

// Ping immediately, then every 4 minutes (240,000 ms)
ping();
setInterval(ping, 4 * 60 * 1000);
