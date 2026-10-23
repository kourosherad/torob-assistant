The full catalogue is included as shops.csv.gz, products.csv.gz and offers.csv.gz.
Run npm run import after npm ci. The importer reads these gzip files directly.
If an extracted CSV exists beside its gzip file, the extracted CSV takes precedence.
Gzip compression preserves the original files without removing any records.
Prices are recorded offers, not a live stock or price guarantee.
Seller names may be aliases, and phone numbers are synthetic challenge data.

shops.csv: 6,476 rows; columns: address, category_names, contacts, instagram, lat, location_label, lon, name, payment_options, shop_id, supports_fast_delivery, website_url, weekly_hours
products.csv: 225,903 rows; columns: brand_name, category_name, image_urls, model, persian_title, product_id, specs
offers.csv: 331,506 rows; columns: description, last_price_changed_at, offer_id, price_toman, product_id, seller_title, shop_id, warranty
