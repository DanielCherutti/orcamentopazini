-- Migration: 20260223 - Add image_url field to product_group table
-- Date: 2026-02-23

DEFINE FIELD image_url ON TABLE product_group TYPE option<string>;
