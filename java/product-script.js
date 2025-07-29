document.addEventListener('DOMContentLoaded', () => {
    const productDetailContainer = document.getElementById('product-detail');
    const errorMessage = document.getElementById('error-message');
    
    // Get product ID from URL query parameter
    const urlParams = new URLSearchParams(window.location.search);
    const productId = urlParams.get('id');

    // If no product ID in URL, show error
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
            // Find product with matching ID (direct string comparison)
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

    // Display product details with all fields from JSON
    function displayProduct(product) {
        productDetailContainer.innerHTML = `
            <div class="product-image-container">
                <img src="${product.imgUrl}" alt="${product.title}" class="product-image">
            </div>
            <div class="product-info">
                <h2>${product.title}</h2>
                <p class="product-meta">${product.brand} • ${product.category} • ${product.Roast} Roast</p>
                
                <div class="product-price">
                    $${product["sale price"] > 0 ? product["sale price"].toFixed(2) : product.price.toFixed(2)}
                    ${product["sale price"] > 0 ? `<span class="original-price">$${product.price.toFixed(2)}</span>` : ''}
                </div>
                
                <p class="product-stock">${product.stock} (${product.Quantity} available)</p>
                
                <div class="product-description">
                    <h3>Description</h3>
                    <p>${product.Description}</p>
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
                        <li>Brand: ${product.brand}</li>
                        <li>Grind: ${product.Grind}</li>
                        <li>Size (US): ${product.UsSize}</li>
                        <li>Size (Global): ${product.GobalSize}</li>
                    </ul>
                </div>
                
                <button class="add-to-cart">Add to Cart</button>
            </div>
        `;

        // Add to cart functionality
        const addToCartButton = productDetailContainer.querySelector('.add-to-cart');
        addToCartButton.addEventListener('click', () => {
            alert(`${product.title} (${product.UsSize}) has been added to your cart!`);
        });
    }

    // Show error message if product not found
    function showError() {
        productDetailContainer.innerHTML = '';
        errorMessage.classList.remove('hidden');
    }
});
