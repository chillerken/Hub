package online.luxwash.voice;

import android.Manifest;
import android.app.*;
import android.content.*;
import android.content.pm.PackageManager;
import android.os.*;
import android.speech.*;
import android.speech.tts.*;
import java.util.*;

public final class VoiceService extends Service {
    public static final String ACTION_STOP = "online.luxwash.voice.STOP";
    public static final String ACTION_EXECUTE = "online.luxwash.voice.EXECUTE";
    public static final String ACTION_LISTEN_NOW = "online.luxwash.voice.LISTEN_NOW";
    public static final String ACTION_STATE = "online.luxwash.voice.STATE";
    public static final String EXTRA_COMMAND = "command";
    public static final String EXTRA_STATE = "state";
    public static final String EXTRA_TRANSCRIPT = "transcript";
    public static final String EXTRA_ERROR = "error";

    private static final String CHANNEL = "luxwash_voice";
    private static final int NOTIF = 4101;

    private SpeechRecognizer recognizer;
    private TextToSpeech tts;
    private boolean ttsReady;
    private boolean commandMode;
    private boolean transitioning;
    private boolean serviceStopping;
    private boolean usingOnDevice;
    private String recognitionLocale = "nl-BE";
    private int retryCount;
    private final Handler h = new Handler(Looper.getMainLooper());

    @Override public void onCreate() {
        super.onCreate();
        createChannel();
        startForeground(NOTIF, notification("LuxWash Voice wordt gestart"));
        initRecognizer(false);
        initTts();
        publish("STARTEN", "", "");
    }

    private void initRecognizer(boolean preferOnDevice) {
        if (!SpeechRecognizer.isRecognitionAvailable(this)) {
            publish("FOUT", "", "Geen Android-spraakherkenner beschikbaar op dit toestel.");
            return;
        }
        destroyRecognizer();
        try {
            if (preferOnDevice && Build.VERSION.SDK_INT >= 31 && SpeechRecognizer.isOnDeviceRecognitionAvailable(this)) {
                recognizer = SpeechRecognizer.createOnDeviceSpeechRecognizer(this);
                usingOnDevice = true;
                publish("ENGINE", "", "On-device spraakherkenning actief.");
            } else {
                recognizer = SpeechRecognizer.createSpeechRecognizer(this);
                usingOnDevice = false;
                publish("ENGINE", "", "Systeemspraakherkenning actief.");
            }
            recognizer.setRecognitionListener(listener);
        } catch (Throwable e) {
            try {
                recognizer = SpeechRecognizer.createSpeechRecognizer(this);
                usingOnDevice = false;
                recognizer.setRecognitionListener(listener);
                publish("ENGINE", "", "Fallback systeemspraakherkenning actief.");
            } catch (Throwable inner) {
                recognizer = null;
                publish("FOUT", "", "Spraakherkenning kon niet starten: " + shortMsg(inner));
            }
        }
    }

    private void initTts() {
        tts = new TextToSpeech(this, status -> {
            ttsReady = status == TextToSpeech.SUCCESS;
            if (!ttsReady) {
                publish("FOUT", "", "Tekst-naar-spraak kon niet starten.");
                return;
            }
            int r = tts.setLanguage(new Locale("nl", "BE"));
            if (r == TextToSpeech.LANG_MISSING_DATA || r == TextToSpeech.LANG_NOT_SUPPORTED) {
                tts.setLanguage(new Locale("nl", "NL"));
            }
            tts.setSpeechRate(0.96f);
            tts.setOnUtteranceProgressListener(new UtteranceProgressListener() {
                @Override public void onStart(String id) { publish("SPREEKT", "", ""); }
                @Override public void onError(String id) { h.post(VoiceService.this::resumeWake); }
                @Override public void onDone(String id) {
                    h.post(() -> {
                        if ("wake_ack".equals(id) || "listen_now_ack".equals(id)) {
                            startRecognizer(true);
                        } else if ("stopping".equals(id)) {
                            stopSelf();
                        } else {
                            resumeWake();
                        }
                    });
                }
            });
        });
    }

    @Override public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null && ACTION_STOP.equals(intent.getAction())) {
            serviceStopping = true;
            new SettingsStore(this).setVoiceEnabled(false);
            cancelListening();
            speak("LuxWash Voice stopt met luisteren.", "stopping");
            return START_NOT_STICKY;
        }

        if (intent != null && ACTION_EXECUTE.equals(intent.getAction())) {
            String cmd = intent.getStringExtra(EXTRA_COMMAND);
            if (cmd != null && !cmd.trim().isEmpty()) execute(cmd);
            return START_STICKY;
        }

        if (intent != null && ACTION_LISTEN_NOW.equals(intent.getAction())) {
            new SettingsStore(this).setVoiceEnabled(true);
            commandMode = true;
            transitioning = true;
            cancelListening();
            publish("TEST", "", "Microfoontest gestart.");
            speak("Ik luister. Zeg nu uw opdracht.", "listen_now_ack");
            return START_STICKY;
        }

        serviceStopping = false;
        new SettingsStore(this).setVoiceEnabled(true);
        h.postDelayed(this::resumeWake, 500);
        return START_STICKY;
    }

    private void resumeWake() {
        if (serviceStopping || !new SettingsStore(this).voiceEnabled()) return;
        transitioning = false;
        commandMode = false;
        retryCount = 0;
        startRecognizer(false);
    }

    private void scheduleRetry(boolean asCommand, int delayMs) {
        if (serviceStopping || !new SettingsStore(this).voiceEnabled()) return;
        retryCount++;
        int delay = Math.min(3500, delayMs + (retryCount * 250));
        h.postDelayed(() -> startRecognizer(asCommand), delay);
    }

    private void startRecognizer(boolean command) {
        if (serviceStopping) return;
        if (recognizer == null) {
            publish("FOUT", "", "Geen werkende spraakherkenner.");
            return;
        }
        if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            publish("FOUT", "", "Microfoontoegang ontbreekt.");
            return;
        }

        commandMode = command;
        cancelListening();

        Intent i = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
        i.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
        i.putExtra(RecognizerIntent.EXTRA_LANGUAGE, recognitionLocale);
        i.putExtra(RecognizerIntent.EXTRA_LANGUAGE_PREFERENCE, recognitionLocale);
        i.putExtra(RecognizerIntent.EXTRA_ONLY_RETURN_LANGUAGE_PREFERENCE, false);
        i.putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true);
        i.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 5);
        i.putExtra(RecognizerIntent.EXTRA_PREFER_OFFLINE, false);\n        i.putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_MINIMUM_LENGTH_MILLIS, 900L);\n        i.putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_POSSIBLY_COMPLETE_SILENCE_LENGTH_MILLIS, 1400L);\n        i.putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS, 2200L);

        publish(command ? "OPDRACHT" : "WAKE", "", (command ? "Ik luister naar uw opdracht. " : "Luistert naar Hey LuxWash. ") +
                "Taal: " + recognitionLocale + (usingOnDevice ? " • on-device" : " • systeem"));
        updateNotification(command ? "Luistert naar uw opdracht" : "Luistert naar “Hey LuxWash”");

        try {
            recognizer.startListening(i);
        } catch (Throwable e) {
            publish("FOUT", "", "Start luisteren mislukt: " + shortMsg(e));
            scheduleRetry(command, 1000);
        }
    }

    private final RecognitionListener listener = new RecognitionListener() {
        @Override public void onReadyForSpeech(Bundle p) {
            publish(commandMode ? "OPDRACHT" : "WAKE", "", commandMode ? "Spreek nu." : "Microfoon actief.");
        }
        @Override public void onBeginningOfSpeech() { publish("HOORT", "", "Spraak gedetecteerd."); }
        @Override public void onRmsChanged(float rms) {}
        @Override public void onBufferReceived(byte[] b) {}
        @Override public void onEndOfSpeech() { publish("VERWERKT", "", "Spraak wordt verwerkt."); }
        @Override public void onEvent(int e, Bundle b) {}

        @Override public void onPartialResults(Bundle b) {
            String s = first(b);
            if (!s.isEmpty()) publish(commandMode ? "OPDRACHT" : "WAKE", s, "");
            if (!commandMode && !transitioning && isWake(s)) wake();
        }

        @Override public void onResults(Bundle b) {
            retryCount = 0;
            String s = first(b);
            if (!s.isEmpty()) publish("HERKEND", s, "");
            if (commandMode) {
                if (s.isEmpty()) {
                    speak("Ik heb niets verstaan. Probeer opnieuw.", "result");
                } else {
                    execute(s);
                }
            } else if (isWake(s)) {
                wake();
            } else {
                scheduleRetry(false, 250);
            }
        }

        @Override public void onError(int error) {
            String msg = errorName(error);
            publish("FOUTCODE " + error, "", msg);

            if (serviceStopping) return;
            if (error == SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS) {
                publish("FOUT", "", "Microfoontoegang is geweigerd.");
                return;
            }

            if (Build.VERSION.SDK_INT >= 31 &&
                    (error == SpeechRecognizer.ERROR_LANGUAGE_NOT_SUPPORTED || error == SpeechRecognizer.ERROR_LANGUAGE_UNAVAILABLE)) {
                boolean wasCommand = commandMode;
                if ("nl-BE".equals(recognitionLocale)) {
                    recognitionLocale = "nl-NL";
                    publish("FALLBACK", "", "nl-BE niet beschikbaar; ik probeer nl-NL.");
                    scheduleRetry(wasCommand, 300);
                    return;
                }
                if (usingOnDevice) {
                    recognitionLocale = "nl-BE";
                    publish("FALLBACK", "", "Lokaal Nederlands niet beschikbaar; ik schakel naar systeemspraakherkenning.");
                    initRecognizer(false);
                    scheduleRetry(wasCommand, 500);
                    return;
                }
                publish("FOUT", "", "Geen Nederlandse spraakherkenning beschikbaar. Installeer Nederlands bij Samsung/Google spraakservices.");
                return;
            }

            if (commandMode && (error == SpeechRecognizer.ERROR_NO_MATCH || error == SpeechRecognizer.ERROR_SPEECH_TIMEOUT)) {
                speak("Ik heb uw opdracht niet verstaan. Zeg ze nog eens.", "listen_now_ack");
                return;
            }
            scheduleRetry(commandMode, error == SpeechRecognizer.ERROR_RECOGNIZER_BUSY ? 1400 : 450);
        }
    };

    private String mergePartial(String next) {
        String n = next == null ? "" : next.trim();
        if (n.isEmpty()) return partialText;
        if (partialText.isEmpty()) {
            partialText = n;
            return partialText;
        }
        String oldNorm = IntentParser.normalize(partialText);
        String newNorm = IntentParser.normalize(n);
        if (newNorm.contains(oldNorm)) partialText = n;
        else if (!oldNorm.contains(newNorm)) partialText = (partialText + " " + n).trim();
        return partialText;
    }

    private String bestResult(Bundle b) {
        String fin = first(b).trim();
        String part = partialText.trim();
        if (fin.isEmpty()) return part;
        if (part.isEmpty()) return fin;
        String fn = IntentParser.normalize(fin);
        String pn = IntentParser.normalize(part);
        if (pn.contains(fn) && part.length() >= fin.length()) return part;
        return fin;
    }

    private int wordCount(String s) {
        String n = IntentParser.normalize(s);
        return n.isEmpty() ? 0 : n.split(" ").length;
    }

    private String first(Bundle b) {
        if (b == null) return "";
        ArrayList<String> a = b.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
        return a == null || a.isEmpty() ? "" : a.get(0);
    }

    private boolean isWake(String s) {
        String n = IntentParser.normalize(s);
        return n.contains("hey luxwash") || n.contains("he luxwash") ||
                n.contains("hallo luxwash") || n.equals("luxwash") ||
                n.contains("lux wash") || n.contains("hey lux wash");
    }

    private void wake() {
        if (transitioning || serviceStopping) return;
        transitioning = true;
        cancelListening();
        publish("GEACTIVEERD", "Hey LuxWash", "Wake-word herkend.");
        speak("Ja, ik luister.", "wake_ack");
    }

    private void execute(String cmd) {
        cancelListening();
        publish("UITVOEREN", cmd, "Opdracht wordt uitgevoerd.");
        if (IntentParser.normalize(cmd).contains("stop luisteren")) {
            serviceStopping = true;
            new SettingsStore(this).setVoiceEnabled(false);
            speak("LuxWash Voice stopt met luisteren.", "stopping");
            return;
        }
        CommandRouter.execute(this, cmd, r -> h.post(() -> {
            publish("ANTWOORD", cmd, r);
            speak(r, "result");
        }));
    }

    private void speak(String text, String id) {
        if (!ttsReady) {
            publish("FOUT", "", "Spraakantwoord is nog niet beschikbaar.");
            if ("wake_ack".equals(id) || "listen_now_ack".equals(id)) {
                h.postDelayed(() -> startRecognizer(true), 500);
            } else {
                h.postDelayed(this::resumeWake, 700);
            }
            return;
        }
        cancelListening();
        tts.speak(text, TextToSpeech.QUEUE_FLUSH, null, id);
    }

    private void cancelListening() {
        if (recognizer == null) return;
        try { recognizer.cancel(); } catch (Throwable ignored) {}
    }

    private void destroyRecognizer() {
        if (recognizer != null) {
            try { recognizer.cancel(); } catch (Throwable ignored) {}
            try { recognizer.destroy(); } catch (Throwable ignored) {}
            recognizer = null;
        }
    }

    private void publish(String state, String transcript, String error) {
        Intent i = new Intent(ACTION_STATE);
        i.setPackage(getPackageName());
        i.putExtra(EXTRA_STATE, state);
        i.putExtra(EXTRA_TRANSCRIPT, transcript == null ? "" : transcript);
        i.putExtra(EXTRA_ERROR, error == null ? "" : error);
        sendBroadcast(i);
    }

    private String errorName(int e) {
        switch (e) {
            case SpeechRecognizer.ERROR_AUDIO: return "Probleem met de audio-opname.";
            case SpeechRecognizer.ERROR_CLIENT: return "De vorige luistersessie werd beëindigd; ik start opnieuw.";
            case SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS: return "Geen microfoontoegang.";
            case SpeechRecognizer.ERROR_NETWORK: return "Netwerkfout bij spraakherkenning.";
            case SpeechRecognizer.ERROR_NETWORK_TIMEOUT: return "Netwerk-time-out bij spraakherkenning.";
            case SpeechRecognizer.ERROR_NO_MATCH: return "Geen duidelijke woorden herkend.";
            case SpeechRecognizer.ERROR_RECOGNIZER_BUSY: return "Spraakherkenner was bezet; ik probeer opnieuw.";
            case SpeechRecognizer.ERROR_SERVER: return "Spraakdienst gaf een fout.";
            case SpeechRecognizer.ERROR_SPEECH_TIMEOUT: return "Geen spraak gehoord binnen de luistertijd.";
            default:
                if (Build.VERSION.SDK_INT >= 31 && e == SpeechRecognizer.ERROR_LANGUAGE_NOT_SUPPORTED) return "Deze Nederlandse taalvariant wordt niet ondersteund.";
                if (Build.VERSION.SDK_INT >= 31 && e == SpeechRecognizer.ERROR_LANGUAGE_UNAVAILABLE) return "Deze Nederlandse taalvariant is niet geïnstalleerd.";
                return "Spraakherkenningsfout " + e + ".";
        }
    }

    private String shortMsg(Throwable t) {
        String m = t == null ? "" : t.getMessage();
        if (m == null || m.trim().isEmpty()) return t == null ? "onbekend" : t.getClass().getSimpleName();
        return m.length() > 160 ? m.substring(0, 160) : m;
    }

    private void createChannel() {
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationChannel c = new NotificationChannel(CHANNEL, "LuxWash Voice", NotificationManager.IMPORTANCE_LOW);
            c.setDescription("Actieve stemassistent");
            getSystemService(NotificationManager.class).createNotificationChannel(c);
        }
    }

    private void updateNotification(String text) {
        getSystemService(NotificationManager.class).notify(NOTIF, notification(text));
    }

    private Notification notification(String text) {
        Intent open = new Intent(this, MainActivity.class);
        PendingIntent pi = PendingIntent.getActivity(this, 0, open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        Notification.Builder b = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(this, CHANNEL) : new Notification.Builder(this);
        return b.setContentTitle("LuxWash Voice 1.2").setContentText(text)
                .setSmallIcon(android.R.drawable.ic_btn_speak_now)
                .setOngoing(true).setContentIntent(pi).build();
    }

    @Override public void onDestroy() {
        serviceStopping = true;
        h.removeCallbacksAndMessages(null);
        destroyRecognizer();
        if (tts != null) tts.shutdown();
        publish("GESTOPT", "", "Luisterservice gestopt.");
        super.onDestroy();
    }

    @Override public IBinder onBind(Intent i) { return null; }
}
