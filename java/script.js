const toggleButton = document.querySelector('.toggle-button');
const navbarContent = document.querySelector('.navbar-content');
const searchBar = document.getElementById('search-bar');

// Toggle navbar on mobile
toggleButton.addEventListener('click', () => {
  navbarContent.classList.toggle('active');
  toggleButton.classList.toggle('active');
});

// Search functionality
searchBar.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    const searchTerm = searchBar.value.trim().toLowerCase();
    console.log('Search term:', searchTerm);
    
    // Fetch products and filter
    fetch('data/products.json')
      .then(response => response.json())
      .then(products => {
        const filteredProducts = products.filter(product => {
          // Adjust based on your JSON structure
          return product.name.toLowerCase().includes(searchTerm);
        });
        
        console.log('Filtered products:', filteredProducts);
        // Add code here to display results on the page
      })
      .catch(error => {
        console.error('Error fetching products:', error);
      });
  }
});

// Close navbar when clicking on a link (mobile)
document.querySelectorAll('.navbar-links a').forEach(link => {
  link.addEventListener('click', () => {
    if (window.innerWidth < 651) {
      navbarContent.classList.remove('active');
      toggleButton.classList.remove('active');
    }
  });
});