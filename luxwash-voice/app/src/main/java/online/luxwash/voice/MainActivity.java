package online.luxwash.voice;

import android.Manifest;
import android.app.*;
import android.content.*;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.os.*;
import android.provider.Settings;
import android.speech.tts.TextToSpeech;
import android.text.InputType;
import android.widget.*;
import java.util.*;

public final class MainActivity extends Activity {
    private TextView status, live, diagnostic, result;
    private EditText host, port, user, pass, from, webhook, daily, command;
    private TextToSpeech tts;
    private BroadcastReceiver receiver;

    @Override protected void onCreate(Bundle b) {
        super.onCreate(b);
        tts = new TextToSpeech(this, s -> {
            if (s == TextToSpeech.SUCCESS) {
                int r = tts.setLanguage(new Locale("nl", "BE"));
                if (r == TextToSpeech.LANG_MISSING_DATA || r == TextToSpeech.LANG_NOT_SUPPORTED) tts.setLanguage(new Locale("nl", "NL"));
                tts.setSpeechRate(.96f);
            }
        });
        buildUi();
        askPermissions();
        Scheduler.scheduleDaily(this);
        setupReceiver();
        refresh();
    }

    private void buildUi() {
        ScrollView sc = new ScrollView(this);
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setPadding(36,42,36,60);
        root.setBackgroundColor(Color.rgb(245,245,245));
        sc.addView(root);

        TextView title = new TextView(this);
        title.setText("LUXWASH VOICE 1.3");
        title.setTextSize(28);
        title.setTextColor(Color.rgb(35,35,35));
        title.setTypeface(null,1);
        root.addView(title);

        TextView sub = new TextView(this);
        sub.setText("Prospect Recovery Edition\nSamsung-fix • 504 fallback • multi-server bedrijfszoeker");
        sub.setTextSize(16);
        sub.setPadding(0,8,0,20);
        root.addView(sub);

        status = new TextView(this);
        status.setTextSize(18);
        status.setPadding(20,18,20,8);
        root.addView(status);

        live = new TextView(this);
        live.setText("Ik hoor: —");
        live.setTextSize(20);
        live.setPadding(20,10,20,10);
        live.setBackgroundColor(Color.WHITE);
        root.addView(live);

        diagnostic = new TextView(this);
        diagnostic.setText("Diagnose: nog geen luisterdata");
        diagnostic.setTextSize(14);
        diagnostic.setPadding(20,10,20,18);
        root.addView(diagnostic);

        Button test = button("🎤 Test microfoon – luister naar 1 opdracht");
        root.addView(test);
        test.setOnClickListener(v -> testMicrophone());

        Button start = button("🟢 Start Hey LuxWash");
        root.addView(start);
        start.setOnClickListener(v -> startVoice());

        Button stop = button("⛔ Stop luisteren");
        root.addView(stop);
        stop.setOnClickListener(v -> stopVoice());

        Button battery = button("🔋 Open batterij-instellingen");
        root.addView(battery);
        battery.setOnClickListener(v -> openBatterySettings());

        addHeading(root,"Directe opdracht");
        command = new EditText(this);
        command.setHint("bv. zoek nieuwe bedrijven");
        root.addView(command);
        Button run = button("Voer uit + spreek antwoord");
        root.addView(run);
        result = new TextView(this);
        result.setPadding(0,14,0,18);
        result.setTextSize(16);
        root.addView(result);
        run.setOnClickListener(v -> runCommand());

        addHeading(root,"E-mailverbinding");
        host = field(root,"SMTP-host","smtp.gmail.com",false);
        port = field(root,"SMTP-poort","465",false);
        user = field(root,"Gmail/SMTP-gebruiker","",false);
        pass = field(root,"App-wachtwoord (veilig versleuteld opgeslagen)","",true);
        from = field(root,"Van-adres / geverifieerde alias","info@luxwash.online",false);

        addHeading(root,"Automatiseringen");
        webhook = field(root,"Webhook URL voor extra acties","",false);
        daily = field(root,"Dagelijkse gesproken briefing (HH:mm)","19:00",false);
        Button save = button("Instellingen opslaan");
        root.addView(save);
        save.setOnClickListener(v -> saveSettings());

        TextView note = new TextView(this);
        note.setText("\nTestvolgorde: 1) geef microfoontoegang, 2) druk Test microfoon, 3) zeg ‘zoek nieuwe bedrijven’. Als de tekst onder ‘Ik hoor’ verschijnt, werkt de spraakmotor. Start daarna Hey LuxWash. Versie 1.3 gebruikt systeemspraakherkenning en schakelt automatisch tussen meerdere bedrijfszoekservers bij time-outs.");
        note.setTextSize(13);
        note.setTextColor(Color.DKGRAY);
        root.addView(note);

        setContentView(sc);
        loadSettings();
    }

    private void setupReceiver() {
        receiver = new BroadcastReceiver() {
            @Override public void onReceive(Context context, Intent intent) {
                if (!VoiceService.ACTION_STATE.equals(intent.getAction())) return;
                String st = intent.getStringExtra(VoiceService.EXTRA_STATE);
                String tr = intent.getStringExtra(VoiceService.EXTRA_TRANSCRIPT);
                String er = intent.getStringExtra(VoiceService.EXTRA_ERROR);
                if (st != null && !st.isEmpty()) status.setText(icon(st) + " " + st);
                if (tr != null && !tr.isEmpty()) live.setText("Ik hoor: " + tr);
                if (er != null && !er.isEmpty()) diagnostic.setText("Diagnose: " + er);
            }
        };
    }

    private String icon(String s) {
        if (s.startsWith("FOUT")) return "🔴";
        if (s.equals("OPDRACHT") || s.equals("WAKE") || s.equals("HOORT")) return "🟢";
        if (s.equals("UITVOEREN") || s.equals("VERWERKT")) return "🔵";
        if (s.equals("GEACTIVEERD") || s.equals("HERKEND")) return "🟡";
        return "⚪";
    }

    @Override protected void onStart() {
        super.onStart();
        IntentFilter f = new IntentFilter(VoiceService.ACTION_STATE);
        if (Build.VERSION.SDK_INT >= 33) registerReceiver(receiver, f, Context.RECEIVER_NOT_EXPORTED);
        else registerReceiver(receiver, f);
    }

    @Override protected void onStop() {
        try { unregisterReceiver(receiver); } catch(Exception ignored) {}
        super.onStop();
    }

    private Button button(String text) {
        Button b = new Button(this);
        b.setText(text);
        b.setAllCaps(false);
        return b;
    }

    private void addHeading(LinearLayout root,String text) {
        TextView t = new TextView(this);
        t.setText(text);
        t.setTextSize(20);
        t.setTypeface(null,1);
        t.setPadding(0,28,0,6);
        root.addView(t);
    }

    private EditText field(LinearLayout root,String hint,String def,boolean password) {
        TextView l = new TextView(this);
        l.setText(hint);
        l.setPadding(0,8,0,2);
        root.addView(l);
        EditText e = new EditText(this);
        e.setSingleLine(true);
        e.setText(def);
        if(password) e.setInputType(InputType.TYPE_CLASS_TEXT|InputType.TYPE_TEXT_VARIATION_PASSWORD);
        root.addView(e);
        return e;
    }

    private void loadSettings() {
        SettingsStore s = new SettingsStore(this);
        host.setText(s.smtpHost());
        port.setText(String.valueOf(s.smtpPort()));
        user.setText(s.smtpUser());
        from.setText(s.smtpFrom());
        webhook.setText(s.webhookUrl());
        daily.setText(s.dailyTime());
    }

    private void saveSettings() {
        new SettingsStore(this).save(host.getText().toString(),port.getText().toString(),user.getText().toString(),
                pass.getText().toString(),from.getText().toString(),webhook.getText().toString(),daily.getText().toString());
        pass.setText("");
        Scheduler.scheduleDaily(this);
        toast("Instellingen opgeslagen");
        refresh();
    }

    private boolean ensureMic() {
        if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            askPermissions();
            toast("Geef eerst microfoontoegang.");
            return false;
        }
        return true;
    }

    private void testMicrophone() {
        if (!ensureMic()) return;
        new SettingsStore(this).setVoiceEnabled(true);
        live.setText("Ik hoor: —");
        diagnostic.setText("Diagnose: microfoontest gestart");
        Intent i = new Intent(this, VoiceService.class);
        i.setAction(VoiceService.ACTION_LISTEN_NOW);
        if (Build.VERSION.SDK_INT >= 26) startForegroundService(i); else startService(i);
    }

    private void startVoice() {
        if (!ensureMic()) return;
        new SettingsStore(this).setVoiceEnabled(true);
        Intent i = new Intent(this,VoiceService.class);
        if(Build.VERSION.SDK_INT>=26) startForegroundService(i); else startService(i);
        refresh();
        toast("Hey LuxWash wordt gestart.");
    }

    private void stopVoice() {
        new SettingsStore(this).setVoiceEnabled(false);
        stopService(new Intent(this, VoiceService.class));
        refresh();
        status.setText("⚪ GESTOPT");
    }

    private void openBatterySettings() {
        try {
            Intent i = new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS);
            startActivity(i);
        } catch(Exception e) {
            startActivity(new Intent(Settings.ACTION_SETTINGS));
        }
    }

    private void runCommand() {
        String q = command.getText().toString().trim();
        if(q.isEmpty()) return;
        result.setText("Bezig…");
        CommandRouter.execute(this,q,r -> runOnUiThread(() -> {
            result.setText(r);
            if(tts != null) tts.speak(r,TextToSpeech.QUEUE_FLUSH,null,"manual");
            refresh();
        }));
    }

    private void refresh() {
        SettingsStore s = new SettingsStore(this);
        status.setText(s.voiceEnabled() ? "🟢 LuxWash Voice staat aan." : "⚪ Luisterservice is gestopt.");
    }

    private void askPermissions() {
        ArrayList<String> p = new ArrayList<>();
        if(checkSelfPermission(Manifest.permission.RECORD_AUDIO)!=PackageManager.PERMISSION_GRANTED) p.add(Manifest.permission.RECORD_AUDIO);
        if(checkSelfPermission(Manifest.permission.READ_CALENDAR)!=PackageManager.PERMISSION_GRANTED) p.add(Manifest.permission.READ_CALENDAR);
        if(checkSelfPermission(Manifest.permission.WRITE_CALENDAR)!=PackageManager.PERMISSION_GRANTED) p.add(Manifest.permission.WRITE_CALENDAR);
        if(Build.VERSION.SDK_INT>=33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)!=PackageManager.PERMISSION_GRANTED) p.add(Manifest.permission.POST_NOTIFICATIONS);
        if(!p.isEmpty()) requestPermissions(p.toArray(new String[0]),100);
    }

    private void toast(String s) { Toast.makeText(this,s,Toast.LENGTH_SHORT).show(); }

    @Override protected void onResume() {
        super.onResume();
        if(status!=null) refresh();
    }

    @Override protected void onDestroy() {
        if(tts!=null) tts.shutdown();
        super.onDestroy();
    }
}
