document.addEventListener('DOMContentLoaded', () => {

  const contactButton = document.getElementById('Contact');
  const modalOverlay = document.querySelector('.contact-modal-overlay');
  const modalContent = document.querySelector('.contact-modal-content');
  const closeButton = document.querySelector('.contact-modal-close');

  contactButton.addEventListener('click', (e) => {
    e.preventDefault(); 
    modalOverlay.style.display = 'flex';
    document.body.style.overflow = 'hidden';
  });

  closeButton.addEventListener('click', closeModal);

  modalOverlay.addEventListener('click', (e) => {
    if (e.target === modalOverlay) {
      closeModal();
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modalOverlay.style.display === 'flex') {
      closeModal();
    }
  });

  function closeModal() {
    modalOverlay.style.display = 'none';
    document.body.style.overflow = ''; // Re-enable scrolling
  }
});