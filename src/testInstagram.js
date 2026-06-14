import 'dotenv/config';
import { testConnection } from './instagram.js';

console.log('Testing Instagram connection...\n');
testConnection()
  .then(data => {
    console.log('✅ Connected!');
    console.log('   Username:', data.username);
    console.log('   Account type:', data.account_type);
    console.log('   Media count:', data.media_count);
  })
  .catch(err => {
    console.error('❌ Failed:', err.response?.data || err.message);
  });
