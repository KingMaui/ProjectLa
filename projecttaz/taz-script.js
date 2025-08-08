// taz-script.js

const trackerTitle = document.getElementById("tracker-title");
const trackerDate = document.getElementById("tracker-date");
const trackerLength = document.getElementById("tracker-length");
const doneBtn = document.getElementById("done-btn");
const skipBtn = document.getElementById("skip-btn");

const STORAGE_KEY = "taz-tracker-index";

fetch("projecttaz/schedule.json")
  .then((res) => res.json())
  .then((data) => {
    const startDate = new Date(data.startDate);
    const schedule = data.schedule;

    const today = new Date();
    const msPerDay = 1000 * 60 * 60 * 24;
    const daysSinceStart = Math.floor((today - startDate) / msPerDay);

    let currentIndex = parseInt(localStorage.getItem(STORAGE_KEY), 10);
    if (isNaN(currentIndex)) currentIndex = daysSinceStart;

    if (currentIndex < 0) currentIndex = 0;
    if (currentIndex >= schedule.length) currentIndex = schedule.length - 1;

    updateTracker(currentIndex);

    doneBtn.addEventListener("click", () => {
      if (currentIndex < schedule.length - 1) currentIndex++;
      localStorage.setItem(STORAGE_KEY, currentIndex);
      updateTracker(currentIndex);
    });

    skipBtn.addEventListener("click", () => {
      // keep same index, just refresh display
      updateTracker(currentIndex);
    });

    function updateTracker(index) {
      const displayDate = new Date(startDate);
      displayDate.setDate(displayDate.getDate() + index);
      trackerDate.textContent = `Day ${index + 1} - ${displayDate.toDateString()}`;
      trackerLength.textContent = schedule[index] || "Rest Day";
    }
  })
  .catch((err) => {
    trackerLength.textContent = "Failed to load schedule.";
    console.error(err);
  });
