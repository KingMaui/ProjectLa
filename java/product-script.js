document.addEventListener('DOMContentLoaded', () => {
    const productDetailContainer = document.getElementById('product-detail');
    const errorMessage = document.getElementById('error-message');
    
    // Get product ID from URL parameters
    const urlParams = new URLSearchParams(window.location.search);
    const productId = urlParams.get('id');
    
    // Show error if no product ID is provided in URL
    if (!productId) {
        showError();
        return;
    }
    
    // Fetch product data from JSON file
    fetch('data/products.json')
        .then(response => {
            if (!response.ok) {
                throw new Error('Failed to fetch products');
            }
            return response.json();
        })
        .then(products => {
            // Find matching product by ID
            const product = products.find(p => p.id === productId);
            if (product) {
                displayProduct(product);
            } else {
                showError();
            }
        })
        .catch(error => {
            console.error('Error loading product:', error);
            showError();
        });
    
    // Display product details in the DOM
    function displayProduct(product) {
        productDetailContainer.innerHTML = `
            <div class="product-image-container">
                <img src="${product.imgUrl}" alt="${product.title}" class="product-image">
            </div>

            <div class="product-info">
                <h2>${product.title}</h2>
                <p class="product-meta">${product.brand} • ${product.regions} • ${product.roast} Roast</p>
                
                <div class="product-price">
                    $${product["sale price"] > 0 ? product["sale price"].toFixed(2) : product.price.toFixed(2)}
                    ${product["sale price"] > 0 ? `<span class="original-price">$${product.price.toFixed(2)}</span>` : ''}
                </div>
                
                <p class="product-stock">${product.stock} (${product.quantity} available)</p>
                
                <div class="quantity-section">
                    <label class="quantity-label">Quantity</label>
                    <input type="number" class="quantity-input" value="1" min="1" max="${product.quantity}">
                </div>
                
                <button class="add-to-cart">Add to Cart</button>

                <div class="product-description">
                    <p>${product.description}</p>
                </div>
            </div>
        `;
        
        // Add to cart functionality
        productDetailContainer.querySelector('.add-to-cart').addEventListener('click', () => {
            const quantity = productDetailContainer.querySelector('.quantity-input').value;
            alert(`${product.title} (${quantity}x) added to cart!`);
        });
    }
    
    // Show error message if product not found or loading fails
    function showError() {
        productDetailContainer.innerHTML = '';
        errorMessage.classList.remove('hidden');
    }
});