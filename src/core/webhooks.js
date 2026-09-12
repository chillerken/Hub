const crypto=require('node:crypto');const {safeEqual}=require('./validation');
function verifySvix(raw,headers,secret,now=Date.now()){
 const id=headers['svix-id'],timestamp=headers['svix-timestamp'],signatures=headers['svix-signature'];
 if(!secret||!id||!timestamp||!signatures||Math.abs(now/1000-Number(timestamp))>300)return false;
 const key=Buffer.from(secret.replace(/^whsec_/,''),'base64');
 const expected=crypto.createHmac('sha256',key).update(`${id}.${timestamp}.${raw}`).digest('base64');
 return signatures.split(' ').some(s=>s.startsWith('v1,')&&safeEqual(s.slice(3),expected));
}
function verifyStripe(raw,header,secret,now=Date.now()){
 if(!header||!secret)return false;const parts=header.split(',');const ts=parts.find(x=>x.startsWith('t='))?.slice(2);
 if(!ts||Math.abs(now/1000-Number(ts))>300)return false;const expected=crypto.createHmac('sha256',secret).update(`${ts}.${raw}`).digest('hex');return parts.filter(x=>x.startsWith('v1=')).some(x=>safeEqual(x.slice(3),expected));
}
module.exports={verifySvix,verifyStripe};
