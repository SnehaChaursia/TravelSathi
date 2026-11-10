const searchForm = document.querySelector("#city-search");
const cityInput = document.querySelector("#city-input");
const citySuggestions = document.querySelector("#city-suggestions");
const cityHeading = document.querySelector("#city-heading");
const cityRegion = document.querySelector("#city-region");
const exploreStatus = document.querySelector("#explore-status");
const placesGrid = document.querySelector("#places-grid");
const foodList = document.querySelector("#food-list");
const placesMapLink = document.querySelector("#places-map-link");
const eventsSearchLink = document.querySelector("#events-search-link");
const eventsCardLink = document.querySelector("#events-card-link");
const menuToggle = document.querySelector(".menu-toggle");
const mainNav = document.querySelector(".main-nav");
const storyMessage = document.querySelector("#story-message");
const storyCards = document.querySelector("#story-cards");
const storiesCount = document.querySelector("#stories-count");

const fallbackImages = [
  "https://images.unsplash.com/photo-1519501025264-65ba15a82390?auto=format&fit=crop&w=1100&q=80",
  "https://images.unsplash.com/photo-1477587458883-47145ed94245?auto=format&fit=crop&w=900&q=80",
  "https://images.unsplash.com/photo-1518005020951-eccb494ad742?auto=format&fit=crop&w=900&q=80",
  "https://images.unsplash.com/photo-1519608487953-e999c86e7455?auto=format&fit=crop&w=900&q=80",
];
const photoRequests = new Map();
let searchSequence = 0;
let suggestionSequence = 0;
let suggestionTimer;
let activeSuggestionIndex = -1;

function setCityLinks(city) {
  const query = encodeURIComponent(`${city} India`);
  const eventUrl = `https://www.google.com/search?q=${encodeURIComponent(`upcoming events in ${city}`)}`;
  const mapUrl = `https://www.openstreetmap.org/search?query=${query}`;
  placesMapLink.href = mapUrl;
  eventsSearchLink.href = eventUrl;
  eventsCardLink.href = eventUrl;
  document.querySelector("#event-city").textContent = city;
}

function setStatus(message, isError = false) {
  exploreStatus.textContent = message;
  exploreStatus.classList.toggle("error", isError);
}

function closeCitySuggestions() {
  suggestionSequence += 1;
  citySuggestions.replaceChildren();
  citySuggestions.hidden = true;
  cityInput.setAttribute("aria-expanded", "false");
  cityInput.removeAttribute("aria-activedescendant");
  activeSuggestionIndex = -1;
}

function setActiveCitySuggestion(index) {
  const options = citySuggestions.querySelectorAll('[role="option"]');
  if (!options.length) return;
  activeSuggestionIndex = (index + options.length) % options.length;
  options.forEach((option, optionIndex) => {
    const isActive = optionIndex === activeSuggestionIndex;
    option.setAttribute("aria-selected", String(isActive));
    if (isActive) {
      cityInput.setAttribute("aria-activedescendant", option.id);
      option.scrollIntoView({ block: "nearest" });
    }
  });
}

function selectSuggestion(suggestion) {
  cityInput.value = suggestion.city;
  closeCitySuggestions();
  explore(suggestion.city, suggestion.type === "place" ? suggestion : null);
}

function showSuggestionMessage(message) {
  citySuggestions.replaceChildren();
  const status = document.createElement("p");
  status.className = "city-suggestion-status";
  status.setAttribute("role", "status");
  status.textContent = message;
  citySuggestions.append(status);
  citySuggestions.hidden = false;
  cityInput.setAttribute("aria-expanded", "true");
  cityInput.removeAttribute("aria-activedescendant");
  activeSuggestionIndex = -1;
}

async function showCitySuggestions(query) {
  const sequence = ++suggestionSequence;
  if (!query) {
    closeCitySuggestions();
    return;
  }
  showSuggestionMessage("Searching cities and places…");
  try {
    const response = await fetch(`/api/city-suggestions?q=${encodeURIComponent(query)}`, {
      signal: AbortSignal.timeout(8_000),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Could not load city suggestions.");
    if (sequence !== suggestionSequence || cityInput.value.trim() !== query) return;
    citySuggestions.replaceChildren();
    activeSuggestionIndex = -1;
    if (!data.suggestions.length) {
      showSuggestionMessage("No matching places yet. Press Explore to search this name.");
      return;
    }
    data.suggestions.forEach((suggestion, index) => {
      const option = document.createElement("button");
      option.id = `city-suggestion-${index}`;
      option.className = "city-suggestion";
      option.type = "button";
      option.setAttribute("role", "option");
      option.setAttribute("aria-selected", "false");
      option.dataset.city = suggestion.city;
      option.dataset.type = suggestion.type;
      option.dataset.label = suggestion.label;
      option.dataset.lat = Number.isFinite(suggestion.lat) ? String(suggestion.lat) : "";
      option.dataset.lon = Number.isFinite(suggestion.lon) ? String(suggestion.lon) : "";
      const name = document.createElement("span");
      name.className = "city-suggestion-name";
      name.textContent = suggestion.label;
      const detail = document.createElement("span");
      detail.className = "city-suggestion-detail";
      detail.textContent = suggestion.detail;
      option.append(name, detail);
      option.addEventListener("mousedown", (event) => event.preventDefault());
      option.addEventListener("click", () => selectSuggestion(suggestion));
      citySuggestions.append(option);
    });
    citySuggestions.hidden = data.suggestions.length === 0;
    cityInput.setAttribute("aria-expanded", String(!citySuggestions.hidden));
    cityInput.removeAttribute("aria-activedescendant");
  } catch (error) {
    if (sequence !== suggestionSequence) return;
    showSuggestionMessage("Suggestions are temporarily unavailable. Press Explore to search this name.");
    console.warn("Could not load city suggestions:", error.message);
  }
}

function getPlaceCoordinates(place) {
  return `${place.lat},${place.lon}`;
}

function normalizeSearchText(value) {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

async function findPhoto(query) {
  if (!photoRequests.has(query)) {
    const params = new URLSearchParams({
      action: "query",
      generator: "search",
      gsrsearch: `filetype:bitmap ${query}`,
      gsrnamespace: "6",
      gsrlimit: "1",
      prop: "imageinfo",
      iiprop: "url",
      iiurlwidth: "900",
      format: "json",
      origin: "*",
    });
    const photoRequest = fetch(`https://commons.wikimedia.org/w/api.php?${params}`)
      .then((response) => {
        if (!response.ok) throw new Error("Could not load a city photo.");
        return response.json();
      })
      .then((data) => {
        const image = Object.values(data.query?.pages || {})[0];
        if (!image?.imageinfo?.[0]?.thumburl) return undefined;
        return {
          url: image.imageinfo[0].thumburl,
          source: image.imageinfo[0].descriptionurl,
        };
      });
    photoRequests.set(query, photoRequest);
  }
  try {
    return await photoRequests.get(query);
  } catch (error) {
    photoRequests.delete(query);
    throw error;
  }
}

async function findPlaceStory(place, city) {
  const params = new URLSearchParams({ place: place.name, city });
  const response = await fetch(`/api/story?${params}`);
  if (!response.ok) throw new Error(`Wikipedia story request returned HTTP ${response.status}.`);
  const data = await response.json();
  if (!data.text) return undefined;
  return {
    text: data.text.replace(/\s+/g, " ").trim(),
    url: data.url || `https://en.wikipedia.org/wiki/${encodeURIComponent(place.name.replaceAll(" ", "_"))}`,
    image: data.image,
  };
}

function createStoryCard(place, city, sequence) {
  const card = document.createElement("article");
  card.className = "story-card";
  card.dataset.placeName = normalizeSearchText(place.name);
  card.tabIndex = -1;

  const photo = document.createElement("div");
  photo.className = "story-image";
  const image = document.createElement("img");
  image.alt = `${place.name} in ${city}`;
  image.loading = "lazy";
  image.decoding = "async";
  photo.append(image);

  const photoCredit = document.createElement("a");
  photoCredit.className = "story-photo-credit";
  photoCredit.target = "_blank";
  photoCredit.rel = "noreferrer";
  photoCredit.textContent = "PHOTO ↗";
  photoCredit.hidden = true;
  photoCredit.setAttribute("aria-label", `Open the photo source for ${place.name}`);
  photo.append(photoCredit);

  const copy = document.createElement("div");
  copy.className = "story-text";
  const location = document.createElement("span");
  location.className = "story-location";
  location.textContent = `${city.toUpperCase()} · PLACE STORY`;
  const title = document.createElement("h3");
  title.textContent = place.name;
  const excerpt = document.createElement("p");
  excerpt.className = "story-excerpt";
  excerpt.textContent = "Finding the story behind this place…";
  const source = document.createElement("a");
  source.className = "story-source";
  source.target = "_blank";
  source.rel = "noreferrer";
  source.textContent = "READ THE STORY ↗";
  source.hidden = true;
  copy.append(location, title, excerpt, source);
  card.append(photo, copy);

  findPhoto(`${place.name} ${city} India`).then((result) => {
    if (!result || sequence !== searchSequence) return;
    image.src = result.url;
    photoCredit.href = result.source;
    photoCredit.hidden = false;
  }).catch((error) => console.warn(`Could not load a photo for ${place.name}:`, error.message));

  findPlaceStory(place, city).then((story) => {
    if (sequence !== searchSequence) return;
    if (!story) {
      excerpt.textContent = "A written history for this place isn't available yet.";
      return;
    }
    excerpt.textContent = story.text;
    source.href = story.url;
    source.hidden = false;
    if (!image.src && story.image) image.src = story.image;
  }).catch((error) => {
    if (sequence !== searchSequence) return;
    excerpt.textContent = "The story for this place couldn't be loaded right now.";
    console.warn(`Could not load the story for ${place.name}:`, error.message);
  });

  return card;
}

function createPlaceCard(place, city, index) {
  const card = document.createElement("article");
  card.className = "place-card";
  card.dataset.placeName = normalizeSearchText(place.name);
  card.tabIndex = -1;
  const photo = document.createElement("div");
  photo.className = "place-card-image";
  photo.style.backgroundImage = `url("${fallbackImages[index % fallbackImages.length]}")`;
  const copy = document.createElement("div");
  copy.className = "place-card-copy";
  const type = document.createElement("span");
  type.className = "place-type";
  type.textContent = place.type.replaceAll("_", " ");
  const name = document.createElement("h3");
  name.textContent = place.name;
  copy.append(type, name);
  const link = document.createElement("a");
  link.className = "place-card-link";
  link.href = Number.isFinite(place.lat) && Number.isFinite(place.lon)
    ? `https://www.openstreetmap.org/?mlat=${place.lat}&mlon=${place.lon}#map=16/${getPlaceCoordinates(place)}`
    : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${place.name} ${city}`)}`;
  link.target = "_blank";
  link.rel = "noreferrer";
  link.setAttribute("aria-label", `Find ${place.name} in ${city} on a map`);
  card.append(photo, copy, link);
  findPhoto(`${place.name} ${city} India`).then((image) => {
    if (image) {
      photo.style.backgroundImage = `url("${image.url}")`;
      const credit = document.createElement("a");
      credit.className = "photo-credit";
      credit.href = image.source;
      credit.target = "_blank";
      credit.rel = "noreferrer";
      credit.textContent = "PHOTO ↗";
      credit.setAttribute("aria-label", `Open the photo source for ${place.name}`);
      copy.append(credit);
    }
  }).catch((error) => console.warn(`Could not load a photo for ${place.name}:`, error.message));
  return card;
}

function createFoodItem(place, city) {
  const item = document.createElement("article");
  item.className = "food-item";
  const art = document.createElement("span");
  art.className = "food-art";
  art.setAttribute("aria-hidden", "true");
  art.textContent = place.type === "cafe" ? "☕" : "✳";
  const copy = document.createElement("div");
  copy.className = "food-copy";
  const name = document.createElement("h3");
  name.textContent = place.name;
  const note = document.createElement("p");
  note.textContent = place.type === "Local specialty" ? "Famous local food" : place.type.replaceAll("_", " ");
  copy.append(name, note);
  const link = document.createElement("a");
  link.className = "food-link";
  link.href = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${place.name} ${city}`)}`;
  link.target = "_blank";
  link.rel = "noreferrer";
  link.setAttribute("aria-label", `Find ${place.name} on Google Maps`);
  link.textContent = "↗";
  item.append(art, copy, link);
  return item;
}

function renderPlaces(data, sequence, focusedPlace = null) {
  placesGrid.replaceChildren();
  foodList.replaceChildren();
  const allAttractions = data.places.filter((place) => place.category === "place");
  if (focusedPlace) {
    const matchedIndex = allAttractions.findIndex((place) => (
      normalizeSearchText(place.name) === normalizeSearchText(focusedPlace.label)
    ));
    if (matchedIndex >= 0) {
      allAttractions.unshift(allAttractions.splice(matchedIndex, 1)[0]);
    } else {
      allAttractions.unshift({
        name: focusedPlace.label,
        category: "place",
        type: "Famous place",
        lat: focusedPlace.lat,
        lon: focusedPlace.lon,
      });
    }
  }
  const attractions = allAttractions.slice(0, 5);
  const restaurants = data.places.filter((place) => place.category === "food").slice(0, 5);

  storyCards.replaceChildren();
  if (!allAttractions.length) {
    storiesCount.textContent = "NO PLACE STORIES AVAILABLE";
    const empty = document.createElement("p");
    empty.className = "story-empty";
    empty.textContent = `We couldn't find famous places to feature in ${data.city}.`;
    storyCards.append(empty);
  } else {
    storiesCount.textContent = `${allAttractions.length} PLACES · ${data.city.toUpperCase()}`;
    allAttractions.forEach((place) => storyCards.append(createStoryCard(place, data.city, sequence)));
  }

  if (!attractions.length) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = "We couldn't find mapped attractions nearby. Open the map to discover more places.";
    placesGrid.append(empty);
  } else {
    attractions.forEach((place, index) => placesGrid.append(createPlaceCard(place, data.city, index)));
    if (focusedPlace) {
      const placeName = normalizeSearchText(focusedPlace.label);
      const placeCard = [...placesGrid.querySelectorAll(".place-card"), ...storyCards.querySelectorAll(".story-card")]
        .find((card) => card.dataset.placeName === placeName);
      if (placeCard) {
        placeCard.scrollIntoView({ behavior: "smooth", block: "center" });
        placeCard.focus({ preventScroll: true });
      }
    }
  }

  if (!restaurants.length) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = `We don't have a verified famous-food guide for ${data.city} yet.`;
    foodList.append(empty);
    const searchLink = document.createElement("a");
    searchLink.className = "text-link";
    searchLink.href = `https://www.google.com/search?q=${encodeURIComponent(`famous local food in ${data.city}`)}`;
    searchLink.target = "_blank";
    searchLink.rel = "noreferrer";
    searchLink.textContent = `SEARCH FAMOUS FOOD IN ${data.city.toUpperCase()} ↗`;
    foodList.append(searchLink);
  } else {
    restaurants.forEach((place) => foodList.append(createFoodItem(place, data.city)));
  }

  cityHeading.textContent = data.city;
  cityRegion.textContent = data.region;
  cityInput.value = data.city;
  try {
    localStorage.setItem("travelSathiCity", data.city);
    localStorage.removeItem("travelSathiHeroPhoto");
  } catch (error) {
    console.warn("Could not save the last explored city:", error);
  }
  document.querySelector(".hero-caption > span:nth-child(2)").textContent = data.city.toUpperCase();
  setCityLinks(data.city);
  findPhoto(`${data.city} India ghats architecture city`).then((image) => {
    if (image && sequence === searchSequence) {
      document.querySelector(".hero-image").style.backgroundImage = `url("${image.url}")`;
      document.querySelector("#hero-photo-credit").href = image.source;
      try {
        localStorage.setItem("travelSathiHeroPhoto", JSON.stringify({ city: data.city, ...image }));
      } catch (error) {
        console.warn("Could not cache the city photo:", error);
      }
    }
  }).catch((error) => console.warn(`Could not load a cover photo for ${data.city}:`, error.message));
  if (sequence === searchSequence) {
    const sourceNote = document.querySelector("#source-note");
    sourceNote.textContent = data.source === "Travel Sathi city guide"
      ? "Famous places and local specialties from our city guide. Stories link to Wikipedia; photos link to Wikimedia Commons. City/place suggestions use Photon (© OpenStreetMap contributors)."
      : data.source === "OpenStreetMap"
        ? "Nearby mapped attractions and city/place suggestions © OpenStreetMap contributors. Story histories link to Wikipedia; photos link to Wikimedia Commons."
        : "Nearby landmark articles from Wikipedia. City/place suggestions use Photon (© OpenStreetMap contributors); story photos link to Wikimedia Commons.";
    setStatus(`${attractions.length} places to visit and ${restaurants.length} famous foods listed.`);
  }
}

async function explore(city, focusedPlace = null) {
  const sequence = ++searchSequence;
  setStatus(`Finding ${city}…`);
  placesGrid.replaceChildren();
  foodList.replaceChildren();
  storyCards.replaceChildren();
  storiesCount.textContent = "LOADING PLACE STORIES";
  try {
    const response = await fetch(`/api/explore?city=${encodeURIComponent(city)}`);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Could not find that city.");
    if (sequence !== searchSequence) return;
    renderPlaces(data, sequence, focusedPlace);
  } catch (error) {
    if (sequence === searchSequence) {
      storiesCount.textContent = "PLACE STORIES UNAVAILABLE";
      setStatus(error.message, true);
    }
  }
}

cityInput.addEventListener("input", () => {
  clearTimeout(suggestionTimer);
  suggestionTimer = setTimeout(() => showCitySuggestions(cityInput.value.trim()), 280);
});

cityInput.addEventListener("keydown", (event) => {
  if (event.key === "ArrowDown" && !citySuggestions.hidden) {
    event.preventDefault();
    setActiveCitySuggestion(activeSuggestionIndex + 1);
  } else if (event.key === "ArrowUp" && !citySuggestions.hidden) {
    event.preventDefault();
    const optionCount = citySuggestions.querySelectorAll('[role="option"]').length;
    setActiveCitySuggestion(activeSuggestionIndex < 0 ? optionCount - 1 : activeSuggestionIndex - 1);
  } else if (event.key === "Enter" && activeSuggestionIndex >= 0) {
    event.preventDefault();
    const activeOption = citySuggestions.querySelectorAll('[role="option"]')[activeSuggestionIndex];
    if (activeOption) {
      selectSuggestion({
        city: activeOption.dataset.city,
        type: activeOption.dataset.type,
        label: activeOption.dataset.label,
        lat: activeOption.dataset.lat ? Number(activeOption.dataset.lat) : undefined,
        lon: activeOption.dataset.lon ? Number(activeOption.dataset.lon) : undefined,
      });
    }
  } else if (event.key === "Escape" && !citySuggestions.hidden) {
    closeCitySuggestions();
  }
});

cityInput.addEventListener("blur", closeCitySuggestions);

searchForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const city = cityInput.value.trim();
  closeCitySuggestions();
  if (city) explore(city);
});

document.querySelectorAll("[data-city]").forEach((button) => {
  button.addEventListener("click", () => explore(button.dataset.city));
});

menuToggle.addEventListener("click", () => {
  const isOpen = menuToggle.getAttribute("aria-expanded") === "true";
  menuToggle.setAttribute("aria-expanded", String(!isOpen));
  menuToggle.setAttribute("aria-label", isOpen ? "Open navigation" : "Close navigation");
  mainNav.classList.toggle("open", !isOpen);
});

mainNav.addEventListener("click", (event) => {
  if (event.target.closest("a")) {
    mainNav.classList.remove("open");
    menuToggle.setAttribute("aria-expanded", "false");
    menuToggle.setAttribute("aria-label", "Open navigation");
  }
});

document.querySelector(".story-login").addEventListener("click", (event) => {
  event.preventDefault();
  storyMessage.textContent = "Story sharing is reserved for signed-in travelers. Sign-in is not enabled yet.";
  storyMessage.hidden = false;
});

setCityLinks(cityInput.value);
explore(cityInput.value);
