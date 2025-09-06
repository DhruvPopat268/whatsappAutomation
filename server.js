const express = require("express");
const bodyParser = require("body-parser");
const axios = require("axios");
require("dotenv").config(); // Load .env file

const app = express();
app.use(bodyParser.json());

// Load from env
const PORT = process.env.PORT || 4000;
const WHATSAPP_API_URL = process.env.WHATSAPP_API_URL;
const SWIFTCHAT_API_TOKEN = process.env.SWIFTCHAT_API_TOKEN;
const SHOPIFY_STORE = process.env.SHOPIFY_STORE;
const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
const SWIFT_CHAT_WHATSAPP_TOKEN = process.env.SWIFT_CHAT_WHATSAPP_TOKEN;

// Temp DB (use Mongo/Redis in production)
const orderMapping = {}; // { phone: orderId }

// Shopify webhook handler (Order Created)
// app.post("/shopify/order-webhook", async (req, res) => {
//   try {
//     const order = req.body;
//     console.log("📦 Incoming Shopify order payload:", JSON.stringify(order, null, 2));

//     const customerName =
//       `${order.customer?.first_name || ""} ${order.customer?.last_name || ""}`.trim() ||
//       "Customer";

//     const orderNumber = order.order_number || order.id;
//     const totalItems = order.line_items?.length || 0;
//     const orderTotal = order.total_price;

//     let phoneNumber = order.phone || order.customer?.phone || order.shipping_address?.phone;
//     if (!phoneNumber) {
//       console.error("❌ No phone number found for this order.");
//       return res.sendStatus(400);
//     }

//     let cleanedNumber = phoneNumber.replace(/\D/g, "");
//     if (!cleanedNumber.startsWith("91") && cleanedNumber.length === 10) {
//       cleanedNumber = "91" + cleanedNumber;
//     }

//     // Save mapping for reply (Accept/Reject later)
//     orderMapping[cleanedNumber] = order.id;

//     // WhatsApp message payload
//     const payload = {
//       messaging_product: "whatsapp",
//       to: cleanedNumber,
//       type: "template",
//       template: {
//         name: "cod_order_confirmation_v1",   // ✅ updated template name
//         language: { code: "en" },            // ✅ use "en" instead of "en_US" (as per your screenshot)
//         components: [
//           {
//             type: "body",
//             parameters: [
//               { type: "text", text: customerName },       // {{1}}
//               { type: "text", text: String(orderNumber) },// {{2}}
//               { type: "text", text: String(totalItems) }, // {{3}}
//               { type: "text", text: `${orderTotal} ${order.currency}` } // {{4}}
//             ]
//           }
//         ]
//       }
//     };

//     const response = await axios.post(WHATSAPP_API_URL, payload, {
//       headers: { Authorization: `Bearer ${SWIFT_CHAT_WHATSAPP_TOKEN}` }
//     });

//     console.log("✅ WhatsApp API Response:", response.data);
//     res.sendStatus(200);
//   } catch (err) {
//     console.error("❌ Error sending WhatsApp message:", err.response?.data || err.message);
//     res.sendStatus(500);
//   }
// });

app.post("/shopify/order-webhook", async (req, res) => {
  try {
    console.log(SWIFTCHAT_API_TOKEN);
    const order = req.body;
    console.log("📦 Incoming Shopify order payload:", JSON.stringify(order, null, 2));

    // ✅ Check if payment method is Cash on Delivery (COD)
    if (order.payment_gateway_names?.includes("Cash on Delivery (COD)")) {
      // Forward Shopify order data to WhatsApp API
      const response = await axios.post(
        "https://whatsapp1.prayoshatechnology.com/api/send/template",
        order,
        {
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${SWIFTCHAT_API_TOKEN}`, // ✅ use env variable for security
          },
        }
      );

      console.log("✅ Forwarded to WhatsApp API:", response.data);
    } else {
      console.log("⏩ Skipped forwarding, payment is not COD");
    }

    res.sendStatus(200);
  } catch (err) {
    console.error("❌ Error forwarding to WhatsApp API:", err.response?.data || err.message);
    res.sendStatus(500);
  }
});

app.post("/shopify/shipment-webhook", async (req, res) => {
  try {
    const fulfillment = req.body;
    console.log("🚚 Shipment created:", JSON.stringify(fulfillment, null, 2));

    // Extract shipment details from Shopify webhook
    const orderId = fulfillment.order_id;
    const trackingCompany = fulfillment.tracking_company || "Unknown";
    const trackingNumber = fulfillment.tracking_number || "N/A";
    const trackingUrl = fulfillment.tracking_url || "https://qeyra.com/track";

    const customerName = `${fulfillment.destination?.first_name || ""} ${fulfillment.destination?.last_name || ""}`.trim() || "Customer";
    let customerPhone = fulfillment.destination?.phone;

    // Ensure phone is in WhatsApp E.164 format (e.g. +91xxxxxxxxxx)
    if (customerPhone && !customerPhone.startsWith("+")) {
      customerPhone = `+91${customerPhone}`; // Assuming India
    }

    console.log(`Order ID: ${orderId}, Tracking: ${trackingCompany} - ${trackingNumber}, Phone: ${customerPhone}`);

    if (!customerPhone) {
      console.error("❌ No customer phone number found.");
      return res.status(400).send("No customer phone number.");
    }

    // ✅ Send WhatsApp message using the template
    await axios.post(
      WHATSAPP_API_URL,
      {
        messaging_product: "whatsapp",
        to: customerPhone,
        type: "template",
        template: {
          name: "order_shipped_v1",
          language: { code: "en" },
          components: [
            {
              type: "body",
              parameters: [
                { type: "text", text: customerName },
                { type: "text", text: orderId.toString() },
                { type: "text", text: trackingCompany },
                { type: "text", text: trackingNumber }
              ]
            }
            // ❌ no "button" component needed unless URL is dynamic
          ]
        }

      },
      {
        headers: {
          Authorization: `Bearer ${SWIFT_CHAT_WHATSAPP_TOKEN}`,
          "Content-Type": "application/json",
        },
      }
    );

    res.status(200).send("✅ Shipment webhook received & WhatsApp sent");
  } catch (error) {
    console.error("❌ Error handling shipment webhook:", error.response?.data || error.message);
    res.status(500).send("Error processing webhook");
  }
});

app.post("/whatsapp/order-response", async (req, res) => {
  try {
    console.log("📩 Incoming request body:", req.body);

    const { messages } = req.body;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: "No messages found in request body" });
    }

    // Store results of Shopify API calls
    const results = [];

    for (const msg of messages) {
      const { text, order_id } = msg;

      if (!text || !order_id) {
        console.warn("⚠️ Skipping invalid message:", msg);
        continue;
      }

      // Map text → tag
      let tag = "";
      if (text.toLowerCase().includes("accept")) tag = "Order Accepted";
      if (text.toLowerCase().includes("reject")) tag = "Order Rejected";

      if (!tag) {
        console.warn("⚠️ Invalid text value received:", text);
        continue;
      }

      console.log(`✅ Processing order ${order_id} → Tag: ${tag}`);

      // Shopify API URL
      const shopifyUrl = `https://${SHOPIFY_STORE}/admin/api/2025-01/orders/${order_id}.json`;
      console.log("🔗 Shopify API URL:", shopifyUrl);

      try {
        const response = await axios.put(
          shopifyUrl,
          {
            order: {
              id: Number(order_id),
              tags: tag,
            },
          },
          {
            headers: {
              "Content-Type": "application/json",
              "X-Shopify-Access-Token": SHOPIFY_ACCESS_TOKEN,
            },
          }
        );

        console.log("✅ Shopify API response:", response.data);

        results.push({
          order_id,
          tag,
          success: true,
          response: response.data,
        });
      } catch (err) {
        console.error(`❌ Error updating order ${order_id}:`, err.response?.data || err.message);
        results.push({
          order_id,
          tag,
          success: false,
          error: err.response?.data || err.message,
        });
      }
    }

    return res.json({
      success: true,
      processed: results.length,
      results,
    });
  } catch (error) {
    console.error("❌ Error in /whatsapp/order-response:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
