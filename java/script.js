const toggleButton = document.querySelector('.toggle-button');
const navbarContent = document.querySelector('.navbar-content');
const searchBar = document.getElementById('search-bar');

// Mobile navbar toggle
if (toggleButton) {
  toggleButton.addEventListener('click', () => {
    navbarContent.classList.toggle('active');
    toggleButton.classList.toggle('active');
  });
}

// ── Apple-style dropdown ──────────────────────────────────────────────
const dropdown = document.querySelector('.nav-dropdown');
if (dropdown) {
  const toggle = dropdown.querySelector('.nav-dropdown-toggle');
  const panel  = dropdown.querySelector('.nav-dropdown-panel');

  // Desktop: hover intent with small delay
  let hoverTimer = null;
  const isMobile = () => window.innerWidth <= 650;

  function openDD()  { dropdown.classList.add('open'); }
  function closeDD() { dropdown.classList.remove('open'); }

  // Click always toggles (works for both mobile and desktop)
  toggle.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    dropdown.classList.toggle('open');
  });

  // Desktop: also respond to hover
  dropdown.addEventListener('mouseenter', () => {
    if (isMobile()) return;
    clearTimeout(hoverTimer);
    openDD();
  });
  dropdown.addEventListener('mouseleave', () => {
    if (isMobile()) return;
    hoverTimer = setTimeout(closeDD, 150);
  });

  // Close on outside click
  document.addEventListener('click', (e) => {
    if (!dropdown.contains(e.target)) closeDD();
  });

  // Close panel items close the mobile menu too
  panel.querySelectorAll('a').forEach(link => {
    link.addEventListener('click', () => {
      closeDD();
      if (isMobile()) {
        navbarContent.classList.remove('active');
      }
    });
  });
}

// Search functionality (only on pages that have a search bar)
if (searchBar) {
  searchBar.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      const searchTerm = searchBar.value.trim().toLowerCase();
      fetch('data/products.json')
        .then(r => r.json())
        .then(products => {
          const filtered = products.filter(p =>
            (p.title || p.name || '').toLowerCase().includes(searchTerm)
          );
          console.log('Filtered products:', filtered);
        })
        .catch(err => console.error('Error fetching products:', err));
    }
  });
}

// Close mobile navbar when clicking a non-Contact link
document.querySelectorAll('.navbar-links a').forEach(link => {
  link.addEventListener('click', () => {
    if (window.innerWidth < 651 && link.id !== 'Contact' && !link.closest('.nav-dropdown')) {
      navbarContent.classList.remove('active');
      toggleButton.classList.remove('active');
    }
  });
});
