# Widgets

A widget is a ready-made form you put on your own website. It asks the pack's questions, runs the rules through the API and shows the result, with nothing for you to code. You build it in the dashboard under **Widgets**, copy one snippet and paste it into your page.

## Build and embed

1. In the dashboard, open **API keys** and create a **publishable key** (`pk_...`) for the packs the widget will use. List the sites it will run on, for example `https://www.example.com`.
2. Open **Widgets**. Choose a pack, pick which questions to show, set your wording, colours and the title. The preview on the right is the real widget, running on the same rules as the API, so you can fill it in and see exactly what visitors will get.
3. Choose your publishable key, copy the snippet and paste it into your page where the widget should appear:

```html
<script src="https://YOUR-SITE/widget/v1.js" async
  data-briesa-key="pk_live_..."
  data-briesa-api="https://YOUR-API"
  data-briesa-config="{&quot;pack&quot;:&quot;whs-incident-notification&quot;,&quot;scenario&quot;:&quot;classify_incident&quot;}"></script>
```

The widget draws itself where the tag is. To place it elsewhere, add `data-briesa-target="#some-element"`. You can put several widgets on one page, each with its own tag. The widget needs no other code, runs in a shadow root so your page's styles cannot change it and it cannot change your page, and has no dependencies.

## What a visitor sees

- The pack's questions in plain controls: yes/no and short lists as buttons, long lists as a dropdown, multi-choice as checkboxes. Required questions are marked, and the form will not submit until they are answered.
- A result with the outcome and where it sits on the scale, what to do, anything still needed, and (if you leave it on) the rules behind it with their legal sources.
- **Always shown, and not switchable:** the pack's maturity (`draft`, `beta` or `verified`), the human review notice, a recommendation to involve a person when the rules call for it, and the disclaimer. A result is decision support, never a guarantee of compliance.
- A note not to enter personal information. Assessments store a hash of the answers, never the answers themselves.

## Configuration

The snippet's `data-briesa-config` holds a JSON object. The builder writes it for you and leaves out anything that is a default.

| Key | Meaning |
|---|---|
| `pack`, `scenario` | Which pack and scenario type to ask about. Required. |
| `jurisdictions` | States and territories visitors may pick, such as `["NSW","QLD"]`. With one, visitors are not asked. Default: all the pack covers. |
| `questions` | Per question, keyed by its path: `show` (false hides it), `label`, `help`, and `value` (the answer to use for a hidden question). A required question that is hidden must have a `value`, otherwise the widget shows "This tool is not available on this page" and says why in the console. |
| `theme` | `accent` (a hex colour), `mode` (`auto` follows the visitor's light or dark setting, or `light` / `dark`) and `radius` (`none`, `sm`, `md`, `lg`). |
| `copy` | `title`, `intro`, `submit` (button text), `brand` (false hides "Powered by Briesa") and `schemaHelp` (true shows the pack's built-in help text, which is written for developers and off by default). |
| `result` | `actions` and `reasons`: set either to false to hide that section. |

Anything else in the config is ignored, and values are length-limited and checked before use.

## Reacting to results

The widget fires events on its element, which bubble up to your page:

```js
document.addEventListener("briesa:result", (e) => {
  console.log(e.detail.outcome, e.detail.request_id); // the full assessment response
});
```

`briesa:ready` (the form is showing), `briesa:result`, `briesa:error` (`detail` has `code` and `message`) and `briesa:reset` (the visitor started again). To receive results on your server without any page code, use [webhooks](quickstart.md#5-get-notified-when-rules-change): `assessment.completed` fires for widget assessments too, with the outcome but never the answers.

You can also mount a widget yourself once the script has loaded: `BriesaWidget.mount(element, config, { key: "pk_...", api: "https://YOUR-API" })`.

## Security

Only a **publishable key** may be used in a page. A secret key (`bk_...`) in a page is exposed to every visitor: the widget refuses to start with one, and the API refuses secret keys on any browser request. If you ever pasted one into a page, rotate it.

A publishable key is safe to expose because it is deliberately limited: it only works from the sites you list, can only run assessments and read the questions of the packs you chose, cannot request AI-assisted notes, stops at a monthly cap, and each visitor is rate-limited separately. See the [quickstart](quickstart.md#6-use-the-api-from-a-web-page) for the details.

## Troubleshooting

The visitor only ever sees a plain message. The reason for the site owner is in the browser console, prefixed `[briesa-widget]`:

- **"This tool is not available on this page"** is shown for a wrong, revoked or unlicensed key, a site that is not in the key's allowed sites, or a required question hidden with no value. The console says which, and for an unlisted site gives the exact origin to add.
- **"We could not reach the service"**: check `data-briesa-api`, that the API is up, and that the page's origin is in the key's allowed sites.
- **"This tool is busy right now"**: the key's monthly cap or rate limit was reached. Raise the cap under API keys.

## Versions

The script is served at `/widget/v1.js`. `v1` only receives backwards-compatible changes. A breaking change would ship as `/widget/v2.js`, with notice, and `v1` would keep working during the notice period (see [versioning](versioning.md)).
