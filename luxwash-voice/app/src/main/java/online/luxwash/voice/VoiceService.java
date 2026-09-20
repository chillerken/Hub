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
    public static final String EXTRA_COMMAND = "command";
    private static final String CHANNEL = "luxwash_voice";
    private static final int NOTIF = 4101;

    private SpeechRecognizer recognizer;
    private TextToSpeech tts;
    private boolean ttsReady;
    private boolean commandMode;
    private boolean transitioning;
    private final Handler h = new Handler(Looper.getMainLooper());

    @Override public void onCreate() {
        super.onCreate();
        createChannel();
        startForeground(NOTIF, notification("Luistert naar “Hey LuxWash”"));
        tts = new TextToSpeech(this, status -> {
            ttsReady = status == TextToSpeech.SUCCESS;
            if (ttsReady) {
                tts.setLanguage(new Locale("nl", "BE"));
                tts.setSpeechRate(0.96f);
                tts.setOnUtteranceProgressListener(new UtteranceProgressListener() {
                    @Override public void onStart(String id) {}
                    @Override public void onError(String id) { h.post(VoiceService.this::resumeWake); }
                    @Override public void onDone(String id) {
                        h.post(() -> {
                            if ("wake_ack".equals(id)) startRecognizer(true);
                            else resumeWake();
                        });
                    }
                });
            }
        });
        if (SpeechRecognizer.isRecognitionAvailable(this)) {
            recognizer = SpeechRecognizer.createSpeechRecognizer(this);
            recognizer.setRecognitionListener(listener);
        }
    }

    @Override public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null && ACTION_STOP.equals(intent.getAction())) {
            new SettingsStore(this).setVoiceEnabled(false);
            stopSelf(); return START_NOT_STICKY;
        }
        if (intent != null && ACTION_EXECUTE.equals(intent.getAction())) {
            String cmd = intent.getStringExtra(EXTRA_COMMAND);
            if (cmd != null && !cmd.trim().isEmpty()) execute(cmd);
            return START_STICKY;
        }
        new SettingsStore(this).setVoiceEnabled(true);
        h.postDelayed(this::resumeWake, 600);
        return START_STICKY;
    }

    private void resumeWake() {
        transitioning = false;
        commandMode = false;
        if (!new SettingsStore(this).voiceEnabled()) return;
        startRecognizer(false);
    }

    private void startRecognizer(boolean command) {
        if (recognizer == null || checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) return;
        commandMode = command;
        try { recognizer.cancel(); } catch(Exception ignored) {}
        Intent i = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
        i.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
        i.putExtra(RecognizerIntent.EXTRA_LANGUAGE, "nl-BE");
        i.putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true);
        i.putExtra(RecognizerIntent.EXTRA_PREFER_OFFLINE, true);
        i.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 3);
        try { recognizer.startListening(i); } catch(Exception e) { h.postDelayed(this::resumeWake, 1200); }
    }

    private final RecognitionListener listener = new RecognitionListener() {
        public void onReadyForSpeech(Bundle p) {}
        public void onBeginningOfSpeech() {}
        public void onRmsChanged(float rms) {}
        public void onBufferReceived(byte[] b) {}
        public void onEndOfSpeech() {}
        public void onEvent(int e, Bundle b) {}
        public void onPartialResults(Bundle b) {
            if (!commandMode && !transitioning) {
                String s = first(b);
                if (isWake(s)) wake();
            }
        }
        public void onResults(Bundle b) {
            String s = first(b);
            if (commandMode) {
                if (s.isEmpty()) speak("Ik heb de opdracht niet verstaan.", "result");
                else execute(s);
            } else if (isWake(s)) wake();
            else h.postDelayed(VoiceService.this::resumeWake, 350);
        }
        public void onError(int error) {
            if (commandMode && error == SpeechRecognizer.ERROR_NO_MATCH) speak("Ik heb de opdracht niet verstaan.", "result");
            else h.postDelayed(VoiceService.this::resumeWake, error == SpeechRecognizer.ERROR_RECOGNIZER_BUSY ? 1200 : 500);
        }
    };

    private String first(Bundle b) {
        if (b == null) return "";
        ArrayList<String> a = b.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
        return a == null || a.isEmpty() ? "" : a.get(0);
    }

    private boolean isWake(String s) {
        String n = IntentParser.normalize(s);
        return n.contains("hey luxwash") || n.contains("he luxwash") || n.equals("luxwash") || n.contains("lux wash");
    }

    private void wake() {
        if (transitioning) return;
        transitioning = true;
        try { recognizer.cancel(); } catch(Exception ignored) {}
        speak("Ja?", "wake_ack");
    }

    private void execute(String cmd) {
        try { recognizer.cancel(); } catch(Exception ignored) {}
        if (IntentParser.normalize(cmd).contains("stop luisteren")) {
            speak("LuxWash Voice stopt met luisteren.", "result");
            new SettingsStore(this).setVoiceEnabled(false);
            h.postDelayed(this::stopSelf, 1600);
            return;
        }
        CommandRouter.execute(this, cmd, r -> h.post(() -> speak(r, "result")));
    }

    private void speak(String text, String id) {
        if (!ttsReady) { h.postDelayed(this::resumeWake, 700); return; }
        tts.speak(text, TextToSpeech.QUEUE_FLUSH, null, id);
    }

    private void createChannel() {
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationChannel c = new NotificationChannel(CHANNEL, "LuxWash Voice", NotificationManager.IMPORTANCE_LOW);
            c.setDescription("Actieve stemassistent");
            getSystemService(NotificationManager.class).createNotificationChannel(c);
        }
    }

    private Notification notification(String text) {
        Intent open = new Intent(this, MainActivity.class);
        PendingIntent pi = PendingIntent.getActivity(this, 0, open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        Notification.Builder b = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(this, CHANNEL) : new Notification.Builder(this);
        return b.setContentTitle("LuxWash Voice").setContentText(text).setSmallIcon(android.R.drawable.ic_btn_speak_now)
                .setOngoing(true).setContentIntent(pi).build();
    }

    @Override public void onDestroy() {
        if (recognizer != null) recognizer.destroy();
        if (tts != null) tts.shutdown();
        super.onDestroy();
    }

    @Override public IBinder onBind(Intent i) { return null; }
}
