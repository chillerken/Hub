package online.luxwash.voice;

import android.app.*;
import android.content.*;
import android.os.*;
import android.speech.tts.*;
import java.util.*;

public final class BriefingService extends Service {
    private static final String CHANNEL="luxwash_brief";
    private TextToSpeech tts;

    @Override public int onStartCommand(Intent intent,int flags,int startId){
        createChannel();
        startForeground(4201,notification("Dagelijkse briefing wordt voorgelezen"));
        String text=new DbHelper(this).briefingText();
        tts=new TextToSpeech(this,status->{
            if(status==TextToSpeech.SUCCESS){
                tts.setLanguage(new Locale("nl","BE")); tts.setSpeechRate(0.96f);
                tts.setOnUtteranceProgressListener(new UtteranceProgressListener(){
                    public void onStart(String id){}
                    public void onDone(String id){stopSelf();}
                    public void onError(String id){stopSelf();}
                });
                tts.speak(text,TextToSpeech.QUEUE_FLUSH,null,"daily");
            } else stopSelf();
        });
        return START_NOT_STICKY;
    }

    private void createChannel(){
        if(Build.VERSION.SDK_INT>=26){
            NotificationChannel c=new NotificationChannel(CHANNEL,"LuxWash Briefing",NotificationManager.IMPORTANCE_LOW);
            getSystemService(NotificationManager.class).createNotificationChannel(c);
        }
    }

    private Notification notification(String text){
        Notification.Builder b=Build.VERSION.SDK_INT>=26?new Notification.Builder(this,CHANNEL):new Notification.Builder(this);
        return b.setContentTitle("LuxWash Voice").setContentText(text).setSmallIcon(android.R.drawable.ic_lock_silent_mode_off).build();
    }

    @Override public void onDestroy(){ if(tts!=null)tts.shutdown(); super.onDestroy(); }
    @Override public IBinder onBind(Intent i){return null;}
}
