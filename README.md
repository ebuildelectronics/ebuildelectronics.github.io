# e-Build Static Website - Google Sheet Test

This test version reads products from this Google Sheet:
https://docs.google.com/spreadsheets/d/1CcYDAVrPhewlClUBXXLjQHujbjrDflGdnOEZoT2-u_w/edit?usp=sharing

## Important

The product loader now uses Google Sheets JSONP instead of normal `fetch()`, so it works better on GitHub Pages and local testing.

## Image folder setup

Upload your product images like this:

images/
└── eBuild Products/
    ├── Arduino/
    │   └── Arduino Uno R3 DIP with cable.jpg
    ├── Display/
    │   └── OLED Display Module, 0.96in 128x64 7pin SPI Yellow Blue.jpg
    └── Power Supply/
        └── DC-DC Boost Converter Module XL6009 4.5-32V to 5-52V Adjustable.jpg

The website uses this format:
images/eBuild Products/[Product Category]/[Image].jpg

If the image file is missing, it shows a placeholder.

## Order button

Open `script.js`, find:

const ORDER_FORM_LINK = "YOUR_ORDER_FORM_LINK_HERE";

Replace it with your Google Form link.


## Image loading update
This version ignores product category folders first. Upload product images directly inside:

`images/eBuild Products/`

Example:

`images/eBuild Products/ESP32 Dev Board.jpg`

The site will try the exact Image column filename first, then the Product Name, then the old category folder path as a fallback.
