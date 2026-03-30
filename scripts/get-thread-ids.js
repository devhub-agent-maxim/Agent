require('./lib/config');
const https = require('https');
const token = process.env.TELEGRAM_BOT_TOKEN;

https.get(`https://api.telegram.org/bot${token}/getUpdates?limit=50`, res => {
  let d = '';
  res.on('data', c => d += c);
  res.on('end', () => {
    const updates = JSON.parse(d).result || [];
    if (updates.length === 0) {
      console.log('No recent updates. Send a message in each topic first, then run this again.');
      return;
    }
    const seen = new Set();
    updates.forEach(u => {
      const m = u.message;
      if (m && m.message_thread_id) {
        const key = m.message_thread_id;
        if (!seen.has(key)) {
          seen.add(key);
          console.log(`Thread ID: ${m.message_thread_id}  |  Topic/Chat: ${m.chat.title || m.chat.id}`);
        }
      }
    });
    if (seen.size === 0) console.log('No topic messages found. Make sure you send a message inside each topic thread.');
  });
});
