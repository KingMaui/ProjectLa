let schedule = [];
let startDate = localStorage.getItem("startDate") || new Date().toISOString().split("T")[0];
let skippedDays = parseInt(localStorage.getItem("skippedDays") || "0");

fetch('projecttaz/schedule.json')
  .then(response => response.json())
  .then(data => {
    schedule = data;
    updateStatus();
  });

function updateStatus() {
    const today = new Date();
    const start = new Date(startDate);
    const dayDiff = Math.floor((today - start) / (1000 * 60 * 60 * 24));
    const currentIndex = Math.min(dayDiff - skippedDays, schedule.length - 1);
    const currentValue = schedule[currentIndex] || "🌙";
    document.getElementById("status").innerText = `Today's Routine: ${currentValue}`;
}

function markDone() {
    updateStatus(); // keeps current progress
}

function skipDay() {
    skippedDays++;
    localStorage.setItem("skippedDays", skippedDays);
    updateStatus(); // keeps the same index
}