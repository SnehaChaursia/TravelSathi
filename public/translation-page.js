const menuToggle = document.querySelector(".menu-toggle");
const mainNav = document.querySelector(".main-nav");
const heroImage = document.querySelector("#translation-hero-image");
const cityLabel = document.querySelector("#translation-city-label");
const photoCredit = document.querySelector("#translation-photo-credit");

const defaultCity = "Varanasi";
const defaultPhoto = "https://images.unsplash.com/photo-1561361513-2d000a50f0dc?auto=format&fit=crop&w=2400&q=90";

function isAllowedPhotoUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:"
      && ["upload.wikimedia.org", "thumb.wikimedia.org", "images.unsplash.com"].includes(url.hostname);
  } catch {
    return false;
  }
}

function setHeroPhoto(url, source) {
  if (!isAllowedPhotoUrl(url)) return;
  heroImage.style.backgroundImage = `url("${url}")`;
  heroImage.classList.add("photo-loaded");
  if (isCommonsSource(source)) {
    photoCredit.href = source;
  }
}

function isCommonsSource(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === "commons.wikimedia.org";
  } catch {
    return false;
  }
}

async function findCityPhoto(city) {
  const params = new URLSearchParams({
    action: "query",
    generator: "search",
    gsrsearch: `filetype:bitmap ${city} India ghats architecture city`,
    gsrnamespace: "6",
    gsrlimit: "1",
    prop: "imageinfo",
    iiprop: "url",
    iiurlwidth: "1600",
    format: "json",
    origin: "*",
  });
  const response = await fetch(`https://commons.wikimedia.org/w/api.php?${params}`);
  if (!response.ok) throw new Error("Could not load a photo for this city.");
  const data = await response.json();
  const image = Object.values(data.query?.pages || {})[0]?.imageinfo?.[0];
  if (!image?.thumburl || !image.descriptionurl) return;
  return { url: image.thumburl, source: image.descriptionurl };
}

async function showCityPhoto() {
  let city = defaultCity;
  let cachedPhoto;
  try {
    city = localStorage.getItem("travelSathiCity") || defaultCity;
    const storedPhoto = localStorage.getItem("travelSathiHeroPhoto");
    if (storedPhoto) cachedPhoto = JSON.parse(storedPhoto);
  } catch (error) {
    console.warn("Could not read the last explored city:", error);
  }

  cityLabel.textContent = city.toUpperCase();
  if (cachedPhoto?.city === city && isAllowedPhotoUrl(cachedPhoto.url)) {
    setHeroPhoto(cachedPhoto.url, cachedPhoto.source);
  } else if (city === defaultCity) {
    setHeroPhoto(defaultPhoto);
  } else {
    heroImage.style.backgroundImage = "none";
    heroImage.classList.remove("photo-loaded");
  }

  try {
    const photo = await findCityPhoto(city);
    if (!photo || !isAllowedPhotoUrl(photo.url)) return;
    setHeroPhoto(photo.url, photo.source);
    try {
      localStorage.setItem("travelSathiHeroPhoto", JSON.stringify({ city, ...photo }));
    } catch (error) {
      console.warn("Could not cache the city photo:", error);
    }
  } catch (error) {
    console.warn(`Could not load a photo for ${city}:`, error);
  }
}

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

showCityPhoto();
