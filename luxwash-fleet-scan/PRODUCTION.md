# LuxWash Fleet & Reinigingsscan — production manifest

Status: LIVE
Date: 2026-10-05

## Public frontend
- Render service: luxwash-fleet-scan
- URL: https://luxwash-fleet-scan.onrender.com
- Git branch: luxwash-fleet-scan
- Frontend: luxwash-fleet-scan/index.html

## Supabase production
Project: nahwlhptgdkwhjcfkhkt

Edge Functions:
- luxwash-fleet-scan-intake — v3
- luxwash-fleet-scan-invite — live, invite prefill + opened journey
- luxwash-fleet-scan-result — live
- luxwash-fleet-scan-interest — v3

Tables:
- luxwash_fleet_scan_invites
- luxwash_fleet_scans
- leads
- sales_message_drafts
- notifications

## Flow
LUXSCOUT lead
→ unique fleet scan invite
→ CRM journey b2b_scan_invited
→ page open b2b_scan_opened
→ scan submit enriches the same lead
→ journey b2b_scan_completed
→ Lead Agent follow-up draft
→ request quote/contact
→ b2b_scan_interested

## Safety / dedupe
- No automatic email sending.
- Invite and follow-up messages are drafts only.
- Opted-out leads are excluded.
- Leads without public email do not receive an invite.
- Completed invite resubmits return the existing scan instead of creating duplicates.
- Invite-aware rate limiting.
- Existing customer/won/completed state is preserved where applicable.

## Verified E2E
A fresh isolated LUXSCOUT lead was processed through invite → intake → CRM enrichment → Lead Agent → proposal request.
Observed:
- HTTP 201 on initial scan submit
- linked_existing_lead=true
- linked_luxscout=true
- one scan only
- HTTP 200 already_completed=true on replay
- proposal request moved CRM to proposal_requested / b2b_scan_interested
- QA records removed after verification
