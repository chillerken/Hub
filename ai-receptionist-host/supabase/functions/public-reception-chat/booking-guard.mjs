// Pure booking rules shared by Reception AI and Node regression tests.
// Visitors may request or revise a booking, but can never edit an operator-confirmed slot.
export const VISITOR_EDITABLE_BOOKING_STATUSES = Object.freeze(["requested", "proposed"]);

export function visitorMayReviseBooking(status) {
  return VISITOR_EDITABLE_BOOKING_STATUSES.includes(String(status || ""));
}

export function appointmentRequestReply(hasContact) {
  return hasContact
    ? "Graag. Uw gewenste dag en tijd zijn als afspraakaanvraag geregistreerd, nog niet bevestigd. Een bevoegde medewerker bevestigt persoonlijk het definitieve tijdstip."
    : "Graag. Ik registreer dit als afspraakaanvraag, nog niet als bevestigde afspraak. Welk telefoonnummer of e-mailadres mogen we gebruiken om u hierover te contacteren?";
}
