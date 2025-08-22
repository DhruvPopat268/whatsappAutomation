const express = require("express");
const bodyParser = require("body-parser");
const axios = require("axios");
require("dotenv").config(); // Load .env file

const app = express();
app.use(bodyParser.json());

// Load from env
const PORT = process.env.PORT || 4000;
const WHATSAPP_API_URL = process.env.WHATSAPP_API_URL;
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const SHOPIFY_STORE = process.env.SHOPIFY_STORE;
const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;

// Temp DB (use Mongo/Redis in production)
const orderMapping = {}; // { phone: orderId }

// Shopify webhook handler (Order Created)
app.post("/shopify/order-webhook", async (req, res) => {
  try {
    const order = req.body;
    console.log("📦 Incoming Shopify order payload:", JSON.stringify(order, null, 2));

    const customerName =
      `${order.customer?.first_name || ""} ${order.customer?.last_name || ""}`.trim() ||
      "Customer";

    const orderNumber = order.order_number || order.id;
    const orderTotal = order.total_price;

    let phoneNumber = order.phone || order.customer?.phone || order.shipping_address?.phone;
    let cleanedNumber = phoneNumber.replace(/\D/g, "");
    if (!cleanedNumber.startsWith("91") && cleanedNumber.length === 10) {
      cleanedNumber = "91" + cleanedNumber;
    }

    // Save mapping for reply
    orderMapping[cleanedNumber] = order.id; // store real order.id

    // WhatsApp message payload
    const payload = {
      messaging_product: "whatsapp",
      to: cleanedNumber,
      type: "template",
      template: {
        name: "cod_order_confirmation",
        language: { code: "en_US" },
        components: [
          {
            type: "body",
            parameters: [
              { type: "text", text: customerName },
              { type: "text", text: `${orderTotal} ${order.currency}` },
              { type: "text", text: SHOPIFY_STORE }
            ]
          }
        ]
      }
    };

    const response = await axios.post(WHATSAPP_API_URL, payload, {
      headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}` }
    });

    console.log("✅ WhatsApp API Response:", response.data);
    res.sendStatus(200);
  } catch (err) {
    console.error("❌ Error sending WhatsApp message:", err.response?.data || err.message);
    res.sendStatus(500);
  }
});

// Cancel Shopify order
const cancelShopifyOrder = async (orderId) => {
  const url = `https://${SHOPIFY_STORE}/admin/api/2025-01/orders/${orderId}/cancel.json`;

  const response = await axios.post(url, {}, {
    headers: {
      "X-Shopify-Access-Token": SHOPIFY_ACCESS_TOKEN,
      "Content-Type": "application/json",
    },
  });

  return response.data;
};

// WhatsApp webhook handler (Button Clicks)
app.post("/whatsapp-webhook", async (req, res) => {
  try {
    const change = req.body?.entry?.[0]?.changes?.[0]?.value;
    const message = change?.messages?.[0];

    if (!message || message.type !== "button") {
      return res.status(200).json({ message: "No button click found" });
    }

    const userNumber = message.from;
    const buttonText = message.button?.text;
    const orderId = orderMapping[userNumber];

    if (!orderId) {
      return res.status(400).json({ error: "Order mapping not found" });
    }

    if (buttonText === "Reject Order") {
      const result = await cancelShopifyOrder(orderId);
      return res.status(200).json({
        success: true,
        message: `Order ${orderId} cancelled successfully`,
        data: result,
      });
    }

    return res.status(200).json({
      success: true,
      message: `Order ${orderId} confirmed (no action needed)`,
    });
  } catch (error) {
    console.error("❌ Webhook error:", error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
