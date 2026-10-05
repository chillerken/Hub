# LuxWash Fleet & Reinigingsscan

Production funnel cloned from the LuxAI Business Scan concept and adapted for LuxWash B2B acquisition.

## Public surface
- https://luxwash-fleet-scan.onrender.com
- Render service: luxwash-fleet-scan
- Branch: luxwash-fleet-scan
- Static UI: luxwash-fleet-scan/index.html

## Backend components
Supabase Edge Functions:
- luxwash-fleet-scan-invite
- luxwash-fleet-scan-intake
- luxwash-fleet-scan-result
- luxwash-fleet-scan-interest

Tables:
- public.luxwash_fleet_scan_invites
- public.luxwash_fleet_scans

Existing CRM tables used:
- public.leads
- public.sales_message_drafts
- public.notifications

## Flow
1. A LUXSCOUT lead with a usable email address gets one unique scan URL.
2. New, unsent LUXSCOUT leads get a draft-only invitation; nothing is auto-sent.
3. Opening an invite advances the journey to b2b_scan_opened.
4. Submitting enriches the same CRM lead, assigns lead_agent, stores the scan, and creates one follow-up draft.
5. Repeated submits for a completed invite return the existing scan.
6. Requesting a quote advances the CRM to proposal_requested / b2b_scan_interested.
7. Requesting contact advances the CRM to contact_planned / b2b_scan_interested.

## Safety and deduplication
- Invite token is the primary link to the existing LUXSCOUT record.
- Opted-out leads do not receive invitation drafts.
- Later journey stages are not rolled back.
- Public scan tables are server-side only.
- Outreach remains draft-only and human-controlled.
