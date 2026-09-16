const replacements = [
  ['+ 0,5% Tafel&Go-fee alleen op online QR-betalingen. Stripe-verwerkingskosten apart.', 'Geen Tafel&Go-transactiecommissie. Alleen de gewone Stripe-verwerkingskosten zijn voor het restaurant.'],
  ['Tafel&Go rekent 0,5% op online QR-betalingen; Stripe-verwerkingskosten zijn apart.', 'Tafel&Go rekent geen transactiekost op online QR-betalingen. Alleen de gewone Stripe-verwerkingskosten zijn voor het restaurant.']
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

patchPricingCopy();
new MutationObserver(patchPricingCopy).observe(document.getElementById('root'), { childList: true, subtree: true });
