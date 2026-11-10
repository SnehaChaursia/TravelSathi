const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const PORT = Number(process.env.PORT || 3000);
const API_KEY = process.env.GNANI_API_KEY_ID?.trim();
const API_KEY_CONFIGURED = Boolean(
  API_KEY && !API_KEY.includes("replace_with_your_gnani_api_key_id"),
);
const MAX_AUDIO_BYTES = 15 * 1024 * 1024;
const MAX_TTS_TEXT_LENGTH = 2_000;
const MAX_TRANSLATION_TEXT_BYTES = 500;
const PUBLIC_DIR = path.join(__dirname, "public");
const STT_URL = "https://api.vachana.ai/stt/v3";
const TTS_URL = "https://api.vachana.ai/api/v1/tts/inference";
const MYMEMORY_URL = "https://api.mymemory.translated.net/get";
const cityCache = new Map();
const CITY_CACHE_TTL_MS = 30 * 60 * 1000;
const citySuggestionCache = new Map();
const CITY_SUGGESTION_CACHE_TTL_MS = 5 * 60 * 1000;
let lastGeocodeStartedAt = 0;
let geocodeQueue = Promise.resolve();
const TRANSLATION_LANGUAGES = {
  "en-IN": "en-IN",
  "hi-IN": "hi-IN",
  "ta-IN": "ta-IN",
  "te-IN": "te-IN",
  "bn-IN": "bn-IN",
  "mr-IN": "mr-IN",
  "gu-IN": "gu-IN",
  "kn-IN": "kn-IN",
  "ml-IN": "ml-IN",
  "pa-IN": "pa-IN",
  "or-IN": "or-IN",
  "as-IN": "as-IN",
  "ur-IN": "ur-IN",
  "doi-IN": "doi-IN",
  "ks-IN": "ks-IN",
  "mai-IN": "mai-IN",
  "mni-IN": "mni-IN",
  "sa-IN": "sa-IN",
  "sat-IN": "sat-IN",
  "sd-IN": "sd-IN",
};
const STT_LANGUAGES = new Set([
  "en-IN", "hi-IN", "ta-IN", "te-IN", "bn-IN",
  "mr-IN", "gu-IN", "kn-IN", "ml-IN", "pa-IN",
]);
const TTS_VOICES = {
  "en-IN": "Kaveri",
  "hi-IN": "Nalini",
  "ta-IN": "Asmita",
  "te-IN": "Suhana",
  "bn-IN": "Kirra",
  "mr-IN": "Zahira",
  "gu-IN": "Falak",
  "kn-IN": "Saanvi",
  "ml-IN": "Reshma",
  "pa-IN": "Mehuli",
};
const REGION_CITY_SUGGESTIONS = [
  { names: ["rajasthan"], cities: ["Jaipur", "Udaipur", "Jodhpur"] },
  { names: ["maharashtra"], cities: ["Nagpur", "Mumbai", "Pune"] },
];
const CITY_GUIDES = [
  {
    names: ["varanasi", "banaras", "kashi"],
    places: ["Kashi Vishwanath Temple", "Dashashwamedh Ghat", "Assi Ghat", "Sarnath", "Ramnagar Fort", "Banaras Hindu University"],
    foods: ["Kachori sabzi", "Banarasi tamatar chaat", "Malaiyyo (winter)", "Baati chokha", "Banarasi paan"],
  },
  {
    names: ["jaipur"],
    places: ["Amber Fort", "Hawa Mahal", "City Palace", "Jantar Mantar", "Nahargarh Fort", "Jal Mahal"],
    foods: ["Dal baati churma", "Pyaaz kachori", "Ghewar", "Laal maas", "Ker sangri"],
  },
  {
    names: ["kochi", "cochin"],
    places: ["Fort Kochi", "Mattancherry Palace", "Chinese Fishing Nets", "Paradesi Synagogue", "Hill Palace", "Marine Drive"],
    foods: ["Kerala sadya", "Appam and stew", "Kerala fish curry", "Puttu and kadala curry", "Malabar parotta"],
  },
  {
    names: ["delhi", "new delhi"],
    places: ["Red Fort", "Qutub Minar", "Humayun's Tomb", "India Gate", "Jama Masjid", "Lotus Temple"],
    foods: ["Chole bhature", "Paranthe wali gali parathas", "Nihari", "Butter chicken", "Daulat ki chaat (winter)"],
  },
  {
    names: ["agra"],
    places: ["Taj Mahal", "Agra Fort", "Fatehpur Sikri", "Itimad-ud-Daulah's Tomb", "Mehtab Bagh"],
    foods: ["Petha", "Bedai and jalebi", "Mughlai paratha", "Dalmoth"],
  },
  {
    names: ["mumbai", "bombay"],
    places: ["Gateway of India", "Chhatrapati Shivaji Maharaj Terminus", "Elephanta Caves", "Marine Drive", "Siddhivinayak Temple", "Haji Ali Dargah"],
    foods: ["Vada pav", "Pav bhaji", "Bombay sandwich", "Bhel puri", "Bombay duck fry"],
  },
  {
    names: ["kolkata", "calcutta"],
    places: ["Victoria Memorial", "Howrah Bridge", "Dakshineswar Kali Temple", "Indian Museum", "Marble Palace", "Kalighat Kali Temple"],
    foods: ["Kathi roll", "Kolkata biryani", "Macher jhol", "Kosha mangsho", "Mishti doi and roshogolla"],
  },
  {
    names: ["chennai", "madras"],
    places: ["Marina Beach", "Kapaleeshwarar Temple", "Fort St. George", "San Thome Basilica", "Government Museum", "Valluvar Kottam"],
    foods: ["Idli and sambar", "Masala dosa", "Chennai filter coffee", "Chettinad chicken", "Sundal"],
  },
  {
    names: ["bengaluru", "bangalore"],
    places: ["Bengaluru Palace", "Lalbagh Botanical Garden", "Cubbon Park", "Vidhana Soudha", "Tipu Sultan's Summer Palace", "ISKCON Temple"],
    foods: ["Benne masala dosa", "Bisi bele bath", "Mysore pak", "Mangalorean ghee roast", "Filter coffee"],
  },
  {
    names: ["hyderabad"],
    places: ["Charminar", "Golconda Fort", "Chowmahalla Palace", "Salar Jung Museum", "Qutb Shahi Tombs", "Hussain Sagar"],
    foods: ["Hyderabadi biryani", "Haleem", "Irani chai and Osmania biscuits", "Double ka meetha", "Pathar ka gosht"],
  },
  {
    names: ["amritsar"],
    places: ["Golden Temple", "Jallianwala Bagh", "Partition Museum", "Gobindgarh Fort", "Wagah Border"],
    foods: ["Amritsari kulcha", "Langar dal", "Chole puri", "Makki di roti and sarson da saag", "Lassi"],
  },
  {
    names: ["lucknow"],
    places: ["Bara Imambara", "Chota Imambara", "Rumi Darwaza", "British Residency", "Ambedkar Memorial Park"],
    foods: ["Tunday kebab", "Lucknowi biryani", "Galouti kebab", "Sheermal", "Malai gilori"],
  },
  {
    names: ["pune", "poona"],
    places: ["Shaniwar Wada", "Aga Khan Palace", "Dagdusheth Halwai Ganapati Temple", "Sinhagad Fort", "Raja Dinkar Kelkar Museum"],
    foods: ["Misal pav", "Maharashtrian thalipeeth", "Bakarwadi", "Mastani", "Puran poli"],
  },
  {
    names: ["udaipur"],
    places: ["City Palace", "Lake Pichola", "Jag Mandir", "Saheliyon-ki-Bari", "Jagdish Temple", "Bagore Ki Haveli"],
    foods: ["Dal baati churma", "Gatte ki sabzi", "Laal maas", "Mirchi vada", "Mawa kachori"],
  },
  {
    names: ["jodhpur"],
    places: ["Mehrangarh Fort", "Umaid Bhawan Palace", "Jaswant Thada", "Clock Tower and Sardar Market", "Mandore Gardens"],
    foods: ["Makhaniya lassi", "Mirchi bada", "Pyaaz kachori", "Mawa kachori", "Ker sangri"],
  },
  {
    names: ["mysuru", "mysore"],
    places: ["Mysore Palace", "Chamundi Hill", "Devaraja Market", "St. Philomena's Cathedral", "Brindavan Gardens"],
    foods: ["Mysore masala dosa", "Mysore pak", "Ragi mudde", "Mysore bonda", "Filter coffee"],
  },
  {
    names: ["ahmedabad"],
    places: ["Sabarmati Ashram", "Adalaj Stepwell", "Sidi Saiyyed Mosque", "Jama Masjid", "Kankaria Lake", "Calico Museum of Textiles"],
    foods: ["Gujarati thali", "Khaman", "Fafda and jalebi", "Thepla", "Dhokla"],
  },
  {
    names: ["srinagar"],
    places: ["Dal Lake", "Mughal Gardens", "Shankaracharya Temple", "Hazratbal Shrine", "Hari Parbat Fort", "Old Srinagar"],
    foods: ["Rogan josh", "Wazwan", "Yakhni", "Kahwa", "Modur pulao"],
  },
  {
    names: ["goa", "panaji", "panjim"],
    places: ["Basilica of Bom Jesus", "Fontainhas", "Fort Aguada", "Dona Paula", "Dudhsagar Falls", "Old Goa churches"],
    foods: ["Goan fish curry", "Pork vindaloo", "Prawn balchao", "Bebinca", "Xacuti"],
  },
  {
    names: ["darjeeling"],
    places: ["Tiger Hill", "Darjeeling Himalayan Railway", "Batasia Loop", "Peace Pagoda", "Himalayan Mountaineering Institute"],
    foods: ["Momos", "Thukpa", "Gundruk", "Aloo dum", "Darjeeling tea"],
  },
  {
    names: ["shimla"],
    places: ["The Ridge", "Mall Road", "Christ Church", "Viceregal Lodge", "Jakhoo Temple", "Kalka–Shimla Railway"],
    foods: ["Chana madra", "Siddu", "Dham", "Babru", "Mittha"],
  },
  {
    names: ["rishikesh"],
    places: ["Lakshman Jhula", "Ram Jhula", "Triveni Ghat", "Neelkanth Mahadev Temple", "Beatles Ashram"],
    foods: ["Aloo puri", "Kachori", "Garhwali thali", "Bal mithai", "Jhangora kheer"],
  },
  {
    names: ["bhopal"],
    places: ["Taj-ul-Masajid", "Upper Lake (Bhojtal)", "Van Vihar National Park", "Bharat Bhavan", "Gohar Mahal", "State Museum Bhopal"],
    foods: ["Poha and jalebi", "Bhopali gosht korma", "Seekh kebab", "Bhopali pulao", "Shahi tukda"],
  },
  {
    names: ["indore"],
    places: ["Rajwada Palace", "Lal Bagh Palace", "Kanch Mandir", "Sarafa Bazaar", "Khajrana Ganesh Temple", "Chappan Dukan"],
    foods: ["Indori poha and jalebi", "Bhutte ka kees", "Garadu", "Indori namkeen", "Dal bafla"],
  },
  {
    names: ["guwahati"],
    places: ["Kamakhya Temple", "Umananda Island", "Assam State Museum", "Srimanta Sankardeva Kalakshetra", "Deepor Beel", "Brahmaputra riverfront"],
    foods: ["Assamese thali", "Masor tenga", "Khar", "Pitha", "Duck with ash gourd"],
  },
  {
    names: ["thiruvananthapuram", "trivandrum"],
    places: ["Padmanabhaswamy Temple", "Kovalam Beach", "Napier Museum", "Kuthira Malika Palace", "Poovar Island", "Shanghumukham Beach"],
    foods: ["Kerala sadya", "Appam and stew", "Puttu and kadala curry", "Karimeen pollichathu", "Pazham pori"],
  },
  {
    names: ["puducherry", "pondicherry"],
    places: ["White Town", "Promenade Beach", "Auroville", "Sri Aurobindo Ashram", "Paradise Beach", "Basilica of the Sacred Heart of Jesus"],
    foods: ["Pondicherry fish curry", "Meen puyabaise", "French-style baguettes", "Chicken asado", "Coconut curry"],
  },
  {
    names: ["patna"],
    places: ["Golghar", "Takht Sri Patna Sahib", "Bihar Museum", "Mahavir Mandir", "Kumhrar", "Gandhi Maidan"],
    foods: ["Litti chokha", "Sattu paratha", "Chana ghugni", "Khaja", "Thekua"],
  },
  {
    names: ["nagpur"],
    places: ["Deekshabhoomi", "Zero Mile Stone", "Sitabuldi Fort", "Maharajbagh Zoo", "Raman Science Centre", "Futala Lake"],
    foods: ["Saoji chicken", "Tarri poha", "Patodi rassa", "Nagpur orange barfi", "Santra burfi"],
  },
  {
    names: ["mangaluru", "mangalore"],
    places: ["Panambur Beach", "Kadri Manjunath Temple", "St. Aloysius Chapel", "Sultan Battery", "Tannirbhavi Beach", "Kudroli Gokarnath Temple"],
    foods: ["Mangalorean fish curry", "Chicken ghee roast", "Neer dosa", "Kori rotti", "Gadbad ice cream"],
  },
  {
    names: ["bhubaneswar"],
    places: ["Lingaraja Temple", "Udayagiri and Khandagiri Caves", "Dhauli Shanti Stupa", "Rajarani Temple", "Mukteswar Temple", "Nandankanan Zoological Park"],
    foods: ["Dalma", "Pakhala bhata", "Chhena poda", "Dahibara aloo dum", "Rasagola"],
  },
  {
    names: ["madurai"],
    places: ["Meenakshi Amman Temple", "Thirumalai Nayakkar Palace", "Gandhi Memorial Museum", "Vandiyur Mariamman Teppakulam"],
    foods: ["Jigarthanda", "Kari dosa", "Paruthi paal", "Idiyappam", "Madurai mutton chukka"],
  },
];

const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
};

function sendJson(response, statusCode, data) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(JSON.stringify(data));
}

async function readAudio(request) {
  const chunks = [];
  let size = 0;

  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_AUDIO_BYTES) {
      const error = new Error("Recording is too large. Keep it under 15 MB.");
      error.statusCode = 413;
      throw error;
    }
    chunks.push(chunk);
  }

  if (size === 0) {
    const error = new Error("No audio was received. Record a message and try again.");
    error.statusCode = 400;
    throw error;
  }

  return Buffer.concat(chunks);
}

async function readJson(request) {
  const chunks = [];
  let size = 0;

  for await (const chunk of request) {
    size += chunk.length;
    if (size > 64 * 1024) {
      const error = new Error("Request is too large.");
      error.statusCode = 413;
      throw error;
    }
    chunks.push(chunk);
  }

  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    const error = new Error("Invalid JSON request.");
    error.statusCode = 400;
    throw error;
  }
}

function upstreamErrorMessage(result, statusCode, serviceName = "Gnani") {
  const detail = result.detail;
  const message = result.error?.message
    || result.message
    || detail?.message
    || (Array.isArray(detail)
      ? detail.map((item) => item.msg).filter(Boolean).join(" ")
      : detail);
  return typeof message === "string" && message
    ? message
    : `${serviceName} returned HTTP ${statusCode}.`;
}

async function readUpstreamError(response, serviceName = "Gnani") {
  const body = await response.text();
  try {
    return upstreamErrorMessage(JSON.parse(body), response.status, serviceName);
  } catch {
    return body || `${serviceName} returned HTTP ${response.status}.`;
  }
}

function audioFilename(contentType) {
  if (contentType.includes("ogg")) return "recording.ogg";
  if (contentType.includes("mp4")) return "recording.mp4";
  if (contentType.includes("wav")) return "recording.wav";
  if (contentType.includes("mpeg")) return "recording.mp3";
  if (contentType.includes("aac")) return "recording.aac";
  if (contentType.includes("flac")) return "recording.flac";
  return "recording.webm";
}

function findCityGuide(city, resolvedName) {
  const searchNames = [city, resolvedName].filter(Boolean).map((name) => name.toLocaleLowerCase().trim());
  return CITY_GUIDES.find((guide) => guide.names.some((name) => searchNames.includes(name)));
}

function normalizeSuggestionText(value) {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function editDistanceAtMostOne(first, second) {
  if (Math.abs(first.length - second.length) > 1) return false;
  let firstIndex = 0;
  let secondIndex = 0;
  let edits = 0;
  while (firstIndex < first.length && secondIndex < second.length) {
    if (first[firstIndex] === second[secondIndex]) {
      firstIndex += 1;
      secondIndex += 1;
      continue;
    }
    edits += 1;
    if (edits > 1) return false;
    if (first.length > second.length) firstIndex += 1;
    else if (second.length > first.length) secondIndex += 1;
    else {
      firstIndex += 1;
      secondIndex += 1;
    }
  }
  return edits + Number(firstIndex < first.length || secondIndex < second.length) <= 1;
}

function scoreSuggestion(query, value) {
  const normalizedValue = normalizeSuggestionText(value);
  if (normalizedValue === query) return 1000;
  if (normalizedValue.startsWith(query)) return 900;

  const tokens = normalizedValue.split(" ");
  if (tokens.some((token) => token.startsWith(query))) return 800;
  if (query.length >= 3 && normalizedValue.includes(query)) return 700;

  const queryTokens = query.split(" ");
  if (queryTokens.length > 1 && queryTokens.every((queryToken) => (
    tokens.some((token) => token.startsWith(queryToken) || token.includes(queryToken))
  ))) return 650;

  if (query.length >= 4 && tokens.some((token) => editDistanceAtMostOne(query, token))) return 550;
  return 0;
}

function findCitySuggestions(query) {
  const normalizedQuery = normalizeSuggestionText(query);
  if (!normalizedQuery) return [];

  const suggestions = [];
  for (const region of REGION_CITY_SUGGESTIONS) {
    const regionScore = Math.max(...region.names.map((name) => scoreSuggestion(normalizedQuery, name)));
    if (!regionScore) continue;
    for (const city of region.cities) {
      suggestions.push({
        label: city,
        detail: `City · ${region.names[0].replace(/\b\w/g, (letter) => letter.toLocaleUpperCase())}`,
        city,
        type: "city",
        score: regionScore,
      });
    }
  }
  for (const guide of CITY_GUIDES) {
    const city = guide.names[0].replace(/\b\w/g, (letter) => letter.toLocaleUpperCase());
    const matchingAlias = guide.names
      .map((name) => ({ name, score: scoreSuggestion(normalizedQuery, name) }))
      .sort((first, second) => second.score - first.score)[0];
    if (matchingAlias.score > 0) {
      suggestions.push({
        label: city,
        detail: matchingAlias.name === guide.names[0]
          ? "City · India"
          : `City · also known as ${matchingAlias.name.replace(/\b\w/g, (letter) => letter.toLocaleUpperCase())}`,
        city,
        type: "city",
        score: matchingAlias.score,
      });
    }

    for (const place of guide.places) {
      const score = scoreSuggestion(normalizedQuery, place);
      if (score > 0) {
        suggestions.push({
          label: place,
          detail: `Famous place · ${city}`,
          city,
          type: "place",
          score,
        });
      }
    }
  }
  return suggestions
    .sort((first, second) => second.score - first.score
      || (first.type === second.type ? 0 : first.type === "city" ? -1 : 1)
      || first.label.localeCompare(second.label))
    .slice(0, 8)
    .map(({ score, ...suggestion }) => suggestion);
}

function formatPhotonSuggestions(features) {
  const suggestions = [];
  const seen = new Set();
  for (const feature of features) {
    const properties = feature.properties || {};
    if (properties.countrycode !== "IN" || !properties.name) continue;

    const isCity = properties.osm_key === "place"
      && ["city", "town", "village", "municipality"].includes(properties.osm_value);
    const isPlace = (properties.osm_key === "historic"
        && ["monument", "memorial", "castle", "tomb", "archaeological_site", "ruins", "fortification"]
          .includes(properties.osm_value))
      || (properties.osm_key === "tourism"
        && ["attraction", "museum", "artwork", "gallery", "viewpoint", "zoo", "aquarium"]
          .includes(properties.osm_value))
      || (properties.osm_key === "amenity"
        && ["place_of_worship", "arts_centre", "theatre", "museum", "fountain"]
          .includes(properties.osm_value))
      || (properties.osm_key === "leisure"
        && ["park", "garden", "nature_reserve", "water_park"]
          .includes(properties.osm_value))
      || (properties.osm_key === "natural"
        && ["beach", "cave_entrance", "peak", "spring"]
          .includes(properties.osm_value))
      || (properties.osm_key === "man_made"
        && ["tower", "lighthouse", "bridge"]
          .includes(properties.osm_value));
    if (!isCity && !isPlace) continue;

    const city = isCity
      ? properties.name
      : properties.city || properties.town || properties.village || properties.municipality || properties.name;
    const type = isCity ? "city" : "place";
    const key = `${type}:${normalizeSuggestionText(properties.name)}:${normalizeSuggestionText(city)}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const location = [
      properties.city && properties.city !== properties.name ? properties.city : "",
      properties.state,
    ].filter(Boolean).join(", ");
    suggestions.push({
      label: properties.name,
      detail: isCity
        ? ["City", properties.state].filter(Boolean).join(" · ")
        : ["Place", location || properties.country].filter(Boolean).join(" · "),
      city,
      type,
      lat: feature.geometry?.coordinates?.[1],
      lon: feature.geometry?.coordinates?.[0],
    });
  }
  return suggestions;
}

async function findWikipediaAttractions(city) {
  const wikiUrl = new URL("https://en.wikipedia.org/w/api.php");
  wikiUrl.searchParams.set("action", "query");
  wikiUrl.searchParams.set("list", "search");
  wikiUrl.searchParams.set("srsearch", `${city} tourist attractions landmarks`);
  wikiUrl.searchParams.set("srlimit", "20");
  wikiUrl.searchParams.set("format", "json");
  const response = await fetch(wikiUrl, {
    headers: { "User-Agent": "TravelSathi/1.0 (city exploration)" },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`Wikipedia attraction search returned HTTP ${response.status}.`);
  const result = await response.json();
  const excludedTitle = /\b(district|constituency|village|neighbourhood|neighborhood|railway station|university|school|college|election|politics|cricket|football|album|film|disambiguation)\b/i;
  const attractionContext = /\b(attraction|landmark|museum|temple|fort|palace|monument|memorial|shrine|heritage|archaeological|lake|garden|cathedral|mosque|ghat|historic)\b/i;
  return (result.query?.search || [])
    .filter((page) => {
      const snippet = page.snippet.replace(/<[^>]*>/g, "");
      return !excludedTitle.test(page.title)
        && snippet.toLocaleLowerCase().includes(city.toLocaleLowerCase())
        && attractionContext.test(snippet);
    })
    .slice(0, 8)
    .map((page) => ({
      tags: { name: page.title, tourism: "landmark" },
    }));
}

async function transcribe(request, response, url) {
  if (!API_KEY_CONFIGURED) {
    sendJson(response, 503, {
      error: "Gnani is not configured. Add your API key ID to the .env file and restart the app.",
    });
    return;
  }

  const languageCode = url.searchParams.get("language_code");
  if (!STT_LANGUAGES.has(languageCode)) {
    sendJson(response, 400, { error: "Choose a supported speech language." });
    return;
  }

  const contentType = (request.headers["content-type"] || "").split(";")[0].trim().toLowerCase();
  if (!["audio/wav", "audio/ogg", "audio/mpeg", "audio/mp4", "audio/aac", "audio/flac"].includes(contentType)) {
    sendJson(response, 415, { error: "The recording must be WAV, OGG, MP3, AAC, M4A, or FLAC audio." });
    return;
  }

  const audio = await readAudio(request);
  const form = new FormData();
  form.append(
    "audio_file",
    new Blob([audio], { type: contentType }),
    audioFilename(contentType),
  );
  form.append("language_code", languageCode);
  form.append("format", "transcribe");
  form.append("itn_native_numerals", "true");

  let upstream;
  try {
    upstream = await fetch(STT_URL, {
      method: "POST",
      headers: { "X-API-Key-ID": API_KEY },
      body: form,
      signal: AbortSignal.timeout(60_000),
    });
  } catch (error) {
    console.error("Gnani STT request failed:", error.message);
    sendJson(response, 502, {
      error: "Could not reach Gnani. Check your internet connection and try again.",
    });
    return;
  }

  let result;
  try {
    result = await upstream.json();
  } catch {
    console.error("Gnani returned a non-JSON response (HTTP", upstream.status, ").");
    sendJson(response, 502, {
      error: "Gnani returned an unexpected response. Check your API access and try again.",
    });
    return;
  }

  if (!upstream.ok || result.success !== true || typeof result.transcript !== "string") {
    const upstreamMessage = upstreamErrorMessage(result, upstream.status);
    console.error("Gnani STT request was rejected (HTTP", upstream.status, ").", upstreamMessage);
    sendJson(response, 502, {
      error: `Gnani could not transcribe this recording: ${upstreamMessage}`,
    });
    return;
  }

  sendJson(response, 200, { transcript: result.transcript });
}

async function synthesize(request, response) {
  if (!API_KEY_CONFIGURED) {
    sendJson(response, 503, {
      error: "Gnani is not configured. Add your API key ID to the .env file and restart the app.",
    });
    return;
  }

  const body = await readJson(request);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    sendJson(response, 400, { error: "Request must be a JSON object." });
    return;
  }
  if (typeof body.text !== "string" || !body.text.trim()) {
    sendJson(response, 400, { error: "Enter text before playing the translation." });
    return;
  }
  if (body.text.length > MAX_TTS_TEXT_LENGTH) {
    sendJson(response, 400, { error: `Text must be ${MAX_TTS_TEXT_LENGTH} characters or fewer.` });
    return;
  }
  if (typeof body.language !== "string" || !Object.hasOwn(TTS_VOICES, body.language)) {
    sendJson(response, 400, { error: "Gnani text-to-speech does not support the selected language." });
    return;
  }

  let upstream;
  try {
    upstream = await fetch(TTS_URL, {
      method: "POST",
      headers: {
        "X-API-Key-ID": API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text: body.text.trim(),
        voice: TTS_VOICES[body.language],
        model: "timbre-v2.5",
        language: body.language,
        audio_config: {
          sample_rate: 24000,
          num_channels: 1,
          sample_width: 2,
          encoding: "linear_pcm",
          container: "wav",
        },
      }),
      signal: AbortSignal.timeout(60_000),
    });
  } catch (error) {
    console.error("Gnani TTS request failed:", error.message);
    sendJson(response, 502, {
      error: "Could not reach Gnani text-to-speech. Check your internet connection and try again.",
    });
    return;
  }

  if (!upstream.ok) {
    const upstreamMessage = await readUpstreamError(upstream);
    console.error("Gnani TTS request was rejected (HTTP", upstream.status, ").", upstreamMessage);
    sendJson(response, 502, {
      error: `Gnani could not generate speech: ${upstreamMessage}`,
    });
    return;
  }

  const audio = Buffer.from(await upstream.arrayBuffer());
  if (audio.length === 0) {
    console.error("Gnani TTS returned an empty audio response.");
    sendJson(response, 502, { error: "Gnani returned an empty audio response. Please try again." });
    return;
  }

  response.writeHead(200, {
    "Content-Type": upstream.headers.get("content-type") || "audio/wav",
    "Content-Length": audio.length,
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  response.end(audio);
}

async function translate(request, response) {
  const body = await readJson(request);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    sendJson(response, 400, { error: "Request must be a JSON object." });
    return;
  }
  if (typeof body.text !== "string" || !body.text.trim()) {
    sendJson(response, 400, { error: "Enter a message before translating it." });
    return;
  }
  if (Buffer.byteLength(body.text, "utf8") > MAX_TRANSLATION_TEXT_BYTES) {
    sendJson(response, 400, { error: "MyMemory's free API allows up to 500 bytes per request. Shorten the message and try again." });
    return;
  }
  if (/\r|\n/.test(body.text)) {
    sendJson(response, 400, { error: "Translate one paragraph at a time. Remove line breaks and try again." });
    return;
  }
  if (!Object.hasOwn(TRANSLATION_LANGUAGES, body.sourceLanguage)
      || !Object.hasOwn(TRANSLATION_LANGUAGES, body.targetLanguage)) {
    sendJson(response, 400, { error: "Choose supported source and target languages." });
    return;
  }
  if (body.sourceLanguage === body.targetLanguage) {
    sendJson(response, 400, { error: "Choose two different languages to translate." });
    return;
  }

  let upstream;
  try {
    const url = new URL(MYMEMORY_URL);
    url.searchParams.set("q", body.text.trim());
    url.searchParams.set(
      "langpair",
      `${TRANSLATION_LANGUAGES[body.sourceLanguage]}|${TRANSLATION_LANGUAGES[body.targetLanguage]}`,
    );
    url.searchParams.set("mt", "1");
    upstream = await fetch(url, {
      signal: AbortSignal.timeout(60_000),
    });
  } catch (error) {
    console.error("MyMemory translation request failed:", error.message);
    sendJson(response, 502, {
      error: "Could not reach the translation service. Check your internet connection and try again.",
    });
    return;
  }

  if (!upstream.ok) {
    const upstreamMessage = await readUpstreamError(upstream, "MyMemory");
    console.error("MyMemory translation request was rejected (HTTP", upstream.status, ").", upstreamMessage);
    sendJson(response, 502, {
      error: `Translation service error: ${upstreamMessage}`,
    });
    return;
  }

  let result;
  try {
    result = await upstream.json();
  } catch {
    sendJson(response, 502, { error: "Translation service returned an unexpected response. Please try again." });
    return;
  }
  if (result.responseStatus !== 200) {
    sendJson(response, 502, {
      error: result.quotaFinished
        ? "The free translation quota has been reached. Try again tomorrow."
        : result.responseDetails || "The translation service could not translate this message.",
    });
    return;
  }

  const translatedText = result.responseData?.translatedText;
  if (typeof translatedText !== "string" || !translatedText.trim()) {
    const quotaMessage = result.quotaFinished
      ? "The free translation quota has been reached. Try again tomorrow."
      : "No translation was returned for this language pair. Try rephrasing the message.";
    console.error("MyMemory returned no translation.", result.responseDetails || "");
    sendJson(response, 502, { error: quotaMessage });
    return;
  }

  sendJson(response, 200, { translation: translatedText.trim() });
}

async function exploreCity(response, url) {
  const city = url.searchParams.get("city")?.trim();
  if (!city || city.length > 100) {
    sendJson(response, 400, { error: "Enter a city name up to 100 characters long." });
    return;
  }

  const cacheKey = city.toLocaleLowerCase();
  const cached = cityCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    sendJson(response, 200, cached.data);
    return;
  }

  const geocodeTurn = geocodeQueue.then(async () => {
    const geocodeDelay = Math.max(0, 1_000 - (Date.now() - lastGeocodeStartedAt));
    if (geocodeDelay) await new Promise((resolve) => setTimeout(resolve, geocodeDelay));
    lastGeocodeStartedAt = Date.now();
  });
  geocodeQueue = geocodeTurn;
  await geocodeTurn;

  let geocoding;
  try {
    const geocodeUrl = new URL("https://nominatim.openstreetmap.org/search");
    geocodeUrl.searchParams.set("q", city);
    geocodeUrl.searchParams.set("format", "jsonv2");
    geocodeUrl.searchParams.set("limit", "1");
    const upstream = await fetch(geocodeUrl, {
      headers: { "User-Agent": "TravelSathi/1.0 (city exploration)" },
      signal: AbortSignal.timeout(15_000),
    });
    if (!upstream.ok) throw new Error(`OpenStreetMap search returned HTTP ${upstream.status}.`);
    geocoding = await upstream.json();
  } catch (error) {
    console.error("City geocoding failed:", error.message);
    sendJson(response, 502, { error: "City search is temporarily unavailable. Please try again." });
    return;
  }

  const match = geocoding[0];
  if (!match) {
    sendJson(response, 404, { error: `No city found for “${city}”. Try another spelling or nearby city name.` });
    return;
  }

  const lat = Number(match.lat);
  const lon = Number(match.lon);
  const resolvedCity = match.name || city;
  const cityGuide = findCityGuide(city, resolvedCity);
  let elements;
  let placeSource = cityGuide ? "Travel Sathi city guide" : "OpenStreetMap";
  if (!cityGuide) {
    const overpassQuery = `[out:json][timeout:20];(node["tourism"~"attraction|museum|artwork"](around:12000,${lat},${lon});way["tourism"~"attraction|museum|artwork"](around:12000,${lat},${lon});relation["tourism"~"attraction|museum|artwork"](around:12000,${lat},${lon});node["historic"~"monument|memorial|castle|archaeological_site|ruins|temple"](around:12000,${lat},${lon});way["historic"~"monument|memorial|castle|archaeological_site|ruins|temple"](around:12000,${lat},${lon}););out center tags 60;`;
    try {
      const upstream = await fetch("https://overpass-api.de/api/interpreter", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
          "User-Agent": "TravelSathi/1.0 (city exploration)",
        },
        body: new URLSearchParams({ data: overpassQuery }),
        signal: AbortSignal.timeout(6_000),
      });
      if (!upstream.ok) throw new Error(`OpenStreetMap places returned HTTP ${upstream.status}.`);
      const result = await upstream.json();
      elements = result.elements;
    } catch (error) {
      console.error("City places search failed:", error.message);
      placeSource = "Wikipedia";
      try {
        elements = await findWikipediaAttractions(resolvedCity);
      } catch (fallbackError) {
        console.error("Wikipedia place fallback failed:", fallbackError.message);
        sendJson(response, 502, { error: "City locations are temporarily unavailable. Please try again." });
        return;
      }
    }
  }

  const places = cityGuide
    ? [
      ...cityGuide.places.map((name) => ({
        name,
        category: "place",
        type: "Famous place",
      })),
      ...cityGuide.foods.map((name) => ({
        name,
        category: "food",
        type: "Local specialty",
      })),
    ]
    : elements
      .map((element) => {
        const tags = element.tags || {};
        return {
          name: tags.name || tags["name:en"],
          category: "place",
          type: tags.tourism || tags.historic || "attraction",
          lat: element.lat ?? element.center?.lat,
          lon: element.lon ?? element.center?.lon,
        };
      })
      .filter((place) => place.name
        && !/(school|college|university|hospital|constituency|division|railway|station|district|village|neighbourhood|neighborhood)/i.test(place.name)
        && (placeSource === "Wikipedia" || (Number.isFinite(place.lat) && Number.isFinite(place.lon))))
      .sort((first, second) => {
        const score = (place) => {
          const type = place.type.toLocaleLowerCase();
          return type.includes("attraction") ? 3 : type.includes("museum") ? 2 : 1;
        };
        return score(second) - score(first);
      })
      .slice(0, 8);
  const displayCity = cityGuide
    ? cityGuide.names[0].replace(/\b\w/g, (letter) => letter.toLocaleUpperCase())
    : match.name || city;
  const result = {
    city: displayCity,
    region: match.display_name,
    lat,
    lon,
    places,
    source: placeSource,
  };
  if (cityCache.size >= 100) cityCache.delete(cityCache.keys().next().value);
  cityCache.set(cacheKey, { data: result, expiresAt: Date.now() + CITY_CACHE_TTL_MS });
  sendJson(response, 200, result);
}

async function findPlaceStory(response, url) {
  const place = url.searchParams.get("place")?.trim();
  const city = url.searchParams.get("city")?.trim();
  if (!place || !city || place.length > 200 || city.length > 100) {
    sendJson(response, 400, { error: "Provide a place and city for the story." });
    return;
  }

  const wikiUrl = new URL("https://en.wikipedia.org/w/api.php");
  wikiUrl.searchParams.set("action", "query");
  wikiUrl.searchParams.set("generator", "search");
  wikiUrl.searchParams.set("gsrsearch", `${place} ${city} India`);
  wikiUrl.searchParams.set("gsrnamespace", "0");
  wikiUrl.searchParams.set("gsrlimit", "1");
  wikiUrl.searchParams.set("prop", "extracts|pageimages|info");
  wikiUrl.searchParams.set("exintro", "1");
  wikiUrl.searchParams.set("explaintext", "1");
  wikiUrl.searchParams.set("piprop", "thumbnail");
  wikiUrl.searchParams.set("pithumbsize", "900");
  wikiUrl.searchParams.set("inprop", "url");
  wikiUrl.searchParams.set("redirects", "1");
  wikiUrl.searchParams.set("format", "json");

  try {
    const upstream = await fetch(wikiUrl, {
      headers: { "User-Agent": "TravelSathi/1.0 (city exploration)" },
      signal: AbortSignal.timeout(15_000),
    });
    if (!upstream.ok) throw new Error(`Wikipedia story search returned HTTP ${upstream.status}.`);
    const result = await upstream.json();
    const page = Object.values(result.query?.pages || {})[0];
    if (!page?.extract) {
      sendJson(response, 404, { error: "No written story is available for this place yet." });
      return;
    }
    sendJson(response, 200, {
      text: page.extract,
      url: page.fullurl,
      image: page.thumbnail?.source,
    });
  } catch (error) {
    console.error(`Place story search failed for ${place}:`, error.message);
    sendJson(response, 502, { error: "Place stories are temporarily unavailable. Please try again." });
  }
}

async function suggestCities(response, url) {
  const query = url.searchParams.get("q")?.trim() || "";
  if (query.length > 100) {
    sendJson(response, 400, { error: "Search for a city or place using 100 characters or fewer." });
    return;
  }
  const normalizedQuery = normalizeSuggestionText(query);
  if (!normalizedQuery) {
    sendJson(response, 200, { suggestions: [] });
    return;
  }

  const curated = findCitySuggestions(query);
  if (normalizedQuery.length < 2) {
    sendJson(response, 200, { suggestions: curated });
    return;
  }

  const cached = citySuggestionCache.get(normalizedQuery);
  if (cached && cached.expiresAt > Date.now()) {
    sendJson(response, 200, { suggestions: cached.suggestions });
    return;
  }

  try {
    const photonUrl = new URL("https://photon.komoot.io/api/");
    photonUrl.searchParams.set("q", query);
    photonUrl.searchParams.set("limit", "12");
    photonUrl.searchParams.set("lang", "en");
    const upstream = await fetch(photonUrl, {
      headers: { "User-Agent": "TravelSathi/1.0 (city and place search)" },
      signal: AbortSignal.timeout(5_000),
    });
    if (!upstream.ok) throw new Error(`Place search returned HTTP ${upstream.status}.`);
    const result = await upstream.json();
    const isRegionQuery = REGION_CITY_SUGGESTIONS.some((region) => region.names.some((name) => (
      scoreSuggestion(normalizedQuery, name) > 0
    )));
    const external = isRegionQuery
      ? []
      : formatPhotonSuggestions(result.features || []).filter((suggestion) => (
        scoreSuggestion(normalizedQuery, suggestion.label) > 0
      ));
    const combined = [...curated, ...external];
    const unique = new Map();
    for (const suggestion of combined) {
      const key = `${suggestion.type}:${normalizeSuggestionText(suggestion.label)}:${normalizeSuggestionText(suggestion.city)}`;
      const existing = unique.get(key);
      if (!existing) {
        unique.set(key, suggestion);
      } else {
        if (!Number.isFinite(existing.lat) && Number.isFinite(suggestion.lat)) existing.lat = suggestion.lat;
        if (!Number.isFinite(existing.lon) && Number.isFinite(suggestion.lon)) existing.lon = suggestion.lon;
        if (existing.detail === "City · India" && suggestion.detail !== "City · India") {
          existing.detail = suggestion.detail;
        }
      }
    }

    const suggestions = [...unique.values()]
      .sort((first, second) => {
        const firstCityMatch = first.type === "city" && normalizeSuggestionText(first.label).startsWith(normalizedQuery);
        const secondCityMatch = second.type === "city" && normalizeSuggestionText(second.label).startsWith(normalizedQuery);
        return Number(secondCityMatch) - Number(firstCityMatch);
      })
      .slice(0, 8);
    if (citySuggestionCache.size >= 100) citySuggestionCache.delete(citySuggestionCache.keys().next().value);
    citySuggestionCache.set(normalizedQuery, {
      suggestions,
      expiresAt: Date.now() + CITY_SUGGESTION_CACHE_TTL_MS,
    });
    sendJson(response, 200, { suggestions });
  } catch (error) {
    console.error("City and place suggestions failed:", error.message);
    if (curated.length) {
      sendJson(response, 200, { suggestions: curated });
      return;
    }
    sendJson(response, 502, { error: "Live place suggestions are temporarily unavailable. You can still search for this city." });
  }
}

async function handleRequest(request, response) {
  const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);

  if (request.method === "GET" && url.pathname === "/api/city-suggestions") {
    await suggestCities(response, url);
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/story") {
    await findPlaceStory(response, url);
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/explore") {
    await exploreCity(response, url);
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/health") {
    sendJson(response, 200, {
      configured: API_KEY_CONFIGURED,
      translationConfigured: true,
    });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/translate") {
    await translate(request, response);
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/transcribe") {
    await transcribe(request, response, url);
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/synthesize") {
    await synthesize(request, response);
    return;
  }

  if (request.method !== "GET" || url.pathname.startsWith("/api/")) {
    sendJson(response, 404, { error: "Not found." });
    return;
  }

  let pathname;
  try {
    pathname = decodeURIComponent(url.pathname === "/"
      ? "/home.html"
      : url.pathname === "/translate"
        ? "/index.html"
        : url.pathname);
  } catch {
    sendJson(response, 400, { error: "Invalid URL." });
    return;
  }

  const filePath = path.resolve(PUBLIC_DIR, `.${pathname}`);
  if (!filePath.startsWith(`${PUBLIC_DIR}${path.sep}`)) {
    sendJson(response, 403, { error: "Forbidden." });
    return;
  }

  fs.readFile(filePath, (error, contents) => {
    if (error) {
      sendJson(response, error.code === "ENOENT" ? 404 : 500, {
        error: error.code === "ENOENT" ? "Not found." : "Could not load the app.",
      });
      return;
    }

    response.writeHead(200, {
      "Content-Type": contentTypes[path.extname(filePath)] || "application/octet-stream",
      "X-Content-Type-Options": "nosniff",
    });
    response.end(contents);
  });
}

http.createServer((request, response) => {
  handleRequest(request, response).catch((error) => {
    console.error("Request failed:", error.message);
    if (!response.headersSent) {
      sendJson(response, error.statusCode || 500, {
        error: error.statusCode ? error.message : "Something went wrong. Please try again.",
      });
    } else {
      response.destroy();
    }
  });
}).listen(PORT, () => {
  console.log(`Travel Sathi is running at http://localhost:${PORT}`);
});
