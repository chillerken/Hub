package online.luxwash.voice;

import java.text.Normalizer;
import java.util.Locale;

public final class IntentParser {
    public enum Intent {
        FIND_PROSPECTS, SEND_EMAILS, DAILY_BRIEF, CALENDAR, STATUS, WEBHOOK, HELP, UNKNOWN
    }

    private IntentParser() {}

    public static Intent parse(String raw) {
        String s = normalize(raw);
        if (s.isEmpty()) return Intent.UNKNOWN;

        boolean explicitSend = s.contains("stuur ") || s.contains("verstuur ") ||
                s.contains("mail ze") || s.contains("email ze") ||
                s.contains("mail de ") || s.contains("email de ");
        if (explicitSend && (s.contains("mail") || s.contains("email"))) return Intent.SEND_EMAILS;

        if ((s.contains("zoek") || s.contains("vind")) &&
                (s.contains("bedrijf") || s.contains("bedrijven") || s.contains("prospect"))) {
            return Intent.FIND_PROSPECTS;
        }

        if (s.contains("wat is er vandaag gebeurd") || s.contains("wat gebeurde") ||
                s.contains("dagbrief") || s.contains("briefing") || s.contains("vandaag gedaan")) {
            return Intent.DAILY_BRIEF;
        }

        if (s.contains("agenda") || s.contains("afspraak") || s.contains("planning")) {
            return Intent.CALENDAR;
        }

        if (s.contains("status") || s.contains("hoe staat luxwash") || s.contains("hoe gaat luxwash")) {
            return Intent.STATUS;
        }

        if (s.startsWith("voer ") || s.startsWith("start ") || s.startsWith("run ")) {
            return Intent.WEBHOOK;
        }

        if (s.contains("help") || s.contains("wat kan je")) return Intent.HELP;
        return Intent.UNKNOWN;
    }

    public static String normalize(String raw) {
        if (raw == null) return "";
        String s = Normalizer.normalize(raw.toLowerCase(Locale.ROOT), Normalizer.Form.NFD);
        return s.replaceAll("\\p{M}", "").replaceAll("[^a-z0-9@. ]", " ").replaceAll("\\s+", " ").trim();
    }
}
