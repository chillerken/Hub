package online.luxwash.voice;

import android.Manifest;
import android.content.Context;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.provider.CalendarContract;
import java.text.DateFormat;
import java.util.*;

public final class CalendarHelper {
    private CalendarHelper() {}

    public static String summary(Context ctx, String phrase) {
        if (ctx.checkSelfPermission(Manifest.permission.READ_CALENDAR) != PackageManager.PERMISSION_GRANTED)
            return "Geef LuxWash Voice eerst toegang tot uw agenda.";
        Calendar start=Calendar.getInstance(), end=Calendar.getInstance();
        String p=IntentParser.normalize(phrase);
        if(p.contains("morgen")){
            start.add(Calendar.DAY_OF_YEAR,1); setStart(start);
            end.setTimeInMillis(start.getTimeInMillis()); end.add(Calendar.DAY_OF_YEAR,1);
        } else {
            setStart(start); end.setTimeInMillis(start.getTimeInMillis()); end.add(Calendar.DAY_OF_YEAR,1);
        }
        StringBuilder s=new StringBuilder(p.contains("morgen")?"Morgen ":"Vandaag ");
        int count=0;
        try(Cursor c=CalendarContract.Instances.query(ctx.getContentResolver(), new String[]{
                CalendarContract.Instances.TITLE, CalendarContract.Instances.BEGIN},
                start.getTimeInMillis(), end.getTimeInMillis())) {
            while(c!=null && c.moveToNext() && count<5){
                if(count==0) s.append("staat er: ");
                if(count>0) s.append("; ");
                String title=c.getString(0); long begin=c.getLong(1);
                s.append(title==null?"afspraak":title).append(" om ").append(DateFormat.getTimeInstance(DateFormat.SHORT).format(new Date(begin)));
                count++;
            }
        } catch(Exception e){ return "Ik kon de agenda niet lezen: "+e.getMessage(); }
        if(count==0) return s.append("zijn er geen afspraken gevonden.").toString();
        return s.append(".").toString();
    }

    private static void setStart(Calendar c){ c.set(Calendar.HOUR_OF_DAY,0); c.set(Calendar.MINUTE,0); c.set(Calendar.SECOND,0); c.set(Calendar.MILLISECOND,0); }
}
