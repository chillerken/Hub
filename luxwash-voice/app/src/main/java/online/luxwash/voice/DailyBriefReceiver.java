package online.luxwash.voice;

import android.content.*;
import android.os.Build;

public final class DailyBriefReceiver extends BroadcastReceiver {
    @Override public void onReceive(Context context, Intent intent) {
        Scheduler.scheduleDaily(context);
        Intent s=new Intent(context,BriefingService.class);
        if(Build.VERSION.SDK_INT>=26) context.startForegroundService(s); else context.startService(s);
    }
}
