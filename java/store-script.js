document.addEventListener('DOMContentLoaded', () => {
    const productsContainer = document.querySelector('.products');
    const searchBar = document.getElementById('search-bar');
    let allProducts = [];

    // Fetch and load products from JSON
    fetch('data/products.json')
        .then(response => {
            if (!response.ok) {
                throw new Error('Network response was not ok');
            }
            return response.json();
        })
        .then(products => {
            allProducts = products; // Store all products for filtering
            displayProducts(products); // Initial display
        })
        .catch(error => console.error('Error loading products:', error));

    // Display products in the UI
    function displayProducts(products) {
        // Clear existing content
        productsContainer.innerHTML = '';

        if (products.length === 0) {
            productsContainer.innerHTML = '<p>No products found</p>';
            return;
        }

        // Generate HTML for each product
        products.forEach(product => {
            const productCard = document.createElement('div');
            productCard.className = 'product-card';
            productCard.innerHTML = `
                <img src="${product.imgUrl}" alt="${product.title}" class="product-image">
                <div class="product-info">
                    <h3 class="product-title">${product.title}</h3>
                    <p class="product-brand">${product.brand} • ${product.category}</p>
                    <p class="product-roast">Roast: ${product.Roast}</p>
                    <p class="product-price">$${product["sale price"] > 0 ? product["sale price"] : product.price.toFixed(2)}</p>
                    ${product["sale price"] > 0 ? `<p class="original-price">$${product.price.toFixed(2)}</p>` : ''}
                    <p class="product-stock">${product.stock}</p>
                    <p class="product-description">${product.Description.substring(0, 100)}${product.Description.length > 100 ? '...' : ''}</p>
                </div>
            `;
            
            // Add click event to navigate to product detail page
            // This passes the product ID through the URL
            productCard.addEventListener('click', () => {
                window.location.href = `product.html?id=${product.id}`;
            });
            
            productsContainer.appendChild(productCard);
        });
    }

    // Search functionality
    searchBar.addEventListener('input', (e) => {
        const searchTerm = e.target.value.toLowerCase().trim();
        
        // Filter products based on search term
        const filteredProducts = allProducts.filter(product => {
            // Search in title, brand, description, category, or regions
            return (
                product.title.toLowerCase().includes(searchTerm) ||
                product.brand.toLowerCase().includes(searchTerm) ||
                product.Description.toLowerCase().includes(searchTerm) ||
                product.category.toLowerCase().includes(searchTerm) ||
                (product.Regions && product.Regions.toLowerCase().includes(searchTerm))
            );
        });

        displayProducts(filteredProducts);
    });
});
