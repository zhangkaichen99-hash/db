const STORAGE_KEY = "db-last-minute-routes";
const CHECK_INTERVAL_MS = 30_000;

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./service-worker.js").catch(() => {
      // The app still works without offline install caching.
    });
  });
}

const routeForm = document.querySelector("#routeForm");
const ticketForm = document.querySelector("#ticketForm");
const savedRoutes = document.querySelector("#savedRoutes");
const notificationStatus = document.querySelector("#notificationStatus");
const sampleButton = document.querySelector("#sampleButton");
const checkAllButton = document.querySelector("#checkAllButton");
const template = document.querySelector("#routeCardTemplate");
const appToast = document.querySelector("#appToast");
const screens = [...document.querySelectorAll(".app-screen")];
const tabButtons = [...document.querySelectorAll(".tab-button")];

const STATION_ALIASES = new Map(
  Object.entries({
    berlin: "Berlin Hbf",
    "berlin hbf": "Berlin Hbf",
    aachen: "Aachen Hbf",
    "aachen hbf": "Aachen Hbf",
    munich: "München Hbf",
    münchen: "München Hbf",
    muenchen: "München Hbf",
    "münchen hbf": "München Hbf",
    hamburg: "Hamburg Hbf",
    "hamburg hbf": "Hamburg Hbf",
    frankfurt: "Frankfurt(Main)Hbf",
    "frankfurt main": "Frankfurt(Main)Hbf",
    "frankfurt hbf": "Frankfurt(Main)Hbf",
    "frankfurt am main": "Frankfurt(Main)Hbf",
    cologne: "Köln Hbf",
    köln: "Köln Hbf",
    koeln: "Köln Hbf",
    "köln hbf": "Köln Hbf",
    stuttgart: "Stuttgart Hbf",
    "stuttgart hbf": "Stuttgart Hbf",
    düsseldorf: "Düsseldorf Hbf",
    duesseldorf: "Düsseldorf Hbf",
    dusseldorf: "Düsseldorf Hbf",
    dortmund: "Dortmund Hbf",
    leipzig: "Leipzig Hbf",
    hannover: "Hannover Hbf",
    nuremberg: "Nürnberg Hbf",
    nürnberg: "Nürnberg Hbf",
    nuernberg: "Nürnberg Hbf",
    bremen: "Bremen Hbf",
    dresden: "Dresden Hbf",
  }),
);

const STATIONS = new Map(
  Object.entries({
    "Berlin Hbf": { eva: "8011160", x: "13369549", y: "52525589" },
    "Aachen Hbf": { eva: "8000001", x: "6091495", y: "50767803" },
    "München Hbf": { eva: "8000261", x: "11558339", y: "48140228" },
    "Hamburg Hbf": { eva: "8002549", x: "10006909", y: "53552830" },
    "Frankfurt(Main)Hbf": { eva: "8000105", x: "8663785", y: "50107037" },
    "Köln Hbf": { eva: "8000207", x: "6958907", y: "50942946" },
    "Stuttgart Hbf": { eva: "8000096", x: "9181791", y: "48783927" },
    "Düsseldorf Hbf": { eva: "8000085", x: "6794233", y: "51219830" },
    "Dortmund Hbf": { eva: "8000080", x: "7458499", y: "51517899" },
    "Leipzig Hbf": { eva: "8010205", x: "12382774", y: "51345200" },
    "Hannover Hbf": { eva: "8000152", x: "9741687", y: "52376635" },
    "Nürnberg Hbf": { eva: "8000284", x: "11082878", y: "49445751" },
    "Bremen Hbf": { eva: "8000050", x: "8813634", y: "53083264" },
    "Dresden Hbf": { eva: "8010085", x: "13732114", y: "51040562" },
  }),
);

const formFields = {
  from: document.querySelector("#from"),
  to: document.querySelector("#to"),
  date: document.querySelector("#date"),
  time: document.querySelector("#time"),
  threshold: document.querySelector("#threshold"),
  windowHours: document.querySelector("#windowHours"),
  travellers: document.querySelector("#travellers"),
  bahnCard: document.querySelector("#bahnCard"),
};

const ticketFields = {
  url: document.querySelector("#ticketUrl"),
  currentPrice: document.querySelector("#ticketCurrentPrice"),
  threshold: document.querySelector("#ticketThreshold"),
};

const stationSuggestions = document.querySelector("#stationSuggestions");

let routes = loadRoutes().map(normalizeSavedRoute);
saveRoutes();

function loadRoutes() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) ?? [];
  } catch {
    return [];
  }
}

function saveRoutes() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(routes));
}

function showToast(message) {
  appToast.textContent = message;
  appToast.classList.add("show");
  window.clearTimeout(showToast.timeout);
  showToast.timeout = window.setTimeout(() => appToast.classList.remove("show"), 4000);
}

function showScreen(screenName) {
  for (const screen of screens) {
    const isActive = screen.dataset.screen === screenName;
    screen.hidden = !isActive;
    screen.classList.toggle("active", isActive);
  }

  for (const button of tabButtons) {
    const isActive = button.dataset.targetScreen === screenName;
    button.classList.toggle("active", isActive);
    button.setAttribute("aria-selected", String(isActive));
  }

  window.scrollTo({ top: 0, behavior: "smooth" });
}

function normalizeStationName(value) {
  const trimmed = value.trim().replace(/\s+/g, " ");
  const key = trimmed.toLocaleLowerCase("de-DE");
  if (STATION_ALIASES.has(key)) return STATION_ALIASES.get(key);

  return trimmed
    .split(" ")
    .map((part) => {
      if (part.toLocaleLowerCase("de-DE") === "hbf") return "Hbf";
      if (part.toLocaleLowerCase("de-DE") === "main") return "Main";
      return part.charAt(0).toLocaleUpperCase("de-DE") + part.slice(1);
    })
    .join(" ");
}

function normalizeSavedRoute(route) {
  if (route.type === "ticket") {
    return {
      ...route,
      bookingLink: route.bookingLink ?? route.ticketUrl,
      ticketUrl: route.ticketUrl ?? route.bookingLink,
      currentPrice: Number(route.currentPrice ?? route.lastSeenPrice ?? 0),
    };
  }

  const normalized = {
    ...route,
    from: normalizeStationName(route.from ?? ""),
    to: normalizeStationName(route.to ?? ""),
  };
  normalized.bookingLink = createDbBookingLink(normalized);
  return normalized;
}

function parsePrice(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(String(value).replace(",", "."));
  return Number.isFinite(number) ? number : null;
}

function parseDbTicketUrl(rawUrl) {
  const url = new URL(rawUrl);
  const hash = url.hash.startsWith("#") ? url.hash.slice(1) : url.hash;
  const hashParams = new URLSearchParams(hash);
  const searchParams = url.searchParams;
  const param = (key) => hashParams.get(key) ?? searchParams.get(key);
  const departure = param("hd");
  const [date = "", timeWithSeconds = ""] = departure?.split("T") ?? [];

  return {
    from: param("so") || "Selected DB ticket",
    to: param("zo") || "DB booking",
    date,
    time: timeWithSeconds.slice(0, 5),
    price: parsePrice(param("ap")),
    selectedConnectionId: param("gh") ?? param("vbid") ?? null,
  };
}

function setDefaultDateTime() {
  const now = new Date();
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const year = tomorrow.getFullYear();
  const month = String(tomorrow.getMonth() + 1).padStart(2, "0");
  const day = String(tomorrow.getDate()).padStart(2, "0");
  formFields.date.value = `${year}-${month}-${day}`;
  formFields.time.value = "09:00";
}

function updateNotificationStatus() {
  if (!("Notification" in window)) {
    notificationStatus.textContent = "Notifications unavailable";
    notificationStatus.classList.remove("ready");
    return;
  }

  if (Notification.permission === "granted") {
    notificationStatus.textContent = "Notifications active";
    notificationStatus.classList.add("ready");
    return;
  }

  if (Notification.permission === "denied") {
    notificationStatus.textContent = "Notifications blocked";
    notificationStatus.classList.remove("ready");
    return;
  }

  notificationStatus.textContent = "Notifications idle";
  notificationStatus.classList.remove("ready");
}

async function requestNotifications() {
  if (!("Notification" in window)) return false;
  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied") return false;

  const permission = await Notification.requestPermission();
  updateNotificationStatus();
  return permission === "granted";
}

function createDbBookingLink(route) {
  const start = route.fromStation ?? STATIONS.get(route.from);
  const destination = route.toStation ?? STATIONS.get(route.to);
  const travellers = Number(route.travellers ?? 1);
  const bahnCard = normalizeBahnCard(route.bahnCard ?? "none");

  if (!start || !destination) {
    const fallbackParams = new URLSearchParams({
      so: route.from,
      zo: route.to,
      hd: `${route.date}T${route.time}:00`,
      r: createDbTravellerParam(travellers, bahnCard),
      s: "true",
    });

    return `https://www.bahn.de/buchung/fahrplan/suche#${fallbackParams.toString()}`;
  }

  const params = new URLSearchParams({
    sts: "true",
    so: route.from,
    zo: route.to,
    kl: bahnCard.classParam,
    r: createDbTravellerParam(travellers, bahnCard),
    soid: start.id ?? createDbStationId(route.from, start),
    zoid: destination.id ?? createDbStationId(route.to, destination),
    sot: start.type ?? "ST",
    zot: destination.type ?? "ST",
    soei: start.eva,
    zoei: destination.eva,
    hd: `${route.date}T${route.time}:00`,
    hza: "D",
    ar: "false",
    s: "true",
    d: "false",
    hz: "[]",
    fm: "false",
    bp: "false",
  });

  return `https://www.bahn.de/buchung/fahrplan/suche#${params.toString()}`;
}

function formatDbDate(dateValue) {
  const [year, month, day] = dateValue.split("-");
  return `${day}.${month}.${year.slice(2)}`;
}

function createDbStationId(name, station) {
  return `A=1@O=${name}@X=${station.x}@Y=${station.y}@U=80@L=${station.eva}@B=1@`;
}

function normalizeBahnCard(value) {
  const [discount, firstClass] = String(value).split("-");
  const hasBahnCard = discount === "25" || discount === "50";

  return {
    value,
    discount: hasBahnCard ? discount : null,
    discountId: hasBahnCard ? (discount === "25" ? "1" : "2") : "16",
    art: hasBahnCard ? `BAHNCARD${discount}` : "KEINE_ERMAESSIGUNG",
    klasse: firstClass === "first" ? "KLASSE_1" : hasBahnCard ? "KLASSE_2" : "KLASSENLOS",
    classParam: firstClass === "first" ? "1" : "2",
    label: hasBahnCard ? `BahnCard ${discount}${firstClass === "first" ? ", 1st" : ", 2nd"}` : "No BahnCard",
  };
}

function createDbTravellerParam(travellers, bahnCard) {
  const adultTypeId = "13";
  return `${adultTypeId}:${bahnCard.discountId}:${bahnCard.klasse}:${travellers}`;
}

async function resolveStation(rawValue) {
  const normalizedName = normalizeStationName(rawValue);

  try {
    const params = new URLSearchParams({
      suchbegriff: rawValue.trim(),
      typ: "ALL",
      limit: "5",
    });
    const response = await fetch(`https://www.bahn.de/web/api/reiseloesung/orte?${params.toString()}`);
    if (!response.ok) throw new Error("Station lookup failed");

    const matches = await response.json();
    const station = matches.find((match) => match.type === "ST") ?? matches[0];

    if (station?.name && station?.id && station?.extId) {
      return {
        name: station.name,
        station: {
          eva: station.extId,
          id: station.id,
          type: station.type,
          x: String(Math.round(Number(station.lon) * 1_000_000)),
          y: String(Math.round(Number(station.lat) * 1_000_000)),
        },
      };
    }
  } catch {
    // Fall back to the local station map when DB lookup is unavailable.
  }

  return {
    name: normalizedName,
    station: STATIONS.get(normalizedName),
  };
}

async function findStations(query) {
  if (query.trim().length < 2) return [];

  try {
    const params = new URLSearchParams({
      suchbegriff: query.trim(),
      typ: "ALL",
      limit: "12",
    });
    const response = await fetch(`https://www.bahn.de/web/api/reiseloesung/orte?${params.toString()}`);
    if (!response.ok) throw new Error("Station lookup failed");

    const matches = await response.json();
    return matches
      .filter((match) => match.type === "ST" && match.name)
      .sort((a, b) => Number(b.products?.includes("ICE")) - Number(a.products?.includes("ICE")));
  } catch {
    return [];
  }
}

function updateStationDatalist(stations) {
  const existingValues = new Set([...stationSuggestions.querySelectorAll("option")].map((option) => option.value));

  for (const station of stations) {
    if (existingValues.has(station.name)) continue;

    const option = document.createElement("option");
    option.value = station.name;
    option.label = station.products?.includes("ICE") ? "ICE station" : "DB station";
    stationSuggestions.append(option);
    existingValues.add(station.name);
  }
}

function debounce(callback, wait = 250) {
  let timer;

  return (...args) => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => callback(...args), wait);
  };
}

function routeDeparture(route) {
  if (route.type === "ticket" && (!route.date || !route.time)) return new Date(Date.now() + 24 * 60 * 60 * 1000);
  return new Date(`${route.date}T${route.time || "00:00"}:00`);
}

function stableSeed(route) {
  const text = `${route.from}|${route.to}|${route.date}|${route.time}`;
  let hash = 0;

  for (let index = 0; index < text.length; index += 1) {
    hash = (hash << 5) - hash + text.charCodeAt(index);
    hash |= 0;
  }

  return Math.abs(hash);
}

function estimatePrice(route) {
  const departure = routeDeparture(route).getTime();
  const hoursUntilDeparture = (departure - Date.now()) / 3_600_000;
  const base = 18 + (stableSeed(route) % 62);
  const lastMinuteDip = hoursUntilDeparture > 0 && hoursUntilDeparture <= Number(route.windowHours) ? 12 : 0;
  const demandBump = Math.max(0, 18 - Math.round(hoursUntilDeparture / 8));
  return Math.max(9, base + demandBump - lastMinuteDip);
}

function getRouteState(route) {
  if (route.type === "ticket") {
    const price = Number(route.currentPrice ?? route.lastSeenPrice ?? 0);
    const hoursUntilDeparture = (routeDeparture(route).getTime() - Date.now()) / 3_600_000;
    const isLastMinute = hoursUntilDeparture > 0 && hoursUntilDeparture <= Number(route.windowHours ?? 24);
    const isCheapEnough = price > 0 && price <= Number(route.threshold);
    const shouldAlert = route.active && isCheapEnough;
    const isPast = hoursUntilDeparture <= 0;

    return { price, hoursUntilDeparture, isLastMinute, isCheapEnough, shouldAlert, isPast };
  }

  const price = estimatePrice(route);
  const hoursUntilDeparture = (routeDeparture(route).getTime() - Date.now()) / 3_600_000;
  const isLastMinute = hoursUntilDeparture > 0 && hoursUntilDeparture <= Number(route.windowHours);
  const isCheapEnough = price <= Number(route.threshold);
  const shouldAlert = route.active && isLastMinute && isCheapEnough;
  const isPast = hoursUntilDeparture <= 0;

  return { price, hoursUntilDeparture, isLastMinute, isCheapEnough, shouldAlert, isPast };
}

function formatDate(route) {
  if (route.type === "ticket" && (!route.date || !route.time)) return "Exact DB ticket link";

  const date = routeDeparture(route);
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatTimeStamp(value) {
  if (!value) return "Not checked yet";

  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(value));
}

function renderRoutes() {
  savedRoutes.innerHTML = "";

  if (routes.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "No watched routes yet. Activate a notification to save one here.";
    savedRoutes.append(empty);
    return;
  }

  for (const route of routes) {
    const state = getRouteState(route);
    const card = template.content.firstElementChild.cloneNode(true);
    const priceChip = card.querySelector(".price-chip");

    card.dataset.id = route.id;
    card.querySelector(".route-name").textContent =
      route.type === "ticket" ? `Exact ticket: ${route.from} → ${route.to}` : `${route.from} → ${route.to}`;
    card.querySelector(".route-date").textContent = formatDate(route);
    const feedback = document.createElement("p");
    feedback.className = "route-feedback";
    feedback.textContent = `Last checked: ${formatTimeStamp(route.lastCheckedAt)}`;
    card.querySelector(".route-date").after(feedback);
    card.querySelector(".target-price").textContent = `€${route.threshold}`;
    const currentPrice = card.querySelector(".watch-data div").cloneNode(true);
    currentPrice.querySelector("dt").textContent = "Current";
    currentPrice.querySelector("dd").textContent = state.price > 0 ? `€${state.price}` : "Add price";
    card.querySelector(".watch-data div").after(currentPrice);
    const travellerData = card.querySelector(".watch-data div").cloneNode(true);
    travellerData.querySelector("dt").textContent = "Travellers";
    travellerData.querySelector("dd").textContent = route.type === "ticket" ? "Exact" : `${route.travellers ?? 1}`;
    currentPrice.after(travellerData);
    const bahnCardData = card.querySelector(".watch-data div").cloneNode(true);
    bahnCardData.querySelector("dt").textContent = "BahnCard";
    bahnCardData.querySelector("dd").textContent =
      route.type === "ticket" ? "From DB URL" : normalizeBahnCard(route.bahnCard ?? "none").label;
    travellerData.after(bahnCardData);
    card.querySelector(".watch-status").textContent = state.isPast
      ? "Departed"
      : state.shouldAlert
        ? route.type === "ticket"
          ? "Below target"
          : "Last-minute price"
        : state.isLastMinute
          ? "Watching price"
          : "Waiting";

    priceChip.textContent = route.type === "ticket"
      ? state.price > 0
        ? `Ticket €${state.price}`
        : "Ticket"
      : `Est. €${state.price}`;
    priceChip.classList.toggle("good", state.shouldAlert);
    priceChip.classList.toggle("watch", !state.shouldAlert && state.isLastMinute);

    const bookingLink = card.querySelector(".booking-link");
    bookingLink.href = route.bookingLink;
    bookingLink.textContent = route.bookingLink;

    card.querySelector(".check-route").addEventListener("click", () => checkRoute(route.id, true));
    const updateButton = card.querySelector(".update-price");
    if (route.type === "ticket") {
      updateButton.addEventListener("click", () => updateRoutePrice(route.id));
    } else {
      updateButton.hidden = true;
    }
    card.querySelector(".test-alert").addEventListener("click", () => {
      sendRouteNotification(route, state.price, true);
      const priceLabel = route.type === "ticket" ? "ticket price" : "estimated price";
      showToast(`Test alert for ${route.from} → ${route.to}: ${priceLabel} €${state.price}.`);
    });
    card.querySelector(".delete-route").addEventListener("click", () => {
      routes = routes.filter((savedRoute) => savedRoute.id !== route.id);
      saveRoutes();
      renderRoutes();
    });

    savedRoutes.append(card);
  }
}

function sendRouteNotification(route, price, isTest = false) {
  if (!("Notification" in window) || Notification.permission !== "granted") {
    if (isTest) {
      showToast("Browser notifications are blocked, so I showed this in-app test alert instead.");
    }
    return;
  }

  const prefix = isTest ? "Test alert" : route.type === "ticket" ? "Exact ticket price" : "Last-minute fare estimate";
  const notification = new Notification(`${prefix}: €${price}`, {
    body: `${route.from} → ${route.to} on ${formatDate(route)}. Open the saved DB link to book.`,
    tag: route.id,
  });

  notification.onclick = () => {
    window.open(route.bookingLink, "_blank", "noopener,noreferrer");
  };
}

function checkRoute(routeId, forceNotify = false) {
  const route = routes.find((savedRoute) => savedRoute.id === routeId);
  if (!route) return;

  const state = getRouteState(route);
  route.lastCheckedAt = new Date().toISOString();
  route.lastSeenPrice = state.price;

  if (forceNotify) {
    if (route.type === "ticket") {
      window.open(route.bookingLink, "_blank", "noopener,noreferrer");
      showToast("Opened the exact DB ticket link. Update the price here after checking DB.");
    } else {
      showToast(`${route.from} → ${route.to} checked. Current estimate: €${state.price}.`);
    }
  }

  if (state.shouldAlert && (forceNotify || route.lastNotifiedPrice !== state.price)) {
    sendRouteNotification(route, state.price);
    route.lastNotifiedPrice = state.price;
    route.lastNotifiedAt = new Date().toISOString();
  }

  saveRoutes();
  renderRoutes();
}

function updateRoutePrice(routeId) {
  const route = routes.find((savedRoute) => savedRoute.id === routeId);
  if (!route) return;

  const entered = window.prompt("Enter the current DB price for this saved ticket:", route.currentPrice || route.lastSeenPrice || "");
  const price = parsePrice(entered);
  if (price === null) return;

  route.currentPrice = price;
  route.lastSeenPrice = price;
  route.lastCheckedAt = new Date().toISOString();

  const state = getRouteState(route);
  if (state.shouldAlert) {
    sendRouteNotification(route, price);
    showToast(`${route.from} → ${route.to} is below target at €${price}.`);
  } else {
    showToast(`${route.from} → ${route.to} updated to €${price}.`);
  }

  saveRoutes();
  renderRoutes();
}

function checkAllRoutes(forceNotify = false) {
  for (const route of routes) {
    checkRoute(route.id, forceNotify);
  }
}

routeForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const enabled = await requestNotifications();
  const from = await resolveStation(formFields.from.value);
  const to = await resolveStation(formFields.to.value);
  const route = {
    id: crypto.randomUUID(),
    from: from.name,
    to: to.name,
    fromStation: from.station,
    toStation: to.station,
    date: formFields.date.value,
    time: formFields.time.value,
    threshold: Number(formFields.threshold.value),
    windowHours: Number(formFields.windowHours.value),
    travellers: Number(formFields.travellers.value),
    bahnCard: formFields.bahnCard.value,
    active: true,
    createdAt: new Date().toISOString(),
  };

  route.bookingLink = createDbBookingLink(route);
  route.notificationEnabledAtActivation = enabled;
  routes = [route, ...routes];
  saveRoutes();
  checkRoute(route.id, true);
  showScreen("saved");
  routeForm.reset();
  setDefaultDateTime();
});

ticketForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const enabled = await requestNotifications();
  let parsed;
  try {
    parsed = parseDbTicketUrl(ticketFields.url.value.trim());
  } catch {
    showToast("That does not look like a valid DB ticket URL.");
    return;
  }
  const enteredPrice = parsePrice(ticketFields.currentPrice.value);
  const currentPrice = enteredPrice ?? parsed.price ?? 0;

  const route = {
    id: crypto.randomUUID(),
    type: "ticket",
    from: parsed.from,
    to: parsed.to,
    date: parsed.date,
    time: parsed.time,
    threshold: Number(ticketFields.threshold.value),
    windowHours: 24,
    currentPrice,
    lastSeenPrice: currentPrice,
    bookingLink: ticketFields.url.value.trim(),
    ticketUrl: ticketFields.url.value.trim(),
    selectedConnectionId: parsed.selectedConnectionId,
    active: true,
    createdAt: new Date().toISOString(),
    lastCheckedAt: new Date().toISOString(),
    notificationEnabledAtActivation: enabled,
  };

  routes = [route, ...routes];
  saveRoutes();
  renderRoutes();
  showScreen("saved");
  showToast("Saved exact DB ticket link. Use Check now to reopen it and Update price after checking DB.");
  ticketForm.reset();
});

formFields.from.addEventListener("blur", () => {
  formFields.from.value = normalizeStationName(formFields.from.value);
});

formFields.to.addEventListener("blur", () => {
  formFields.to.value = normalizeStationName(formFields.to.value);
});

sampleButton.addEventListener("click", () => {
  formFields.from.value = "Berlin Hbf";
  formFields.to.value = "München Hbf";
  formFields.threshold.value = "45";
  formFields.windowHours.value = "24";
  formFields.travellers.value = "1";
  formFields.bahnCard.value = "none";
  setDefaultDateTime();
});

const refreshStationSuggestions = debounce(async (event) => {
  updateStationDatalist(await findStations(event.target.value));
});

formFields.from.addEventListener("input", refreshStationSuggestions);
formFields.to.addEventListener("input", refreshStationSuggestions);

checkAllButton.addEventListener("click", () => checkAllRoutes(true));

for (const button of tabButtons) {
  button.addEventListener("click", () => showScreen(button.dataset.targetScreen));
}

setDefaultDateTime();
updateNotificationStatus();
renderRoutes();
setInterval(() => checkAllRoutes(false), CHECK_INTERVAL_MS);
