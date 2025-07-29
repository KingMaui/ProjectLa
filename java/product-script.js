document.addEventListener('DOMContentLoaded', () => {
    const productDetailContainer = document.getElementById('product-detail');
    const errorMessage = document.getElementById('error-message');
    
    // Get product ID from URL query parameter
    const urlParams = new URLSearchParams(window.location.search);
    const productId = urlParams.get('id');
    
    // If no product ID, show error
    if (!productId) {
        showError();
        return;
    }
    
    // Fetch products and find the selected one
    fetch('data/products.json')
        .then(response => {
            if (!response.ok) {
                throw new Error('Failed to fetch products');
            }
            return response.json();
        })
        .then(products => {
            // Find product with matching ID
            const product = products.find(p => p.id === productId);
            
            if (product) {
                displayProduct(product);
            } else {
                showError();
            }
        })
        .catch(error => {
            console.error('Error:', error);
            showError();
        });
    
    // Display product with new layout
    function displayProduct(product) {
        productDetailContainer.innerHTML = `
            <!-- Product Image (full width) -->
            <div class="product-image-container">
                <img src="${product.imgUrl}" alt="${product.title}" class="product-image">
            </div>
            
            <!-- Key Info (under image: title, brand, price, stock) -->
            <div class="key-info">
                <div class="key-info-left">
                    <h2>${product.title}</h2>
                    <p class="product-meta">${product.brand} • ${product.category} • ${product.Roast} Roast</p>
                </div>
                <div class="key-info-right">
                    <div class="product-price">
                        $${product["sale price"] > 0 ? product["sale price"].toFixed(2) : product.price.toFixed(2)}
                        ${product["sale price"] > 0 ? `<span class="original-price">$${product.price.toFixed(2)}</span>` : ''}
                    </div>
                    <p class="product-stock">${product.stock} (${product.Quantity} available)</p>
                </div>
            </div>
            
            <!-- Quantity + Add to Cart -->
            <div class="action-row">
                <div class="quantity-section">
                    <label class="quantity-label">Quantity</label>
                    <input type="number" class="quantity-input" value="1" min="1" max="${product.Quantity}">
                </div>
                <button class="add-to-cart">Add to Cart</button>
            </div>
            
            <!-- Additional Details (2 columns on desktop) -->
            <div class="additional-details">
                <div class="product-description">
                    <h3>Description</h3>
                    <p>${product.Description}</p>
                </div>
                
                <div class="product-specs">
                    <h3>Specs</h3>
                    <p>Size: ${product.UsSize} (${product.GobalSize})</p>
                    <p>Capacity: ${product.capacity || 'N/A'}</p>
                    <p>Materials: ${product.materials || 'N/A'}</p>
                </div>
                
                <div class="product-region">
                    <h3>Origin</h3>
                    <p>${product.Regions}</p>
                </div>
                
                <div class="product-features">
                    <h3>Features</h3>
                    <ul class="features-list">
                        <li>Roast Level: ${product.Roast}</li>
                        <li>Category: ${product.category}</li>
                        <li>Grind: ${product.Grind}</li>
                        <li>Surface: ${product["Surface finishing"] || 'N/A'}</li>
                        <li>Dimensions: ${product.dimensions || 'N/A'}</li>
                    </ul>
                </div>
            </div>
        `;
        
        // Add to cart functionality
        const addToCartButton = productDetailContainer.querySelector('.add-to-cart');
        addToCartButton.addEventListener('click', () => {
            const quantity = productDetailContainer.querySelector('.quantity-input').value;
            alert(`${product.title} (${quantity}x) has been added to your cart!`);
        });
    }
    
    // Show error message if product not found
    function showError() {
        productDetailContainer.innerHTML = '';
        errorMessage.classList.remove('hidden');
    }
});