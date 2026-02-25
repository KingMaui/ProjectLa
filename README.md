# JUNXIELIANG — Netlify Deployment

## How to deploy

1. Unzip this file
2. Go to https://app.netlify.com
3. Drag and drop the entire unzipped folder onto the Netlify deploy area
4. Done — your site is live!

## Before going live — things to add back

### products.json
The file `data/products.json` is currently empty (`[]`).
Add your real product data back here. Each product should follow this shape:

```json
[
  {
    "id": "product-1",
    "title": "Example Coffee",
    "brand": "Brand Name",
    "roast": "Medium",
    "regions": "Japan, Korea",
    "category": "coffee",
    "price": 24.99,
    "sale price": 0,
    "stock": "In Stock",
    "quantity": 10,
    "imgUrl": "images/product-1.jpg",
    "description": "A great coffee."
  }
]
```

### Product images
If your products use local image paths (e.g. `images/coffee.jpg`), create an `images/` folder
inside the site folder and add your images there before deploying.

## Bug fixes applied in this build

- `script.js`: Added null check on `searchBar` — previously crashed on pages without a search bar
- `script.js`: Fixed `product.name` → `product.title` to match actual JSON structure
- Removed redundant `camera.js` (superseded by `visionocr.js`)
- Removed unused `camera.css` (superseded by `visionocr.css`)
- Removed `calendar-backup.html` (stale backup file)
- Added `_redirects` for clean Netlify URL routing

## File structure

```
site/
├── index.html          ← Home / projects page
├── calendar.html       ← Calendar app
├── store.html          ← Store
├── product.html        ← Product detail
├── counter.html        ← Habit tracker
├── ocr.html            ← VisionOCR
├── _redirects          ← Netlify routing
├── css/                ← All stylesheets
├── java/               ← All JavaScript
└── data/
    └── products.json   ← Add your products here
```
