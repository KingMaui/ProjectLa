const toggleButton = document.querySelector('.toggle-button');
const navbarContent = document.querySelector('.navbar-content');
const searchBar = document.getElementById('search-bar');

// Toggle navbar on mobile
toggleButton.addEventListener('click', () => {
  navbarContent.classList.toggle('active');
  toggleButton.classList.toggle('active');
});

// Search functionality (only on pages that have a search bar)
if (searchBar) {
  searchBar.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      const searchTerm = searchBar.value.trim().toLowerCase();
      fetch('data/products.json')
        .then(response => response.json())
        .then(products => {
          const filteredProducts = products.filter(product => {
            return (product.title || product.name || '').toLowerCase().includes(searchTerm);
          });
          console.log('Filtered products:', filteredProducts);
        })
        .catch(error => console.error('Error fetching products:', error));
    }
  });
}

// Close navbar when clicking a link on mobile (but not Contact)
document.querySelectorAll('.navbar-links a').forEach(link => {
  link.addEventListener('click', () => {
    if (window.innerWidth < 651 && link.id !== 'Contact') {
      navbarContent.classList.remove('active');
      toggleButton.classList.remove('active');
    }
  });
});
