document.addEventListener('DOMContentLoaded', () => {
    const productDetailContainer = document.getElementById('product-detail');
    const errorMessage = document.getElementById('error-message');
    
    // Get product ID from URL
    const urlParams = new URLSearchParams(window.location.search);
    const productId = urlParams.get('id');
    
    if (!productId) {
        showError();
        return;
    }
    
    // Fetch and display product
    fetch('data/products.json')
        .then(response => response.ok ? response.json() : Promise.reject())
        .then(products => {
            const product = products.find(p => p.id === productId);
            product ? displayProduct(product) : showError();
        })
        .catch(() => showError());
    
    function displayProduct(product) {
        productDetailContainer.innerHTML = `
            <!-- Image on left side (desktop) -->
            <div class="product-image-container">
                <img src="${product.imgUrl}" alt="${product.title}" class="product-image">
            </div>
            
            <!-- Info on right side (desktop) -->
            <div class="product-info">
                <h2>${product.title}</h2>
                <p class="product-meta">${product.brand} • ${product.category} • ${product.Roast} Roast</p>
                
                <div class="product-price">
                    $${product["sale price"] > 0 ? product["sale price"].toFixed(2) : product.price.toFixed(2)}
                    ${product["sale price"] > 0 ? `<span class="original-price">$${product.price.toFixed(2)}</span>` : ''}
                </div>
                
                <p class="product-stock">${product.stock} (${product.Quantity} available)</p>
                
                <div class="quantity-section">
                    <label class="quantity-label">Quantity</label>
                    <input type="number" class="quantity-input" value="1" min="1" max="${product.Quantity}">
                </div>
                
                <button class="add-to-cart">Add to Cart</button>
                
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
        productDetailContainer.querySelector('.add-to-cart').addEventListener('click', () => {
            const quantity = productDetailContainer.querySelector('.quantity-input').value;
            alert(`${product.title} (${quantity}x) added to cart!`);
        });
    }
    
    function showError() {
        productDetailContainer.innerHTML = '';
        errorMessage.classList.remove('hidden');
    }
});