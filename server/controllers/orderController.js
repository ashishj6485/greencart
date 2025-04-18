import Order from "../models/Order.js";
import Product from "../models/Product.js";
import Razorpay from "razorpay";
import crypto from "crypto";
import User from "../models/User.js";

// Initialize Razorpay
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

// Place Order COD : /api/order/cod
export const placeOrderCOD = async (req, res) => {
    try {
      const { userId, items, address } = req.body;
  
      if (!address || items.length === 0) {
        return res.json({ success: false, message: "Invalid data" });
      }
  
      // Calculate total amount
      let amount = await items.reduce(async (acc, item) => {
        const product = await Product.findById(item.product);
        return (await acc) + product.offerPrice * item.quantity;
      }, 0);
  
      // Add tax (2%)
      amount += Math.floor(amount * 0.02);
  
      // Create COD order in the database
      await Order.create({
        userId,
        items,
        address,
        amount,
        paymentMethod: "COD", // Payment method set to "COD"
        paymentStatus: "Pending", // Set payment status as "Pending"
      });
  
      return res.json({ success: true, message: "Order Placed Successfully" });
    } catch (error) {
      return res.json({ success: false, message: error.message });
    }
  };    

// Create Razorpay Order
export const createRazorpayOrder = async (req, res) => {
    try {
      const { userId, items, address } = req.body;
      console.log("Received order creation request:", { userId, items, address });
  
      const amount = items.reduce((total, item) => total + item.quantity * item.offerPrice, 0);
      const tax = 0; // Default 0% tax
      const total = (amount + tax) * 100; // in paise
      console.log("Calculated total amount (in paise):", total);
  
      const razorpayOrder = await razorpay.orders.create({
        amount: total,
        currency: 'INR',
        receipt: crypto.randomBytes(10).toString('hex'),
      });
  
      console.log("Razorpay order created:", razorpayOrder);
  
      res.json({
        success: true,
        order: razorpayOrder,
        key: process.env.RAZORPAY_KEY_ID,
      });
    } catch (error) {
      console.error("Razorpay Order Creation Failed:", error);
      res.status(500).json({ success: false, message: error.message });
    }
  };
  
  // Verify Razorpay Payment
  export const verifyRazorpayPayment = async (req, res) => {
    try {
      const { razorpay_order_id, razorpay_payment_id, razorpay_signature, userId } = req.body;
  
      const body = razorpay_order_id + "|" + razorpay_payment_id;
      const expectedSignature = crypto.createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
        .update(body)
        .digest("hex");
  
      if (expectedSignature !== razorpay_signature) {
        return res.status(400).json({ success: false, message: "Invalid signature" });
      }
  
      const order = new Order({
        userId,
        items: [], // Ideally store items separately or in session
        address: null,
        paymentMethod: 'Online',
        paymentStatus: 'Paid',
        status: 'Processing',
        razorpay_order_id,
        razorpay_payment_id,
      });
  
      await order.save();
  
      res.json({ success: true, message: "Payment verified and order placed", order });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  };

// Get Orders by User ID : /api/order/user
export const getUserOrders = async (req, res) => {
  try {
    const { userId } = req.body;
    const orders = await Order.find({
      userId,
      $or: [{ paymentMethod: "COD" }, { paymentStatus: "Paid" }],
    })
      .populate("items.product address")
      .sort({ createdAt: -1 });
    res.json({ success: true, orders });
  } catch (error) {
    res.json({ success: false, message: error.message });
  }
};

// Get All Orders ( for seller / admin) : /api/order/seller
export const getAllOrders = async (req, res) => {
  try {
    const orders = await Order.find({
      $or: [{ paymentMethod: "COD" }, { paymentStatus: "Paid" }],
    })
      .populate("items.product address")
      .sort({ createdAt: -1 });
    res.json({ success: true, orders });
  } catch (error) {
    res.json({ success: false, message: error.message });
  }
};
