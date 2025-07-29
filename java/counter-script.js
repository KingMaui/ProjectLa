// Get DOM elements
const container = document.getElementById("trackers-container");
const addBtn = document.getElementById("add-tracker-btn");

// To hold intervals per tracker to clear later
const intervals = {};

/**
 * Create a new tracker card with the given ID.
 * @param {string} id - The unique ID for the tracker.
 */
function createTrackerCard(id) {
    const card = document.createElement("div");
    card.className = "track-card";
    card.dataset.id = id;

    const trackerName = localStorage.getItem(`trackerName_${id}`) || 'New Tracker';

    card.innerHTML = `
        <input type="text" id="tracker-name-${id}" value="${trackerName}" placeholder="Enter tracker name">
        <button class="delete-btn" title="Delete Tracker">✖</button>
        <label>Creation Date: <span id="creation-date-display-${id}"></span></label>
        <div class="counter-reset-container">
            <div id="current-streak-${id}" class="current-streak">Time:</div>
            <div class="reset-section">
                <button id="reset-btn-${id}" class="reset-button">Reset Tracker</button>
                <div id="reset-info-${id}" class="reset-info"></div>
            </div>
        </div>
    `;

    container.appendChild(card);

    // Input field event for saving name on Enter
    const nameInput = document.getElementById(`tracker-name-${id}`);
    nameInput.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
            const newName = nameInput.value;
            localStorage.setItem(`trackerName_${id}`, newName);
        }
    });

    // Delete button event
    const deleteBtn = card.querySelector(".delete-btn");
    deleteBtn.addEventListener("click", () => {
        if (intervals[id]) {
            clearInterval(intervals[id]);
            delete intervals[id];
        }
        localStorage.removeItem(`creationDate_${id}`);
        localStorage.removeItem(`lastResetDate_${id}`);
        localStorage.removeItem(`resetCount_${id}`);
        localStorage.removeItem(`resetTimestamps_${id}`);
        localStorage.removeItem(`trackerName_${id}`);
        card.remove();
    });

    initializeTracker(id);
}

/**
 * Initialize a tracker with the given ID.
 * @param {string} id - The unique ID for the tracker.
 */
function initializeTracker(id) {
    const creationDateKey = `creationDate_${id}`;
    const lastResetKey = `lastResetDate_${id}`;
    const resetCountKey = `resetCount_${id}`;
    const resetTimestampsKey = `resetTimestamps_${id}`;

    // Set initial dates if not present
    const nowISO = new Date().toISOString();
    if (!localStorage.getItem(creationDateKey)) {
        localStorage.setItem(creationDateKey, nowISO);
        localStorage.setItem(lastResetKey, nowISO);
        localStorage.setItem(resetCountKey, "0");
        localStorage.setItem(resetTimestampsKey, JSON.stringify([nowISO]));
    }

    // Display the creation date (permanent)
    const creationDateDisplay = document.getElementById(`creation-date-display-${id}`);
    const creationDate = localStorage.getItem(creationDateKey);
    creationDateDisplay.textContent = new Date(creationDate).toLocaleDateString();

    // Reset button event
    const resetBtn = document.getElementById(`reset-btn-${id}`);
    resetBtn.onclick = () => resetTracker(id);

    updateCount(id);
}

/**
 * Format the duration in milliseconds to a human-readable string.
 * @param {number} ms - The duration in milliseconds.
 * @returns {string} - The formatted duration string.
 */
function formatDuration(ms) {
    const totalSeconds = Math.floor(ms / 1000);
    const days = Math.floor(totalSeconds / (60 * 60 * 24));
    const hours = Math.floor((totalSeconds % (60 * 60 * 24)) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return `${days}d ${hours}h ${minutes}m ${seconds}s`;
}

/**
 * Calculate average time between resets.
 * @param {Array<string>} timestamps - Array of reset timestamps (ISO strings).
 * @returns {number} - Average time in milliseconds.
 */
function calculateAverageResetTime(timestamps) {
    if (timestamps.length <= 1) return 0;

    let totalTime = 0;
    for (let i = 1; i < timestamps.length; i++) {
        const prevTime = new Date(timestamps[i - 1]).getTime();
        const currTime = new Date(timestamps[i]).getTime();
        totalTime += currTime - prevTime;
    }

    return totalTime / (timestamps.length - 1);
}

/**
 * Update the counters for the tracker with the given ID.
 * @param {string} id - The unique ID for the tracker.
 */
function updateCount(id) {
    // Clear previous interval
    if (intervals[id]) clearInterval(intervals[id]);

    const creationDateKey = `creationDate_${id}`;
    const lastResetKey = `lastResetDate_${id}`;
    const resetCountKey = `resetCount_${id}`;
    const resetTimestampsKey = `resetTimestamps_${id}`;

    intervals[id] = setInterval(() => {
        const now = new Date();
        
        // Calculate resettable time
        const lastResetDate = new Date(localStorage.getItem(lastResetKey));
        const currentTime = now - lastResetDate;
        
        // Calculate time since creation (permanent)
        const creationDate = new Date(localStorage.getItem(creationDateKey));
        const timeSinceCreation = now - creationDate;

        // Update resettable time display
        document.getElementById(`current-streak-${id}`).innerText = 
            `Time: ${formatDuration(currentTime)}`;

        // Update reset information
        const resetCount = localStorage.getItem(resetCountKey) || 0;
        const resetTimestamps = JSON.parse(localStorage.getItem(resetTimestampsKey) || '[]');
        const avgResetTime = calculateAverageResetTime(resetTimestamps);

        const resetInfo = document.getElementById(`reset-info-${id}`);
        resetInfo.innerHTML = `
            🔁 Resets: ${resetCount}<br>
            ⏱ Time since creation:<br>
            &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;${formatDuration(timeSinceCreation)}<br>
            ⏳ Avg time between resets:<br>
            &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;${formatDuration(avgResetTime)}
        `;
    }, 1000);
}

/**
 * Reset the tracker's time but keep creation time intact.
 * @param {string} id - The unique ID for the tracker.
 */
function resetTracker(id) {
    const nowISO = new Date().toISOString();
    const lastResetKey = `lastResetDate_${id}`;
    const resetCountKey = `resetCount_${id}`;
    const resetTimestampsKey = `resetTimestamps_${id}`;

    // Update last reset date (this resets the time)
    localStorage.setItem(lastResetKey, nowISO);

    // Increment reset count
    const currentCount = parseInt(localStorage.getItem(resetCountKey) || "0");
    localStorage.setItem(resetCountKey, (currentCount + 1).toString());

    // Add new reset timestamp
    const resetTimestamps = JSON.parse(localStorage.getItem(resetTimestampsKey) || '[]');
    resetTimestamps.push(nowISO);
    localStorage.setItem(resetTimestampsKey, JSON.stringify(resetTimestamps));

    // Update the counters
    updateCount(id);
}

/**
 * Generate a unique tracker ID.
 * @returns {string} - The generated tracker ID.
 */
function generateTrackerId() {
    return Date.now().toString() + Math.floor(Math.random() * 1000);
}

// Add event listener to the "Add New Tracker" button
addBtn.addEventListener("click", () => {
    const newId = generateTrackerId();
    createTrackerCard(newId);
});

/**
 * Load existing trackers from localStorage.
 */
function loadExistingTrackers() {
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith("creationDate_")) {
            const id = key.split("_")[1];
            createTrackerCard(id);
        }
    }
}

// Load existing trackers when the window loads
window.onload = () => {
    loadExistingTrackers();

    if (container.children.length === 0) {
        const defaultId = generateTrackerId();
        createTrackerCard(defaultId);
    }
};
    