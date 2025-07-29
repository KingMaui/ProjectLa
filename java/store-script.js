document.addEventListener("DOMContentLoaded", () => {
    fetch('data/products.json')
        .then(response => {
            if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);
            return response.json();
        })
        .then(products => {
            const container = document.querySelector(".products");
            let output = "";
            products.forEach(item => {
                output += `
                    <div class="product">
                        <img src="${item.image}" alt="${item.title}">
                        <p>${item.title}</p>
                        <p>${item.description}</p>
                        <p>$${item.price}</p>
                    </div>
                `;
            });
            container.innerHTML = output;
        })
        .catch(error => console.error('Error loading products:', error));
});
