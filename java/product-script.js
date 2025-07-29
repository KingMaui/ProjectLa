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
            <div class="product-image-container">
                <img src="${product.imgUrl}" alt="${product.title}" class="product-image">
            </div>

            <div class="product-info">
                <h2>${product.title}</h2>
                <p class="product-meta">${product.brand} • ${product.Regions} • ${product.Roast} Roast</p>
                
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
                <p>${product.Description}</p>
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
