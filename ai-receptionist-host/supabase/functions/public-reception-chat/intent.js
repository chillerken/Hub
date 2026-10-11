export function isAppointmentRequest(message) {
 const low=String(message||"").toLowerCase();
 const explicit=/\b(?:ik\s+wil|ik\s+wens|graag|kan\s+ik|kunnen\s+we)\b.{0,50}\b(?:afspraak|boeken|inplannen|reserveren)\b|\bafspraak\s+(?:maken|boeken|inplannen)\b/.test(low);
 const informational=/\b(?:hoe|wanneer|waarom|moet)\b.{0,60}\b(?:afspraak|boeken|inplannen|reserveren)\b|\b(?:is|wordt)\b.{0,50}\baanvraag\b.{0,60}\bafspraak\b|\b(?:is|wordt)\b.{0,40}\bafspraak\b.{0,40}\b(?:bevestigd|definitief)\b/.test(low);
 if(/^\s*hoe\b/.test(low)||informational&&!explicit)return false;
 const bookingText=low
  .replace(/\b(?:geen|niet(?:\s+meer)?)\s+(?:(?:een|nieuwe|nu)\s+)?(?:afspraak|boek\w*|inplannen|reserver\w*)\b/g,"")
  .replace(/\b(?:afspraak|boek\w*|inplannen|reserver\w*)\s+(?:niet|annuleren|afzeggen)\b/g,"");
 // A generic support or staffing question is not a booking request.
 const bookingTerms=/\bafspraak\b|\bboeken\b|\binplannen\b|\breserv\w*\b|\btijdslot\b/i;
 if(bookingTerms.test(bookingText))return true;
 const supportContext=/\b(?:klantenservice|helpdesk|support|ondersteuning|personeel|team)\b|\bbeschikbaar\s+voor\s+(?:vragen|hulp)\b/i;
 return /\bbeschikbaar\b/i.test(bookingText)&&!supportContext.test(low);
}
