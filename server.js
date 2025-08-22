const express = require("express");
const bodyParser = require("body-parser");
const axios = require("axios");

const app = express();
app.use(bodyParser.json());

// WhatsApp API Config
const WHATSAPP_API_URL = "https://graph.facebook.com/v17.0/753154937875519/messages";
const WHATSAPP_TOKEN = "EAASmeM3lbz4BPHx1YlGjGxgWUp4f4ZC4bUjECgtf0d8488wYDGxp3Rs5FgHEb3sVpdAB31Q5amlT20Jf57EQLVmP14nKPt837G8VXp1kw22NZB2q8Ikf0ZBCal8BIPZBMzWvp2iyu4wOCKEh35ZBXndKLLHrADOKJQLO42D2mFN4bfQ9edG5TH9jVeMWJYWu3Aq8ZAm2YAOTW4ZCAQlWJIfwuZAOuuNMqE4IS5DTgCuFZB1hD5QZDZD";

// Temp DB (use Mongo/Redis in production)
const orderMapping = {}; // { phone: orderId }

app.post("/shopify/order-webhook", async (req, res) => {
  try {
    const order = req.body;

    // Extract customer name
    const customerName =
      `${order.customer?.first_name || ""} ${order.customer?.last_name || ""}`.trim() ||
      "Customer";

    // Prefer Shopify order_number (short, customer-friendly) over raw ID
    const orderNumber = order.order_number || order.id;

    // Total price
    const orderTotal = order.total_price;

    // Phone priority: shipping address > customer object > top-level phone
    const phoneNumber =
      order.shipping_address?.phone ||
      order.customer?.phone ||
      order.phone;

    if (!phoneNumber) {
      console.log("❌ No phone number found for order", orderNumber);
      return res.sendStatus(200);
    }

    // Save mapping for reply
    orderMapping[phoneNumber] = orderNumber;

    // Send WhatsApp template message
    await axios.post(
      WHATSAPP_API_URL,
      {
        messaging_product: "whatsapp",
        to: phoneNumber.replace(/\D/g, ""), // remove + or spaces
        type: "template",
        template: {
          name: "order_confirmation", // must match approved template in WhatsApp
          language: { code: "en" },
          components: [
            {
              type: "body",
              parameters: [
                { type: "text", text: customerName },
                { type: "text", text: String(orderNumber) },
                { type: "text", text: `${orderTotal} ${order.currency}` }
              ]
            }
          ]
        }
      },
      { headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}` } }
    );

    console.log(`✅ WhatsApp message sent to ${phoneNumber} for order ${orderNumber}`);
    res.sendStatus(200);
  } catch (err) {
    console.error("Error sending WhatsApp message:", err.response?.data || err.message);
    res.sendStatus(500);
  }
});


app.listen(4000, () => console.log("🚀 Server running on port 4000"));