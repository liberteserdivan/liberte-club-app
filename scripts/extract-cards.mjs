import fs from 'fs';

const lines = fs.readFileSync('src/main.jsx', 'utf8').split(/\r?\n/);
const header = `import React,{useEffect,useState}from'react';
import{initializeApp}from'firebase/app';
import{getMessaging,getToken,isSupported,onMessage}from'firebase/messaging';
import{Bell,Coffee,Crown,Gift,Plus,QrCode,Send,ShieldCheck,Sparkles,Star}from'lucide-react';
import{firebaseConfig,googleReviewUrl}from'../lib/constants.js';
import{addStampToCustomer,applyCouponToCustomer,checkInCustomer,claimDailyLoginReward,claimFirstOrderBonus,getReferralCode,hasDailyClaim,levelByStamps,localDayKey,loyaltyTemplate,money,productImageSrc,seed,spinLuckyWheel,vipBenefits,calculateCoins,customerBadges,redeemRewardForCustomer}from'../lib/db.js';

`;

const ranges = [
  ['function CustomerHistoryCard', 'function HomeQuickDock'],
  ['function InstallAppCard', 'function OfflineNotice'],
  ['function OfflineNotice', 'function HomeQuickDock'],
  ['function ReviewCard', 'function MenuScreen'],
  ['function Product', 'function MenuScreen'],
  ['function CouponUseCard', 'function AdminScreen'],
];

const chunks = [];
for (const [startKey, endKey] of ranges) {
  const start = lines.findIndex((l) => l.startsWith(startKey));
  const end = lines.findIndex((l) => l.startsWith(endKey));
  if (start >= 0 && end > start) {
    chunks.push(lines.slice(start, end).join('\n'));
  }
}

const body = chunks.join('\n\n').replace(/^function /gm, 'export function ');
fs.writeFileSync('src/components/Cards.jsx', header + body);
console.log('chunks', chunks.length, 'total lines', body.split('\n').length);
