const sourceLanguage = document.querySelector("#source-language");
const targetLanguage = document.querySelector("#target-language");
const transcript = document.querySelector("#transcript");
const translation = document.querySelector("#translation");
const recordButton = document.querySelector("#record-button");
const recordButtonLabel = document.querySelector("#record-button-label");
const recordHint = document.querySelector("#record-hint");
const charCount = document.querySelector("#char-count");
const appMessage = document.querySelector("#app-message");
const apiStatus = document.querySelector("#api-status");
const statusContainer = document.querySelector(".topbar-note");
const translateButton = document.querySelector("#translate-button");
const playButton = document.querySelector("#play-button");
const swapButton = document.querySelector("#swap-languages");

let recorder;
let audioStream;
let audioChunks = [];
let isTranscribing = false;
let recordingTimeout;
let currentAudio;
let currentAudioUrl;
let isSpeaking = false;
let recordingAvailable = false;

const MAX_RECORDING_MS = 29_000;

function showMessage(message, isError = false) {
  appMessage.textContent = message;
  appMessage.classList.toggle("error", isError);
}

function setRecordingState(recording) {
  recordButton.classList.toggle("recording", recording);
  recordButton.setAttribute("aria-pressed", String(recording));
  recordButtonLabel.textContent = recording ? "Stop recording" : "Start talking";
  recordHint.textContent = recording ? "Listening… tap to finish" : "Tap the mic and say something";
}

async function getApiStatus() {
  try {
    const response = await fetch("/api/health");
    if (!response.ok) throw new Error("Could not check the voice service.");
    const data = await response.json();

    if (data.configured) {
      apiStatus.textContent = "Gnani voice and free translation ready";
      statusContainer.classList.add("ready");
      recordingAvailable = Boolean(navigator.mediaDevices?.getUserMedia
        && window.MediaRecorder
        && window.AudioContext);
      updateVoiceControls();
      if (!recordingAvailable) {
        showMessage("Audio recording is not supported in this browser. Try the latest Chrome or Edge.", true);
      }
    } else {
      apiStatus.textContent = "Add your Gnani API key to get started";
      statusContainer.classList.add("error");
      showMessage("Set up your Gnani API key using the steps in README.md to enable recording.");
    }
  } catch (error) {
    apiStatus.textContent = "Voice service unavailable";
    statusContainer.classList.add("error");
    showMessage(error.message, true);
  }
}

function updateVoiceControls() {
  const speechSupported = sourceLanguage.selectedOptions[0]?.dataset.stt === "true";
  const voiceSupported = targetLanguage.selectedOptions[0]?.dataset.tts === "true";
  recordButton.disabled = !recordingAvailable || !speechSupported || isTranscribing;
  recordHint.textContent = speechSupported
    ? "Tap the mic and say something"
    : "Speech input is unavailable; type your message to translate";
  playButton.disabled = isSpeaking || !voiceSupported;
  playButton.title = voiceSupported
    ? ""
    : "Speech playback is not available for this language.";
}

async function startRecording() {
  showMessage("");
  try {
    audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const options = {};
    if (MediaRecorder.isTypeSupported("audio/webm;codecs=opus")) {
      options.mimeType = "audio/webm;codecs=opus";
    } else if (MediaRecorder.isTypeSupported("audio/webm")) {
      options.mimeType = "audio/webm";
    }

    recorder = new MediaRecorder(audioStream, options);
    audioChunks = [];
    recorder.addEventListener("dataavailable", (event) => {
      if (event.data.size > 0) audioChunks.push(event.data);
    });
    recorder.addEventListener("stop", sendRecording, { once: true });
    recorder.start();
    recordingTimeout = window.setTimeout(() => stopRecording(true), MAX_RECORDING_MS);
    setRecordingState(true);
    recordButton.setAttribute("aria-label", "Stop recording");
    showMessage("Listening… speak clearly and tap Stop recording when you are done.");
  } catch (error) {
    stopAudioTracks();
    const message = error.name === "NotAllowedError"
      ? "Microphone permission was blocked. Allow microphone access in your browser and try again."
      : `Could not start recording: ${error.message}`;
    showMessage(message, true);
  }
}

function stopAudioTracks() {
  if (audioStream) {
    audioStream.getTracks().forEach((track) => track.stop());
    audioStream = undefined;
  }
}

function stopRecording(maxDurationReached = false) {
  window.clearTimeout(recordingTimeout);
  if (recorder?.state === "recording") recorder.stop();
  stopAudioTracks();
  setRecordingState(false);
  recordButton.disabled = true;
  isTranscribing = true;
  recordButtonLabel.textContent = "Transcribing…";
  showMessage(maxDurationReached
    ? "Recording limit reached. Sending your message to Gnani…"
    : "Sending your recording to Gnani for transcription…");
}

async function convertToWav(audio) {
  const audioContext = new AudioContext();
  try {
    const decoded = await audioContext.decodeAudioData(await audio.arrayBuffer());
    const channelCount = decoded.numberOfChannels;
    const bytesPerSample = 2;
    const dataLength = decoded.length * channelCount * bytesPerSample;
    const wav = new ArrayBuffer(44 + dataLength);
    const view = new DataView(wav);

    view.setUint32(0, 0x52494646, false);
    view.setUint32(4, 36 + dataLength, true);
    view.setUint32(8, 0x57415645, false);
    view.setUint32(12, 0x666d7420, false);
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, channelCount, true);
    view.setUint32(24, decoded.sampleRate, true);
    view.setUint32(28, decoded.sampleRate * channelCount * bytesPerSample, true);
    view.setUint16(32, channelCount * bytesPerSample, true);
    view.setUint16(34, bytesPerSample * 8, true);
    view.setUint32(36, 0x64617461, false);
    view.setUint32(40, dataLength, true);

    const channels = Array.from({ length: channelCount }, (_, index) => decoded.getChannelData(index));
    let offset = 44;
    for (let sample = 0; sample < decoded.length; sample += 1) {
      for (let channel = 0; channel < channelCount; channel += 1) {
        const value = Math.max(-1, Math.min(1, channels[channel][sample]));
        view.setInt16(offset, value < 0 ? value * 0x8000 : value * 0x7fff, true);
        offset += bytesPerSample;
      }
    }

    return new Blob([wav], { type: "audio/wav" });
  } finally {
    await audioContext.close();
  }
}

async function sendRecording() {
  const mimeType = recorder.mimeType || "audio/webm";
  const recordedAudio = new Blob(audioChunks, { type: mimeType });
  audioChunks = [];

  try {
    if (recordedAudio.size === 0) {
      throw new Error("No audio was captured. Check microphone access and try again.");
    }
    const audio = await convertToWav(recordedAudio);
    const response = await fetch(`/api/transcribe?language_code=${encodeURIComponent(sourceLanguage.value)}`, {
      method: "POST",
      headers: { "Content-Type": audio.type },
      body: audio,
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Transcription failed. Please try again.");
    if (typeof result.transcript !== "string") throw new Error("Gnani returned an invalid transcript.");

    if (!result.transcript.trim()) {
      showMessage("No speech was detected. Try speaking closer to the microphone.", true);
      return;
    }
    transcript.value = transcript.value.trim()
      ? `${transcript.value.trim()}\n${result.transcript}`
      : result.transcript;
    updateCharacterCount();
    showMessage("Transcription ready.");
  } catch (error) {
    showMessage(error.message, true);
  } finally {
    isTranscribing = false;
    updateVoiceControls();
    recordButtonLabel.textContent = "Start talking";
    recordButton.setAttribute("aria-label", "Start talking");
    recordHint.textContent = "Tap the mic and say something";
  }
}

async function speakTranslation() {
  const text = translation.value.trim();
  if (!text) {
    showMessage("Add a translation first, then tap Play translation.", true);
    return;
  }
  if (targetLanguage.selectedOptions[0]?.dataset.tts !== "true") {
    showMessage("Translation is ready, but Gnani speech playback is unavailable for this language.", true);
    return;
  }
  if (isSpeaking) return;

  isSpeaking = true;
  playButton.disabled = true;
  showMessage("Generating speech with Gnani…");
  try {
    const response = await fetch("/api/synthesize", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, language: targetLanguage.value }),
    });
    if (!response.ok) {
      const result = await response.json();
      throw new Error(result.error || "Gnani speech generation failed. Please try again.");
    }

    const audio = await response.blob();
    if (audio.size === 0) throw new Error("Gnani returned an empty audio response.");
    if (currentAudioUrl) URL.revokeObjectURL(currentAudioUrl);
    currentAudioUrl = URL.createObjectURL(audio);
    currentAudio = new Audio(currentAudioUrl);
    currentAudio.addEventListener("ended", () => {
      showMessage("Speech playback finished.");
      releaseAudio();
    }, { once: true });
    currentAudio.addEventListener("error", () => {
      showMessage("Could not play the audio returned by Gnani.", true);
      releaseAudio();
    }, { once: true });
    await currentAudio.play();
    showMessage("Playing your reply using Gnani text-to-speech.");
  } catch (error) {
    showMessage(error.message, true);
  } finally {
    isSpeaking = false;
    updateVoiceControls();
  }
}

function releaseAudio() {
  if (currentAudioUrl) URL.revokeObjectURL(currentAudioUrl);
  currentAudioUrl = undefined;
  currentAudio = undefined;
}

function updateCharacterCount() {
  charCount.textContent = String(transcript.value.length);
}

async function translateText() {
  const text = transcript.value.trim();
  if (!text) {
    showMessage("Record or type a message before translating it.", true);
    return;
  }
  if (new TextEncoder().encode(text).length > 500) {
    showMessage("Keep the message under MyMemory's 500-byte per-request limit.", true);
    return;
  }
  if (/\r|\n/.test(text)) {
    showMessage("Translate one paragraph at a time. Remove line breaks and try again.", true);
    return;
  }
  if (sourceLanguage.value === targetLanguage.value) {
    showMessage("Choose two different languages to translate.", true);
    return;
  }
  if (!sourceLanguage.selectedOptions[0]?.dataset.stt) {
    showMessage("This language is translation-only. Type the original text in the message box.", true);
  }
  if (!targetLanguage.selectedOptions[0]?.dataset.tts) {
    showMessage("This language is translation-only; speech playback will not be available.", true);
  }
  if (translateButton.disabled) return;

  translateButton.disabled = true;
  showMessage("Translating…");
  try {
    const response = await fetch("/api/translate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text,
        sourceLanguage: sourceLanguage.value,
        targetLanguage: targetLanguage.value,
      }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Translation failed. Please try again.");
    if (typeof result.translation !== "string" || !result.translation.trim()) {
      throw new Error("The translation service returned an invalid translation.");
    }

    translation.value = result.translation;
    showMessage(targetLanguage.selectedOptions[0]?.dataset.tts === "true"
      ? "Translation ready. Tap Play translation to hear it."
      : "Translation ready. This language is not available for Gnani speech playback.");
  } catch (error) {
    showMessage(error.message, true);
  } finally {
    translateButton.disabled = false;
  }
}

function swapLanguages() {
  const previousSource = sourceLanguage.value;
  sourceLanguage.value = targetLanguage.value;
  targetLanguage.value = previousSource;
  updateVoiceControls();
  showLanguageSupportMessage();
}

function showLanguageSupportMessage() {
  if (sourceLanguage.selectedOptions[0]?.dataset.stt !== "true") {
    showMessage("This language is translation-only. Type the original text in the message box.");
  } else if (targetLanguage.selectedOptions[0]?.dataset.tts !== "true") {
    showMessage("Translation works, but speech playback is unavailable for this language.");
  } else {
    showMessage("");
  }
}

recordButton.addEventListener("click", () => {
  if (isTranscribing) return;
  if (recorder?.state === "recording") {
    stopRecording();
  } else {
    startRecording();
  }
});
transcript.addEventListener("input", updateCharacterCount);
sourceLanguage.addEventListener("change", () => {
  updateVoiceControls();
  showLanguageSupportMessage();
});
targetLanguage.addEventListener("change", () => {
  updateVoiceControls();
  showLanguageSupportMessage();
});
translateButton.addEventListener("click", translateText);
playButton.addEventListener("click", speakTranslation);
swapButton.addEventListener("click", swapLanguages);
window.addEventListener("beforeunload", () => {
  currentAudio?.pause();
  releaseAudio();
});

getApiStatus();
