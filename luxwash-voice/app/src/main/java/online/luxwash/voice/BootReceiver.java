package online.luxwash.voice;

import android.content.*;

public final class BootReceiver extends BroadcastReceiver {
    @Override public void onReceive(Context context, Intent intent) {
        Scheduler.scheduleDaily(context);
    }
}
