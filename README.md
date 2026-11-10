# Travel Sathi

A city exploration homepage and voice companion for conversations while travelling in India. The homepage helps visitors search cities and discover mapped places and food spots; the translation page records a short message, sends the audio to Gnani's speech-to-text API, translates the transcript in-app using MyMemory's free API, and plays supported translated text using Gnani's Timbre text-to-speech API.

The public homepage is at `/`. The existing voice translator remains at `/translate`. Explore search suggests Indian cities and landmarks as you type, using Photon/OpenStreetMap place data plus curated city guides; selecting a landmark opens its city guide and highlights the place. City search also uses OpenStreetMap geocoding and filtered Wikipedia landmark results for cities without a curated guide. The Stories section shows every listed attraction for the selected city as a card with a Wikimedia Commons photo and a linked Wikipedia history summary. The “What’s on” section follows Stories. Public APIs may be rate-limited. Upcoming events link to live public search listings. Story sharing is reserved for signed-in travelers, and sign-in is not enabled yet.

MyMemory's anonymous API has a documented 500-byte per-request limit and a 5,000-character daily quota. Submitted text may be retained under [MyMemory's terms](https://mymemory.translated.net/terms-and-conditions); do not translate sensitive or confidential text.

Translation includes English (India) and Indian languages available from MyMemory. The 10 languages without a “translation only” label are supported by Gnani for speech input and playback. Assamese, Dogri, Kashmiri, Maithili, Manipuri, Odia, Sanskrit, Santali, Sindhi, and Urdu are text-translation-only because Gnani's documented speech APIs do not list them. Other foreign-language options are not included.

## What you need to install

1. **Node.js 22 LTS** — download the Windows installer from [nodejs.org](https://nodejs.org/), run it, and keep the option to add Node to `PATH` enabled. Node includes `npm`; this project has no extra npm packages.
2. **Chrome or Edge** — use a current version and allow microphone access when prompted.
3. **Gnani Speech API access** — request an API key ID from [Gnani](https://app.gnani.ai/voice/). The app uses the documented STT and TTS endpoints. Your key must have access to both services; API access may require approval or a paid plan.

## Run it on Windows

1. Open PowerShell in this project folder.
2. Confirm Node and npm are installed:

   ```powershell
   node --version
   npm --version
   ```

3. If `.env` does not exist yet, create it from the example, then open it:

   ```powershell
   if (-not (Test-Path .env)) { Copy-Item .env.example .env }
   notepad .env
   ```

4. Add the Gnani API key ID to `.env`. Keep the key private; do not put it in `public/app.js` or share it. No API key is needed for MyMemory's free translation tier.
5. Start the app:

   ```powershell
   npm start
   ```

6. Open [http://localhost:3000](http://localhost:3000) in Chrome or Edge to explore cities. Open [http://localhost:3000/translate](http://localhost:3000/translate) for the voice translator and allow microphone access.
7. Choose the spoken language, tap **Start talking**, speak for up to 29 seconds, and tap **Stop recording**. The app converts the browser recording to WAV and sends it to Gnani; the transcript appears in the first box.
8. Tap **Translate**. The translation appears in **Their language**; edit it if needed, then tap **Play translation** to generate speech with Gnani Timbre.

The app sends recorded audio to Gnani when you submit a recording, transcript text to MyMemory when you click **Translate**, and supported translated text to Gnani when you tap **Play translation**. MyMemory's terms say queries may be retained. The app does not save recordings or generated audio.

## Troubleshooting

- MyMemory's anonymous service permits up to 500 bytes per request and 5,000 characters per day. If the daily quota runs out, try again the next day.
- Languages marked “translation only” can be used for text translation, but not Gnani speech input or playback. MyMemory may not return a result for every language pair.
- If Gnani rejects a recording or speech request, confirm that your API key is active, has access to STT and TTS, and that you chose a supported language.
- If the browser does not ask for microphone permission, open the app on `localhost` and check the site's microphone permission in browser settings.
- If the translation service returns no result, try rephrasing or shortening the message.
