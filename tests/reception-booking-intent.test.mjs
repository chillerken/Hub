import test from 'node:test';
import assert from 'node:assert/strict';
import {isAppointmentRequest} from '../ai-receptionist-host/supabase/functions/public-reception-chat/intent.js';
test('questions about the booking process do not create appointments',()=>{
 for(const question of ['Wat kost een terras van 25 m² en is mijn aanvraag meteen een bevestigde afspraak?','Hoe wordt een afspraak bevestigd?','Wanneer is de afspraak definitief?','Hoe kan ik boeken?','Ik wil geen afspraak'])assert.equal(isAppointmentRequest(question),false,question);
});
test('explicit booking requests remain actionable',()=>{
 for(const question of ['Ik wil een afspraak maken maandag om 13 uur','Graag een afspraak volgende maandag','Kan ik een afspraak boeken?','Zijn jullie maandag beschikbaar?'])assert.equal(isAppointmentRequest(question),true,question);
});
