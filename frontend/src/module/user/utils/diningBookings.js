const DINING_BOOKINGS_STORAGE_KEY = "userDiningBookings";

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

function parseTime(timeValue = "") {
  const raw = String(timeValue || "").trim();
  if (!raw) return { hours: 0, minutes: 0 };

  const match = raw.match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?$/i);
  if (!match) return { hours: 0, minutes: 0 };

  let hours = Number(match[1] || 0);
  const minutes = Number(match[2] || 0);
  const meridian = (match[3] || "").toUpperCase();

  if (meridian === "PM" && hours < 12) hours += 12;
  if (meridian === "AM" && hours === 12) hours = 0;

  return {
    hours: Number.isFinite(hours) ? hours : 0,
    minutes: Number.isFinite(minutes) ? minutes : 0,
  };
}

function getBookingIdentity(booking = {}) {
  const id = booking.id || booking._id;
  if (id) return String(id);

  const restaurantId =
    booking.restaurantId?._id ||
    booking.restaurantId?.id ||
    booking.restaurantId ||
    "unknown";

  return `${restaurantId}-${booking.date || ""}-${booking.time || ""}-${booking.tableNumber || ""}`;
}

export function normalizeDiningBooking(rawBooking = {}) {
  const restaurant = rawBooking.restaurantId && typeof rawBooking.restaurantId === "object"
    ? rawBooking.restaurantId
    : null;

  const bookingStatus = rawBooking.bookingStatus || rawBooking.status || "Pending";
  const id = String(rawBooking._id || rawBooking.id || getBookingIdentity(rawBooking));

  return {
    ...rawBooking,
    id,
    _id: rawBooking._id || rawBooking.id || id,
    bookingStatus,
    date: rawBooking.date || "",
    time: rawBooking.time || "",
    restaurantId: restaurant?._id || rawBooking.restaurantId || null,
    restaurantName:
      rawBooking.restaurantName ||
      restaurant?.name ||
      rawBooking.restaurant?.name ||
      "Restaurant",
    restaurantSlug:
      rawBooking.restaurantSlug ||
      restaurant?.slug ||
      rawBooking.restaurant?.slug ||
      null,
    restaurantImage:
      rawBooking.restaurantImage ||
      restaurant?.profileImage?.url ||
      restaurant?.profileImage ||
      rawBooking.restaurant?.profileImage?.url ||
      rawBooking.restaurant?.profileImage ||
      null,
  };
}

export function parseBookingDateTime(dateValue, timeValue, referenceDate = new Date()) {
  if (!dateValue) return null;

  const dateText = String(dateValue).trim();
  if (!dateText) return null;

  const now = new Date(referenceDate);
  const base = new Date(now);
  base.setHours(0, 0, 0, 0);

  let parsedDate = null;

  if (/^today$/i.test(dateText)) {
    parsedDate = new Date(base);
  } else if (/^tomorrow$/i.test(dateText)) {
    parsedDate = new Date(base);
    parsedDate.setDate(parsedDate.getDate() + 1);
  } else {
    const withYear = new Date(`${dateText} ${base.getFullYear()}`);
    if (!Number.isNaN(withYear.getTime())) {
      parsedDate = withYear;
    } else {
      const fallback = new Date(dateText);
      if (!Number.isNaN(fallback.getTime())) {
        parsedDate = fallback;
      }
    }
  }

  if (!parsedDate || Number.isNaN(parsedDate.getTime())) return null;

  const { hours, minutes } = parseTime(timeValue);
  parsedDate.setHours(hours, minutes, 0, 0);

  // Handle year rollover for month-day strings around New Year.
  if (!/^today$|^tomorrow$/i.test(dateText) && parsedDate.getTime() < now.getTime() - ONE_DAY_MS) {
    const nextYear = new Date(parsedDate);
    nextYear.setFullYear(nextYear.getFullYear() + 1);
    if (nextYear.getTime() > now.getTime()) {
      parsedDate = nextYear;
    }
  }

  return parsedDate;
}

export function isDiningBookingActive(booking, referenceDate = new Date()) {
  const bookingDateTime = parseBookingDateTime(booking?.date, booking?.time, referenceDate);
  if (!bookingDateTime) return false;
  return bookingDateTime.getTime() >= referenceDate.getTime();
}

export function getActiveDiningBookings(bookings = [], referenceDate = new Date()) {
  return bookings
    .filter((booking) => isDiningBookingActive(booking, referenceDate))
    .sort((a, b) => {
      const aTime = parseBookingDateTime(a?.date, a?.time, referenceDate)?.getTime() || 0;
      const bTime = parseBookingDateTime(b?.date, b?.time, referenceDate)?.getTime() || 0;
      return aTime - bTime;
    });
}

export function mergeDiningBookings(existingBookings = [], incomingBookings = []) {
  const mergedMap = new Map();

  [...existingBookings, ...incomingBookings].forEach((booking) => {
    const normalized = normalizeDiningBooking(booking);
    mergedMap.set(getBookingIdentity(normalized), normalized);
  });

  return Array.from(mergedMap.values()).sort((a, b) => {
    const aTime = new Date(a.createdAt || a.updatedAt || 0).getTime();
    const bTime = new Date(b.createdAt || b.updatedAt || 0).getTime();
    return bTime - aTime;
  });
}

export function readDiningBookings() {
  if (typeof window === "undefined") return [];

  try {
    const raw = localStorage.getItem(DINING_BOOKINGS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(normalizeDiningBooking);
  } catch {
    return [];
  }
}

export function writeDiningBookings(bookings = []) {
  if (typeof window === "undefined") return;

  try {
    localStorage.setItem(
      DINING_BOOKINGS_STORAGE_KEY,
      JSON.stringify((Array.isArray(bookings) ? bookings : []).map(normalizeDiningBooking))
    );
  } catch {
    // ignore storage errors
  }
}
