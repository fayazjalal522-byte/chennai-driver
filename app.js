// ================================================================
// DRIVEEASE — CONFIGURATION
// ================================================================
const API_URL = 'https://script.google.com/macros/s/AKfycbxhFxAHZ-Cg5Lhmkr4ZfFjC0iBZfwEAEQixsFX-iOs3v-bi2BqZ6rpk1C1vFfkiFjcPMw/exec';
const BUSINESS_PHONE = '917845199014';
const OWNER_UPI = 'chennaiactingdriver@ybl';
const COMMISSION_RATE = 0.10;

// ---------------- API ----------------
async function apiCall(payload) {
  const formData = new URLSearchParams();
  formData.append('data', JSON.stringify(payload));
  const res = await fetch(API_URL, {
    method: 'POST',
    body: formData
  });
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch (e) {
    return { ok: false, error: 'Invalid response: ' + text.substring(0, 200) };
  }
}

async function createBooking(booking) { return apiCall({ action: 'book', ...booking }); }
async function listBookings() { const d = await apiCall({ action: 'list' }); return d.bookings || []; }
async function updateBooking(id, status, driver) { return apiCall({ action: 'update', id, status, driver }); }
async function submitRating(id, rating, review) { return apiCall({ action: 'rate', id, rating, review }); }
async function createUPIQR(amount, bookingId) { return apiCall({ action: 'createQR', amount, bookingId }); }
async function getStats() { return apiCall({ action: 'stats' }); }
async function getLeaderboard() { return apiCall({ action: 'leaderboard' }); }
async function sendChatMessage(bookingId, sender, message) { return apiCall({ action: 'sendMessage', bookingId, sender, message }); }
async function getChatMessages(bookingId) { const d = await apiCall({ action: 'getMessages', bookingId }); return d.messages || []; }
async function getDriverLocation(bookingId) { return apiCall({ action: 'getLocation', bookingId }); }
async function markCommissionPaid(driver, amount) { return apiCall({ action: 'commissionPaid', driver, amount }); }

// Ride timer + OTP
async function startRide(id) { return apiCall({ action: 'startRide', id }); }
async function getOTP(id) { return apiCall({ action: 'getOTP', id }); }
async function verifyOTP(id, otp) { return apiCall({ action: 'verifyOTP', id, otp }); }
async function resendOTP(id) { return apiCall({ action: 'resendOTP', id }); }
async function endRide(id) { return apiCall({ action: 'endRide', id }); }
async function markNoShow(id) { return apiCall({ action: 'noShow', id }); }

// ---------------- COMMISSION HELPERS ----------------
function isToday(dateStr) {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
}

function getTodayCommissionForDriver(driverName, allJobs) {
  const todayCompleted = allJobs.filter(j => j.driver === driverName && j.status === 'COMPLETED' && isToday(j.timestamp));
  const totalEarned = todayCompleted.reduce((s, j) => s + Number(j.fare || 0), 0);
  const commission = Math.round(totalEarned * COMMISSION_RATE);
  return { rides: todayCompleted.length, totalEarned, commission, keeps: totalEarned - commission, jobs: todayCompleted };
}

// ---------------- TOAST ----------------
function showToast(msg) {
  let t = document.getElementById('toast');
  if (!t) { t = document.createElement('div'); t.id = 'toast'; t.className = 'toast'; document.body.appendChild(t); }
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2500);
}

// ---------------- GEOCODING ----------------
const geocodeCache = {};
async function geocodeArea(name) {
  if (geocodeCache[name]) return geocodeCache[name];
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(name + ', Chennai')}`;
    const res = await fetch(url, { headers: { 'User-Agent': 'DriveEaseApp/1.0' } });
    const data = await res.json();
    if (data.length > 0) {
      const coords = { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
      geocodeCache[name] = coords;
      return coords;
    }
  } catch (e) {}
  return null;
}

// ---------------- GPS AUTO-DETECT ----------------
const CHENNAI_AREAS = [
  { name: 'Adyar', lat: 13.0012, lng: 80.2565 },
  { name: 'Anna Nagar', lat: 13.0850, lng: 80.2101 },
  { name: 'T. Nagar', lat: 13.0400, lng: 80.2337 },
  { name: 'Velachery', lat: 12.9791, lng: 80.2210 },
  { name: 'OMR / Sholinganallur', lat: 12.9010, lng: 80.2279 },
  { name: 'Tambaram', lat: 12.9249, lng: 80.1000 },
  { name: 'Porur', lat: 13.0359, lng: 80.1560 },
  { name: 'Mylapore', lat: 13.0339, lng: 80.2692 },
  { name: 'Egmore', lat: 13.0732, lng: 80.2609 },
  { name: 'Central Railway Station', lat: 13.0827, lng: 80.2755 },
  { name: 'Chennai Airport', lat: 12.9941, lng: 80.1709 },
  { name: 'Besant Nagar', lat: 13.0002, lng: 80.2668 },
  { name: 'Chromepet', lat: 12.9516, lng: 80.1462 },
  { name: 'Guindy', lat: 13.0067, lng: 80.2206 }
];

function detectAreaFromCoords(lat, lng) {
  let closest = null, minDist = Infinity;
  for (const area of CHENNAI_AREAS) {
    const dist = Math.sqrt(Math.pow(area.lat - lat, 2) + Math.pow(area.lng - lng, 2));
    if (dist < minDist) { minDist = dist; closest = area; }
  }
  return minDist < 0.05 ? closest.name : 'Other';
}

async function autoDetectArea() {
  return new Promise((resolve) => {
    if (!navigator.geolocation) { resolve({ ok: false, reason: 'not_supported' }); return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ ok: true, area: detectAreaFromCoords(pos.coords.latitude, pos.coords.longitude) }),
      (err) => resolve({ ok: false, reason: err.code === 1 ? 'denied' : 'failed' }),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  });
}

// ---------------- DRIVER AVAILABILITY ----------------
function getDriverStatus() { return localStorage.getItem('driverStatus') || 'offline'; }
function setDriverStatus(status) {
  localStorage.setItem('driverStatus', status);
  apiCall({ action: 'updateStatus', driver: localStorage.getItem('driverName') || '', status }).catch(() => {});
}

// ---------------- LOCATION SHARING ----------------
let locationWatchId = null, locationInterval = null;

async function shareDriverLocation(bookingId, driverName) {
  if (!navigator.geolocation) { showToast('GPS not supported'); return false; }
  if (locationWatchId !== null) navigator.geolocation.clearWatch(locationWatchId);
  locationWatchId = navigator.geolocation.watchPosition(
    async (pos) => {
      await apiCall({ action: 'updateLocation', bookingId, driver: driverName, lat: pos.coords.latitude, lng: pos.coords.longitude });
    },
    () => {}, { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 }
  );
  locationInterval = setInterval(() => {
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        await apiCall({ action: 'updateLocation', bookingId, driver: driverName, lat: pos.coords.latitude, lng: pos.coords.longitude });
      }, () => {}, { enableHighAccuracy: true });
  }, 15000);
  return true;
}

function stopSharingLocation() {
  if (locationWatchId !== null) { navigator.geolocation.clearWatch(locationWatchId); locationWatchId = null; }
  if (locationInterval) { clearInterval(locationInterval); locationInterval = null; }
}

// ---------------- TIME HELPERS ----------------
function formatDuration(mins) {
  if (!mins) return '0 min';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} hr`;
  return `${h} hr ${m} min`;
}

function getElapsedTime(startTimeStr) {
  if (!startTimeStr) return '00:00:00';
  const start = new Date(startTimeStr).getTime();
  const diff = Math.floor((Date.now() - start) / 1000);
  const h = Math.floor(diff / 3600).toString().padStart(2, '0');
  const m = Math.floor((diff % 3600) / 60).toString().padStart(2, '0');
  const s = (diff % 60).toString().padStart(2, '0');
  return `${h}:${m}:${s}`;
}

// ================================================================
// DRIVER LOGIN / PIN / BLACKLIST / COMPLAINTS
// ================================================================

async function driverLogin(phone, pin) {
  return apiCall({ action: 'driverLogin', phone, pin });
}

async function resetPin(driverId) {
  return apiCall({ action: 'resetPin', driverId });
}

async function setNewPin(phone, newPin) {
  return apiCall({ action: 'setNewPin', phone, newPin });
}

async function blacklistDriver(driverId, blacklist) {
  return apiCall({ action: 'blacklistDriver', driverId, blacklist });
}

async function submitComplaint(complaint) {
  return apiCall({ action: 'submitComplaint', ...complaint });
}

async function getComplaintList() {
  const d = await apiCall({ action: 'complaintList' });
  return d.complaints || [];
}

async function resolveComplaint(complaintId, status) {
  return apiCall({ action: 'complaintResolve', complaintId, status });
}

function getLoggedInDriver() {
  const d = localStorage.getItem('loggedDriver');
  return d ? JSON.parse(d) : null;
}

function saveLoggedInDriver(driver) {
  localStorage.setItem('loggedDriver', JSON.stringify(driver));
  localStorage.setItem('driverName', driver.name);
}

function logoutDriver() {
  localStorage.removeItem('loggedDriver');
  localStorage.removeItem('driverName');
  localStorage.removeItem('driverStatus');
}
