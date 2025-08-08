// taz-script.js

const statusEl = document.getElementById("status");
const doneBtn = document.getElementById("done-btn");
const skipBtn = document.getElementById("skip-btn");
const logBox = document.getElementById("log-box");
const editBtn = document.getElementById("edit-btn");
const editForm = document.getElementById("editForm");
const scheduleEditor = document.getElementById("scheduleEditor");
const saveScheduleBtn = document.getElementById("saveSchedule");
const cancelEditBtn = document.getElementById("cancelEdit");
const editStatus = document.getElementById("editStatus");

const STORAGE_KEY = "taz-tracker-index";
const CUSTOM_SCHEDULE_KEY = "taz-custom-schedule"; // For saved edits

let currentIndex;
let scheduleData; // Will hold either default or custom schedule


// Load schedule (check for custom edits first)
async function loadSchedule() {
    try {
        // Check if user has a custom schedule saved
        const customSchedule = localStorage.getItem(CUSTOM_SCHEDULE_KEY);
        if (customSchedule) {
            scheduleData = JSON.parse(customSchedule);
            return;
        }

        // If no custom schedule, load default from JSON
        const res = await fetch("projecttaz/schedule.json");
        scheduleData = await res.json();
    } catch (err) {
        statusEl.textContent = "Error loading schedule.";
        console.error("Load error:", err);
    }
}


// Initialize the app
async function init() {
    await loadSchedule();
    if (!scheduleData) return;

    const startDate = new Date(scheduleData.startDate);
    const schedule = scheduleData.schedule;

    // Calculate current index
    const today = new Date();
    const msPerDay = 1000 * 60 * 60 * 24;
    const daysSinceStart = Math.floor((today - startDate) / msPerDay);

    currentIndex = parseInt(localStorage.getItem(STORAGE_KEY), 10);
    if (isNaN(currentIndex) || currentIndex < 0) currentIndex = daysSinceStart;
    if (currentIndex >= schedule.length) currentIndex = schedule.length - 1;

    updateTracker(currentIndex);
    setupEventListeners();
}


// Update tracker display
function updateTracker(index) {
    const startDate = new Date(scheduleData.startDate);
    const displayDate = new Date(startDate);
    displayDate.setDate(displayDate.getDate() + index);
    statusEl.textContent = `Day ${index + 1} (${displayDate.toDateString()}): ${scheduleData.schedule[index] || "Rest Day"}`;
}


// Log actions
function logAction(status) {
    const now = new Date();
    const timestamp = now.toLocaleString();
    const logEntry = `[${timestamp}] Taz was ${status.toLowerCase()} on ${new Date().toDateString()}`;
    const logItem = document.createElement("div");
    logItem.textContent = logEntry;
    logBox.prepend(logItem);
}


// Setup all event listeners
function setupEventListeners() {
    // Done button
    doneBtn.addEventListener("click", () => {
        logAction("Completed");
        if (currentIndex < scheduleData.schedule.length - 1) currentIndex++;
        localStorage.setItem(STORAGE_KEY, currentIndex);
        updateTracker(currentIndex);
    });

    // Skip button
    skipBtn.addEventListener("click", () => {
        logAction("Skipped");
        updateTracker(currentIndex);
    });

    // Edit schedule button
    editBtn.addEventListener("click", () => {
        // Show current schedule in editor
        scheduleEditor.value = JSON.stringify(scheduleData, null, 2); // Pretty-print JSON
        editForm.style.display = "block";
        editStatus.textContent = "";
    });

    // Cancel edit
    cancelEditBtn.addEventListener("click", () => {
        editForm.style.display = "none";
    });

    // Save edited schedule
    saveScheduleBtn.addEventListener("click", () => {
        try {
            const editedSchedule = JSON.parse(scheduleEditor.value);
            // Validate required fields
            if (!editedSchedule.startDate || !Array.isArray(editedSchedule.schedule)) {
                throw new Error('Missing "startDate" or "schedule" array');
            }
            // Save to localStorage
            localStorage.setItem(CUSTOM_SCHEDULE_KEY, JSON.stringify(editedSchedule));
            // Reload app with new schedule
            scheduleData = editedSchedule;
            currentIndex = 0; // Reset progress (or keep it? Adjust as needed)
            localStorage.setItem(STORAGE_KEY, currentIndex);
            updateTracker(currentIndex);
            editStatus.textContent = "✅ Schedule saved!";
            editStatus.style.color = "var(--secondary-color)";
            setTimeout(() => editForm.style.display = "none", 1500);
        } catch (err) {
            editStatus.textContent = `❌ Invalid: ${err.message}`;
            editStatus.style.color = "var(--danger-color)";
        }
    });
}


// Start the app
init();