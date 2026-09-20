package online.luxwash.voice;

import android.content.Context;
import android.util.Base64;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import javax.net.ssl.*;

public final class SmtpClient {
    private SmtpClient() {}

    public static int sendBatch(Context ctx, List<Prospect> prospects, int max) throws Exception {
        SettingsStore s = new SettingsStore(ctx);
        if (!s.smtpReady()) throw new IllegalStateException("SMTP is nog niet ingesteld. Vul Gmail-gebruikersnaam en een app-wachtwoord in bij Instellingen.");
        DbHelper db = new DbHelper(ctx);
        int sent=0;
        for (Prospect p: prospects) {
            if (sent>=max) break;
            if (p.email.isEmpty()) continue;
            try {
                sendOne(s, p.email, subject(p), body(p));
                db.markContacted(p, "sent");
                db.log("email", "Verzonden naar " + p.name + " <" + p.email + ">", true);
                sent++;
            } catch(Exception e) {
                db.log("email", "Fout voor " + p.name + ": " + e.getMessage(), false);
            }
        }
        return sent;
    }

    private static String subject(Prospect p) { return "Mobiele Fleet Care op locatie voor " + p.name; }

    private static String body(Prospect p) {
        return "Beste,\n\n" +
                "Ik ben Gert-Jan van LuxWash. Wij verzorgen mobiele voertuigverzorging op locatie in Aalst, Lede, Erpe-Mere en omgeving. " +
                "Voor bedrijven met meerdere voertuigen kan LuxWash Fleet Care periodiek onderhoud op locatie uitvoeren, zodat voertuigen verzorgd blijven zonder onnodige verplaatsing of stilstand.\n\n" +
                "Is dit iets dat voor " + p.name + " interessant kan zijn? Ik licht graag kort toe wat praktisch mogelijk is.\n\n" +
                "Met vriendelijke groet,\nGert-Jan\nLuxWash\nhttps://www.luxwash.online";
    }

    private static void sendOne(SettingsStore s, String to, String subject, String body) throws Exception {
        SSLSocketFactory f=(SSLSocketFactory)SSLSocketFactory.getDefault();
        try(SSLSocket socket=(SSLSocket)f.createSocket(s.smtpHost(), s.smtpPort());
            BufferedReader in=new BufferedReader(new InputStreamReader(socket.getInputStream(), StandardCharsets.UTF_8));
            BufferedWriter out=new BufferedWriter(new OutputStreamWriter(socket.getOutputStream(), StandardCharsets.UTF_8))) {
            socket.setSoTimeout(15000);
            expect(in,220);
            cmd(out,in,"EHLO luxwash.local",250);
            cmd(out,in,"AUTH LOGIN",334);
            cmd(out,in,b64(s.smtpUser()),334);
            cmd(out,in,b64(s.smtpPassword()),235);
            cmd(out,in,"MAIL FROM:<"+cleanAddr(s.smtpFrom())+">",250);
            cmd(out,in,"RCPT TO:<"+cleanAddr(to)+">",250);
            cmd(out,in,"DATA",354);

            String subj="=?UTF-8?B?"+b64(subject)+"?=";
            write(out,"From: LuxWash <"+cleanAddr(s.smtpFrom())+">");
            write(out,"To: <"+cleanAddr(to)+">");
            write(out,"Subject: "+subj);
            write(out,"MIME-Version: 1.0");
            write(out,"Content-Type: text/plain; charset=UTF-8");
            write(out,"Content-Transfer-Encoding: 8bit");
            write(out("");
            for(String line:body.replace("\r","").split("\n",-1)) write(out,line.startsWith(".")?"."+line:line);
            write(out,".");
            out.flush();
            expect(in,250);
            cmd(out,in,"QUIT",221);
        }
    }

    private static void write(BufferedWriter out,String s)throws IOException{ out.write(s); out.write("\r\n"); }
    private static void cmd(BufferedWriter out,BufferedReader in,String s,int code)throws Exception{ write(out,s); out.flush(); expect(in,code); }
    private static String b64(String s){ return Base64.encodeToString(s.getBytes(StandardCharsets.UTF_8), Base64.NO_WRAP); }
    private static String cleanAddr(String s){ return s.replace("\r","").replace("\n","").replace("<","").replace(">","").trim(); }

    private static void expect(BufferedReader in,int expected)throws Exception{
        String line=in.readLine(); if(line==null) throw new IOException("Geen SMTP-antwoord");
        String code=line.length()>=3?line.substring(0,3):"";
        if(line.length()>3 && line.charAt(3)=='-'){
            String end=code+" ";
            String next;
            do { next=in.readLine(); if(next==null) break; line=next; } while(!next.startsWith(end));
        }
        int got; try{got=Integer.parseInt(code);}catch(Exception e){throw new IOException("Ongeldig SMTP-antwoord: "+line);}
        if(got!=expected) throw new IOException("SMTP "+got+": "+line);
    }
}
