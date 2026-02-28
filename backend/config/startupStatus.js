/**
 * Print backend startup status with green/red indicators
 */
import mongoose from 'mongoose';
import { getFirebaseRealtimeStatus } from './firebaseRealtime.js';
import { getRedisClient } from './redis.js';
import firebaseAuthService from '../services/firebaseAuthService.js';
import { getRazorpayInstance } from '../services/razorpayService.js';

const OK = '✅';
const FAIL = '❌';

export async function printStartupStatus(port) {
  await new Promise(r => setTimeout(r, 2000)); // Allow async services to init

  const mongo = mongoose.connection?.readyState === 1 ? OK : FAIL;
  const firebaseRealtime = getFirebaseRealtimeStatus().initialized ? OK : FAIL;
  const firebaseAuth = firebaseAuthService.isEnabled() ? OK : FAIL;
  const redisEnabled = process.env.REDIS_ENABLED === 'true' || process.env.REDIS_ENABLED === '1';
  const redis = redisEnabled ? (getRedisClient() ? OK : FAIL) : FAIL; // FAIL if disabled
  let razorpay = FAIL;
  try {
    const rp = await getRazorpayInstance();
    razorpay = rp ? OK : FAIL;
  } catch {
    razorpay = FAIL;
  }

  const lines = [
    '',
    'Backend Status',
    '────────────────────────────────────',
    `${OK} Server        : running on port ${port}`,
    `${mongo} MongoDB       : ${mongo === OK ? 'connected' : 'not connected'}`,
    `${firebaseRealtime} Firebase RT   : ${firebaseRealtime === OK ? 'active' : 'inactive'}`,
    `${firebaseAuth} Firebase Auth: ${firebaseAuth === OK ? 'active' : 'inactive'}`,
    `${razorpay} Razorpay      : ${razorpay === OK ? 'ready' : 'not configured'}`,
    `${redis} Redis         : ${redisEnabled ? (redis === OK ? 'connected' : 'not connected') : 'disabled'}`,
    '────────────────────────────────────',
    ''
  ];
  process.stdout.write(lines.join('\n'));
}
