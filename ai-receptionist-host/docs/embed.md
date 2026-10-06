# Reception AI — website embed

Gebruik op elke klantwebsite dezelfde widget. Alleen de publieke `widget_token` verschilt per bedrijf.

## Standaard

```html
<script
  src="https://reception-ai-luxwash.vercel.app/widget.js"
  data-widget-token="PLAATS_HIER_DE_WIDGET_TOKEN"
  defer>
</script>
```

Plaats de code bij voorkeur vlak voor `</body>` of via de custom-code functie van het CMS.

## Opties

```html
<script
  src="https://reception-ai-luxwash.vercel.app/widget.js"
  data-widget-token="..."
  data-position="right"
  data-accent="#6d5dfc"
  data-label="Chat met onze AI-assistent"
  data-open="false"
  data-consent="true"
  data-privacy-url="https://voorbeeld.be/privacy"
  defer>
</script>
```

- `data-position`: `right` of `left`.
- `data-accent`: optionele hexkleur; anders wordt de kleur uit Reception AI gebruikt.
- `data-open`: opent de chat automatisch als deze op `true` staat.
- `data-consent`: toon/verberg de contacttoestemming.
- `data-privacy-url`: optionele link naar de privacyverklaring.
- `data-business-id` en `data-token` worden als backwards-compatible alias geaccepteerd, maar `data-widget-token` is de aanbevolen naam.

De widget gebruikt de publieke, multi-tenant Supabase Edge Functions `public-widget-config` en `public-reception-chat`. Er worden geen service-role keys of andere secrets in de klantwebsite geplaatst.

## CMS

**WordPress:** Custom HTML-blok of een site-wide header/footer/custom-code plugin; plaats de code in de footer.

**Wix:** Settings → Custom Code → Body end → All pages.

**Shopify:** plaats de code vlak voor `</body>` in `theme.liquid`.

**Gewone HTML:** plaats de code vlak voor `</body>`.

## JavaScript API

Na laden is optioneel beschikbaar:

```js
ReceptionAI.open();
ReceptionAI.close();
ReceptionAI.toggle();
ReceptionAI.reset();
```
