const express = require("express");
const bodyParser = require("body-parser");

const app = express();
app.use(bodyParser.json());

// Shopify webhook endpoint
app.post("/shopify/order-webhook", (req, res) => {
  console.log("📦 New Order from Shopify:", JSON.stringify(req.body, null, 2));

  // Always respond with 200, otherwise Shopify retries
  res.sendStatus(200);
});

app.listen(4000, () => console.log("🚀 Server running on port 4000"));