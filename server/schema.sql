CREATE DATABASE IF NOT EXISTS urban_cart CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE urban_cart;

CREATE TABLE IF NOT EXISTS customers (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  email VARCHAR(190) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('customer','admin') NOT NULL DEFAULT 'customer',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS categories (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS products (
  id INT AUTO_INCREMENT PRIMARY KEY,
  category_id INT NULL,
  name VARCHAR(180) NOT NULL,
  description TEXT,
  price DECIMAL(10,2) NOT NULL,
  image_url VARCHAR(600),
  stock INT NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS orders (
  id INT AUTO_INCREMENT PRIMARY KEY,
  customer_id INT NULL,
  customer_name VARCHAR(120) NOT NULL,
  email VARCHAR(190) NOT NULL,
  phone VARCHAR(40) NOT NULL,
  address VARCHAR(255) NOT NULL,
  city VARCHAR(100) NOT NULL,
  province VARCHAR(100) NOT NULL,
  postal_code VARCHAR(20) NOT NULL,
  total DECIMAL(10,2) NOT NULL,
  status ENUM('pending','paid','processing','shipped','cancelled') NOT NULL DEFAULT 'pending',
  payment_method VARCHAR(40) NOT NULL DEFAULT 'PayFast',
  payment_reference VARCHAR(190) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS order_items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  order_id INT NOT NULL,
  product_id INT NULL,
  product_name VARCHAR(180) NOT NULL,
  unit_price DECIMAL(10,2) NOT NULL,
  quantity INT NOT NULL,
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL
);

INSERT IGNORE INTO categories (id, name) VALUES
(1, 'Tech'), (2, 'Home'), (3, 'Lifestyle'), (4, 'Accessories');

INSERT INTO products (category_id, name, description, price, image_url, stock) VALUES
(1, 'Studio Wireless Headphones', 'Immersive sound, comfortable fit and all-day battery life.', 1299.00, 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=900&q=85', 25),
(2, 'Minimal Desk Lamp', 'A warm, modern lamp for your workspace or bedside table.', 649.00, 'https://images.unsplash.com/photo-1507473885765-e6ed057f782c?auto=format&fit=crop&w=900&q=85', 18),
(3, 'Everyday Canvas Backpack', 'A durable everyday backpack with a clean, versatile design.', 899.00, 'https://images.unsplash.com/photo-1553062407-98eeb64c6a62?auto=format&fit=crop&w=900&q=85', 20),
(4, 'Classic Sunglasses', 'Timeless frames made for sunny days and daily wear.', 499.00, 'https://images.unsplash.com/photo-1511499767150-a48a237f0083?auto=format&fit=crop&w=900&q=85', 30),
(1, 'Smart Watch', 'Track your activity and stay connected throughout the day.', 1599.00, 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=900&q=85', 12),
(2, 'Ceramic Coffee Set', 'A considered ceramic set for your everyday coffee ritual.', 379.00, 'https://images.unsplash.com/photo-1514228742587-6b1558fcca3d?auto=format&fit=crop&w=900&q=85', 16),
(3, 'Classic Everyday Sneakers', 'Comfort-first sneakers with a simple, versatile silhouette.', 1099.00, 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=900&q=85', 14),
(4, 'Travel Bottle', 'A reusable bottle to keep your favourite drink close at hand.', 249.00, 'https://images.unsplash.com/photo-1602143407151-7111542de6e8?auto=format&fit=crop&w=900&q=85', 40)
ON DUPLICATE KEY UPDATE name=VALUES(name);
