# LuxWash Voice

Zelfstandige Android-stemassistent voor LuxWash. De app gebruikt geen Gemini- of ChatGPT-interface.

## Werkende functies
- Continue foreground luisterservice met wake phrase **Hey LuxWash**.
- Nederlandse spraakherkenning via Android SpeechRecognizer, met voorkeur voor offline herkenning.
- Nederlands gesproken antwoord via Android TextToSpeech.
- Live zoeken naar nieuwe bedrijven in Aalst/Lede/Erpe-Mere en omgeving via OpenStreetMap/Overpass.
- Publieke e-mailadressen uit bedrijfsdata en websites halen.
- Lokaal SQLite-CRM met deduplicatie en contactstatus.
- Maximaal 5 expliciet gevraagde prospectmails per spraakopdracht via SMTP.
- SMTP-wachtwoord versleuteld met Android Keystore.
- Agenda-overzicht via Android Calendar Provider.
- Dagelijkse gesproken briefing, standaard rond 19:00.
- Optionele generieke webhook om andere automatiseringen te starten.
- Actielog en foutregistratie.

## Voorbeeldcommando's
- “Hey LuxWash” → “zoek nieuwe bedrijven”
- “stuur een mail naar de beste nieuwe bedrijven”
- “wat is er vandaag gebeurd”
- “wat staat morgen in mijn agenda”
- “geef LuxWash status”
- “voer de automatisering uit”

## E-mail instellen
Voor Gmail is een Google **app-wachtwoord** nodig. Gebruik nooit het gewone accountwachtwoord. Standaard SMTP: smtp.gmail.com, poort 465. Het afzenderadres moet in Gmail als toegestane/geverifyeerde alias zijn ingesteld als het afwijkt van het primaire account.

## Android-opmerking
Android beperkt permanente microfoontoegang. De app gebruikt daarom een zichtbare foreground service met permanente melding. Start de luisterservice terwijl de app op het scherm staat. Na een reboot moet de luisterservice om veiligheidsredenen opnieuw vanuit de app gestart worden. De dagelijkse briefing wordt wel opnieuw ingepland.

## Privacy
Prospects, actielogs en contactstatus blijven lokaal op het toestel. Het SMTP-geheim wordt via Android Keystore versleuteld. Prospectzoeken gebruikt openbare OpenStreetMap-data en publiek bereikbare bedrijfswebsites.
