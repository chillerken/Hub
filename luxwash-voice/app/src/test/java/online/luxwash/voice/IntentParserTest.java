package online.luxwash.voice;

import org.junit.Test;
import static org.junit.Assert.*;

public class IntentParserTest {
    @Test public void detectsProspectSearch() {
        assertEquals(IntentParser.Intent.FIND_PROSPECTS,
                IntentParser.parse("zoek nieuwe bedrijven om een e-mail naar te sturen"));
    }
    @Test public void detectsDailyBriefing() {
        assertEquals(IntentParser.Intent.DAILY_BRIEF,
                IntentParser.parse("wat is er vandaag gebeurd"));
    }
    @Test public void detectsEmailSend() {
        assertEquals(IntentParser.Intent.SEND_EMAILS,
                IntentParser.parse("stuur een mail naar de beste nieuwe bedrijven"));
    }
    @Test public void detectsCalendar() {
        assertEquals(IntentParser.Intent.CALENDAR,
                IntentParser.parse("wat staat morgen in mijn agenda"));
    }
}
