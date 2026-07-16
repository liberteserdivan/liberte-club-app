import fs from 'fs';

const lines = fs.readFileSync('src/main.jsx', 'utf8').split(/\r?\n/);
const loginStart = lines.findIndex((l) => l.startsWith('function Login'));
const headerStart = lines.findIndex((l) => l.startsWith('function Header'));
const adminStart = lines.findIndex((l) => l.startsWith('function AdminScreen'));

const loginHeader = `import React,{useState}from'react';
import{findReferrerByCode,norm}from'../lib/db.js';

`;
const adminHeader = `import React,{useEffect,useRef,useState}from'react';
import{Html5Qrcode}from'html5-qrcode';
import{Gift,Image as ImageIcon,Instagram,Mail,MapPin,Minus,Plus,QrCode,ScanLine,Send,ShieldCheck,Sparkles,Star,Trash2,UploadCloud}from'lucide-react';
import{mapsUrl,instagramUrl,yemeksepetiUrl}from'../lib/constants.js';
import{addStampToCustomer,applyBirthdayReward,applyCouponToCustomer,checkInCustomer,claimDailyLoginReward,claimFirstOrderBonus,fileToDataUrl,levelByStamps,localDayKey,loyaltyTemplate,money,norm,redeemRewardForCustomer,seed,spinLuckyWheel,vipBenefits,calculateCoins,customerBadges,productImageSrc,getReferralCode}from'../lib/db.js';
import{CustomerCardsAdmin,ReviewApprovalAdmin,LuckyWheelCard,DailyRewardCard,FirstOrderBonusCard,GoogleReviewBonusCard,ReferralCard,RewardsCenterCard,VipBenefitsCard,Product}from'../components/Cards.jsx';

`;

const loginBody = lines.slice(loginStart, headerStart).join('\n').replace(/^function Login/, 'export default function Login');
const adminBody = lines.slice(adminStart, lines.length - 2).join('\n').replace(/^function AdminScreen/, 'export default function AdminPage');

fs.writeFileSync('src/pages/LoginPage.jsx', loginHeader + loginBody);
fs.writeFileSync('src/pages/AdminPage.jsx', adminHeader + adminBody);
console.log('login', headerStart - loginStart, 'admin', lines.length - 2 - adminStart);
