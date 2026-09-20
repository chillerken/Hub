package online.luxwash.voice;

import android.Manifest;
import android.app.*;
import android.content.*;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.os.*;
import android.speech.tts.TextToSpeech;
import android.text.InputType;
import android.view.View;
import android.widget.*;
import java.util.*;

public final class MainActivity extends Activity {
    private TextView status, result;
    private EditText host, port, user, pass, from, webhook, daily, command;
    private TextToSpeech tts;

    @Override protected void onCreate(Bundle b) {
        super.onCreate(b);
        tts=new TextToSpeech(this,s->{ if(s==TextToSpeech.SUCCESS){tts.setLanguage(new Locale("nl","BE"));tts.setSpeechRate(.96f);} });
        buildUi();
        askPermissions();
        Scheduler.scheduleDaily(this);
        refresh();
    }

    private void buildUi() {
        ScrollView sc=new ScrollView(this);
        LinearLayout root=new LinearLayout(this); root.setOrientation(LinearLayout.VERTICAL); root.setPadding(36,42,36,60);
        root.setBackgroundColor(Color.rgb(245,245,245)); sc.addView(root);

        TextView title=new TextView(this); title.setText("LUXWASH VOICE"); title.setTextSize(28); title.setTextColor(Color.rgb(35,35,35)); title.setTypeface(null,1); root.addView(title);
        TextView sub=new TextView(this); sub.setText("Zelfstandige stemassistent • geen Gemini of ChatGPT nodig\nZeg: “Hey LuxWash” zodra de luisterservice actief is."); sub.setTextSize(16); sub.setPadding(0,8,0,22); root.addView(sub);

        status=new TextView(this); status.setTextSize(17); status.setPadding(20,18,20,18); root.addView(status);

        Button start=button("Start Hey LuxWash"); root.addView(start);
        start.setOnClickListener(v->startVoice());
        Button stop=button("Stop luisteren"); root.addView(stop);
        stop.setOnClickListener(v->stopVoice());

        addHeading(root,"Directe opdracht");
        command=new EditText(this); command.setHint("bv. zoek nieuwe bedrijven"); root.addView(command);
        Button run=button("Voer uit + spreek antwoord"); root.addView(run);
        result=new TextView(this); result.setPadding(0,14,0,18); result.setTextSize(16); root.addView(result);
        run.setOnClickListener(v->runCommand());

        addHeading(root,"E-mailverbinding");
        host=field(root,"SMTP-host","smtp.gmail.com",false);
        port=field(root,"SMTP-poort","465",false);
        user=field(root,"Gmail/SMTP-gebruiker","",false);
        pass=field(root,"App-wachtwoord (veilig versleuteld opgeslagen)","",true);
        from=field(root,"Van-adres / geverifieerde alias","info@luxwash.online",false);

        addHeading(root,"Automatiseringen");
        webhook=field(root,"Webhook URL voor extra acties","",false);
        daily=field(root,"Dagelijkse gesproken briefing (HH:mm)","19:00",false);
        Button save=button("Instellingen opslaan"); root.addView(save);
        save.setOnClickListener(v->saveSettings());

        TextView note=new TextView(this);
        note.setText("\nBelangrijk: voor Gmail gebruikt deze app een apart app-wachtwoord, niet uw gewone Google-wachtwoord. De spraakherkenning gebruikt Android SpeechRecognizer met voorkeur voor offline herkenning. Voor een betrouwbare wake-service moet de app na een herstart één keer geopend worden.");
        note.setTextSize(13); note.setTextColor(Color.DKGRAY); root.addView(note);

        setContentView(sc);
        loadSettings();
    }

    private Button button(String text){ Button b=new Button(this); b.setText(text); b.setAllCaps(false); return b; }
    private void addHeading(LinearLayout root,String text){ TextView t=new TextView(this);t.setText(text);t.setTextSize(20);t.setTypeface(null,1);t.setPadding(0,28,0,6);root.addView(t); }
    private EditText field(LinearLayout root,String hint,String def,boolean password){
        TextView l=new TextView(this);l.setText(hint);l.setPadding(0,8,0,2);root.addView(l);
        EditText e=new EditText(this);e.setSingleLine(true);e.setText(def);
        if(password)e.setInputType(InputType.TYPE_CLASS_TEXT|InputType.TYPE_TEXT_VARIATION_PASSWORD);
        root.addView(e);return e;
    }

    private void loadSettings(){
        SettingsStore s=new SettingsStore(this);
        host.setText(s.smtpHost());port.setText(String.valueOf(s.smtpPort()));user.setText(s.smtpUser());from.setText(s.smtpFrom());
        webhook.setText(s.webhookUrl());daily.setText(s.dailyTime());
    }

    private void saveSettings(){
        new SettingsStore(this).save(host.getText().toString(),port.getText().toString(),user.getText().toString(),
                pass.getText().toString(),from.getText().toString(),webhook.getText().toString(),daily.getText().toString());
        pass.setText(""); Scheduler.scheduleDaily(this); toast("Instellingen opgeslagen"); refresh();
    }

    private void startVoice(){
        if(checkSelfPermission(Manifest.permission.RECORD_AUDIO)!=PackageManager.PERMISSION_GRANTED){askPermissions();toast("Microfoontoegang is nodig.");return;}
        new SettingsStore(this).setVoiceEnabled(true);
        Intent i=new Intent(this,VoiceService.class);
        if(Build.VERSION.SDK_INT>=26)startForegroundService(i);else startService(i);
        refresh();toast("Hey LuxWash luistert.");
    }

    private void stopVoice(){
        new SettingsStore(this).setVoiceEnabled(false);
        Intent i=new Intent(this,VoiceService.class);i.setAction(VoiceService.ACTION_STOP);startService(i);
        refresh();
    }

    private void runCommand(){
        String q=command.getText().toString().trim(); if(q.isEmpty())return;
        result.setText("Bezig…");
        CommandRouter.execute(this,q,r->runOnUiThread(()->{result.setText(r); if(tts!=null)tts.speak(r,TextToSpeech.QUEUE_FLUSH,null,"manual");refresh();}));
    }

    private void refresh(){
        SettingsStore s=new SettingsStore(this);
        status.setText(s.voiceEnabled() ? "● Hey LuxWash is actief en luistert." : "○ Luisterservice is gestopt.");
    }

    private void askPermissions(){
        ArrayList<String> p=new ArrayList<>();
        if(checkSelfPermission(Manifest.permission.RECORD_AUDIO)!=PackageManager.PERMISSION_GRANTED)p.add(Manifest.permission.RECORD_AUDIO);
        if(checkSelfPermission(Manifest.permission.READ_CALENDAR)!=PackageManager.PERMISSION_GRANTED)p.add(Manifest.permission.READ_CALENDAR);
        if(checkSelfPermission(Manifest.permission.WRITE_CALENDAR)!=PackageManager.PERMISSION_GRANTED)p.add(Manifest.permission.WRITE_CALENDAR);
        if(Build.VERSION.SDK_INT>=33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)!=PackageManager.PERMISSION_GRANTED)p.add(Manifest.permission.POST_NOTIFICATIONS);
        if(!p.isEmpty())requestPermissions(p.toArray(new String[0]),100);
    }

    private void toast(String s){Toast.makeText(this,s,Toast.LENGTH_SHORT).show();}
    @Override protected void onResume(){super.onResume();if(status!=null)refresh();}
    @Override protected void onDestroy(){if(tts!=null)tts.shutdown();super.onDestroy();}
}
