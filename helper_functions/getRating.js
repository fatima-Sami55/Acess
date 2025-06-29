const fs = require("fs");
const path = require("path");
const data1 = require("../seeds/product.json");
const data2 = require("../seeds/acessiories.json");
const data3 = require("../seeds/men.json");
const data4 = require("../seeds/women.json");

const ratingFilePath = path.join(__dirname, "../seeds/rating.json");

/**
 * Loads the full rating dataset from JSON
 */
function loadRatings() {
  if (fs.existsSync(ratingFilePath)) {
    return JSON.parse(fs.readFileSync(ratingFilePath, "utf-8"));
  }
  return {};
}

/**
 * Returns ratings array for a specific product
 * @param {Object} product - The product object
 * @param {string} product.id - ID of the product
 * @param {string} product.category - e.g., 'men', 'women', 'acessiories'
 * @param {string} [product.subcategory] - e.g., 'shoes', 'watches' (if acessiories)
 * @returns {Array} ratings or default fallback
 */
function getProductRating({ id, category, subcategory }) {
  const ratingsData = loadRatings();

  let key;
  if (category === "acessiories" && subcategory) {
    key = `acessiories-${subcategory}-${id}`;
  } else {
    key = `${category}-${id}`;
  }

  return ratingsData[key] || [
    { stars: 5, count: 0 },
    { stars: 4, count: 0 },
    { stars: 3, count: 0 },
    { stars: 2, count: 0 },
    { stars: 1, count: 0 }
  ];
}

const flatAccessoryData = Object.entries(data2).flatMap(([subcategory, items]) =>
  items.map(item => ({ ...item, subcategory }))
);
function findProductByName(name) {
  const allProducts = [
    ...data1,
    ...data3,
    ...data4,
    ...flatAccessoryData,
  ];
  return allProducts.find(
    p => p.name.toLowerCase().trim() === name.toLowerCase().trim()
  );
}

module.exports = {
  getProductRating,
  findProductByName
};
