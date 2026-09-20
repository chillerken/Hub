package online.luxwash.voice;

import android.content.Context;
import java.util.*;

public final class CommandRouter {
    public interface Callback { void done(String spokenResult); }
    private CommandRouter() {}

    public static void execute(Context context, String phrase, Callback cb) {
        new Thread(() -> {
            DbHelper db = new DbHelper(context);
            String result;
            boolean ok = true;
            try {
                IntentParser.Intent intent = IntentParser.parse(phrase);
                switch (intent) {
                    case FIND_PROSPECTS: {
                        List<Prospect> found = ProspectFinder.findNew(context, 20);
                        int added = db.saveProspects(found);
                        int withMail = 0; StringBuilder names = new StringBuilder();
                        for (Prospect p : found) {
                            if (!p.email.isEmpty()) withMail++;
                            if (names.length() < 180) {
                                if (names.length() > 0) names.append(", ");
                                names.append(p.name);
                            }
                        }
                        result = "Ik vond " + added + " nieuwe bedrijven, waarvan " + withMail + " met een publiek e-mailadres. " +
                                (names.length() > 0 ? "Onder andere: " + names + "." : "Er waren deze keer geen nieuwe geschikte resultaten.");
                        break;
                    }
                    case SEND_EMAILS: {
                        List<Prospect> list = db.getUncontactedWithEmail(5);
                        if (list.isEmpty()) result = "Er staan geen nieuwe ongecontacteerde prospects met e-mailadres klaar.";
                        else {
                            int sent = SmtpClient.sendBatch(context, list, 5);
                            result = sent + " prospectmails zijn verzonden. Ik heb de verzonden bedrijven als gecontacteerd gemarkeerd.";
                        }
                        break;
                    }
                    case DAILY_BRIEF: result = db.briefingText(); break;
                    case CALENDAR: result = CalendarHelper.summary(context, phrase); break;
                    case STATUS: result = db.statusText(); break;
                    case WEBHOOK: result = WebhookClient.run(context, phrase); break;
                    case HELP:
                        result = "U kunt onder andere zeggen: zoek nieuwe bedrijven, stuur een mail naar de beste nieuwe bedrijven, wat is er vandaag gebeurd, wat staat morgen in mijn agenda, of geef LuxWash status.";
                        break;
                    default:
                        result = "Die vraag herken ik nog niet als LuxWash-opdracht. U kunt wel prospects zoeken, mails versturen, uw briefing opvragen, uw agenda beluisteren of een ingestelde automatiserings-webhook starten.";
                }
            } catch (Exception e) {
                ok = false;
                result = "De opdracht kon niet volledig worden uitgevoerd. " + clean(e.getMessage());
            }
            db.log("command", phrase + " -> " + result, ok);
            cb.done(result);
        }, "luxwash-command").start();
    }

    private static String clean(String s) {
        if (s == null || s.trim().isEmpty()) return "Onbekende fout.";
        return s.length() > 220 ? s.substring(0,220) : s;
    }
}
