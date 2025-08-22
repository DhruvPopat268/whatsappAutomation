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
    console.log("📦 Incoming Shopify order payload:", JSON.stringify(order, null, 2));

    // Extract customer name
    const customerName =
      `${order.customer?.first_name || ""} ${order.customer?.last_name || ""}`.trim() ||
      "Customer";
    console.log("👤 Customer Name:", customerName);

    // Prefer Shopify order_number (short, customer-friendly) over raw ID
    const orderNumber = order.order_number || order.id;
    console.log("🆔 Order Number:", orderNumber);

    // Total price
    const orderTotal = order.total_price;
    console.log("💰 Order Total:", orderTotal, order.currency);

    // Phone priority: shipping address > customer object > top-level phone
    let phoneNumber =
      order.shipping_address?.phone ||
      order.customer?.phone ||
      order.phone;

    if (!phoneNumber) {
      console.log("❌ No phone number found for order", orderNumber);
      return res.sendStatus(200);
    }

    console.log("📞 Raw Phone from Shopify:", phoneNumber);

    // Clean and normalize phone
    let cleanedNumber = phoneNumber.replace(/\D/g, "");
    if (cleanedNumber.length === 10) {
      cleanedNumber = "91" + cleanedNumber; // default India code
    }
    console.log("📞 Cleaned Phone (used in API):", cleanedNumber);

    // Save mapping for reply
    orderMapping[cleanedNumber] = orderNumber;

    // Prepare payload
    const payload = {
      messaging_product: "whatsapp",
      to: cleanedNumber,
      type: "template",
      template: {
        name: "default_order_confirmation_v1", // must match exactly
        language: { code: "en_US" },           // not "en", must use en_US
        components: [
          {
            type: "body",
            parameters: [
              { type: "text", text: customerName },                       // {{1}}
              { type: "text", text: `${orderTotal} ${order.currency}` },  // {{2}}
              { type: "text", text: order.shopify_domain || "My Store" }, // {{3}}
              { type: "text", text: `#${order.order_number}` }            // {{4}}
            ]
          },
          {
            type: "button",
            sub_type: "url",
            index: "0",
            parameters: [
              { type: "text", text: order.id.toString() } // fills {{1}} in button URL
            ]
          }
        ]
      }
    };

    console.log("📤 Payload being sent to WhatsApp API:", JSON.stringify(payload, null, 2));

    // Send request
    const response = await axios.post(WHATSAPP_API_URL, payload, {
      headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}` }
    });

    console.log("✅ WhatsApp API Response:", response.data);
    console.log(`✅ WhatsApp message sent to ${cleanedNumber} for order ${orderNumber}`);
    res.sendStatus(200);

  } catch (err) {
    console.error("❌ Error sending WhatsApp message:", err.response?.data || err.message);
    res.sendStatus(500);
  }
});



app.listen(4000, () => console.log("🚀 Server running on port 4000"));