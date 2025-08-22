const express = require("express");
const bodyParser = require("body-parser");
const axios = require("axios");

const app = express();
app.use(bodyParser.json());

// WhatsApp API Config
const WHATSAPP_API_URL = "https://graph.facebook.com/v17.0/753154937875519/messages";
const WHATSAPP_TOKEN = "EAASmeM3lbz4BPNNA4UOCkIzjjz1R9evldbSV4WObuErONqauHdFUi7XiuHGXmCZCkz9FZClzDavT9Be7QqYdaUPGu7k2Q8ABkpakZC7ePK4XaKZCGM6HZAybfxE28TUxjC65Vd2VSSJkqwEq8W9MaglMXNjJSwcMGi3fp2RrZCe9aUAcUJ1sQZCdovReDKaMBCEYZCAEDxQnbZB0cxChxY1ksVVeq1XUUok9SCifRiuYYrieKcAZDZD";

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

    // Phone priority
    let phoneNumber =
      order.phone ||
      order.customer?.phone ||
      order.shipping_address?.phone;

    console.log("📞 Raw Phone from Shopify:", phoneNumber);

    let cleanedNumber = phoneNumber.replace(/\D/g, "");
    if (!cleanedNumber.startsWith("91") && cleanedNumber.length === 10) {
      cleanedNumber = "91" + cleanedNumber;
    }
    console.log("📞 Cleaned Phone (used in API):", cleanedNumber);

    // Save mapping for reply
    orderMapping[cleanedNumber] = orderNumber;

    // Prepare payload with your new template
    const payload = {
      messaging_product: "whatsapp",
      to: cleanedNumber,
      type: "template",
      template: {
        name: "cod_order_confirmation", // <-- your template name
        language: { code: "en_US" },
        components: [
          {
            type: "body",
            parameters: [
              { type: "text", text: customerName },                       // {{1}}
              { type: "text", text: `${orderTotal} ${order.currency}` },  // {{2}}
              { type: "text", text: order.shopify_domain || "My Store" }  // {{3}}
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

    const messageId = response.data.messages?.[0]?.id;
    if (messageId) {
      console.log(`📩 Message ID: ${messageId}`);

      // Poll for message status after a short delay
      setTimeout(async () => {
        try {
          const statusResp = await axios.get(
            `https://graph.facebook.com/v17.0/${messageId}`,
            { headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}` } }
          );
          console.log("📊 Message Status Check:", JSON.stringify(statusResp.data, null, 2));
        } catch (statusErr) {
          console.error("⚠️ Error fetching message status:", statusErr.response?.data || statusErr.message);
        }
      }, 4000); // wait 4s before first check
    } else {
      console.warn("⚠️ No messageId returned from WhatsApp API!");
    }

    console.log(`✅ WhatsApp message sent to ${cleanedNumber} for order ${orderNumber}`);
    res.sendStatus(200);

  } catch (err) {
    console.error("❌ Error sending WhatsApp message:", err.response?.data || err.message);
    res.sendStatus(500);
  }
});

app.listen(4000, () => console.log("🚀 Server running on port 4000"));