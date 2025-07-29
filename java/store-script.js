let http = XMLHttpRequest();
http.open('get','data/products.json', true);
http.send();
http.onload = function(){
    if(this.readState == 4 && this.status == 200){
        let products = JSON.parse(this.responseText);
        let output = "";
        for(let item of products){
            output +=`
            <div class="products">
                <img src="${item.image}" alt="${item.image}">
                <p class="${item.title}"></p>
                <p class="${item.description}"></p>
                <p class="${item.price}"></p>
            </div>
            `;
        }
        DocumentFragment.querySelector(".products").innerHTML = output;
    }
}