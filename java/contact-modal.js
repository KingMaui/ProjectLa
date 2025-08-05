document.addEventListener('DOMContentLoaded', () => {
  const contactButton = document.getElementById('Contact');
  const modalOverlay = document.querySelector('.contact-modal-overlay');
  const closeButton = document.querySelector('.contact-modal-close');
  const contactForm = document.querySelector('.contact-form');
  const navbarContent = document.querySelector('.navbar-content');
  const toggleButton = document.querySelector('.toggle-button');

  // Open modal when contact button is clicked - UPDATED
  contactButton.addEventListener('click', (e) => {
    e.preventDefault(); // Prevent default link behavior
    modalOverlay.style.display = 'flex';
    // Force navbar to stay open
    navbarContent.classList.add('active');
    toggleButton.classList.add('active');
  });

  // Close modal when close button is clicked
  closeButton.addEventListener('click', () => {
    modalOverlay.style.display = 'none';
  });

  // Close modal when clicking outside the content
  modalOverlay.addEventListener('click', (e) => {
    if (e.target === modalOverlay) {
      modalOverlay.style.display = 'none';
    }
  });

  // Handle form submission
  contactForm.addEventListener('submit', (e) => {
    e.preventDefault();
    alert('Message sent successfully!');
    modalOverlay.style.display = 'none';
    contactForm.reset();
  });
});