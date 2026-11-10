# Deploy the submissions Apps Script

The lesson page grades written answers in the browser. Uploading a submission
(and applying mastery updates to the progress Sheet) needs this web app. There
is no token in the public page — deploy once, then paste the `/exec` URL into
`assets/config.js`. Until that URL is set, the site still grades locally and
offers a `submission.json` download.

Do this while signed into the account that can edit:

- the progress Google Sheet `1zeFTbheaUaBwP2R1szWImfVOX0jWhN_YN1rct3UIKcM` (tab `progress`)
- Google Drive (it will create a `Mandarin/submissions/` folder)

Prefer `grok.evandcombs@gmail.com` if that account already has Sheet access;
otherwise use Evan’s Google account.

## Click steps

1. Open [https://script.google.com](https://script.google.com) and sign in as the account above.
2. Click **New project**. Rename it `Mei Mandarin submissions`.
3. In the editor, replace the starter `Code.gs` with the contents of `Code.gs` from this folder.
4. File **+** → **Script properties** is not needed. Optional: Project Settings → tick *Show `appsscript.json` manifest**, then replace it with `appsscript.json` from this folder. If you skip this, the deploy dialog still sets the same options.
5. Click **Deploy** → **New deployment**.
6. The gear next to “Select type” → **Web app**.
7. Fill in:
   - Description: `mei-mandarin-submissions`
   - **Execute as:** Me
   - **Who has access:** Anyone
8. Click **Deploy**.
9. Authorize the app when Google prompts:
   - Choose the same account.
   - If you see “Google hasn’t verified this app”, click **Advanced** → **Go to Mei Mandarin submissions (unsafe)**.
   - Allow Drive and Sheets access.
10. Copy the **Web app URL**. It looks like:
    `https://script.google.com/macros/s/AKfycb…/exec`
11. Open that URL in a browser. You should see a small JSON/text line like
    `{"ok":true,"service":"mei-mandarin-submissions"}`. If you get a sign-in
    page, the access setting is not **Anyone** — edit the deployment and try again.
12. Paste the URL into `assets/config.js` on the `main` branch of this repo:

    ```js
    window.MANDARIN_CONFIG = {
      SUBMIT_URL: "https://script.google.com/macros/s/PASTE_DEPLOYMENT_ID/exec"
    };
    ```

13. Commit and push `assets/config.js`. Wait for GitHub Pages to rebuild
    (usually under a minute). After that, Submit on a lesson page will POST
    the payload as `text/plain` (no CORS preflight). The browser often cannot
    read the Script’s response; the request is still delivered. A successful
    submit writes:

    `Drive / Mandarin / submissions / <lessonId> / <timestamp> /`

    containing `submission.json`, any `S1.webm` (etc.) clips, and `status.json`
    with `voice_pending: true` when there are speaking items. Written-score
    mastery updates are applied to the progress Sheet. A second submit with
    the same lesson id and the same answers is saved as a new folder but does
    not double-count mastery (keyed on a hash of `lessonId` + answers).

## Updating the script later

Deploy → **Manage deployments** → edit the existing deployment → **New version**.
The `/exec` URL stays the same, so you usually do not need to change `config.js`.

## What this does not do

- It does not grade voice clips. Mei lists `status.json` files with
  `voice_pending: true`, listens, and updates the Sheet for voice words.
- It does not create new vocabulary rows. Unmatched words are listed in
  `status.json` as `unmatched_words`.
