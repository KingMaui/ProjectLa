// taz-script.js

// Get elements from HTML (matches IDs in taz.html)
const dayStatus = document.getElementById("dayStatus");
const logBox = document.getElementById("logBox");

const STORAGE_KEY = "taz-tracker-index";
let currentIndex; // Track current position in schedule
let scheduleData; // Store loaded schedule data

// Load schedule from JSON
fetch("projecttaz/schedule.json")
  .then((res) => res.json())
  .then((data) => {
    scheduleData = data;
    const startDate = new Date(data.startDate);
    const schedule = data.schedule;

    // Calculate current day based on start date
    const today = new Date();
    const msPerDay = 1000 * 60 * 60 * 24;
    const daysSinceStart = Math.floor((today - startDate) / msPerDay);

    // Get saved progress from localStorage (or use calculated day)
    currentIndex = parseInt(localStorage.getItem(STORAGE_KEY), 10);
    if (isNaN(currentIndex) || currentIndex < 0) {
      currentIndex = Math.max(0, daysSinceStart); // Ensure valid index
    }
    // Don't go beyond the schedule length
    if (currentIndex >= schedule.length) {
      currentIndex = schedule.length - 1;
    }

    updateStatus(); // Show initial status
  })
  .catch((err) => {
    dayStatus.textContent = "Failed to load schedule.";
    console.error("Error loading schedule:", err);
  });

// Mark current day as completed
function markDone() {
  if (!scheduleData) return; // Wait for schedule to load

  const currentDayDate = getCurrentDayDate();
  logAction(`Taz completed on ${currentDayDate.toDateString()}`);
  
  // Move to next day (if not at end of schedule)
  if (currentIndex < scheduleData.schedule.length - 1) {
    currentIndex++;
    localStorage.setItem(STORAGE_KEY, currentIndex);
    updateStatus();
  }
}

// Skip current day
function skipDay() {
  if (!scheduleData) return; // Wait for schedule to load

  const currentDayDate = getCurrentDayDate();
  logAction(`Taz skipped on ${currentDayDate.toDateString()}`);
  // Stay on current day but log the skip
  updateStatus();
}

// Update the displayed status (current day info)
function updateStatus() {
  if (!scheduleData) return;

  const startDate = new Date(scheduleData.startDate);
  const currentDayDate = new Date(startDate);
  currentDayDate.setDate(startDate.getDate() + currentIndex);

  const dayNumber = currentIndex + 1;
  const activity = scheduleData.schedule[currentIndex] || "Rest Day";
  
  dayStatus.textContent = `Day ${dayNumber} (${currentDayDate.toDateString()}): ${activity}`;
}

// Log an action with timestamp
function logAction(message) {
  const now = new Date();
  const timestamp = now.toLocaleString(); // e.g., "9/5/2023, 3:45:00 PM"
  const logEntry = `${timestamp} — ${message}`;

  // Create log element and add to top of log box
  const logItem = document.createElement("div");
  logItem.style.padding = "8px";
  logItem.style.borderBottom = "1px solid #eee";
  logItem.textContent = logEntry;
  logBox.prepend(logItem); // Add new logs to the top
}

// Helper: Get date of current tracked day
function getCurrentDayDate() {
  const startDate = new Date(scheduleData.startDate);
  const currentDayDate = new Date(startDate);
  currentDayDate.setDate(startDate.getDate() + currentIndex);
  return currentDayDate;
}