let scheduleData = null;
let currentIndex = null;

fetch("schedule.json")
  .then(response => response.json())
  .then(data => {
    scheduleData = data;
    initApp();
  });

function initApp() {
  const savedIndex = localStorage.getItem("taz_index");
  const savedDate = localStorage.getItem("taz_date");

  const today = new Date().toISOString().split("T")[0];
  const startDate = new Date(scheduleData.startDate);

  const daysDiff = Math.floor((new Date(today) - startDate) / (1000 * 60 * 60 * 24));
  currentIndex = Math.max(0, daysDiff);

  if (savedDate === today && savedIndex !== null) {
    currentIndex = parseInt(savedIndex);
  }

  render(today);

  document.getElementById("done").addEventListener("click", () => {
    currentIndex = Math.min(currentIndex + 1, scheduleData.schedule.flat().length - 1);
    saveProgress(today);
    render(today);
  });

  document.getElementById("skip").addEventListener("click", () => {
    saveProgress(today);
    render(today);
  });
}

function render(today) {
  document.getElementById("date").textContent = `Today: ${today}`;
  const flatSchedule = scheduleData.schedule.flat();
  const currentLength = flatSchedule[currentIndex] || "Rest";
  document.getElementById("length").textContent = currentLength;
}

function saveProgress(today) {
  localStorage.setItem("taz_index", currentIndex);
  localStorage.setItem("taz_date", today);
}