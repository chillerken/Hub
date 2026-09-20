package online.luxwash.voice;

import android.content.Context;
import org.json.JSONObject;
import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;

public final class WebhookClient {
    private WebhookClient() {}
    public static String run(Context ctx,String command)throws Exception{
        String u=new SettingsStore(ctx).webhookUrl();
        if(u.isEmpty()) return "Er is nog geen automatiserings-webhook ingesteld.";
        HttpURLConnection c=(HttpURLConnection)new URL(u).openConnection();
        c.setConnectTimeout(10000); c.setReadTimeout(20000); c.setRequestMethod("POST"); c.setDoOutput(true);
        c.setRequestProperty("Content-Type","application/json; charset=UTF-8");
        byte[] data=new JSONObject().put("command",command).put("source","luxwash-voice").put("timestamp",System.currentTimeMillis()).toString().getBytes(StandardCharsets.UTF_8);
        try(OutputStream os=c.getOutputStream()){os.write(data);}
        int code=c.getResponseCode();
        if(code<200||code>=300) throw new IOException("Webhook HTTP "+code);
        return "De automatisering is gestart.";
    }
}
