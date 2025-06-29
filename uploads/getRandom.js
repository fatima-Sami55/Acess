const fs = require("fs");
const { pool } = require("../database/data");
const path = require("path");
const path1 = path.join(__dirname, "../order_history/purchase.json");
const path2 = path.join(__dirname, "../order_history/lastProcessedPurchaseIDs.json");
let lastProcessedPurchaseIDs = loadLastProcessedPurchaseIDs();
let purchaseDatesMap = loadPurchaseDatesMap();

function loadLastProcessedPurchaseIDs() {
  try {
    const data = fs.readFileSync(path2, "utf8");
    return JSON.parse(data);
  } catch (err) {
    console.error("Error loading lastProcessedPurchaseIDs:", err);
    return [];
  }
}

function loadPurchaseDatesMap() {
  try {
    const data = fs.readFileSync(path1, "utf8");
    return JSON.parse(data);
  } catch (err) {
    console.error("Error loading purchaseDatesMap:", err);
    return {};
  }
}

function saveLastProcessedPurchaseIDs() {
  fs.writeFile(path2, JSON.stringify(lastProcessedPurchaseIDs), (err) => {
    if (err) {
      console.error("Error saving lastProcessedPurchaseIDs:", err);
    } else {
      console.log("lastProcessedPurchaseIDs have been saved.");
    }
  });
}

function savePurchaseDatesMap() {
  fs.writeFile(path1, JSON.stringify(purchaseDatesMap, null, 2), (err) => {
    if (err) {
      console.error("Error writing to file", err);
    } else {
      console.log("Data has been written to purchase.json");
    }
  });
}

function getRandomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function generateRandomDates(numDates, startDate, endDate) {
  let randomDates = [];

  for (let i = 0; i < numDates; i++) {
    let randomTimestamp = getRandomInt(startDate.getTime(), endDate.getTime());
    let randomDate = new Date(randomTimestamp);
    randomDates.push(randomDate);
  }

  randomDates.sort((a, b) => a.getTime() - b.getTime());

  return randomDates;
}

function formatDate(date) {
  let monthNames = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];
  let month = monthNames[date.getMonth()];
  let day = String(date.getDate()).padStart(2, "0");
  let year = date.getFullYear();
  let hours = date.getHours();
  let period = hours >= 12 ? "PM" : "AM";
  hours = hours % 12;
  hours = hours ? hours : 12;
  let minutes = String(date.getMinutes()).padStart(2, "0");
  return `${month} ${day} ${year}  ${hours}:${minutes} ${period}`;
}

function generateAndSaveDates(purchaseIDs) {
  let newPurchaseIDs = purchaseIDs.filter(
    (id) => !lastProcessedPurchaseIDs.includes(id)
  );

  if (newPurchaseIDs.length === 0) {
    console.log("No new PurchaseIDs to process.");
    return;
  }

  newPurchaseIDs.forEach((purchaseID) => {
    let startDate = new Date();
    let endDate = new Date();
    endDate.setDate(startDate.getDate() + 12);

    let randomDates = generateRandomDates(3, startDate, endDate);

    let sortedDates = randomDates
      .slice(0, 3)
      .sort((a, b) => a.getTime() - b.getTime());

    let placementDate = formatDate(startDate);

    if (!purchaseDatesMap[purchaseID]) {
      purchaseDatesMap[purchaseID] = {
        placement: placementDate,
      };
    }

    const actions = ["arrival", "shipment", "delivery"];
    sortedDates.forEach((date, idx) => {
      let action = actions[idx];
      purchaseDatesMap[purchaseID][action] = formatDate(date);
    });
  });

  savePurchaseDatesMap();
  lastProcessedPurchaseIDs.push(...newPurchaseIDs);
  saveLastProcessedPurchaseIDs();
}

async function processPurchaseIDs() {
  try {
    await pool.connect(); // Ensure the pool is connected

    const result = await pool.request().query("SELECT PurchaseID FROM purchaseditems");
    const purchaseIDs = result.recordset.map((item) => item.PurchaseID);
    generateAndSaveDates(purchaseIDs);
  } catch (err) {
    console.error("Error fetching PurchaseIDs:", err);
  }
}

// Execute
(async () => {
  await processPurchaseIDs();
})();

module.exports = generateAndSaveDates;
