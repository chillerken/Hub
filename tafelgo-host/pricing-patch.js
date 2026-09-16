import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SB='https://nahwlhptgdkwhjcfkhkt.supabase.co';
const KEY='sb_publishable_x_9D7Hrrq5R5OYJfnxKsUg_buzI2PPR';
const API=SB+'/functions/v1/tafelgo-api';
const supabase=createClient(SB,KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});

const replacements = [
  ['+ 0,5% Tafel&Go-fee alleen op online QR-betalingen. Stripe-verwerkingskosten apart.', 'Geen Tafel&Go-transactiecommissie. Alleen de gewone Stripe-verwerkingskosten zijn voor het restaurant.'],
  ['Tafel&Go rekent 0,5% op online QR-betalingen; Stripe-verwerkingskosten zijn apart.', 'Tafel&Go rekent geen transactiekost op online QR-betalingen. Alleen de gewone Stripe-verwerkingskosten zijn voor het restaurant.'],
  ['Testmodus: er wordt nog geen echt abonnementsgeld geïnd.', 'Live betalingen actief. Na de proefperiode wordt €39 per maand automatisch via Stripe geïnd.']
];

function patchPricingCopy() {
  const root = document.getElementById('root');
  if (!root) return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  for (const node of nodes) {
    let value = node.nodeValue || '';
    for (const [from, to] of replacements) value = value.replaceAll(from, to);
    if (value !== node.nodeValue) node.nodeValue = value;
  }
}

async function openLiveSubscriptionCheckout(button) {
  const original = button.textContent;
  button.disabled = true;
  button.textContent = 'Stripe openen…';
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error('Je sessie is verlopen. Log opnieuw in.');

    const response = await fetch(API, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'authorization': 'Bearer ' + session.access_token
      },
      body: JSON.stringify({ action: 'bootstrap' })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Kon abonnementsgegevens niet laden.');
    if (!data?.has_restaurant || !data?.restaurant?.id) throw new Error('Restaurant niet gevonden.');
    if (!data?.stripe?.url) throw new Error('Live Stripe-checkout is niet beschikbaar.');

    const checkout = new URL(data.stripe.url);
    checkout.searchParams.set('client_reference_id', data.restaurant.id);
    if (data?.user?.email) checkout.searchParams.set('prefilled_email', data.user.email);
    window.location.assign(checkout.toString());
  } catch (error) {
    button.disabled = false;
    button.textContent = original;
    const message = error instanceof Error ? error.message : 'Stripe kon niet worden geopend.';
    const toast = document.getElementById('toast');
    if (toast) {
      toast.textContent = message;
      toast.classList.remove('hidden');
      setTimeout(() => toast.classList.add('hidden'), 4000);
    } else {
      alert(message);
    }
  }
}

document.addEventListener('click', (event) => {
  const button = event.target instanceof Element ? event.target.closest('button') : null;
  if (!button) return;
  const text = (button.textContent || '').trim();
  if (text !== 'Start 7 dagen proefperiode' && text !== 'Open Stripe checkout') return;
  event.preventDefault();
  event.stopImmediatePropagation();
  openLiveSubscriptionCheckout(button);
}, true);

patchPricingCopy();
new MutationObserver(patchPricingCopy).observe(document.getElementById('root'), { childList: true, subtree: true });
