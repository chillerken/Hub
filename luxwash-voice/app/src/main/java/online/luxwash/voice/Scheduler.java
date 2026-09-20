package online.luxwash.voice;

import android.app.*;
import android.content.*;
import java.util.*;

public final class Scheduler {
    private Scheduler() {}
    public static void scheduleDaily(Context ctx) {
        String[] hm = new SettingsStore(ctx).dailyTime().split(":");
        int hour=19, minute=0;
        try { hour=Integer.parseInt(hm[0]); minute=Integer.parseInt(hm[1]); } catch(Exception ignored) {}
        Calendar c=Calendar.getInstance();
        c.set(Calendar.HOUR_OF_DAY,hour); c.set(Calendar.MINUTE,minute); c.set(Calendar.SECOND,0); c.set(Calendar.MILLISECOND,0);
        if(c.getTimeInMillis()<=System.currentTimeMillis()) c.add(Calendar.DAY_OF_YEAR,1);
        AlarmManager am=(AlarmManager)ctx.getSystemService(Context.ALARM_SERVICE);
        Intent i=new Intent(ctx,DailyBriefReceiver.class);
        PendingIntent pi=PendingIntent.getBroadcast(ctx,4110,i,PendingIntent.FLAG_IMMUTABLE|PendingIntent.FLAG_UPDATE_CURRENT);
        am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP,c.getTimeInMillis(),pi);
    }
}
