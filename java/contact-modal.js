document.addEventListener('DOMContentLoaded', () => {
  const contactButton = document.getElementById('Contact');
  const modalOverlay = document.querySelector('.contact-modal-overlay');
  const closeButton = document.querySelector('.contact-modal-close');
  const navbarContent = document.querySelector('.navbar-content');
  const toggleButton = document.querySelector('.toggle-button');

  if (!contactButton || !modalOverlay) return;

  // Open modal
  contactButton.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    modalOverlay.style.display = 'flex';
    // Keep navbar open on mobile so the modal isn't orphaned
    if (navbarContent) navbarContent.classList.add('active');
  });

  // Close on X button
  if (closeButton) {
    closeButton.addEventListener('click', () => {
      modalOverlay.style.display = 'none';
    });
  }

  // Close on outside click
  modalOverlay.addEventListener('click', (e) => {
    if (e.target === modalOverlay) {
      modalOverlay.style.display = 'none';
    }
  });
});
